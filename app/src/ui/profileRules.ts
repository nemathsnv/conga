// Pure rules for ProfileView (no native imports, Jest-tested).

/** Whether the Replies grid loads (again) when the profile loads or reloads: when the Replies tab
 *  is open, and whenever it was loaded before (Me reloads on every focus), so a video reply deleted
 *  from its player is gone when you come back. Never loaded and not open: wait for the tab. */
export function shouldLoadReplies(tab: 'responses' | 'replies', repliesLoaded: boolean): boolean {
  return tab === 'replies' || repliesLoaded;
}

/**
 * Where the page coming on screen scrolls to, from the page leaving (y), its own position (own)
 * and the header's height: the same position while the header shows; once it has scrolled away,
 * at least past the header (the tabs at the top), keeping a position further down.
 */
export function profileAlignedOffset(y: number, own: number, header: number): number {
  if (header <= 0) return own;
  if (y < header) return y;
  return Math.max(own, header);
}
