// Stitching a take's segments on Post Review (docs/BLOCKERS.md B-1): once per recording, cached for
// Post, the segment files deleted only after the stitched file is kept, typed errors, and upload
// refusing anything that is not one file. The native module is mocked; it runs only on a phone.
import { abandonStitch, ensureStitched, needsStitching, resetStitchesForTests, StitchError, toStitchError, type StitchDeps } from '@/video/stitch';
import { uploadableFile } from '@/video/upload';
import type { Recording } from '@/video/types';

jest.mock('../../modules/video-stitcher', () => ({ stitch: jest.fn(), isAvailable: () => false }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0 },
  Directory: class {},
  Paths: {},
  File: class {
    uri: string;
    exists = true;
    constructor(uri: string) {
      this.uri = uri;
    }
  },
}));

const take: Recording = {
  id: 'rec-1',
  submissionId: 'sub-1',
  promptId: 'p',
  segments: [
    { uri: 'file:///take/a.mov', facing: 'front', durationMs: 3000 },
    { uri: 'file:///take/b.mov', facing: 'back', durationMs: 4000 },
    { uri: 'file:///take/c.mov', facing: 'front', durationMs: 2000 },
  ],
  durationMs: 9000,
  createdAt: 1,
};

function fakeDeps(stitch: StitchDeps['stitch'] = () => Promise.resolve('file:///cache/VideoStitcher/out.mp4')) {
  const log: string[] = [];
  const deps: StitchDeps = {
    stitch: jest.fn((uris: string[]) => {
      log.push(`stitch ${uris.join(',')}`);
      return stitch(uris);
    }),
    keep: jest.fn((uri: string) => {
      log.push(`keep ${uri}`);
      return 'file:///recordings/stitched.mp4';
    }),
    deleteFile: jest.fn((uri: string) => {
      log.push(`delete ${uri}`);
    }),
  };
  return { deps, log };
}

beforeEach(() => resetStitchesForTests());

test('one segment needs no stitching and is returned as it is', async () => {
  const one = { ...take, id: 'one', segments: [take.segments[0]], durationMs: 3000 };
  const { deps } = fakeDeps();
  expect(needsStitching(one)).toBe(false);
  await expect(ensureStitched(one, deps)).resolves.toBe(one);
  expect(deps.stitch).not.toHaveBeenCalled();
});

test('the segments are stitched in order into one file; they are deleted only after it is kept', async () => {
  const { deps, log } = fakeDeps();
  const stitched = await ensureStitched(take, deps);
  expect(log).toEqual([
    'stitch file:///take/a.mov,file:///take/b.mov,file:///take/c.mov',
    'keep file:///cache/VideoStitcher/out.mp4',
    'delete file:///take/a.mov',
    'delete file:///take/b.mov',
    'delete file:///take/c.mov',
  ]);
  expect(stitched).toEqual({ ...take, segments: [{ uri: 'file:///recordings/stitched.mp4', facing: 'front', durationMs: 9000 }] });
  // Same recording for the pipeline: same id and submission id, one file.
  expect(stitched.submissionId).toBe('sub-1');
  expect(needsStitching(stitched)).toBe(false);
});

test('stitched once: Post waiting during the stitch, or after it, gets the same result', async () => {
  let finish!: (uri: string) => void;
  const { deps } = fakeDeps(() => new Promise((r) => (finish = r)));
  const onReview = ensureStitched(take, deps);
  const onPost = ensureStitched(take, deps);
  expect(onPost).toBe(onReview);
  finish('file:///cache/VideoStitcher/out.mp4');
  const a = await onReview;
  const b = await ensureStitched(take, deps);
  expect(b).toBe(a);
  expect(deps.stitch).toHaveBeenCalledTimes(1);
});

test('a failed stitch keeps the segments, rejects with a typed error, and can be tried again', async () => {
  const failing = fakeDeps(() => Promise.reject(Object.assign(new Error('The segments could not be joined: x'), { code: 'ERR_STITCH_EXPORT' })));
  await expect(ensureStitched(take, failing.deps)).rejects.toMatchObject({ name: 'StitchError', code: 'stitch_failed', message: 'stitch_failed' });
  expect(failing.deps.deleteFile).not.toHaveBeenCalled();
  expect(failing.deps.keep).not.toHaveBeenCalled();
  const working = fakeDeps();
  await expect(ensureStitched(take, working.deps)).resolves.toMatchObject({ segments: [{ uri: 'file:///recordings/stitched.mp4' }] });
});

test('native errors map to stitch error codes', () => {
  expect(toStitchError(Object.assign(new Error('a'), { code: 'ERR_STITCH_INPUT' })).code).toBe('stitch_input');
  expect(toStitchError(Object.assign(new Error('b'), { code: 'ERR_STITCH_EXPORT' })).code).toBe('stitch_failed');
  expect(toStitchError(Object.assign(new Error('c'), { code: 'ERR_STITCH_UNAVAILABLE' })).code).toBe('stitch_unavailable');
  expect(toStitchError(new Error('anything else')).code).toBe('stitch_failed');
  expect(toStitchError('text').detail).toBe('text');
  const own = new StitchError('stitch_cancelled');
  expect(toStitchError(own)).toBe(own);
  expect(toStitchError(Object.assign(new Error('a'), { code: 'ERR_STITCH_INPUT' })).detail).toBe('a');
});

test('discarded while stitching: the output is deleted when the stitch ends, nothing is kept', async () => {
  let finish!: (uri: string) => void;
  const { deps, log } = fakeDeps(() => new Promise((r) => (finish = r)));
  const job = ensureStitched(take, deps);
  abandonStitch(take);
  finish('file:///cache/VideoStitcher/out.mp4');
  await expect(job).rejects.toMatchObject({ code: 'stitch_cancelled' });
  expect(log).toEqual(['stitch file:///take/a.mov,file:///take/b.mov,file:///take/c.mov', 'delete file:///cache/VideoStitcher/out.mp4']);
  expect(deps.keep).not.toHaveBeenCalled();
});

test('a stitched file that cannot be kept is deleted and the segments stay', async () => {
  const { deps } = fakeDeps();
  (deps.keep as jest.Mock).mockImplementation(() => {
    throw new Error('disk full');
  });
  await expect(ensureStitched(take, deps)).rejects.toMatchObject({ code: 'stitch_failed', detail: 'disk full' });
  expect((deps.deleteFile as jest.Mock).mock.calls).toEqual([['file:///cache/VideoStitcher/out.mp4']]);
});

test('upload refuses a take that is not stitched, and sends the stitched file', async () => {
  expect(() => uploadableFile(take)).toThrow('stitching_required');
  const { deps } = fakeDeps();
  const stitched = await ensureStitched(take, deps);
  expect(uploadableFile(stitched).uri).toBe('file:///recordings/stitched.mp4');
});
