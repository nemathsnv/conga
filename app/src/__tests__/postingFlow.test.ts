// Post-time rules (security stage 2): no silent Post. A refused upload URL becomes a failed post
// with its reason; a stale review-time URL is replaced once; restrictions still reach Post Review.
// 13 Oct: a server refusal (ServerError.refused) is told apart from no answer, which may have
// made the row: that URL goes with the post, for Retry to send the same request again.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadPendingPost } from '@/video/pendingPost';
import { prepareUpload, uploadFailedDetail } from '@/video/postingFlow';
import { createTicketStore } from '@/video/ticketStore';
import type { UploadTicket } from '@/video/upload';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));

const review: UploadTicket = { uploadId: 'upReview', uploadUrl: 'https://storage.example/review' };
const fresh: UploadTicket = { uploadId: 'upFresh', uploadUrl: 'https://storage.example/fresh' };
/** What lib/content throws for a server refusal (it answered with an error code: nothing happened). */
const refusal = (reason: string) => Object.assign(new Error(reason), { refused: true });
const fail = (reason: string) => () => Promise.reject(refusal(reason));
/** No answer (a network failure): the row may or may not exist. */
const noAnswer = () => Object.assign(new Error('TypeError: Network request failed'), { refused: false });

/**
 * The real ticket store with a mocked mint. reviewed: Post Review asked for a URL (and got
 * `review`) before Post; otherwise Post is the first to ask.
 */
async function setup(opts: { reviewed?: boolean; mint?: () => Promise<UploadTicket>; create?: (t: UploadTicket) => Promise<{ id: string }> } = {}) {
  const queue: (() => Promise<UploadTicket>)[] = opts.reviewed ? [() => Promise.resolve(review)] : [];
  const later = opts.mint ?? (() => Promise.resolve(fresh));
  const mint = jest.fn(() => (queue.shift() ?? later)());
  const create = jest.fn(opts.create ?? ((t: UploadTicket) => Promise.resolve({ id: `row-${t.uploadId}` })));
  const store = createTicketStore(mint);
  if (opts.reviewed) {
    store.prefetch('member');
    await store.forOwner('member').get();
    mint.mockClear();
  }
  return { mint, create, store, tickets: store.forOwner('member') };
}

describe('prepareUpload', () => {
  test('normal posting: the review-time URL is used, nothing else is minted', async () => {
    const { mint, create, tickets } = await setup({ reviewed: true });
    await expect(prepareUpload({ tickets, create })).resolves.toEqual({ ok: true, ticket: review, mintedAt: expect.any(Number), row: { id: 'row-upReview' } });
    expect(mint).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('the posted URL leaves the store: the next post asks for a new one', async () => {
    const { mint, create, tickets } = await setup({ reviewed: true });
    await prepareUpload({ tickets, create });
    await expect(tickets.get()).resolves.toEqual({ ticket: fresh, mintedAt: expect.any(Number), replaceable: false });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test('no review-time URL: one is minted at Post', async () => {
    const { mint, create, tickets } = await setup();
    await expect(prepareUpload({ tickets, create })).resolves.toEqual({ ok: true, ticket: fresh, mintedAt: expect.any(Number), row: { id: 'row-upFresh' } });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test.each(['upload_limit_hour', 'upload_limit_day', 'upload_limit_active', 'mint_failed'])('a %s refusal at Post is a failed post with that reason, not a silent one', async (reason) => {
    const { create, tickets } = await setup({ mint: fail(reason) });
    await expect(prepareUpload({ tickets, create })).resolves.toEqual({ ok: false, reason });
    expect(create).not.toHaveBeenCalled();
  });

  test.each(['posting_paused', 'suspended', 'account_deleted'])('a %s refusal is thrown for Post Review (A-Restricted, LV-Suspended)', async (reason) => {
    const { create, tickets } = await setup({ mint: fail(reason) });
    await expect(prepareUpload({ tickets, create })).rejects.toThrow(reason);
    expect(create).not.toHaveBeenCalled();
  });

  test('a restriction from post_response with a review-time URL is thrown as before, with no new mint', async () => {
    const { mint, create, tickets } = await setup({ reviewed: true, create: fail('posting_paused') });
    await expect(prepareUpload({ tickets, create })).rejects.toThrow('posting_paused');
    expect(mint).not.toHaveBeenCalled();
  });

  test.each(['upload_cancelled', 'upload_expired', 'upload_already_used', 'upload_not_found'])('a review-time URL refused as %s is replaced once', async (reason) => {
    const { mint, create, tickets } = await setup({ reviewed: true, create: (t) => (t === review ? Promise.reject(refusal(reason)) : Promise.resolve({ id: 'row-fresh' })) });
    await expect(prepareUpload({ tickets, create })).resolves.toEqual({ ok: true, ticket: fresh, mintedAt: expect.any(Number), row: { id: 'row-fresh' } });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(create.mock.calls.map(([t]) => t.uploadId)).toEqual(['upReview', 'upFresh']);
  });

  test('a stale review-time URL whose replacement is refused for a limit becomes a failed post', async () => {
    const { create, tickets } = await setup({ reviewed: true, mint: fail('upload_limit_hour'), create: fail('upload_cancelled') });
    await expect(prepareUpload({ tickets, create })).resolves.toEqual({ ok: false, reason: 'upload_limit_hour' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('only one replacement: a second refusal is thrown, not retried again', async () => {
    const { mint, create, tickets } = await setup({ reviewed: true, create: fail('upload_cancelled') });
    await expect(prepareUpload({ tickets, create })).rejects.toThrow('upload_cancelled');
    expect(mint).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);
  });

  test('a URL minted at Post is never replaced, and is forgotten so the next Post asks again', async () => {
    const { mint, create, tickets } = await setup({ create: fail('upload_expired') });
    await expect(prepareUpload({ tickets, create })).rejects.toThrow('upload_expired');
    expect(mint).toHaveBeenCalledTimes(1);
    await tickets.get();
    expect(mint).toHaveBeenCalledTimes(2);
  });

  test('other refusals from post_response are thrown as before, with no new mint, and the URL is kept for the next Post', async () => {
    const { mint, create, tickets } = await setup({ reviewed: true, create: fail('already_responded') });
    await expect(prepareUpload({ tickets, create })).rejects.toThrow('already_responded');
    expect(mint).not.toHaveBeenCalled();
    await expect(tickets.get()).resolves.toMatchObject({ ticket: review });
    expect(mint).not.toHaveBeenCalled();
  });

  test('lost answer: the URL goes with the post (sent), leaves the store, and nothing is minted or replaced', async () => {
    const { mint, create, tickets } = await setup({ reviewed: true, create: () => Promise.reject(noAnswer()) });
    await expect(prepareUpload({ tickets, create })).resolves.toEqual({ ok: false, reason: 'TypeError: Network request failed', sent: { ticket: review, mintedAt: expect.any(Number) } });
    expect(mint).not.toHaveBeenCalled();
    // The next recording's Post never gets that URL: it may be held by the first recording's row.
    await expect(tickets.get()).resolves.toMatchObject({ ticket: fresh });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test('an error that is not a server refusal is treated as no answer (the row may exist), never as a refusal', async () => {
    const { create, tickets } = await setup({ reviewed: true, create: () => Promise.reject(new Error('anything')) });
    await expect(prepareUpload({ tickets, create })).resolves.toMatchObject({ ok: false, sent: { ticket: review } });
  });

  test('a stale URL replaced after a refusal: the fresh one is the one that goes with the post if its answer is lost', async () => {
    const { create, tickets } = await setup({ reviewed: true, create: (t) => Promise.reject(t === review ? refusal('upload_expired') : noAnswer()) });
    await expect(prepareUpload({ tickets, create })).resolves.toMatchObject({ ok: false, sent: { ticket: fresh } });
  });

  test('beforeSend runs before each request for a row, with the URL about to be sent', async () => {
    const order: string[] = [];
    const { tickets } = await setup({ reviewed: true });
    const create = jest.fn(async (t: UploadTicket) => {
      order.push(`create ${t.uploadId}`);
      if (t === review) throw refusal('upload_cancelled');
      return { id: 'row' };
    });
    await prepareUpload({ tickets, create, beforeSend: async (s) => void order.push(`store ${s.ticket.uploadId}`) });
    expect(order).toEqual(['store upReview', 'create upReview', 'store upFresh', 'create upFresh']);
  });

  test('beforeSend failing (storage) sends nothing', async () => {
    const { create, tickets } = await setup({ reviewed: true });
    await expect(prepareUpload({ tickets, create, beforeSend: () => Promise.reject(new Error('storage_failed')) })).rejects.toThrow('storage_failed');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('uploadFailedDetail (the Upload failed banner, X-Upload-Failed)', () => {
  test('the limit lines make no claim about the recording being saved', () => {
    for (const r of ['upload_limit_hour', 'upload_limit_day', 'upload_limit_active']) expect(uploadFailedDetail(r)).not.toMatch(/saved/i);
  });
  test('the hourly limit says so', () => {
    expect(uploadFailedDetail('upload_limit_hour')).toBe("You've reached the limit of 10 uploads per hour. Try again later.");
  });
  test('the daily limit says so', () => {
    expect(uploadFailedDetail('upload_limit_day')).toBe("You've reached the limit of 30 uploads in 24 hours. Try again later.");
  });
  test('no free upload slot says so', () => {
    expect(uploadFailedDetail('upload_limit_active')).toBe("Uploading isn't available right now. Try again later.");
  });
  test.each([null, 'mint_failed', 'interrupted', 'offline', 'upload_http_500', 'processing_timeout'])('%s keeps the board line unchanged', (reason) => {
    expect(uploadFailedDetail(reason)).toBe("It's saved on this phone. Check your connection.");
  });
});

describe('loadPendingPost', () => {
  const base = { ownerId: 'member', kind: 'response', draftFor: null, replyToId: null, replyToName: null, promptId: 'p', promptText: 't', recording: { segments: [], durationMs: 5000 }, caption: null, uploadId: '', uploadUrl: '', uploadUrlExpiresAt: 0, playbackId: null, state: 'failed', attempts: 0, failedReason: 'upload_limit_hour' };
  test('a failed post that never got a row survives a restart', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ ...base, responseId: null }));
    await expect(loadPendingPost('member')).resolves.toMatchObject({ responseId: null, failedReason: 'upload_limit_hour' });
  });
  test('a posted one still does', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ ...base, responseId: 'r1' }));
    await expect(loadPendingPost('member')).resolves.toMatchObject({ responseId: 'r1' });
  });
  test('it is read from the member\'s own slot; another member\'s post is not theirs', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ ...base, responseId: 'r1' }));
    await loadPendingPost('member');
    expect(AsyncStorage.getItem).toHaveBeenLastCalledWith('shortcut.pendingPost.member');
    await expect(loadPendingPost('someone-else')).resolves.toBeNull();
    await expect(loadPendingPost(null)).resolves.toBeNull();
  });
  test('anything else is ignored', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ ...base, responseId: 42 }));
    await expect(loadPendingPost('member')).resolves.toBeNull();
  });
});
