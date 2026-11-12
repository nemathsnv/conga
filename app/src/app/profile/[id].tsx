// Board R-Profile: someone else's profile. The … menu opens SF-Menu (Copy link, Share to…, Report, Block).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spinner } from '@/ui/HomeStates';
import { ChevronLeft, MoreIcon } from '@/ui/Icons';
import { ProfileBody, useProfile } from '@/ui/ProfileView';
import { useGoBack } from '@/ui/navigation';
import { colors } from '@/ui/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, responses } = useProfile({ id });
  return (
    <View style={s.root}>
      <View style={[s.header, { marginTop: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => goBack()} style={s.headerButton}>
          <ChevronLeft />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More: report, block, copy link"
          disabled={!profile}
          onPress={() => profile && router.push({ pathname: '/safety', params: { flow: 'share', kind: 'profile', id: profile.id, authorId: profile.id, authorName: profile.name, authorUsername: profile.username, authorPhoto: profile.photo_path ?? '', title: `${profile.name} · @${profile.username}` } })}
          style={s.headerButton}
        >
          <MoreIcon color={colors.text} size={24} />
        </Pressable>
      </View>
      {profile === undefined ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner light={false} />
        </View>
      ) : profile ? (
        // Pushed: the left edge stays the back swipe.
        <ProfileBody profile={profile} responses={responses} own={profile.is_own} edgeGuard />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { height: 44, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
