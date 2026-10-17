// A waiting recording after an app update: iOS can move the app to a new container (a new id in
// its path) when a build is installed over another. The file is still in Documents/recordings/, but
// the absolute URI the post stored names the old container. Loading the post finds it again, so
// the post comes back as Upload failed with Retry (P1), not as "no longer on this phone" (P3).
import AsyncStorage from '@react-native-async-storage/async-storage';

import { failedView } from '@/ui/failedPost';
import { createMemberPosting } from '@/video/memberPosting';
import { loadPendingPostOrThrow, savePendingPostOrThrow } from '@/video/pendingPost';
import { newPendingPost, resolveRecordingUri, withRecordingFilesFound, type PendingPost } from '@/video/pendingPostState';
import type { Recording } from '@/video/types';
import { recordingOnPhone } from '@/video/upload';
import type { PostingState } from '@/video/uploadRun';

const OLD_DOCS = 'file:///var/mobile/Containers/Data/Application/OLD-0001/Documents/';
const NEW_DOCS = 'file:///var/mobile/Containers/Data/Application/NEW-0002/Documents/';

/** The phone's files, by URI. */
const mockFiles = new Set<string>();
const mockStore = new Map<string, string>();

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
  removeItem: jest.fn(async (k: string) => void mockStore.delete(k)),
}));
jest.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0 },
  Paths: { document: { uri: 'file:///var/mobile/Containers/Data/Application/NEW-0002/Documents/' } },
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
  },
}));

const exists = (uri: string) => mockFiles.has(uri);

beforeEach(() => {
  mockFiles.clear();
  mockStore.clear();
  (AsyncStorage.setItem as jest.Mock).mockClear();
});

describe('resolveRecordingUri', () => {
  test('an old container URI is rebuilt under the new Documents folder when the file is there', () => {
    mockFiles.add(`${NEW_DOCS}recordings/1-abc.mp4`);
    expect(resolveRecordingUri(`${OLD_DOCS}recordings/1-abc.mp4`, NEW_DOCS, exists)).toBe(`${NEW_DOCS}recordings/1-abc.mp4`);
  });

  test('a subfolder of recordings is kept', () => {
    mockFiles.add(`${NEW_DOCS}recordings/take/2-def.mov`);
    expect(resolveRecordingUri(`${OLD_DOCS}recordings/take/2-def.mov`, NEW_DOCS, exists)).toBe(`${NEW_DOCS}recordings/take/2-def.mov`);
  });

  test('a Documents folder without a trailing slash gives the same URI', () => {
    mockFiles.add(`${NEW_DOCS}recordings/1-abc.mp4`);
    expect(resolveRecordingUri(`${OLD_DOCS}recordings/1-abc.mp4`, NEW_DOCS.slice(0, -1), exists)).toBe(`${NEW_DOCS}recordings/1-abc.mp4`);
  });

  test('not rebuilt when the file is not in the new folder either (P3, as before)', () => {
    expect(resolveRecordingUri(`${OLD_DOCS}recordings/1-abc.mp4`, NEW_DOCS, exists)).toBe(`${OLD_DOCS}recordings/1-abc.mp4`);
  });

  test('a URI whose file exists is left as it is', () => {
    mockFiles.add(`${OLD_DOCS}recordings/1-abc.mp4`);
    mockFiles.add(`${NEW_DOCS}recordings/1-abc.mp4`);
    expect(resolveRecordingUri(`${OLD_DOCS}recordings/1-abc.mp4`, NEW_DOCS, exists)).toBe(`${OLD_DOCS}recordings/1-abc.mp4`);
  });

  test('a file outside recordings is never touched', () => {
    mockFiles.add(`${NEW_DOCS}Camera/1-abc.mp4`);
    mockFiles.add(`${NEW_DOCS}recordings/1-abc.mp4`);
    const checked: string[] = [];
    const uri = 'file:///var/mobile/Containers/Data/Application/OLD-0001/Library/Caches/Camera/1-abc.mp4';
    const checking = (u: string) => {
      checked.push(u);
      return exists(u);
    };
    expect(resolveRecordingUri(uri, NEW_DOCS, checking)).toBe(uri);
    expect(checked).toEqual([]);
  });
});

const recording = (uri: string): Recording => ({ id: 'rec-1', submissionId: 'sub-1', promptId: 'p1', segments: [{ uri, facing: 'front', durationMs: 5000 }], durationMs: 5000, createdAt: 0 });
const storedPost = (uri: string, state: PendingPost['state'] = 'uploading'): PendingPost =>
  newPendingPost(
    { ownerId: 'A', recording: recording(uri), promptId: 'p1', promptText: 'Prompt', caption: null },
    { responseId: 'row-1', uploadId: 'U1', uploadUrl: 'https://storage.example/1', mintedAt: 0 },
    state,
  );

describe('withRecordingFilesFound', () => {
  test('the same object when nothing moved; only the segment URI changes when it did', () => {
    const here = storedPost(`${NEW_DOCS}recordings/1-abc.mp4`);
    mockFiles.add(`${NEW_DOCS}recordings/1-abc.mp4`);
    expect(withRecordingFilesFound(here, NEW_DOCS, exists)).toBe(here);
    const old = storedPost(`${OLD_DOCS}recordings/1-abc.mp4`);
    expect(withRecordingFilesFound(old, NEW_DOCS, exists)).toEqual({ ...old, recording: { ...old.recording, segments: [{ ...old.recording.segments[0], uri: `${NEW_DOCS}recordings/1-abc.mp4` }] } });
  });
});

describe('Restore at launch after an app update moved the app\'s folders', () => {
  function member() {
    const shown: PostingState[] = [];
    const deps = {
      ownerId: 'A',
      load: () => loadPendingPostOrThrow('A'),
      save: (p: PendingPost | null) => savePendingPostOrThrow('A', p),
      createRow: jest.fn(async () => ({ id: 'row-1' })),
      upload: { mint: jest.fn(), retryResponseUpload: jest.fn(), put: jest.fn(), status: jest.fn(), waitUntilLive: jest.fn() },
      abandon: jest.fn(),
      deleteFiles: jest.fn(),
      fileExists: recordingOnPhone,
      online: () => true,
      track: jest.fn(),
      show: (s: PostingState) => void shown.push(s),
    };
    return { m: createMemberPosting(deps), deps, shown };
  }

  test('stored with the old container path, file in the new one: Upload failed with Retry (P1), not P3', async () => {
    await savePendingPostOrThrow('A', storedPost(`${OLD_DOCS}recordings/1-abc.mp4`));
    mockFiles.add(`${NEW_DOCS}recordings/1-abc.mp4`);
    const a = member();
    await a.m.resumeOnLaunch();
    expect(a.shown).toHaveLength(1);
    const shown = a.shown[0] as Extract<PostingState, { kind: 'failed' }>;
    expect(shown).toMatchObject({ kind: 'failed', post: { state: 'failed', failedReason: 'interrupted' } });
    expect(failedView(shown.post)).toBe('retry');
    expect(shown.post.recording.segments[0].uri).toBe(`${NEW_DOCS}recordings/1-abc.mp4`);
    // Nothing was written over the stored post at launch; its format is the one older builds read.
    expect(JSON.parse(mockStore.get('shortcut.pendingPost.A')!).recording.segments[0].uri).toBe(`${OLD_DOCS}recordings/1-abc.mp4`);
    expect(a.deps.abandon).not.toHaveBeenCalled();
  });

  test('stored with the old container path, file in neither: still "no longer on this phone" (P3)', async () => {
    await savePendingPostOrThrow('A', storedPost(`${OLD_DOCS}recordings/1-abc.mp4`));
    const a = member();
    await a.m.resumeOnLaunch();
    const shown = a.shown[0] as Extract<PostingState, { kind: 'failed' }>;
    expect(shown).toMatchObject({ kind: 'failed', post: { failedReason: 'recording_missing' } });
    expect(failedView(shown.post)).toBe('file_gone');
    expect(shown.post.recording.segments[0].uri).toBe(`${OLD_DOCS}recordings/1-abc.mp4`);
  });

  test('a post stored in this container is loaded exactly as stored', async () => {
    const here = storedPost(`${NEW_DOCS}recordings/1-abc.mp4`, 'failed');
    await savePendingPostOrThrow('A', here);
    mockFiles.add(`${NEW_DOCS}recordings/1-abc.mp4`);
    await expect(loadPendingPostOrThrow('A')).resolves.toEqual(here);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  });
});
