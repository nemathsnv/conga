// Boards O-Email (enter email, then the 6-digit code) and E-Code (code didn't work).
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track } from '@/lib/analytics';
import { signinProviders } from '@/lib/api';
import { sendEmailCode, verifyEmailCode } from '@/lib/auth';
import { formatCountdown, isValidEmail, normaliseOtp, OTP_LENGTH } from '@/lib/validation';
import { Button, Header, Lead, Title } from '@/ui/components';
import { colors, fontFamily, layout, type } from '@/ui/theme';

// Supabase sends at most one code a minute to the same address, so the countdown matches.
const RESEND_SECONDS = 60;

export default function EmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeFailed, setCodeFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeInput = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const send = async (to: string) => {
    setBusy(true);
    try {
      const providers = await signinProviders(to);
      const other = providers.find((p) => p === 'apple' || p === 'google');
      if (other && !providers.includes('email')) {
        router.push({ pathname: '/(onboarding)/linked', params: { provider: other, email: to } });
        return;
      }
      track('signup_started', { method: 'email' });
      await sendEmailCode(to);
      setSentTo(to);
      setCode('');
      setCodeFailed(false);
      setResendIn(RESEND_SECONDS);
      setTimeout(() => codeInput.current?.focus(), 50);
    } catch (e) {
      console.error('send code failed', e);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!sentTo || code.length !== OTP_LENGTH || busy) return;
    setBusy(true);
    try {
      const ok = await verifyEmailCode(sentTo, code);
      if (ok) {
        router.replace('/(onboarding)');
      } else {
        setCodeFailed(true);
      }
    } catch (e) {
      console.error('verify code failed', e);
    } finally {
      setBusy(false);
    }
  };

  const change = () => {
    setSentTo(null);
    setCode('');
    setCodeFailed(false);
  };

  const emailOk = isValidEmail(email);
  const canContinue = sentTo ? code.length === OTP_LENGTH && !codeFailed : emailOk;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header />
      <View style={s.body}>
        <Title>Continue with email</Title>
        <Lead>We&apos;ll send a code. No password to remember.</Lead>
      </View>

      <View style={s.emailRow}>
        <Text style={s.emailLabel}>Email</Text>
        {sentTo ? (
          <>
            <Text style={s.emailValue} numberOfLines={1}>{sentTo}</Text>
            <Pressable accessibilityRole="button" onPress={change} hitSlop={8}>
              <Text style={s.change}>Change</Text>
            </Pressable>
          </>
        ) : (
          <TextInput
            style={s.emailInput}
            value={email}
            onChangeText={setEmail}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={() => emailOk && void send(email.trim().toLowerCase())}
            accessibilityLabel="Email"
          />
        )}
      </View>

      {sentTo ? (
        <View style={s.codeBlock}>
          <Text style={s.codeTitle}>Enter the 6-digit code</Text>
          <Text style={s.codeSent}>Sent to {sentTo}</Text>
          <View style={s.boxes} accessibilityLabel={`Code, ${code.length} of 6 digits entered`}>
            {Array.from({ length: OTP_LENGTH }, (_, i) => {
              const digit = code[i] ?? '';
              const active = !codeFailed && i === code.length;
              return (
                <View key={i} style={[s.box, active && s.boxActive, codeFailed && s.boxError]}>
                  {digit ? <Text style={[s.boxDigit, codeFailed && { color: colors.danger }]}>{digit}</Text> : null}
                  {active ? <View style={s.caret} /> : null}
                </View>
              );
            })}
            {/* The real input lies over the boxes, invisible, so a tap anywhere on them focuses it. */}
            <TextInput
              ref={codeInput}
              style={s.codeInput}
              value={code}
              onChangeText={(v) => {
                setCodeFailed(false);
                setCode(normaliseOtp(v));
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={OTP_LENGTH}
              caretHidden
              contextMenuHidden
              onSubmitEditing={() => void verify()}
              accessibilityLabel="6-digit code"
            />
          </View>
          {codeFailed ? (
            <>
              <Text style={s.errorText}>That code didn&apos;t work. It may have expired, so use the newest email.</Text>
              <Pressable accessibilityRole="button" onPress={() => void send(sentTo)} disabled={busy} hitSlop={8}>
                <Text style={s.resendLink}>Send a new code</Text>
              </Pressable>
            </>
          ) : resendIn > 0 ? (
            <Text style={s.resend}>Resend code in {formatCountdown(resendIn)}</Text>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => void send(sentTo)} disabled={busy} hitSlop={8}>
              <Text style={s.resendLink}>Send a new code</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, layout.bottomButton) }]}>
        <Button
          title="Continue"
          dimmed={!canContinue}
          disabled={busy}
          onPress={() => (sentTo ? void verify() : void send(email.trim().toLowerCase()))}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const BOX_W = 46;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: layout.pageInset, marginTop: 18 },
  emailRow: {
    marginHorizontal: layout.groupInset,
    marginTop: 40,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.fill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  emailLabel: { width: 50, ...type.label15, color: colors.textSecondary, fontFamily },
  emailValue: { flex: 1, ...type.body16, color: colors.text, fontFamily },
  emailInput: { flex: 1, height: 52, ...type.body16, color: colors.text, fontFamily, paddingVertical: 0 },
  change: { ...type.medium14, color: colors.textSecondary, fontFamily },
  codeBlock: { paddingHorizontal: layout.pageInset, marginTop: 36 },
  codeTitle: { ...type.semi15, color: colors.text, fontFamily },
  codeSent: { ...type.caption13, color: colors.textSecondary, marginTop: 2, fontFamily },
  boxes: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between' },
  box: { width: BOX_W, height: 56, borderRadius: 12, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  boxActive: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.text },
  boxError: { backgroundColor: colors.dangerFill, borderWidth: 1.5, borderColor: colors.dangerBorder },
  boxDigit: { fontSize: 24, lineHeight: 30, fontWeight: '600', color: colors.text, fontFamily },
  caret: { width: 2, height: 26, backgroundColor: colors.text, borderRadius: 1 },
  codeInput: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, color: 'transparent', backgroundColor: 'transparent', fontSize: 1 },
  resend: { ...type.body14, color: colors.textTertiary, marginTop: 16, fontFamily },
  resendLink: { ...type.semi15, color: colors.text, marginTop: 14, fontFamily },
  errorText: { ...type.body14, color: colors.danger, marginTop: 14, fontFamily },
  footer: { marginTop: 'auto', paddingHorizontal: layout.controlInset },
});
