// The first onboarding-state load for a signed-in account can fail (a cold start with no
// connection, a blip right after the code was verified, an expired access token). Until it arrives
// the app keeps the splash up (session.tsx `ready`), so it is tried again: when the connection
// comes back, when the app returns to the foreground, when supabase-js refreshes the access token,
// and on a backoff timer. session.tsx stops it once the state has loaded or the account changes.
import { AppState } from 'react-native';

import { subscribeOnline } from './connectivity';
import { supabase } from './supabase';

export const STATE_RETRY_FIRST_MS = 2000;
export const STATE_RETRY_MAX_MS = 60_000;

/** The wait before timed retry number `attempt` (from 0): 2 s, doubling, at most a minute. */
export function stateRetryDelay(attempt: number): number {
  return Math.min(STATE_RETRY_FIRST_MS * 2 ** attempt, STATE_RETRY_MAX_MS);
}

/** Calls `load` again on each of those signals until stopped. Returns the stop function. */
export function retryStateLoad(load: () => Promise<unknown>): () => void {
  let stopped = false;
  let running = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), stateRetryDelay(attempt));
  };

  const run = async () => {
    if (stopped || running) return;
    running = true;
    if (timer) clearTimeout(timer);
    timer = undefined;
    try {
      await load();
    } catch {
      // load() reports its own failures; the next signal or the timer tries again.
    } finally {
      running = false;
    }
    if (stopped) return;
    attempt += 1;
    schedule();
  };

  const online = subscribeOnline((isOnline) => {
    if (isOnline) void run();
  });
  const foreground = AppState.addEventListener('change', (st) => {
    if (st === 'active') void run();
  });
  // Outside the auth callback, which supabase-js runs while it holds its session lock.
  const { data: auth } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'TOKEN_REFRESHED') setTimeout(() => void run(), 0);
  });
  schedule();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    online();
    foreground.remove();
    auth.subscription.unsubscribe();
  };
}
