// The sheets open over the response player (Comments, Replies), as a stack. Pure (no React, no
// navigation), Jest-tested; the hooks are in playerOverlay.ts.
//
// Sheets stack (Comments → its "N video replies" card → Replies) and do not always leave in the
// order they came, so this is not one global mode: each sheet adds its own entry and removes only
// that entry (by the token it got). The sheet on top decides; a sheet leaving never clears the
// entry of a sheet still open below it.
//
// A sheet can itself be covered by a screen pushed over it (Report on a comment, a notification
// opening another player). It stays on the stack (the player under it keeps its look), but marked
// covered, so the player stops playing.

export type OverlayMode = 'comments' | 'replies';
export type OverlayEntry = { mode: OverlayMode; responseId: string };
export type OverlayTop = OverlayEntry & { covered: boolean };
export type OverlayToken = number;

export type OverlayStack = {
  /** Adds a sheet's entry on top, covered until the sheet says it is focused (setCovered). The
   *  token removes or updates exactly this entry later. */
  push: (entry: OverlayEntry) => OverlayToken;
  /** Removes the entry `token` added, wherever it is in the stack. A second pop does nothing. */
  pop: (token: OverlayToken) => void;
  /** The sheet is (or is no longer) covered by another screen. Unknown tokens are ignored. */
  setCovered: (token: OverlayToken, covered: boolean) => void;
  /** The sheet on top, or null when no sheet is over the player. */
  top: () => OverlayTop | null;
  /** Account change (accountScope.ts): no sheet of the previous account stays. */
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
};

export function createOverlayStack(): OverlayStack {
  let entries: (OverlayTop & { token: OverlayToken })[] = [];
  let nextToken = 1;
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((l) => l());
  return {
    push(entry) {
      const token = nextToken++;
      entries = [...entries, { mode: entry.mode, responseId: entry.responseId, covered: true, token }];
      changed();
      return token;
    },
    pop(token) {
      const next = entries.filter((e) => e.token !== token);
      if (next.length === entries.length) return;
      entries = next;
      changed();
    },
    setCovered(token, covered) {
      const found = entries.find((e) => e.token === token);
      if (!found || found.covered === covered) return;
      entries = entries.map((e) => (e.token === token ? { ...e, covered } : e));
      changed();
    },
    top() {
      const last = entries[entries.length - 1];
      return last ? { mode: last.mode, responseId: last.responseId, covered: last.covered } : null;
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
