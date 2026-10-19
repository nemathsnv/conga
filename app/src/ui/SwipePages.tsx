// Horizontal swipe between the two lists of a tabbed screen (founder iPhone test, 19 Oct): Home's
// Following / For you, a profile's Responses / Replies, Followers / Following. Tapping a tab still
// works: it moves the pager. A native paging ScrollView, so UIKit (and Android's nested scrolling)
// tells a sideways swipe from the vertical scroll of the list inside by the first movement, and no
// JavaScript gesture competes with the video feed, the stack's back swipe or a sheet.
// - `bounces` is off, and on a pushed screen (`edgeGuard`) a strip along the left edge keeps its
//   touches from the pager, so the stack's back swipe from the edge still works on every page (a
//   horizontal UIScrollView otherwise wins over the edge gesture).
// - The selected tab follows the pager when a swipe settles, never during the drag.
// - `fitHeight`: inside a vertical ScrollView (a profile), the pager is as tall as the page shown,
//   so a short list leaves no empty scroll under it.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native';

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
  fitHeight = false,
  edgeGuard = false,
  style,
}: {
  pages: readonly K[];
  selected: K;
  onSelect: (page: K) => void;
  renderPage: (page: K, shown: boolean) => ReactNode;
  fitHeight?: boolean;
  edgeGuard?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<ScrollView>(null);
  const screen = useWindowDimensions();
  const [size, setSize] = useState({ width: screen.width, height: 0 });
  const [heights, setHeights] = useState<Partial<Record<K, number>>>({});
  const index = Math.max(pages.indexOf(selected), 0);

  // A tab tap (or a page change from inside, like "Back to For you"): move to that page. After a
  // swipe the pager is already there and this does nothing.
  useEffect(() => {
    ref.current?.scrollTo({ x: index * size.width, y: 0, animated: true });
  }, [index, size.width]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = settledPage(e.nativeEvent.contentOffset.x, size.width, pages.length);
    if (i !== null && pages[i] !== selected) onSelect(pages[i]);
  };

  const fitted = fitHeight ? heights[selected] : undefined;
  const pager = (
    <ScrollView
      ref={ref}
      horizontal
      pagingEnabled
      bounces={false}
      directionalLockEnabled
      nestedScrollEnabled
      scrollsToTop={false}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentOffset={{ x: index * size.width, y: 0 }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.width || height !== size.height) setSize({ width, height });
      }}
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
      scrollEventThrottle={16}
      style={[fitHeight ? null : s.fill, fitted !== undefined ? { height: fitted } : null, style]}
      contentContainerStyle={fitHeight ? s.top : null}
    >
      {pages.map((page) => (
        <View
          key={page}
          style={fitHeight ? { width: size.width } : { width: size.width, height: size.height || screen.height }}
          onLayout={fitHeight ? (e) => {
            const h = Math.ceil(e.nativeEvent.layout.height);
            setHeights((prev) => (prev[page] === h ? prev : { ...prev, [page]: h }));
          } : undefined}
        >
          {renderPage(page, page === selected)}
        </View>
      ))}
    </ScrollView>
  );
  if (!edgeGuard) return pager;
  return (
    <View style={fitHeight ? null : s.fill}>
      {pager}
      <View style={s.edge} />
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  top: { alignItems: 'flex-start' },
  edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: EDGE_GUARD },
});
