import { followedByLabel, moreResponsesLabel, responsesLabel, timeAgo } from '@/lib/format';
import { formatTimer, isTooShort } from '@/video/limits';
import { resumeState, type PendingPost } from '@/video/pendingPostState';

describe('timeAgo', () => {
  const now = new Date('2026-10-06T12:00:00Z').getTime();
  it('matches the boards', () => {
    expect(timeAgo('2026-10-06T11:59:40Z', now)).toBe('Just now');
    expect(timeAgo('2026-10-06T11:40:00Z', now)).toBe('20m');
    expect(timeAgo('2026-10-06T10:00:00Z', now)).toBe('2h');
    expect(timeAgo('2026-10-03T10:00:00Z', now)).toBe('3d');
    expect(timeAgo(null, now)).toBe('Just now');
  });
});

describe('labels', () => {
  it('counts responses', () => {
    expect(responsesLabel(23)).toBe('23 responses');
    expect(responsesLabel(1)).toBe('1 response');
    expect(moreResponsesLabel(23)).toBe('22 more responses');
    expect(moreResponsesLabel(1)).toBe('0 more responses');
  });
  it('builds "Followed by"', () => {
    expect(followedByLabel(['Putu Ayu', 'Wayan Adi', 'Adam Novak'], 6)).toBe('Followed by Putu, Wayan and 4 others');
    expect(followedByLabel(['Putu Ayu'], 1)).toBe('Followed by Putu');
    expect(followedByLabel(['Putu Ayu', 'Wayan Adi'], 2)).toBe('Followed by Putu and Wayan');
    expect(followedByLabel([], 0)).toBeNull();
  });
});

describe('recorder limits', () => {
  it('rejects under 2 seconds and formats the timer', () => {
    expect(isTooShort(1999)).toBe(true);
    expect(isTooShort(2000)).toBe(false);
    expect(formatTimer(12_400)).toBe('0:12');
    expect(formatTimer(30_000)).toBe('0:30');
  });
});

describe('pending post resume', () => {
  const base: PendingPost = {
    responseId: 'r', promptId: 'p', promptText: 't', caption: null, uploadId: 'u', uploadUrl: 'https://x', uploadUrlExpiresAt: 0,
    playbackId: null, state: 'uploading', attempts: 1, failedReason: null,
    recording: { id: 'rec', promptId: 'p', segments: [], durationMs: 5000, createdAt: 0 },
  };
  it('turns an interrupted upload into a failed post that offers Retry', () => {
    expect(resumeState(base).state).toBe('failed');
    expect(resumeState({ ...base, state: 'processing' }).state).toBe('processing');
  });
});
