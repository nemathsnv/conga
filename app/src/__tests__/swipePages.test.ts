// The swipe pager (ui/SwipePages.tsx) changes the selected tab only once a swipe has settled on a page.
import { settledPage } from '@/ui/SwipePages';

jest.mock('react-native', () => ({ ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: (x: unknown) => x }, useWindowDimensions: () => ({ width: 402, height: 874 }) }));

describe('settledPage', () => {
  test('at rest on a page: that page', () => {
    expect(settledPage(0, 402, 2)).toBe(0);
    expect(settledPage(402, 402, 2)).toBe(1);
    expect(settledPage(401.5, 402, 2)).toBe(1);
  });

  test('between pages (a drag that has not snapped yet): no change', () => {
    expect(settledPage(150, 402, 2)).toBeNull();
    expect(settledPage(300, 402, 2)).toBeNull();
  });

  test('never outside the pages, and nothing before layout', () => {
    expect(settledPage(804, 402, 2)).toBe(1);
    expect(settledPage(-2, 402, 2)).toBe(0);
    expect(settledPage(0, 0, 2)).toBeNull();
  });
});
