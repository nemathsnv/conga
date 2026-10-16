// Board Replies: the video reply room for one response (SPEC.md Section 7). A sheet over the
// paused response; a two-column grid; "Reply to [root author]" last.
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/api';
import { replyRoom, type ReplyRoom } from '@/lib/content';
import { Avatar } from '@/ui/components';
import { Spinner } from '@/ui/HomeStates';
import { CloseIcon, VideoReplyIcon } from '@/ui/Icons';
import { useOverlayWhileMounted } from '@/ui/playerOverlay';
import { useGoBack } from '@/ui/navigation';
import { colors, fontFamily, type } from '@/ui/theme';
import { formatTimer } from '@/video/limits';
import { thumbnailUrl } from '@/video/playback';

export default function RepliesScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { rootId } = useLocalSearchParams<{ rootId: string }>();
  const [room, setRoom] = useState<ReplyRoom | null>(null);
  useOverlayWhileMounted('replies');

  const load = useCallback(() => {
    if (!rootId) return Promise.resolve();
    return replyRoom(rootId)
      .then(setRoom)
      .catch((e) => console.error('reply_room failed', e));
  }, [rootId]);
  useEffect(() => {
    void load();
  }, [load]);

  const sheetTop = Math.round(height * (96 / 844));
  const tile = (width - 32 - 8) / 2;
  const root = room?.root ?? null;
  const first = root?.author.name.split(' ')[0] ?? '';

  const record = () => {
    if (!root) return;
    router.replace({ pathname: '/record/[promptId]', params: { promptId: root.prompt_id, replyTo: root.id } });
  };

  return (
    <View style={s.root}>
      <Pressable style={[StyleSheet.absoluteFill, { bottom: height - sheetTop }]} onPress={() => goBack()} accessible={false} />
      <View style={[s.sheet, { top: sheetTop }]}>
        <View style={s.handle} />
        <View style={s.titleRow}>
          <Text style={s.title}>{room ? `${room.count} video ${room.count === 1 ? 'reply' : 'replies'}` : ''}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => goBack()} style={s.close}>
            <CloseIcon size={20} color={colors.textTertiary} />
          </Pressable>
        </View>
        {room === null ? (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Spinner light={false} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 10) + 20 }}>
            {root ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`${root.author.name}'s response`} onPress={() => goBack()} style={({ pressed }) => [s.rootRow, pressed && { opacity: 0.8 }]}>
                <View style={s.rootThumb}>{root.playback_id ? <Image source={{ uri: thumbnailUrl(root.playback_id, { width: 88, height: 116 }) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rootKicker}>
                    Replies to <Text style={s.rootName}>{root.author.name}</Text>
                  </Text>
                  {root.caption ? (
                    <Text style={s.rootCaption} numberOfLines={2}>
                      &ldquo;{root.caption}&rdquo;
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ) : null}
            <View style={s.sep} />
            <View style={s.grid}>
              {room.replies.map((r) => (
                <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`${r.author.name}'s reply`} onPress={() => router.push({ pathname: '/reply/[id]', params: { id: r.id } })} style={[s.tile, { width: tile }]}>
                  {r.playback_id ? <Image source={{ uri: thumbnailUrl(r.playback_id, { width: 360, height: 428 }) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                  <Text style={s.duration}>{formatTimer(r.duration_ms)}</Text>
                  <View style={s.cap}>
                    {r.reply_to_name || r.reply_to_deleted ? <Text style={s.ctx}>{r.reply_to_deleted ? 'Replying to a deleted video' : `Replying to ${r.reply_to_name?.split(' ')[0]}`}</Text> : null}
                    <View style={s.who}>
                      <Avatar uri={avatarUrl(r.author.photo_path)} size={20} />
                      <Text style={s.whoText} numberOfLines={1}>
                        {r.author.name}
                      </Text>
                    </View>
                    {r.caption ? (
                      <Text style={s.q} numberOfLines={2}>
                        {r.caption}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
              {root ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Reply to ${first} with video`} onPress={record} style={({ pressed }) => [s.tile, s.recordTile, { width: tile }, pressed && { opacity: 0.8 }]}>
                  <View style={s.recordCircle}>
                    <VideoReplyIcon size={24} />
                  </View>
                  <Text style={s.recordTitle}>Reply to {first}</Text>
                  <Text style={s.recordSub}>On video, up to 30 seconds</Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  handle: { alignSelf: 'center', marginTop: 6, width: 36, height: 5, borderRadius: 3, backgroundColor: colors.separator },
  titleRow: { height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.button16, letterSpacing: -0.2, color: colors.text, fontFamily },
  close: { position: 'absolute', right: 6, top: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rootRow: { marginHorizontal: 16, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rootThumb: { width: 44, height: 58, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.separator },
  rootKicker: { ...type.caption13, color: colors.textSecondary, fontFamily },
  rootName: { color: colors.text, fontWeight: '600' },
  rootCaption: { marginTop: 2, ...type.label15, lineHeight: 20, color: colors.text, fontFamily },
  sep: { marginHorizontal: 16, marginTop: 14, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  grid: { paddingHorizontal: 16, paddingTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { height: 214, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.separator },
  duration: { position: 'absolute', right: 8, top: 8, fontSize: 11, fontWeight: '600', color: colors.white, fontFamily, fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  cap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 30, paddingHorizontal: 10, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.45)' },
  ctx: { marginBottom: 5, fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.82)', fontFamily },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whoText: { flex: 1, ...type.caption13, fontWeight: '600', color: colors.white, fontFamily },
  q: { marginTop: 4, ...type.caption12, lineHeight: 16, color: 'rgba(255,255,255,0.88)', fontFamily },
  recordTile: { backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  recordCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  recordTitle: { ...type.semi15, color: colors.text, fontFamily },
  recordSub: { ...type.caption13, lineHeight: 17, color: colors.textSecondary, textAlign: 'center', fontFamily },
});
