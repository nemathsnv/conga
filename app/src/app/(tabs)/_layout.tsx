import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/ui/TabBar';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#FFFFFF' } }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home', sceneStyle: { backgroundColor: '#000000' } }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen
        name="create"
        options={{ title: 'Record' }}
        listeners={{
          // The + opens the C-Plus sheet (phase 3). Until then it does nothing.
          tabPress: (e) => e.preventDefault(),
        }}
      />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="me" options={{ title: 'Me' }} />
    </Tabs>
  );
}
