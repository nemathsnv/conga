// What a phone keeps for the signed-in account, and drops when that account signs out, so that
// nothing of theirs reaches the next account signed in on the same phone:
//   - the push token stops receiving this account's notifications (server, needs the session);
//   - queued analytics events are sent under this account first, then dropped;
//   - recent searches (local only) are cleared.
// Unposted recordings are already kept per account (video/pendingPost.ts); the session itself is
// removed by supabase.auth.signOut(). Everything here is best effort and never blocks sign-out.
import { clearQueue, flush } from './analytics';
import { unregisterPushToken } from './notifications';
import { clearRecent } from './recentSearches';

/** Longest the sign-out waits for the server steps (a phone with no connection signs out anyway). */
export const SIGN_OUT_SERVER_WAIT_MS = 3000;

async function bounded(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    work.catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  if (timer) clearTimeout(timer);
}

/** Before the session goes: the steps that need it. */
export async function beforeSignOut(waitMs: number = SIGN_OUT_SERVER_WAIT_MS): Promise<void> {
  await bounded(Promise.allSettled([unregisterPushToken(), flush()]), waitMs);
}

/** After the session is gone (also when it ended without a sign-out, e.g. revoked elsewhere). */
export async function afterSignOut(): Promise<void> {
  await Promise.allSettled([clearQueue(), clearRecent()]);
}
