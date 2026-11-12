// After a block, a report or a delete, the feeds on Home are stale (SPEC.md Section 17: the
// reporter never sees the item again). The safety screen marks them dirty; Home reloads on
// its next focus. In memory, no React state involved.
let dirty = false;

export function markFeedDirty(): void {
  dirty = true;
}

/** True once per dirty mark. */
export function takeFeedDirty(): boolean {
  const was = dirty;
  dirty = false;
  return was;
}
