// Review of 13 Oct, B2 and I2/I5/I7: Retry and Discard never run together; a recording is deleted
// from the phone only once the server confirms nothing of it will post; nothing is asked of the
// server for a recording that is gone; Mux is asked before re-sending after a lost answer.
import { newPendingPost, type PendingPost } from '@/video/pendingPostState';
import { createExclusive } from '@/video/postingFlow';
import type { Recording } from '@/video/types';
import type { AbandonAnswer, UploadStatus, UploadTicket } from '@/video/upload';
import { discardPost, runPendingPost, type DiscardDeps, type PostingState, type RunDeps } from '@/video/uploadRun';

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
const flush = () => new Promise<void>((r) => setImmediate(() => r()));
const recording = (id = 'rec-1'): Recording => ({ id, submissionId: `sub-${id}`, promptId: 'p1', segments: [{ uri: `file:///${id}.mp4`, facing: 'front', durationMs: 5000 }], durationMs: 5000, createdAt: 0 });
const ticket = (n: number): UploadTicket => ({ uploadId: `U${n}`, uploadUrl: `https://storage.example/${n}` });
const args = { ownerId: 'A', recording: recording(), promptId: 'p1', promptText: 'Prompt', caption: null };
/** A post with its row (responseId) and URL. */
const withRow = (over: Partial<PendingPost> = {}): PendingPost => ({ ...newPendingPost(args, { responseId: 'row-1', uploadId: 'U1', uploadUrl: 'https://storage.example/1', mintedAt: Date.now() }, 'failed'), ...over });
/** A post whose request for a row was sent and never answered: no row id, a URL. */
const unanswered = (over: Partial<PendingPost> = {}): PendingPost => ({ ...withRow(), responseId: null, ...over });
/** A post that never got a URL: nothing was sent. */
const neverSent = (): PendingPost => newPendingPost(args, null, 'failed', 'upload_limit_hour');
const muxSays = (uploadStatus: string, assetStatus: string | null = null, responseStatus: UploadStatus['responseStatus'] = 'processing'): UploadStatus => ({ uploadStatus, assetStatus, playbackId: null, responseStatus });

function runDeps(over: Partial<RunDeps> = {}) {
  const stored: (PendingPost | null)[] = [];
  const shown: PostingState[] = [];
  let n = 1;
  const deps: RunDeps = {
    persist: jest.fn(async (p: PendingPost | null) => void stored.push(p)),
    show: jest.fn((s: PostingState) => void shown.push(s)),
    mint: jest.fn(() => Promise.resolve(ticket(++n))),
    createRow: jest.fn((_p: PendingPost, t: UploadTicket) => Promise.resolve({ id: `row-${t.uploadId}` })),
    retryResponseUpload: jest.fn(() => Promise.resolve()),
    put: jest.fn(() => Promise.resolve()),
    status: jest.fn(() => Promise.resolve(muxSays('waiting'))),
    waitUntilLive: jest.fn(() => Promise.resolve('PB1')),
    deleteFiles: jest.fn(),
    fileExists: jest.fn(() => true),
    track: jest.fn(),
    ...over,
  };
  return { deps, stored, shown };
}

function discardDeps(answer: AbandonAnswer | Error, order: string[] = []) {
  const stored: (PendingPost | null)[] = [];
  const deps: DiscardDeps = {
    persist: jest.fn(async (p: PendingPost | null) => {
      order.push(p ? `store${p.discardRequested ? ' (discard requested)' : ''}` : 'clear');
      stored.push(p);
    }),
    deleteFiles: jest.fn(() => void order.push('delete file')),
    abandon: jest.fn(async () => {
      order.push('ask server');
      if (answer instanceof Error) throw answer;
      return answer;
    }),
  };
  return { deps, stored, order };
}

describe('Retry and Discard never run together (createExclusive)', () => {
  test('a second Retry joins the running upload', async () => {
    const ex = createExclusive();
    const d = deferred<void>();
    const fn = jest.fn(() => d.promise);
    const parent = new AbortController().signal;
    const a = ex.upload(fn, parent);
    const b = ex.upload(fn, parent);
    expect(b).toBe(a);
    d.resolve();
    await Promise.all([a, b]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('Discard during an upload stops it and waits for it to end before it starts', async () => {
    const ex = createExclusive();
    const order: string[] = [];
    let uploadSignal: AbortSignal | null = null;
    const upload = ex.upload(async (signal) => {
      uploadSignal = signal;
      order.push('upload started');
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => setTimeout(resolve, 5)));
      order.push('upload ended');
    }, new AbortController().signal);
    const discard = ex.discard(async () => {
      order.push('discard');
      return 'done';
    });
    expect(ex.busy()).toBe('upload');
    await expect(discard).resolves.toBe('done');
    await upload;
    expect(uploadSignal!.aborted).toBe(true);
    expect(order).toEqual(['upload started', 'upload ended', 'discard']);
  });

  test('Retry while a discard runs does nothing; a second Discard joins the first', async () => {
    const ex = createExclusive();
    const d = deferred<string>();
    const work = jest.fn(() => d.promise);
    const first = ex.discard(work);
    const upload = jest.fn(() => Promise.resolve());
    await ex.upload(upload, new AbortController().signal);
    expect(upload).not.toHaveBeenCalled();
    const second = ex.discard(jest.fn(() => Promise.resolve('other')));
    d.resolve('first');
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('first');
    expect(work).toHaveBeenCalledTimes(1);
    expect(ex.busy()).toBeNull();
  });

  test('the member signing out aborts the upload (parent signal)', async () => {
    const ex = createExclusive();
    const parent = new AbortController();
    let seen: AbortSignal | null = null;
    const upload = ex.upload(async (signal) => {
      seen = signal;
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
    }, parent.signal);
    parent.abort();
    await upload;
    expect(seen!.aborted).toBe(true);
  });

  test('a failed upload frees the lock for a discard', async () => {
    const ex = createExclusive();
    await expect(ex.upload(() => Promise.reject(new Error('boom')), new AbortController().signal)).rejects.toThrow('boom');
    await expect(ex.discard(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('Retry shows the posting state at once', () => {
  test('PR-Posting is shown before the first request, so Retry and Discard are not offered meanwhile', async () => {
    const slow = deferred<{ id: string }>();
    const { deps, shown } = runDeps({ createRow: jest.fn(() => slow.promise) });
    const run = runPendingPost(unanswered(), deps, new AbortController().signal);
    await flush();
    expect(shown[0]).toMatchObject({ kind: 'uploading', progress: 0 });
    expect(deps.createRow).toHaveBeenCalled();
    slow.resolve({ id: 'row-U1' });
    await run;
  });

  test('a post being processed shows processing at once', async () => {
    const { deps, shown } = runDeps();
    await runPendingPost(withRow({ state: 'processing', attempts: 1 }), deps, new AbortController().signal);
    expect(shown[0]).toMatchObject({ kind: 'processing' });
  });
});

describe('a recording that is gone asks nothing of the server (I2)', () => {
  test('no row: fails as recording_missing with no request, no URL, no Mux question', async () => {
    const { deps, stored } = runDeps({ fileExists: jest.fn(() => false) });
    await runPendingPost(unanswered(), deps, new AbortController().signal);
    expect(deps.createRow).not.toHaveBeenCalled();
    expect(deps.mint).not.toHaveBeenCalled();
    expect(deps.status).not.toHaveBeenCalled();
    expect(stored[stored.length - 1]).toMatchObject({ state: 'failed', failedReason: 'recording_missing' });
  });

  test('a row never sent to (attempts 0): recording_missing, nothing asked', async () => {
    const { deps } = runDeps({ fileExists: jest.fn(() => false) });
    await runPendingPost(withRow({ attempts: 0 }), deps, new AbortController().signal);
    expect(deps.status).not.toHaveBeenCalled();
    expect(deps.put).not.toHaveBeenCalled();
  });

  test('a row already sent to: Mux is asked; if it has the video, it is waited on, not lost', async () => {
    const { deps } = runDeps({ fileExists: jest.fn(() => false), status: jest.fn(() => Promise.resolve(muxSays('asset_created', 'preparing'))) });
    await runPendingPost(withRow({ attempts: 1 }), deps, new AbortController().signal);
    expect(deps.put).not.toHaveBeenCalled();
    expect(deps.waitUntilLive).toHaveBeenCalled();
  });

  test('a row already sent to, Mux still waiting: recording_missing, no URL minted', async () => {
    const { deps, stored } = runDeps({ fileExists: jest.fn(() => false) });
    await runPendingPost(withRow({ attempts: 1 }), deps, new AbortController().signal);
    expect(deps.mint).not.toHaveBeenCalled();
    expect(stored[stored.length - 1]).toMatchObject({ failedReason: 'recording_missing' });
  });
});

describe('after a lost answer, Mux is asked before anything is sent (I5)', () => {
  test('the row comes back from a repeated request with attempts 0: Mux is still asked', async () => {
    const { deps } = runDeps();
    await runPendingPost(unanswered({ attempts: 0 }), deps, new AbortController().signal);
    expect(deps.status).toHaveBeenCalledWith('U1');
    expect((deps.status as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((deps.put as jest.Mock).mock.invocationCallOrder[0]);
  });

  test('and if Mux already has it, nothing is sent again', async () => {
    const { deps } = runDeps({ status: jest.fn(() => Promise.resolve(muxSays('asset_created', 'ready'))) });
    await runPendingPost(unanswered({ attempts: 0 }), deps, new AbortController().signal);
    expect(deps.put).not.toHaveBeenCalled();
  });

  test('Mux cannot be asked: Upload failed again, nothing sent', async () => {
    const { deps, stored } = runDeps({ status: jest.fn(() => Promise.reject(new Error('status_failed'))) });
    await runPendingPost(unanswered({ attempts: 0 }), deps, new AbortController().signal);
    expect(deps.put).not.toHaveBeenCalled();
    expect(stored[stored.length - 1]).toMatchObject({ failedReason: 'status_failed' });
  });

  test('a post whose first request is answered normally asks Mux nothing', async () => {
    const { deps } = runDeps();
    await runPendingPost(newPendingPost(args, null, 'failed', 'mint_failed'), deps, new AbortController().signal);
    expect(deps.status).not.toHaveBeenCalled();
  });
});

describe('Discard: the recording goes only once nothing of it can post (B2, I7)', () => {
  test('nothing was ever sent (no URL): it goes at once, without the server, offline too', async () => {
    const { deps, order } = discardDeps(new Error('offline'));
    await expect(discardPost(neverSent(), deps)).resolves.toEqual({ kind: 'gone' });
    expect(deps.abandon).not.toHaveBeenCalled();
    expect(order).toEqual(['delete file', 'clear']);
  });

  test('server confirms (abandoned): the discard is stored first, the server asked, then the file deleted', async () => {
    const { deps, order } = discardDeps({ outcome: 'abandoned', reason: 'cancelled' });
    await expect(discardPost(unanswered(), deps)).resolves.toEqual({ kind: 'gone' });
    expect(order).toEqual(['store (discard requested)', 'ask server', 'delete file', 'clear']);
    expect(deps.abandon).toHaveBeenCalledWith('sub-rec-1');
  });

  test.each([
    ['offline (no answer)', new Error('abandon_failed')],
    ['Mux not verifiable', { outcome: 'kept', reason: 'unverified' } as AbandonAnswer],
    ['another check in progress', { outcome: 'kept', reason: 'busy' } as AbandonAnswer],
    ['an id the server does not give', { outcome: 'not_found' } as AbandonAnswer],
  ])('%s: the recording stays, the discard stays requested (asked again later), nothing deleted', async (_name, answer) => {
    const { deps, stored } = discardDeps(answer);
    const result = await discardPost(unanswered(), deps);
    expect(result).toMatchObject({ kind: 'kept', post: { discardRequested: true, uploadId: 'U1' } });
    expect(deps.deleteFiles).not.toHaveBeenCalled();
    expect(stored[stored.length - 1]).toMatchObject({ discardRequested: true });
  });

  test('a post with its row, offline: kept for reconciliation; the row is never deleted from the phone side', async () => {
    const { deps } = discardDeps(new Error('abandon_failed'));
    await expect(discardPost(withRow({ attempts: 1 }), deps)).resolves.toMatchObject({ kind: 'kept' });
    expect(deps.deleteFiles).not.toHaveBeenCalled();
  });

  test('Mux already has it (at_mux): it will post; the post carries on as processing, discard cleared', async () => {
    const { deps } = discardDeps({ outcome: 'kept', reason: 'at_mux', responseId: 'row-9' });
    const result = await discardPost(unanswered(), deps);
    expect(result).toMatchObject({ kind: 'posting', post: { responseId: 'row-9', state: 'processing', discardRequested: false } });
    expect(deps.deleteFiles).not.toHaveBeenCalled();
  });

  test.each(['live', 'removed'])('settled on the server (%s): the phone copy goes, the server video is not touched', async (reason) => {
    const { deps } = discardDeps({ outcome: 'kept', reason, responseId: 'row-9' });
    await expect(discardPost(withRow(), deps)).resolves.toEqual({ kind: 'gone' });
    expect(deps.abandon).toHaveBeenCalledTimes(1);
  });

  test('a recording without a submission id is never deleted automatically', async () => {
    const { deps } = discardDeps({ outcome: 'abandoned' });
    const legacy = unanswered({ recording: { ...recording(), submissionId: undefined } });
    await expect(discardPost(legacy, deps)).resolves.toMatchObject({ kind: 'kept', reason: 'no_submission' });
    expect(deps.abandon).not.toHaveBeenCalled();
    expect(deps.deleteFiles).not.toHaveBeenCalled();
  });

  test('storing the discard fails: the server is not asked and nothing is deleted', async () => {
    const { deps } = discardDeps({ outcome: 'abandoned' });
    (deps.persist as jest.Mock).mockRejectedValueOnce(new Error('storage_failed'));
    await expect(discardPost(unanswered(), deps)).rejects.toThrow('storage_failed');
    expect(deps.abandon).not.toHaveBeenCalled();
    expect(deps.deleteFiles).not.toHaveBeenCalled();
  });

  test('reconciliation: asked again later, the same discard completes', async () => {
    const first = discardDeps(new Error('abandon_failed'));
    const kept = await discardPost(unanswered(), first.deps);
    expect(kept.kind).toBe('kept');
    const later = discardDeps({ outcome: 'abandoned', reason: 'already' });
    await expect(discardPost((kept as { post: PendingPost }).post, later.deps)).resolves.toEqual({ kind: 'gone' });
  });
});

describe('a discard racing a Retry (the B2 race, end to end with the pure parts)', () => {
  test('Retry got the row back and is about to send; Discard stops it first: no byte is sent after the discard is asked', async () => {
    const ex = createExclusive();
    const parent = new AbortController();
    const order: string[] = [];
    const rowAnswer = deferred<{ id: string }>();
    const { deps } = runDeps({
      createRow: jest.fn(() => rowAnswer.promise),
      put: jest.fn(async () => void order.push('PUT')),
    });
    const retry = ex.upload((signal) => runPendingPost(unanswered(), deps, signal), parent.signal);
    await flush();
    const dDeps = discardDeps({ outcome: 'abandoned' }, order);
    const discard = ex.discard(() => discardPost(unanswered(), dDeps.deps));
    rowAnswer.resolve({ id: 'row-U1' }); // the replay's answer arrives after Discard was tapped
    await Promise.all([retry, discard]);
    expect(order).not.toContain('PUT');
    expect(order[0]).toBe('store (discard requested)');
  });
});
