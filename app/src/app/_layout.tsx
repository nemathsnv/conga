import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { onNotificationTap, registerTokenIfAllowed, syncTimezone } from '@/lib/notifications';
import { SessionProvider, useSession } from '@/lib/session';
import { PostingProvider } from '@/video/posting';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <PostingProvider>
          <RootNavigator />
        </PostingProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { ready, step } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Signed in: keep the phone's timezone and push token current (the permission itself is
  // only ever asked by N-Prime), and follow tapped notifications.
  useEffect(() => {
    if (step !== 'home') return;
    void syncTimezone();
    void registerTokenIfAllowed();
    const foreground = AppState.addEventListener('change', (st) => {
      if (st === 'active') void syncTimezone();
    });
    const tap = onNotificationTap((href) => router.push(href as never));
    return () => {
      foreground.remove();
      tap();
    };
  }, [step, router]);

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
