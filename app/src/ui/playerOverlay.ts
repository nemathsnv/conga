// Sheets that open over the response player (Comments, Replies) tell it what to do with the
// video underneath: keep playing with its chrome hidden (Comments: "the response keeps
// playing in the top third"), or pause (Replies: "paused"). In memory, one player at a time.
import { useEffect, useState } from 'react';

export type OverlayMode = 'none' | 'comments' | 'replies';

let mode: OverlayMode = 'none';
const listeners = new Set<() => void>();

export function setOverlay(next: OverlayMode): void {
  mode = next;
  listeners.forEach((l) => l());
}

export function useOverlay(): OverlayMode {
  const [value, setValue] = useState(mode);
  useEffect(() => {
    const l = () => setValue(mode);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return value;
}

/** Call from a sheet: sets the mode while mounted. */
export function useOverlayWhileMounted(next: OverlayMode): void {
  useEffect(() => {
    setOverlay(next);
    return () => setOverlay('none');
  }, [next]);
}
