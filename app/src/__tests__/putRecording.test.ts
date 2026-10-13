// putRecording runs in the foreground (SPEC.md Sections 2, 19, 22): expo-file-system's iOS
// default is a background URLSession that keeps sending after the app is suspended or closed.
import { putRecording } from '@/video/upload';

const mockCreateUploadTask = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0 },
  File: class {
    exists = true;
    size = 100;
    createUploadTask(url: string, options: unknown) {
      return mockCreateUploadTask(url, options);
    }
  },
}));

const recording = { id: 'rec', promptId: 'p', segments: [{ uri: 'file:///rec.mp4', facing: 'front' as const, durationMs: 5000 }], durationMs: 5000, createdAt: 0 };

beforeEach(() => mockCreateUploadTask.mockReset());

test('the upload uses the foreground session and the sign-out signal', async () => {
  mockCreateUploadTask.mockReturnValue({ uploadAsync: () => Promise.resolve({ status: 200 }) });
  const abort = new AbortController();
  const progress = jest.fn();
  await putRecording(recording, 'https://storage.example/1', progress, abort.signal);
  expect(mockCreateUploadTask).toHaveBeenCalledWith('https://storage.example/1', expect.objectContaining({ httpMethod: 'PUT', sessionType: 'foreground', signal: abort.signal }));
  expect(progress).toHaveBeenLastCalledWith(1);
});

test('a non-2xx answer fails the upload', async () => {
  mockCreateUploadTask.mockReturnValue({ uploadAsync: () => Promise.resolve({ status: 410 }) });
  await expect(putRecording(recording, 'https://storage.example/1', jest.fn())).rejects.toThrow('upload_http_410');
});
