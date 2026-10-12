// mintUpload: the server's refusal reason reaches Post Review (security stage 2), so A-Restricted
// and LV-Suspended still show when posting is refused at minting rather than at post_response.
import { mintUpload } from '@/video/upload';

const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => mockInvoke(...a) } } }));
jest.mock('expo-file-system', () => ({ File: class {}, UploadType: { BINARY_CONTENT: 0 } }));

/** What supabase-js returns for a non-2xx function answer: a FunctionsHttpError whose context is the Response. */
function httpError(status: number, body: unknown) {
  const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  });
  return { data: null, error };
}

beforeEach(() => mockInvoke.mockReset());

test('a minted URL is returned as before', async () => {
  mockInvoke.mockResolvedValue({ data: { uploadId: 'abc123', uploadUrl: 'https://storage.example/u' }, error: null });
  await expect(mintUpload()).resolves.toEqual({ uploadId: 'abc123', uploadUrl: 'https://storage.example/u' });
  expect(mockInvoke).toHaveBeenCalledWith('mux-create-upload', { method: 'POST' });
});

test.each(['posting_paused', 'suspended', 'account_deleted', 'profile_required', 'upload_limit_hour', 'upload_limit_day', 'upload_limit_active'])(
  'a %s refusal is thrown as that reason',
  async (reason) => {
    mockInvoke.mockResolvedValue(httpError(reason.startsWith('upload_limit') ? 429 : 403, { error: reason }));
    await expect(mintUpload()).rejects.toThrow(reason);
  },
);

test('Post Review matches the restriction reasons it already handles', async () => {
  mockInvoke.mockResolvedValue(httpError(403, { error: 'posting_paused' }));
  const message = await mintUpload().then(() => '', (e: Error) => e.message);
  expect(message.includes('posting_paused') || message.includes('suspended')).toBe(true);
});

test('anything else is mint_failed, as before', async () => {
  mockInvoke.mockResolvedValue(httpError(502, { error: 'mux_unavailable' }));
  await expect(mintUpload()).rejects.toThrow('mint_failed');
  mockInvoke.mockResolvedValue(httpError(500, 'not json'));
  await expect(mintUpload()).rejects.toThrow('mint_failed');
  mockInvoke.mockResolvedValue({ data: null, error: new Error('network') });
  await expect(mintUpload()).rejects.toThrow('mint_failed');
  mockInvoke.mockResolvedValue({ data: { uploadId: 'abc' }, error: null });
  await expect(mintUpload()).rejects.toThrow('mint_failed');
});

test('an unknown error code from the server is not passed through', async () => {
  mockInvoke.mockResolvedValue(httpError(403, { error: 'something_else' }));
  await expect(mintUpload()).rejects.toThrow('mint_failed');
});
