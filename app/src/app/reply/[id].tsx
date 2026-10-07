// Boards Reply-Watch (a reply to the root), Reply-Watch-2 (a reply to a reply, flat in the
// root's room) and A-Orphan (the root response was deleted). SPEC.md Section 7.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/api';
import { followUser, getVideo, likeVideo, replyRoom, unfollowUser, unlikeVideo, type ResponseCard, type RoomReply, type Video } from '@/lib/content';
import { timeAgo } from '@/lib/format';
import { Avatar, Glass } from '@/ui/components';
import { GlassPillButton, pillText, ProgressLine, RailAction, VideoGradients } from '@/ui/dark';
import { Spinner } from '@/ui/HomeStates';
import { ChevronLeft, HeartIcon, MoreIcon, RecordDotIcon, ShareIcon, VideoReplyIcon } from '@/ui/Icons';
import { OrphanCard, ReplyCard } from '@/ui/ReplyCard';
import { colors, fontFamily, type } from '@/ui/theme';
import { VideoSurface } from '@/ui/VideoSurface';

type Page = RoomReply & { context?: Video['context'] };

export default function ReplyPlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [video, setVideo] = useState<Video | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const list = useRef<FlatList<Page>>(null);

  const load = useCallback(() => {
    if (!id) return Promise.resolve();
    return getVideo(id)
      .then(async (v) => {
        if ('status' in v && v.status === 'unavailable') {
          setUnavailable(true);
          return;
        }
        const full = v as Video;
        setVideo(full);
        if (full.context.kind === 'reply' && !full.context.root_deleted && full.root_response_id) {
          const room = await replyRoom(full.root_response_id);
          const start = Math.max(0, room.replies.findIndex((r) => r.id === full.id));
          setPages(room.replies);
          setIndex(start);
          setTimeout(() => list.current?.scrollToIndex({ index: start, animated: false }), 0);
        } else {
          // A-Orphan: the room is gone; this reply stands on its own (from a profile).
          setPages([{ ...full, reply_to_name: null, reply_to_deleted: full.context.kind === 'reply' && full.context.reply_to_deleted }]);
          setIndex(0);
        }
      })
      .catch((e) => {
        console.error('get_video failed', e);
        setUnavailable(true);
      });
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<Page>[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first && typeof first.index === 'number') {
      setIndex(first.index);
      setProgress(0);
    }
  }, []);
  const advance = useCallback(() => {
    if (pages && index < pages.length - 1) list.current?.scrollToIndex({ index: index + 1, animated: true });
  }, [pages, index]);

  const total = pages?.length ?? 0;
  const orphan = video?.context.kind === 'reply' && video.context.root_deleted;
  const rootAuthor = video?.context.kind === 'reply' ? video.context.root?.author ?? null : null;

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      {unavailable ? (
        <View style={[s.root, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }]}>
          <Text style={s.unavailableTitle}>This response isn&apos;t available</Text>
          <Text style={s.unavailableText}>It was deleted or removed.</Text>
        </View>
      ) : pages === null || video === null ? (
        <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
          <Spinner />
        </View>
      ) : (
        <FlatList
          ref={list}
          data={pages}
          keyExtractor={(p) => p.id}
          renderItem={({ item, index: i }) => (
            <View style={{ height }}>
              <ReplyPage
                reply={item}
                active={i === index}
                rootAuthor={rootAuthor}
                orphan={!!orphan}
                promptText={video.context.kind === 'reply' ? video.context.prompt_text : video.prompt.text}
                next={pages[i + 1] ?? null}
                onProgress={setProgress}
                onEnd={advance}
                onNext={advance}
              />
            </View>
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          windowSize={3}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
        />
      )}
      <View style={[s.header, { top: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={orphan ? 'Back' : 'Back to replies'} onPress={() => router.back()} style={s.back}>
          <ChevronLeft color={colors.white} />
        </Pressable>
        <Text style={s.headerTitle}>Video reply</Text>
        {!orphan && total > 0 ? (
          <Glass style={s.counter} radius={14}>
            <Text style={s.counterText}>
              {index + 1}
              <Text style={s.counterOf}> of {total}</Text>
            </Text>
          </Glass>
        ) : null}
      </View>
      {progress >= 0 ? null : null}
    </View>
  );
}

function ReplyPage({ reply, active, rootAuthor, orphan, promptText, next, onProgress, onEnd, onNext }: { reply: Page; active: boolean; rootAuthor: ResponseCard['author'] | null; orphan: boolean; promptText: string; next: Page | null; onProgress: (f: number) => void; onEnd: () => void; onNext: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [following, setFollowing] = useState(reply.following_author);
  const [liked, setLiked] = useState(reply.liked);
  const [likes, setLikes] = useState(reply.like_count);
  const [progress, setProgress] = useState(0);
  const [target, setTarget] = useState<Video | null>(null);
  const lift = Math.max(insets.bottom - 34, 0);

  // The card at the top: what this reply answers.
  useEffect(() => {
    if (!reply.reply_to_id || orphan) return;
    let cancelled = false;
    getVideo(reply.reply_to_id)
      .then((v) => {
        if (!cancelled && !('status' in v && v.status === 'unavailable')) setTarget(v as Video);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [reply.reply_to_id, orphan]);

  const report = (f: number) => {
    setProgress(f);
    if (active) onProgress(f);
  };
  const toggleFollow = async () => {
    const nextValue = !following;
    setFollowing(nextValue);
    try {
      if (nextValue) await followUser(reply.author.id);
      else await unfollowUser(reply.author.id);
    } catch {
      setFollowing(!nextValue);
    }
  };
  const toggleLike = async () => {
    const nextValue = !liked;
    setLiked(nextValue);
    setLikes((n) => Math.max(0, n + (nextValue ? 1 : -1)));
    try {
      setLikes(nextValue ? await likeVideo(reply.id) : await unlikeVideo(reply.id));
    } catch {
      setLiked(!nextValue);
      setLikes((n) => Math.max(0, n + (nextValue ? -1 : 1)));
    }
  };

  const firstName = reply.author.name.split(' ')[0];
  const rootFirst = rootAuthor?.name.split(' ')[0] ?? '';
  const replyToRoot = reply.reply_to_id === reply.root_response_id;
  const openTarget = () => {
    if (!target) return;
    if (target.kind === 'response') router.push({ pathname: '/player/[promptId]', params: { promptId: target.prompt_id, entry: target.id } });
    else router.push({ pathname: '/reply/[id]', params: { id: target.id } });
  };
  const openRoot = () => {
    if (reply.root_response_id && rootAuthor) router.push({ pathname: '/player/[promptId]', params: { promptId: reply.prompt_id, entry: reply.root_response_id } });
    else router.push({ pathname: '/player/[promptId]', params: { promptId: reply.prompt_id } });
  };

  return (
    <View style={s.root}>
      <VideoSurface playbackId={reply.playback_id} active={active} loop={false} onProgress={report} onEnd={onEnd} />
      <VideoGradients top={240} bottom={420} topAlpha={0.6} bottomAlpha={0.72} />
      <View style={[s.cardWrap, { top: insets.top + 57 }]}>
        {orphan ? (
          <OrphanCard promptText={promptText} onPress={openRoot} />
        ) : reply.reply_to_deleted ? (
          <ReplyCard kicker="Replying to a deleted video" name={null} caption={null} playbackId={null} sub={!replyToRoot && rootAuthor ? `In replies to ${rootAuthor.name}` : null} />
        ) : (
          <ReplyCard
            kicker="Replying to"
            name={target?.author.name ?? reply.reply_to_name ?? rootAuthor?.name ?? null}
            caption={target?.caption ?? null}
            captionLines={replyToRoot ? 2 : 1}
            sub={!replyToRoot && rootAuthor ? `In replies to ${rootAuthor.name}` : null}
            playbackId={target?.playback_id ?? null}
            onPress={openTarget}
            label={target ? `Open ${target.author.name.split(' ')[0]}'s ${target.kind === 'reply' ? 'reply' : 'response'}` : undefined}
          />
        )}
      </View>
      <View style={[s.rail, { top: 452 }]}>
        <RailAction icon={<HeartIcon filled={liked} color={liked ? '#FF375F' : colors.white} />} count={likes} label={liked ? `Liked, ${likes}` : `Like, ${likes}`} onPress={() => void toggleLike()} />
        {reply.is_own ? (
          <RailAction icon={<MoreIcon />} label="More" onPress={() => router.push({ pathname: '/safety', params: { flow: 'delete', kind: 'video', id: reply.id, title: 'reply' } })} />
        ) : (
          <RailAction
            icon={<ShareIcon />}
            label="Share"
            onPress={() =>
              router.push({ pathname: '/safety', params: { flow: 'share', kind: 'video', id: reply.id, authorId: reply.author.id, authorName: reply.author.name, authorUsername: reply.author.username, authorPhoto: reply.author.photo_path ?? '', title: `${reply.author.name} · ${promptText}` } })
            }
          />
        )}
      </View>
      <View style={[s.author, { top: 560 }]}>
        <View style={s.authorRow}>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/profile/[id]', params: { id: reply.author.id } })} style={s.authorRow}>
            <Avatar uri={avatarUrl(reply.author.photo_path)} size={34} borderWidth={1} borderColor="rgba(255,255,255,0.5)" />
            <Text style={s.authorName}>{reply.author.name}</Text>
          </Pressable>
          {reply.is_own ? null : following ? (
            <Pressable accessibilityRole="button" onPress={() => void toggleFollow()} hitSlop={6}>
              <Text style={s.followingText}>Following</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => void toggleFollow()} style={({ pressed }) => [s.followButton, pressed && { opacity: 0.7 }]}>
              <Text style={s.followText}>Follow</Text>
            </Pressable>
          )}
        </View>
        <Text style={s.time}>{timeAgo(reply.live_at)}</Text>
        {reply.caption ? <Text style={s.caption}>{reply.caption}</Text> : null}
      </View>
      <View style={[s.buttons, { bottom: 844 - 680 - 36 + lift }]}>
        <GlassPillButton label={orphan ? 'All responses' : `${rootFirst}'s response`} onPress={openRoot}>
          <RecordDotIcon />
          <Text style={pillText}>{orphan ? 'All responses' : `${rootFirst}'s response`}</Text>
        </GlassPillButton>
        <GlassPillButton label={`Reply to ${firstName}`} onPress={() => router.push({ pathname: '/record/[promptId]', params: { promptId: reply.prompt_id, replyTo: reply.id } })}>
          <VideoReplyIcon size={17} />
          <Text style={pillText}>Reply to {firstName}</Text>
        </GlassPillButton>
      </View>
      <ProgressLine fraction={progress} style={{ position: 'absolute', left: 0, right: 0, bottom: 844 - 735 - 2 + lift }} />
      {orphan ? (
        <Text style={[s.footer, { bottom: Math.max(insets.bottom, 10) + 26 }]}>From {firstName}&apos;s profile</Text>
      ) : next ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Next reply: ${next.author.name}`} onPress={onNext} style={[s.next, { bottom: Math.max(insets.bottom, 10) + 26 }]}>
          <Avatar uri={avatarUrl(next.author.photo_path)} size={22} />
          <Text style={s.nextText}>
            Next reply · <Text style={{ fontWeight: '600', color: colors.white }}>{next.author.name}</Text>
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  header: { position: 'absolute', left: 6, right: 16, height: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, ...type.semi15, letterSpacing: -0.2, color: colors.white, fontFamily },
  counter: { height: 28, paddingHorizontal: 11, justifyContent: 'center' },
  counterText: { ...type.caption13, fontWeight: '600', color: colors.white, fontFamily, fontVariant: ['tabular-nums'] },
  counterOf: { fontWeight: '400', color: 'rgba(255,255,255,0.7)' },
  cardWrap: { position: 'absolute', left: 16, right: 72 },
  rail: { position: 'absolute', right: 10, gap: 18, alignItems: 'center' },
  author: { position: 'absolute', left: 16, right: 78 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorName: { ...type.button16, letterSpacing: -0.2, color: colors.white, fontFamily },
  followButton: { height: 28, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', justifyContent: 'center' },
  followText: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: colors.white, fontFamily },
  followingText: { ...type.caption13, color: colors.white72, fontFamily },
  time: { ...type.caption13, marginTop: 8, color: 'rgba(255,255,255,0.82)', fontFamily },
  caption: { ...type.label15, lineHeight: 21, letterSpacing: -0.1, marginTop: 8, color: colors.white, fontFamily },
  buttons: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  next: { position: 'absolute', left: 0, right: 0, height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextText: { ...type.caption13, color: 'rgba(255,255,255,0.86)', fontFamily },
  footer: { position: 'absolute', left: 0, right: 0, height: 60, textAlign: 'center', textAlignVertical: 'center', paddingTop: 22, ...type.caption13, color: 'rgba(255,255,255,0.7)', fontFamily },
  unavailableTitle: { fontSize: 22, lineHeight: 27, fontWeight: '600', letterSpacing: -0.4, color: colors.white, textAlign: 'center', fontFamily },
  unavailableText: { marginTop: 8, ...type.label15, lineHeight: 21, color: 'rgba(255,255,255,0.75)', textAlign: 'center', fontFamily },
});
