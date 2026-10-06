// Board R-Profile: someone else's profile. The … menu (Report, Block, Copy link) is phase 5.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spinner } from '@/ui/HomeStates';
import { ChevronLeft, MoreIcon } from '@/ui/Icons';
import { ProfileBody, useProfile } from '@/ui/ProfileView';
import { colors } from '@/ui/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, responses } = useProfile({ id });
  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <View style={[s.header, { marginTop: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.headerButton}>
          <ChevronLeft />
        </Pressable>
        <View style={s.headerButton} accessibilityLabel="More: report, block, copy link">
          <MoreIcon color={colors.text} size={24} />
        </View>
      </View>
      {profile === undefined ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner light={false} />
        </View>
      ) : profile ? (
        <ProfileBody profile={profile} responses={responses} own={profile.is_own} />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { height: 44, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
