// Boards LV-MyProfile (own profile, populated) and X-Me-Empty (before any response).
// The Settings icon opens S-Settings (app/settings).
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openPrompts } from '@/lib/content';
import { DEV_TOOLS } from '@/lib/env';
import { DevTools } from '@/ui/DevTools';
import { Spinner } from '@/ui/HomeStates';
import { GearIcon } from '@/ui/Icons';
import { ProfileBody, useProfile } from '@/ui/ProfileView';
import { colors } from '@/ui/theme';
import { useOpenRecord } from '@/ui/recordEntry';

export default function MeTab() {
  const router = useRouter();
  const openRecord = useOpenRecord();
  const insets = useSafeAreaInsets();
  const { profile, responses, reload } = useProfile({});

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const respondTonight = async () => {
    try {
      const prompts = await openPrompts();
      const tonight = prompts[0];
      if (tonight) openRecord.open({ pathname: '/record/[promptId]', params: { promptId: tonight.id } });
    } catch (e) {
      console.error('open_prompts failed', e);
    }
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { marginTop: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={() => router.push('/settings')} style={s.headerButton}>
          <GearIcon />
        </Pressable>
      </View>
      {profile === undefined ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner light={false} />
        </View>
      ) : profile ? (
        <ProfileBody profile={profile} responses={responses} own onTonight={() => void respondTonight()} />
      ) : null}
      {DEV_TOOLS ? <DevTools /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { height: 44, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
