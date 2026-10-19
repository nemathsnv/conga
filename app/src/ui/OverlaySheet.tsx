// The layer every confirmation sheet is drawn in (P4, P6, P9, PR-Discard, A-Disclosure,
// LV-CommentOwn, the place unfollow sheets): a full-screen overlay inside the screen's own view
// tree, in place of React Native's <Modal>.
//
// Why not <Modal> (founder iPhone test, 19 Oct: Discard did nothing, and nothing else on Home
// responded until the app was restarted): on iOS a <Modal> asks UIKit to present a view
// controller from the nearest one. While a native-stack sheet (+, Comments, Replies, Share) is
// shown or still closing, UIKit refuses ("Attempt to present … which is already presenting …"),
// but React Native has already marked the modal presented and never hears back. The sheet never
// appears, its invisible full-screen host stays on top of the screen and takes every touch, and
// no later tap or close can clear it. An overlay in the view tree cannot be refused.
//
// - Draw it as the last child of a full-screen root, so it covers the whole screen.
// - Android Back closes it, as <Modal>'s onRequestClose did.
// - `fade` fades the dim and the sheet in and out; `slide` brings the sheet up from the bottom.
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Easing, StyleSheet, useWindowDimensions } from 'react-native';

const DURATION_MS = 220;

export function OverlaySheet({ visible, onRequestClose, animation = 'fade', children }: {
  visible: boolean;
  onRequestClose: () => void;
  animation?: 'fade' | 'slide';
  children: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));
  // While it animates out it stays drawn, with the content it had when it was last open.
  const [wasVisible, setWasVisible] = useState(visible);
  const [closing, setClosing] = useState(false);
  const [content, setContent] = useState(children);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    setClosing(!visible);
  }
  if (visible && content !== children) setContent(children);

  useEffect(() => {
    const run = Animated.timing(progress, { toValue: visible ? 1 : 0, duration: DURATION_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    run.start(({ finished }) => {
      if (finished && !visible) setClosing(false);
    });
    return () => run.stop();
  }, [visible, progress]);

  // Android Back closes the sheet first (the latest listener runs first).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onRequestClose]);

  if (!visible && !closing) return null;
  const motion =
    animation === 'slide'
      ? { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] }
      : { opacity: progress };
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, s.layer, motion]}
      // While it closes, taps go to the screen again at once.
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityViewIsModal
      importantForAccessibility="yes"
    >
      {visible ? children : content}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  layer: { zIndex: 1000, elevation: 1000 },
});
