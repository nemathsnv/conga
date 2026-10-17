// Boards C-Live (the suggestion is live, no draft) and C-Draft (publish the private draft?).
// SPEC.md Section 12: a draft is never published automatically.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track } from '@/lib/analytics';
import { acknowledgeDisclosure, disclosureAcknowledged, discardDraft, getSuggestion, publishDraft, type Suggestion } from '@/lib/content';
import { promptLink } from '@/lib/links';
import { Button, Glass } from '@/ui/components';
import { CheckIcon, CloseIcon, PlacePinIcon, PlayIcon, PlusSlotIcon, RecordDotIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';
import { VideoSurface } from '@/ui/VideoSurface';
import { useOpenRecord } from '@/ui/recordEntry';

export default function SuggestionOutcomeScreen() {
  const router = useRouter();
  const openRecord = useOpenRecord();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [sg, setSg] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (id) getSuggestion(id).then(setSg).catch((e) => console.error('get_suggestion failed', e));
  }, [id]);

  const prompt = sg?.prompt ?? null;
  const toPrompt = () => prompt && router.replace({ pathname: '/player/[promptId]', params: { promptId: prompt.id } });

  const publish = async () => {
    if (!sg || busy) return;
    setBusy(true);
    try {
      if (!(await disclosureAcknowledged())) await acknowledgeDisclosure('draft');
      await publishDraft(sg.id);
      track('draft_published', { prompt_id: prompt?.id ?? '' });
      toPrompt();
    } catch (e) {
      console.error('publish_draft failed', e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!sg || busy) return;
    try {
      await discardDraft(sg.id);
      track('draft_deleted', { prompt_id: prompt?.id ?? '' });
      setSg({ ...sg, draft: null });
    } catch (e) {
      console.error('discard_draft failed', e);
    }
  };

  if (!sg || !prompt) return <View style={s.dark} />;

  // Board C-Draft
  if (sg.draft) {
    return (
      <View style={s.dark}>
        <StatusBar style="light" />
        <VideoSurface playbackId={sg.draft.playback_id} active={playing} loop onProgress={() => undefined} />
        <View style={[s.gradTop]} />
        <View style={[s.gradBottom]} />
        <View style={[s.header, { top: insets.top + 3 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={s.back}>
            <CloseIcon />
          </Pressable>
          <Text style={s.headerTitle}>Your draft</Text>
          <Glass style={s.onlyYou} radius={14}>
            <Text style={s.onlyYouText}>Only you</Text>
          </Glass>
        </View>
        <Glass style={[s.card, { top: insets.top + 57 }]} radius={16}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={s.liveDot}>
              <CheckIcon size={11} color={colors.black} />
            </View>
            <Text style={s.cardKicker}>Your prompt is live</Text>
          </View>
          <Text style={s.cardText}>{prompt.text}</Text>
          <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {prompt.place ? <PlacePinIcon size={11} color="rgba(255,255,255,0.72)" /> : null}
            <Text style={s.cardSub}>
              {prompt.place ? `${prompt.place.name} · ` : ''}
              {prompt.response_count === 0 ? 'no responses yet' : `${prompt.response_count} responses`}
            </Text>
          </View>
        </Glass>
        {!playing ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Play draft" onPress={() => setPlaying(true)} style={s.playButton}>
            <Glass style={s.playGlass} radius={32}>
              <PlayIcon size={28} />
            </Glass>
          </Pressable>
        ) : null}
        <View style={[s.publishBlock, { bottom: Math.max(insets.bottom, 10) + 150 }]}>
          <Text style={s.publishTitle}>Publish your response?</Text>
          <Text style={s.publishText}>You recorded this while your prompt was in review. Watch it first if you like.</Text>
        </View>
        <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 10) + 24 }]}>
          <Button title="Publish response" variant="white" onPress={() => void publish()} disabled={busy || !sg.draft.ready} />
          <View style={{ marginTop: 10, flexDirection: 'row', gap: 10 }}>
            <Pressable accessibilityRole="button" onPress={() => { track('draft_rerecorded', { prompt_id: prompt.id }); openRecord.open({ pathname: '/record/[promptId]', params: { promptId: 'draft', draftFor: sg.id } }, 'replace'); }} style={{ flex: 1 }}>
              <Glass style={s.halfButton} radius={22}>
                <Text style={s.halfText}>Re-record</Text>
              </Glass>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void remove()} style={{ flex: 1 }}>
              <Glass style={s.halfButton} radius={22}>
                <Text style={[s.halfText, { color: '#FF6961' }]}>Delete draft</Text>
              </Glass>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // Board C-Live
  return (
    <View style={s.dark}>
      <StatusBar style="light" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.5)' }]} />
      <Glass style={[s.banner, { top: insets.top + 53 }]} radius={16}>
        <View style={s.bannerIcon}>
          <CheckIcon size={16} color={colors.black} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.bannerTitle}>Your prompt is live{prompt.place ? ` in ${prompt.place.name}` : ''}</Text>
          <Text style={s.bannerSub}>{prompt.place ? `People who follow ${prompt.place.name} will see it in their feed.` : 'People will see it in their feed.'}</Text>
        </View>
      </Glass>
      <View style={[s.block, { top: insets.top + 150 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {prompt.place ? <PlacePinIcon size={13} color="rgba(255,255,255,0.72)" /> : null}
          <Text style={s.kicker}>
            {prompt.place ? `${prompt.place.name} · ` : ''}Suggested by you · Just now
          </Text>
        </View>
        <Text style={s.h1}>{prompt.text}</Text>
        <View style={s.dash}>
          <PlusSlotIcon />
        </View>
        <Text style={s.noResponses}>No responses yet.</Text>
        <Pressable accessibilityRole="button" onPress={() => openRecord.open({ pathname: '/record/[promptId]', params: { promptId: prompt.id } }, 'replace')} style={({ pressed }) => [s.firstButton, pressed && { opacity: 0.8 }]}>
          <RecordDotIcon color={colors.black} />
          <Text style={s.firstButtonText}>Be the first to respond</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { track('share_tapped', { target: 'prompt', method: 'share', logged_in: true }); void Share.share({ url: promptLink(prompt.id), message: promptLink(prompt.id) }).catch(() => undefined); }} style={s.shareLink}>
          <Text style={s.shareLinkText}>Share prompt</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={[s.close, { top: insets.top + 3 }]}>
        <CloseIcon />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  dark: { flex: 1, backgroundColor: '#0E0E10' },
  gradTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 260, backgroundColor: 'rgba(0,0,0,0.35)' },
  gradBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 460, backgroundColor: 'rgba(0,0,0,0.45)' },
  header: { position: 'absolute', left: 6, right: 16, height: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, ...type.semi15, color: colors.white, fontFamily },
  onlyYou: { height: 28, paddingHorizontal: 11, justifyContent: 'center' },
  onlyYouText: { ...type.caption13, fontWeight: '600', color: colors.white, fontFamily },
  card: { position: 'absolute', left: 16, right: 16, paddingHorizontal: 14, paddingVertical: 12 },
  liveDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  cardKicker: { ...type.caption13, fontWeight: '600', color: colors.white, fontFamily },
  cardText: { marginTop: 6, ...type.button16, lineHeight: 20, color: colors.white, fontFamily },
  cardSub: { ...type.caption12, color: 'rgba(255,255,255,0.72)', fontFamily },
  playButton: { position: 'absolute', left: '50%', top: 380, marginLeft: -32 },
  playGlass: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  publishBlock: { position: 'absolute', left: 20, right: 20 },
  publishTitle: { fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.5, color: colors.white, fontFamily },
  publishText: { marginTop: 6, ...type.label15, lineHeight: 21, color: 'rgba(255,255,255,0.8)', fontFamily },
  bottom: { position: 'absolute', left: 20, right: 20, bottom: 0 },
  halfButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
  halfText: { ...type.semi15, color: colors.white, fontFamily },
  banner: { position: 'absolute', left: 12, right: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bannerIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { ...type.semi14, color: colors.white, fontFamily },
  bannerSub: { marginTop: 1, ...type.caption12, color: 'rgba(255,255,255,0.75)', fontFamily },
  block: { position: 'absolute', left: 28, right: 28, alignItems: 'center' },
  kicker: { ...type.caption13, fontWeight: '500', color: 'rgba(255,255,255,0.72)', fontFamily },
  h1: { marginTop: 12, fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8, color: colors.white, textAlign: 'center', fontFamily },
  dash: { marginTop: 34, width: 62, height: 82, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center' },
  noResponses: { marginTop: 14, ...type.body16, color: 'rgba(255,255,255,0.86)', fontFamily },
  firstButton: { marginTop: 20, height: 50, paddingHorizontal: 26, borderRadius: 25, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 8 },
  firstButtonText: { ...type.button16, letterSpacing: 0, color: colors.black, fontFamily },
  shareLink: { marginTop: 8, height: 40, justifyContent: 'center' },
  shareLinkText: { ...type.medium14, color: 'rgba(255,255,255,0.8)', fontFamily },
  close: { position: 'absolute', left: 6, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
