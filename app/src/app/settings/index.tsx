// Board S-Settings (gear on Me) and LV-SignOut (only when an unposted recording is on this phone).
// Community guidelines and Help and feedback need Nemat's document and address
// (docs/BLOCKERS.md, Gate 5 items). Those rows are drawn and inactive until then.
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';
import { ActionSheet } from '@/ui/ActionSheet';
import { ActivityTabIcon, ChevronLeft, ChevronRightIcon, PersonIcon, PlacePinIcon, PlusIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';
import { loadPendingPost, savePendingPost } from '@/video/pendingPost';
import { deleteRecordingFiles } from '@/video/upload';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, signOut } = useSession();
  const [signOutAsk, setSignOutAsk] = useState<number | null>(null);

  const onSignOut = async () => {
    const pending = await loadPendingPost();
    if (pending) {
      setSignOutAsk(1);
      return;
    }
    await signOut();
  };
  const signOutAnyway = async () => {
    const pending = await loadPendingPost();
    if (pending) deleteRecordingFiles(pending.recording);
    await savePendingPost(null);
    setSignOutAsk(null);
    await signOut();
  };

  const row = (label: string, opts: { value?: string | null; icon?: ReactNode; iconColor?: string; onPress?: () => void; inset?: boolean }) => (
    <Pressable accessibilityRole={opts.onPress ? 'button' : undefined} onPress={opts.onPress} disabled={!opts.onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
      {opts.icon ? <View style={[s.ic, { backgroundColor: opts.iconColor ?? '#8E8E93' }]}>{opts.icon}</View> : null}
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.chev}>
        {opts.value ? (
          <Text style={s.value} numberOfLines={1}>
            {opts.value}
          </Text>
        ) : null}
        <ChevronRightIcon color="#C7C7CC" size={16} />
      </View>
    </Pressable>
  );
  const sep = (inset = false) => <View style={[s.sep, inset && { marginLeft: 60 }]} />;

  return (
    <View style={s.root}>
      <View style={[s.header, { top: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.back}>
          <ChevronLeft />
        </Pressable>
        <Text style={s.headerTitle}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 57, paddingBottom: 60 }}>
        <View style={s.group}>
          {row('Name', { value: state?.profile?.name, onPress: () => router.push('/profile/edit') })}
          {sep()}
          {row('Username', { value: state?.profile?.username ? `@${state.profile.username}` : null, onPress: () => router.push('/profile/edit') })}
          {sep()}
          {row('Email', { value: state?.email })}
        </View>
        <Text style={s.cap}>Your feed</Text>
        <View style={s.group}>
          {row('Places', { icon: <PlacePinIcon size={16} color={colors.white} />, iconColor: colors.text, onPress: () => router.push('/settings/places') })}
          {sep(true)}
          {row('Notifications', { icon: <ActivityTabIcon color={colors.white} on size={18} />, iconColor: colors.dangerBorder, onPress: () => router.push('/notifications/settings') })}
        </View>
        <Text style={s.cap}>Closed beta</Text>
        <View style={s.group}>{row('Invite people', { icon: <PlusIcon color={colors.white} />, iconColor: '#34C759', onPress: () => router.push('/settings/invites') })}</View>
        <Text style={s.cap}>Safety and help</Text>
        <View style={s.group}>
          {row('Blocked accounts', { icon: <PersonIcon size={16} color={colors.white} />, onPress: () => router.push('/settings/blocked') })}
          {sep(true)}
          {row('Community guidelines', { icon: <PersonIcon size={16} color={colors.white} /> })}
          {sep(true)}
          {row('Help and feedback', { icon: <PersonIcon size={16} color={colors.white} /> })}
        </View>
        <View style={[s.group, { marginTop: 22 }]}>
          <Pressable accessibilityRole="button" onPress={() => void onSignOut()} style={({ pressed }) => [s.row, { justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
            <Text style={[s.rowLabel, { flex: 0, color: colors.dangerBorder }]}>Sign out</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/settings/delete-account')} style={({ pressed }) => [s.foot, pressed && { opacity: 0.6 }]}>
          <Text style={s.footText}>Delete account</Text>
        </Pressable>
      </ScrollView>

      {/* Board LV-SignOut */}
      <Modal visible={signOutAsk !== null} transparent animationType="fade" onRequestClose={() => setSignOutAsk(null)}>
        <ActionSheet
          title="Sign out?"
          lines={[`You have ${signOutAsk ?? 1} recording that hasn't posted. Signing out deletes it from this phone.`]}
          actions={[{ label: 'Sign out anyway', destructive: true, onPress: () => void signOutAnyway() }]}
          onCancel={() => setSignOutAsk(null)}
        />
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { position: 'absolute', left: 6, right: 6, height: 44, flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { position: 'absolute', left: 54, right: 54, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  group: { marginHorizontal: 16, borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  ic: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, ...type.button16, fontWeight: '400', color: colors.text, fontFamily },
  chev: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '55%' },
  value: { ...type.label15, color: colors.textTertiary, fontFamily },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: colors.separator },
  cap: { paddingTop: 22, paddingHorizontal: 32, paddingBottom: 7, ...type.caption13, color: colors.textSecondary, fontFamily },
  foot: { paddingTop: 7, paddingHorizontal: 32, alignItems: 'center' },
  footText: { ...type.caption13, lineHeight: 18, color: colors.textTertiary, fontFamily },
});
