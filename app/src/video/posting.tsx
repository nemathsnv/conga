// Posting controller: runs the foreground upload of a posted response, keeps the recording
// on the phone until it is live, and exposes the state the Home banners draw
// (PR-Posting, X-Upload-Failed, and A-Offline while a post waits for the connection). Survives app
// restarts through pendingPost storage; a post waiting offline when the app closes becomes Retry.
// A post belongs to the member who posted it: when the signed-in member changes, their upload is
// stopped and their post is neither shown nor retried for anyone else. Retry and Discard never
// run together (createExclusive), and a recording is deleted only once the server confirms
// nothing of it will post (discardPost).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { track } from '@/lib/analytics';
import { isOnline, subscribeOnline } from '@/lib/connectivity';
import { postDraft, postReply, postResponse, retryResponseUpload } from '@/lib/content';
import { useSession } from '@/lib/session';
import { loadPendingPost, loadPendingPostOrThrow, savePendingPostOrThrow } from './pendingPost';
import { resumeState, type PendingPost } from './pendingPostState';
import { createExclusive, createOncePerKey, createQueue } from './postingFlow';
import type { TicketSource } from './ticketStore';
import type { Recording } from './types';
import { checkUploadStatus, deleteRecordingFiles, mintUpload, putRecording, recordingOnPhone, requestAbandon, waitUntilLive, type UploadTicket } from './upload';
import { discardPost, runPendingPost, submitPost, type PostingState } from './uploadRun';
import { uploadTickets } from './uploadTickets';

export type { PostingState } from './uploadRun';

type PostingContextValue = {
  state: PostingState;
  /** Post is tapped: create the row (a response, or a video reply when replyTo is set), then upload. Resolves once the post is
   *  kept on the phone (with its row, or as Upload failed). Throws 'post_pending' while another recording of the member waits:
   *  it is never replaced. The upload URL comes from the member's ticket store (the one Post Review asked for). A recording is
   *  posted once: posting it again gets the first call's promise, unless that call threw. */
  post: (args: { recording: Recording; promptId: string; promptText: string; caption: string | null; tickets: TicketSource; replyTo?: { id: string; name: string }; draftFor?: string }) => Promise<void>;
  /** Retry (X-Upload-Failed). Offline, the post waits for the connection instead (A-Offline). Does nothing while a discard runs. */
  retry: () => Promise<void>;
  /** Give up on a failed post. Stops any upload first; the recording leaves the phone only once the server confirms nothing of
   *  it will post (discardPost). No board calls this yet (BETA-READINESS.md section 19). */
  discardFailed: () => Promise<void>;
  /** Sign out anyway (LV-SignOut): the same discard. If the server cannot confirm it yet, the recording stays on the phone under the
   *  member's own slot, and the discard is asked again when they next sign in. */
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

/** The signed-in member as the provider sees it: one upload or discard at a time, one Post at a time, stopped when they change. */
type Member = { id: string | null; abort: AbortController; exclusive: ReturnType<typeof createExclusive>; queue: ReturnType<typeof createQueue> };
const newMember = (id: string | null): Member => ({ id, abort: new AbortController(), exclusive: createExclusive(), queue: createQueue() });

export function PostingProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const ownerId = session?.user.id ?? null;
  // The state is kept with the member it belongs to; another member sees idle.
  const [owned, setOwned] = useState<{ owner: string | null; state: PostingState }>({ owner: null, state: IDLE });
  const state = owned.owner !== null && owned.owner === ownerId ? owned.state : IDLE;
  const member = useRef<Member>(newMember(null));
  const [oncePerRecording] = useState(createOncePerKey);

  /** The upload of a post. One at a time per member: a second call joins the first; during a discard it does nothing. */
  const run = useCallback((post: PendingPost) => {
    const m = member.current;
    const owner = m.id;
    if (owner === null || post.ownerId !== owner || post.discardRequested) return Promise.resolve();
    return m.exclusive.upload(
      (signal) =>
        runPendingPost(
          post,
          {
            persist: (p) => savePendingPostOrThrow(owner, p),
            show: (s) => setOwned({ owner, state: s }),
            mint: mintUpload,
            createRow,
            retryResponseUpload,
            put: putRecording,
            status: checkUploadStatus,
            waitUntilLive,
            deleteFiles: deleteRecordingFiles,
            fileExists: recordingOnPhone,
            track,
          },
          signal,
        ),
      m.abort.signal,
    );
  }, []);

  /**
   * Discards the member's waiting recording (discardPost), after stopping and waiting for any upload.
   * It works on the stored post, which the stopped upload may have moved on (a row it got back).
   * `resume`: carry on with a post Mux already has (not when the member is signing out).
   */
  const discard = useCallback((m: Member, resume: boolean) => {
    const owner = m.id;
    if (!owner) return Promise.resolve();
    return m.exclusive.discard(async () => {
      const stored = await loadPendingPostOrThrow(owner);
      if (!stored) {
        setOwned({ owner, state: IDLE });
        return;
      }
      const result = await discardPost(stored, {
        persist: (p) => savePendingPostOrThrow(owner, p),
        deleteFiles: deleteRecordingFiles,
        abandon: requestAbandon,
      });
      if (m.abort.signal.aborted) return;
      if (result.kind === 'gone') setOwned({ owner, state: IDLE });
      else if (result.kind === 'kept') setOwned({ owner, state: { kind: 'failed', post: result.post } });
      else {
        setOwned({ owner, state: { kind: 'processing', post: result.post } });
        // Mux already has it: it posts. Started once this discard has ended.
        if (resume) setTimeout(() => void run(result.post), 0);
      }
    });
  }, [run]);

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
      // A discard the server could not confirm before: shown as it was, and asked again (see below).
      if (resumed.discardRequested) setOwned({ owner: ownerId, state: { kind: 'failed', post: resumed } });
      else if (resumed.state === 'processing') void run(resumed);
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
          fileExists: recordingOnPhone,
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

  // A discard the server could not confirm is asked again: once when it is first shown (if online),
  // then each time the connection returns. Not on every state change, so an unverifiable answer
  // does not repeat in a loop.
  const discardPending = state.kind === 'failed' && !!state.post.discardRequested;
  useEffect(() => {
    if (!discardPending) return;
    const m = member.current;
    if (isOnline()) {
      const t = setTimeout(() => void discard(m, true), 0);
      return () => clearTimeout(t);
    }
    return subscribeOnline((online) => {
      if (online) void discard(m, true);
    });
  }, [discardPending, discard]);

  const retry = useCallback(async () => {
    if (state.kind !== 'failed' || state.post.discardRequested || !ownerId) return;
    const m = member.current;
    if (m.exclusive.busy() === 'discard') return;
    track('upload_retried', { reason: (state.post.failedReason ?? '').slice(0, 80) });
    if (!isOnline()) {
      // Offline: wait for the connection like a post tapped offline (A-Offline; Nemat, 9 Oct).
      const waiting: PendingPost = { ...state.post, state: 'waiting', failedReason: null };
      try {
        await savePendingPostOrThrow(ownerId, waiting);
      } catch {
        return;
      }
      setOwned({ owner: ownerId, state: { kind: 'waiting', post: waiting } });
      return;
    }
    await run(state.post);
  }, [state, run, ownerId]);

  const discardFailed = useCallback(async () => {
    if (state.kind !== 'failed') return;
    await discard(member.current, true);
  }, [state, discard]);

  const deleteUnposted = useCallback(async () => {
    await discard(member.current, false);
  }, [discard]);

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
