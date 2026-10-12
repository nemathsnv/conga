// Post-time rules (security stage 2): no silent Post. A refused upload URL becomes a failed post
// with its reason; a stale review-time URL is replaced once; restrictions still reach Post Review.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadPendingPost } from '@/video/pendingPost';
import { prepareUpload, uploadFailedDetail } from '@/video/postingFlow';
import type { UploadTicket } from '@/video/upload';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));

const review: UploadTicket = { uploadId: 'upReview', uploadUrl: 'https://storage.example/review' };
const fresh: UploadTicket = { uploadId: 'upFresh', uploadUrl: 'https://storage.example/fresh' };
const fail = (reason: string) => () => Promise.reject(new Error(reason));

function setup(opts: { mint?: () => Promise<UploadTicket>; create?: (t: UploadTicket) => Promise<{ id: string }> } = {}) {
  const mint = jest.fn(opts.mint ?? (() => Promise.resolve(fresh)));
  const create = jest.fn(opts.create ?? ((t: UploadTicket) => Promise.resolve({ id: `row-${t.uploadId}` })));
  return { mint, create };
}

describe('prepareUpload', () => {
  test('normal posting: the review-time URL is used, nothing else is minted', async () => {
    const { mint, create } = setup();
    await expect(prepareUpload({ ticket: review, mint, create })).resolves.toEqual({ ok: true, ticket: review, row: { id: 'row-upReview' } });
    expect(mint).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('no review-time URL: one is minted at Post', async () => {
    const { mint, create } = setup();
    await expect(prepareUpload({ ticket: null, mint, create })).resolves.toEqual({ ok: true, ticket: fresh, row: { id: 'row-upFresh' } });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test.each(['upload_limit_hour', 'upload_limit_day', 'upload_limit_active', 'mint_failed'])('a %s refusal at Post is a failed post with that reason, not a silent one', async (reason) => {
    const { mint, create } = setup({ mint: fail(reason) });
    await expect(prepareUpload({ ticket: null, mint, create })).resolves.toEqual({ ok: false, reason });
    expect(create).not.toHaveBeenCalled();
  });

  test.each(['posting_paused', 'suspended', 'account_deleted'])('a %s refusal is thrown for Post Review (A-Restricted, LV-Suspended)', async (reason) => {
    const { mint, create } = setup({ mint: fail(reason) });
    await expect(prepareUpload({ ticket: null, mint, create })).rejects.toThrow(reason);
    expect(create).not.toHaveBeenCalled();
  });

  test('a restriction from post_response with a review-time URL is thrown as before, with no new mint', async () => {
    const { mint, create } = setup({ create: fail('posting_paused') });
    await expect(prepareUpload({ ticket: review, mint, create })).rejects.toThrow('posting_paused');
    expect(mint).not.toHaveBeenCalled();
  });

  test.each(['upload_cancelled', 'upload_expired', 'upload_already_used', 'upload_not_found'])('a review-time URL refused as %s is replaced once', async (reason) => {
    const { mint, create } = setup({ create: (t) => (t === review ? Promise.reject(new Error(reason)) : Promise.resolve({ id: 'row-fresh' })) });
    await expect(prepareUpload({ ticket: review, mint, create })).resolves.toEqual({ ok: true, ticket: fresh, row: { id: 'row-fresh' } });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(create.mock.calls.map(([t]) => t.uploadId)).toEqual(['upReview', 'upFresh']);
  });

  test('a stale review-time URL whose replacement is refused for a limit becomes a failed post', async () => {
    const { mint, create } = setup({ mint: fail('upload_limit_hour'), create: fail('upload_cancelled') });
    await expect(prepareUpload({ ticket: review, mint, create })).resolves.toEqual({ ok: false, reason: 'upload_limit_hour' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('only one replacement: a second refusal is thrown, not retried again', async () => {
    const { mint, create } = setup({ create: fail('upload_cancelled') });
    await expect(prepareUpload({ ticket: review, mint, create })).rejects.toThrow('upload_cancelled');
    expect(mint).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);
  });

  test('a URL minted at Post is never replaced', async () => {
    const { mint, create } = setup({ create: fail('upload_expired') });
    await expect(prepareUpload({ ticket: null, mint, create })).rejects.toThrow('upload_expired');
    expect(mint).toHaveBeenCalledTimes(1);
  });

  test('other refusals from post_response are thrown as before, with no new mint', async () => {
    const { mint, create } = setup({ create: fail('already_responded') });
    await expect(prepareUpload({ ticket: review, mint, create })).rejects.toThrow('already_responded');
    expect(mint).not.toHaveBeenCalled();
  });
});

describe('uploadFailedDetail (the Upload failed banner, X-Upload-Failed)', () => {
  test('the hourly limit says so', () => {
    expect(uploadFailedDetail('upload_limit_hour')).toBe("It's saved on this phone. You've reached the limit of 10 uploads an hour. Retry later.");
  });
  test('the daily limit says so', () => {
    expect(uploadFailedDetail('upload_limit_day')).toBe("It's saved on this phone. You've reached the limit of 30 uploads a day. Retry later.");
  });
  test('no free upload slot says so', () => {
    expect(uploadFailedDetail('upload_limit_active')).toBe("It's saved on this phone. Uploading isn't available right now. Retry later.");
  });
  test.each([null, 'mint_failed', 'interrupted', 'offline', 'upload_http_500', 'processing_timeout'])('%s keeps the board line', (reason) => {
    expect(uploadFailedDetail(reason)).toBe("It's saved on this phone. Check your connection.");
  });
});

describe('loadPendingPost', () => {
  const base = { kind: 'response', draftFor: null, replyToId: null, replyToName: null, promptId: 'p', promptText: 't', recording: { segments: [], durationMs: 5000 }, caption: null, uploadId: '', uploadUrl: '', uploadUrlExpiresAt: 0, playbackId: null, state: 'failed', attempts: 0, failedReason: 'upload_limit_hour' };
  test('a failed post that never got a row survives a restart', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ ...base, responseId: null }));
    await expect(loadPendingPost()).resolves.toMatchObject({ responseId: null, failedReason: 'upload_limit_hour' });
  });
  test('a posted one still does', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ ...base, responseId: 'r1' }));
    await expect(loadPendingPost()).resolves.toMatchObject({ responseId: 'r1' });
  });
  test('anything else is ignored', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ ...base, responseId: 42 }));
    await expect(loadPendingPost()).resolves.toBeNull();
  });
});
