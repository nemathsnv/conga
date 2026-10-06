// Boards O-Invite (closed beta code step) and W-Invalid (code not found, expired or used).
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl, checkInvite, joinWaitlist, redeemInvite, type InviteCheck } from '@/lib/api';
import { inviteErrorCopy } from '@/lib/inviteCopy';
import { useSession } from '@/lib/session';
import { useAdvance } from '@/lib/useStepNavigation';
import { inviteCodeComplete, normaliseInviteCode } from '@/lib/validation';
import { Avatar, Button, Header, Lead, Pill, Title } from '@/ui/components';
import { colors, fontFamily, layout, type } from '@/ui/theme';

// The board's row of faces. People and photos in the boards are placeholders.
const FACES = [
  require('../../../assets/placeholders/putu_a.jpg'),
  require('../../../assets/placeholders/maya_a.jpg'),
  require('../../../assets/placeholders/wayan_a.jpg'),
  require('../../../assets/placeholders/sofia_a.jpg'),
];

export default function InviteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, signOut } = useSession();
  const advance = useAdvance();
  const [code, setCode] = useState('');
  const [check, setCheck] = useState<InviteCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef('');

  // Live check once the code has the full shape (O-Invite shows "Invited by Putu Ayu").
  const onCodeChange = (value: string) => {
    setCode(normaliseInviteCode(value));
    setCheck(null);
  };

  useEffect(() => {
    latest.current = code;
    if (!inviteCodeComplete(code)) return;
    const t = setTimeout(() => {
      void checkInvite(code)
        .then((result) => {
          if (latest.current === code) setCheck(result);
        })
        .catch((e) => console.error('check_invite failed', e));
    }, 250);
    return () => clearTimeout(t);
  }, [code]);

  const valid = check?.status === 'valid';
  const error = check && !valid ? inviteErrorCopy(check.status, check.inviter_first_name) : null;

  const redeem = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const result = await redeemInvite(code);
      if (result.status === 'valid' || result.status === 'already_in') {
        await advance();
      } else {
        setCheck(result);
      }
    } catch (e) {
      console.error('redeem_invite failed', e);
    } finally {
      setBusy(false);
    }
  };

  const waitlist = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await joinWaitlist();
      await advance();
    } catch (e) {
      console.error('join_waitlist failed', e);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    await signOut();
    router.replace('/(onboarding)/welcome');
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header onBack={() => void leave()} />
      <View style={s.body}>
        <View style={s.faces}>
          {FACES.map((src, i) => (
            <Image key={i} source={src} style={[s.face, i > 0 && { marginLeft: -10 }]} />
          ))}
        </View>
        <View style={s.betaPill}>
          <Text style={s.betaPillText}>Closed beta</Text>
        </View>
        <Title style={{ marginTop: 10 }}>Shortcut is in closed beta.</Title>
        <Lead style={{ marginTop: 12 }}>Access is limited while we&apos;re testing. Use an invite if you have one, or join the waitlist.</Lead>
      </View>

      <View style={s.codeBlock}>
        <Text style={s.codeLabel}>Invite code</Text>
        <TextInput
          style={[s.codeInput, error ? s.codeInputError : null]}
          value={code}
          onChangeText={onCodeChange}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="go"
          onSubmitEditing={() => void redeem()}
          accessibilityLabel="Invite code"
        />
        {valid ? (
          <View style={s.invitedBy}>
            <Avatar uri={avatarUrl(check?.inviter_photo_path)} size={18} />
            <Text style={s.invitedByText}>
              Invited by <Text style={{ fontWeight: '600' }}>{check?.inviter_name ?? 'the Shortcut team'}</Text>
            </Text>
          </View>
        ) : error ? (
          <Text style={s.errorText}>{error}</Text>
        ) : null}
        <Button title="Continue" dimmed={!valid} disabled={busy} onPress={() => void redeem()} style={{ marginTop: 18 }} />
        <Text style={s.linkHint}>Opened an invite link? You&apos;re already in.</Text>
      </View>

      <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 30) }]}>
        <View style={s.waitlistBlock}>
          <View style={s.hairline} />
          <View style={s.waitlistRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.waitlistTitle}>No invite yet?</Text>
              <Text style={s.waitlistSub}>We&apos;ll email you when there&apos;s room.</Text>
            </View>
            <Pill title="Join waitlist" onPress={() => void waitlist()} disabled={busy} />
          </View>
        </View>
        <Text style={s.signedIn}>
          Signed in as {state?.email ?? ''} ·{' '}
          <Text style={s.notYou} onPress={() => void leave()} accessibilityRole="button">
            Not you?
          </Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: layout.pageInset, marginTop: 22 },
  faces: { flexDirection: 'row' },
  face: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.white },
  betaPill: { alignSelf: 'flex-start', marginTop: 18, height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.fill, justifyContent: 'center' },
  betaPillText: { ...type.semi12, color: colors.textSecondary, fontFamily },
  codeBlock: { paddingHorizontal: layout.controlInset, marginTop: 44 },
  codeLabel: { ...type.caption13, color: colors.textSecondary, paddingHorizontal: 4, paddingBottom: 8, fontFamily },
  codeInput: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.fill,
    color: colors.text,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1.5,
    fontFamily,
  },
  codeInputError: { backgroundColor: colors.dangerFill, borderWidth: 1.5, borderColor: colors.dangerBorder },
  invitedBy: { marginTop: 8, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  invitedByText: { ...type.caption13, color: colors.text, fontFamily },
  errorText: { marginTop: 8, paddingHorizontal: 4, ...type.caption13, color: colors.danger, fontFamily },
  linkHint: { marginTop: 10, textAlign: 'center', ...type.caption13, color: colors.textTertiary, fontFamily },
  bottom: { marginTop: 'auto' },
  waitlistBlock: { paddingHorizontal: layout.controlInset },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  waitlistRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  waitlistTitle: { ...type.semi15, color: colors.text, fontFamily },
  waitlistSub: { ...type.caption13, color: colors.textSecondary, marginTop: 2, fontFamily },
  signedIn: { marginTop: 48, textAlign: 'center', ...type.caption12, color: colors.textTertiary, fontFamily },
  notYou: { color: colors.text, fontWeight: '500' },
});
