import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { resolveStep } from './onboarding';
import { useSession } from './session';

/** After a server action, reloads state and moves to whatever step comes next. */
export function useAdvance() {
  const router = useRouter();
  const { refresh, photoStepPending } = useSession();
  return useCallback(async () => {
    const state = await refresh();
    const step = resolveStep(true, state, photoStepPending);
    switch (step) {
      case 'age':
        router.replace('/(onboarding)/age');
        break;
      case 'invite':
        router.replace('/(onboarding)/invite');
        break;
      case 'waitlist':
        router.replace('/(onboarding)/waitlist');
        break;
      case 'profile':
        router.replace('/(onboarding)/profile');
        break;
      case 'photo':
        router.replace('/(onboarding)/photo');
        break;
      case 'welcome':
        router.replace('/(onboarding)/welcome');
        break;
      case 'home':
        // The root layout swaps to the tabs once state says the person is in.
        break;
    }
  }, [router, refresh, photoStepPending]);
}
