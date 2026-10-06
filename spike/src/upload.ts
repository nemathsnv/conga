// Foreground direct upload to Mux with real progress, automatic retry, and the
// recording kept on disk until Mux confirms the asset is ready.
import { File, UploadType } from 'expo-file-system';
import { networkInfo } from './env';
import { log, upsertRun } from './log';
import { createUpload, waitUntilPlayable } from './mux';
import type { Run } from './types';

export interface UploadProgress { bytesSent: number; totalBytes: number; attempt: number; phase: 'minting' | 'uploading' | 'processing' | 'done' | 'failed'; polls?: number; message?: string }

const MAX_AUTO_RETRIES = 3;
const active = new Set<string>();
export const isUploading = (runId: string) => active.has(runId);

export async function uploadRun(run: Run, onProgress: (p: UploadProgress) => void, signal?: { cancelled: boolean }): Promise<Run> {
  if (!run.fileUri) throw new Error('recording file is gone');
  if (active.has(run.runId)) throw new Error('this recording is already uploading in the background');
  active.add(run.runId);
  try {
    return await uploadRunInner(run, onProgress, signal);
  } finally {
    active.delete(run.runId);
  }
}

async function uploadRunInner(run: Run, onProgress: (p: UploadProgress) => void, signal?: { cancelled: boolean }): Promise<Run> {
  const file = new File(run.fileUri!);
  if (!file.exists) throw new Error('recording file missing on disk');
  const totalBytes = file.size ?? 0;
  const firstAttempt = run.uploadAttempts + 1;
  const lastAllowed = run.uploadAttempts + MAX_AUTO_RETRIES;
  let attempt = run.uploadAttempts;
  let lastError: unknown = null;

  while (attempt < lastAllowed) {
    attempt += 1;
    const network = await networkInfo();
    run = { ...run, status: 'uploading', uploadAttempts: attempt, uploadNetwork: network, uploadError: null };
    upsertRun(run);
    onProgress({ bytesSent: 0, totalBytes, attempt, phase: 'minting' });
    const startedAt = Date.now();
    try {
      const created = await createUpload(run.label);
      const mintMs = Date.now() - startedAt;
      run = { ...run, uploadId: created.uploadId, uploadStartedAt: startedAt };
      upsertRun(run);
      log('upload_started', { attempt, totalBytes, mintMs, uploadId: created.uploadId, uploadHost: new URL(created.uploadUrl).host }, run.runId, network);

      const task = file.createUploadTask(created.uploadUrl, {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
        headers: { 'Content-Type': 'video/mp4' },
        onProgress: (p) => onProgress({ bytesSent: p.bytesSent, totalBytes: p.totalBytes || totalBytes, attempt, phase: 'uploading' }),
      });
      const result = await task.uploadAsync();
      if (result.status < 200 || result.status >= 300) throw new Error(`PUT ${result.status}: ${result.body.slice(0, 200)}`);
      const finishedAt = Date.now();
      const uploadMs = finishedAt - startedAt;
      run = { ...run, uploadFinishedAt: finishedAt, uploadMs, status: 'processing' };
      upsertRun(run);
      log('upload_finished', { attempt, totalBytes, uploadMs, throughputMbps: +(totalBytes * 8 / 1e6 / (uploadMs / 1000)).toFixed(2), httpStatus: result.status }, run.runId, network);

      onProgress({ bytesSent: totalBytes, totalBytes, attempt, phase: 'processing', polls: 0 });
      const { status, polls } = await waitUntilPlayable(created.uploadId, (s, n) => onProgress({ bytesSent: totalBytes, totalBytes, attempt, phase: 'processing', polls: n, message: `${s.uploadStatus} / ${s.assetStatus ?? '-'}` }));
      const readyAt = Date.now();
      run = {
        ...run,
        assetId: status.assetId,
        playbackId: status.playbackId,
        assetReadyAt: readyAt,
        processingMs: readyAt - finishedAt,
        muxMaxResolution: status.maxResolution ?? null,
        muxResolutionTier: status.resolutionTier ?? null,
        status: 'ready',
      };
      log('asset_ready', { processingMs: run.processingMs, polls, assetId: status.assetId, playbackId: status.playbackId, maxResolution: status.maxResolution, resolutionTier: status.resolutionTier, muxDuration: status.duration, tracks: status.tracks }, run.runId, network);
      // Mirror the product: the local copy is only needed until the post succeeds.
      try { file.delete(); run = { ...run, fileUri: null }; } catch {}
      upsertRun(run);
      onProgress({ bytesSent: totalBytes, totalBytes, attempt, phase: 'done' });
      return run;
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const failedAt = Date.now();
      const isProcessingError = run.uploadFinishedAt != null && run.status === 'processing';
      log(isProcessingError ? 'asset_errored' : 'upload_failed', { attempt, msAfterStart: failedAt - startedAt, error: msg }, run.runId, network);
      if (isProcessingError) {
        run = { ...run, status: 'errored', uploadError: msg };
        upsertRun(run);
        onProgress({ bytesSent: 0, totalBytes, attempt, phase: 'failed', message: msg });
        throw e;
      }
      run = { ...run, status: 'upload_failed', uploadError: msg, uploadFinishedAt: null, uploadMs: null };
      upsertRun(run);
      if (signal?.cancelled || attempt >= lastAllowed) break;
      const backoff = 2000 * Math.pow(2, attempt - firstAttempt);
      log('upload_retry', { nextAttempt: attempt + 1, backoffMs: backoff }, run.runId, network);
      onProgress({ bytesSent: 0, totalBytes, attempt, phase: 'failed', message: `${msg}. Retrying in ${backoff / 1000}s` });
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  onProgress({ bytesSent: 0, totalBytes, attempt, phase: 'failed', message: lastError instanceof Error ? lastError.message : String(lastError) });
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
