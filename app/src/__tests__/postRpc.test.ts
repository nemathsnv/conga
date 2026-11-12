// Review of 13 Oct, I4 and B3: the posting calls always carry the submission id, with no silent
// fallback; the discard asks abandon-submission and treats no answer as "unknown".
import { postReply, postResponse } from '@/lib/content';
import { requestAbandon } from '@/video/upload';

const mockRpc = jest.fn();
const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a), functions: { invoke: (...a: unknown[]) => mockInvoke(...a) } } }));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {}, UploadType: { BINARY_CONTENT: 0 } }));

beforeEach(() => {
  mockRpc.mockReset();
  mockInvoke.mockReset();
});

describe('posting calls carry the submission id; nothing drops it', () => {
  test('the id is sent as p_submission', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'r1' }, error: null });
    await postResponse('p1', 'U1', null, 5000, 'sub-1');
    expect(mockRpc).toHaveBeenCalledWith('post_response', { p_prompt: 'p1', p_upload_id: 'U1', p_caption: null, p_duration_ms: 5000, p_submission: 'sub-1' });
  });

  test('a database without the function (PGRST202) is a refusal: no second call without the id', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.post_reply', code: 'PGRST202' } });
    await expect(postReply('v1', 'U1', null, 5000, 'sub-1')).rejects.toMatchObject({ refused: true });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['a gateway error without a code', { message: 'upstream error' }, false],
    ['a database refusal', { message: 'already_responded', code: 'P0001' }, true],
  ])('%s is thrown once, never retried without the id', async (_n, error, refused) => {
    mockRpc.mockResolvedValue({ data: null, error });
    await expect(postResponse('p1', 'U1', null, 5000, 'sub-1')).rejects.toMatchObject({ refused });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  test('a recording from an older build (no id) is posted as before', async () => {
    mockRpc.mockResolvedValue({ data: { id: 'r1' }, error: null });
    await postResponse('p1', 'U1', null, 5000, undefined);
    expect(mockRpc).toHaveBeenCalledWith('post_response', { p_prompt: 'p1', p_upload_id: 'U1', p_caption: null, p_duration_ms: 5000 });
  });
});

describe('requestAbandon (abandon-submission)', () => {
  test('the answer is returned', async () => {
    mockInvoke.mockResolvedValue({ data: { outcome: 'kept', reason: 'at_mux', responseId: 'r1' }, error: null });
    await expect(requestAbandon('sub-1')).resolves.toEqual({ outcome: 'kept', reason: 'at_mux', responseId: 'r1' });
    expect(mockInvoke).toHaveBeenCalledWith('abandon-submission', { method: 'POST', body: { submissionId: 'sub-1' } });
  });

  test.each([
    ['no answer', { data: null, error: new Error('fetch failed') }],
    ['an unexpected body', { data: { outcome: 'deleted' }, error: null }],
  ])('%s is thrown (unknown: nothing may be deleted)', async (_n, res) => {
    mockInvoke.mockResolvedValue(res);
    await expect(requestAbandon('sub-1')).rejects.toThrow('abandon_failed');
  });
});
