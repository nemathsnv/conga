// Board C-Preview (SPEC.md Section 12): exactly as it will appear, "Show my name on this
// prompt" (on by default), "A person reviews every prompt before it goes live."
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { editSuggestion, suggestPrompt } from '@/lib/content';
import { useSession } from '@/lib/session';
import { resetSuggestDraft, setSuggestDraft, useSuggestDraft } from '@/lib/suggestFlow';
import { Button, Glass } from '@/ui/components';
import { ChevronLeft, PlacePinIcon, PlusSlotIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

export default function SuggestPreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const draft = useSuggestDraft();
  const { state } = useSession();
  const [busy, setBusy] = useState(false);
  const name = state?.profile?.name ?? '';

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const sg = draft.editId
        ? await editSuggestion(draft.editId, draft.text.trim(), draft.placeId, draft.attribution)
        : await suggestPrompt(draft.text.trim(), draft.placeId, draft.attribution);
      resetSuggestDraft();
      router.replace({ pathname: '/suggest/submitted', params: { id: sg.id } });
    } catch (e) {
      // too_many_in_review and the posting gates come back here; the person sees the sheet again.
      console.error('suggest failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.5)' }]} />
      <View style={[s.header, { top: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.back}>
          <ChevronLeft color={colors.white} />
        </Pressable>
        <Glass style={s.previewPill} radius={14}>
          <Text style={s.previewPillText}>Preview</Text>
        </Glass>
        <View style={{ width: 44 }} />
      </View>
      <View style={[s.block, { top: insets.top + 160 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {draft.placeName ? <PlacePinIcon size={13} color="rgba(255,255,255,0.72)" /> : null}
          <Text style={s.kicker}>
            {draft.placeName ? `${draft.placeName} · ` : ''}
            {draft.attribution ? `Suggested by ${name}` : 'New prompt'}
          </Text>
        </View>
        <Text style={s.h1}>{draft.text.trim()}</Text>
        <View style={s.dash}>
          <PlusSlotIcon />
        </View>
        <Text style={s.noResponses}>No responses yet.</Text>
      </View>
      <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        <Glass style={s.toggleCard} radius={14}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.toggleTitle}>Show my name on this prompt</Text>
            <Text style={s.toggleSub}>Off: it&apos;s published without a name</Text>
          </View>
          <Switch value={draft.attribution} onValueChange={(v) => setSuggestDraft({ attribution: v })} trackColor={{ true: '#34C759', false: 'rgba(255,255,255,0.3)' }} accessibilityLabel="Show my name on this prompt" />
        </Glass>
        <Text style={s.note}>A person reviews every prompt before it goes live.{'\n'}We&apos;ll let you know when it&apos;s reviewed.</Text>
        <Button title="Submit for review" variant="white" onPress={() => void submit()} disabled={busy} />
        <Button title="Edit" variant="textOnDark" onPress={() => router.dismissTo('/suggest/write')} style={{ marginTop: 6 }} textStyle={{ fontWeight: '600', color: colors.white }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E0E10' },
  header: { position: 'absolute', left: 6, right: 6, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  previewPill: { height: 28, paddingHorizontal: 12, justifyContent: 'center' },
  previewPillText: { ...type.caption13, fontWeight: '600', color: colors.white, fontFamily },
  block: { position: 'absolute', left: 28, right: 28, alignItems: 'center' },
  kicker: { ...type.caption13, fontWeight: '500', color: 'rgba(255,255,255,0.72)', fontFamily },
  h1: { marginTop: 12, fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8, color: colors.white, textAlign: 'center', fontFamily },
  dash: { marginTop: 34, width: 62, height: 82, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center' },
  noResponses: { marginTop: 14, ...type.body16, color: 'rgba(255,255,255,0.86)', fontFamily },
  bottom: { position: 'absolute', left: 20, right: 20, bottom: 0 },
  toggleCard: { marginBottom: 14, paddingVertical: 10, paddingLeft: 14, paddingRight: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleTitle: { ...type.semi15, color: colors.white, fontFamily },
  toggleSub: { marginTop: 1, ...type.caption12, color: 'rgba(255,255,255,0.7)', fontFamily },
  note: { marginBottom: 14, textAlign: 'center', ...type.caption13, lineHeight: 18, color: 'rgba(255,255,255,0.7)', fontFamily },
});
