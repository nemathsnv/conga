// Boards O-Profile (name and username, live availability) and E-Username (taken, with suggestions).
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createProfile, ServerError, usernameStatus, usernameSuggestions, type UsernameStatus } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAdvance } from '@/lib/useStepNavigation';
import { NAME_MAX, nameOk, normaliseName, normaliseUsername, usernameFormatOk } from '@/lib/validation';
import { Button, Chip, Group, Header, Lead, Separator, StepBar, Title } from '@/ui/components';
import { CheckIcon } from '@/ui/Icons';
import { KEYBOARD_BEHAVIOR } from '@/ui/keyboard';
import { colors, fontFamily, layout, type } from '@/ui/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh, setPhotoStepPending } = useSession();
  const advance = useAdvance();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<UsernameStatus | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const latest = useRef('');
  const usernameInput = useRef<TextInput>(null);

  // Live availability check (O-Profile "Available", E-Username "Taken").
  const onUsernameChange = (value: string) => {
    const next = normaliseUsername(value);
    setUsername(next);
    setSuggestions([]);
    setStatus(null);
  };

  useEffect(() => {
    latest.current = username;
    if (!usernameFormatOk(username)) return;
    const t = setTimeout(() => {
      void usernameStatus(username)
        .then(async (result) => {
          if (latest.current !== username) return;
          setStatus(result);
          if (result === 'taken') {
            const list = await usernameSuggestions(name, username);
            if (latest.current === username) setSuggestions(list);
          }
        })
        .catch((e) => console.error('username_status failed', e));
    }, 250);
    return () => clearTimeout(t);
  }, [username, name]);

  const taken = status === 'taken';
  const canContinue = nameOk(name) && usernameFormatOk(username) && status === 'available';

  const submit = async () => {
    if (!canContinue || busy) return;
    setBusy(true);
    try {
      await createProfile(name.trim(), username);
      // The photo step shows the new name and username, so load the profile first.
      setPhotoStepPending(true);
      await refresh();
      router.replace('/(onboarding)/photo');
    } catch (e) {
      if (e instanceof ServerError && e.code === 'username_taken') {
        setStatus('taken');
        setSuggestions(await usernameSuggestions(name, username).catch(() => []));
      } else if (e instanceof ServerError && (e.code === 'age_not_confirmed' || e.code === 'beta_access_required' || e.code === 'profile_exists')) {
        await advance();
      } else {
        console.error('create_profile failed', e);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={KEYBOARD_BEHAVIOR}>
      <Header>
        <StepBar step={1} total={2} />
      </Header>
      <View style={s.body}>
        <Title>What should people call you?</Title>
        <Lead>Your name shows on your responses. Your username is how people find you.</Lead>
      </View>

      <Group style={{ marginTop: 40 }}>
        <View style={s.row}>
          <Text style={s.rowLabel}>Name</Text>
          <TextInput
            style={s.rowInput}
            value={name}
            onChangeText={(v) => setName(normaliseName(v))}
            maxLength={NAME_MAX}
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => usernameInput.current?.focus()}
            accessibilityLabel="Name"
          />
        </View>
        <Separator />
        <View style={s.row}>
          <Text style={s.rowLabel}>Username</Text>
          <TextInput
            ref={usernameInput}
            style={s.rowInput}
            value={username}
            onChangeText={onUsernameChange}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            accessibilityLabel="Username"
          />
          {status === 'available' ? (
            <View style={s.statusRow}>
              <CheckIcon />
              <Text style={[s.statusText, { color: colors.success }]}>Available</Text>
            </View>
          ) : taken ? (
            <Text style={[s.statusText, { color: colors.danger }]}>Taken</Text>
          ) : null}
        </View>
      </Group>

      {taken ? (
        <>
          <Text style={[s.hint, { color: colors.danger }]}>@{username} is taken. Try one of these:</Text>
          {suggestions.length > 0 ? (
            <View style={s.chips}>
              {suggestions.map((sug) => (
                <Chip key={sug} title={sug} onPress={() => onUsernameChange(sug)} />
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <Text style={s.hint}>You can change both later.</Text>
      )}

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, layout.bottomButton) }]}>
        <Button title="Continue" dimmed={!canContinue} disabled={busy} onPress={() => void submit()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: layout.pageInset, marginTop: 18 },
  row: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  rowLabel: { width: 86, ...type.label15, color: colors.textSecondary, fontFamily },
  rowInput: { flex: 1, height: 52, ...type.body16, color: colors.text, fontFamily, paddingVertical: 0 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { ...type.caption13, fontFamily },
  hint: { marginHorizontal: 32, marginTop: 10, ...type.caption13, color: colors.textTertiary, fontFamily },
  chips: { marginHorizontal: layout.pageInset, marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { marginTop: 'auto', paddingHorizontal: layout.controlInset },
});
