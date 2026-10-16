// Boards Activity and X-Activity-Empty (SPEC.md Section 15): New and This week, video replies
// first and largest, comments grouped, likes as one quiet line, no milestones.
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/api';
import { activityTarget, activityText, shortAgo } from '@/lib/activityLabels';
import { activityList, followUser, markActivityRead, type ActivityList, type ActivityRow } from '@/lib/content';
import { setUnread } from '@/ui/activityStore';
import { Avatar } from '@/ui/components';
import { Spinner } from '@/ui/HomeStates';
import { ActivityTabIcon, HeartIcon, PlacePinIcon, PlayIcon, RecordDotIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';
import { thumbnailUrl } from '@/video/playback';
import { useOpenRecord } from '@/ui/recordEntry';

export default function ActivityTab() {
  const router = useRouter();
  const openRecord = useOpenRecord();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ActivityList | null>(null);
  const [followedBack, setFollowedBack] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      activityList()
        .then(async (list) => {
          if (cancelled) return;
          setData(list);
          if (list.unread_count > 0) {
            await markActivityRead().catch(() => undefined);
            setUnread(0);
          }
        })
        .catch((e) => console.error('activity_list failed', e));
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const followBack = async (row: ActivityRow) => {
    if (!row.actor) return;
    setFollowedBack((s) => new Set(s).add(row.actor!.id));
    try {
      await followUser(row.actor.id, 'activity');
    } catch {
      setFollowedBack((s) => {
        const n = new Set(s);
        n.delete(row.actor!.id);
        return n;
      });
    }
  };

  const open = (row: ActivityRow) => {
    const target = activityTarget(row);
    if (target) router.push(target as never);
  };

  const rows = data?.rows ?? [];
  const fresh = rows.filter((r) => r.section === 'new');
  const week = rows.filter((r) => r.section === 'week');
  const tonight = data?.tonight ?? null;

  return (
    <View style={s.root}>
      {data === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner light={false} />
        </View>
      ) : rows.length === 0 ? (
        // Board X-Activity-Empty
        <View style={{ flex: 1 }}>
          <Text style={[s.h1, { marginTop: insets.top + 14 }]}>Activity</Text>
          <View style={s.emptyBlock}>
            <View style={s.emptyIcon}>
              <ActivityTabIcon color={colors.textTertiary} on={false} size={28} />
            </View>
            <Text style={s.emptyTitle}>Nothing here yet</Text>
            <Text style={s.emptyText}>When people reply to your responses, comment, or follow you, you&apos;ll see it here.</Text>
            {tonight ? (
              <>
                <Pressable accessibilityRole="button" onPress={() => openRecord.open({ pathname: '/record/[promptId]', params: { promptId: tonight.id } })} style={({ pressed }) => [s.tonightButton, pressed && { opacity: 0.8 }]}>
                  <RecordDotIcon />
                  <Text style={s.tonightText}>Respond to tonight&apos;s prompt</Text>
                </Pressable>
                <Text style={s.tonightPrompt}>{tonight.text}</Text>
              </>
            ) : null}
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          <Text style={[s.h1, { marginTop: insets.top + 14 }]}>Activity</Text>
          {fresh.length ? <Text style={s.section}>New</Text> : null}
          {fresh.map((row) => (
            <Row key={row.id} row={row} onOpen={() => open(row)} onFollowBack={() => void followBack(row)} followedBack={followedBack} />
          ))}
          {week.length ? <Text style={s.section}>This week</Text> : null}
          {week.map((row) => (
            <Row key={row.id} row={row} onOpen={() => open(row)} onFollowBack={() => void followBack(row)} followedBack={followedBack} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function Row({ row, onOpen, onFollowBack, followedBack }: { row: ActivityRow; onOpen: () => void; onFollowBack: () => void; followedBack: Set<string> }) {
  const text = activityText(row);
  const when = shortAgo(row.updated_at);
  const thumb = row.video?.playback_id ? thumbnailUrl(row.video.playback_id, { width: 80, height: 108 }) : null;

  if (row.kind === 'video_reply') {
    return (
      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [s.replyCard, pressed && { opacity: 0.8 }]}>
        <View style={s.replyThumb}>
          {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          <View style={s.replyThumbOverlay}>
            <PlayIcon size={18} />
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Avatar uri={avatarUrl(row.actor?.photo_path ?? null)} size={20} />
            <Text style={s.bold} numberOfLines={1}>
              {text.names}
            </Text>
            <Text style={s.time}>· {when}</Text>
          </View>
          <Text style={[s.text, { marginTop: 3 }]}>{text.rest}</Text>
          {text.quote ? (
            <Text style={s.quote} numberOfLines={1}>
              &ldquo;{text.quote}&rdquo;
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  }

  const tappable = row.kind !== 'like';
  const notice = row.kind === 'removed' || row.kind === 'restricted' || row.kind === 'suspended' || row.kind === 'review_outcome' || row.kind === 'suggestion_live' || row.kind === 'suggestion_declined';
  const placePrompt = row.kind === 'place_prompt';
  const leading =
    row.kind === 'comment' && row.actors.length > 1 ? (
      <View style={{ width: 44, height: 44 }}>
        <Avatar uri={avatarUrl(row.actors[0].photo_path)} size={32} style={{ position: 'absolute', left: 0, top: 0 }} />
        <Avatar uri={avatarUrl(row.actors[1].photo_path)} size={32} borderWidth={2} borderColor={colors.white} style={{ position: 'absolute', right: 0, bottom: 0 }} />
      </View>
    ) : row.kind === 'followed_responded' && row.actors.length > 1 ? (
      <View style={{ width: 44, flexDirection: 'row' }}>
        <Avatar uri={avatarUrl(row.actors[0].photo_path)} size={26} />
        <Avatar uri={avatarUrl(row.actors[1].photo_path)} size={26} borderWidth={2} borderColor={colors.white} style={{ marginLeft: -8 }} />
      </View>
    ) : row.kind === 'like' ? (
      <View style={s.likeCircle}>
        <HeartIcon size={20} color={colors.textTertiary} />
      </View>
    ) : notice ? (
      <View style={[s.likeCircle, { backgroundColor: colors.text }]}>
        <Text style={{ fontSize: 17, fontWeight: '700', color: colors.white, fontFamily }}>S</Text>
      </View>
    ) : placePrompt ? (
      <View style={[s.likeCircle, { borderRadius: 10 }]}>
        {row.prompt?.place?.image_path ? <Image source={{ uri: row.prompt.place.image_path }} style={[StyleSheet.absoluteFill, { borderRadius: 10 }]} contentFit="cover" /> : <PlacePinIcon size={18} color={colors.textSecondary} />}
      </View>
    ) : (
      <Avatar uri={avatarUrl(row.actor?.photo_path ?? null)} size={44} />
    );

  return (
    <Pressable accessibilityRole={tappable ? 'button' : undefined} onPress={tappable ? onOpen : undefined} style={({ pressed }) => [s.row, tappable && pressed && { opacity: 0.8 }]}>
      {leading}
      <Text style={[s.text, { flex: 1 }, row.kind === 'like' && { color: colors.textSecondary }]}>
        {placePrompt ? 'New prompt in ' : ''}
        {text.names ? <Text style={[s.bold, row.kind === 'like' && { color: colors.text }]}>{text.names}</Text> : null}
        {text.names ? (placePrompt ? ', ' : ' ') : ''}
        {text.rest}
        {row.kind === 'followed_responded' && row.prompt ? <Text style={s.bold}> {row.prompt.text}</Text> : null} <Text style={s.time}>· {when}</Text>
        {text.quote && row.kind !== 'followed_responded' ? (
          <Text style={s.quoteInline} numberOfLines={1}>
            {'\n'}
            {text.quote}
          </Text>
        ) : null}
      </Text>
      {row.kind === 'follow' && row.actor && !row.following_actor && !followedBack.has(row.actor.id) ? (
        <Pressable accessibilityRole="button" onPress={onFollowBack} style={({ pressed }) => [s.followBack, pressed && { opacity: 0.8 }]}>
          <Text style={s.followBackText}>Follow back</Text>
        </Pressable>
      ) : null}
      {(row.kind === 'comment' || row.kind === 'comment_reply') && thumb ? <Image source={{ uri: thumb }} style={s.rowThumb} contentFit="cover" /> : null}
      {placePrompt ? (
        <View style={s.respondPill}>
          <Text style={s.respondText}>Respond</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  h1: { marginHorizontal: 16, ...type.display34, letterSpacing: -0.8, color: colors.text, fontFamily },
  section: { paddingTop: 18, paddingHorizontal: 16, paddingBottom: 6, ...type.semi15, letterSpacing: -0.2, color: colors.text, fontFamily },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 16 },
  text: { ...type.body14, lineHeight: 19, color: colors.text, fontFamily },
  bold: { fontWeight: '600', color: colors.text },
  time: { color: colors.textTertiary },
  quote: { marginTop: 2, ...type.caption13, color: colors.textSecondary, fontFamily },
  quoteInline: { color: colors.textSecondary },
  rowThumb: { width: 40, height: 54, borderRadius: 7, backgroundColor: colors.separator },
  replyCard: { marginHorizontal: 12, marginTop: 2, marginBottom: 4, padding: 12, borderRadius: 16, backgroundColor: colors.fill, flexDirection: 'row', gap: 12, alignItems: 'center' },
  replyThumb: { width: 58, height: 78, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.separator },
  replyThumbOverlay: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
  likeCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  followBack: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.text, justifyContent: 'center' },
  followBackText: { ...type.semi14, color: colors.white, fontFamily },
  respondPill: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.fill, justifyContent: 'center' },
  respondText: { ...type.semi14, color: colors.text, fontFamily },
  emptyBlock: { position: 'absolute', left: 32, right: 32, top: 250, alignItems: 'center' },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 18, fontSize: 22, lineHeight: 27, fontWeight: '600', letterSpacing: -0.4, color: colors.text, textAlign: 'center', fontFamily },
  emptyText: { marginTop: 8, ...type.label15, lineHeight: 21, color: colors.textSecondary, textAlign: 'center', fontFamily },
  tonightButton: { marginTop: 24, height: 48, paddingHorizontal: 22, borderRadius: 24, backgroundColor: colors.text, flexDirection: 'row', alignItems: 'center', gap: 8 },
  tonightText: { ...type.semi15, color: colors.white, fontFamily },
  tonightPrompt: { marginTop: 10, ...type.caption13, color: colors.textTertiary, textAlign: 'center', fontFamily },
});
