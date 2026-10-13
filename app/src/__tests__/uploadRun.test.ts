// One posted recording from its row to live, every effect mocked (uploadRun.ts). Review of fee64ec
// (13 Oct): a URL's real age, and a member who signs out or changes mid-upload.
import { newPendingPost, pendingPostFor, resumeState, UPLOAD_URL_TTL_MS, uploadUrlUsable, type PendingPost } from '@/video/pendingPostState';
import { createGate } from '@/video/postingFlow';
import { createTicketStore } from '@/video/ticketStore';
import type { Recording } from '@/video/types';
import type { UploadStatus, UploadTicket } from '@/video/upload';
import { runPendingPost, submitPost, type PostingState, type RunDeps, type SubmitDeps } from '@/video/uploadRun';

/** What lib/content throws: refused (the server answered with an error code) or not (no answer). */
const serverError = (message: string, refused: boolean) => Object.assign(new Error(message), { refused });

const MIN = 60_000;
const recording = (id = 'rec-1'): Recording => ({ id, submissionId: `sub-${id}`, promptId: 'p1', segments: [{ uri: `file:///${id}.mp4`, facing: 'front', durationMs: 5000 }], durationMs: 5000, createdAt: 0 });
const ticket = (n: number): UploadTicket => ({ uploadId: `U${n}`, uploadUrl: `https://storage.example/${n}` });
const flush = () => new Promise<void>((r) => setImmediate(() => r()));

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

/** mux-upload-status's answer. */
const muxSays = (uploadStatus: string, assetStatus: string | null = null, responseStatus: UploadStatus['responseStatus'] = 'processing'): UploadStatus => ({
  uploadStatus,
  assetStatus,
  playbackId: assetStatus === 'ready' ? 'PB1' : null,
  responseStatus,
});

/** A post that got its row and URL at Post, `mintedAt` being when the URL was asked for. */
function posted(over: Partial<PendingPost> = {}, mintedAt = 0): PendingPost {
  return { ...newPendingPost({ ownerId: 'A', recording: recording(), promptId: 'p1', promptText: 'Prompt', caption: null }, { responseId: 'row-1', uploadId: 'U1', uploadUrl: 'https://storage.example/1', mintedAt }, 'uploading'), ...over };
}

/** Every effect mocked; `stored` is the last post written, `shown` every banner state. */
function harness(over: Partial<RunDeps> = {}, clock = { t: 0 }) {
  const stored: (PendingPost | null)[] = [];
  const shown: PostingState[] = [];
  let n = 1;
  const deps: RunDeps = {
    persist: jest.fn(async (p: PendingPost | null) => {
      stored.push(p);
    }),
    show: jest.fn((s: PostingState) => {
      shown.push(s);
    }),
    mint: jest.fn(() => Promise.resolve(ticket(++n))),
    createRow: jest.fn((_p: PendingPost, t: UploadTicket) => Promise.resolve({ id: `row-${t.uploadId}` })),
    retryResponseUpload: jest.fn(() => Promise.resolve()),
    put: jest.fn(() => Promise.resolve()),
    status: jest.fn(() => Promise.resolve(muxSays('waiting'))),
    waitUntilLive: jest.fn(() => Promise.resolve('PB1')),
    deleteFiles: jest.fn(),
    track: jest.fn(),
    now: () => clock.t,
    ...over,
  };
  return { deps, stored, shown, last: () => stored[stored.length - 1] };
}

describe('a URL lasts from when it was asked for, not from Post', () => {
  test('a URL Post Review held for 45 minutes is used by Retry for only 10 more', () => {
    const post = posted({}, 0); // asked for at 0; Post tapped at 45 minutes
    expect(post.uploadUrlExpiresAt).toBe(UPLOAD_URL_TTL_MS);
    expect(uploadUrlUsable(post, 45 * MIN)).toBe(true);
    expect(uploadUrlUsable(post, 54 * MIN + 1)).toBe(false);
  });

  test('Retry 20 minutes after such a Post mints a fresh URL instead of PUTting to a dead one', async () => {
    const clock = { t: 65 * MIN };
    const { deps } = harness({}, clock);
    await runPendingPost(posted({ state: 'failed', attempts: 1 }, 0), deps, new AbortController().signal);
    expect(deps.mint).toHaveBeenCalledTimes(1);
    expect(deps.retryResponseUpload).toHaveBeenCalledWith('row-1', 'U2');
    expect(deps.put).toHaveBeenCalledWith(expect.anything(), 'https://storage.example/2', expect.any(Function), expect.anything());
  });

  test('a fresh URL minted on Retry lasts from the request, not the answer', async () => {
    const clock = { t: 0 };
    const slow = deferred<UploadTicket>();
    const { deps, stored } = harness({ mint: jest.fn(() => slow.promise) }, clock);
    const run = runPendingPost(posted({ uploadUrlExpiresAt: 0 }), deps, new AbortController().signal);
    await flush();
    expect(deps.mint).toHaveBeenCalledTimes(1); // asked at 0
    clock.t = 2 * MIN; // the answer takes 2 minutes
    slow.resolve(ticket(2));
    await run;
    expect(stored.find((p) => p?.uploadId === 'U2')?.uploadUrlExpiresAt).toBe(UPLOAD_URL_TTL_MS);
  });

  test('a post with no row saves a URL that lasts from the request', async () => {
    const clock = { t: 10 * MIN };
    const slow = deferred<UploadTicket>();
    const { deps, stored } = harness({ mint: jest.fn(() => slow.promise) }, clock);
    const noRow = newPendingPost({ ownerId: 'A', recording: recording(), promptId: 'p1', promptText: 'Prompt', caption: null }, null, 'failed', 'mint_failed');
    const run = runPendingPost(noRow, deps, new AbortController().signal);
    clock.t = 11 * MIN;
    slow.resolve(ticket(2));
    await run;
    expect(stored[0]).toMatchObject({ responseId: null, uploadId: 'U2', uploadUrlExpiresAt: 10 * MIN + UPLOAD_URL_TTL_MS });
  });
});

describe('a post belongs to the member who posted it', () => {
  test('only its member gets it back: not another member, not someone signed out', () => {
    const post = posted();
    expect(pendingPostFor(post, 'A')).toBe(post);
    expect(pendingPostFor(post, 'B')).toBeNull();
    expect(pendingPostFor(post, null)).toBeNull();
    expect(pendingPostFor(null, 'A')).toBeNull();
  });

  test('a post stored before posts had an owner belongs to nobody (Retry would post it as whoever is signed in)', () => {
    const { ownerId: _dropped, ...legacy } = posted();
    expect(pendingPostFor(legacy as unknown as PendingPost, 'A')).toBeNull();
  });

});

describe('signing out (or another member signing in) mid-upload', () => {
  test('during the transfer: it is cancelled, and nothing more is stored or shown', async () => {
    const abort = new AbortController();
    const put = deferred<void>();
    const { deps, stored, shown } = harness({
      put: jest.fn((_r, _u, _p, signal: AbortSignal) => {
        signal.addEventListener('abort', () => put.reject(new Error('AbortError')));
        return put.promise;
      }),
    });
    const run = runPendingPost(posted(), deps, abort.signal);
    await flush();
    const writes = stored.length;
    const banners = shown.length;
    abort.abort();
    await run;
    expect(stored.length).toBe(writes);
    expect(shown.length).toBe(banners);
    expect(deps.track).not.toHaveBeenCalledWith('upload_failed', expect.anything());
  });

  test('while waiting for processing: the post is not marked live or failed for the next member', async () => {
    const abort = new AbortController();
    const live = deferred<string>();
    const { deps, stored, shown } = harness({ waitUntilLive: jest.fn(() => live.promise) });
    const run = runPendingPost(posted(), deps, abort.signal);
    await flush();
    const writes = stored.length;
    abort.abort();
    live.resolve('PB1');
    await run;
    expect(stored.length).toBe(writes);
    expect(shown.some((s) => s.kind === 'live')).toBe(false);
    expect(deps.deleteFiles).not.toHaveBeenCalled();
  });

  test('while a post with no row gets its URL: no row is created and nothing is stored', async () => {
    const abort = new AbortController();
    const slow = deferred<UploadTicket>();
    const { deps, stored } = harness({ mint: jest.fn(() => slow.promise) });
    const noRow = newPendingPost({ ownerId: 'A', recording: recording(), promptId: 'p1', promptText: 'Prompt', caption: null }, null, 'failed', 'offline');
    const run = runPendingPost(noRow, deps, abort.signal);
    abort.abort();
    slow.resolve(ticket(2));
    await run;
    expect(stored).toEqual([]);
    expect(deps.put).not.toHaveBeenCalled();
  });
});

describe('failures keep what was obtained', () => {
  test('a transfer that fails leaves Upload failed with the same row and URL, for Retry', async () => {
    const { deps, last, shown } = harness({ put: jest.fn(() => Promise.reject(new Error('Network connection was lost'))) });
    await runPendingPost(posted(), deps, new AbortController().signal);
    expect(last()).toMatchObject({ state: 'failed', responseId: 'row-1', uploadId: 'U1', attempts: 1, failedReason: 'Network connection was lost' });
    expect(shown[shown.length - 1].kind).toBe('failed');
    expect(deps.mint).not.toHaveBeenCalled();
  });

  test('a post that goes live is cleared and its recording deleted from the phone', async () => {
    const { deps, last, shown } = harness();
    await runPendingPost(posted(), deps, new AbortController().signal);
    expect(last()).toBeNull();
    expect(deps.deleteFiles).toHaveBeenCalledTimes(1);
    expect(shown[shown.length - 1]).toMatchObject({ kind: 'live', playbackId: 'PB1' });
  });
});

// Foreground uploads (SPEC.md Sections 2, 19, 22). With the foreground session a transfer stops
// with the app, so these are the cases left: it stops part-way, it finishes with the answer lost,
// or the app is closed. The setting alone does not stop a second send of the same recording, so
// Mux is asked before any resend.
describe('foreground uploads: interruption, backgrounding, closing, reopening and Retry', () => {
  const sent = { state: 'failed' as const, attempts: 1, failedReason: 'interrupted' };

  test('a first send asks Mux nothing', async () => {
    const { deps } = harness();
    await runPendingPost(posted(), deps, new AbortController().signal);
    expect(deps.status).not.toHaveBeenCalled();
    expect(deps.put).toHaveBeenCalledTimes(1);
  });

  test('interrupted part-way (sent to the background, connection lost): Retry asks Mux, which still waits, and sends again to the same URL', async () => {
    const { deps, last } = harness({ put: jest.fn().mockRejectedValueOnce(new Error('The network connection was lost.')).mockResolvedValue(undefined) });
    await runPendingPost(posted(), deps, new AbortController().signal);
    expect(last()).toMatchObject({ state: 'failed', attempts: 1, uploadId: 'U1' });
    await runPendingPost(last() as PendingPost, deps, new AbortController().signal); // Retry
    expect(deps.status).toHaveBeenCalledWith('U1');
    expect(deps.put).toHaveBeenCalledTimes(2);
    expect((deps.put as jest.Mock).mock.calls[1][1]).toBe('https://storage.example/1');
    expect(deps.mint).not.toHaveBeenCalled();
    expect(last()).toBeNull();
  });

  test('finished with the answer lost (suspended at the end): Retry finds Mux has it and does not send it again', async () => {
    const { deps, last } = harness({ status: jest.fn(() => Promise.resolve(muxSays('asset_created', 'preparing'))) });
    await runPendingPost(posted(sent), deps, new AbortController().signal);
    expect(deps.put).not.toHaveBeenCalled();
    expect(deps.mint).not.toHaveBeenCalled();
    expect(deps.waitUntilLive).toHaveBeenCalledWith('U1', expect.objectContaining({ until: 'live' }));
    expect(last()).toBeNull();
  });

  test('force-quit mid-upload, then reopened: Upload failed with Retry; Retry asks Mux before sending', async () => {
    const stored = posted({ state: 'uploading', attempts: 1 }); // what was on the phone when it was closed
    const reopened = resumeState(stored);
    expect(reopened).toMatchObject({ state: 'failed', failedReason: 'interrupted' });
    const { deps } = harness();
    await runPendingPost(reopened, deps, new AbortController().signal);
    expect((deps.status as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((deps.put as jest.Mock).mock.invocationCallOrder[0]);
    expect(deps.put).toHaveBeenCalledTimes(1);
  });

  test('closed while processing, then reopened hours later: only the processing is waited on; nothing is sent or minted', async () => {
    const clock = { t: 5 * 60 * MIN }; // the URL is long expired
    const { deps } = harness({}, clock);
    await runPendingPost(resumeState(posted({ state: 'processing', attempts: 1 })), deps, new AbortController().signal);
    expect(deps.put).not.toHaveBeenCalled();
    expect(deps.mint).not.toHaveBeenCalled();
    expect(deps.retryResponseUpload).not.toHaveBeenCalled();
    expect(deps.waitUntilLive).toHaveBeenCalledWith('U1', expect.anything());
  });

  test('Retry with an expired URL whose bytes had all arrived: no new URL and no second asset', async () => {
    const clock = { t: 2 * 60 * MIN };
    const { deps } = harness({ status: jest.fn(() => Promise.resolve(muxSays('asset_created', 'ready'))) }, clock);
    await runPendingPost(posted(sent), deps, new AbortController().signal);
    expect(deps.mint).not.toHaveBeenCalled();
    expect(deps.retryResponseUpload).not.toHaveBeenCalled();
    expect(deps.put).not.toHaveBeenCalled();
  });

  test.each(['timed_out', 'cancelled', 'errored'])('Retry after Mux reports the upload %s: one fresh URL on the row, sent once', async (dead) => {
    const { deps, last } = harness({ status: jest.fn(() => Promise.resolve(muxSays(dead))) });
    await runPendingPost(posted(sent), deps, new AbortController().signal);
    expect(deps.mint).toHaveBeenCalledTimes(1);
    expect(deps.retryResponseUpload).toHaveBeenCalledWith('row-1', 'U2');
    expect(deps.put).toHaveBeenCalledTimes(1);
    expect((deps.put as jest.Mock).mock.calls[0][1]).toBe('https://storage.example/2');
    expect(last()).toBeNull();
  });

  test('Retry after Mux could not process the asset: a fresh URL, rather than waiting on the failed asset again', async () => {
    const { deps } = harness({ status: jest.fn(() => Promise.resolve(muxSays('asset_created', 'errored'))) });
    await runPendingPost(posted(sent), deps, new AbortController().signal);
    expect(deps.mint).toHaveBeenCalledTimes(1);
    expect(deps.put).toHaveBeenCalledTimes(1);
  });

  test('Retry when Mux cannot be asked (offline, or mux-upload-status down): Upload failed again; nothing is sent blind', async () => {
    const { deps, last } = harness({ status: jest.fn(() => Promise.reject(new Error('status_failed'))) });
    await runPendingPost(posted(sent), deps, new AbortController().signal);
    expect(deps.put).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ state: 'failed', failedReason: 'status_failed', uploadId: 'U1', attempts: 1 });
  });

  test('a Retry whose new URL was recorded but whose answer was lost: the next Retry puts a fresh URL on the row, not status_failed forever', async () => {
    // Retry 1 minted U2 and retry_response_upload moved the row to it, but the answer was lost, so
    // the phone still has U1. mux-upload-status no longer finds U1 among the member's videos.
    const { deps, last } = harness({ status: jest.fn(() => Promise.reject(new Error('status_not_found'))) });
    await runPendingPost(posted(sent), deps, new AbortController().signal);
    expect(deps.mint).toHaveBeenCalledTimes(1);
    expect(deps.retryResponseUpload).toHaveBeenCalledWith('row-1', 'U2');
    expect(deps.put).toHaveBeenCalledTimes(1);
    expect(last()).toBeNull();
  });

  test.each(['removed', 'deleted'] as const)('a video %s on the server meanwhile: Retry sends nothing; Upload failed stays, for Discard', async (gone) => {
    const { deps, last } = harness({ status: jest.fn(() => Promise.resolve(muxSays('waiting', null, gone))) });
    await runPendingPost(posted(sent), deps, new AbortController().signal);
    expect(deps.put).not.toHaveBeenCalled();
    expect(deps.mint).not.toHaveBeenCalled();
    expect(last()).toMatchObject({ state: 'failed', failedReason: `response_${gone}` });
  });

  test('a post that went live while the app was closed: Retry sends nothing and clears it', async () => {
    const { deps, last } = harness({ status: jest.fn(() => Promise.resolve(muxSays('asset_created', 'ready', 'live'))) });
    await runPendingPost(posted(sent), deps, new AbortController().signal);
    expect(deps.put).not.toHaveBeenCalled();
    expect(last()).toBeNull();
  });

  test('Retry tapped twice, or the connection returning during Retry: one transfer', async () => {
    const put = deferred<void>();
    const { deps } = harness({ put: jest.fn(() => put.promise) });
    const gate = createGate();
    const signal = new AbortController().signal;
    const a = gate(() => runPendingPost(posted(sent), deps, signal));
    const b = gate(() => runPendingPost(posted(sent), deps, signal));
    await flush();
    put.resolve();
    await Promise.all([a, b]);
    expect(deps.status).toHaveBeenCalledTimes(1);
    expect(deps.put).toHaveBeenCalledTimes(1);
  });

  test('a post that waited offline and was never sent: Retry sends without asking Mux', async () => {
    const { deps } = harness();
    await runPendingPost(resumeState(posted({ state: 'waiting' })), deps, new AbortController().signal);
    expect(deps.status).not.toHaveBeenCalled();
    expect(deps.put).toHaveBeenCalledTimes(1);
  });
});

// Post (submitPost): a recording is never lost and never replaced (Nemat, 13 Oct), and a lost
// answer is recovered with the same submission, even after a restart.
describe('Post: one waiting recording per member, stored before the request, a lost answer kept', () => {
  function posting(over: Partial<SubmitDeps> & { slot?: PendingPost | null; mint?: () => Promise<UploadTicket> } = {}) {
    const box = { slot: over.slot ?? null, online: true, aborted: false };
    let n = 0;
    const mint = jest.fn(over.mint ?? (() => Promise.resolve(ticket(++n))));
    const store = createTicketStore(mint);
    store.prefetch('A'); // Post Review asked for a URL
    const writes: (PendingPost | null)[] = [];
    const deps: SubmitDeps = {
      stored: jest.fn(async () => box.slot),
      store: jest.fn(async (p: PendingPost) => {
        box.slot = p;
        writes.push(p);
      }),
      clear: jest.fn(async () => {
        box.slot = null;
        writes.push(null);
      }),
      createRow: jest.fn((_p: PendingPost, t: UploadTicket) => Promise.resolve({ id: `row-${t.uploadId}` })),
      online: () => box.online,
      track: jest.fn(),
      aborted: () => box.aborted,
      ...over,
    };
    const args = (rec = recording()) => ({ ownerId: 'A', recording: rec, promptId: 'p1', promptText: 'Prompt', caption: null, tickets: store.forOwner('A') });
    return { box, deps, mint, store, writes, args };
  }
  const waitingFirst = (state: PendingPost['state']) => posted({ recording: recording('rec-first'), state });

  test.each(['uploading', 'processing', 'waiting', 'failed'] as const)('a second recording while the first is %s: refused, the first kept exactly as it was, nothing sent', async (state) => {
    const first = waitingFirst(state);
    const { box, deps, writes, args } = posting({ slot: first });
    await expect(submitPost(args(recording('rec-second')), deps)).rejects.toThrow('post_pending');
    expect(box.slot).toBe(first);
    expect(writes).toEqual([]);
    expect(deps.createRow).not.toHaveBeenCalled();
  });

  test('storage that cannot be read is not taken as empty: nothing is replaced or sent', async () => {
    const { deps, writes, args } = posting({ stored: () => Promise.reject(new Error('storage_failed')) });
    await expect(submitPost(args(), deps)).rejects.toThrow('storage_failed');
    expect(writes).toEqual([]);
    expect(deps.createRow).not.toHaveBeenCalled();
  });

  test('the post is on the phone, with its URL and submission, before the row is asked for', async () => {
    const { box, deps, args } = posting();
    let atRequest: PendingPost | null = null;
    (deps.createRow as jest.Mock).mockImplementation(async (_p: PendingPost, t: UploadTicket) => {
      atRequest = box.slot;
      return { id: `row-${t.uploadId}` };
    });
    await submitPost(args(), deps);
    expect(atRequest).toMatchObject({ ownerId: 'A', responseId: null, uploadId: 'U1', recording: { submissionId: 'sub-rec-1' } });
  });

  test('storing fails before the request: nothing is sent', async () => {
    const { deps, args } = posting({ store: () => Promise.reject(new Error('storage_failed')) });
    await expect(submitPost(args(), deps)).rejects.toThrow('storage_failed');
    expect(deps.createRow).not.toHaveBeenCalled();
  });

  test('a normal Post: stored with its row, uploading, and handed to the upload', async () => {
    const { box, deps, args } = posting();
    const result = await submitPost(args(), deps);
    expect(result?.upload).toMatchObject({ responseId: 'row-U1', uploadId: 'U1', state: 'uploading' });
    expect(box.slot).toBe(result?.upload);
  });

  test('a lost answer: an Upload failed post with the URL and submission (not a silent Post), and the URL is no other recording\'s', async () => {
    const { box, deps, store, args } = posting({ createRow: () => Promise.reject(serverError('TypeError: Network request failed', false)) });
    const result = await submitPost(args(), deps);
    expect(result?.show).toMatchObject({ kind: 'failed', post: { responseId: null, uploadId: 'U1', failedReason: 'TypeError: Network request failed' } });
    expect(result?.upload).toBeUndefined();
    expect(box.slot).toMatchObject({ state: 'failed', uploadId: 'U1', recording: { submissionId: 'sub-rec-1' } });
    await expect(store.forOwner('A').get()).resolves.toMatchObject({ ticket: ticket(2) });
  });

  test('a lost answer while offline: waiting, and it starts by itself when the connection returns', async () => {
    const { box, deps, args } = posting({ createRow: () => Promise.reject(serverError('TypeError: Network request failed', false)) });
    box.online = false;
    const result = await submitPost(args(), deps);
    expect(result?.show).toMatchObject({ kind: 'waiting', post: { uploadId: 'U1', failedReason: null } });
  });

  test('after a lost answer and an app restart, Retry gets the same row back: no second row, no new URL', async () => {
    // Post: the server makes row-U1, the answer is lost.
    const made = new Map<string, string>(); // submission -> row, as the server keeps it
    const server = jest.fn(async (p: PendingPost, t: UploadTicket) => {
      const existing = made.get(p.recording.submissionId ?? '');
      if (existing) return { id: existing };
      made.set(p.recording.submissionId ?? '', `row-${t.uploadId}`);
      throw serverError('TypeError: Network request failed', false);
    });
    const { box, deps, args } = posting({ createRow: server });
    await submitPost(args(), deps);
    // The app is closed and opened again: what is on the phone is all there is.
    const reopened = resumeState(JSON.parse(JSON.stringify(box.slot)) as PendingPost);
    expect(reopened).toMatchObject({ state: 'failed', responseId: null, uploadId: 'U1' });
    const { deps: run, last } = harness({ createRow: server, mint: jest.fn() });
    await runPendingPost(reopened, run, new AbortController().signal);
    expect(server).toHaveBeenCalledTimes(2);
    expect(server.mock.calls[1][1]).toEqual(ticket(1));
    expect(made.size).toBe(1);
    expect(run.mint).not.toHaveBeenCalled();
    expect(run.put).toHaveBeenCalledTimes(1);
    expect(last()).toBeNull();
  });

  test.each(['already_responded', 'prompt_not_found', 'posting_paused', 'submission_conflict'])('a refusal (%s): thrown as before, and the record of this attempt is removed', async (reason) => {
    const { box, deps, writes, args } = posting({ createRow: () => Promise.reject(serverError(reason, true)) });
    await expect(submitPost(args(), deps)).rejects.toThrow(reason);
    expect(box.slot).toBeNull();
    expect(writes[writes.length - 1]).toBeNull();
  });

  test('another attempt at the same recording (after a refusal) is not blocked by its own record', async () => {
    const own = posted({ recording: recording(), responseId: null, state: 'uploading' });
    const { deps, args } = posting({ slot: own });
    await expect(submitPost(args(), deps)).resolves.toMatchObject({ upload: { responseId: 'row-U1' } });
  });

  test('no URL could be had (an upload limit): Upload failed with the reason, nothing sent', async () => {
    const { box, deps, args } = posting({ mint: () => Promise.reject(new Error('upload_limit_hour')) });
    const result = await submitPost(args(), deps);
    expect(result?.show).toMatchObject({ kind: 'failed', post: { uploadId: '', failedReason: 'upload_limit_hour' } });
    expect(box.slot).toMatchObject({ uploadId: '', responseId: null });
    expect(deps.createRow).not.toHaveBeenCalled();
  });

  test('the member changes during the request: nothing is shown or uploaded for anyone', async () => {
    const { box, deps, args } = posting();
    (deps.createRow as jest.Mock).mockImplementation(async (_p: PendingPost, t: UploadTicket) => {
      box.aborted = true;
      return { id: `row-${t.uploadId}` };
    });
    await expect(submitPost(args(), deps)).resolves.toBeNull();
  });
});
