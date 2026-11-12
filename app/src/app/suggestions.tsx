// Board C-Pending (SPEC.md Section 12): Your suggestions. In review (Edit, Withdraw, the saved
// draft), live (with the response count), not published (with the reason, rewrite and resend).
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/api';
import { mySuggestions, withdrawSuggestion, type Suggestion } from '@/lib/content';
import { agoLabel, responsesLabel } from '@/lib/format';
import { Avatar } from '@/ui/components';
import { Spinner } from '@/ui/HomeStates';
import { ChevronLeft, PlacePinIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';
import { thumbnailUrl } from '@/video/playback';

function liveSince(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 1) return 'live since today';
  if (days < 7) return `live since ${d.toLocaleDateString('en-GB', { weekday: 'long' })}`;
  return `live since ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'long' })}`;
}

export default function SuggestionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Suggestion[] | null>(null);

  const load = useCallback(() => {
    mySuggestions()
      .then((d) => setItems(d.suggestions))
      .catch((e) => console.error('my_suggestions failed', e));
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const withdraw = async (sg: Suggestion) => {
    try {
      await withdrawSuggestion(sg.id);
      load();
    } catch (e) {
      console.error('withdraw failed', e);
    }
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { top: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.back}>
          <ChevronLeft />
        </Pressable>
        <Text style={s.headerTitle}>Your suggestions</Text>
      </View>
      {items === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner light={false} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 53, paddingBottom: 40 }}>
          <Text style={s.intro}>Every suggestion is reviewed by a person before it goes live.</Text>
          <View style={{ marginHorizontal: 16, marginTop: 18, gap: 10 }}>
            {items.map((sg) => (
              <View key={sg.id} style={s.card}>
                <View style={s.cardHead}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {sg.place ? <PlacePinIcon size={12} color={colors.textSecondary} /> : null}
                    <Text style={s.cardKicker}>
                      {sg.place ? sg.place.name : 'Global'}
                      {sg.status === 'in_review' ? ` · sent ${agoLabel(sg.created_at)}` : sg.status === 'live' ? ` · ${liveSince(sg.reviewed_at)}` : ''}
                    </Text>
                  </View>
                  {sg.status === 'live' ? (
                    <View style={[s.status, { backgroundColor: '#E8F7EC', flexDirection: 'row', gap: 5, alignItems: 'center' }]}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759' }} />
                      <Text style={[s.statusText, { color: '#1E7B34' }]}>Live</Text>
                    </View>
                  ) : (
                    <View style={s.status}>
                      <Text style={[s.statusText, sg.status === 'not_published' && { color: colors.textTertiary }]}>{sg.status === 'in_review' ? 'In review' : 'Not published'}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.cardText}>{sg.text}</Text>
                {sg.status === 'in_review' ? (
                  <>
                    {sg.draft ? (
                      <View style={s.draftRow}>
                        <View style={s.draftThumb}>{sg.draft.playback_id ? <Image source={{ uri: thumbnailUrl(sg.draft.playback_id, { width: 48, height: 64 }) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
                        <Text style={s.sub}>Draft response saved · only you can see it</Text>
                      </View>
                    ) : null}
                    <View style={s.actions}>
                      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/suggest/write', params: { edit: sg.id } })} hitSlop={6}>
                        <Text style={s.action}>Edit</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => void withdraw(sg)} hitSlop={6}>
                        <Text style={[s.action, { color: colors.dangerBorder }]}>Withdraw</Text>
                      </Pressable>
                    </View>
                  </>
                ) : sg.status === 'live' && sg.prompt ? (
                  <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/player/[promptId]', params: { promptId: sg.prompt!.id } })} style={s.liveRow}>
                    <View style={{ flexDirection: 'row' }}>
                      {sg.prompt.faces.map((f, j) => (
                        <Avatar key={f.id} uri={avatarUrl(f.photo_path)} size={22} borderWidth={2} borderColor={colors.fill} style={j > 0 ? { marginLeft: -8 } : undefined} />
                      ))}
                    </View>
                    <Text style={s.sub}>{sg.prompt.response_count === 0 ? 'No responses yet' : responsesLabel(sg.prompt.response_count)}</Text>
                  </Pressable>
                ) : sg.status === 'not_published' ? (
                  <>
                    <Text style={s.declined}>{sg.decline_text}</Text>
                    <View style={s.actions}>
                      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/suggest/write', params: { edit: sg.id } })} hitSlop={6}>
                        <Text style={s.action}>Rewrite and resend</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </View>
            ))}
          </View>
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
  intro: { marginHorizontal: 24, ...type.body14, lineHeight: 20, color: colors.textSecondary, fontFamily },
  card: { borderRadius: 16, backgroundColor: colors.fill, padding: 16 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardKicker: { ...type.caption13, color: colors.textSecondary, fontFamily },
  status: { height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.white, justifyContent: 'center' },
  statusText: { ...type.caption12, fontWeight: '600', color: colors.textSecondary, fontFamily },
  cardText: { marginTop: 8, fontSize: 19, lineHeight: 24, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  draftRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  draftThumb: { width: 24, height: 32, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.separator },
  sub: { ...type.caption13, color: colors.textSecondary, fontFamily },
  actions: { marginTop: 12, flexDirection: 'row', gap: 16 },
  action: { ...type.semi14, color: colors.text, fontFamily },
  liveRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  declined: { marginTop: 10, ...type.caption13, lineHeight: 18, color: colors.textSecondary, fontFamily },
});
