// Posting controller: runs the foreground upload of a posted response, keeps the recording
// on the phone until it is live, and exposes the state the Home banners draw
// (PR-Posting, X-Upload-Failed, and A-Offline while a post waits for the connection). Survives app
// restarts through pendingPost storage; a post waiting offline when the app closes becomes Retry.
// A post belongs to the member who posted it: when the signed-in member changes, their upload is
// stopped and their post is neither shown nor retried for anyone else.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { track } from '@/lib/analytics';
import { isOnline, subscribeOnline } from '@/lib/connectivity';
import { abandonResponse, abandonSubmission, postDraft, postReply, postResponse, retryResponseUpload } from '@/lib/content';
import { useSession } from '@/lib/session';
import { loadPendingPost, loadPendingPostOrThrow, savePendingPost, savePendingPostOrThrow } from './pendingPost';
import { resumeState, type PendingPost } from './pendingPostState';
import { createGate, createOncePerKey, createQueue } from './postingFlow';
import type { TicketSource } from './ticketStore';
import type { Recording } from './types';
import { checkUploadStatus, deleteRecordingFiles, mintUpload, putRecording, waitUntilLive, type UploadTicket } from './upload';
import { runPendingPost, submitPost, type PostingState } from './uploadRun';
import { uploadTickets } from './uploadTickets';

export type { PostingState } from './uploadRun';

type PostingContextValue = {
  state: PostingState;
  /** Post is tapped: create the row (a response, or a video reply when replyTo is set), then upload. Resolves once the post is
   *  kept on the phone (with its row, or as Upload failed). Throws 'post_pending' while another recording of the member waits:
   *  it is never replaced. The upload URL comes from the member's ticket store (the one Post Review asked for). A recording is
   *  posted once: posting it again gets the first call's promise, unless that call threw. */
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

/** Creates the posted row (a response, a video reply or a draft) for an upload URL, with the recording's submission. */
function createRow(post: Pick<PendingPost, 'draftFor' | 'replyToId' | 'promptId' | 'caption' | 'recording'>, t: UploadTicket): Promise<{ id: string }> {
  const { durationMs, submissionId } = post.recording;
  if (post.draftFor) return postDraft(post.draftFor, t.uploadId, post.caption, durationMs, submissionId);
  if (post.replyToId) return postReply(post.replyToId, t.uploadId, post.caption, durationMs, submissionId);
  return postResponse(post.promptId, t.uploadId, post.caption, durationMs, submissionId);
}

/**
 * Discard (X-Upload-Failed) or Sign out anyway: the recording leaves the phone, and the row the
 * server may hold for it is retired. A row the phone knows is abandoned as before. A Post that
 * never got an answer may have made one: abandon_submission retires it only if nothing can have
 * been sent to it. Best effort: offline, the row stays (invisible) and the recording still goes.
 */
async function forgetPost(ownerId: string, post: PendingPost): Promise<void> {
  deleteRecordingFiles(post.recording);
  await savePendingPost(ownerId, null);
  try {
    if (post.responseId) await abandonResponse(post.responseId);
    else if (post.uploadId && post.recording.submissionId) await abandonSubmission(post.recording.submissionId);
  } catch {
    // The row stays "processing" server-side; invisible to others.
  }
}

/** The signed-in member as the provider sees it: one upload and one Post at a time, stopped when they change. */
type Member = { id: string | null; abort: AbortController; gate: ReturnType<typeof createGate>; queue: ReturnType<typeof createQueue> };
const newMember = (id: string | null): Member => ({ id, abort: new AbortController(), gate: createGate(), queue: createQueue() });

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
    const owner = m.id;
    if (owner === null || post.ownerId !== owner) return Promise.resolve();
    return m.gate(() =>
      runPendingPost(
        post,
        {
          persist: (p) => savePendingPostOrThrow(owner, p),
          show: (s) => setOwned({ owner: m.id, state: s }),
          mint: mintUpload,
          createRow,
          retryResponseUpload,
          put: putRecording,
          status: checkUploadStatus,
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
    void loadPendingPost(ownerId).then((mine) => {
      if (!mine || m.abort.signal.aborted) return;
      const resumed = resumeState(mine);
      if (resumed.state === 'processing') void run(resumed);
      else setOwned({ owner: ownerId, state: { kind: 'failed', post: resumed } });
    });
  }, [ownerId, run]);

  const post = useCallback<PostingContextValue['post']>((args) => oncePerRecording(args.recording.id, () => {
    const m = member.current;
    const owner = m.id;
    if (!owner) return Promise.reject(new Error('not_signed_in'));
    // One Post at a time per member, so two recordings cannot both pass the one-waiting check.
    return m.queue(async () => {
      const result = await submitPost(
        { ...args, ownerId: owner },
        {
          stored: () => loadPendingPostOrThrow(owner),
          store: (p) => savePendingPostOrThrow(owner, p),
          clear: () => savePendingPostOrThrow(owner, null),
          createRow,
          online: isOnline,
          track,
          aborted: () => m.abort.signal.aborted,
        },
      );
      if (!result || m.abort.signal.aborted) return;
      setOwned({ owner, state: result.show });
      if (result.upload) void run(result.upload);
    });
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
    if (state.kind !== 'failed' || !ownerId) return;
    await forgetPost(ownerId, state.post);
    setOwned({ owner: ownerId, state: IDLE });
  }, [state, ownerId]);

  const deleteUnposted = useCallback(async () => {
    // Stop the upload first, so no more bytes are sent, then delete the recording.
    const m = member.current;
    m.abort.abort();
    member.current = newMember(m.id);
    const mine = await loadPendingPost(m.id);
    if (m.id && mine) await forgetPost(m.id, mine);
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
