// In-memory UI state that belongs to the signed-in account: the Activity bell's unread count, the
// "feed is stale" mark after a delete or report, and the sheet mode over the player. When the
// account changes (sign out, sign in as someone else) none of it may carry over: the next person
// would see the previous person's bell, or a feed reload they did not cause.
import { setUnread } from './activityStore';
import { takeFeedDirty } from './feedStore';
import { playerOverlays } from './overlayStack';

export function resetAccountScopedUi(): void {
  setUnread(0);
  takeFeedDirty();
  playerOverlays.clear();
}
