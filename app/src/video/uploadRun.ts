// The foreground upload of one posted recording, from its row to live (pure: no React, no storage,
// no network). posting.tsx supplies the effects, so interruption, Retry and signing out can be
// tested with mocks.
import type { EventName, EventProps } from '@/lib/analytics';
import { ensureUploadRow, errorReason, prepareUpload, type SentUrl } from './postingFlow';
import { newPendingPost, UPLOAD_URL_TTL_MS, uploadUrlUsable, type PendingPost } from './pendingPostState';
import type { TicketSource } from './ticketStore';
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
  /** Must succeed (throws otherwise): the row id is on the phone before any byte is sent. */
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
        replayable: !!current.recording.submissionId,
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
    await persist(null).catch(() => undefined);
    show({ kind: 'live', post: { ...current, playbackId }, playbackId });
    deps.track('video_published', { kind: current.kind, prompt_id: current.promptId, duration_s: Math.round(current.recording.durationMs / 1000), has_caption: !!current.caption });
  } catch (e) {
    if (signal.aborted) return;
    const reason = errorReason(e);
    deps.track('upload_failed', { reason: reason.slice(0, 80) });
    const failed: PendingPost = { ...current, state: 'failed', failedReason: reason };
    await persist(failed).catch(() => undefined);
    show({ kind: 'failed', post: failed });
  }
}

export type SubmitArgs = {
  ownerId: string;
  recording: Recording;
  promptId: string;
  promptText: string;
  caption: string | null;
  replyTo?: { id: string; name: string };
  draftFor?: string;
  tickets: TicketSource;
};

export type SubmitDeps = {
  /** The member's stored post. Throws if storage cannot be read (nothing may be replaced blind). */
  stored: () => Promise<PendingPost | null>;
  /** Must succeed (throws otherwise). */
  store: (post: PendingPost) => Promise<void>;
  clear: () => Promise<void>;
  createRow: (post: PendingPost, t: UploadTicket) => Promise<{ id: string }>;
  online: () => boolean;
  track: (name: EventName, props: EventProps) => void;
  /** The member changed while this ran. */
  aborted: () => boolean;
};

/** What Post leaves: the banner state to show, and a post to upload now. Null: nothing to show. */
export type Submitted = { show: PostingState; upload?: PendingPost } | null;

/**
 * Post is tapped. A recording is never lost and never replaced:
 * - Refused ('post_pending') while the member has another recording waiting (uploading,
 *   processing, offline or Upload failed). It stays until it posts or is discarded (Nemat, 13 Oct).
 * - The post is stored before the row is asked for, with its URL and submission. A lost answer,
 *   or the app closing mid-request, leaves an Upload failed post whose Retry sends the same
 *   request, and the server returns the row it made.
 * - No answer from the server: an Upload failed post (waiting, if offline), not a silent Post.
 * - A refusal: the stored record of this attempt is removed and the refusal thrown, as before
 *   (A-Restricted, LV-Suspended, or Post Review staying open).
 */
export async function submitPost(args: SubmitArgs, deps: SubmitDeps): Promise<Submitted> {
  const stored = await deps.stored();
  if (stored && stored.recording.id !== args.recording.id) throw new Error('post_pending');
  const base = newPendingPost(args, null, 'uploading');
  const withUrl = (sent: SentUrl): PendingPost => ({ ...base, uploadId: sent.ticket.uploadId, uploadUrl: sent.ticket.uploadUrl, uploadUrlExpiresAt: sent.mintedAt + UPLOAD_URL_TTL_MS });
  let recorded = false;
  let prepared;
  try {
    prepared = await prepareUpload({
      tickets: args.tickets,
      create: (t) => deps.createRow(base, t),
      beforeSend: async (sent) => {
        await deps.store(withUrl(sent));
        recorded = true;
      },
    });
  } catch (e) {
    // Refused: the request rolled back, nothing was made. Post Review keeps the recording.
    if (recorded) await deps.clear().catch(() => undefined);
    throw e;
  }
  if (deps.aborted()) return null;
  if (!prepared.ok) {
    // Never a silent Post. Offline, it waits for the connection like any post tapped offline
    // (A-Offline; Nemat, 9 Oct). Otherwise the recording is kept on the phone and the Upload failed
    // banner says why (an upload limit, or the connection), with Retry.
    const waitsOffline = !deps.online() && !prepared.reason.startsWith('upload_limit');
    if (!waitsOffline) deps.track('upload_failed', { reason: prepared.reason.slice(0, 80) });
    const kept: PendingPost = {
      ...(prepared.sent ? withUrl(prepared.sent) : base),
      state: waitsOffline ? 'waiting' : 'failed',
      failedReason: waitsOffline ? null : prepared.reason,
    };
    await deps.store(kept);
    return { show: waitsOffline ? { kind: 'waiting', post: kept } : { kind: 'failed', post: kept } };
  }
  const { ticket: t, mintedAt, row } = prepared;
  const pending = newPendingPost(args, { responseId: row.id, uploadId: t.uploadId, uploadUrl: t.uploadUrl, mintedAt }, 'uploading');
  if (!deps.online()) {
    // Offline at Post: keep the recording and wait while the app is open (Nemat, 9 Oct).
    const waiting: PendingPost = { ...pending, state: 'waiting' };
    await deps.store(waiting);
    return { show: { kind: 'waiting', post: waiting } };
  }
  await deps.store(pending);
  return { show: { kind: 'uploading', post: pending, progress: 0 }, upload: pending };
}
