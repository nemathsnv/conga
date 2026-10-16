// Back from a screen that a link or a notification can open directly. Opened that way there may be
// nothing behind it (the app was closed), and router.back() would do nothing or leave the app;
// Home is the place to go (SPEC.md Section 4: closing returns to Home).
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

export function useGoBack(): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
}
