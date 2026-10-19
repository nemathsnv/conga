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

test('progress is reported once per whole percent, and the end always', async () => {
  let report: (p: { bytesSent: number; totalBytes: number }) => void = () => undefined;
  mockCreateUploadTask.mockImplementation((_url: string, options: { onProgress: typeof report }) => {
    report = options.onProgress;
    return {
      uploadAsync: async () => {
        // 1000 chunk reports for 100 bytes: many within the same percent.
        for (let i = 1; i <= 1000; i += 1) report({ bytesSent: i / 10, totalBytes: 100 });
        return { status: 200 };
      },
    };
  });
  const progress = jest.fn();
  await putRecording(recording, 'https://storage.example/1', progress);
  expect(progress.mock.calls.length).toBeLessThanOrEqual(102);
  expect(progress).toHaveBeenLastCalledWith(1);
  const fractions = progress.mock.calls.map((c) => c[0] as number);
  expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
});
