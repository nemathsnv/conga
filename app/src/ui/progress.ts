// Playback progress for the 2pt line and the player's strip, outside React state.
//
// The players report progress four times a second. Kept in a screen's state, each report
// re-rendered the whole screen: on Home every conversation's overlay, in the response player the
// list of pages, every page and the strip of faces (founder iPhone test, 19 Oct: lag and taps that
// did nothing). A progress source holds the value, and only the line that draws it re-renders.
import { useSyncExternalStore } from 'react';

export type ProgressSource = {
  set: (fraction: number) => void;
  get: () => number;
  subscribe: (listener: () => void) => () => void;
};

/** A number that changes often (a take's elapsed time), read by small leaves only. */
export function createLiveValue(initial = 0, normalize: (n: number) => number = (n) => n): ProgressSource {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    set: (n) => {
      const next = normalize(n);
      if (next === value) return;
      value = next;
      listeners.forEach((l) => l());
    },
    get: () => value,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** A fraction from 0 to 1. */
export function createProgress(): ProgressSource {
  return createLiveValue(0, (f) => (Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0));
}

/** The current value; re-renders the caller (keep it a small leaf) when it changes. */
export function useProgress(source: ProgressSource): number {
  return useSyncExternalStore(source.subscribe, source.get);
}
