// Posting controller: runs the foreground upload of a posted response, keeps the recording
// on the phone until it is live, and exposes the state the Home banners draw
// (PR-Posting, X-Upload-Failed, and A-Offline while a post waits for the connection). Survives app
// restarts through pendingPost storage; a post waiting offline when the app closes becomes Retry.
// A post belongs to the member who posted it: when the signed-in member changes, their upload is
// stopped and their post is neither shown nor retried for anyone else. Retry and Discard never
// run together (createExclusive), and a recording is deleted only once the server confirms
// nothing of it will post (discardPost).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { track } from '@/lib/analytics';
import { isOnline, subscribeOnline } from '@/lib/connectivity';
import { postDraft, postReply, postResponse, retryResponseUpload } from '@/lib/content';
import { markResponded } from '@/lib/responded';
import { useSession } from '@/lib/session';
import { loadPendingPostOrThrow, savePendingPostOrThrow } from './pendingPost';
import type { PendingPost } from './pendingPostState';
import { createMemberPosting, type MemberPosting } from './memberPosting';
import { createOncePerKey } from './postingFlow';
import type { TicketSource } from './ticketStore';
import type { Recording } from './types';
import { checkUploadStatus, deleteRecordingFiles, mintUpload, putRecording, recordingOnPhone, requestAbandon, waitUntilLive, type UploadTicket } from './upload';
import type { PostingState } from './uploadRun';
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
function createRow(post: Pick<PendingPost, 'draftFor' | 'replyToId' | 'promptId' | 'caption' | 'recording'>, t: UploadTicket, signal?: AbortSignal): Promise<{ id: string }> {
  const { durationMs, submissionId } = post.recording;
  if (post.draftFor) return postDraft(post.draftFor, t.uploadId, post.caption, durationMs, submissionId, signal);
  if (post.replyToId) return postReply(post.replyToId, t.uploadId, post.caption, durationMs, submissionId, signal);
  return postResponse(post.promptId, t.uploadId, post.caption, durationMs, submissionId, signal);
}

/** What a posting state says about the member's one response to its prompt (lib/responded.ts). */
function noteResponded(s: PostingState): void {
  if (s.kind !== 'failed' && s.kind !== 'live') return;
  if (s.post.kind !== 'response' || s.post.replyToId || s.post.draftFor) return;
  if (s.kind === 'live' || (s.post.failedReason ?? '').includes('already_responded')) markResponded(s.post.promptId);
}

function memberFor(ownerId: string, show: (s: PostingState) => void): MemberPosting {
  return createMemberPosting({
    ownerId,
    load: () => loadPendingPostOrThrow(ownerId),
    save: (p) => savePendingPostOrThrow(ownerId, p),
    createRow,
    upload: { mint: mintUpload, retryResponseUpload, put: putRecording, status: checkUploadStatus, waitUntilLive },
    abandon: requestAbandon,
    deleteFiles: deleteRecordingFiles,
    fileExists: recordingOnPhone,
    online: isOnline,
    track,
    show,
  });
}

export function PostingProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const ownerId = session?.user.id ?? null;
  // The state is kept with the member it belongs to; another member sees idle.
  const [owned, setOwned] = useState<{ owner: string | null; state: PostingState }>({ owner: null, state: IDLE });
  const state = owned.owner !== null && owned.owner === ownerId ? owned.state : IDLE;
  const member = useRef<{ id: string | null; posting: MemberPosting | null }>({ id: null, posting: null });
  const [oncePerRecording] = useState(createOncePerKey);

  // The signed-in member changes (sign-in, sign-out, another account): the previous member's
  // posting stops (upload, Post, timers), then this member's own stored post is offered. A
  // discard the server could not confirm is asked again at launch, when the app returns to the
  // foreground and when the connection returns (and on its own schedule, memberPosting.ts).
  useEffect(() => {
    if (member.current.id === ownerId) return;
    member.current.posting?.stop();
    uploadTickets.reset();
    if (!ownerId) {
      member.current = { id: null, posting: null };
      return;
    }
    const posting = memberFor(ownerId, (s) => {
      noteResponded(s);
      setOwned({ owner: ownerId, state: s });
    });
    member.current = { id: ownerId, posting };
    void posting.resumeOnLaunch();
  }, [ownerId]);

  // The connection returning and the app coming back to the foreground: ask again about an
  // unconfirmed discard (memberPosting spaces and bounds these). Kept apart from the effect above
  // so a remount subscribes again.
  useEffect(() => {
    const posting = member.current.posting;
    if (!posting || member.current.id !== ownerId) return;
    const offOnline = subscribeOnline((online) => {
      if (online) void posting.reconcile('online');
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void posting.reconcile('foreground');
    });
    return () => {
      offOnline();
      appState.remove();
    };
  }, [ownerId]);

  const post = useCallback<PostingContextValue['post']>((args) => oncePerRecording(args.recording.id, () => {
    const posting = member.current.posting;
    if (!posting) return Promise.reject(new Error('not_signed_in'));
    return posting.post(args);
  }), [oncePerRecording]);

  // The connection comes back while a post waits: start it by itself.
  useEffect(() => {
    if (state.kind !== 'waiting') return;
    const waiting = state.post;
    const posting = member.current.posting;
    if (!posting) return;
    if (isOnline()) {
      // Already back (or the check raced): start on the next tick, outside this render.
      const t = setTimeout(() => void posting.run(waiting), 0);
      return () => clearTimeout(t);
    }
    return subscribeOnline((online) => {
      if (online) void posting.run(waiting);
    });
  }, [state]);

  const retry = useCallback(async () => {
    if (state.kind !== 'failed') return;
    await member.current.posting?.retry(state.post);
  }, [state]);

  const discardFailed = useCallback(async () => {
    if (state.kind !== 'failed') return;
    await member.current.posting?.discard({ resume: true });
  }, [state]);

  const deleteUnposted = useCallback(async () => {
    await member.current.posting?.discardForSignOut();
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
