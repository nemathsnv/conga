// Board LV-Followers: Followers / Following tabs; Follow back / Following pills.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/api';
import { followList, followUser, unfollowUser, type FollowRow } from '@/lib/content';
import { Avatar, Separator } from '@/ui/components';
import { Spinner } from '@/ui/HomeStates';
import { ChevronLeft } from '@/ui/Icons';
import { useGoBack } from '@/ui/navigation';
import { colors, fontFamily, type } from '@/ui/theme';

type Kind = 'followers' | 'following';

export default function FollowsScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; kind?: string; username?: string }>();
  const [kind, setKind] = useState<Kind>(params.kind === 'following' ? 'following' : 'followers');
  const [rows, setRows] = useState<Record<Kind, FollowRow[] | null>>({ followers: null, following: null });

  useEffect(() => {
    if (!params.id) return;
    (['followers', 'following'] as Kind[]).forEach((k) => {
      void followList(params.id, k).then((list) => setRows((r) => ({ ...r, [k]: list }))).catch((e) => console.error('follow_list failed', e));
    });
  }, [params.id]);

  const toggle = async (row: FollowRow) => {
    const next = !row.is_following;
    const patch = (list: FollowRow[] | null) => list?.map((x) => (x.id === row.id ? { ...x, is_following: next } : x)) ?? null;
    setRows((r) => ({ followers: patch(r.followers), following: patch(r.following) }));
    try {
      if (next) await followUser(row.id, 'follows');
      else await unfollowUser(row.id, 'follows');
    } catch {
      const undo = (list: FollowRow[] | null) => list?.map((x) => (x.id === row.id ? { ...x, is_following: !next } : x)) ?? null;
      setRows((r) => ({ followers: undo(r.followers), following: undo(r.following) }));
    }
  };

  const list = rows[kind];
  const counts = { followers: rows.followers?.length, following: rows.following?.length };

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <View style={[s.header, { marginTop: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => goBack()} style={s.headerButton}>
          <ChevronLeft />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{params.username ?? ''}</Text>
        <View style={s.headerButton} />
      </View>
      <View style={s.tabs}>
        {(['followers', 'following'] as Kind[]).map((k) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: kind === k }} onPress={() => setKind(k)} style={s.tab}>
            <Text style={[s.tabText, kind !== k && s.tabOff]}>
              {k === 'followers' ? 'Followers' : 'Following'}
              {counts[k] !== undefined ? <Text style={s.tabCount}> {counts[k]}</Text> : null}
            </Text>
            {kind === k ? <View style={s.tabLine} /> : null}
          </Pressable>
        ))}
      </View>
      <Separator inset={0} />
      {list === null ? (
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <Spinner light={false} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <View style={s.row}>
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/profile/[id]', params: { id: item.id } })} style={s.rowMain}>
                <Avatar uri={avatarUrl(item.photo_path)} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rowName}>{item.name}</Text>
                  <Text style={s.rowSub}>@{item.username}</Text>
                </View>
              </Pressable>
              {item.is_self ? null : (
                <Pressable accessibilityRole="button" onPress={() => void toggle(item)} style={({ pressed }) => [s.pill, item.is_following ? s.pillGrey : s.pillBlack, pressed && { opacity: 0.7 }]}>
                  <Text style={[s.pillText, item.is_following && { color: colors.text }]}>{item.is_following ? 'Following' : item.follows_you ? 'Follow back' : 'Follow'}</Text>
                </Pressable>
              )}
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { height: 44, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  tabs: { marginTop: 4, flexDirection: 'row' },
  tab: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabText: { ...type.semi15, color: colors.text, fontFamily },
  tabOff: { fontWeight: '500', color: colors.textTertiary },
  tabCount: { fontWeight: '400', color: colors.textTertiary },
  tabLine: { position: 'absolute', left: '50%', bottom: 0, width: 32, marginLeft: -16, height: 2, borderRadius: 1, backgroundColor: colors.text },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowName: { ...type.body16, fontWeight: '600', color: colors.text, fontFamily },
  rowSub: { ...type.caption13, marginTop: 1, color: colors.textSecondary, fontFamily },
  pill: { height: 30, paddingHorizontal: 13, borderRadius: 15, justifyContent: 'center' },
  pillBlack: { backgroundColor: colors.text },
  pillGrey: { backgroundColor: colors.fillStrong },
  pillText: { ...type.semi14, color: colors.white, fontFamily },
});
