// Board E-Linked: the email already signs in another way (Apple, Google or email code).
// Same screen whichever method was tried; the existing method's name fills the sentence.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SignInCancelled, SignInMethodConflict, SignInNotConfigured, signInWithApple, signInWithGoogle } from '@/lib/auth';
import { Button, Header, IconCircle, Lead, Title } from '@/ui/components';
import { PersonIcon } from '@/ui/Icons';
import { providerLabel, type SignInProvider } from '@/lib/signinConflict';
import { colors, layout } from '@/ui/theme';

export default function LinkedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ provider?: string; email?: string }>();
  const provider: SignInProvider = params.provider === 'google' ? 'google' : params.provider === 'email' ? 'email' : 'apple';
  const providerName = providerLabel(provider);
  const email = params.email ?? '';
  const [busy, setBusy] = useState(false);

  const continueWithProvider = async () => {
    if (busy) return;
    if (provider === 'email') {
      router.replace('/(onboarding)/email');
      return;
    }
    setBusy(true);
    try {
      if (provider === 'apple') await signInWithApple();
      else await signInWithGoogle();
      router.replace('/(onboarding)');
    } catch (e) {
      if (e instanceof SignInCancelled) return;
      if (e instanceof SignInMethodConflict) {
        router.push({ pathname: '/(onboarding)/linked', params: { provider: e.existingProvider, email: e.email ?? '' } });
        return;
      }
      if (e instanceof SignInNotConfigured) {
        console.error(`${provider} sign-in is not configured for this build`);
        return;
      }
      console.error(`${provider} sign-in failed`, e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <Header />
      <View style={s.body}>
        <IconCircle>
          <PersonIcon />
        </IconCircle>
        <Title style={{ marginTop: 20 }}>You already have an account</Title>
        <Lead>
          <Text style={{ color: colors.text }}>{email}</Text> signs in with {providerName}. Continue with {providerName} to keep your responses and followers.
        </Lead>
      </View>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, layout.bottomButton) }]}>
        <Button title={`Continue with ${providerName}`} onPress={() => void continueWithProvider()} disabled={busy} />
        {provider !== 'email' ? (
          <Button title="Use a different email" variant="text" onPress={() => router.back()} style={{ marginTop: 8 }} />
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: layout.pageInset, marginTop: 34 },
  footer: { marginTop: 'auto', paddingHorizontal: layout.controlInset },
});
