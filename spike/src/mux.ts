// Talks to our Supabase Edge Functions. The Mux secret never leaves the server.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' };

export interface CreatedUpload { uploadId: string; uploadUrl: string; createdAt: number }
export interface UploadStatus {
  uploadStatus: string;
  assetId: string | null;
  assetStatus: string | null;
  playbackId: string | null;
  duration?: number | null;
  maxResolution?: string | null;
  resolutionTier?: string | null;
  tracks?: unknown[];
  errors?: unknown;
  error?: unknown;
}

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(`${what} timed out after ${ms}ms`)), ms); });
  try { return await Promise.race([p, timeout]); } finally { clearTimeout(t!); }
}

export async function createUpload(label: string): Promise<CreatedUpload> {
  const res = await withTimeout(fetch(`${SUPABASE_URL}/functions/v1/mux-create-upload`, { method: 'POST', headers, body: JSON.stringify({ label }) }), 20000, 'mux-create-upload');
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(`create upload: ${res.status} ${body.error ?? ''}`);
  return body as CreatedUpload;
}

export async function getUploadStatus(uploadId: string): Promise<UploadStatus> {
  const res = await withTimeout(fetch(`${SUPABASE_URL}/functions/v1/mux-upload-status?uploadId=${encodeURIComponent(uploadId)}`, { headers }), 20000, 'mux-upload-status');
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(`upload status: ${res.status} ${body.error ?? ''}`);
  return body as UploadStatus;
}

export function hlsUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

/** Poll until the asset is ready or errored. Resolves with the final status and the poll count. */
export async function waitUntilPlayable(uploadId: string, onTick?: (s: UploadStatus, polls: number) => void, intervalMs = 1500, maxMs = 10 * 60 * 1000): Promise<{ status: UploadStatus; polls: number }> {
  const start = Date.now();
  let polls = 0;
  for (;;) {
    polls += 1;
    let status: UploadStatus | null = null;
    try {
      status = await getUploadStatus(uploadId);
    } catch (e) {
      // transient network failure while polling: keep going
      console.warn('poll failed', e);
    }
    if (status) {
      onTick?.(status, polls);
      if (status.assetStatus === 'ready' && status.playbackId) return { status, polls };
      if (status.assetStatus === 'errored' || status.uploadStatus === 'errored' || status.uploadStatus === 'cancelled' || status.uploadStatus === 'timed_out') {
        throw new Error(`Mux reported ${status.assetStatus ?? status.uploadStatus}: ${JSON.stringify(status.errors ?? status.error ?? '')}`);
      }
    }
    if (Date.now() - start > maxMs) throw new Error('gave up waiting for Mux asset');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
