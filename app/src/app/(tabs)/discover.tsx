// Board R-Discover (SPEC.md Sections 4, 10): search, topic chips, tonight's prompt,
// "Busy right now" from global prompts and followed places.
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { discover, type Discover } from '@/lib/content';
import { responsesLabel } from '@/lib/format';
import { Spinner } from '@/ui/HomeStates';
import { PlacePinIcon, SearchIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';
import { thumbnailUrl } from '@/video/playback';

export default function DiscoverTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Discover | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  const load = useCallback((t: string | null) => {
    discover(t)
      .then(setData)
      .catch((e) => console.error('discover failed', e));
  }, []);
  useFocusEffect(
    useCallback(() => {
      load(topic);
    }, [load, topic]),
  );

  const tonight = data?.tonight ?? null;
  const openPrompt = (id: string) => router.push({ pathname: '/player/[promptId]', params: { promptId: id } });

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 110 }}>
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={s.h1}>Discover</Text>
          <Pressable accessibilityRole="search" accessibilityLabel="Search people, prompts and places" onPress={() => router.push('/search')} style={s.search}>
            <SearchIcon size={18} color={colors.textSecondary} />
            <Text style={s.searchText}>Search people, prompts and places</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <Chip label="For you" on={topic === null} onPress={() => setTopic(null)} />
          {(data?.topics ?? []).map((t) => (
            <Chip key={t.id} label={t.name} on={topic === t.id} onPress={() => setTopic(topic === t.id ? null : t.id)} />
          ))}
        </ScrollView>

        {data === null ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <Spinner light={false} />
          </View>
        ) : (
          <>
            {tonight && topic === null ? (
              <Pressable accessibilityRole="button" onPress={() => openPrompt(tonight.id)} style={({ pressed }) => [s.tonight, pressed && { opacity: 0.85 }]}>
                <View style={s.tonightGrid}>
                  {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={s.tonightCell}>
                      {tonight.thumbnails[i] ? <Image source={{ uri: thumbnailUrl(tonight.thumbnails[i], { width: 180, height: 296 }) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                    </View>
                  ))}
                </View>
                <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
                  <Text style={s.tonightKicker}>Tonight&apos;s prompt · {tonight.hours_left}h left</Text>
                  <Text style={s.tonightTitle}>{tonight.text}</Text>
                  <Text style={s.sub}>{responsesLabel(tonight.response_count)}</Text>
                </View>
              </Pressable>
            ) : null}

            <View style={s.sectionHead}>
              <Text style={s.h}>Busy right now</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.busy}>
              {data.busy.map((p) => (
                <Pressable key={p.id} accessibilityRole="button" onPress={() => openPrompt(p.id)} style={({ pressed }) => [s.busyCard, pressed && { opacity: 0.85 }]}>
                  <View style={s.busyImage}>{p.thumbnail ? <Image source={{ uri: thumbnailUrl(p.thumbnail, { width: 300, height: 300 }) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
                  {p.place ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={p.place.name} onPress={() => router.push({ pathname: '/place/[id]', params: { id: p.place!.id } })} style={s.placeRow} hitSlop={4}>
                      <PlacePinIcon size={11} color={colors.textSecondary} />
                      <Text style={[s.sub, { fontSize: 12 }]}>{p.place.name}</Text>
                    </Pressable>
                  ) : null}
                  <Text style={[s.busyTitle, !p.place && { marginTop: 7 }]} numberOfLines={3}>
                    {p.text}
                  </Text>
                  <Text style={s.sub}>{p.response_count === 0 ? 'No responses yet' : responsesLabel(p.response_count)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipText, on && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.fill },
  h1: { ...type.display34, letterSpacing: -0.8, color: colors.text, fontFamily },
  search: { marginTop: 10, height: 38, borderRadius: 11, backgroundColor: 'rgba(118,118,128,0.12)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  searchText: { ...type.body16, color: colors.textSecondary, fontFamily },
  chips: { paddingTop: 14, paddingHorizontal: 16, gap: 8 },
  chip: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.white, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { ...type.medium14, color: colors.text, fontFamily },
  tonight: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.white },
  tonightGrid: { height: 148, flexDirection: 'row', gap: 2 },
  tonightCell: { flex: 1, backgroundColor: colors.separator },
  tonightKicker: { ...type.caption12, fontWeight: '600', letterSpacing: 0.1, color: '#C2410C', fontFamily },
  tonightTitle: { marginTop: 3, fontSize: 19, lineHeight: 23, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  sub: { ...type.caption13, color: colors.textSecondary, fontFamily },
  sectionHead: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  h: { fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4, color: colors.text, fontFamily },
  busy: { paddingHorizontal: 16, gap: 10 },
  busyCard: { width: 150 },
  busyImage: { width: 150, height: 150, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.separator },
  placeRow: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 4 },
  busyTitle: { marginTop: 1, ...type.semi14, lineHeight: 18, color: colors.text, fontFamily },
});
