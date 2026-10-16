// Back from a screen that a link or a notification can open directly. Opened that way there may be
// nothing behind it (the app was closed), and router.back() does nothing; Home is the place to go
// (SPEC.md Section 4: closing returns to Home).
//
// "Is there anything behind it" is read from the focused path of the navigation state
// (hasScreenBeneath), not from router.canGoBack(): on a phone, a screen opened by a link at launch
// reported that it could go back and then did nothing. The root of that state is expo-router's
// one-route wrapper ("__root"), so its own route count is always 1.
//
// Home is router.replace('/(tabs)'): on the simulator, replace('/') from a profile opened by a link
// at launch left the profile on screen; replace('/(tabs)') landed on Home (16 Oct 2026,
// docs/release/SIMULATOR-WALK.md).
import { useRootNavigationState, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { hasScreenBeneath } from '@/lib/links';

export function useGoBack(): () => void {
  const router = useRouter();
  const rootState = useRootNavigationState();
  return useCallback(() => {
    if (hasScreenBeneath(rootState)) router.back();
    else router.replace('/(tabs)');
  }, [router, rootState]);
}
