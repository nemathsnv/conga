// One posted recording from its row to live, every effect mocked (uploadRun.ts). Review of fee64ec
// (13 Oct): a URL's real age, and a member who signs out or changes mid-upload.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { storeNewPendingPost } from '@/video/pendingPost';
import { newPendingPost, pendingPostFor, UPLOAD_URL_TTL_MS, uploadUrlUsable, type PendingPost } from '@/video/pendingPostState';
import type { Recording } from '@/video/types';
import type { UploadTicket } from '@/video/upload';
import { runPendingPost, type PostingState, type RunDeps } from '@/video/uploadRun';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));

const MIN = 60_000;
const recording = (id = 'rec-1'): Recording => ({ id, promptId: 'p1', segments: [{ uri: `file:///${id}.mp4`, facing: 'front', durationMs: 5000 }], durationMs: 5000, createdAt: 0 });
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

  test('a new post replacing another member\'s stored post deletes that recording from the phone', async () => {
    const other = posted({ ownerId: 'A', recording: recording('rec-A') });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(other));
    const deleteFiles = jest.fn();
    await storeNewPendingPost(posted({ ownerId: 'B', recording: recording('rec-B') }), deleteFiles);
    expect(deleteFiles).toHaveBeenCalledWith(recording('rec-A'));
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith('shortcut.pendingPost', expect.stringContaining('rec-B'));
  });

  test('a new post replacing the member\'s own stored post leaves that recording alone', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(posted({ recording: recording('rec-old') })));
    const deleteFiles = jest.fn();
    await storeNewPendingPost(posted({ recording: recording('rec-new') }), deleteFiles);
    expect(deleteFiles).not.toHaveBeenCalled();
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
