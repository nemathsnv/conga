// Board N-Prime: the notification ask (SPEC.md Section 15). Opened over Home right after the
// first public video posts, once more when the first reply or comment arrives after Not now,
// and from Settings → Notifications when the phone's permission is off (then its button goes
// to the phone's settings).
import { track } from '@/lib/analytics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setNotificationAsk } from '@/lib/content';
import { requestPermissionAndRegister } from '@/lib/notifications';
import { Avatar, Button } from '@/ui/components';
import { colors, fontFamily, type } from '@/ui/theme';

export default function NotificationPrimeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode, ask } = useLocalSearchParams<{ mode?: 'settings'; ask?: string }>();
  const [busy, setBusy] = useState(false);
  const askNumber = Number(ask ?? 0);
  useEffect(() => {
    if (mode !== 'settings') track('notif_ask_shown', { ask_number: askNumber });
  }, [mode, askNumber]);

  const turnOn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'settings') {
        await Linking.openSettings();
      } else {
        const granted = await requestPermissionAndRegister();
        track(granted ? 'notif_ask_accepted' : 'notif_ask_declined', { ask_number: askNumber });
        await setNotificationAsk(granted ? 'accepted' : 'declined').catch(() => undefined);
      }
    } finally {
      setBusy(false);
      router.back();
    }
  };

  const notNow = async () => {
    if (mode !== 'settings') {
      track('notif_ask_declined', { ask_number: askNumber });
      await setNotificationAsk('declined').catch(() => undefined);
    }
    router.back();
  };

  return (
    <View style={s.dim}>
      <Pressable style={{ flex: 1 }} onPress={() => void notNow()} accessibilityLabel="Not now" />
      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 10) + 24 }]}>
        <View style={s.handle} />
        <Text style={s.exampleLabel}>EXAMPLE</Text>
        <View style={s.example}>
          <View style={s.appIcon}>
            <Text style={s.appIconText}>S</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.exampleApp}>Shortcut</Text>
            <Text style={s.exampleText}>Sofia Marín replied to your response with a video</Text>
          </View>
          <Avatar uri={null} size={38} radius={8} />
        </View>
        <Text style={s.title}>Know when people respond to you</Text>
        <Text style={s.text}>Replies and comments on your responses, and new followers. You choose the rest in Settings.</Text>
        <Button title="Turn on notifications" onPress={() => void turnOn()} disabled={busy} style={{ marginTop: 22 }} />
        <Button title="Not now" variant="text" onPress={() => void notNow()} style={{ marginTop: 6 }} textStyle={{ fontSize: 16, fontWeight: '500' }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingTop: 6, paddingHorizontal: 20 },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.separator },
  exampleLabel: { marginTop: 18, paddingHorizontal: 4, ...type.caption12, fontWeight: '600', letterSpacing: 0.3, color: colors.textTertiary, fontFamily },
  example: { marginTop: 6, flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 18, backgroundColor: colors.fill },
  appIcon: { width: 38, height: 38, borderRadius: 9, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  appIconText: { fontSize: 17, fontWeight: '700', color: colors.white, fontFamily },
  exampleApp: { ...type.caption13, fontWeight: '600', color: colors.text, fontFamily },
  exampleText: { marginTop: 2, ...type.body14, lineHeight: 18, color: colors.text, fontFamily },
  title: { marginTop: 20, fontSize: 24, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5, color: colors.text, fontFamily },
  text: { marginTop: 8, ...type.label15, lineHeight: 21, color: colors.textSecondary, fontFamily },
});
