// Foreground upload to Mux with progress, then polling until the asset is playable.
// The recording file stays on the phone until the response is live.
import { File, UploadType } from 'expo-file-system';

import { supabase } from '@/lib/supabase';
import type { Recording } from './types';

export type UploadTicket = { uploadId: string; uploadUrl: string };

/** Mint a direct-upload URL. Called on Post Review so it is ready before Post is tapped. */
export async function mintUpload(): Promise<UploadTicket> {
  const { data, error } = await supabase.functions.invoke('mux-create-upload', { method: 'POST' });
  if (error || !data?.uploadId || !data?.uploadUrl) throw new Error('mint_failed');
  return { uploadId: String(data.uploadId), uploadUrl: String(data.uploadUrl) };
}

/** The file that is uploaded. One segment only until stitching lands (docs/BLOCKERS.md B-1). */
export function uploadableFile(recording: Recording): File {
  if (recording.segments.length !== 1) throw new Error('stitching_required');
  const file = new File(recording.segments[0].uri);
  if (!file.exists) throw new Error('recording_missing');
  return file;
}

export async function putRecording(
  recording: Recording,
  uploadUrl: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const file = uploadableFile(recording);
  const total = file.size ?? 0;
  const task = file.createUploadTask(uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    headers: { 'Content-Type': 'video/mp4' },
    onProgress: (p) => onProgress(total > 0 ? Math.min(1, p.bytesSent / (p.totalBytes || total)) : 0),
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

export async function checkUploadStatus(uploadId: string): Promise<UploadStatus> {
  const { data, error } = await supabase.functions.invoke(`mux-upload-status?uploadId=${encodeURIComponent(uploadId)}`, { method: 'GET' });
  if (error) throw new Error('status_failed');
  return data as UploadStatus;
}

/** Polls until the response is live (or, for a private draft, until its asset is ready). Resolves with the playback id. */
export async function waitUntilLive(uploadId: string, opts: { intervalMs?: number; timeoutMs?: number; signal?: { cancelled: boolean }; until?: 'live' | 'ready' } = {}): Promise<string> {
  const interval = opts.intervalMs ?? 1500;
  const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
  while (Date.now() < deadline) {
    if (opts.signal?.cancelled) throw new Error('cancelled');
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
