// One recording, one upload URL (CP0, 13 Oct: Post Review's request and Post's raced and minted
// two). Deterministic: every mint answers only when the test resolves it.
import { createGate, createOncePerKey, createQueue, ensureUploadRow, prepareUpload } from '@/video/postingFlow';
import { createTicketStore, TICKET_MAX_AGE_MS } from '@/video/ticketStore';
import type { UploadTicket } from '@/video/upload';

/** What lib/content throws: refused (the server answered with an error code) or not (no answer). */
const serverError = (message: string, refused: boolean) => Object.assign(new Error(message), { refused });

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
const ticket = (n: number): UploadTicket => ({ uploadId: `U${n}`, uploadUrl: `https://storage.example/${n}` });
const flush = () => new Promise<void>((r) => setImmediate(() => r()));

/** A mint whose every request waits for the test; requests[i] is the i-th request. */
function slowMint() {
  const requests: Deferred<UploadTicket>[] = [];
  const mint = jest.fn(() => {
    const d = deferred<UploadTicket>();
    requests.push(d);
    return d.promise;
  });
  return { mint, requests };
}

describe('the CP0 race', () => {
  test('Post tapped while Post Review is still asking: Post waits for the same request, one URL', async () => {
    const { mint, requests } = slowMint();
    const store = createTicketStore(mint);
    const create = jest.fn((t: UploadTicket) => Promise.resolve({ id: `row-${t.uploadId}` }));
    store.prefetch('T1'); // Post Review opens
    const posting = prepareUpload({ tickets: store.forOwner('T1'), create }); // Post tapped at once
    await flush();
    expect(mint).toHaveBeenCalledTimes(1);
    requests[0].resolve(ticket(1));
    await expect(posting).resolves.toEqual({ ok: true, ticket: ticket(1), mintedAt: expect.any(Number), row: { id: 'row-U1' } });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('the disclosure sheet path (Post, sheet shown, sheet Post) uses the same pending request', async () => {
    const { mint, requests } = slowMint();
    const store = createTicketStore(mint);
    const create = jest.fn((t: UploadTicket) => Promise.resolve({ id: `row-${t.uploadId}` }));
    store.prefetch('T1');
    // Post shows A-Disclosure without asking for anything; the sheet's Post submits.
    const posting = prepareUpload({ tickets: store.forOwner('T1'), create });
    requests[0].resolve(ticket(1));
    await expect(posting).resolves.toMatchObject({ ok: true, ticket: ticket(1) });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test('a slow answer shared by several waiters gives every one the same URL', async () => {
    const { mint, requests } = slowMint();
    const store = createTicketStore(mint);
    store.prefetch('T1');
    const a = store.forOwner('T1').get();
    const b = store.forOwner('T1').get();
    store.prefetch('T1');
    requests[0].resolve(ticket(1));
    await expect(Promise.all([a, b])).resolves.toEqual([{ ticket: ticket(1), mintedAt: expect.any(Number), replaceable: true }, { ticket: ticket(1), mintedAt: expect.any(Number), replaceable: true }]);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test('Post Review opened twice by StrictMode effects asks once', () => {
    const { mint } = slowMint();
    const store = createTicketStore(mint);
    store.prefetch('T1');
    store.prefetch('T1');
    expect(mint).toHaveBeenCalledTimes(1);
  });
});

describe('rapid taps and concurrent calls', () => {
  test('taps before the re-render join the first: one prepareUpload, one mint, one row', async () => {
    const { mint, requests } = slowMint();
    const store = createTicketStore(mint);
    const create = jest.fn((t: UploadTicket) => Promise.resolve({ id: `row-${t.uploadId}` }));
    const gate = createGate();
    const submit = jest.fn(async () => {
      await prepareUpload({ tickets: store.forOwner('T1'), create });
    });
    store.prefetch('T1');
    const taps = [gate(submit), gate(submit), gate(submit)];
    expect(new Set(taps).size).toBe(1);
    requests[0].resolve(ticket(1));
    await Promise.all(taps);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(mint).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('the gate opens again once the run ends, also after a failure', async () => {
    const gate = createGate();
    const fn = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    await expect(gate(fn)).rejects.toThrow('boom');
    await gate(fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('one recording is posted once: a second post of it gets the first call, a failed one may be tried again', async () => {
    const once = createOncePerKey();
    const d = deferred<string>();
    const first = jest.fn(() => d.promise);
    const second = jest.fn(() => Promise.resolve('second'));
    const a = once('rec-1', first);
    const b = once('rec-1', second);
    expect(b).toBe(a);
    d.resolve('first');
    await expect(b).resolves.toBe('first');
    expect(second).not.toHaveBeenCalled();
    await expect(once('rec-1', second)).resolves.toBe('first'); // still posted once
    const failing = once('rec-2', () => Promise.reject(new Error('net')));
    await expect(failing).rejects.toThrow('net');
    await flush();
    await expect(once('rec-2', second)).resolves.toBe('second');
  });

  test('a different recording is not blocked by the first', async () => {
    const once = createOncePerKey();
    const a = once('rec-1', () => new Promise<string>(() => undefined));
    const b = once('rec-2', () => Promise.resolve('b'));
    expect(b).not.toBe(a);
    await expect(b).resolves.toBe('b');
  });
});

describe('failed requests', () => {
  test('Post Review\'s request fails while Post waits: a failed post with the reason, and no second request', async () => {
    const { mint, requests } = slowMint();
    const store = createTicketStore(mint);
    const create = jest.fn();
    store.prefetch('T1');
    const posting = prepareUpload({ tickets: store.forOwner('T1'), create });
    requests[0].reject(new Error('upload_limit_hour'));
    await expect(posting).resolves.toEqual({ ok: false, reason: 'upload_limit_hour' });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  test('Post Review\'s request failed earlier: Post asks once more', async () => {
    const { mint, requests } = slowMint();
    const store = createTicketStore(mint);
    store.prefetch('T1');
    requests[0].reject(new Error('mint_failed'));
    await flush();
    const posting = prepareUpload({ tickets: store.forOwner('T1'), create: (t) => Promise.resolve({ id: t.uploadId }) });
    await flush();
    requests[1].resolve(ticket(2));
    await expect(posting).resolves.toMatchObject({ ok: true, ticket: ticket(2) });
    expect(mint).toHaveBeenCalledTimes(2);
  });

  test('a prefetch failure nobody waits for is not an unhandled rejection', async () => {
    const store = createTicketStore(() => Promise.reject(new Error('mint_failed')));
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    store.prefetch('T1');
    await flush();
    await flush();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  test('a restriction while Post waits is thrown for Post Review, as before', async () => {
    const { mint, requests } = slowMint();
    const store = createTicketStore(mint);
    store.prefetch('T1');
    const posting = prepareUpload({ tickets: store.forOwner('T1'), create: jest.fn() });
    requests[0].reject(new Error('posting_paused'));
    await expect(posting).rejects.toThrow('posting_paused');
  });
});

describe('re-recording, leaving Post Review, time and sign-in', () => {
  test('Re-record keeps the URL nobody posted with: the next take posts with it, no new request', async () => {
    const { mint, requests } = slowMint();
    const store = createTicketStore(mint);
    store.prefetch('T1'); // first take's Post Review
    requests[0].resolve(ticket(1));
    await flush();
    store.prefetch('T1'); // Re-record, then the second take's Post Review
    const posted = await prepareUpload({ tickets: store.forOwner('T1'), create: (t) => Promise.resolve({ id: t.uploadId }) });
    expect(posted).toMatchObject({ ok: true, ticket: ticket(1) });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test('Re-record while the request is still running joins it', async () => {
    const { mint, requests } = slowMint();
    const store = createTicketStore(mint);
    store.prefetch('T1');
    store.prefetch('T1');
    requests[0].resolve(ticket(1));
    await expect(store.forOwner('T1').get()).resolves.toMatchObject({ ticket: ticket(1) });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test('Post Review closed (unmounted) before the answer: the answer is kept for the next Post', async () => {
    const { mint, requests } = slowMint();
    const store = createTicketStore(mint);
    store.prefetch('T1');
    // The screen is gone; nothing of it is called again. The request still finishes.
    requests[0].resolve(ticket(1));
    await flush();
    await expect(store.forOwner('T1').get()).resolves.toEqual({ ticket: ticket(1), mintedAt: expect.any(Number), replaceable: true });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test('after a post, the next recording gets a new URL (a posted URL is never reused)', async () => {
    let n = 0;
    const store = createTicketStore(() => Promise.resolve(ticket(++n)));
    const create = (t: UploadTicket) => Promise.resolve({ id: t.uploadId });
    store.prefetch('T1');
    await expect(prepareUpload({ tickets: store.forOwner('T1'), create })).resolves.toMatchObject({ ticket: ticket(1) });
    store.prefetch('T1');
    await expect(prepareUpload({ tickets: store.forOwner('T1'), create })).resolves.toMatchObject({ ticket: ticket(2) });
  });

  test('a URL older than 50 minutes is not handed out', async () => {
    let clock = 0;
    let n = 0;
    const store = createTicketStore(() => Promise.resolve(ticket(++n)), () => clock);
    store.prefetch('T1');
    await flush();
    clock = TICKET_MAX_AGE_MS - 1;
    await expect(store.forOwner('T1').get()).resolves.toMatchObject({ ticket: ticket(1) });
    clock = TICKET_MAX_AGE_MS;
    await expect(store.forOwner('T1').get()).resolves.toEqual({ ticket: ticket(2), mintedAt: TICKET_MAX_AGE_MS, replaceable: false });
  });

  test('another member never gets the first member\'s URL', async () => {
    let n = 0;
    const store = createTicketStore(() => Promise.resolve(ticket(++n)));
    store.prefetch('A');
    await flush();
    await expect(store.forOwner('B').get()).resolves.toEqual({ ticket: ticket(2), mintedAt: expect.any(Number), replaceable: false });
    // A's request, still answering after B signed in, is not handed to B.
    const { mint, requests } = slowMint();
    const s2 = createTicketStore(mint);
    s2.prefetch('A');
    const b = s2.forOwner('B').get();
    requests[0].resolve(ticket(10));
    requests[1].resolve(ticket(11));
    await expect(b).resolves.toMatchObject({ ticket: ticket(11) });
  });
});

describe('review of fee64ec: the URL\'s age and a member change', () => {
  test('a URL\'s age counts from the request: a slow answer does not make it look younger', async () => {
    let clock = 0;
    let n = 0;
    const answers: Deferred<UploadTicket>[] = [];
    const store = createTicketStore(() => {
      n += 1;
      const d = deferred<UploadTicket>();
      answers.push(d);
      return d.promise;
    }, () => clock);
    store.prefetch('T1'); // asked at 0
    clock = 20 * 60_000; // the phone was locked; the answer arrives 20 minutes later
    answers[0].resolve(ticket(1));
    await expect(store.forOwner('T1').get()).resolves.toMatchObject({ ticket: ticket(1), mintedAt: 0 });
    clock = TICKET_MAX_AGE_MS; // 50 minutes after the request, 30 after the answer: no longer handed out
    const next = store.forOwner('T1').get();
    answers[1].resolve(ticket(2));
    await expect(next).resolves.toMatchObject({ ticket: ticket(2), mintedAt: TICKET_MAX_AGE_MS });
    expect(n).toBe(2);
  });

  test('signing out resets the store: a request still running for the old member is never handed out', async () => {
    const { mint, requests } = slowMint();
    const store = createTicketStore(mint);
    store.prefetch('A');
    store.reset(); // A signs out
    requests[0].resolve(ticket(1)); // A's answer arrives afterwards
    await flush();
    const b = store.forOwner('B').get();
    requests[1].resolve(ticket(2));
    await expect(b).resolves.toMatchObject({ ticket: ticket(2) });
    // A signs back in: A's old answer was dropped too, so A asks again.
    const a = store.forOwner('A').get();
    requests[2].resolve(ticket(3));
    await expect(a).resolves.toMatchObject({ ticket: ticket(3) });
  });

  test('re-recording never gets a URL a transfer could have started on, nor one sent with a lost answer', async () => {
    let n = 0;
    const store = createTicketStore(() => Promise.resolve(ticket(++n)));
    // Recording 1 posts: its URL leaves the store as the row answers, before any byte is sent.
    await expect(prepareUpload({ tickets: store.forOwner('T1'), create: (t) => Promise.resolve({ id: t.uploadId }) })).resolves.toMatchObject({ ok: true, ticket: ticket(1) });
    // Recording 2: the row is asked for and the answer is lost. Its URL goes with that post.
    const lost = jest.fn(() => Promise.reject(serverError('TypeError: Network request failed', false)));
    await expect(prepareUpload({ tickets: store.forOwner('T1'), create: lost })).resolves.toMatchObject({ ok: false, sent: { ticket: ticket(2) } });
    // Re-record, then recording 3: a URL neither of them used.
    const create = jest.fn((t: UploadTicket) => Promise.resolve({ id: t.uploadId }));
    await expect(prepareUpload({ tickets: store.forOwner('T1'), create })).resolves.toMatchObject({ ticket: ticket(3) });
    expect(create).toHaveBeenCalledWith(ticket(3));
  });

  test('a URL kept after a refusal (nothing was made with it) is the one the next recording uses', async () => {
    let n = 0;
    const store = createTicketStore(() => Promise.resolve(ticket(++n)));
    store.prefetch('T1');
    await expect(prepareUpload({ tickets: store.forOwner('T1'), create: () => Promise.reject(serverError('already_responded', true)) })).rejects.toThrow('already_responded');
    await expect(prepareUpload({ tickets: store.forOwner('T1'), create: (t) => Promise.resolve({ id: t.uploadId }) })).resolves.toMatchObject({ ticket: ticket(1) });
    expect(n).toBe(1);
  });

  test('Posts run one after another (createQueue): the second starts when the first has settled, even if it failed', async () => {
    const queue = createQueue();
    const order: string[] = [];
    const first = deferred<void>();
    const a = queue(async () => {
      order.push('a start');
      await first.promise;
      order.push('a end');
      throw new Error('a failed');
    });
    const b = queue(async () => {
      order.push('b');
      return 'b';
    });
    await flush();
    expect(order).toEqual(['a start']);
    first.resolve();
    await expect(a).rejects.toThrow('a failed');
    await expect(b).resolves.toBe('b');
    expect(order).toEqual(['a start', 'a end', 'b']);
  });
});

describe('Retry for a post that has no row yet (ensureUploadRow)', () => {
  type P = { responseId: string | null; uploadId: string; uploadUrl: string; uploadUrlExpiresAt: number };
  const empty: P = { responseId: null, uploadId: '', uploadUrl: '', uploadUrlExpiresAt: 0 };
  const deps = (over: Partial<Parameters<typeof ensureUploadRow<P>>[1]> = {}) => {
    let n = 0;
    const saved: P[] = [];
    const d = {
      usable: (p: P) => p.uploadUrlExpiresAt - 1000 > 60_000,
      mint: jest.fn(() => Promise.resolve(ticket(++n))),
      create: jest.fn((t: UploadTicket) => Promise.resolve({ id: `row-${t.uploadId}` })),
      save: jest.fn(async (p: P) => {
        saved.push(p);
      }),
      ttlMs: 55 * 60_000,
      now: () => 1000,
      ...over,
    };
    return { d, saved };
  };

  test('the URL is saved before the row is created', async () => {
    const { d, saved } = deps();
    await expect(ensureUploadRow(empty, d)).resolves.toMatchObject({ responseId: 'row-U1', uploadId: 'U1' });
    expect(saved[0]).toMatchObject({ responseId: null, uploadId: 'U1' });
    expect(d.mint).toHaveBeenCalledTimes(1);
  });

  test('a failed attempt keeps its URL: the next Retry reuses it instead of minting', async () => {
    const { d, saved } = deps({ create: jest.fn().mockRejectedValueOnce(new Error('Network request failed')).mockImplementation((t: UploadTicket) => Promise.resolve({ id: `row-${t.uploadId}` })) });
    await expect(ensureUploadRow(empty, d)).rejects.toThrow('Network');
    const kept = saved[saved.length - 1];
    await expect(ensureUploadRow(kept, d)).resolves.toMatchObject({ responseId: 'row-U1', uploadId: 'U1' });
    expect(d.mint).toHaveBeenCalledTimes(1);
  });

  test('a URL the server refuses as stale is forgotten: the next Retry mints a new one', async () => {
    const { d, saved } = deps({ create: jest.fn().mockRejectedValueOnce(new Error('upload_expired')).mockImplementation((t: UploadTicket) => Promise.resolve({ id: `row-${t.uploadId}` })) });
    await expect(ensureUploadRow(empty, d)).rejects.toThrow('upload_expired');
    const cleared = saved[saved.length - 1];
    expect(cleared).toMatchObject({ uploadId: '', uploadUrl: '' });
    await expect(ensureUploadRow(cleared, d)).resolves.toMatchObject({ responseId: 'row-U2' });
    expect(d.mint).toHaveBeenCalledTimes(2);
  });

  test('an old saved URL is not used', async () => {
    const { d } = deps();
    await ensureUploadRow({ ...empty, uploadId: 'old', uploadUrl: 'https://old', uploadUrlExpiresAt: 1000 }, d);
    expect(d.mint).toHaveBeenCalledTimes(1);
    expect(d.create).toHaveBeenCalledWith(ticket(1));
  });

  test('a post with a row is left alone', async () => {
    const { d } = deps();
    const post = { ...empty, responseId: 'r1', uploadId: 'U9', uploadUrl: 'https://x', uploadUrlExpiresAt: 9e12 };
    await expect(ensureUploadRow(post, d)).resolves.toBe(post);
    expect(d.mint).not.toHaveBeenCalled();
    expect(d.create).not.toHaveBeenCalled();
  });

  describe('with a submission (replayable): a lost answer comes back as the same row', () => {
    const sent: P = { responseId: null, uploadId: 'U0', uploadUrl: 'https://storage.example/0', uploadUrlExpiresAt: 1000 }; // long expired

    test('a URL already sent is sent again as it is, even if old: the server returns the row it made', async () => {
      const { d } = deps({ replayable: true, create: jest.fn((t: UploadTicket) => Promise.resolve({ id: `row-${t.uploadId}` })) });
      await expect(ensureUploadRow(sent, d)).resolves.toMatchObject({ responseId: 'row-U0', uploadId: 'U0' });
      expect(d.mint).not.toHaveBeenCalled();
    });

    test.each(['upload_expired', 'upload_cancelled', 'upload_not_found'])('refused as %s: no row was made with it, so a fresh URL is minted and used at once', async (reason) => {
      const { d, saved } = deps({ replayable: true, create: jest.fn((t: UploadTicket) => (t.uploadId === 'U0' ? Promise.reject(serverError(reason, true)) : Promise.resolve({ id: `row-${t.uploadId}` }))) });
      await expect(ensureUploadRow(sent, d)).resolves.toMatchObject({ responseId: 'row-U1', uploadId: 'U1' });
      expect(d.mint).toHaveBeenCalledTimes(1);
      expect(saved.find((p) => p.uploadId === 'U1' && p.responseId === null)).toBeTruthy(); // saved before the request
    });

    test('upload_already_used for a URL already sent (a server without submissions): kept, nothing minted, no second row', async () => {
      const { d, saved } = deps({ replayable: true, create: jest.fn(() => Promise.reject(serverError('upload_already_used', true))) });
      await expect(ensureUploadRow(sent, d)).rejects.toThrow('upload_already_used');
      expect(d.mint).not.toHaveBeenCalled();
      expect(saved.every((p) => p.uploadId === 'U0')).toBe(true);
    });

    test('the same for a recording without a submission (older build): never a second row', async () => {
      const { d } = deps({ create: jest.fn(() => Promise.reject(serverError('upload_already_used', true))) });
      await expect(ensureUploadRow({ ...sent, uploadUrlExpiresAt: 9e12 }, d)).rejects.toThrow('upload_already_used');
      expect(d.mint).not.toHaveBeenCalled();
    });

    test('no answer again: the URL is kept for the next Retry', async () => {
      const { d, saved } = deps({ replayable: true, create: jest.fn(() => Promise.reject(serverError('TypeError: Network request failed', false))) });
      await expect(ensureUploadRow(sent, d)).rejects.toThrow('Network');
      expect(d.mint).not.toHaveBeenCalled();
      expect(saved).toEqual([]);
    });
  });

  test('a mint refusal is thrown, as before (the banner shows the reason)', async () => {
    const { d } = deps({ mint: jest.fn(() => Promise.reject(new Error('upload_limit_hour'))) });
    await expect(ensureUploadRow(empty, d)).rejects.toThrow('upload_limit_hour');
    expect(d.create).not.toHaveBeenCalled();
  });
});
