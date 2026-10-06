// Board O-Welcome (iOS: Apple, Google, email) and O-Welcome-Android (Google, Apple, email).
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SignInCancelled, SignInNotConfigured, signInWithApple, signInWithGoogle } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { Button, Glass } from '@/ui/components';
import { PromptBubbleIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

// The board's collage. People and photos in the boards are placeholders (design/BOARDS.md).
const COLUMNS: { offset: number; images: number[] }[] = [
  { offset: 0, images: [require('../../../assets/placeholders/maya_t1.jpg'), require('../../../assets/placeholders/putu_t.jpg'), require('../../../assets/placeholders/theo_t.jpg')] },
  { offset: 64, images: [require('../../../assets/placeholders/adam_t.jpg'), require('../../../assets/placeholders/hatwoman_t.jpg'), require('../../../assets/placeholders/maya_t2.jpg')] },
  { offset: 22, images: [require('../../../assets/placeholders/sofia_t.jpg'), require('../../../assets/placeholders/wayan_t.jpg'), require('../../../assets/placeholders/maya_t3.jpg')] },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

  const run = async (method: 'apple' | 'google') => {
    if (busy) return;
    setBusy(method);
    try {
      if (method === 'apple') await signInWithApple();
      else await signInWithGoogle();
      // A session now exists; the root layout re-resolves and the index lands on the next step.
      router.replace('/(onboarding)');
    } catch (e) {
      if (e instanceof SignInCancelled) return;
      if (e instanceof SignInNotConfigured) {
        console.error(`${method} sign-in is not configured for this build`);
        return;
      }
      console.error(`${method} sign-in failed`, e);
    } finally {
      setBusy(null);
    }
  };

  const onEmail = () => router.push('/(onboarding)/email');
  // If a signed-in person came back here (Done on the waitlist), Continue resumes their state.
  const resume = session ? () => router.replace('/(onboarding)') : null;

  const apple = <Button key="apple" title="Continue with Apple" variant={Platform.OS === 'ios' ? 'white' : 'glass'} onPress={resume ?? (() => run('apple'))} disabled={!!busy} />;
  const google = <Button key="google" title="Continue with Google" variant={Platform.OS === 'ios' ? 'glass' : 'white'} onPress={resume ?? (() => run('google'))} disabled={!!busy} />;

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <View style={s.collage} pointerEvents="none">
        {COLUMNS.map((col, i) => (
          <View key={i} style={[s.column, { marginTop: col.offset }]}>
            {col.images.map((src, j) => (
              <Image key={j} source={src} style={s.thumb} />
            ))}
          </View>
        ))}
      </View>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.25)', '#000000']}
        locations={[0, 0.3, 0.62]}
        style={StyleSheet.absoluteFill}
      />

      <Glass style={s.promptCard}>
        <View style={s.promptRow}>
          <View style={{ marginTop: 2 }}>
            <PromptBubbleIcon />
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={s.promptText}>What&apos;s something everybody loves that you hate?</Text>
            <Text style={s.promptCount}>19 responses</Text>
          </View>
        </View>
      </Glass>

      <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={s.textBlock}>
          <Text style={s.brand}>Shortcut</Text>
          <Text style={s.headline}>One prompt.{'\n'}Everyone&apos;s take,{'\n'}on video.</Text>
          <Text style={s.sub}>Watch people respond, then add yours.</Text>
        </View>
        <View style={s.buttons}>
          {Platform.OS === 'ios' ? [apple, google] : [google, apple]}
          <Button title="Continue with email" variant="textOnDark" onPress={resume ?? onEmail} disabled={!!busy} style={{ height: 34 }} />
        </View>
        <Text style={s.footer}>By continuing you agree to the Terms and Community Guidelines.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  collage: { position: 'absolute', left: -38, top: -40, flexDirection: 'row', gap: 6 },
  column: { width: 124, gap: 6 },
  thumb: { width: 124, height: 166, borderRadius: 12 },
  promptCard: { position: 'absolute', left: 22, top: 236, maxWidth: 250, paddingTop: 9, paddingBottom: 10, paddingLeft: 12, paddingRight: 14 },
  promptRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  promptText: { ...type.semi14, lineHeight: 18, color: colors.white, fontFamily },
  promptCount: { ...type.caption12, lineHeight: 15, marginTop: 2, color: colors.white72, fontFamily },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  textBlock: { paddingHorizontal: 24 },
  brand: { ...type.brand17, color: colors.white, fontFamily },
  headline: { ...type.display34, marginTop: 10, color: colors.white, fontFamily },
  sub: { ...type.body16, lineHeight: 22, marginTop: 10, color: colors.white78, fontFamily },
  buttons: { paddingHorizontal: 20, marginTop: 30, gap: 10 },
  footer: { ...type.tiny11, textAlign: 'center', color: colors.white50, marginTop: 6, marginHorizontal: 32, fontFamily },
});
