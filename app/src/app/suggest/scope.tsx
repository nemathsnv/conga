// Board C-Scope (SPEC.md Section 12): Global, or one of the places you follow.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { placesScreen, type PlaceCard } from '@/lib/content';
import { setSuggestDraft, useSuggestDraft } from '@/lib/suggestFlow';
import { CheckIcon, ChevronLeft, PromptBubbleIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';
import { PlaceThumb } from '../settings/places';

export default function SuggestScopeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const draft = useSuggestDraft();
  const [places, setPlaces] = useState<PlaceCard[] | null>(null);

  useEffect(() => {
    placesScreen()
      .then((d) => setPlaces(d.following))
      .catch((e) => console.error('places_screen failed', e));
  }, []);

  const choose = (p: PlaceCard | null) => setSuggestDraft({ placeId: p?.id ?? null, placeName: p?.name ?? null });
  const selected = (id: string | null) => draft.placeId === id;

  return (
    <View style={s.root}>
      <View style={[s.header, { marginTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={22} />
        </Pressable>
        <Text style={s.headerTitle}>Suggest a prompt</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/suggest/preview')} hitSlop={8}>
          <Text style={[s.headerLink, { fontWeight: '600' }]}>Next</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={s.h1}>Where should it be asked?</Text>
        <Text style={s.quote} numberOfLines={1}>
          &ldquo;{draft.text.trim()}&rdquo;
        </Text>
        <View style={[s.group, { marginTop: 24 }]}>
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected(null) }} onPress={() => choose(null)} style={s.row}>
            <View style={s.globeIcon}>
              <PromptBubbleIcon color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowTitle}>Global</Text>
              <Text style={s.sub}>Anyone, anywhere can respond</Text>
            </View>
            {selected(null) ? <CheckIcon size={18} color={colors.text} /> : null}
          </Pressable>
        </View>
        {places && places.length ? (
          <>
            <Text style={s.cap}>Places you follow</Text>
            <View style={s.group}>
              {places.map((p, i) => (
                <View key={p.id}>
                  {i > 0 ? <View style={s.sep} /> : null}
                  <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected(p.id) }} onPress={() => choose(p)} style={s.row}>
                    <PlaceThumb place={p} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle}>{p.name}</Text>
                      <Text style={s.sub}>{p.region}</Text>
                    </View>
                    {selected(p.id) ? <CheckIcon size={18} color={colors.text} /> : null}
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        ) : null}
        <Text style={s.foot}>You can suggest prompts globally or for any place you follow. Place prompts show a small pin label and go to people who follow that place.</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { marginHorizontal: 16, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLink: { fontSize: 17, lineHeight: 22, color: colors.text, fontFamily },
  headerTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  h1: { marginHorizontal: 24, marginTop: 22, fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.7, color: colors.text, fontFamily },
  quote: { marginHorizontal: 24, marginTop: 14, ...type.label15, lineHeight: 21, color: colors.textSecondary, fontFamily },
  group: { marginHorizontal: 16, borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  globeIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E5EA', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...type.button16, color: colors.text, fontFamily },
  sub: { marginTop: 1, ...type.caption13, color: colors.textSecondary, fontFamily },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 64, backgroundColor: colors.separator },
  cap: { paddingTop: 22, paddingHorizontal: 32, paddingBottom: 7, ...type.caption13, color: colors.textSecondary, fontFamily },
  foot: { paddingTop: 7, paddingHorizontal: 32, ...type.caption13, lineHeight: 18, color: colors.textTertiary, fontFamily },
});
