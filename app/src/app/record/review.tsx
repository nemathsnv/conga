// Boards PR-Review (watch, caption, Re-record, Post), PR-Caption (typing), PR-Discard
// (Discard this recording?) and A-Disclosure (first public video). SPEC.md Sections 6, 16.
// PR-Reply: the same review for a video reply, with the context card and "Post reply".
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { acknowledgeDisclosure, disclosureAcknowledged } from '@/lib/content';
import { Button, Glass } from '@/ui/components';
import { GlassTool, ProgressLine, VideoGradients } from '@/ui/dark';
import { CloseIcon, CommentIcon, PersonIcon, RecordDotIcon, ShareIcon } from '@/ui/Icons';
import { ReplyCard } from '@/ui/ReplyCard';
import { colors, fontFamily, type } from '@/ui/theme';
import { VideoSurface } from '@/ui/VideoSurface';
import { usePosting } from '@/video/posting';
import { getCurrentRecording, setCurrentRecording } from '@/video/recordingStore';
import { deleteRecordingFiles, mintUpload, type UploadTicket } from '@/video/upload';

const CAPTION_MAX = 150;

export default function ReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const posting = usePosting();
  const current = getCurrentRecording();
  const [caption, setCaption] = useState('');
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [disclosure, setDisclosure] = useState(false);
  const [busy, setBusy] = useState(false);
  const ticket = useRef<UploadTicket | null>(null);

  // Mint the upload URL now, while the person reviews, so Post does not wait for it.
  useEffect(() => {
    void mintUpload()
      .then((t) => {
        ticket.current = t;
      })
      .catch((e) => console.warn('mint on review failed; Post will mint', e));
  }, []);

  useEffect(() => {
    if (!current) router.replace('/(tabs)');
  }, [current, router]);
  if (!current) return null;
  const { recording, prompt, replyTo } = current;
  const rootName = replyTo?.context.kind === 'reply' ? replyTo.context.root?.author.name ?? null : null;

  const discard = () => {
    deleteRecordingFiles(recording);
    setCurrentRecording(null);
    setDiscardAsk(false);
    router.dismissTo('/(tabs)');
  };

  const rerecord = () => {
    deleteRecordingFiles(recording);
    setCurrentRecording(null);
    router.replace({ pathname: '/record/[promptId]', params: { promptId: prompt.id, ...(replyTo ? { replyTo: replyTo.id } : {}) } });
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await posting.post({ recording, promptId: prompt.id, promptText: prompt.text, caption: caption.trim() || null, ticket: ticket.current, replyTo: replyTo ? { id: replyTo.id, name: replyTo.author.name.split(' ')[0] } : undefined });
      setCurrentRecording(null);
      router.dismissTo('/(tabs)');
    } catch (e) {
      console.error('post failed', e);
      setBusy(false);
    }
  };

  const onPost = async () => {
    if (busy) return;
    try {
      const acked = await disclosureAcknowledged();
      if (!acked) {
        setDisclosure(true);
        return;
      }
    } catch (e) {
      console.error('disclosure check failed', e);
      return;
    }
    await submit();
  };

  const onDisclosurePost = async () => {
    try {
      await acknowledgeDisclosure();
      setDisclosure(false);
      await submit();
    } catch (e) {
      console.error('acknowledge_disclosure failed', e);
    }
  };

  const localUri = recording.segments[0]?.uri;

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <VideoSurface playbackId={null} localUri={localUri} active={!discardAsk && !disclosure} loop onProgress={setProgress} />
      <VideoGradients top={240} bottom={330} topAlpha={0.55} bottomAlpha={0.7} />

      <View style={[s.header, { top: insets.top + 3 }]}>
        <GlassTool label="Discard" onPress={() => setDiscardAsk(true)}>
          <CloseIcon />
        </GlassTool>
        {replyTo ? (
          <View style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.yourResponseTo}>Your response to</Text>
            <Text style={s.promptText} numberOfLines={2}>{prompt.text}</Text>
          </View>
        )}
      </View>
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
          {!editing ? (
            <View style={s.buttons}>
              <Pressable accessibilityRole="button" onPress={rerecord} style={({ pressed }) => [s.rerecord, pressed && { opacity: 0.7 }]}>
                <Glass style={StyleSheet.absoluteFill} radius={26}>{null}</Glass>
                <RecordDotIcon />
                <Text style={s.rerecordText}>Re-record</Text>
              </Pressable>
              <Button title={replyTo ? 'Post reply' : 'Post'} variant="white" onPress={() => void onPost()} disabled={busy} style={{ flex: 1 }} />
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
              <Point icon={<PersonIcon size={16} />} title="Anyone on Shortcut can watch them" text="People can reply on video and share them. Responses can also get comments." />
              <Point icon={<ShareIcon size={16} color={colors.text} />} title="Shared links work on the web" text="Anyone with a link can watch, even without an account." />
              <Point icon={<CommentIcon size={16} color={colors.text} />} title="You stay in control" text="Delete any of your videos at any time." />
            </View>
            <Button title="Post" onPress={() => void onDisclosurePost()} disabled={busy} style={{ marginTop: 24 }} />
            <Button title="Go back" variant="text" onPress={() => setDisclosure(false)} style={{ marginTop: 6 }} textStyle={{ fontSize: 16 }} />
            <Text style={s.sheetNote}>Shown once, before your first public video: a response, a video reply or a published draft.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
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
