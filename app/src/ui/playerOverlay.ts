// Sheets that open over the response player (Comments, Replies) tell it what to do with the
// video underneath: keep playing with its chrome hidden (Comments: "the response keeps
// playing in the top third"), or pause (Replies: "paused"). The stack itself is overlayStack.ts.
import { useEffect, useState } from 'react';

import { playerOverlays, type OverlayEntry, type OverlayMode } from './overlayStack';

export type { OverlayEntry, OverlayMode } from './overlayStack';

/** The sheet on top of the stack, or null. */
export function useOverlay(): OverlayEntry | null {
  const [value, setValue] = useState(playerOverlays.top);
  useEffect(() => {
    const l = () => setValue(playerOverlays.top());
    l();
    return playerOverlays.subscribe(l);
  }, []);
  return value;
}

/** Call from a sheet: its entry is on the stack while the sheet is mounted. */
export function useOverlayWhileMounted(mode: OverlayMode, responseId: string | undefined): void {
  useEffect(() => {
    if (!responseId) return undefined;
    const token = playerOverlays.push({ mode, responseId });
    return () => playerOverlays.pop(token);
  }, [mode, responseId]);
}
