// Confirming it's you with the email code before deleting the account (SPEC.md Section 18,
// "confirm with the same sign-in method first"). Same code entry as O-Email / E-Code.
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sendEmailCode, verifyEmailCode } from '@/lib/auth';
import { deleteAccount } from '@/lib/content';
import { useSession } from '@/lib/session';
import { normaliseOtp, OTP_LENGTH } from '@/lib/validation';
import { Button, Header, Lead, Title } from '@/ui/components';
import { useSignOutWarning } from '@/ui/SignOutWarning';
import { KEYBOARD_BEHAVIOR } from '@/ui/keyboard';
import { colors, fontFamily, layout, type } from '@/ui/theme';

const BOX_W = 46;

export default function ConfirmEmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useSession();
  const signOutWarning = useSignOutWarning();
  const email = state?.email ?? '';
  const [code, setCode] = useState('');
  const [codeFailed, setCodeFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const codeInput = useRef<TextInput>(null);

  useEffect(() => {
    if (!email) return;
    sendEmailCode(email)
      .then(() => setSent(true))
      .catch((e) => console.error('send code failed', e));
  }, [email]);

  const verify = async () => {
    if (busy || code.length !== OTP_LENGTH) return;
    setBusy(true);
    try {
      const ok = await verifyEmailCode(email, code);
      if (!ok) {
        setCodeFailed(true);
        return;
      }
      // P9: asked once the code is confirmed and before anything is deleted, so Cancel really cancels.
      if (!(await signOutWarning.confirm())) return;
      await deleteAccount();
      await signOutWarning.signOut();
    } catch (e) {
      console.error('delete account failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={KEYBOARD_BEHAVIOR}>
      <Header />
      <View style={s.body}>
        <Title>Confirm it&apos;s you</Title>
        <Lead>We sent a code to {email}.</Lead>
      </View>
      <View style={s.codeBlock}>
        <Text style={s.codeTitle}>Enter the 6-digit code</Text>
        <Text style={s.codeSent}>{sent ? `Sent to ${email}` : 'Sending…'}</Text>
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
          {/* No maxLength: it would cut a pasted "123 456" to "12345"; normaliseOtp keeps six digits. */}
          <TextInput
            ref={codeInput}
            style={s.codeInput}
            value={code}
            onChangeText={(v) => {
              setCodeFailed(false);
              setCode(normaliseOtp(v));
            }}
            autoFocus
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            caretHidden
            onSubmitEditing={() => void verify()}
            accessibilityLabel="6-digit code"
          />
        </View>
        {codeFailed ? (
          <>
            <Text style={s.errorText}>That code didn&apos;t work. It may have expired, so use the newest email.</Text>
            <Pressable accessibilityRole="button" onPress={() => void sendEmailCode(email)} disabled={busy} hitSlop={8}>
              <Text style={s.resendLink}>Send a new code</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, layout.bottomButton) }]}>
        <Pressable accessibilityRole="button" onPress={() => void verify()} disabled={busy || code.length !== OTP_LENGTH} style={({ pressed }) => [s.deleteButton, (pressed || busy || code.length !== OTP_LENGTH) && { opacity: 0.5 }]}>
          <Text style={s.deleteText}>Delete account</Text>
        </Pressable>
        <Button title="Cancel" variant="text" onPress={() => router.back()} style={{ marginTop: 6 }} textStyle={{ fontSize: 16, fontWeight: '500' }} />
      </View>
      {signOutWarning.sheet}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: layout.pageInset },
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
  errorText: { marginTop: 12, ...type.caption13, lineHeight: 18, color: colors.danger, fontFamily },
  resendLink: { marginTop: 8, ...type.caption13, fontWeight: '600', color: colors.text, fontFamily },
  // In the flow, at the bottom (as on the sign-in code screen), so the keyboard avoidance moves it above the number pad.
  footer: { marginTop: 'auto', paddingHorizontal: layout.controlInset },
  deleteButton: { height: 52, borderRadius: 26, backgroundColor: colors.dangerBorder, alignItems: 'center', justifyContent: 'center' },
  deleteText: { ...type.button16, letterSpacing: -0.2, color: colors.white, fontFamily },
});
