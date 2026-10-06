// Board W-Waitlist: on the waitlist, no queue number (SPEC.md Section 14).
import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';
import { Button, Header, IconCircle, Lead, Title } from '@/ui/components';
import { CheckIcon } from '@/ui/Icons';
import { colors, fontFamily, layout, type } from '@/ui/theme';

const FACES = [require('../../../assets/placeholders/putu_a.jpg'), require('../../../assets/placeholders/sofia_a.jpg')];

export default function WaitlistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, signOut } = useSession();

  const leave = async () => {
    await signOut();
    router.replace('/(onboarding)/welcome');
  };

  return (
    <View style={s.root}>
      <Header onBack={() => router.replace('/(onboarding)/invite')} />
      <View style={s.body}>
        <IconCircle>
          <CheckIcon size={26} color={colors.text} strokeWidth={2.4} />
        </IconCircle>
        <Title style={{ marginTop: 20 }}>You&apos;re on the waitlist.</Title>
        <Lead>
          We&apos;ll email <Text style={{ color: colors.text }}>{state?.email ?? ''}</Text> when there&apos;s room.
        </Lead>
      </View>

      <View style={s.card}>
        <View style={s.cardFaces}>
          {FACES.map((src, i) => (
            <Image key={i} source={src} style={[s.cardFace, i > 0 && { marginLeft: -10 }]} />
          ))}
        </View>
        <Text style={s.cardText}>Know someone on Shortcut? An invite from them gets you in straight away.</Text>
      </View>

      <Button title="I have an invite code" variant="text" onPress={() => router.replace('/(onboarding)/invite')} style={s.codeLink} textStyle={{ fontWeight: '600' }} />

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, layout.bottomButton) }]}>
        <Text style={s.signedIn}>
          Signed in as {state?.email ?? ''} ·{' '}
          <Text style={s.signOut} onPress={() => void leave()} accessibilityRole="button">
            Sign out
          </Text>
        </Text>
        <Button title="Done" onPress={() => router.replace('/(onboarding)/welcome')} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: layout.pageInset, marginTop: 34 },
  card: { marginHorizontal: layout.groupInset, marginTop: 40, borderRadius: 16, backgroundColor: colors.fill, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardFaces: { flexDirection: 'row' },
  cardFace: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.fill },
  cardText: { flex: 1, ...type.body14, color: colors.text, fontFamily },
  codeLink: { marginTop: 20, marginHorizontal: layout.controlInset },
  footer: { marginTop: 'auto', paddingHorizontal: layout.controlInset },
  signedIn: { textAlign: 'center', ...type.caption12, color: colors.textTertiary, marginBottom: 20, fontFamily },
  signOut: { color: colors.text, fontWeight: '500' },
});
