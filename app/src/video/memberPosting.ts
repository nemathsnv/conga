// One signed-in member's posting: Post, the upload (Retry, the connection returning), Discard, and
// asking again about a discard the server could not confirm. Pure: every effect is injected, so
// posting.tsx is a thin wrapper and the races can be tested (review of 14 Oct, C1 to C3).
//
// - Post runs on the member's queue, one at a time.
// - Discard stops a Post in flight (its late answer then writes nothing), waits on the queue for
//   it to settle, then stops any upload and waits for it (createExclusive) before discarding. So a
//   Post that completes late can never bring a discarded recording back.
// - A discard the server could not confirm stays on the phone in this member's slot and is asked
//   again: at launch, when the app returns to the foreground, when the connection returns, and on a
//   bounded schedule (30 s, 2 min, 10 min). Never sooner than the server's 2-minute hold after a
//   "busy" answer, never more than one request at a time, never after the member changes.
import type { EventName, EventProps } from '@/lib/analytics';
import { resumeState, type PendingPost } from './pendingPostState';
import { createExclusive, createQueue } from './postingFlow';
import type { Recording } from './types';
import type { AbandonAnswer, UploadTicket } from './upload';
import { discardPost, runPendingPost, submitPost, type Discarded, type PostingState, type RunDeps, type SubmitArgs } from './uploadRun';

/** Retries of an unconfirmed discard while online, after the first attempt. */
export const RECONCILE_DELAYS_MS = [30_000, 120_000, 600_000];
/** The server holds a submission for 2 minutes while it asks Mux; a little more before asking again. */
export const SERVER_HOLD_MS = 125_000;
/** Foreground and connection events never ask more often than this. */
export const RECONCILE_MIN_GAP_MS = 15_000;

export type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

export type MemberPostingDeps = {
  ownerId: string;
  /** The member's slot. Both must throw on a storage failure. */
  load: () => Promise<PendingPost | null>;
  save: (post: PendingPost | null) => Promise<void>;
  createRow: (post: PendingPost, t: UploadTicket, signal: AbortSignal) => Promise<{ id: string }>;
  upload: Omit<RunDeps, 'persist' | 'show' | 'createRow' | 'deleteFiles' | 'fileExists' | 'track'>;
  abandon: (submissionId: string) => Promise<AbandonAnswer>;
  deleteFiles: (recording: Recording) => void;
  fileExists: (recording: Recording) => boolean;
  online: () => boolean;
  track: (name: EventName, props: EventProps) => void;
  show: (state: PostingState) => void;
  timers?: Timers;
  now?: () => number;
};

export type ReconcileTrigger = 'launch' | 'foreground' | 'online' | 'timer';

export type MemberPosting = ReturnType<typeof createMemberPosting>;

export function createMemberPosting(deps: MemberPostingDeps) {
  const timers: Timers = deps.timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  const now = deps.now ?? Date.now;
  const stopped = new AbortController();
  const exclusive = createExclusive();
  const queue = createQueue();
  let postInFlight: AbortController | null = null;
  let discarding: Promise<Discarded | null> | null = null;
  // Reconciliation of an unconfirmed discard.
  let awaitingConfirmation = false;
  let timer: unknown = null;
  let attempts = 0;
  let notBefore = 0;

  const show = (s: PostingState) => {
    if (!stopped.signal.aborted) deps.show(s);
  };
  const linked = () => {
    const ctl = new AbortController();
    const onStop = () => ctl.abort();
    if (stopped.signal.aborted) ctl.abort();
    else stopped.signal.addEventListener('abort', onStop);
    return { ctl, unlink: () => stopped.signal.removeEventListener('abort', onStop) };
  };
  const clearTimer = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  /** The upload of a post: one at a time; joins a running one; nothing while a discard runs. */
  function run(post: PendingPost): Promise<void> {
    if (stopped.signal.aborted || post.ownerId !== deps.ownerId || post.discardRequested) return Promise.resolve();
    return exclusive.upload(
      (signal) =>
        runPendingPost(
          post,
          {
            ...deps.upload,
            persist: deps.save,
            show,
            createRow: (p, t) => deps.createRow(p, t, signal),
            deleteFiles: deps.deleteFiles,
            fileExists: deps.fileExists,
            track: deps.track,
          },
          signal,
        ),
      stopped.signal,
    );
  }

  /** Post is tapped (submitPost), on the member's queue. */
  function post(args: Omit<SubmitArgs, 'ownerId'>): Promise<void> {
    if (stopped.signal.aborted) return Promise.reject(new Error('not_signed_in'));
    return queue(async () => {
      const { ctl, unlink } = linked();
      postInFlight = ctl;
      try {
        const result = await submitPost(
          { ...args, ownerId: deps.ownerId },
          {
            stored: deps.load,
            store: deps.save,
            clear: () => deps.save(null),
            createRow: (p, t) => deps.createRow(p, t, ctl.signal),
            fileExists: deps.fileExists,
            online: deps.online,
            track: deps.track,
            aborted: () => ctl.signal.aborted,
          },
        );
        if (!result || ctl.signal.aborted) return;
        show(result.show);
        if (result.upload) void run(result.upload);
      } finally {
        if (postInFlight === ctl) postInFlight = null;
        unlink();
      }
    });
  }

  function afterDiscard(result: Discarded | null) {
    if (!result || result.kind !== 'kept') {
      awaitingConfirmation = false;
      attempts = 0;
      notBefore = 0;
      clearTimer();
      return;
    }
    awaitingConfirmation = true;
    const t = now();
    notBefore = t + (result.reason === 'busy' ? SERVER_HOLD_MS : RECONCILE_MIN_GAP_MS);
    clearTimer();
    if (attempts < RECONCILE_DELAYS_MS.length && !stopped.signal.aborted) {
      const delay = Math.max(RECONCILE_DELAYS_MS[attempts], notBefore - t);
      attempts += 1;
      timer = timers.set(() => {
        timer = null;
        void reconcile('timer');
      }, delay);
    }
  }

  /**
   * Discards the member's waiting recording. A Post in flight is stopped and waited for, then any
   * upload; one discard at a time (a second call joins it). `resume`: carry on with a post Mux
   * already has (not when the member is signing out).
   */
  function discard(opts: { resume: boolean }): Promise<Discarded | null> {
    if (discarding) return discarding;
    postInFlight?.abort();
    const work = queue(() =>
      exclusive.discard(async () => {
        if (stopped.signal.aborted) return null;
        const stored = await deps.load();
        if (!stored) {
          show({ kind: 'idle' });
          return null;
        }
        const result = await discardPost(stored, { persist: deps.save, deleteFiles: deps.deleteFiles, abandon: deps.abandon });
        if (stopped.signal.aborted) return result;
        if (result.kind === 'gone') show({ kind: 'idle' });
        else if (result.kind === 'kept') show({ kind: 'failed', post: result.post });
        else show({ kind: 'processing', post: result.post });
        return result;
      }),
    );
    const settled = work.then(
      (result) => {
        afterDiscard(result);
        if (result?.kind === 'posting' && opts.resume) timers.set(() => void run(result.post), 0);
        return result;
      },
      (e) => {
        afterDiscard(null);
        throw e;
      },
    );
    discarding = settled;
    const clear = () => {
      if (discarding === settled) discarding = null;
    };
    settled.then(clear, clear);
    return settled;
  }

  /** Sign out anyway: the same discard, but it never stops the sign-out. Anything it could not
   *  confirm (or a storage failure) stays in this member's own slot, for their next sign-in. */
  async function discardForSignOut(): Promise<void> {
    try {
      await discard({ resume: false });
    } catch {
      // The recording stays under this member's key; no other member can read it.
    }
  }

  /** Asks again about an unconfirmed discard. Bounded and spaced (see the top of the file). */
  function reconcile(trigger: ReconcileTrigger): Promise<Discarded | null> | null {
    if (stopped.signal.aborted || !awaitingConfirmation) return null;
    if (discarding) return discarding;
    const t = now();
    if (t < notBefore) {
      // Too soon (the server's hold, or a burst of events): a timer is already set, or set one.
      if (timer === null && trigger !== 'timer') {
        timer = timers.set(() => {
          timer = null;
          void reconcile('timer');
        }, notBefore - t);
      }
      return null;
    }
    return discard({ resume: true }).catch(() => null);
  }

  /** At sign-in: the member's own stored post, as it was left. */
  async function resumeOnLaunch(): Promise<void> {
    let stored: PendingPost | null;
    try {
      stored = await deps.load();
    } catch {
      return;
    }
    if (!stored || stopped.signal.aborted) return;
    const resumed = resumeState(stored);
    if (resumed.discardRequested) {
      show({ kind: 'failed', post: resumed });
      awaitingConfirmation = true;
      void reconcile('launch');
    } else if (resumed.state === 'processing') void run(resumed);
    else show({ kind: 'failed', post: resumed });
  }

  /** Retry (X-Upload-Failed). Offline: waits for the connection (A-Offline). Never during a discard. */
  async function retry(failed: PendingPost): Promise<void> {
    if (stopped.signal.aborted || failed.discardRequested || discarding || exclusive.busy() === 'discard') return;
    deps.track('upload_retried', { reason: (failed.failedReason ?? '').slice(0, 80) });
    if (!deps.online()) {
      const waiting: PendingPost = { ...failed, state: 'waiting', failedReason: null };
      try {
        await deps.save(waiting);
      } catch {
        return;
      }
      show({ kind: 'waiting', post: waiting });
      return;
    }
    await run(failed);
  }

  /** The member changed or signed out: everything stops, no timer fires, nothing more is shown. */
  function stop() {
    stopped.abort();
    postInFlight?.abort();
    clearTimer();
    awaitingConfirmation = false;
  }

  return {
    post,
    run,
    retry,
    discard,
    discardForSignOut,
    reconcile,
    resumeOnLaunch,
    stop,
    /** For tests and the provider: whether a discard waits for the server's confirmation. */
    awaitingConfirmation: () => awaitingConfirmation,
    stopped: stopped.signal,
  };
}
