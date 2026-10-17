// Board A-Age: 18+ confirmation, right after sign-in. "No" signs out (SPEC.md Section 13).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track } from '@/lib/analytics';
import { confirmAge } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAdvance } from '@/lib/useStepNavigation';
import { Button, Header, IconCircle, Lead, Title } from '@/ui/components';
import { PersonIcon } from '@/ui/Icons';
import { colors, fontFamily, layout, type } from '@/ui/theme';

export default function AgeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut } = useSession();
  const advance = useAdvance();
  const [busy, setBusy] = useState(false);

  const yes = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await confirmAge();
      await advance();
    } catch (e) {
      console.error('confirm_age failed', e);
    } finally {
      setBusy(false);
    }
  };

  // No, and the back arrow, return to Welcome signed out: no profile is created.
  const leave = async () => {
    if (busy) return;
    setBusy(true);
    track('age_declined');
    await signOut();
    router.replace('/(onboarding)/welcome');
  };

  return (
    <View style={s.root}>
      <Header onBack={() => void leave()} />
      <View style={s.body}>
        <IconCircle>
          <PersonIcon />
        </IconCircle>
        <Title style={{ marginTop: 20 }}>Are you 18 or older?</Title>
        <Lead>The Conga beta is for adults only, because people here talk with strangers on camera.</Lead>
      </View>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, layout.bottomButton) }]}>
        <Button title="Yes, I'm 18 or older" onPress={() => void yes()} disabled={busy} />
        <Button title="No" variant="fill" onPress={() => void leave()} disabled={busy} style={{ marginTop: 10 }} />
        <Text style={s.note}>If you&apos;re under 18, you can&apos;t join the beta. Accounts found to belong to someone under 18 are removed.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: layout.pageInset, marginTop: 34 },
  footer: { marginTop: 'auto', paddingHorizontal: layout.controlInset },
  note: { ...type.caption12, color: colors.textTertiary, textAlign: 'center', marginTop: 14, fontFamily },
});
