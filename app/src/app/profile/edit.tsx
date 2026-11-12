// Board LV-EditProfile: Cancel / Save; photo, name, username, bio with counter.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl, ServerError } from '@/lib/api';
import { getProfile, updateProfile } from '@/lib/content';
import { useSession } from '@/lib/session';
import { NAME_MAX, nameOk, normaliseName, normaliseUsername, usernameFormatOk } from '@/lib/validation';
import { pickPhoto, prepareAvatar, uploadAvatar } from '@/lib/photo';
import { Avatar, Group, Separator } from '@/ui/components';
import { KEYBOARD_BEHAVIOR } from '@/ui/keyboard';
import { colors, fontFamily, type } from '@/ui/theme';

const BIO_MAX = 150;

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, refresh } = useSession();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);

  useEffect(() => {
    void getProfile({}).then((p) => {
      if (!p) return;
      setName(p.name);
      setUsername(p.username);
      setBio(p.bio ?? '');
      setPhoto(avatarUrl(p.photo_path));
      setLoaded(true);
    });
  }, []);

  const changePhoto = async () => {
    try {
      const picked = await pickPhoto('library');
      if (!picked || !session) return;
      setBusy(true);
      const prepared = await prepareAvatar(picked);
      await uploadAvatar(session.user.id, prepared);
      setPhoto(picked.uri);
      await refresh();
    } catch (e) {
      console.error('change photo failed', e);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (busy || !nameOk(name) || !usernameFormatOk(username)) return;
    setBusy(true);
    try {
      await updateProfile(name.trim(), username, bio.trim() || null);
      await refresh();
      router.back();
    } catch (e) {
      if (e instanceof ServerError && e.code === 'username_taken') setUsernameTaken(true);
      else console.error('update_profile failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={KEYBOARD_BEHAVIOR}>
      <View style={[s.header, { marginTop: Platform.OS === 'ios' ? 14 : insets.top + 7 }]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
          <Text style={s.headerAction}>Cancel</Text>
        </Pressable>
        <Text style={s.headerTitle}>Edit profile</Text>
        <Pressable accessibilityRole="button" onPress={() => void save()} disabled={busy || !loaded} hitSlop={8}>
          <Text style={[s.headerAction, { fontWeight: '600' }, (busy || !loaded) && { opacity: 0.4 }]}>Save</Text>
        </Pressable>
      </View>
      <View style={s.photoBlock}>
        <Avatar uri={photo} size={96} />
        <Pressable accessibilityRole="button" onPress={() => void changePhoto()} disabled={busy} hitSlop={8}>
          <Text style={s.changePhoto}>Change photo</Text>
        </Pressable>
      </View>
      <Group style={{ marginTop: 56 }}>
        <View style={s.row}>
          <Text style={s.label}>Name</Text>
          <TextInput style={s.input} value={name} onChangeText={(v) => setName(normaliseName(v))} maxLength={NAME_MAX} autoCapitalize="words" accessibilityLabel="Name" />
        </View>
        <Separator />
        <View style={s.row}>
          <Text style={s.label}>Username</Text>
          <TextInput style={s.input} value={username} onChangeText={(v) => { setUsername(normaliseUsername(v)); setUsernameTaken(false); }} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Username" />
          {usernameTaken ? <Text style={s.taken}>Taken</Text> : null}
        </View>
        <Separator />
        <View style={[s.row, { alignItems: 'flex-start', paddingVertical: 14, height: undefined, minHeight: 52 }]}>
          <Text style={s.label}>Bio</Text>
          <TextInput style={[s.input, { height: undefined, paddingTop: 0 }]} value={bio} onChangeText={(v) => setBio(v.slice(0, BIO_MAX))} multiline maxLength={BIO_MAX} accessibilityLabel="Bio" />
        </View>
      </Group>
      <Text style={s.counter}>Bio {bio.length} / {BIO_MAX}</Text>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { marginHorizontal: 16, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerAction: { fontSize: 17, lineHeight: 22, color: colors.text, fontFamily },
  headerTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  photoBlock: { marginTop: 20, alignItems: 'center' },
  changePhoto: { marginTop: 10, ...type.medium15, color: '#007AFF', fontFamily },
  row: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  label: { width: 86, ...type.label15, color: colors.textSecondary, fontFamily },
  input: { flex: 1, height: 52, ...type.body16, color: colors.text, fontFamily, paddingVertical: 0 },
  taken: { ...type.caption13, color: colors.danger, fontFamily },
  counter: { marginTop: 7, marginRight: 32, textAlign: 'right', ...type.caption13, color: colors.textTertiary, fontFamily, fontVariant: ['tabular-nums'] },
});
