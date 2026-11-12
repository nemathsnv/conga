// Board C-Write (SPEC.md Section 12): up to 120 characters with a live counter, one line on what
// works and one on what won't be published.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getSuggestion } from '@/lib/content';
import { resetSuggestDraft, setSuggestDraft, SUGGEST_MAX, suggestionTextOk, useSuggestDraft } from '@/lib/suggestFlow';
import { colors, fontFamily, type } from '@/ui/theme';

export default function SuggestWriteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const draft = useSuggestDraft();

  // Editing or rewriting: start from the existing suggestion.
  useEffect(() => {
    if (!edit) return;
    getSuggestion(edit)
      .then((sg) => resetSuggestDraft({ editId: sg.id, text: sg.text, placeId: sg.place?.id ?? null, placeName: sg.place?.name ?? null, attribution: sg.attribution }))
      .catch((e) => console.error('get_suggestion failed', e));
  }, [edit]);

  const ok = suggestionTextOk(draft.text);
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.header, { marginTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" onPress={() => { resetSuggestDraft(); router.back(); }} hitSlop={8}>
          <Text style={s.headerLink}>Cancel</Text>
        </Pressable>
        <Text style={s.headerTitle}>Suggest a prompt</Text>
        <Pressable accessibilityRole="button" disabled={!ok} onPress={() => router.push('/suggest/scope')} hitSlop={8}>
          <Text style={[s.headerLink, { fontWeight: '600' }, !ok && { opacity: 0.35 }]}>Next</Text>
        </Pressable>
      </View>
      <TextInput
        style={s.input}
        value={draft.text}
        onChangeText={(v) => setSuggestDraft({ text: v.slice(0, SUGGEST_MAX) })}
        placeholder="Your prompt"
        placeholderTextColor={colors.textTertiary}
        multiline
        autoFocus
        maxLength={SUGGEST_MAX}
        accessibilityLabel="Your prompt"
      />
      <Text style={s.counter}>
        {draft.text.length} / {SUGGEST_MAX}
      </Text>
      <View style={s.rule} />
      <Text style={s.help}>
        <Text style={s.helpBold}>Good prompts</Text> are open and easy to respond to on camera in 30 seconds: a question, a small challenge, or a statement to react to.
      </Text>
      <Text style={[s.help, { marginTop: 18 }]}>
        <Text style={s.helpBold}>Not published:</Text> anything aimed at a person or group, ads, or asking for private details.
      </Text>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { marginHorizontal: 16, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLink: { fontSize: 17, lineHeight: 22, color: colors.text, fontFamily },
  headerTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  input: { marginHorizontal: 24, marginTop: 26, minHeight: 100, fontSize: 26, lineHeight: 32, fontWeight: '600', letterSpacing: -0.5, color: colors.text, fontFamily, padding: 0, textAlignVertical: 'top' },
  counter: { marginHorizontal: 24, marginTop: 8, textAlign: 'right', ...type.caption13, color: colors.textTertiary, fontFamily, fontVariant: ['tabular-nums'] },
  rule: { marginHorizontal: 24, marginTop: 16, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  help: { marginHorizontal: 24, marginTop: 16, ...type.body14, lineHeight: 20, color: colors.textSecondary, fontFamily },
  helpBold: { fontWeight: '600', color: colors.text },
});
