// Board C-Plus: the + sheet. "Respond to" lists tonight's prompt first, then open global
// prompts (followed places arrive in phase 6). The "Suggest a prompt" rows belong to the
// suggestion flow (phase 6) and are not drawn until then.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openPrompts, type PromptCard } from '@/lib/content';
import { responsesLabel } from '@/lib/format';
import { Separator } from '@/ui/components';
import { PlacePinIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

function isTonight(p: PromptCard): boolean {
  return !!p.featured_on && p.featured_on === new Date().toISOString().slice(0, 10);
}

export default function PlusSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [prompts, setPrompts] = useState<PromptCard[] | null>(null);

  useEffect(() => {
    void openPrompts().then(setPrompts).catch((e) => console.error('open_prompts failed', e));
  }, []);

  const respond = (p: PromptCard) => {
    router.replace({ pathname: '/record/[promptId]', params: { promptId: p.id } });
  };

  return (
    <View style={s.root}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => router.back()} accessibilityLabel="Close" />
      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 10) + 24 }]}>
        <View style={s.handle} />
        <Text style={s.title}>Respond to</Text>
        <ScrollView style={{ maxHeight: 64 * 5 }} bounces={false}>
          <View style={s.group}>
            {(prompts ?? []).map((p, i) => (
              <View key={p.id}>
                {i > 0 ? <Separator /> : null}
                <View style={s.row}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{p.text}</Text>
                    <View style={s.subRow}>
                      {p.place ? <PlacePinIcon size={12} color={colors.textSecondary} /> : null}
                      <Text style={s.sub}>
                        {isTonight(p) ? "Tonight's prompt · " : p.place ? `${p.place.name} · ` : ''}
                        {p.response_count === 0 ? 'No responses yet' : responsesLabel(p.response_count)}
                      </Text>
                    </View>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Respond to ${p.text}`} onPress={() => respond(p)} style={({ pressed }) => [s.pill, pressed && { opacity: 0.7 }]}>
                    <Text style={s.pillText}>Respond</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingTop: 6, paddingHorizontal: 16 },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.separator },
  title: { marginTop: 16, fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4, color: colors.text, fontFamily },
  group: { marginTop: 10, borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  rowTitle: { ...type.body16, fontWeight: '600', letterSpacing: -0.2, color: colors.text, fontFamily },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  sub: { ...type.caption13, color: colors.textSecondary, fontFamily },
  pill: { height: 30, paddingHorizontal: 13, borderRadius: 15, backgroundColor: colors.text, justifyContent: 'center' },
  pillText: { ...type.semi14, color: colors.white, fontFamily },
});
