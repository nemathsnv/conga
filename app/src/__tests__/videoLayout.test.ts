// The bottom overlay of Home and the response player (ui/videoLayout.ts): lower than before, in
// the boards' order, never overlapping, never inside the home indicator's inset.
import { homeOverlay, NEXT_ROW, playerOverlay } from '@/ui/videoLayout';

const TAB_BAR = 84; // layout.tabBarHeight - 34 + the iPhone's 34 pt inset

describe('Home (board Main)', () => {
  test('the Respond row stands 28 pt above the tab bar, as drawn (it stood 100 pt above)', () => {
    expect(homeOverlay(TAB_BAR, false).row).toBe(TAB_BAR + 28);
  });

  test('progress line, Respond row, author block: in order, no overlap', () => {
    const o = homeOverlay(TAB_BAR, false);
    expect(o.progress).toBeLessThan(o.row);
    expect(o.row + 44).toBeLessThan(o.author);
    expect(o.rail).toBe(o.author);
  });

  test('Z-First: the author block stands on the card', () => {
    const o = homeOverlay(TAB_BAR, true);
    expect(o.firstCard).toBeGreaterThan(o.progress);
    expect(o.author).toBeGreaterThan(o.firstCard + 58);
  });
});

describe('Response player (R-Player-2)', () => {
  test.each([34, 0, 21])('inset %i: Next row on the inset, then progress, buttons, author, with no overlap', (inset) => {
    const o = playerOverlay(inset);
    expect(o.next).toBeGreaterThanOrEqual(inset);
    expect(o.next + NEXT_ROW).toBeLessThan(o.progress);
    expect(o.progress).toBeLessThan(o.buttons);
    expect(o.buttons + 36).toBeLessThan(o.author);
    expect(o.rail).toBe(o.author);
  });

  test('on a phone with a home indicator, everything sits lower than before (Next 60, buttons 128, author 218)', () => {
    const o = playerOverlay(34);
    expect(o.next).toBeLessThan(60);
    expect(o.buttons).toBeLessThan(128);
    expect(o.author).toBeLessThan(218);
  });
});
