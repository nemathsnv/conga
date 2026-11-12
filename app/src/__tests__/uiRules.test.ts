import { videoLinkTarget } from '@/lib/links';
import { resetAccountScopedUi } from '@/ui/accountScope';
import { getUnread, setUnread } from '@/ui/activityStore';
import { markFeedDirty, takeFeedDirty } from '@/ui/feedStore';
import { isPlaybackFailure, shouldResumeOnForeground, stillSource } from '@/ui/playbackRules';

jest.mock('@/lib/content', () => ({ activityUnreadCount: jest.fn() }));

describe('shouldResumeOnForeground', () => {
  it('restarts only the video on screen, and only when the app comes back', () => {
    expect(shouldResumeOnForeground('active', true)).toBe(true);
    expect(shouldResumeOnForeground('active', false)).toBe(false);
    expect(shouldResumeOnForeground('background', true)).toBe(false);
    expect(shouldResumeOnForeground('inactive', true)).toBe(false);
  });
});

describe('isPlaybackFailure', () => {
  it('treats only the error status as a failed video', () => {
    expect(isPlaybackFailure('error')).toBe(true);
    expect(isPlaybackFailure('loading')).toBe(false);
    expect(isPlaybackFailure('readyToPlay')).toBe(false);
    expect(isPlaybackFailure('idle')).toBe(false);
  });
});

describe('videoLinkTarget (SPEC.md Section 4 links)', () => {
  it('opens a response in the response player at that response', () => {
    expect(videoLinkTarget('v1', { kind: 'response', prompt_id: 'p1' })).toEqual({ pathname: '/player/[promptId]', params: { promptId: 'p1', entry: 'v1' } });
  });
  it('opens a video reply in its own player', () => {
    expect(videoLinkTarget('v2', { kind: 'reply', prompt_id: 'p1' })).toEqual({ pathname: '/reply/[id]', params: { id: 'v2' } });
  });
  it('sends a video that cannot be read to the video reply player, whose unavailable state shows one neutral message', () => {
    expect(videoLinkTarget('v3', null)).toEqual({ pathname: '/reply/[id]', params: { id: 'v3' } });
  });
});

describe('resetAccountScopedUi', () => {
  it('clears what belongs to the previous account when the account changes', () => {
    setUnread(5);
    markFeedDirty();

    resetAccountScopedUi();

    // The next account does not see the last one's filled bell, nor a feed reload it did not cause.
    expect(getUnread()).toBe(0);
    expect(takeFeedDirty()).toBe(false);
  });
});

describe('stillSource (the banner thumbnail)', () => {
  it('shows a still only of a file on the phone', () => {
    expect(stillSource('file:///var/mobile/recordings/r1.mp4')).toBe('file:///var/mobile/recordings/r1.mp4');
    expect(stillSource('')).toBeNull();
    expect(stillSource('   ')).toBeNull();
    expect(stillSource(null)).toBeNull();
    expect(stillSource(undefined)).toBeNull();
  });
});
