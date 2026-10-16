import {
  CAMERA_BLOCK_SHEET,
  DISCARD_SHEET,
  REACHED_SHORTCUT_SHEET,
  SIGN_OUT_SHEET,
  cameraBlock,
  discardOutcome,
  failedDetail,
  failedTitle,
  failedView,
  offlineDetail,
  postingTitle,
} from '@/ui/failedPost';
import type { PendingPost } from '@/video/pendingPostState';
import type { PostingState } from '@/video/uploadRun';

// The boards' own text: every string the UI shows for P1 to P9 must be in the board file, word for word.
// Node's fs and path, without Node's type definitions (not a dependency of the app).
declare const __dirname: string;
/* eslint-disable @typescript-eslint/no-require-imports */
const nodeFs = require('fs') as { readFileSync: (path: string, encoding: string) => string };
const nodePath = require('path') as { join: (...parts: string[]) => string };
/* eslint-enable @typescript-eslint/no-require-imports */
const board = nodeFs
  .readFileSync(nodePath.join(__dirname, '../../../design/proposals/failed-post-ux.html'), 'utf8')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&amp;/g, '&');
const inBoard = (text: string) => expect(board).toContain(text);

const post = (over: Partial<PendingPost> = {}): PendingPost =>
  ({
    ownerId: 'u1',
    responseId: 'r1',
    kind: 'response',
    draftFor: null,
    replyToId: null,
    replyToName: null,
    promptId: 'p1',
    promptText: 'x',
    recording: { id: 'rec1', promptId: 'p1', segments: [], durationMs: 5000, createdAt: 0 },
    caption: null,
    uploadId: 'u',
    uploadUrl: 'https://u',
    uploadUrlExpiresAt: 0,
    playbackId: null,
    state: 'failed',
    attempts: 1,
    failedReason: null,
    ...over,
  }) as PendingPost;

describe('failedView (P1, P2, P3, P5)', () => {
  it('keeps Retry for a connection failure, an upload limit, a busy server and anything unknown', () => {
    for (const reason of [null, 'interrupted', 'offline', 'Network request failed', 'upload_limit_hour', 'upload_limit_day', 'upload_limit_active', 'submission_busy', 'gateway_error']) {
      expect(failedView(post({ failedReason: reason }))).toBe('retry');
    }
  });
  it('is Discard only for what can never post (P2)', () => {
    for (const reason of ['already_responded', 'prompt_not_found', 'prompt_not_live', 'video_not_found', 'response_removed', 'response_deleted', 'submission_closed', 'submission_conflict']) {
      expect(failedView(post({ failedReason: reason }))).toBe('cannot_post');
    }
  });
  it('is Discard only when the file is gone (P3)', () => {
    expect(failedView(post({ failedReason: 'recording_missing' }))).toBe('file_gone');
  });
  it('shows no buttons while a discard waits for Shortcut (P5), whatever failed before', () => {
    expect(failedView(post({ failedReason: 'offline', discardRequested: true }))).toBe('discarding');
    expect(failedView(post({ failedReason: 'recording_missing', discardRequested: true }))).toBe('discarding');
  });
});

describe('banner words match the boards', () => {
  it('P1, P1-R, P2, P2-R, P3, P3-R titles', () => {
    expect(failedTitle('response', 'retry')).toBe("Your response didn't post");
    expect(failedTitle('reply', 'retry')).toBe("Your video reply didn't post");
    expect(failedTitle('response', 'cannot_post')).toBe("Your response didn't post");
    expect(failedTitle('reply', 'file_gone')).toBe("Your video reply didn't post");
    inBoard("Your response didn't post");
    inBoard('video reply');
  });
  it('drafts keep their own words', () => {
    expect(failedTitle('draft', 'retry')).toBe("Your draft didn't save");
    expect(postingTitle('draft')).toBe('Saving your draft');
  });
  it('P2 and P3 second lines', () => {
    inBoard(failedDetail('cannot_post'));
    inBoard(failedDetail('file_gone'));
    expect(failedDetail('cannot_post')).toBe("This recording can't be posted.");
    expect(failedDetail('file_gone')).toBe('This recording is no longer on this phone.');
  });
  it('P5 and P5-R', () => {
    expect(failedTitle('response', 'discarding')).toBe('Discarding your response');
    expect(failedTitle('reply', 'discarding')).toBe('Discarding your video reply');
    inBoard('Discarding your response');
    inBoard('Discarding your video reply');
    inBoard(failedDetail('discarding'));
  });
  it('P8-R and PR-Posting', () => {
    expect(postingTitle('response')).toBe('Posting your response');
    expect(postingTitle('reply')).toBe('Posting your video reply');
  });
  it('A-Offline names a video reply', () => {
    expect(offlineDetail('reply')).toBe("Your video reply stays saved on this phone. Post when you're back online.");
    expect(offlineDetail('response')).toBe("Your response stays saved on this phone. Post when you're back online.");
    expect(offlineDetail(null)).toBe("Your response stays saved on this phone. Post when you're back online.");
  });
});

describe('sheets (P4, P6, P7, P8, P9) are the boards words', () => {
  it('P4', () => {
    expect(DISCARD_SHEET.title).toBe('Discard this recording?');
    expect(DISCARD_SHEET.line).toBe('Shortcut will try to stop it from posting. If it has already uploaded, it may still appear.');
    inBoard(DISCARD_SHEET.title);
    inBoard(DISCARD_SHEET.line);
  });
  it('P6', () => {
    expect(REACHED_SHORTCUT_SHEET.title).toBe('This recording already reached Shortcut');
    expect(REACHED_SHORTCUT_SHEET.line).toBe('It may finish processing. If it appears on your profile, you can delete it there.');
    inBoard(REACHED_SHORTCUT_SHEET.title);
    inBoard(REACHED_SHORTCUT_SHEET.line);
  });
  it('P7 and P8', () => {
    expect(CAMERA_BLOCK_SHEET.waiting.title).toBe("Your last recording hasn't posted yet");
    expect(CAMERA_BLOCK_SHEET.waiting.line).toBe('Retry or discard it first.');
    expect(CAMERA_BLOCK_SHEET.posting.title).toBe('Your last recording is still posting');
    expect(CAMERA_BLOCK_SHEET.posting.line).toBe("Keep Shortcut open until it's done.");
    for (const k of ['waiting', 'posting'] as const) {
      inBoard(CAMERA_BLOCK_SHEET[k].title);
      inBoard(CAMERA_BLOCK_SHEET[k].line);
    }
  });
  it('P9', () => {
    expect(SIGN_OUT_SHEET.title).toBe('Sign out?');
    expect(SIGN_OUT_SHEET.line).toBe("You have 1 recording that hasn't posted. Signing out stops the upload on this phone, but it may still finish on Shortcut. An unresolved recording stays private on this device for your account.");
    inBoard("You have 1 recording that hasn't posted.");
    inBoard("Signing out stops the upload on this phone, but it may still finish on Shortcut. An unresolved recording stays private on this device for your account.");
    expect(SIGN_OUT_SHEET.signOut).toBe('Sign out anyway');
  });
});

describe('cameraBlock (P7, P8)', () => {
  const s = (kind: PostingState['kind']) => ({ kind }) as Pick<PostingState, 'kind'>;
  it('blocks the camera while a recording waits (failed, offline) with P7', () => {
    expect(cameraBlock(s('failed'))).toBe('waiting');
    expect(cameraBlock(s('waiting'))).toBe('waiting');
  });
  it('blocks it while a recording is posting with P8', () => {
    expect(cameraBlock(s('uploading'))).toBe('posting');
    expect(cameraBlock(s('processing'))).toBe('posting');
  });
  it('lets the camera open when nothing waits, or the last one is live', () => {
    expect(cameraBlock(s('idle'))).toBeNull();
    expect(cameraBlock(s('live'))).toBeNull();
  });
});

describe('discardOutcome (P6)', () => {
  it('says the recording reached Shortcut when it carries on processing', () => {
    expect(discardOutcome({ kind: 'processing', post: post({ state: 'processing' }) })).toBe('reached_shortcut');
  });
  it('has nothing more to say when it went, or when P5 draws itself', () => {
    expect(discardOutcome({ kind: 'idle' })).toBe('settled');
    expect(discardOutcome({ kind: 'failed', post: post({ discardRequested: true }) })).toBe('settled');
  });
  it('waits while the answer has not arrived', () => {
    expect(discardOutcome({ kind: 'failed', post: post() })).toBe('pending');
  });
});
