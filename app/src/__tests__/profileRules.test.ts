import { shouldLoadReplies } from '@/ui/profileRules';

describe('shouldLoadReplies (Me → Replies after a video reply is deleted, eee10a7)', () => {
  it('reloads the grid with the profile once it was loaded, even with Responses showing', () => {
    expect(shouldLoadReplies('responses', true)).toBe(true);
    expect(shouldLoadReplies('replies', true)).toBe(true);
  });

  it('loads when the Replies tab opens', () => {
    expect(shouldLoadReplies('replies', false)).toBe(true);
  });

  it('does not load a grid nobody opened', () => {
    expect(shouldLoadReplies('responses', false)).toBe(false);
  });
});
