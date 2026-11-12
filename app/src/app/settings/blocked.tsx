// Board LV-Blocked: Settings → Blocked accounts, grey Unblock pill. SPEC.md Section 17.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/api';
import { blockedList, unblockUser, type ProfileCard } from '@/lib/content';
import { Avatar } from '@/ui/components';
import { Spinner } from '@/ui/HomeStates';
import { ChevronLeft } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

export default function BlockedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [people, setPeople] = useState<ProfileCard[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      blockedList()
        .then(setPeople)
        .catch((e) => console.error('blocked_list failed', e));
    }, []),
  );

  const unblock = async (p: ProfileCard) => {
    setPeople((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur));
    try {
      await unblockUser(p.id);
    } catch (e) {
      console.error('unblock failed', e);
      setPeople((cur) => (cur ? [...cur, p] : cur));
    }
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { top: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.back}>
          <ChevronLeft />
        </Pressable>
        <Text style={s.headerTitle}>Blocked accounts</Text>
      </View>
      {people === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner light={false} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 61, paddingBottom: 40 }}>
          {people.length ? (
            <View style={s.group}>
              {people.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <View style={s.sep} /> : null}
                  <View style={s.row}>
                    <Avatar uri={avatarUrl(p.photo_path)} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.name}>{p.name}</Text>
                      <Text style={s.username}>@{p.username}</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Unblock ${p.name}`} onPress={() => void unblock(p)} style={({ pressed }) => [s.pill, pressed && { opacity: 0.7 }]}>
                      <Text style={s.pillText}>Unblock</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={s.foot}>They can&apos;t see your profile or videos, and you won&apos;t see theirs. They aren&apos;t told when you block or unblock them.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { position: 'absolute', left: 6, right: 6, height: 44, flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { position: 'absolute', left: 54, right: 54, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  group: { marginHorizontal: 16, borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { minHeight: 60, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 68, backgroundColor: colors.separator },
  name: { ...type.button16, color: colors.text, fontFamily },
  username: { marginTop: 1, ...type.caption13, color: colors.textSecondary, fontFamily },
  pill: { height: 30, paddingHorizontal: 13, borderRadius: 15, backgroundColor: '#E5E5EA', justifyContent: 'center' },
  pillText: { ...type.semi14, color: colors.text, fontFamily },
  foot: { paddingTop: 7, paddingHorizontal: 32, ...type.caption13, lineHeight: 18, color: colors.textTertiary, fontFamily },
});
