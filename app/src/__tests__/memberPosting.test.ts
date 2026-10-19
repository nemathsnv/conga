// Review of 14 Oct, C1 to C3 (memberPosting.ts): a Post still in flight cannot bring a discarded
// recording back; Sign out anyway always signs out and keeps an unresolved recording under its
// own account; an unconfirmed discard is asked again on a bounded, hold-respecting schedule.
import { createMemberPosting, RECONCILE_DELAYS_MS, SERVER_HOLD_MS, type MemberPostingDeps, type Timers } from '@/video/memberPosting';
import { type PendingPost } from '@/video/pendingPostState';
import { createTicketStore } from '@/video/ticketStore';
import type { Recording } from '@/video/types';
import type { AbandonAnswer, UploadStatus, UploadTicket } from '@/video/upload';
import type { PostingState } from '@/video/uploadRun';

const flush = async (n = 6) => {
  for (let i = 0; i < n; i += 1) await new Promise<void>((r) => setImmediate(() => r()));
};
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const refused = (m: string) => Object.assign(new Error(m), { refused: true });
const noAnswer = () => Object.assign(new Error('TypeError: Network request failed'), { refused: false });
const recording = (id = 'rec-1'): Recording => ({ id, submissionId: `sub-${id}`, promptId: 'p1', segments: [{ uri: `file:///${id}.mp4`, facing: 'front', durationMs: 5000 }], durationMs: 5000, createdAt: 0 });
const ticket = (n: number): UploadTicket => ({ uploadId: `U${n}`, uploadUrl: `https://storage.example/${n}` });

/** The phone (per-account slots, files, clock, timers) and the server, shared by members. */
function world() {
  const slots = new Map<string, PendingPost>();
  const files = new Set<string>(['rec-1', 'rec-2']);
  const clock = { t: 0 };
  const pending: { at: number; fn: () => void; id: number }[] = [];
  let seq = 0;
  const timers: Timers = {
    set: (fn, ms) => {
      const id = ++seq;
      pending.push({ at: clock.t + ms, fn, id });
      return id;
    },
    clear: (h) => {
      const i = pending.findIndex((p) => p.id === h);
      if (i >= 0) pending.splice(i, 1);
    },
  };
  /** Moves the clock, firing timers that come due, in order. */
  async function advance(ms: number) {
    const end = clock.t + ms;
    for (;;) {
      pending.sort((a, b) => a.at - b.at);
      const next = pending[0];
      if (!next || next.at > end) break;
      pending.shift();
      clock.t = next.at;
      next.fn();
      await flush();
    }
    clock.t = end;
    await flush();
  }
  const storage = { failing: false };
  const server = {
    rows: new Map<string, string>(), // submission -> row
    abandonAnswers: [] as (AbandonAnswer | Error)[],
    abandonCalls: [] as string[],
  };
  return { slots, files, clock, timers, advance, pending, storage, server };
}
type World = ReturnType<typeof world>;

function memberOf(w: World, ownerId: string, over: Partial<MemberPostingDeps> = {}) {
  const shown: PostingState[] = [];
  let n = 0;
  const deps: MemberPostingDeps = {
    ownerId,
    load: jest.fn(async () => {
      if (w.storage.failing) throw new Error('storage_failed');
      return w.slots.get(ownerId) ?? null;
    }),
    save: jest.fn(async (p: PendingPost | null) => {
      if (w.storage.failing) throw new Error('storage_failed');
      if (p) w.slots.set(ownerId, p);
      else w.slots.delete(ownerId);
    }),
    createRow: jest.fn(async (p: PendingPost, t: UploadTicket) => {
      const id = `row-${t.uploadId}`;
      w.server.rows.set(p.recording.submissionId!, id);
      return { id };
    }),
    upload: {
      mint: jest.fn(async () => ticket(++n + 100)),
      retryResponseUpload: jest.fn(async () => undefined),
      put: jest.fn(async () => undefined),
      status: jest.fn(async (): Promise<UploadStatus> => ({ uploadStatus: 'waiting', assetStatus: null, playbackId: null, responseStatus: 'processing' })),
      waitUntilLive: jest.fn(async () => 'PB1'),
    },
    abandon: jest.fn(async (s: string) => {
      w.server.abandonCalls.push(s);
      const a = w.server.abandonAnswers.shift() ?? { outcome: 'abandoned', reason: 'cancelled' };
      if (a instanceof Error) throw a;
      return a;
    }),
    deleteFiles: jest.fn((r: Recording) => void w.files.delete(r.id)),
    fileExists: jest.fn((r: Recording) => w.files.has(r.id)),
    online: jest.fn(() => true),
    track: jest.fn(),
    show: jest.fn((s: PostingState) => void shown.push(s)),
    timers: w.timers,
    now: () => w.clock.t,
    ...over,
  };
  const m = createMemberPosting(deps);
  const store = createTicketStore(() => Promise.resolve(ticket(1)));
  const postArgs = (rec = recording()) => ({ recording: rec, promptId: 'p1', promptText: 'Prompt', caption: null, tickets: store.forOwner(ownerId) });
  return { m, deps, shown, postArgs };
}

describe('C1: a Post in flight never brings a discarded recording back', () => {
  test('slow Post, Sign out anyway, then the server\'s late success: nothing is re-stored or uploaded', async () => {
    const w = world();
    const answer = deferred<{ id: string }>();
    const a = memberOf(w, 'A', {
      createRow: jest.fn(async (p: PendingPost, t: UploadTicket) => {
        w.server.rows.set(p.recording.submissionId!, `row-${t.uploadId}`); // the server commits
        return answer.promise; // the answer is slow (it ignores the abort, like a reply already on its way)
      }),
    });
    const posting = a.m.post(a.postArgs());
    await flush();
    expect(w.slots.get('A')).toMatchObject({ responseId: null, uploadId: 'U1' }); // stored before the request
    const signOut = a.m.discardForSignOut();
    await flush();
    expect(a.deps.abandon).not.toHaveBeenCalled(); // waits for the Post first
    answer.resolve({ id: 'row-U1' }); // the late answer
    await posting;
    await signOut;
    expect(a.deps.abandon).toHaveBeenCalledWith('sub-rec-1');
    expect(w.slots.has('A')).toBe(false);
    expect(w.files.has('rec-1')).toBe(false);
    expect(a.deps.upload.put).not.toHaveBeenCalled();
    expect(a.shown[a.shown.length - 1]).toEqual({ kind: 'idle' });
  });

  test('the Post\'s request is aborted when Discard starts: the discard does not wait for the network', async () => {
    const w = world();
    const a = memberOf(w, 'A', {
      createRow: jest.fn((_p: PendingPost, _t: UploadTicket, signal: AbortSignal) => new Promise<{ id: string }>((_r, reject) => signal.addEventListener('abort', () => reject(noAnswer())))),
    });
    const posting = a.m.post(a.postArgs());
    await flush();
    await a.m.discardForSignOut();
    await posting;
    expect(w.slots.has('A')).toBe(false);
    expect(a.deps.abandon).toHaveBeenCalledTimes(1);
  });

  test('a late refusal of a stopped Post does not clear the slot the discard is using', async () => {
    const w = world();
    const answer = deferred<{ id: string }>();
    w.server.abandonAnswers.push(noAnswer()); // the discard cannot be confirmed: kept
    const a = memberOf(w, 'A', { createRow: jest.fn(() => answer.promise) });
    const posting = a.m.post(a.postArgs()).catch((e) => e);
    await flush();
    const discarding = a.m.discard({ resume: true });
    answer.reject(refused('submission_closed'));
    await posting;
    await discarding;
    expect(w.slots.get('A')).toMatchObject({ discardRequested: true }); // still there, for reconciliation
    expect(w.files.has('rec-1')).toBe(true);
  });

  test('a Post that completed and is uploading: Discard stops the upload, then the server confirms; no pending post is left', async () => {
    const w = world();
    const put = deferred<void>();
    const a = memberOf(w, 'A');
    (a.deps.upload.put as jest.Mock).mockImplementation((_r: Recording, _u: string, _p: unknown, signal: AbortSignal) => {
      signal.addEventListener('abort', () => put.reject(new Error('AbortError')));
      return put.promise;
    });
    await a.m.post(a.postArgs());
    await flush();
    expect(a.deps.upload.put).toHaveBeenCalled();
    await a.m.discard({ resume: true });
    expect(w.slots.has('A')).toBe(false);
    expect(w.files.has('rec-1')).toBe(false);
  });

  test('Retry and Discard stay exclusive: Retry during a discard does nothing', async () => {
    const w = world();
    const slow = deferred<AbandonAnswer>();
    const a = memberOf(w, 'A', { createRow: jest.fn(() => Promise.reject(noAnswer())), abandon: jest.fn(() => slow.promise) });
    await a.m.post(a.postArgs()); // the answer never came: Upload failed, kept
    const failed = w.slots.get('A')!;
    const discarding = a.m.discard({ resume: true });
    await flush();
    await a.m.retry(failed);
    expect(a.deps.createRow).toHaveBeenCalledTimes(1); // no replay
    expect(a.deps.upload.put).not.toHaveBeenCalled();
    slow.resolve({ outcome: 'abandoned' });
    await discarding;
    expect(w.slots.has('A')).toBe(false);
  });
});

describe('C2: Sign out anyway always signs out; an unresolved recording stays under its own account', () => {
  async function failedPost(w: World, owner = 'A') {
    const a = memberOf(w, owner, { createRow: jest.fn(() => Promise.reject(noAnswer())) });
    await a.m.post(a.postArgs());
    return a;
  }

  test('a storage failure: no throw, nothing deleted, the slot untouched, no other account can read it', async () => {
    const w = world();
    const a = await failedPost(w);
    const before = w.slots.get('A');
    w.storage.failing = true;
    await expect(a.m.discardForSignOut()).resolves.toBeUndefined();
    expect(a.deps.abandon).not.toHaveBeenCalled();
    expect(w.files.has('rec-1')).toBe(true);
    w.storage.failing = false;
    expect(w.slots.get('A')).toEqual(before);
    a.m.stop();
    const b = memberOf(w, 'B');
    await b.m.resumeOnLaunch();
    expect(b.shown).toEqual([]);
    await expect(b.deps.load()).resolves.toBeNull();
  });

  test('offline: kept with the discard requested; signing out stops every retry; another account sees nothing', async () => {
    const w = world();
    const a = await failedPost(w);
    w.server.abandonAnswers.push(noAnswer());
    await a.m.discardForSignOut();
    expect(w.slots.get('A')).toMatchObject({ discardRequested: true });
    a.m.stop(); // signed out
    const calls = (a.deps.abandon as jest.Mock).mock.calls.length;
    await w.advance(60 * 60_000);
    expect((a.deps.abandon as jest.Mock).mock.calls.length).toBe(calls);
    const b = memberOf(w, 'B');
    await b.m.resumeOnLaunch();
    expect(b.deps.abandon).not.toHaveBeenCalled();
    expect(b.shown).toEqual([]);
  });

  test('signing back in as the same account: the discard is asked again and completes', async () => {
    const w = world();
    const a = await failedPost(w);
    w.server.abandonAnswers.push(noAnswer());
    await a.m.discardForSignOut();
    a.m.stop();
    const again = memberOf(w, 'A');
    await again.m.resumeOnLaunch();
    await flush();
    expect(again.deps.abandon).toHaveBeenCalledWith('sub-rec-1');
    expect(w.slots.has('A')).toBe(false);
    expect(w.files.has('rec-1')).toBe(false);
  });
});

describe('C3: an unconfirmed discard is asked again, bounded, spaced, never twice at once', () => {
  async function unconfirmed(w: World, answers: (AbandonAnswer | Error)[]) {
    const a = memberOf(w, 'A', { createRow: jest.fn(() => Promise.reject(noAnswer())) });
    await a.m.post(a.postArgs());
    w.server.abandonAnswers.push(...answers);
    await a.m.discard({ resume: true });
    return a;
  }
  const calls = (a: { deps: MemberPostingDeps }) => (a.deps.abandon as jest.Mock).mock.calls.length;

  test('timeouts: retried at 30 s, 2 min and 10 min, then no more by timer', async () => {
    const w = world();
    const a = await unconfirmed(w, [noAnswer(), noAnswer(), noAnswer(), noAnswer(), noAnswer()]);
    expect(calls(a)).toBe(1);
    await w.advance(RECONCILE_DELAYS_MS[0] - 1);
    expect(calls(a)).toBe(1);
    await w.advance(1);
    expect(calls(a)).toBe(2);
    await w.advance(RECONCILE_DELAYS_MS[1]);
    expect(calls(a)).toBe(3);
    await w.advance(RECONCILE_DELAYS_MS[2]);
    expect(calls(a)).toBe(4);
    await w.advance(24 * 60 * 60_000);
    expect(calls(a)).toBe(4);
    expect(a.m.awaitingConfirmation()).toBe(true);
  });

  test('Mux reports the upload errored (kept unverified until its URL has long expired): the recording stays through every timer, and the first foreground after the bound settles it', async () => {
    // abandon-submission keeps an errored upload with no asset "unverified" until 10 min after the
    // URL's 60-min life (decideAbandon), then retires it. The phone must hold the recording all
    // that time, and an ordinary event after it must be enough.
    const w = world();
    const unverified: AbandonAnswer = { outcome: 'kept', reason: 'unverified', responseId: 'row-U1' };
    const a = await unconfirmed(w, [unverified, unverified, unverified, unverified, unverified, { outcome: 'abandoned', reason: 'cancelled' }]);
    await w.advance(RECONCILE_DELAYS_MS.reduce((s, d) => s + d, 0) + 20_000);
    expect(calls(a)).toBe(4);
    expect(w.files.has('rec-1')).toBe(true);
    expect(w.slots.get('A')).toMatchObject({ discardRequested: true });
    expect(a.deps.deleteFiles).not.toHaveBeenCalled();
    await a.m.reconcile('foreground'); // 13 min in: still before the bound
    expect(calls(a)).toBe(5);
    expect(w.files.has('rec-1')).toBe(true);
    await w.advance(60 * 60_000);
    await a.m.reconcile('foreground'); // past the bound: the server retires it
    expect(calls(a)).toBe(6);
    expect(w.files.has('rec-1')).toBe(false);
    expect(w.slots.has('A')).toBe(false);
    expect(a.m.awaitingConfirmation()).toBe(false);
  });

  test('server busy (its 2-minute hold): never asked again before the hold ends', async () => {
    const w = world();
    const a = await unconfirmed(w, [{ outcome: 'kept', reason: 'busy' }]);
    await w.advance(RECONCILE_DELAYS_MS[0]); // 30 s: too soon for the hold
    expect(calls(a)).toBe(1);
    await a.m.reconcile('foreground'); // nor on coming back to the foreground
    expect(calls(a)).toBe(1);
    await w.advance(SERVER_HOLD_MS - RECONCILE_DELAYS_MS[0]);
    expect(calls(a)).toBe(2);
    expect(w.slots.has('A')).toBe(false); // the default answer: abandoned
  });

  test('offline, then online: one request per return of the connection, not a burst', async () => {
    const w = world();
    const a = await unconfirmed(w, [noAnswer(), noAnswer(), noAnswer()]);
    await w.advance(20_000);
    await a.m.reconcile('online');
    await a.m.reconcile('online');
    await a.m.reconcile('foreground');
    expect(calls(a)).toBe(2); // the first event only; the next ones fall in the 15 s gap
  });

  test('a timer and a foreground event together, while a request is in flight: one request', async () => {
    const w = world();
    const slow = deferred<AbandonAnswer>();
    const a = await unconfirmed(w, [noAnswer()]);
    (a.deps.abandon as jest.Mock).mockImplementation(() => slow.promise);
    await w.advance(RECONCILE_DELAYS_MS[0]); // the timer fires and its request hangs
    const again = a.m.reconcile('foreground');
    expect(calls(a)).toBe(2);
    slow.resolve({ outcome: 'abandoned' });
    await again;
    expect(calls(a)).toBe(2);
    expect(w.slots.has('A')).toBe(false);
  });

  test('eventual confirmation clears the schedule; nothing more is asked', async () => {
    const w = world();
    const a = await unconfirmed(w, [noAnswer(), { outcome: 'kept', reason: 'unverified' }, { outcome: 'abandoned' }]);
    await w.advance(RECONCILE_DELAYS_MS[0]);
    await w.advance(RECONCILE_DELAYS_MS[1]);
    expect(calls(a)).toBe(3);
    expect(w.slots.has('A')).toBe(false);
    expect(a.m.awaitingConfirmation()).toBe(false);
    expect(w.pending).toEqual([]);
    await w.advance(60 * 60_000);
    expect(calls(a)).toBe(3);
  });

  test('Mux already has it (at_mux): the schedule stops and the post carries on as processing', async () => {
    const w = world();
    const a = await unconfirmed(w, [noAnswer(), { outcome: 'kept', reason: 'at_mux', responseId: 'row-9' }]);
    await w.advance(RECONCILE_DELAYS_MS[0]);
    expect(a.m.awaitingConfirmation()).toBe(false);
    expect(a.shown.some((st) => st.kind === 'processing' && st.post.responseId === 'row-9')).toBe(true);
    expect(a.deps.upload.put).not.toHaveBeenCalled(); // nothing sent: only waited on
    expect(a.deps.upload.waitUntilLive).toHaveBeenCalledWith('U1', expect.anything());
    expect(a.shown[a.shown.length - 1]).toMatchObject({ kind: 'live' });
    expect(w.pending).toEqual([]);
  });

  test('the account changes: the schedule stops, nothing fires, nothing is shown', async () => {
    const w = world();
    const a = await unconfirmed(w, [noAnswer()]);
    const shownBefore = a.shown.length;
    a.m.stop();
    expect(w.pending).toEqual([]);
    await w.advance(60 * 60_000);
    await a.m.reconcile('foreground');
    expect(calls(a)).toBe(1);
    expect(a.shown.length).toBe(shownBefore);
  });

  test('app restart: an unconfirmed discard on the phone is shown and asked again at launch', async () => {
    const w = world();
    const a = await unconfirmed(w, [noAnswer()]);
    a.m.stop(); // the app closes
    const relaunched = memberOf(w, 'A');
    await relaunched.m.resumeOnLaunch();
    await flush();
    expect(relaunched.shown[0]).toMatchObject({ kind: 'failed', post: { discardRequested: true } });
    expect(relaunched.deps.abandon).toHaveBeenCalledTimes(1);
    expect(w.slots.has('A')).toBe(false);
  });

  test('Retry on a post whose discard waits for confirmation does nothing', async () => {
    const w = world();
    const a = await unconfirmed(w, [noAnswer()]);
    (a.deps.upload.put as jest.Mock).mockClear();
    await a.m.retry(w.slots.get('A')!);
    expect(a.deps.upload.put).not.toHaveBeenCalled();
    expect(a.deps.track).not.toHaveBeenCalledWith('upload_retried', expect.anything());
  });
});

describe('Restore at launch: a recording whose file is gone shows P3 at once (review N2)', () => {
  async function storedFailedPost(w: World) {
    const a = memberOf(w, 'A', { createRow: jest.fn(() => Promise.reject(noAnswer())) });
    await a.m.post(a.postArgs()); // the answer is lost: an Upload failed post with its URL
    a.m.stop(); // the app closes
    return w.slots.get('A')!;
  }

  test('file missing: restored as recording_missing, stored so, nothing asked or sent', async () => {
    const w = world();
    const before = await storedFailedPost(w);
    expect(before.failedReason).not.toBe('recording_missing');
    w.files.delete('rec-1');
    const relaunched = memberOf(w, 'A');
    await relaunched.m.resumeOnLaunch();
    await flush();
    expect(relaunched.shown).toEqual([{ kind: 'failed', post: expect.objectContaining({ state: 'failed', failedReason: 'recording_missing', recording: before.recording }) }]);
    expect(w.slots.get('A')).toMatchObject({ failedReason: 'recording_missing', uploadId: before.uploadId });
    expect(relaunched.deps.abandon).not.toHaveBeenCalled();
    expect(relaunched.deps.upload.status).not.toHaveBeenCalled();
    expect(relaunched.deps.upload.put).not.toHaveBeenCalled();
    expect(relaunched.deps.upload.mint).not.toHaveBeenCalled();
  });

  test('file present: restored exactly as stored (Retry offered as before)', async () => {
    const w = world();
    const before = await storedFailedPost(w);
    const relaunched = memberOf(w, 'A');
    await relaunched.m.resumeOnLaunch();
    await flush();
    expect(relaunched.shown).toEqual([{ kind: 'failed', post: { ...before, state: 'failed', failedReason: before.failedReason } }]);
    expect(w.slots.get('A')).toEqual(before);
    expect(relaunched.deps.save).not.toHaveBeenCalled();
  });
});

// Founder iPhone test (19 Oct): Respond → Post did nothing (post_response refused with
// already_responded and the refusal was only logged), while a video reply posted.
describe('Post refused by the server, from a response and from a video reply', () => {
  test.each([
    { entry: 'response', extra: {}, reason: 'already_responded' },
    { entry: 'video reply', extra: { replyTo: { id: 'video-9', name: 'Sofia' } }, reason: 'video_not_found' },
  ])('$entry refused with $reason: Post resolves, the banner shows it failed, the recording stays, Discard removes it without the server', async ({ extra, reason }) => {
    const w = world();
    const a = memberOf(w, 'A', { createRow: jest.fn(async () => Promise.reject(refused(reason))) });
    await expect(a.m.post({ ...a.postArgs(), ...extra })).resolves.toBeUndefined();
    expect(a.shown[a.shown.length - 1]).toMatchObject({ kind: 'failed', post: { failedReason: reason, responseId: null } });
    expect(w.files.has('rec-1')).toBe(true);
    expect(a.deps.upload.put).not.toHaveBeenCalled();
    await a.m.discard({ resume: true });
    expect(a.deps.abandon).not.toHaveBeenCalled();
    expect(w.files.has('rec-1')).toBe(false);
    expect(w.slots.get('A')).toBeUndefined();
    expect(a.shown[a.shown.length - 1]).toEqual({ kind: 'idle' });
  });

  test('a restriction is still thrown for Post Review (A-Restricted), with nothing kept', async () => {
    const w = world();
    const a = memberOf(w, 'A', { createRow: jest.fn(async () => Promise.reject(refused('posting_paused'))) });
    await expect(a.m.post(a.postArgs())).rejects.toThrow('posting_paused');
    expect(w.slots.get('A')).toBeUndefined();
  });
});
