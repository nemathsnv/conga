// Board O-Photo: optional photo. "Start watching" works without one (SPEC.md Section 13).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pickPhoto, prepareAvatar, uploadAvatar, type PickedPhoto } from '@/lib/photo';
import { useSession } from '@/lib/session';
import { Avatar, Button, Group, Header, Lead, Separator, StepBar, Title } from '@/ui/components';
import { CameraIcon, LibraryIcon } from '@/ui/Icons';
import { colors, fontFamily, layout, type } from '@/ui/theme';

export default function PhotoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, state, refresh, setPhotoStepPending } = useSession();
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (source: 'camera' | 'library') => {
    if (busy) return;
    try {
      const picked = await pickPhoto(source);
      if (picked) setPhoto(picked);
    } catch (e) {
      console.error('pick photo failed', e);
    }
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (photo && session) {
        const prepared = await prepareAvatar(photo);
        await uploadAvatar(session.user.id, prepared);
        await refresh();
      }
      // Clearing the pending flag lets the root layout switch to the tabs (Home).
      setPhotoStepPending(false);
    } catch (e) {
      console.error('photo upload failed', e);
    } finally {
      setBusy(false);
    }
  };

  const name = state?.profile?.name ?? '';
  const username = state?.profile?.username ?? '';

  return (
    <View style={s.root}>
      <Header onBack={() => (router.canGoBack() ? router.back() : router.replace('/(onboarding)/profile'))}>
        <StepBar step={2} total={2} />
      </Header>
      <View style={s.body}>
        <Title>Add a photo</Title>
        <Lead>Optional. It shows next to your name, so people recognise you between videos.</Lead>
      </View>

      <View style={s.preview}>
        <Avatar uri={photo?.uri ?? null} size={132} />
        <Text style={s.previewName}>{name}</Text>
        <Text style={s.previewUsername}>@{username}</Text>
      </View>

      <Group style={{ marginTop: 50 }}>
        <Pressable accessibilityRole="button" onPress={() => void choose('camera')} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
          <CameraIcon />
          <Text style={s.rowText}>Take a photo</Text>
        </Pressable>
        <Separator inset={48} />
        <Pressable accessibilityRole="button" onPress={() => void choose('library')} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
          <LibraryIcon />
          <Text style={s.rowText}>Choose from library</Text>
        </Pressable>
      </Group>

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, layout.bottomButton) }]}>
        <Button title="Start watching" onPress={() => void start()} disabled={busy} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: layout.pageInset, marginTop: 18 },
  preview: { alignItems: 'center', marginTop: 40 },
  previewName: { marginTop: 14, ...type.semi15, color: colors.text, fontFamily },
  previewUsername: { marginTop: 2, ...type.body14, color: colors.textSecondary, fontFamily },
  row: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 },
  rowText: { ...type.body16, color: colors.text, fontFamily },
  footer: { marginTop: 'auto', paddingHorizontal: layout.controlInset },
});
