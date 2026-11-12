import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { nextOnboardingRoute } from './onboarding';
import { useSession } from './session';

/**
 * After a server action, reloads state and moves to whatever step comes next. When the state
 * cannot be reloaded it stays on the screen (the caller's busy state ends, so the person can try
 * again); the root layout swaps to the tabs by itself once state says the person is in.
 */
export function useAdvance() {
  const router = useRouter();
  const { refresh, photoStepPending } = useSession();
  return useCallback(async () => {
    const state = await refresh();
    const route = nextOnboardingRoute(state, photoStepPending);
    if (route) router.replace(route);
  }, [router, refresh, photoStepPending]);
}
