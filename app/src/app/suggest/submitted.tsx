// Board C-Submitted (SPEC.md Section 12): "Sent for review", the card, an optional first
// response recorded as a private draft.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getSuggestion, type Suggestion } from '@/lib/content';
import { Button } from '@/ui/components';
import { CheckIcon, PlacePinIcon, RecordDotIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

export default function SuggestSubmittedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [sg, setSg] = useState<Suggestion | null>(null);

  useEffect(() => {
    if (id) getSuggestion(id).then(setSg).catch((e) => console.error('get_suggestion failed', e));
  }, [id]);

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top + 78, paddingHorizontal: 24 }}>
        <View style={s.icon}>
          <CheckIcon size={24} color={colors.text} />
        </View>
        <Text style={s.h1}>Sent for review</Text>
        <Text style={s.lead}>We&apos;ll let you know when it&apos;s reviewed, and tell you why if it isn&apos;t published.</Text>
      </View>
      {sg ? (
        <View style={s.card}>
          <View style={s.cardHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {sg.place ? <PlacePinIcon size={12} color={colors.textSecondary} /> : null}
              <Text style={s.cardKicker}>{sg.place ? sg.place.name : 'Global'}</Text>
            </View>
            <View style={s.status}>
              <Text style={s.statusText}>In review</Text>
            </View>
          </View>
          <Text style={s.cardText}>{sg.text}</Text>
        </View>
      ) : null}
      <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        <Pressable accessibilityRole="button" disabled={!sg} onPress={() => sg && router.replace({ pathname: '/record/[promptId]', params: { promptId: 'draft', draftFor: sg.id } })} style={({ pressed }) => [s.recordButton, pressed && { opacity: 0.7 }]}>
          <RecordDotIcon color={colors.text} />
          <Text style={s.recordText}>Record the first response</Text>
        </Pressable>
        <Text style={s.optional}>Optional. Saved as a private draft. You decide whether to publish it once the prompt is live.</Text>
        <Button title="Done" onPress={() => router.dismissTo('/(tabs)')} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  h1: { marginTop: 20, fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -0.7, color: colors.text, fontFamily },
  lead: { marginTop: 10, ...type.body16, lineHeight: 23, color: colors.textSecondary, fontFamily },
  card: { marginHorizontal: 16, marginTop: 40, borderRadius: 16, backgroundColor: colors.fill, padding: 16 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardKicker: { ...type.caption13, color: colors.textSecondary, fontFamily },
  status: { height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.white, justifyContent: 'center' },
  statusText: { ...type.caption12, fontWeight: '600', color: colors.textSecondary, fontFamily },
  cardText: { marginTop: 8, fontSize: 19, lineHeight: 24, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  bottom: { position: 'absolute', left: 20, right: 20, bottom: 0 },
  recordButton: { height: 52, borderRadius: 26, backgroundColor: colors.fill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  recordText: { ...type.button16, color: colors.text, fontFamily },
  optional: { marginTop: 6, marginBottom: 12, textAlign: 'center', ...type.caption12, color: colors.textTertiary, fontFamily },
});
