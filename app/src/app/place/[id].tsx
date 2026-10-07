// Board P-Place (SPEC.md Section 11): image, name, region, Following or Follow, Share, the
// place's open prompts, and the note that global prompts live in Home.
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/api';
import { followPlace, placePage, unfollowPlace, type PlacePage } from '@/lib/content';
import { responsesLabel, timeAgo } from '@/lib/format';
import { promptLink } from '@/lib/links';
import { ActionSheet } from '@/ui/ActionSheet';
import { Avatar } from '@/ui/components';
import { Spinner } from '@/ui/HomeStates';
import { ChevronLeft, PlacePinIcon, ShareIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

export default function PlaceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<PlacePage | null>(null);
  const [unfollowAsk, setUnfollowAsk] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    placePage(id)
      .then(setData)
      .catch((e) => console.error('place_page failed', e));
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggle = async () => {
    if (!data) return;
    if (data.place.following) {
      setUnfollowAsk(true);
      return;
    }
    try {
      await followPlace(data.place.id);
      load();
    } catch (e) {
      console.error('follow_place failed', e);
    }
  };
  const unfollow = async () => {
    if (!data) return;
    setUnfollowAsk(false);
    try {
      await unfollowPlace(data.place.id);
      load();
    } catch (e) {
      console.error('unfollow_place failed', e);
    }
  };
  // Sharing a place shares its newest prompt's link (places have no web page in v1).
  const share = async () => {
    if (!data) return;
    const first = data.prompts[0];
    if (!first) return;
    await Share.share({ url: promptLink(first.id), message: promptLink(first.id) }).catch(() => undefined);
  };

  const place = data?.place ?? null;
  return (
    <View style={s.root}>
      <View style={s.hero}>
        {place?.image_path ? <Image source={{ uri: place.image_path }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
        <View style={[s.header, { top: insets.top + 3 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.back}>
            <ChevronLeft color={colors.white} />
          </Pressable>
        </View>
        {place ? (
          <View style={s.heroText}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <PlacePinIcon size={13} color="rgba(255,255,255,0.85)" />
              <Text style={s.region}>{place.region}</Text>
            </View>
            <Text style={s.name}>{place.name}</Text>
          </View>
        ) : null}
      </View>
      {data === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner light={false} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={s.actions}>
            {place?.open ? (
              <Pressable accessibilityRole="button" onPress={() => void toggle()} style={({ pressed }) => [s.followButton, !place.following && { backgroundColor: colors.text }, pressed && { opacity: 0.8 }]}>
                <Text style={[s.followText, !place.following && { color: colors.white }]}>{place.following ? 'Following' : 'Follow'}</Text>
              </Pressable>
            ) : (
              <View style={s.followButton}>
                <Text style={s.followText}>Not open yet</Text>
              </View>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Share place" onPress={() => void share()} style={({ pressed }) => [s.shareButton, pressed && { opacity: 0.7 }]}>
              <ShareIcon size={20} color={colors.text} />
            </Pressable>
          </View>
          <Text style={s.h}>Prompts in {place?.name}</Text>
          {data.prompts.map((p, i) => (
            <View key={p.id}>
              {i > 0 ? <View style={s.sep} /> : null}
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/player/[promptId]', params: { promptId: p.id } })} style={({ pressed }) => [s.promptRow, pressed && { opacity: 0.6 }]}>
                <Text style={s.promptText}>{p.text}</Text>
                <View style={s.promptSub}>
                  {p.faces.length ? (
                    <View style={{ flexDirection: 'row' }}>
                      {p.faces.map((f, j) => (
                        <Avatar key={f.id} uri={avatarUrl(f.photo_path)} size={22} borderWidth={2} borderColor={colors.white} style={j > 0 ? { marginLeft: -8 } : undefined} />
                      ))}
                    </View>
                  ) : (
                    <View style={s.emptyFace} />
                  )}
                  <Text style={s.sub}>
                    {p.response_count === 0 ? 'No responses yet' : responsesLabel(p.response_count)} · {timeAgo(p.published_at)}
                  </Text>
                </View>
              </Pressable>
            </View>
          ))}
          {data.prompts.length ? <View style={s.sep} /> : null}
          <Text style={s.note}>Global prompts like &ldquo;Be honest about the place you live.&rdquo; are in your Home feed, not here.</Text>
        </ScrollView>
      )}

      <Modal visible={unfollowAsk} transparent animationType="fade" onRequestClose={() => setUnfollowAsk(false)}>
        <ActionSheet
          title={`Unfollow ${place?.name ?? ''}?`}
          lines={[`${place?.name ?? ''} prompts will stop appearing in your feed. Global prompts and people you follow stay.`]}
          actions={[{ label: 'Unfollow', destructive: true, onPress: () => void unfollow() }]}
          onCancel={() => setUnfollowAsk(false)}
        />
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  hero: { height: 250, backgroundColor: '#3A3A3C' },
  header: { position: 'absolute', left: 6, right: 6, height: 44, flexDirection: 'row', alignItems: 'center' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heroText: { position: 'absolute', left: 16, right: 16, bottom: 30 },
  region: { ...type.caption13, fontWeight: '500', color: 'rgba(255,255,255,0.85)', fontFamily },
  name: { marginTop: 2, ...type.display34, letterSpacing: -0.8, color: colors.white, fontFamily },
  actions: { marginHorizontal: 16, marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  followButton: { flex: 1, height: 40, borderRadius: 20, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  followText: { ...type.semi15, color: colors.text, fontFamily },
  shareButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  h: { marginTop: 24, paddingHorizontal: 16, paddingBottom: 4, fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4, color: colors.text, fontFamily },
  promptRow: { paddingHorizontal: 16, paddingVertical: 14 },
  promptText: { fontSize: 17, lineHeight: 21, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  promptSub: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyFace: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C7C7CC' },
  sub: { ...type.caption13, color: colors.textSecondary, fontFamily },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: colors.separator },
  note: { paddingHorizontal: 16, paddingVertical: 12, ...type.caption13, lineHeight: 18, color: colors.textTertiary, fontFamily },
});
