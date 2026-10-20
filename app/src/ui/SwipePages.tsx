// Horizontal swipe between the two lists of a tabbed screen (founder iPhone test, 19 Oct): Home's
// Following / For you, a profile's Responses / Replies, Followers / Following. Tapping a tab still
// works: it moves the pager. A native paging ScrollView, so UIKit (and Android's nested scrolling)
// tells a sideways swipe from the vertical scroll of the list inside by the first movement, and no
// JavaScript gesture competes with the video feed, the stack's back swipe or a sheet.
// - Each page fills the pager, so a swipe can start anywhere on it, empty space included. A
//   profile puts its whole content (header, tabs, grid) in each page for that reason.
// - `bounces` is off, and on a pushed screen (`edgeGuard`) a strip along the left edge keeps its
//   touches from the pager, so the stack's back swipe from the edge still works on every page (a
//   horizontal UIScrollView otherwise wins over the edge gesture). The strip also takes taps, so
//   it is only for pushed screens.
// - The selected tab follows the pager when a swipe settles, never during the drag.
// - The page off screen is hidden from VoiceOver and TalkBack.
// - Each page clips to its own bounds, and `renderPage` gets `pinX`: a translateX that keeps a part
//   of the page still while the pages slide (a profile's header and tabs, founder iPhone test,
//   20 Oct). Two pages showing the same pinned part at the same height join at the pager's moving
//   seam into one still picture. It runs on the native scroll event, with no JavaScript per frame.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';

/** Width of the strip left to the back swipe (the iOS edge gesture starts within about 20 pt). */
const EDGE_GUARD = 20;

export function settledPage(offsetX: number, width: number, count: number): number | null {
  if (width <= 0 || count === 0) return null;
  const exact = offsetX / width;
  const nearest = Math.round(exact);
  // Not at rest on a page (a slow drag that stopped between two pages snaps first).
  if (Math.abs(exact - nearest) > 0.02) return null;
  return Math.min(Math.max(nearest, 0), count - 1);
}

export function SwipePages<K extends string>({
  pages,
  selected,
  onSelect,
  renderPage,
  onDragStart,
  edgeGuard = false,
  style,
}: {
  pages: readonly K[];
  selected: K;
  onSelect: (page: K) => void;
  renderPage: (page: K, shown: boolean, pinX: Animated.AnimatedNode) => ReactNode;
  /** A sideways drag begins (before the other page shows). */
  onDragStart?: () => void;
  edgeGuard?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<ScrollView>(null);
  const screen = useWindowDimensions();
  const [size, setSize] = useState({ width: screen.width, height: 0 });
  const index = Math.max(pages.indexOf(selected), 0);
  // Where the pager starts. Later pages are reached by scrolling (below), so a tab tap animates.
  const [startIndex] = useState(index);
  // The pager's horizontal offset, on the native thread, and per page the translateX that cancels it.
  const [scrollX] = useState(() => new Animated.Value(startIndex * screen.width));
  const pins = useMemo(() => pages.map((_, i) => Animated.add(scrollX, -i * size.width)), [pages, scrollX, size.width]);
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true }), [scrollX]);

  // A tab tap (or a page change from inside, like "Back to For you"): move to that page. After a
  // swipe the pager is already there and this does nothing.
  useEffect(() => {
    ref.current?.scrollTo({ x: index * size.width, y: 0, animated: true });
  }, [index, size.width]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = settledPage(e.nativeEvent.contentOffset.x, size.width, pages.length);
    if (i !== null && pages[i] !== selected) onSelect(pages[i]);
  };

  const pager = (
    <Animated.ScrollView
      ref={ref}
      horizontal
      pagingEnabled
      bounces={false}
      directionalLockEnabled
      nestedScrollEnabled
      scrollsToTop={false}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentOffset={{ x: startIndex * size.width, y: 0 }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onScrollBeginDrag={onDragStart}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
      style={[s.fill, style]}
    >
      {pages.map((page, i) => {
        const shown = page === selected;
        return (
          <View
            key={page}
            style={{ width: size.width, height: size.height || screen.height, overflow: 'hidden' }}
            accessibilityElementsHidden={!shown}
            importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
          >
            {renderPage(page, shown, pins[i])}
          </View>
        );
      })}
    </Animated.ScrollView>
  );
  if (!edgeGuard) return pager;
  return (
    <View style={s.fill}>
      {pager}
      <View style={s.edge} />
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: EDGE_GUARD },
});
