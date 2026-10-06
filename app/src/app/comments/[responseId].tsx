// Board Comments (the sheet over a playing response) and LV-CommentOwn (delete your own
// comment). SPEC.md Section 8. LV-CommentActions (Report, Block) is phase 5, so a long-press
// on someone else's comment does nothing yet.
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/api';
import { actorNames } from '@/lib/activityLabels';
import { commentsList, deleteComment, likeComment, postComment, unlikeComment, type CommentCard, type CommentsSheet, type CommentThread } from '@/lib/content';
import { useSession } from '@/lib/session';
import { Avatar } from '@/ui/components';
import { Spinner } from '@/ui/HomeStates';
import { CloseIcon, HeartIcon, VideoReplyIcon } from '@/ui/Icons';
import { useOverlayWhileMounted } from '@/ui/playerOverlay';
import { colors, fontFamily, type } from '@/ui/theme';
import { thumbnailUrl } from '@/video/playback';

const COMMENT_MAX = 300;

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function CommentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { responseId } = useLocalSearchParams<{ responseId: string }>();
  const { state } = useSession();
  const [sheet, setSheet] = useState<CommentsSheet | null>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentCard | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [own, setOwn] = useState<CommentCard | null>(null);
  const [sending, setSending] = useState(false);
  const input = useRef<TextInput>(null);
  useOverlayWhileMounted('comments');

  const load = useCallback(() => {
    if (!responseId) return Promise.resolve();
    return commentsList(responseId)
      .then(setSheet)
      .catch((e) => console.error('comments_list failed', e));
  }, [responseId]);
  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body || !responseId || sending) return;
    setSending(true);
    try {
      const card = await postComment(responseId, body, replyTo ? (replyTo.thread_id ?? replyTo.id) : null);
      setText('');
      setReplyTo(null);
      setSheet((cur) => {
        if (!cur) return cur;
        if (!card.thread_id) return { ...cur, count: cur.count + 1, comments: [...cur.comments, card] };
        return { ...cur, count: cur.count + 1, comments: cur.comments.map((c) => (c.id === card.thread_id ? { ...c, replies: [...c.replies, card] } : c)) };
      });
      if (card.thread_id) setExpanded((e) => new Set(e).add(card.thread_id as string));
    } catch (e) {
      console.error('post_comment failed', e);
    } finally {
      setSending(false);
    }
  };

  const toggleLike = async (c: CommentCard) => {
    const next = !c.liked;
    const patch = (x: CommentCard) => (x.id === c.id ? { ...x, liked: next } : x);
    setSheet((cur) => (cur ? { ...cur, comments: cur.comments.map((t) => ({ ...patch(t), replies: t.replies.map(patch) })) } : cur));
    try {
      if (next) await likeComment(c.id);
      else await unlikeComment(c.id);
    } catch {
      void load();
    }
  };

  const remove = async () => {
    if (!own) return;
    try {
      await deleteComment(own.id);
      setOwn(null);
      void load();
    } catch (e) {
      console.error('delete_comment failed', e);
    }
  };

  const videoReply = (replyToId: string) => {
    if (!sheet) return;
    router.replace({ pathname: '/record/[promptId]', params: { promptId: sheet.response.prompt_id, replyTo: replyToId } });
  };

  const sheetTop = Math.round(height * (250 / 844));
  const author = sheet?.response.author;
  const vr = sheet?.video_replies;
  const faceNames = vr ? actorNames({ actors: vr.faces.slice(0, 2), actor_count: vr.faces.length, actor: null }) : '';

  const renderComment = (c: CommentCard, thread: CommentThread | null) => (
    <Pressable key={c.id} onLongPress={() => (c.is_own ? setOwn(c) : undefined)} delayLongPress={350} style={[s.cm, thread && s.cmReply]}>
      <Avatar uri={avatarUrl(c.author.photo_path)} size={thread ? 26 : 34} />
      <View style={{ flex: 1 }}>
        <Text style={s.nameLine}>
          <Text style={s.name}>{c.author.name}</Text>
          {c.is_author ? <Text style={s.authorTag}> Author</Text> : null}
          <Text style={s.time}> · {ago(c.created_at)}</Text>
        </Text>
        <Text style={s.body}>{c.body}</Text>
        <View style={s.actions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setReplyTo(c);
              input.current?.focus();
            }}
            hitSlop={6}
          >
            <Text style={s.action}>Reply</Text>
          </Pressable>
          {!thread && (c as CommentThread).replies.length > 0 && !expanded.has(c.id) ? (
            <Pressable accessibilityRole="button" onPress={() => setExpanded((e) => new Set(e).add(c.id))} hitSlop={6}>
              <Text style={s.action}>View {(c as CommentThread).replies.length} {(c as CommentThread).replies.length === 1 ? 'reply' : 'replies'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={c.liked ? 'Liked' : 'Like'} onPress={() => void toggleLike(c)} style={s.like} hitSlop={6}>
        <HeartIcon size={18} color={c.liked ? '#FF375F' : '#C7C7CC'} filled={c.liked} />
      </Pressable>
    </Pressable>
  );

  return (
    <View style={s.root}>
      {/* Over the playing video: who and what (the player hides its own chrome meanwhile). */}
      <Pressable style={[StyleSheet.absoluteFill, { bottom: height - sheetTop }]} onPress={() => router.back()} accessibilityLabel="Close comments" />
      {author ? (
        <View pointerEvents="none" style={[s.topLine, { top: insets.top + 8 }]}>
          <Avatar uri={avatarUrl(author.photo_path)} size={22} />
          <Text style={s.topName} numberOfLines={1}>
            {author.name}
            <Text style={s.topPrompt}> · {sheet?.prompt_text ?? ''}</Text>
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.sheet, { top: sheetTop }]}>
        <View style={s.handle} />
        <View style={s.titleRow}>
          <Text style={s.title}>{sheet ? `${sheet.count} ${sheet.count === 1 ? 'comment' : 'comments'}` : ''}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close comments" onPress={() => router.back()} style={s.close}>
            <CloseIcon size={20} color={colors.textTertiary} />
          </Pressable>
        </View>
        {sheet === null ? (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Spinner light={false} />
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 90 }}>
            {vr && vr.count > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/replies/[rootId]', params: { rootId: sheet.response.id } })} style={({ pressed }) => [s.roomCard, pressed && { opacity: 0.8 }]}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {vr.thumbnails.map((pb, i) => (
                    <View key={pb + i} style={s.roomThumb}>
                      <Image source={{ uri: thumbnailUrl(pb, { width: 92, height: 124 }) }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.roomTitle}>{vr.count} video {vr.count === 1 ? 'reply' : 'replies'}</Text>
                  <Text style={s.roomSub}>{faceNames}</Text>
                </View>
              </Pressable>
            ) : null}
            <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
              {sheet.comments.map((t) => (
                <View key={t.id}>
                  {renderComment(t, null)}
                  {expanded.has(t.id) ? t.replies.map((r) => renderComment(r, t)) : null}
                </View>
              ))}
            </View>
          </ScrollView>
        )}
        <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 10) + 8 }]}>
          <Avatar uri={avatarUrl(state?.profile?.photo_path ?? null)} size={32} />
          <TextInput
            ref={input}
            style={s.input}
            value={text}
            onChangeText={(v) => setText(v.slice(0, COMMENT_MAX))}
            placeholder={replyTo ? `Reply to ${replyTo.author.name.split(' ')[0]}` : 'Add a comment'}
            placeholderTextColor={colors.textTertiary}
            maxLength={COMMENT_MAX}
            returnKeyType="send"
            onSubmitEditing={() => void send()}
            onBlur={() => {
              if (!text) setReplyTo(null);
            }}
            accessibilityLabel="Add a comment"
            editable={!sending}
          />
          <Pressable accessibilityRole="button" accessibilityLabel={author ? `Reply to ${author.name.split(' ')[0]} with video` : 'Video'} onPress={() => sheet && videoReply(sheet.response.id)} style={({ pressed }) => [s.videoButton, pressed && { opacity: 0.8 }]}>
            <VideoReplyIcon size={16} />
            <Text style={s.videoText}>Video</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Board LV-CommentOwn */}
      <Modal visible={own !== null} transparent animationType="fade" onRequestClose={() => setOwn(null)}>
        <Pressable style={s.dim} onPress={() => setOwn(null)}>
          <View style={[s.sheetWrap, { paddingBottom: Math.max(insets.bottom, 10) + 24 }]}>
            <View style={s.actionSheet}>
              <View style={s.actionHead}>
                <Text style={s.actionTitle}>Your comment</Text>
                <Text style={s.actionSub} numberOfLines={3}>
                  &ldquo;{own?.body}&rdquo;
                </Text>
                <Text style={[s.actionSub, { marginTop: 6 }]}>Deleting can&apos;t be undone.</Text>
              </View>
              <View style={s.actionSep} />
              <Pressable accessibilityRole="button" onPress={() => void remove()} style={({ pressed }) => [s.actionRow, pressed && { opacity: 0.6 }]}>
                <Text style={s.actionDestructive}>Delete comment</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setOwn(null)} style={({ pressed }) => [s.actionCancel, pressed && { opacity: 0.6 }]}>
              <Text style={s.actionCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  topLine: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  topName: { flex: 1, ...type.caption13, fontWeight: '600', color: colors.white, fontFamily },
  topPrompt: { fontWeight: '400', color: 'rgba(255,255,255,0.75)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  handle: { alignSelf: 'center', marginTop: 6, width: 36, height: 5, borderRadius: 3, backgroundColor: colors.separator },
  titleRow: { height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.button16, letterSpacing: -0.2, color: colors.text, fontFamily },
  close: { position: 'absolute', right: 6, top: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  roomCard: { marginHorizontal: 16, marginTop: 2, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.fill, flexDirection: 'row', alignItems: 'center', gap: 10 },
  roomThumb: { width: 46, height: 62, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.separator },
  roomTitle: { ...type.semi15, color: colors.text, fontFamily },
  roomSub: { ...type.caption13, color: colors.textSecondary, fontFamily },
  cm: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  cmReply: { paddingLeft: 44, paddingTop: 2 },
  nameLine: { ...type.caption13, color: colors.text, fontFamily },
  name: { fontWeight: '600' },
  authorTag: { fontSize: 11, fontWeight: '500', color: colors.textSecondary, backgroundColor: colors.fill },
  time: { color: colors.textTertiary },
  body: { marginTop: 2, ...type.label15, lineHeight: 20, color: colors.text, fontFamily },
  actions: { marginTop: 5, flexDirection: 'row', gap: 16 },
  action: { ...type.caption13, fontWeight: '500', color: colors.textTertiary, fontFamily },
  like: { width: 32, alignItems: 'center', paddingTop: 6 },
  inputBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 8, paddingHorizontal: 12, backgroundColor: colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, height: 38, borderRadius: 19, backgroundColor: colors.fill, color: colors.text, paddingHorizontal: 14, ...type.label15, fontFamily },
  videoButton: { height: 38, paddingLeft: 10, paddingRight: 12, borderRadius: 19, backgroundColor: colors.text, flexDirection: 'row', alignItems: 'center', gap: 6 },
  videoText: { ...type.semi14, color: colors.white, fontFamily },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 8 },
  actionSheet: { borderRadius: 14, backgroundColor: 'rgba(249,249,249,0.96)', overflow: 'hidden' },
  actionHead: { paddingTop: 14, paddingBottom: 12, paddingHorizontal: 20, alignItems: 'center' },
  actionTitle: { ...type.caption13, fontWeight: '600', color: colors.textSecondary, fontFamily },
  actionSub: { ...type.caption13, lineHeight: 18, marginTop: 3, color: colors.textTertiary, textAlign: 'center', fontFamily },
  actionSep: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(60,60,67,0.29)' },
  actionRow: { height: 57, alignItems: 'center', justifyContent: 'center' },
  actionDestructive: { fontSize: 20, color: colors.dangerBorder, fontFamily },
  actionCancel: { marginTop: 8, height: 57, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  actionCancelText: { fontSize: 20, fontWeight: '600', color: '#007AFF', fontFamily },
});
