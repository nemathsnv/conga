// Sheets that open over the response player (Comments, Replies) tell it what to do with the
// video underneath: keep playing with its chrome hidden (Comments: "the response keeps
// playing in the top third"), or pause (Replies: "paused"). The stack itself is overlayStack.ts.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { playerOverlays, type OverlayMode, type OverlayToken, type OverlayTop } from './overlayStack';

export type { OverlayEntry, OverlayMode, OverlayTop } from './overlayStack';

/** The sheet on top of the stack, or null. */
export function useOverlay(): OverlayTop | null {
  const [value, setValue] = useState(playerOverlays.top);
  useEffect(() => {
    const l = () => setValue(playerOverlays.top());
    l();
    return playerOverlays.subscribe(l);
  }, []);
  return value;
}

/** Call from a sheet: its entry is on the stack while the sheet is mounted, and covered while
 *  another screen is pushed over the sheet (it is not the focused screen). */
export function useOverlayWhileMounted(mode: OverlayMode, responseId: string | undefined): void {
  const token = useRef<OverlayToken | null>(null);
  useEffect(() => {
    if (!responseId) return undefined;
    const t = playerOverlays.push({ mode, responseId });
    token.current = t;
    return () => {
      playerOverlays.pop(t);
      if (token.current === t) token.current = null;
    };
  }, [mode, responseId]);
  useFocusEffect(
    useCallback(() => {
      const t = token.current;
      if (t === null) return undefined;
      playerOverlays.setCovered(t, false);
      return () => playerOverlays.setCovered(t, true);
      // The entry is replaced when these change; run again for the new token.
    }, [mode, responseId]), // eslint-disable-line react-hooks/exhaustive-deps
  );
}
