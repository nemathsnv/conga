import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/ui/TabBar';

export default function TabsLayout() {
  const router = useRouter();
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
