import { isPostingRestriction, restrictionTarget } from '@/lib/restriction';

describe('isPostingRestriction (Post Review and the comment input)', () => {
  it('is the server refusing because posting is paused or the account is suspended', () => {
    expect(isPostingRestriction('posting_paused')).toBe(true);
    expect(isPostingRestriction('suspended')).toBe(true);
    expect(isPostingRestriction('ServerError: posting_paused')).toBe(true);
  });

  it('is not any other failure', () => {
    expect(isPostingRestriction('comment_too_long')).toBe(false);
    expect(isPostingRestriction('Network request failed')).toBe(false);
    expect(isPostingRestriction('response_not_found')).toBe(false);
    expect(isPostingRestriction('')).toBe(false);
  });
});

describe('restrictionTarget', () => {
  it('opens the restriction notice (A-Restricted) when there is one', () => {
    expect(restrictionTarget('a1')).toEqual({ pathname: '/notice/[actionId]', params: { actionId: 'a1' } });
  });

  it('goes Home when there is no notice to show (suspended, or the state has none)', () => {
    expect(restrictionTarget(null)).toBe('/(tabs)');
    expect(restrictionTarget(undefined)).toBe('/(tabs)');
    expect(restrictionTarget('')).toBe('/(tabs)');
  });
});
