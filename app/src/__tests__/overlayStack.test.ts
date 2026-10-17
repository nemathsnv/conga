import { createOverlayStack } from '@/ui/overlayStack';
import { sheetOverPage } from '@/ui/playbackRules';

describe('createOverlayStack (sheets over the player)', () => {
  it('is empty until a sheet opens', () => {
    expect(createOverlayStack().top()).toBeNull();
  });

  it('Comments, then Replies from its card, then Replies closes: Comments is on top again', () => {
    const o = createOverlayStack();
    const comments = o.push({ mode: 'comments', responseId: 'r1' });
    const replies = o.push({ mode: 'replies', responseId: 'r1' });
    expect(o.top()).toEqual({ mode: 'replies', responseId: 'r1' });
    o.pop(replies);
    expect(o.top()).toEqual({ mode: 'comments', responseId: 'r1' });
    o.pop(comments);
    expect(o.top()).toBeNull();
  });

  it('a sheet below leaving first never clears the one on top (out-of-order pops)', () => {
    const o = createOverlayStack();
    const comments = o.push({ mode: 'comments', responseId: 'r1' });
    const replies = o.push({ mode: 'replies', responseId: 'r1' });
    o.pop(comments);
    expect(o.top()).toEqual({ mode: 'replies', responseId: 'r1' });
    o.pop(replies);
    expect(o.top()).toBeNull();
  });

  it('a sheet coming back before the one above has left goes on top', () => {
    const o = createOverlayStack();
    const replies = o.push({ mode: 'replies', responseId: 'r1' });
    o.push({ mode: 'comments', responseId: 'r1' });
    o.pop(replies);
    expect(o.top()).toEqual({ mode: 'comments', responseId: 'r1' });
  });

  it('popping the same token twice removes nothing else', () => {
    const o = createOverlayStack();
    const a = o.push({ mode: 'comments', responseId: 'r1' });
    o.push({ mode: 'comments', responseId: 'r2' });
    o.pop(a);
    o.pop(a);
    expect(o.top()).toEqual({ mode: 'comments', responseId: 'r2' });
  });

  it('nested sheets for different responses each keep their own entry', () => {
    const o = createOverlayStack();
    const first = o.push({ mode: 'comments', responseId: 'r1' });
    const second = o.push({ mode: 'replies', responseId: 'r2' });
    const third = o.push({ mode: 'comments', responseId: 'r3' });
    o.pop(second);
    expect(o.top()).toEqual({ mode: 'comments', responseId: 'r3' });
    o.pop(third);
    expect(o.top()).toEqual({ mode: 'comments', responseId: 'r1' });
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

describe('sheetOverPage', () => {
  it('applies the top sheet only to the page of the response it was opened for', () => {
    expect(sheetOverPage({ mode: 'comments', responseId: 'r1' }, 'r1')).toBe('comments');
    expect(sheetOverPage({ mode: 'replies', responseId: 'r1' }, 'r1')).toBe('replies');
    expect(sheetOverPage({ mode: 'replies', responseId: 'r1' }, 'r2')).toBeNull();
    expect(sheetOverPage({ mode: 'replies', responseId: 'r1' }, null)).toBeNull();
    expect(sheetOverPage(null, 'r1')).toBeNull();
  });
});
