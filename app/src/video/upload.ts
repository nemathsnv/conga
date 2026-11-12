// Foreground upload to Mux with progress, then polling until the asset is playable.
// The recording file stays on the phone until the response is live.
// Foreground only (SPEC.md Sections 2, 19 and 22): on iOS the transfer runs in the app's own
// URLSession, so it stops with the app instead of continuing in the system's background daemon.
import { File, UploadType } from 'expo-file-system';

import { supabase } from '@/lib/supabase';
import type { Recording } from './types';

export type UploadTicket = { uploadId: string; uploadUrl: string };

/** Mint a direct-upload URL. Called on Post Review so it is ready before Post is tapped. */
export async function mintUpload(): Promise<UploadTicket> {
  const { data, error } = await supabase.functions.invoke('mux-create-upload', { method: 'POST' });
  if (error || !data?.uploadId || !data?.uploadUrl) throw new Error(await mintRefusal(error));
  return { uploadId: String(data.uploadId), uploadUrl: String(data.uploadUrl) };
}

/** Reasons mux-create-upload gives for refusing a URL (security stage 2). */
const MINT_REFUSALS = new Set(['suspended', 'posting_paused', 'account_deleted', 'profile_required', 'upload_limit_hour', 'upload_limit_day', 'upload_limit_active']);

/**
 * The server's reason when it refuses a URL, else 'mint_failed'. Since uploads are refused for
 * suspended and restricted accounts at minting, this carries 'posting_paused' or 'suspended' to
 * Post Review, which shows A-Restricted or LV-Suspended as it did when post_response refused.
 */
export async function mintRefusal(error: unknown): Promise<string> {
  const response = (error as { context?: { clone?: () => { json: () => Promise<unknown> } } } | null)?.context;
  try {
    const body = (await response?.clone?.().json()) as { error?: unknown } | undefined;
    if (typeof body?.error === 'string' && MINT_REFUSALS.has(body.error)) return body.error;
  } catch {
    // Not a JSON answer from the function.
  }
  return 'mint_failed';
}

/** abandon-submission's answer (20261013000300). */
export type AbandonAnswer = { outcome: 'abandoned' | 'kept' | 'not_found'; reason?: string; responseId?: string };

/**
 * Asks the server to discard a recording's post, which it does only once Mux confirms it has
 * nothing of it. Throws when there is no answer: nothing is known, nothing may be deleted.
 */
export async function requestAbandon(submissionId: string): Promise<AbandonAnswer> {
  const { data, error } = await supabase.functions.invoke('abandon-submission', { method: 'POST', body: { submissionId } });
  if (error) throw new Error('abandon_failed');
  const outcome = (data as { outcome?: unknown } | null)?.outcome;
  if (outcome !== 'abandoned' && outcome !== 'kept' && outcome !== 'not_found') throw new Error('abandon_failed');
  return data as AbandonAnswer;
}

/** Whether the recording's file is still on the phone (one segment until stitching, B-1). */
export function recordingOnPhone(recording: Recording): boolean {
  try {
    return recording.segments.length === 1 && new File(recording.segments[0].uri).exists;
  } catch {
    return false;
  }
}

/**
 * The file that is uploaded: the recording's one file. A take with a camera flip has several
 * segments until Post Review stitches them into one (stitch.ts ensureStitched, docs/BLOCKERS.md
 * B-1); this stays synchronous, so it does not stitch itself: an unstitched recording is refused
 * with `stitching_required` and a partial take (one segment of several) is never uploaded.
 */
export function uploadableFile(recording: Recording): File {
  if (recording.segments.length !== 1) throw new Error('stitching_required');
  const file = new File(recording.segments[0].uri);
  if (!file.exists) throw new Error('recording_missing');
  return file;
}

/**
 * PUTs the recording to its upload URL. Aborting `signal` cancels the transfer (signing out).
 * sessionType 'foreground': expo-file-system's iOS default is 'background', a background
 * URLSession that keeps sending after the app is suspended or ended, which SPEC.md rules out and
 * which let a Retry PUT race the first transfer. Android ignores the option (in-process OkHttp).
 */
export async function putRecording(
  recording: Recording,
  uploadUrl: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const file = uploadableFile(recording);
  const total = file.size ?? 0;
  // The transfer reports progress for every chunk sent, and each report re-renders everything that
  // reads the posting state (Home and its banner). The banner shows whole percents: report those.
  let lastPercent = -1;
  const report = (fraction: number) => {
    const percent = Math.floor(fraction * 100);
    if (percent === lastPercent) return;
    lastPercent = percent;
    onProgress(fraction);
  };
  const task = file.createUploadTask(uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { 'Content-Type': 'video/mp4' },
    onProgress: (p) => report(total > 0 ? Math.min(1, p.bytesSent / (p.totalBytes || total)) : 0),
    sessionType: 'foreground',
    signal,
  });
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) throw new Error(`upload_http_${result?.status ?? 'none'}`);
  onProgress(1);
}

export type UploadStatus = {
  uploadStatus: string;
  assetStatus: string | null;
  playbackId: string | null;
  responseStatus: 'processing' | 'live' | 'removed' | 'deleted';
  errors?: unknown;
};

/**
 * What Mux has for one of the member's uploads. 'status_not_found' when none of the member's videos
 * uses that upload any more (its row moved to a newer upload, or was deleted); 'status_failed' when
 * there was no answer.
 */
export async function checkUploadStatus(uploadId: string): Promise<UploadStatus> {
  const { data, error } = await supabase.functions.invoke(`mux-upload-status?uploadId=${encodeURIComponent(uploadId)}`, { method: 'GET' });
  if (error) throw new Error((await statusRefusal(error)) ?? 'status_failed');
  return data as UploadStatus;
}

async function statusRefusal(error: unknown): Promise<string | null> {
  const response = (error as { context?: { status?: number; clone?: () => { json: () => Promise<unknown> } } } | null)?.context;
  if (response?.status !== 404) return null;
  try {
    const body = (await response.clone?.().json()) as { error?: unknown } | undefined;
    return body?.error === 'not_found' ? 'status_not_found' : null;
  } catch {
    return null;
  }
}

/** Polls until the response is live (or, for a private draft, until its asset is ready). Resolves with the playback id. */
export async function waitUntilLive(uploadId: string, opts: { intervalMs?: number; timeoutMs?: number; signal?: { aborted: boolean }; until?: 'live' | 'ready' } = {}): Promise<string> {
  const interval = opts.intervalMs ?? 1500;
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new Error('cancelled');
    const status = await checkUploadStatus(uploadId);
    if (status.responseStatus === 'live' && status.playbackId) return status.playbackId;
    if (opts.until === 'ready' && status.assetStatus === 'ready' && status.playbackId) return status.playbackId;
    if (status.assetStatus === 'errored' || status.uploadStatus === 'errored' || status.uploadStatus === 'cancelled') throw new Error('asset_errored');
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('processing_timeout');
}

export function deleteRecordingFiles(recording: Recording): void {
  for (const seg of recording.segments) {
    try {
      const f = new File(seg.uri);
      if (f.exists) f.delete();
    } catch {
      // ignore
    }
  }
}
