// One conversation on Home (board Main): a prompt and one response, full screen, with the
// rail, author block, "N more responses" strip and Respond. Also draws Z-First for the
// person's own first response.
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/api';
import { followUser, likeVideo, unfollowUser, unlikeVideo, type Conversation } from '@/lib/content';
import { moreResponsesLabel, responsesLabel, timeAgo } from '@/lib/format';
import { Avatar, Glass } from '@/ui/components';
import { GlassPillButton, pillText, ProgressLine, PromptLabel, RailAction, VideoGradients } from '@/ui/dark';
import { ChevronRightIcon, CommentIcon, HeartIcon, MoreIcon, RecordDotIcon, ShareIcon, VideoReplyIcon } from '@/ui/Icons';
import { colors, fontFamily, layout, type } from '@/ui/theme';
import { VideoSurface } from '@/ui/VideoSurface';

export function ConversationView({ item, active, topInset }: { item: Conversation; active: boolean; topInset: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState(0);
  const [following, setFollowing] = useState(item.response?.following_author ?? false);
  const [liked, setLiked] = useState(item.response?.liked ?? false);
  const [likes, setLikes] = useState(item.response?.like_count ?? 0);
  const response = item.response!;
  const prompt = item.prompt;
  const isFirstOwn = response.is_own && prompt.response_count === 1;
  const tabBarSpace = layout.tabBarHeight - 34 + Math.max(insets.bottom, 8);

  const openPlayer = () => router.push({ pathname: '/player/[promptId]', params: { promptId: prompt.id, entry: response.id } });
  const openProfile = () => router.push({ pathname: '/profile/[id]', params: { id: response.author.id } });
  const respond = () => router.push({ pathname: '/record/[promptId]', params: { promptId: prompt.id } });
  const openComments = () => router.push({ pathname: '/player/[promptId]', params: { promptId: prompt.id, entry: response.id, openComments: '1' } });
  const openReplies = () => router.push({ pathname: '/player/[promptId]', params: { promptId: prompt.id, entry: response.id, openReplies: '1' } });

  const toggleLike = useCallback(async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      setLikes(next ? await likeVideo(response.id) : await unlikeVideo(response.id));
    } catch {
      setLiked(!next);
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
    }
  }, [liked, response.id]);

  const toggleFollow = useCallback(async () => {
    const next = !following;
    setFollowing(next);
    try {
      if (next) await followUser(response.author.id);
      else await unfollowUser(response.author.id);
    } catch (e) {
      setFollowing(!next);
      console.error('follow failed', e);
    }
  }, [following, response.author.id]);

  return (
    <View style={s.root}>
      <VideoSurface playbackId={response.playback_id} active={active} loop onProgress={setProgress} />
      <VideoGradients top={200} bottom={isFirstOwn ? 440 : 420} bottomAlpha={isFirstOwn ? 0.66 : 0.62} />

      <PromptLabel
        text={prompt.text}
        count={prompt.response_count}
        place={prompt.place}
        subtitle={isFirstOwn ? `${prompt.place ? `${prompt.place.name} · ` : ''}1 response · yours` : undefined}
        onPress={openPlayer}
        style={{ position: 'absolute', left: 16, top: topInset + 57 }}
      />

      <View style={[s.rail, { top: isFirstOwn ? 432 : 404 }]}>
        <RailAction icon={<HeartIcon filled={liked} color={liked ? '#FF375F' : colors.white} />} count={likes} label={liked ? `Liked, ${likes}` : `Like, ${likes}`} onPress={() => void toggleLike()} />
        <RailAction icon={<CommentIcon />} count={response.comment_count} label="Comments" onPress={openComments} />
        <RailAction icon={<VideoReplyIcon />} count={response.reply_count} label="Video replies" onPress={openReplies} />
        {/* More (Delete) and Share (share sheet) arrive in phase 5; drawn as on the board, inactive. */}
        {response.is_own ? <RailAction icon={<MoreIcon />} label="More" /> : <RailAction icon={<ShareIcon />} label="Share" />}
      </View>

      <View style={[s.author, { bottom: tabBarSpace + (isFirstOwn ? 150 : 90) + 44 + 32 }]}>
        <View style={s.authorRow}>
          <Pressable accessibilityRole="button" onPress={openProfile} style={s.authorPress}>
            <Avatar uri={avatarUrl(response.author.photo_path)} size={34} borderWidth={1} borderColor="rgba(255,255,255,0.5)" />
            <Text style={s.authorName}>{response.author.name}</Text>
          </Pressable>
          {response.is_own ? null : following ? (
            <Pressable accessibilityRole="button" onPress={() => void toggleFollow()} hitSlop={6}>
              <Text style={s.followingText}>Following</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => void toggleFollow()} style={({ pressed }) => [s.followButton, pressed && { opacity: 0.7 }]}>
              <Text style={s.followText}>Follow</Text>
            </Pressable>
          )}
        </View>
        <Text style={s.time}>{timeAgo(response.live_at)}</Text>
        {response.caption ? <Text style={s.caption}>{response.caption}</Text> : null}
      </View>

      {isFirstOwn ? (
        // Board Z-First
        <Glass style={[s.firstCard, { bottom: tabBarSpace + 90 + 14 }]}>
          <View style={s.firstRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.firstTitle}>You&apos;re the first response.</Text>
              <Text style={s.firstSub}>We&apos;ll let you know when people respond.</Text>
            </View>
            {/* "Ask someone" shares the prompt link: sharing arrives with phase 5. */}
            <View style={s.askButton}>
              <Text style={s.askText}>Ask someone</Text>
            </View>
          </View>
        </Glass>
      ) : (
        <View style={[s.bottomRow, { bottom: tabBarSpace + 90 + 10 }]}>
          <Pressable accessibilityRole="button" onPress={openPlayer} style={({ pressed }) => [s.more, pressed && { opacity: 0.7 }]}>
            <View style={{ flexDirection: 'row' }}>
              {prompt.faces.slice(0, 3).map((f, i) => (
                <Avatar key={f.id} uri={avatarUrl(f.photo_path)} size={24} borderWidth={1.5} borderColor="#1A1A1A" style={i > 0 ? { marginLeft: -7 } : undefined} />
              ))}
            </View>
            <Text style={s.moreText}>{moreResponsesLabel(prompt.response_count)}</Text>
            <ChevronRightIcon />
          </Pressable>
          <GlassPillButton label="Respond" onPress={respond}>
            <RecordDotIcon />
            <Text style={pillText}>Respond</Text>
          </GlassPillButton>
        </View>
      )}

      <ProgressLine fraction={progress} style={{ position: 'absolute', left: 0, right: 0, bottom: tabBarSpace + 15 }} />
      <Text style={s.hidden} accessibilityElementsHidden>{responsesLabel(prompt.response_count)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  rail: { position: 'absolute', right: 10, gap: 18, alignItems: 'center' },
  author: { position: 'absolute', left: 16, right: 78 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorPress: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorName: { ...type.button16, letterSpacing: -0.2, color: colors.white, fontFamily },
  followButton: { height: 28, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', justifyContent: 'center' },
  followText: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: colors.white, fontFamily },
  followingText: { ...type.caption13, color: colors.white72, fontFamily },
  time: { ...type.caption13, marginTop: 8, color: 'rgba(255,255,255,0.82)', fontFamily },
  caption: { ...type.label15, lineHeight: 21, letterSpacing: -0.1, marginTop: 8, color: colors.white, fontFamily },
  bottomRow: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  more: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  moreText: { ...type.medium14, color: 'rgba(255,255,255,0.92)', fontFamily },
  firstCard: { position: 'absolute', left: 16, right: 16, paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 10 },
  firstRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  firstTitle: { ...type.semi14, color: colors.white, fontFamily },
  firstSub: { ...type.caption12, marginTop: 1, color: colors.white72, fontFamily },
  askButton: { height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: colors.white, justifyContent: 'center' },
  askText: { ...type.semi14, color: colors.black, fontFamily },
  hidden: { position: 'absolute', opacity: 0, height: 0 },
});
