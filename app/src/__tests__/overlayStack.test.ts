import { createOverlayStack } from '@/ui/overlayStack';
import { playerPageActive, sheetOverPage } from '@/ui/playbackRules';

describe('createOverlayStack (sheets over the player)', () => {
  it('is empty until a sheet opens', () => {
    expect(createOverlayStack().top()).toBeNull();
  });

  it('Comments, then Replies from its card, then Replies closes: Comments is on top again', () => {
    const o = createOverlayStack();
    const comments = o.push({ mode: 'comments', responseId: 'r1' });
    const replies = o.push({ mode: 'replies', responseId: 'r1' });
    expect(o.top()).toMatchObject({ mode: 'replies', responseId: 'r1' });
    o.pop(replies);
    expect(o.top()).toMatchObject({ mode: 'comments', responseId: 'r1' });
    o.pop(comments);
    expect(o.top()).toBeNull();
  });

  it('a sheet below leaving first never clears the one on top (out-of-order pops)', () => {
    const o = createOverlayStack();
    const comments = o.push({ mode: 'comments', responseId: 'r1' });
    const replies = o.push({ mode: 'replies', responseId: 'r1' });
    o.pop(comments);
    expect(o.top()).toMatchObject({ mode: 'replies', responseId: 'r1' });
    o.pop(replies);
    expect(o.top()).toBeNull();
  });

  it('a sheet coming back before the one above has left goes on top', () => {
    const o = createOverlayStack();
    const replies = o.push({ mode: 'replies', responseId: 'r1' });
    o.push({ mode: 'comments', responseId: 'r1' });
    o.pop(replies);
    expect(o.top()).toMatchObject({ mode: 'comments', responseId: 'r1' });
  });

  it('popping the same token twice removes nothing else', () => {
    const o = createOverlayStack();
    const a = o.push({ mode: 'comments', responseId: 'r1' });
    o.push({ mode: 'comments', responseId: 'r2' });
    o.pop(a);
    o.pop(a);
    expect(o.top()).toMatchObject({ mode: 'comments', responseId: 'r2' });
  });

  it('nested sheets for different responses each keep their own entry', () => {
    const o = createOverlayStack();
    const first = o.push({ mode: 'comments', responseId: 'r1' });
    const second = o.push({ mode: 'replies', responseId: 'r2' });
    const third = o.push({ mode: 'comments', responseId: 'r3' });
    o.pop(second);
    expect(o.top()).toMatchObject({ mode: 'comments', responseId: 'r3' });
    o.pop(third);
    expect(o.top()).toMatchObject({ mode: 'comments', responseId: 'r1' });
    o.pop(first);
    expect(o.top()).toBeNull();
  });

  it('clear (account change) empties it and tells the listeners', () => {
    const o = createOverlayStack();
    const listener = jest.fn();
    o.subscribe(listener);
    o.push({ mode: 'replies', responseId: 'r1' });
    o.clear();
    expect(o.top()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('listeners hear each change and stop after unsubscribing', () => {
    const o = createOverlayStack();
    const listener = jest.fn();
    const off = o.subscribe(listener);
    const t = o.push({ mode: 'comments', responseId: 'r1' });
    o.pop(t);
    o.pop(t);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    o.push({ mode: 'comments', responseId: 'r1' });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('setCovered (a screen pushed over a sheet)', () => {
  it('a new sheet is covered until it says it is focused, and covered again when left', () => {
    const o = createOverlayStack();
    const t = o.push({ mode: 'comments', responseId: 'r1' });
    expect(o.top()?.covered).toBe(true);
    o.setCovered(t, false);
    expect(o.top()?.covered).toBe(false);
    o.setCovered(t, true);
    expect(o.top()?.covered).toBe(true);
  });

  it('ignores a token that was popped, and tells listeners only of real changes', () => {
    const o = createOverlayStack();
    const listener = jest.fn();
    const t = o.push({ mode: 'comments', responseId: 'r1' });
    o.subscribe(listener);
    o.setCovered(t, true);
    expect(listener).not.toHaveBeenCalled();
    o.pop(t);
    o.setCovered(t, false);
    expect(o.top()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('sheetOverPage', () => {
  it('applies the top sheet only to the page of the response it was opened for', () => {
    expect(sheetOverPage({ mode: 'comments', responseId: 'r1' }, 'r1', false)).toBe('comments');
    expect(sheetOverPage({ mode: 'replies', responseId: 'r1' }, 'r1', false)).toBe('replies');
    expect(sheetOverPage({ mode: 'replies', responseId: 'r1' }, 'r2', false)).toBeNull();
    expect(sheetOverPage({ mode: 'replies', responseId: 'r1' }, null, false)).toBeNull();
    expect(sheetOverPage(null, 'r1', false)).toBeNull();
  });

  it('a player that is the focused screen has no sheet over it (one opened from inside Replies)', () => {
    expect(sheetOverPage({ mode: 'replies', responseId: 'r1' }, 'r1', true)).toBeNull();
    expect(sheetOverPage({ mode: 'comments', responseId: 'r1' }, 'r1', true)).toBeNull();
  });
});

describe('playerPageActive', () => {
  const comments = (responseId: string, covered = false) => ({ mode: 'comments' as const, responseId, covered });
  const replies = (responseId: string, covered = false) => ({ mode: 'replies' as const, responseId, covered });

  it('plays the page on screen while the player is the focused screen', () => {
    expect(playerPageActive({ isCurrentPage: true, screenFocused: true, overlay: null, responseId: 'r1' })).toBe(true);
    expect(playerPageActive({ isCurrentPage: false, screenFocused: true, overlay: null, responseId: 'r1' })).toBe(false);
  });

  it('stops when a profile, the recorder or another player covers it', () => {
    expect(playerPageActive({ isCurrentPage: true, screenFocused: false, overlay: null, responseId: 'r1' })).toBe(false);
  });

  it('keeps playing under Comments for the same response (SPEC.md Section 8)', () => {
    expect(playerPageActive({ isCurrentPage: true, screenFocused: false, overlay: comments('r1'), responseId: 'r1' })).toBe(true);
    expect(playerPageActive({ isCurrentPage: false, screenFocused: false, overlay: comments('r1'), responseId: 'r2' })).toBe(false);
  });

  it('stops under Comments for another response (another player is under that sheet)', () => {
    expect(playerPageActive({ isCurrentPage: true, screenFocused: false, overlay: comments('r2'), responseId: 'r1' })).toBe(false);
  });

  it('stops when something covers Comments (Report, a notification opening another screen)', () => {
    expect(playerPageActive({ isCurrentPage: true, screenFocused: false, overlay: comments('r1', true), responseId: 'r1' })).toBe(false);
  });

  it('pauses under Replies', () => {
    expect(playerPageActive({ isCurrentPage: true, screenFocused: false, overlay: replies('r1'), responseId: 'r1' })).toBe(false);
  });

  it('a player opened from inside Replies plays: it is the focused screen', () => {
    expect(playerPageActive({ isCurrentPage: true, screenFocused: true, overlay: replies('r1'), responseId: 'r1' })).toBe(true);
  });
});
