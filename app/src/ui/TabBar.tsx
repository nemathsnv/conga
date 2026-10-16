// The five-tab bar from the Main board (dark glass over video) and the R-Discover board
// (light). Home, Discover, +, Activity, Me. The + opens the C-Plus sheet from phase 3 on.
import { BlurView } from 'expo-blur';
import type { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEffect } from 'react';

import { refreshUnread, useUnread } from './activityStore';
import { ActivityTabIcon, DiscoverTabIcon, HomeTabIcon, MeTabIcon, PlusIcon } from './Icons';
import { colors, fontFamily, type } from './theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: { name: string; label: string }[] = [
  { name: 'index', label: 'Home' },
  { name: 'discover', label: 'Discover' },
  { name: 'create', label: '' },
  { name: 'activity', label: 'Activity' },
  { name: 'me', label: 'Me' },
];

export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name ?? 'index';
  // "Filled bell when active" (SPEC.md Section 4): unread activity.
  const unread = useUnread();
  useEffect(() => {
    void refreshUnread();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void refreshUnread();
    });
    return () => sub.remove();
  }, [current]);
  const dark = current === 'index';
  const onColor = dark ? colors.white : colors.text;
  const offColor = dark ? colors.white62 : colors.textTertiary;

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8), height: 84 - 34 + Math.max(insets.bottom, 8) }, dark ? s.barDark : s.barLight]}>
      {dark ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} /> : <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? colors.tabBarDark : colors.tabBarLight }]} />
      {TABS.map((tab) => {
        const route = state.routes.find((r) => r.name === tab.name);
        if (!route) return null;
        const on = current === tab.name;
        const color = on ? onColor : offColor;
        const press = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!on && !event.defaultPrevented) navigation.navigate(route.name);
        };
        if (tab.name === 'create') {
          return (
            <Pressable key={tab.name} accessibilityRole="button" accessibilityLabel="Respond or suggest a prompt" onPress={press} style={s.tab}>
              <View style={[s.plus, { backgroundColor: dark ? colors.white : colors.text }]}>
                <PlusIcon color={dark ? colors.black : colors.white} />
              </View>
            </Pressable>
          );
        }
        return (
          <Pressable key={tab.name} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={tab.label} onPress={press} style={s.tab}>
            {tab.name === 'index' && <HomeTabIcon color={color} on={on} />}
            {tab.name === 'discover' && <DiscoverTabIcon color={color} on={on} />}
            {tab.name === 'activity' && <ActivityTabIcon color={color} on={on || unread > 0} />}
            {tab.name === 'me' && <MeTabIcon color={color} on={on} />}
            <Text style={[s.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingTop: 8,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  barDark: { borderTopColor: colors.tabBarDarkBorder },
  barLight: { borderTopColor: colors.tabBarLightBorder },
  tab: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { ...type.tab10, fontFamily },
  plus: { width: 44, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
