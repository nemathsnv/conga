// Board N-Settings (SPEC.md Section 15): Pause all, then the switches grouped as Your
// responses, People, Prompts and Likes. Reached from Settings (S-Settings, phase 5); until
// then from the development tools on Me. If the phone's permission is off, N-Prime opens
// instead with a button to the phone's settings.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getNotificationState, updateNotificationPrefs, type NotificationPrefs } from '@/lib/content';
import { permissionGranted } from '@/lib/notifications';
import { ChevronLeft } from '@/ui/Icons';
import { Spinner } from '@/ui/HomeStates';
import { colors, fontFamily, type } from '@/ui/theme';

type Key = keyof NotificationPrefs;

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        if (!(await permissionGranted())) {
          router.replace({ pathname: '/notifications/prime', params: { mode: 'settings' } });
          return;
        }
        try {
          const state = await getNotificationState();
          if (!cancelled) setPrefs(state.prefs);
        } catch (e) {
          console.error('get_notification_state failed', e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [router]),
  );

  const toggle = async (key: Key, value: boolean) => {
    if (!prefs) return;
    const before = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      const next = await updateNotificationPrefs({ [key]: value });
      setPrefs(next.prefs);
    } catch {
      setPrefs(before);
    }
  };

  const row = (key: Key, label: string, sub?: string) => (
    <View style={[s.row, { minHeight: sub ? 58 : 48 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.label}>{label}</Text>
        {sub ? <Text style={s.sub}>{sub}</Text> : null}
      </View>
      <Switch value={!!prefs?.[key]} onValueChange={(v) => void toggle(key, v)} trackColor={{ true: '#34C759', false: colors.separator }} accessibilityLabel={label} />
    </View>
  );
  const sep = <View style={s.sep} />;

  return (
    <View style={s.root}>
      <View style={[s.header, { top: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.back}>
          <ChevronLeft />
        </Pressable>
        <Text style={s.headerTitle}>Notifications</Text>
      </View>
      {prefs === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner light={false} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 57, paddingBottom: 40 }}>
          <View style={s.group}>{row('pause_all', 'Pause all', 'Nothing until you turn this off')}</View>
          <Text style={s.caption}>Your responses</Text>
          <View style={s.group}>
            {row('video_replies', 'Video replies')}
            {sep}
            {row('comments', 'Comments')}
            {sep}
            {row('comment_replies', 'Replies to your comments')}
          </View>
          <Text style={s.caption}>People</Text>
          <View style={s.group}>
            {row('new_followers', 'New followers')}
            {sep}
            {row('followed_respond', 'People you follow respond', 'Can be a lot')}
          </View>
          <Text style={s.caption}>Prompts</Text>
          <View style={s.group}>
            {row('tonight_prompt', "Tonight's prompt", 'Once a day, global')}
            {sep}
            {row('place_prompts', 'New prompts in places you follow', 'All places you follow')}
          </View>
          <Text style={s.caption}>Likes</Text>
          <View style={s.group}>{row('likes', 'Likes on your responses', 'Shown in Activity either way')}</View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { position: 'absolute', left: 6, right: 6, height: 44, flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { position: 'absolute', left: 54, right: 54, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  group: { marginHorizontal: 16, borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  label: { ...type.button16, fontWeight: '400', color: colors.text, fontFamily },
  sub: { marginTop: 1, ...type.caption13, color: colors.textSecondary, fontFamily },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: colors.separator },
  caption: { paddingTop: 22, paddingHorizontal: 32, paddingBottom: 7, ...type.caption13, color: colors.textSecondary, fontFamily },
});
