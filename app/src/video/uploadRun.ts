// The foreground upload of one posted recording, from its row to live (pure: no React, no storage,
// no network). posting.tsx supplies the effects, so interruption, Retry and signing out can be
// tested with mocks.
import type { EventName, EventProps } from '@/lib/analytics';
import { ensureUploadRow, errorReason } from './postingFlow';
import { UPLOAD_URL_TTL_MS, uploadUrlUsable, type PendingPost } from './pendingPostState';
import type { Recording } from './types';
import type { UploadStatus, UploadTicket } from './upload';

export type PostingState =
  | { kind: 'idle' }
  /** Post tapped while offline: the recording waits on the phone and posts when the connection returns. */
  | { kind: 'waiting'; post: PendingPost }
  | { kind: 'uploading'; post: PendingPost; progress: number }
  | { kind: 'processing'; post: PendingPost }
  | { kind: 'failed'; post: PendingPost }
  | { kind: 'live'; post: PendingPost; playbackId: string };

export type RunDeps = {
  persist: (post: PendingPost | null) => Promise<void>;
  show: (state: PostingState) => void;
  mint: () => Promise<UploadTicket>;
  createRow: (post: PendingPost, t: UploadTicket) => Promise<{ id: string }>;
  retryResponseUpload: (responseId: string, uploadId: string) => Promise<void>;
  put: (recording: Recording, uploadUrl: string, onProgress: (fraction: number) => void, signal: AbortSignal) => Promise<void>;
  /** What Mux has for an upload (mux-upload-status). Asked before sending a recording again. */
  status: (uploadId: string) => Promise<UploadStatus>;
  waitUntilLive: (uploadId: string, opts: { until: 'live' | 'ready'; signal: AbortSignal }) => Promise<string>;
  deleteFiles: (recording: Recording) => void;
  track: (name: EventName, props: EventProps) => void;
  now?: () => number;
};

/** Mux upload states after which the URL can take no more bytes: a fresh URL is needed. */
const DEAD_UPLOAD = ['timed_out', 'cancelled', 'errored'];

/**
 * What to do with a post whose recording may already have been sent (Retry after a failed or
 * interrupted transfer, or a launch after the app closed). The transfer runs in the foreground,
 * so the first one has stopped by now; but it may have delivered every byte with the answer lost
 * (the app was suspended or closed at the end). Mux is asked first, so the recording is not sent
 * twice: an upload Mux already has is only waited on. Unknown (no answer): the post fails again,
 * rather than sending blind. An upload the row no longer uses gets a fresh URL.
 */
export type ResendPlan = 'send' | 'wait' | 'replace';

export async function planResend(post: PendingPost, status: RunDeps['status']): Promise<ResendPlan> {
  // The transfer finished (2xx) before the app closed: only the processing is left.
  if (post.state === 'processing') return 'wait';
  // No transfer was ever started with this URL.
  if (post.attempts === 0) return 'send';
  let s: UploadStatus;
  try {
    s = await status(post.uploadId);
  } catch (e) {
    // The row no longer uses this upload: a Retry's new URL was recorded but its answer was lost.
    // A fresh one is put on the row (retry_response_upload refuses a row that is gone).
    if (errorReason(e) === 'status_not_found') return 'replace';
    throw e;
  }
  if (s.responseStatus === 'live') return 'wait';
  // The video was removed or deleted on the server meanwhile: its recording is not sent.
  if (s.responseStatus === 'removed' || s.responseStatus === 'deleted') throw new Error(`response_${s.responseStatus}`);
  // Mux made an asset from it but could not process it: waiting again would fail again.
  if (s.assetStatus === 'errored' || DEAD_UPLOAD.includes(s.uploadStatus)) return 'replace';
  if (s.uploadStatus === 'asset_created') return 'wait';
  return 'send';
}

/**
 * Uploads a pending post and waits until it is live. Any failure leaves it as an Upload failed
 * post with the reason, keeping the row and URL it got along the way. Once `signal` is aborted
 * (the member signed out or changed), the upload is cancelled and nothing more is stored or shown:
 * the post belongs to a member who is no longer signed in.
 */
export async function runPendingPost(post: PendingPost, deps: RunDeps, signal: AbortSignal): Promise<void> {
  const now = deps.now ?? Date.now;
  const persist = async (p: PendingPost | null) => {
    if (!signal.aborted) await deps.persist(p);
  };
  const show = (s: PostingState) => {
    if (!signal.aborted) deps.show(s);
  };
  // The latest state of this post, so a failure keeps a row or URL obtained along the way.
  let current = post;
  try {
    if (!current.responseId) {
      // No URL could be had when Post was tapped (an upload limit, or no connection): get one now
      // and create the row, as Post would have. The URL is saved first, so a failed attempt
      // reuses it rather than minting another.
      current = await ensureUploadRow(current, {
        usable: (p) => uploadUrlUsable(p, now()),
        mint: deps.mint,
        create: (t) => deps.createRow(current, t),
        save: async (p) => {
          current = p;
          await persist(p);
        },
        ttlMs: UPLOAD_URL_TTL_MS,
        now,
      });
    }
    const plan = await planResend(current, deps.status);
    if (signal.aborted) return;
    if (plan !== 'wait') {
      if (plan === 'replace' || !uploadUrlUsable(current, now())) {
        const responseId = current.responseId;
        if (!responseId) throw new Error('row_missing');
        const askedAt = now();
        const fresh = await deps.mint();
        await deps.retryResponseUpload(responseId, fresh.uploadId);
        current = { ...current, uploadId: fresh.uploadId, uploadUrl: fresh.uploadUrl, uploadUrlExpiresAt: askedAt + UPLOAD_URL_TTL_MS };
      }
      if (signal.aborted) return;
      current = { ...current, state: 'uploading', attempts: current.attempts + 1, failedReason: null };
      await persist(current);
      show({ kind: 'uploading', post: current, progress: 0 });
      await deps.put(current.recording, current.uploadUrl, (fraction) => show({ kind: 'uploading', post: current, progress: fraction }), signal);
    }
    current = { ...current, state: 'processing' };
    await persist(current);
    show({ kind: 'processing', post: current });
    const playbackId = await deps.waitUntilLive(current.uploadId, { until: current.kind === 'draft' ? 'ready' : 'live', signal });
    if (signal.aborted) return;
    deps.deleteFiles(current.recording);
    await persist(null);
    show({ kind: 'live', post: { ...current, playbackId }, playbackId });
    deps.track('video_published', { kind: current.kind, prompt_id: current.promptId, duration_s: Math.round(current.recording.durationMs / 1000), has_caption: !!current.caption });
  } catch (e) {
    if (signal.aborted) return;
    const reason = errorReason(e);
    deps.track('upload_failed', { reason: reason.slice(0, 80) });
    const failed: PendingPost = { ...current, state: 'failed', failedReason: reason };
    await persist(failed);
    show({ kind: 'failed', post: failed });
  }
}
