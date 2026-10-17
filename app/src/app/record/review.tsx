// Boards PR-Review (watch, caption, Re-record, Post), PR-Caption (typing), PR-Discard
// (Discard this recording?) and A-Disclosure (first public video). SPEC.md Sections 6, 16.
// PR-Reply: the same review for a video reply, with the context card and "Post reply".
// PR-Draft: a private first response for a suggestion in review, with "Save draft".
// A take with a camera flip arrives as several segments: they are stitched once, here, and the
// stitched file is what plays and what Post sends (docs/BLOCKERS.md B-1, video/stitch.ts).
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track } from '@/lib/analytics';
import { acknowledgeDisclosure, disclosureAcknowledged } from '@/lib/content';
import { useSession } from '@/lib/session';
import { Button, Glass } from '@/ui/components';
import { GlassTool, ProgressLine, VideoGradients } from '@/ui/dark';
import { CloseIcon, CommentIcon, PersonIcon, RecordDotIcon, ShareIcon } from '@/ui/Icons';
import { useOpenRecord } from '@/ui/recordEntry';
import { ReplyCard } from '@/ui/ReplyCard';
import { colors, fontFamily, type } from '@/ui/theme';
import { VideoSurface } from '@/ui/VideoSurface';
import { usePosting } from '@/video/posting';
import { createGate } from '@/video/postingFlow';
import { getCurrentRecording, setCurrentRecording } from '@/video/recordingStore';
import { abandonStitch, ensureStitched, needsStitching } from '@/video/stitch';
import type { Recording } from '@/video/types';
import { deleteRecordingFiles } from '@/video/upload';
import { uploadTickets } from '@/video/uploadTickets';

const CAPTION_MAX = 150;

export default function ReviewScreen() {
  const router = useRouter();
  const openRecord = useOpenRecord();
  const insets = useSafeAreaInsets();
  const posting = usePosting();
  const { session, state: sessionState, refresh } = useSession();
  const ownerId = session?.user.id ?? null;
  const current = getCurrentRecording();
  const [caption, setCaption] = useState('');
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [disclosure, setDisclosure] = useState(false);
  const [busy, setBusy] = useState(false);
  // Post and the disclosure sheet's Post run one at a time: taps before the re-render join the first.
  const [gate] = useState(createGate);
  // Re-renders once the stitched recording replaces the segments in the store.
  const [, setStitchedId] = useState<string | null>(null);

  // Stitch a multi-segment take as soon as Review opens; Post waits for this same stitch.
  useEffect(() => {
    const arrived = getCurrentRecording();
    if (!arrived || !needsStitching(arrived.recording)) return;
    ensureStitched(arrived.recording)
      .then((stitched) => {
        if (!adoptStitched(stitched)) deleteRecordingFiles(stitched);
        else setStitchedId(stitched.id);
      })
      .catch((e) => console.error('stitch failed', e));
  }, []);

  // Ask for the upload URL now, while the person reviews, so Post does not wait for it. Post uses
  // this same request (or the URL it gave), even if it is still running: one URL per post.
  useEffect(() => {
    if (ownerId) uploadTickets.prefetch(ownerId);
  }, [ownerId]);

  useEffect(() => {
    if (!current) router.replace('/(tabs)');
  }, [current, router]);
  if (!current) return null;
  const { recording, prompt, replyTo, draftFor } = current;
  const rootName = replyTo?.context.kind === 'reply' ? replyTo.context.root?.author.name ?? null : null;

  const discard = () => {
    abandonStitch(recording);
    deleteRecordingFiles(recording);
    setCurrentRecording(null);
    setDiscardAsk(false);
    router.dismissTo('/(tabs)');
  };

  const rerecord = () => {
    abandonStitch(recording);
    deleteRecordingFiles(recording);
    setCurrentRecording(null);
    router.replace({ pathname: '/record/[promptId]', params: { promptId: draftFor ? 'draft' : prompt.id, ...(replyTo ? { replyTo: replyTo.id } : {}), ...(draftFor ? { draftFor } : {}) } });
  };

  const submit = async () => {
    if (!ownerId) return;
    setBusy(true);
    try {
      // A take with a flip is posted as its stitched file (already done, or still running).
      const stitched = await ensureStitched(recording);
      adoptStitched(stitched);
      await posting.post({ recording: stitched, promptId: prompt.id, promptText: prompt.text, caption: caption.trim() || null, tickets: uploadTickets.forOwner(ownerId), replyTo: replyTo ? { id: replyTo.id, name: replyTo.author.name.split(' ')[0] } : undefined, draftFor });
      setCurrentRecording(null);
      if (draftFor) router.dismissTo('/suggestions');
      else router.dismissTo('/(tabs)');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('posting_paused') || message.includes('suspended')) {
        // A-Restricted / LV-Suspended: the server refused; show the notice, keep the recording.
        const fresh = await refresh();
        const actionId = fresh?.restriction?.action_id ?? sessionState?.restriction?.action_id;
        if (actionId) router.replace({ pathname: '/notice/[actionId]', params: { actionId } });
        else router.dismissTo('/(tabs)');
        return;
      }
      // P7 / P8: another recording of this member is waiting or posting; Post refuses to replace it.
      if (message.includes('post_pending') && openRecord.showBlock()) {
        setBusy(false);
        return;
      }
      console.error('post failed', e);
      setBusy(false);
    }
  };

  const onPost = () => gate(async () => {
    if (busy) return;
    // A private draft is not a public video: no disclosure until it is published (C-Draft).
    if (draftFor) {
      await submit();
      return;
    }
    try {
      const acked = await disclosureAcknowledged();
      if (!acked) {
        setDisclosure(true);
        track('disclosure_shown', { kind: replyTo ? 'reply' : 'response' });
        return;
      }
    } catch (e) {
      console.error('disclosure check failed', e);
      return;
    }
    await submit();
  });

  const onDisclosurePost = () => gate(async () => {
    if (busy) return;
    try {
      await acknowledgeDisclosure(replyTo ? 'reply' : 'response');
      setDisclosure(false);
      await submit();
    } catch (e) {
      console.error('acknowledge_disclosure failed', e);
    }
  });

  // Until the stitch is done there is no one clip to play.
  const localUri = needsStitching(recording) ? undefined : recording.segments[0]?.uri;

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <VideoSurface playbackId={null} localUri={localUri} active={!discardAsk && !disclosure} loop onProgress={setProgress} />
      <VideoGradients top={240} bottom={330} topAlpha={0.55} bottomAlpha={0.7} />

      <View style={[s.header, { top: insets.top + 3 }]}>
        <GlassTool label="Discard" onPress={() => setDiscardAsk(true)}>
          <CloseIcon />
        </GlassTool>
        {replyTo || draftFor ? (
          <View style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.yourResponseTo}>Your response to</Text>
            <Text style={s.promptText} numberOfLines={2}>{prompt.text}</Text>
          </View>
        )}
      </View>
      {draftFor ? (
        <Glass style={[s.draftCard, { top: insets.top + 59 }]} radius={16}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={s.draftKicker}>First response for your suggested prompt</Text>
            <Text style={s.draftKicker}>Only you</Text>
          </View>
          <Text style={s.draftText} numberOfLines={2}>{prompt.text}</Text>
          <Text style={s.draftSub}>{prompt.place ? `${prompt.place.name} · ` : ''}in review</Text>
        </Glass>
      ) : null}
      {replyTo ? (
        <ReplyCard
          kicker="Your reply to"
          name={replyTo.author.name}
          caption={replyTo.caption}
          captionLines={1}
          captionBold
          sub={rootName ? `In replies to ${rootName}` : null}
          playbackId={replyTo.playback_id}
          style={{ position: 'absolute', left: 16, right: 16, top: insets.top + 59, paddingRight: 14 }}
        />
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.bottomArea} pointerEvents="box-none">
        <View style={{ paddingBottom: Math.max(insets.bottom, 10) + 10 }}>
          <ProgressLine fraction={progress} />
          <Glass style={s.captionBox} radius={14}>
            <TextInput
              style={s.captionInput}
              value={caption}
              onChangeText={(v) => setCaption(v.slice(0, CAPTION_MAX))}
              placeholder="Add a caption (optional)"
              placeholderTextColor="rgba(255,255,255,0.6)"
              multiline
              maxLength={CAPTION_MAX}
              onFocus={() => setEditing(true)}
              onBlur={() => setEditing(false)}
              accessibilityLabel="Caption"
            />
          </Glass>
          {editing ? <Text style={s.counter}>{caption.length} / {CAPTION_MAX}</Text> : null}
          {draftFor && !editing ? <Text style={s.draftNote}>Saved privately. When your prompt goes live, you choose whether to publish it.</Text> : null}
          {!editing ? (
            <View style={s.buttons}>
              <Pressable accessibilityRole="button" onPress={rerecord} style={({ pressed }) => [s.rerecord, pressed && { opacity: 0.7 }]}>
                <Glass style={StyleSheet.absoluteFill} radius={26}>{null}</Glass>
                <RecordDotIcon />
                <Text style={s.rerecordText}>Re-record</Text>
              </Pressable>
              <Button title={draftFor ? 'Save draft' : replyTo ? 'Post reply' : 'Post'} variant="white" onPress={() => void onPost()} disabled={busy} style={{ flex: 1 }} />
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      {/* Board PR-Discard */}
      <Modal visible={discardAsk} transparent animationType="fade" onRequestClose={() => setDiscardAsk(false)}>
        <View style={s.dim}>
          <View style={[s.sheetWrap, { paddingBottom: Math.max(insets.bottom, 10) + 24 }]}>
            <View style={s.actionSheet}>
              <View style={s.actionHead}>
                <Text style={s.actionTitle}>Discard this recording?</Text>
                <Text style={s.actionSub}>It won&apos;t be saved anywhere.</Text>
              </View>
              <View style={s.actionSep} />
              <Pressable accessibilityRole="button" onPress={discard} style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.6 }]}>
                <Text style={s.actionDestructive}>Discard</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setDiscardAsk(false)} style={({ pressed }) => [s.actionCancel, pressed && { opacity: 0.6 }]}>
              <Text style={s.actionCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Board A-Disclosure */}
      <Modal visible={disclosure} transparent animationType="slide" onRequestClose={() => setDisclosure(false)}>
        <View style={s.dim}>
          <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 10) + 24 }]}>
            <View style={s.handle} />
            <View style={s.sheetIcon}>
              <PersonIcon size={24} />
            </View>
            <Text style={s.sheetTitle}>Your videos are public</Text>
            <View style={s.points}>
              <Point icon={<PersonIcon size={16} />} title="Anyone on Conga can watch them" text="People can reply on video and share them. Responses can also get comments." />
              <Point icon={<ShareIcon size={16} color={colors.text} />} title="Shared links work on the web" text="Anyone with a link can watch, even without an account." />
              <Point icon={<CommentIcon size={16} color={colors.text} />} title="You stay in control" text="Delete any of your videos at any time." />
            </View>
            <Button title="Post" onPress={() => void onDisclosurePost()} disabled={busy} style={{ marginTop: 24 }} />
            <Button title="Go back" variant="text" onPress={() => { track('disclosure_back', { kind: replyTo ? 'reply' : 'response' }); setDisclosure(false); }} style={{ marginTop: 6 }} textStyle={{ fontSize: 16 }} />
            <Text style={s.sheetNote}>Shown once, before your first public video: a response, a video reply or a published draft.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Puts the stitched recording in place of its segments, if it is still the one under review. */
function adoptStitched(stitched: Recording): boolean {
  const now = getCurrentRecording();
  if (now?.recording.id !== stitched.id) return false;
  if (now.recording !== stitched) setCurrentRecording({ ...now, recording: stitched });
  return true;
}

function Point({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <View style={s.point}>
      <View style={s.pointIcon}>{icon}</View>
      <View style={{ flex: 1, paddingTop: 1 }}>
        <Text style={s.pointTitle}>{title}</Text>
        <Text style={s.pointText}>{text}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  header: { position: 'absolute', left: 12, right: 12, height: 44, flexDirection: 'row', alignItems: 'center' },
  yourResponseTo: { ...type.caption12, color: colors.white72, fontFamily },
  promptText: { ...type.semi15, lineHeight: 19, marginTop: 1, color: colors.white, fontFamily },
  bottomArea: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  captionBox: { marginHorizontal: 16, marginTop: 20, minHeight: 48, paddingHorizontal: 14, paddingVertical: 13, justifyContent: 'center' },
  captionInput: { ...type.label15, lineHeight: 20, color: colors.white, fontFamily, padding: 0, maxHeight: 100 },
  counter: { alignSelf: 'flex-end', marginRight: 28, marginTop: 8, ...type.caption12, color: 'rgba(255,255,255,0.75)', fontFamily, fontVariant: ['tabular-nums'] },
  buttons: { marginHorizontal: 16, marginTop: 16, flexDirection: 'row', gap: 10 },
  rerecord: { height: 52, paddingHorizontal: 18, borderRadius: 26, flexDirection: 'row', alignItems: 'center', gap: 7, overflow: 'hidden' },
  rerecordText: { ...type.button16, letterSpacing: 0, color: colors.white, fontFamily },
  draftCard: { position: 'absolute', left: 16, right: 16, paddingHorizontal: 14, paddingVertical: 10 },
  draftKicker: { ...type.caption12, color: 'rgba(255,255,255,0.75)', fontFamily },
  draftText: { marginTop: 4, ...type.semi15, lineHeight: 19, color: colors.white, fontFamily },
  draftSub: { marginTop: 3, ...type.caption12, color: 'rgba(255,255,255,0.68)', fontFamily },
  draftNote: { marginHorizontal: 24, marginTop: 10, textAlign: 'center', ...type.caption12, lineHeight: 17, color: 'rgba(255,255,255,0.7)', fontFamily },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 8 },
  actionSheet: { borderRadius: 14, backgroundColor: 'rgba(249,249,249,0.96)', overflow: 'hidden', alignItems: 'stretch' },
  actionHead: { paddingTop: 16, paddingBottom: 14, paddingHorizontal: 20, alignItems: 'center' },
  actionTitle: { ...type.caption13, fontWeight: '600', color: colors.textSecondary, fontFamily },
  actionSub: { ...type.caption13, marginTop: 4, color: colors.textTertiary, textAlign: 'center', fontFamily },
  actionSep: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(60,60,67,0.29)' },
  actionRow: { height: 57, alignItems: 'center', justifyContent: 'center' },
  actionDestructive: { fontSize: 20, color: colors.dangerBorder, fontFamily },
  actionCancel: { marginTop: 8, height: 57, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  actionCancelText: { fontSize: 20, fontWeight: '600', color: '#007AFF', fontFamily },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingTop: 6, paddingHorizontal: 16 },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.separator },
  sheetIcon: { marginTop: 22, width: 52, height: 52, borderRadius: 26, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { marginTop: 16, fontSize: 24, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5, color: colors.text, fontFamily },
  points: { marginTop: 18, gap: 14 },
  point: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  pointIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  pointTitle: { ...type.semi15, color: colors.text, fontFamily },
  pointText: { ...type.body14, marginTop: 1, color: colors.textSecondary, fontFamily },
  sheetNote: { ...type.caption12, textAlign: 'center', color: colors.textTertiary, fontFamily },
});
