import { useFocusEffect, useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getNotificationState } from '@/lib/content';
import { shouldAsk } from '@/lib/notificationAsk';
import { TabBar } from '@/ui/TabBar';

/**
 * The second notification ask (SPEC.md Section 15; Nemat, 7 Oct 2026): the server marks it due
 * when the first reply or comment arrives after Not now; N-Prime opens at the next safe moment,
 * which is the tabs in the foreground (never over recording, review or a sheet).
 */
function useSecondAsk() {
  const router = useRouter();
  const checking = useRef(false);
  const check = useCallback(() => {
    if (checking.current) return;
    checking.current = true;
    getNotificationState()
      .then(({ ask, ask_due }) => {
        if (ask_due && shouldAsk(ask, 'first_reply_or_comment')) router.push('/notifications/prime');
      })
      .catch(() => undefined)
      .finally(() => {
        checking.current = false;
      });
  }, [router]);
  useFocusEffect(
    useCallback(() => {
      check();
    }, [check]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') check();
    });
    return () => sub.remove();
  }, [check]);
}

export default function TabsLayout() {
  const router = useRouter();
  useSecondAsk();
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#FFFFFF' } }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home', sceneStyle: { backgroundColor: '#000000' } }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen
        name="create"
        options={{ title: 'Record' }}
        listeners={{
          // The + opens the C-Plus sheet, never a blank camera (SPEC.md Section 4).
          tabPress: (e) => {
            e.preventDefault();
            router.push('/plus');
          },
        }}
      />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="me" options={{ title: 'Me' }} />
    </Tabs>
  );
}
