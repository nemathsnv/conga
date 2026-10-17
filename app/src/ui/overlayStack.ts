// The sheets open over the response player (Comments, Replies), as a stack. Pure (no React, no
// navigation), Jest-tested; the hooks are in playerOverlay.ts.
//
// Sheets stack (Comments → its "N video replies" card → Replies) and do not always leave in the
// order they came, so this is not one global mode: each sheet adds its own entry and removes only
// that entry (by the token it got). The sheet on top decides; a sheet leaving never clears the
// entry of a sheet still open below it.

export type OverlayMode = 'comments' | 'replies';
export type OverlayEntry = { mode: OverlayMode; responseId: string };
export type OverlayToken = number;

export type OverlayStack = {
  /** Adds a sheet's entry on top; the token removes exactly this entry later. */
  push: (entry: OverlayEntry) => OverlayToken;
  /** Removes the entry `token` added, wherever it is in the stack. A second pop does nothing. */
  pop: (token: OverlayToken) => void;
  /** The sheet on top, or null when no sheet is over the player. */
  top: () => OverlayEntry | null;
  /** Account change (accountScope.ts): no sheet of the previous account stays. */
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
};

export function createOverlayStack(): OverlayStack {
  let entries: (OverlayEntry & { token: OverlayToken })[] = [];
  let nextToken = 1;
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((l) => l());
  return {
    push(entry) {
      const token = nextToken++;
      entries = [...entries, { mode: entry.mode, responseId: entry.responseId, token }];
      changed();
      return token;
    },
    pop(token) {
      const next = entries.filter((e) => e.token !== token);
      if (next.length === entries.length) return;
      entries = next;
      changed();
    },
    top() {
      const last = entries[entries.length - 1];
      return last ? { mode: last.mode, responseId: last.responseId } : null;
    },
    clear() {
      if (entries.length === 0) return;
      entries = [];
      changed();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The one stack the app's player and sheets share. */
export const playerOverlays = createOverlayStack();
