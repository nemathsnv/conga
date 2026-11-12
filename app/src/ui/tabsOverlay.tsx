// Home's sheets (P4 Discard this recording?, P6 This recording already reached Conga) cover the
// tab bar, as the boards draw them. Home's own view sits under the tab bar, so they are drawn by
// the tabs layout instead (TabsOverlayOutlet), above the bar, in the view tree: never a <Modal>
// (ui/OverlaySheet.tsx says why). Home hands its sheets over with useTabsOverlay.
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

let current: ReactNode = null;
const listeners = new Set<() => void>();

function set(node: ReactNode): void {
  if (current === node) return;
  current = node;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Draws what the tabs' screens hand over (one owner: Home). */
export function TabsOverlayOutlet() {
  const node = useSyncExternalStore(subscribe, () => current);
  return <>{node}</>;
}

/** Shows `node` above the tabs and their bar while the calling screen is mounted. */
export function useTabsOverlay(node: ReactNode): void {
  useEffect(() => {
    set(node);
  });
  useEffect(() => () => set(null), []);
}
