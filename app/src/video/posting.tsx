// Posting controller: runs the foreground upload of a posted response, keeps the recording
// on the phone until it is live, and exposes the state the Home banners draw
// (PR-Posting, X-Upload-Failed, and A-Offline while a post waits for the connection). Survives app
// restarts through pendingPost storage; a post waiting offline when the app closes becomes Retry.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { track } from '@/lib/analytics';
import { isOnline, subscribeOnline } from '@/lib/connectivity';
import { abandonResponse, postDraft, postReply, postResponse, retryResponseUpload } from '@/lib/content';
import { loadPendingPost, savePendingPost } from './pendingPost';
import { resumeState, uploadUrlUsable, type PendingPost } from './pendingPostState';
import type { Recording } from './types';
import { deleteRecordingFiles, mintUpload, putRecording, waitUntilLive, type UploadTicket } from './upload';

export type PostingState =
  | { kind: 'idle' }
  /** Post tapped while offline: the recording waits on the phone and posts when the connection returns. */
  | { kind: 'waiting'; post: PendingPost }
  | { kind: 'uploading'; post: PendingPost; progress: number }
  | { kind: 'processing'; post: PendingPost }
  | { kind: 'failed'; post: PendingPost }
  | { kind: 'live'; post: PendingPost; playbackId: string };

type PostingContextValue = {
  state: PostingState;
  /** Post is tapped: create the row (a response, or a video reply when replyTo is set), then upload. Resolves once the row exists. */
  post: (args: { recording: Recording; promptId: string; promptText: string; caption: string | null; ticket: UploadTicket | null; replyTo?: { id: string; name: string }; draftFor?: string }) => Promise<void>;
  retry: () => Promise<void>;
  /** Give up on a failed post: the recording is deleted from the phone. */
  discardFailed: () => Promise<void>;
  /** Clears a finished post from the banner. */
  dismiss: () => void;
};

const PostingContext = createContext<PostingContextValue | null>(null);

const UPLOAD_URL_TTL_MS = 55 * 60 * 1000;

export function PostingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PostingState>({ kind: 'idle' });
  const running = useRef(false);

  const persist = useCallback(async (post: PendingPost | null) => {
    await savePendingPost(post);
  }, []);

  const run = useCallback(async (post: PendingPost) => {
    if (running.current) return;
    running.current = true;
    try {
      let current = post;
      if (!uploadUrlUsable(current)) {
        const fresh = await mintUpload();
        await retryResponseUpload(current.responseId, fresh.uploadId);
        current = { ...current, uploadId: fresh.uploadId, uploadUrl: fresh.uploadUrl, uploadUrlExpiresAt: Date.now() + UPLOAD_URL_TTL_MS };
      }
      current = { ...current, state: 'uploading', attempts: current.attempts + 1, failedReason: null };
      await persist(current);
      setState({ kind: 'uploading', post: current, progress: 0 });
      await putRecording(current.recording, current.uploadUrl, (fraction) => setState({ kind: 'uploading', post: current, progress: fraction }));
      current = { ...current, state: 'processing' };
      await persist(current);
      setState({ kind: 'processing', post: current });
      const playbackId = await waitUntilLive(current.uploadId, { until: current.kind === 'draft' ? 'ready' : 'live' });
      deleteRecordingFiles(current.recording);
      await persist(null);
      setState({ kind: 'live', post: { ...current, playbackId }, playbackId });
      track('video_published', { kind: current.kind, prompt_id: current.promptId, duration_s: Math.round(current.recording.durationMs / 1000), has_caption: !!current.caption });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      track('upload_failed', { reason: reason.slice(0, 80) });
      const failed: PendingPost = { ...post, state: 'failed', failedReason: reason };
      await persist(failed);
      setState({ kind: 'failed', post: failed });
    } finally {
      running.current = false;
    }
  }, [persist]);

  // On launch: a post that was uploading when the app closed offers Retry; one that was
  // processing is polled again.
  useEffect(() => {
    void loadPendingPost().then((stored) => {
      if (!stored) return;
      const resumed = resumeState(stored);
      if (resumed.state === 'processing') void run(resumed);
      else setState({ kind: 'failed', post: resumed });
    });
  }, [run]);

  const post = useCallback<PostingContextValue['post']>(async ({ recording, promptId, promptText, caption, ticket, replyTo, draftFor }) => {
    const t = ticket ?? (await mintUpload());
    const row = draftFor
      ? await postDraft(draftFor, t.uploadId, caption, recording.durationMs)
      : replyTo
        ? await postReply(replyTo.id, t.uploadId, caption, recording.durationMs)
        : await postResponse(promptId, t.uploadId, caption, recording.durationMs);
    const pending: PendingPost = {
      responseId: row.id,
      kind: draftFor ? 'draft' : replyTo ? 'reply' : 'response',
      draftFor: draftFor ?? null,
      replyToId: replyTo?.id ?? null,
      replyToName: replyTo?.name ?? null,
      promptId,
      promptText,
      recording,
      caption,
      uploadId: t.uploadId,
      uploadUrl: t.uploadUrl,
      uploadUrlExpiresAt: Date.now() + UPLOAD_URL_TTL_MS,
      playbackId: null,
      state: 'uploading',
      attempts: 0,
      failedReason: null,
    };
    if (!isOnline()) {
      // Offline at Post: keep the recording and wait while the app is open (Nemat, 9 Oct).
      const waiting: PendingPost = { ...pending, state: 'waiting' };
      await persist(waiting);
      setState({ kind: 'waiting', post: waiting });
      return;
    }
    await persist(pending);
    void run(pending);
  }, [persist, run]);

  // The connection comes back while a post waits: start it by itself.
  useEffect(() => {
    if (state.kind !== 'waiting') return;
    const post = state.post;
    if (isOnline()) {
      // Already back (or the check raced): start on the next tick, outside this render.
      const t = setTimeout(() => void run(post), 0);
      return () => clearTimeout(t);
    }
    return subscribeOnline((online) => {
      if (online) void run(post);
    });
  }, [state, run]);

  const retry = useCallback(async () => {
    if (state.kind !== 'failed') return;
    track('upload_retried', { reason: (state.post.failedReason ?? '').slice(0, 80) });
    await run(state.post);
  }, [state, run]);

  const discardFailed = useCallback(async () => {
    if (state.kind !== 'failed') return;
    deleteRecordingFiles(state.post.recording);
    await persist(null);
    try {
      await abandonResponse(state.post.responseId);
    } catch {
      // The row stays "processing" server-side; harmless and invisible to others.
    }
    setState({ kind: 'idle' });
  }, [state, persist]);

  const dismiss = useCallback(() => {
    setState((s) => (s.kind === 'live' ? { kind: 'idle' } : s));
  }, []);

  const value = useMemo(() => ({ state, post, retry, discardFailed, dismiss }), [state, post, retry, discardFailed, dismiss]);
  return <PostingContext.Provider value={value}>{children}</PostingContext.Provider>;
}

export function usePosting(): PostingContextValue {
  const ctx = useContext(PostingContext);
  if (!ctx) throw new Error('usePosting must be used inside PostingProvider');
  return ctx;
}
