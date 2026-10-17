import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { startAnalytics, track } from '@/lib/analytics';
import { startConnectivity } from '@/lib/connectivity';
import { launchTap, onNotificationTap, registerTokenIfAllowed, syncTimezone, type PushTap } from '@/lib/notifications';
import { claimPush } from '@/lib/pushRoutes';
import { SessionProvider, useSession } from '@/lib/session';
import { resetAccountScopedUi } from '@/ui/accountScope';
import { RecordEntryProvider } from '@/ui/recordEntry';
import { PostingProvider } from '@/video/posting';

void SplashScreen.preventAutoHideAsync();

// Pushes already followed in this run of the app (the phone keeps the last response all session).
const handledPushes = new Set<string>();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <PostingProvider>
          <RecordEntryProvider>
            <RootNavigator />
          </RecordEntryProvider>
        </PostingProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { ready, step, session } = useSession();
  const router = useRouter();

  // The signed-in account changes (sign out, or another account signs in): nothing in memory that
  // belongs to the previous account may show for the next (accountScope.ts).
  const accountId = session?.user.id ?? null;
  const lastAccount = useRef(accountId);
  useEffect(() => {
    if (lastAccount.current === accountId) return;
    lastAccount.current = accountId;
    resetAccountScopedUi();
  }, [accountId]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // The event queue and the connection watch live for the whole app.
  useEffect(() => {
    const stopAnalytics = startAnalytics();
    const stopConnectivity = startConnectivity();
    return () => {
      stopAnalytics();
      stopConnectivity();
    };
  }, []);

  // Signed in: keep the phone's timezone and push token current (the permission itself is
  // only ever asked by N-Prime), and follow tapped notifications.
  useEffect(() => {
    // The navigator exists only once `ready` (below); a push cannot be followed before it.
    if (!ready || step !== 'home') return;
    void syncTimezone();
    void registerTokenIfAllowed();
    const foreground = AppState.addEventListener('change', (st) => {
      if (st === 'active') void syncTimezone();
    });
    // A tap is followed once, whichever way it arrives: while the app runs (foreground or
    // background) through the listener, or as the tap that opened a closed app (launchTap), which
    // the listener below never sees. The push goes on top of the tabs, so Back lands on Home.
    const follow = (tap: PushTap) => {
      if (!claimPush(tap.id, handledPushes)) return;
      track('push_opened', { type: tap.kind });
      setTimeout(() => router.push(tap.href as never), 0);
    };
    const launch = launchTap();
    if (launch) follow(launch);
    const tap = onNotificationTap(follow);
    return () => {
      foreground.remove();
      tap();
    };
  }, [ready, step, router]);

  if (!ready) return null;

  const inApp = step === 'home';
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="i/[code]" options={{ animation: 'none' }} />
        <Stack.Protected guard={inApp}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="plus" options={{ presentation: 'transparentModal', animation: 'fade' }} />
          <Stack.Screen name="record/[promptId]" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="record/review" options={{ animation: 'none', gestureEnabled: false }} />
          <Stack.Screen name="player/[promptId]" options={{ animation: 'fade' }} />
          <Stack.Screen name="profile/[id]" />
          <Stack.Screen name="profile/edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="profile/follows" />
          <Stack.Screen name="comments/[responseId]" options={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="replies/[rootId]" options={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="reply/[id]" options={{ animation: 'fade' }} />
          <Stack.Screen name="a/[activityId]" options={{ animation: 'none' }} />
          <Stack.Screen name="r/[id]" options={{ animation: 'none' }} />
          <Stack.Screen name="p/[id]" options={{ animation: 'none' }} />
          <Stack.Screen name="u/[username]" options={{ animation: 'none' }} />
          <Stack.Screen name="notifications/prime" options={{ presentation: 'transparentModal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="notifications/settings" />
          <Stack.Screen name="safety" options={{ presentation: 'transparentModal', animation: 'fade' }} />
          <Stack.Screen name="settings/index" />
          <Stack.Screen name="settings/blocked" />
          <Stack.Screen name="settings/delete-account" />
          <Stack.Screen name="settings/confirm-email" />
          <Stack.Screen name="notice/[actionId]" />
          <Stack.Screen name="search" options={{ animation: 'fade' }} />
          <Stack.Screen name="settings/places" />
          <Stack.Screen name="settings/invites" />
          <Stack.Screen name="place/[id]" />
          <Stack.Screen name="suggest/write" options={{ presentation: 'modal' }} />
          <Stack.Screen name="suggest/scope" />
          <Stack.Screen name="suggest/preview" options={{ animation: 'fade' }} />
          <Stack.Screen name="suggest/submitted" options={{ animation: 'fade' }} />
          <Stack.Screen name="suggestions" />
          <Stack.Screen name="suggestion/[id]" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Protected guard={!inApp}>
          <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
