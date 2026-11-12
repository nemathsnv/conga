// Pure recording limits and labels (no native imports, so they are unit-testable).
import { MAX_DURATION_MS, MIN_DURATION_MS } from './types';

/** Under 2 seconds never reaches review (PR-Short). */
export function isTooShort(durationMs: number): boolean {
  return durationMs < MIN_DURATION_MS;
}

export function clampDuration(durationMs: number): number {
  return Math.min(durationMs, MAX_DURATION_MS);
}

/** "0:12" for the red timer and "Up to 0:30". */
export function formatTimer(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}
