// Posting controller: runs the foreground upload of a posted response, keeps the recording
// on the phone until it is live, and exposes the state the Home banners draw
// (PR-Posting, X-Upload-Failed, and A-Offline while a post waits for the connection). Survives app
// restarts through pendingPost storage; a post waiting offline when the app closes becomes Retry.
// A post belongs to the member who posted it: when the signed-in member changes, their upload is
// stopped and their post is neither shown nor retried for anyone else.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { track } from '@/lib/analytics';
import { isOnline, subscribeOnline } from '@/lib/connectivity';
import { abandonResponse, postDraft, postReply, postResponse, retryResponseUpload } from '@/lib/content';
import { useSession } from '@/lib/session';
import { loadPendingPost, savePendingPost, storeNewPendingPost } from './pendingPost';
import { newPendingPost, pendingPostFor, resumeState, type PendingPost } from './pendingPostState';
import { createGate, createOncePerKey, prepareUpload } from './postingFlow';
import type { TicketSource } from './ticketStore';
import type { Recording } from './types';
import { deleteRecordingFiles, mintUpload, putRecording, waitUntilLive, type UploadTicket } from './upload';
import { runPendingPost, type PostingState } from './uploadRun';
import { uploadTickets } from './uploadTickets';

export type { PostingState } from './uploadRun';

type PostingContextValue = {
  state: PostingState;
  /** Post is tapped: create the row (a response, or a video reply when replyTo is set), then upload. Resolves once the row exists.
   *  The upload URL comes from the member's ticket store (the one Post Review asked for). A recording is posted once: posting it
   *  again gets the first call's promise, unless that call threw. */
  post: (args: { recording: Recording; promptId: string; promptText: string; caption: string | null; tickets: TicketSource; replyTo?: { id: string; name: string }; draftFor?: string }) => Promise<void>;
  retry: () => Promise<void>;
  /** Give up on a failed post: the recording is deleted from the phone. */
  discardFailed: () => Promise<void>;
  /** Sign out anyway (LV-SignOut): stops the member's upload and deletes their unposted recording from the phone. */
  deleteUnposted: () => Promise<void>;
  /** Clears a finished post from the banner. */
  dismiss: () => void;
};

const PostingContext = createContext<PostingContextValue | null>(null);

const IDLE: PostingState = { kind: 'idle' };

/** Creates the posted row (a response, a video reply or a draft) for an upload URL. */
function createRow(post: Pick<PendingPost, 'draftFor' | 'replyToId' | 'promptId' | 'caption' | 'recording'>, t: UploadTicket): Promise<{ id: string }> {
  const durationMs = post.recording.durationMs;
  if (post.draftFor) return postDraft(post.draftFor, t.uploadId, post.caption, durationMs);
  if (post.replyToId) return postReply(post.replyToId, t.uploadId, post.caption, durationMs);
  return postResponse(post.promptId, t.uploadId, post.caption, durationMs);
}

/** The signed-in member as the provider sees it: one upload at a time, stopped when they change. */
type Member = { id: string | null; abort: AbortController; gate: ReturnType<typeof createGate> };
const newMember = (id: string | null): Member => ({ id, abort: new AbortController(), gate: createGate() });

export function PostingProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const ownerId = session?.user.id ?? null;
  // The state is kept with the member it belongs to; another member sees idle.
  const [owned, setOwned] = useState<{ owner: string | null; state: PostingState }>({ owner: null, state: IDLE });
  const state = owned.owner !== null && owned.owner === ownerId ? owned.state : IDLE;
  const member = useRef<Member>(newMember(null));
  const [oncePerRecording] = useState(createOncePerKey);

  /** One run at a time per member: a second call (Retry twice, the connection returning) joins the first. */
  const run = useCallback((post: PendingPost) => {
    const m = member.current;
    if (m.id === null || post.ownerId !== m.id) return Promise.resolve();
    return m.gate(() =>
      runPendingPost(
        post,
        {
          persist: savePendingPost,
          show: (s) => setOwned({ owner: m.id, state: s }),
          mint: mintUpload,
          createRow,
          retryResponseUpload,
          put: putRecording,
          waitUntilLive,
          deleteFiles: deleteRecordingFiles,
          track,
        },
        m.abort.signal,
      ),
    );
  }, []);

  // The signed-in member changes (sign-in, sign-out, another account): stop the previous member's
  // upload and URL, then offer this member's own stored post. On launch: a post that was uploading
  // when the app closed offers Retry; one that was processing is polled again.
  useEffect(() => {
    if (member.current.id === ownerId) return;
    member.current.abort.abort();
    const m = newMember(ownerId);
    member.current = m;
    uploadTickets.reset();
    if (!ownerId) return;
    void loadPendingPost().then((stored) => {
      const mine = pendingPostFor(stored, ownerId);
      if (!mine || m.abort.signal.aborted) return;
      const resumed = resumeState(mine);
      if (resumed.state === 'processing') void run(resumed);
      else setOwned({ owner: ownerId, state: { kind: 'failed', post: resumed } });
    });
  }, [ownerId, run]);

  const post = useCallback<PostingContextValue['post']>((args) => oncePerRecording(args.recording.id, async () => {
    const { recording, promptId, caption, tickets, replyTo, draftFor } = args;
    const m = member.current;
    if (!m.id) throw new Error('not_signed_in');
    const owner = m.id;
    const show = (s: PostingState) => {
      if (!m.abort.signal.aborted) setOwned({ owner, state: s });
    };
    const target = { draftFor: draftFor ?? null, replyToId: replyTo?.id ?? null, promptId, caption, recording };
    const prepared = await prepareUpload({ tickets, create: (t) => createRow(target, t) });
    if (m.abort.signal.aborted) return;
    if (!prepared.ok) {
      // No upload URL: never a silent Post. Offline, it waits for the connection like any post
      // tapped offline (A-Offline; Nemat, 9 Oct). Otherwise the recording is kept on the phone and
      // the Upload failed banner says why (an upload limit, or the connection), with Retry.
      const waitsOffline = !isOnline() && !prepared.reason.startsWith('upload_limit');
      if (!waitsOffline) track('upload_failed', { reason: prepared.reason.slice(0, 80) });
      const failed = newPendingPost({ ...args, ownerId: owner }, null, waitsOffline ? 'waiting' : 'failed', waitsOffline ? null : prepared.reason);
      await storeNewPendingPost(failed, deleteRecordingFiles);
      show(waitsOffline ? { kind: 'waiting', post: failed } : { kind: 'failed', post: failed });
      return;
    }
    const { ticket: t, mintedAt, row } = prepared;
    const pending = newPendingPost({ ...args, ownerId: owner }, { responseId: row.id, uploadId: t.uploadId, uploadUrl: t.uploadUrl, mintedAt }, 'uploading');
    if (!isOnline()) {
      // Offline at Post: keep the recording and wait while the app is open (Nemat, 9 Oct).
      const waiting: PendingPost = { ...pending, state: 'waiting' };
      await storeNewPendingPost(waiting, deleteRecordingFiles);
      show({ kind: 'waiting', post: waiting });
      return;
    }
    await storeNewPendingPost(pending, deleteRecordingFiles);
    void run(pending);
  }), [run, oncePerRecording]);

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
    await savePendingPost(null);
    try {
      if (state.post.responseId) await abandonResponse(state.post.responseId);
    } catch {
      // The row stays "processing" server-side; harmless and invisible to others.
    }
    setOwned({ owner: ownerId, state: IDLE });
  }, [state, ownerId]);

  const deleteUnposted = useCallback(async () => {
    // Stop the upload first, so no more bytes are sent, then delete the recording.
    const m = member.current;
    m.abort.abort();
    member.current = newMember(m.id);
    const mine = pendingPostFor(await loadPendingPost(), m.id);
    if (mine) {
      deleteRecordingFiles(mine.recording);
      await savePendingPost(null);
    }
    setOwned({ owner: m.id, state: IDLE });
  }, []);

  const dismiss = useCallback(() => {
    setOwned((o) => (o.state.kind === 'live' ? { ...o, state: IDLE } : o));
  }, []);

  const value = useMemo(() => ({ state, post, retry, discardFailed, deleteUnposted, dismiss }), [state, post, retry, discardFailed, deleteUnposted, dismiss]);
  return <PostingContext.Provider value={value}>{children}</PostingContext.Provider>;
}

export function usePosting(): PostingContextValue {
  const ctx = useContext(PostingContext);
  if (!ctx) throw new Error('usePosting must be used inside PostingProvider');
  return ctx;
}
