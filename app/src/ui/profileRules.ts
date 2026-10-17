// Pure rules for ProfileView (no native imports, Jest-tested).

/** Whether the Replies grid loads (again) when the profile loads or reloads: when the Replies tab
 *  is open, and whenever it was loaded before (Me reloads on every focus), so a video reply deleted
 *  from its player is gone when you come back. Never loaded and not open: wait for the tab. */
export function shouldLoadReplies(tab: 'responses' | 'replies', repliesLoaded: boolean): boolean {
  return tab === 'replies' || repliesLoaded;
}
