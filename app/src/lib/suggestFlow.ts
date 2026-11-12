// The suggestion being written, carried between C-Write, C-Scope and C-Preview. In memory.
// Pure rules (length) are here for Jest; the screens own the UI.
import { useEffect, useState } from 'react';

export const SUGGEST_MAX = 120;

export type SuggestDraft = {
  /** Set when editing or rewriting an existing suggestion. */
  editId: string | null;
  text: string;
  placeId: string | null;
  placeName: string | null;
  attribution: boolean;
};

const empty: SuggestDraft = { editId: null, text: '', placeId: null, placeName: null, attribution: true };
let current: SuggestDraft = { ...empty };
const listeners = new Set<() => void>();

export function getSuggestDraft(): SuggestDraft {
  return current;
}
export function setSuggestDraft(patch: Partial<SuggestDraft>): void {
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
}
export function resetSuggestDraft(seed?: Partial<SuggestDraft>): void {
  current = { ...empty, ...seed };
  listeners.forEach((l) => l());
}
export function useSuggestDraft(): SuggestDraft {
  const [v, setV] = useState(current);
  useEffect(() => {
    const l = () => setV(current);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}

/** Trimmed, at most 120 characters, never empty. */
export function suggestionTextOk(text: string): boolean {
  const t = text.trim();
  return t.length >= 1 && t.length <= SUGGEST_MAX;
}
