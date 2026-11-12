import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout } from './theme';

/** Top inset and the space the tab bar takes at the bottom (TabBar.tsx uses the same sum). */
export function useSafeAreaInfo() {
  const insets = useSafeAreaInsets();
  return { top: insets.top, bottom: insets.bottom, bottomSpace: layout.tabBarHeight - 34 + Math.max(insets.bottom, 8) };
}
