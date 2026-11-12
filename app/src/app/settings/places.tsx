// Boards P-Places (Settings → Places) and P-Unfollow (SPEC.md Section 11): search, the places
// you follow with the fixed "Global prompts · Always in your feed" row, suggestions from places
// you follow, and the privacy line. Following a place never shows on a profile.
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { followPlace, placesScreen, unfollowPlace, type PlaceCard, type PlacesScreen } from '@/lib/content';
import { ActionSheet } from '@/ui/ActionSheet';
import { OverlaySheet } from '@/ui/OverlaySheet';
import { Spinner } from '@/ui/HomeStates';
import { ChevronLeft, PlacePinIcon, PromptBubbleIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

export default function PlacesScreenRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<PlacesScreen | null>(null);
  const [unfollowAsk, setUnfollowAsk] = useState<PlaceCard | null>(null);

  const load = useCallback(() => {
    placesScreen()
      .then(setData)
      .catch((e) => console.error('places_screen failed', e));
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const follow = async (p: PlaceCard) => {
    try {
      await followPlace(p.id, 'suggestion');
      load();
    } catch (e) {
      console.error('follow_place failed', e);
    }
  };
  const unfollow = async () => {
    if (!unfollowAsk) return;
    const p = unfollowAsk;
    setUnfollowAsk(null);
    try {
      await unfollowPlace(p.id);
      load();
    } catch (e) {
      console.error('unfollow_place failed', e);
    }
  };

  const row = (p: PlaceCard, action: 'following' | 'follow') => (
    <View key={p.id} style={[s.row, { minHeight: 64 }]}>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.id } })} style={s.rowMain}>
        <PlaceThumb place={p} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.rowTitle}>{p.name}</Text>
          <Text style={s.sub}>
            {p.region} · {action === 'following' && p.from_cohort ? 'from your beta invite' : p.prompt_count === 1 ? '1 prompt' : `${p.prompt_count} prompts`}
          </Text>
        </View>
      </Pressable>
      {action === 'following' ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Unfollow ${p.name}`} onPress={() => setUnfollowAsk(p)} style={[s.pill, s.pillGrey]}>
          <Text style={[s.pillText, { color: colors.text }]}>Following</Text>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={`Follow ${p.name}`} onPress={() => void follow(p)} style={[s.pill, s.pillBlack]}>
          <Text style={s.pillText}>Follow</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={s.root}>
      <View style={[s.header, { top: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.back}>
          <ChevronLeft />
        </Pressable>
        <Text style={s.headerTitle}>Places</Text>
      </View>
      {data === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner light={false} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 53, paddingBottom: 40 }}>
          <Text style={s.intro}>Prompts from places you follow appear in your feed next to global prompts. Only you can see which places you follow.</Text>
          <Pressable accessibilityRole="search" accessibilityLabel="Search cities and places" onPress={() => router.push('/search')} style={s.search}>
            <Text style={s.searchText}>Search cities and places</Text>
          </Pressable>
          <Text style={s.cap}>Following</Text>
          <View style={s.group}>
            {data.following.map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <View style={s.sep} /> : null}
                {row(p, 'following')}
              </View>
            ))}
            {data.following.length ? <View style={s.sep} /> : null}
            <View style={[s.row, { minHeight: 64 }]}>
              <View style={[s.placeThumb, { alignItems: 'center', justifyContent: 'center' }]}>
                <PromptBubbleIcon color={colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Global prompts</Text>
                <Text style={s.sub}>Always in your feed</Text>
              </View>
            </View>
          </View>
          {data.suggested.length ? (
            <>
              <Text style={s.cap}>Suggested, based on places you follow</Text>
              <View style={s.group}>
                {data.suggested.map((p, i) => (
                  <View key={p.id}>
                    {i > 0 ? <View style={s.sep} /> : null}
                    {row(p, 'follow')}
                  </View>
                ))}
              </View>
            </>
          ) : null}
          <Text style={s.foot}>More places open as the beta grows. Following a place never shows on your profile.</Text>
        </ScrollView>
      )}

      {/* Board P-Unfollow */}
      <OverlaySheet visible={unfollowAsk !== null} onRequestClose={() => setUnfollowAsk(null)}>
        <ActionSheet
          title={`Unfollow ${unfollowAsk?.name ?? ''}?`}
          lines={[`${unfollowAsk?.name ?? ''} prompts will stop appearing in your feed. Global prompts and people you follow stay.`]}
          actions={[{ label: 'Unfollow', destructive: true, onPress: () => void unfollow() }]}
          onCancel={() => setUnfollowAsk(null)}
        />
      </OverlaySheet>
    </View>
  );
}

export function PlaceThumb({ place, size = 40 }: { place: PlaceCard; size?: number }) {
  if (place.image_path) return <Image source={{ uri: place.image_path }} style={{ width: size, height: size, borderRadius: 10, backgroundColor: '#E5E5EA' }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: '#E5E5EA', alignItems: 'center', justifyContent: 'center' }}>
      <PlacePinIcon size={16} color={place.open ? colors.text : colors.textTertiary} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { position: 'absolute', left: 6, right: 6, height: 44, flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { position: 'absolute', left: 54, right: 54, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  intro: { marginHorizontal: 32, ...type.body14, lineHeight: 20, color: colors.textSecondary, fontFamily },
  search: { marginHorizontal: 16, marginTop: 24, height: 38, borderRadius: 11, backgroundColor: 'rgba(118,118,128,0.12)', justifyContent: 'center', paddingHorizontal: 10 },
  searchText: { ...type.body16, color: colors.textTertiary, fontFamily },
  cap: { paddingTop: 22, paddingHorizontal: 32, paddingBottom: 7, ...type.caption13, color: colors.textSecondary, fontFamily },
  group: { marginHorizontal: 16, borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowTitle: { ...type.button16, color: colors.text, fontFamily },
  sub: { marginTop: 1, ...type.caption13, color: colors.textSecondary, fontFamily },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 68, backgroundColor: colors.separator },
  foot: { paddingTop: 7, paddingHorizontal: 32, ...type.caption13, lineHeight: 18, color: colors.textTertiary, fontFamily },
  pill: { height: 30, paddingHorizontal: 13, borderRadius: 15, justifyContent: 'center' },
  pillBlack: { backgroundColor: colors.text },
  pillGrey: { backgroundColor: '#E5E5EA' },
  pillText: { ...type.semi14, color: colors.white, fontFamily },
  placeThumb: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#E5E5EA' },
});
