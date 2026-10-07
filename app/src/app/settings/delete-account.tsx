// Board SF-DeleteAccount (SPEC.md Section 18): what happens, confirm with the same sign-in
// method first, then a 30-day soft delete. Apple and Google re-sign in natively; email sends a
// code (settings/confirm-email). The server refuses without a sign-in from the last ten minutes.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SignInCancelled, signInWithApple, signInWithGoogle } from '@/lib/auth';
import { deleteAccount } from '@/lib/content';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/components';
import { CheckIcon, ChevronLeft, PersonIcon, VideoReplyIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, state, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const provider = (session?.user.app_metadata?.provider as string | undefined) ?? 'email';
  const username = state?.profile?.username ? `@${state.profile.username}` : 'Your username';

  const confirmAndDelete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (provider === 'apple') await signInWithApple();
      else if (provider === 'google') await signInWithGoogle();
      else {
        router.push('/settings/confirm-email');
        return;
      }
      await deleteAccount();
      await signOut();
    } catch (e) {
      if (!(e instanceof SignInCancelled)) console.error('delete account failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { top: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.back}>
          <ChevronLeft />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 62, paddingHorizontal: 24, paddingBottom: 220 }}>
        <Text style={s.h1}>Delete your account?</Text>
        <View style={s.points}>
          <Point icon={<VideoReplyIcon size={16} color={colors.text} />} text="Your responses, video replies and comments are hidden now and permanently deleted after 30 days." />
          <Point icon={<PersonIcon size={16} color={colors.text} />} text={`Your profile disappears. ${username} stays reserved for the 30 days, then becomes available.`} />
          <Point icon={<CheckIcon size={16} color={colors.text} />} text="Prompts you suggested stay live, without your name." />
          <Point icon={<CheckIcon size={16} color={colors.text} />} text="You have 30 days to change your mind. Sign back in to cancel." />
        </View>
      </ScrollView>
      <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        <Text style={s.confirmNote}>We&apos;ll ask you to confirm it&apos;s you first.</Text>
        <Pressable accessibilityRole="button" onPress={() => void confirmAndDelete()} disabled={busy} style={({ pressed }) => [s.deleteButton, (pressed || busy) && { opacity: 0.7 }]}>
          <Text style={s.deleteText}>Delete account</Text>
        </Pressable>
        <Button title="Cancel" variant="text" onPress={() => router.back()} style={{ marginTop: 6 }} textStyle={{ fontSize: 16, fontWeight: '500' }} />
      </View>
    </View>
  );
}

function Point({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={s.point}>
      <View style={s.pointIcon}>{icon}</View>
      <Text style={s.pointText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { position: 'absolute', left: 6, right: 6, height: 44, flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -0.7, color: colors.text, fontFamily },
  points: { marginTop: 20, gap: 16 },
  point: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  pointIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1, paddingTop: 6, ...type.label15, lineHeight: 21, color: colors.text, fontFamily },
  bottom: { position: 'absolute', left: 20, right: 20, bottom: 0, backgroundColor: colors.white },
  confirmNote: { marginBottom: 14, textAlign: 'center', ...type.caption13, color: colors.textTertiary, fontFamily },
  deleteButton: { height: 52, borderRadius: 26, backgroundColor: colors.dangerBorder, alignItems: 'center', justifyContent: 'center' },
  deleteText: { ...type.button16, letterSpacing: -0.2, color: colors.white, fontFamily },
});
