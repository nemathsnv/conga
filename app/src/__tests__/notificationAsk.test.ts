import { hasReplyOrComment, shouldAsk } from '@/lib/notificationAsk';

describe('shouldAsk (SPEC.md Section 15)', () => {
  it('asks right after the first public video, never before', () => {
    expect(shouldAsk('never', 'first_post')).toBe(true);
    expect(shouldAsk('never', 'first_reply_or_comment')).toBe(false);
  });
  it('after Not now, asks once more only when the first reply or comment arrives', () => {
    expect(shouldAsk('declined_once', 'first_post')).toBe(false);
    expect(shouldAsk('declined_once', 'first_reply_or_comment')).toBe(true);
  });
  it('after the second Not now, only Settings', () => {
    expect(shouldAsk('declined_twice', 'first_post')).toBe(false);
    expect(shouldAsk('declined_twice', 'first_reply_or_comment')).toBe(false);
  });
  it('never asks again once accepted', () => {
    expect(shouldAsk('accepted', 'first_post')).toBe(false);
    expect(shouldAsk('accepted', 'first_reply_or_comment')).toBe(false);
  });
});

describe('hasReplyOrComment', () => {
  it('replies and comments count, follows and likes do not', () => {
    expect(hasReplyOrComment([{ kind: 'follow' }, { kind: 'like' }])).toBe(false);
    expect(hasReplyOrComment([{ kind: 'follow' }, { kind: 'comment' }])).toBe(true);
    expect(hasReplyOrComment([{ kind: 'video_reply' }])).toBe(true);
  });
});
