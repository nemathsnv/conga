// Back from a screen that a link or a notification can open directly. Opened that way there may be
// nothing behind it (the app was closed), and router.back() does nothing; Home is the place to go
// (SPEC.md Section 4: closing returns to Home).
//
// "Is there anything behind it" is read from the app's own stack (the root navigator's routes), not
// from router.canGoBack(): on a phone, a screen opened by a link at launch reported that it could go
// back and then did nothing.
import { useRootNavigationState, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { hasScreenBeneath } from '@/lib/links';

export function useGoBack(): () => void {
  const router = useRouter();
  const routeCount = useRootNavigationState()?.routes?.length ?? 0;
  return useCallback(() => {
    if (hasScreenBeneath(routeCount)) router.back();
    else router.replace('/');
  }, [router, routeCount]);
}
