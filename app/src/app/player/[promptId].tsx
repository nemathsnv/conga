// Boards R-Player-2 / R-Player-3 (response player: swipe up for the next response to the
// same prompt, face strip, "2 of 23"), R-Player-End (end card) and X-Unavailable.
// SPEC.md Sections 4 and 6.
import { track } from '@/lib/analytics';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/api';
import { followUser, homeFeed, likeVideo, promptResponses, unfollowUser, unlikeVideo, type Conversation, type PromptCard, type ResponseCard } from '@/lib/content';
import { responsesLabel, timeAgo } from '@/lib/format';
import { Avatar, Glass } from '@/ui/components';
import { GlassPillButton, pillText, ProgressLine, RailAction, VideoGradients } from '@/ui/dark';
import { CheckIcon, ChevronLeft, ChevronRightIcon, ChevronUpIcon, CommentIcon, HeartIcon, MoreIcon, PlusSlotIcon, RecordDotIcon, ShareIcon, VideoReplyIcon } from '@/ui/Icons';
import { EmptyPrompt, Spinner } from '@/ui/HomeStates';
import { sheetOverPage } from '@/ui/playbackRules';
import { useOverlay } from '@/ui/playerOverlay';
import { Unavailable } from '@/ui/Unavailable';
import { useGoBack } from '@/ui/navigation';
import { colors, fontFamily, type } from '@/ui/theme';
import { VideoSurface } from '@/ui/VideoSurface';
import { thumbnailUrl } from '@/video/playback';
import { useOpenRecord } from '@/ui/recordEntry';

type Page = { kind: 'response'; response: ResponseCard } | { kind: 'end' } | { kind: 'empty' } | { kind: 'unavailable' };

export default function PlayerScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // `visited`: prompts already passed through in this chain of end cards, so the next conversation
  // never loops back to one of them.
  const { promptId, entry, visited, openComments, openReplies } = useLocalSearchParams<{ promptId: string; entry?: string; visited?: string; openComments?: string; openReplies?: string }>();
  const overlay = useOverlay();
  const openedSheet = useRef(false);
  const [prompt, setPrompt] = useState<PromptCard | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [nextConversation, setNextConversation] = useState<Conversation | null>(null);
  const list = useRef<FlatList<Page>>(null);
  const seen = useRef<string[]>([]);
  const left = useRef(false);
  // response_viewed: how long each response was on screen (SPEC.md Section 21).
  const viewing = useRef<{ id: string; position: number; since: number; durationMs: number } | null>(null);
  const endView = useCallback(() => {
    const v = viewing.current;
    if (!v) return;
    viewing.current = null;
    const watchMs = Date.now() - v.since;
    track('response_viewed', { response_id: v.id, prompt_id: promptId ?? '', position: v.position, surface: 'player', watch_ms: watchMs, completed: v.durationMs > 0 && watchMs >= v.durationMs });
  }, [promptId]);
  useEffect(() => endView, [endView]);

  const load = useCallback(async () => {
    if (!promptId) return;
    try {
      const data = await promptResponses(promptId, entry ?? null, seen.current);
      setPrompt(data.prompt);
      track('prompt_viewed', { prompt_id: data.prompt.id, scope: data.prompt.place ? 'place' : 'global', surface: 'player' });
      const next: Page[] = data.responses.map((r) => ({ kind: 'response', response: r }));
      if (entry && data.entry_status && data.entry_status !== 'live') next.unshift({ kind: 'unavailable' });
      // A prompt with no live responses is Z-Empty, not an end card (SPEC.md Section 20).
      next.push(next.length === 0 ? { kind: 'empty' } : { kind: 'end' });
      setPages(next);
    } catch (e) {
      console.error('prompt_responses failed', e);
      setPages([{ kind: 'unavailable' }, { kind: 'end' }]);
    }
  }, [promptId, entry]);

  useEffect(() => {
    void load();
  }, [load]);

  // Opened from Activity or a rail icon on Home: go straight to the sheet over the entry.
  useEffect(() => {
    if (!pages || openedSheet.current || !entry) return;
    if (openComments === '1') {
      openedSheet.current = true;
      router.push({ pathname: '/comments/[responseId]', params: { responseId: entry } });
    } else if (openReplies === '1') {
      openedSheet.current = true;
      router.push({ pathname: '/replies/[rootId]', params: { rootId: entry } });
    }
  }, [pages, entry, openComments, openReplies, router]);

  // The end card leads to the next conversation (SPEC.md Section 6): the next Home conversation
  // after this prompt. Loaded once so the card is drawn by the time the person reaches the end.
  useEffect(() => {
    if (!promptId) return;
    homeFeed([promptId, ...(visited ? visited.split(',') : [])], 1)
      .then((cards) => setNextConversation(cards[0] ?? null))
      .catch((e) => console.error('home_feed (next conversation) failed', e));
  }, [promptId, visited]);

  const openNextConversation = useCallback(() => {
    if (!nextConversation || left.current) return;
    left.current = true;
    router.replace({
      pathname: '/player/[promptId]',
      params: {
        promptId: nextConversation.prompt.id,
        visited: [...(visited ? visited.split(',') : []), promptId].join(','),
        ...(nextConversation.response ? { entry: nextConversation.response.id } : {}),
      },
    });
  }, [nextConversation, router, visited, promptId]);

  const responses = (pages ?? []).filter((p): p is Extract<Page, { kind: 'response' }> => p.kind === 'response');
  const total = prompt?.response_count ?? responses.length;
  const current = pages?.[index];
  const currentNumber = current?.kind === 'response' ? responses.findIndex((r) => r.response.id === current.response.id) + 1 : 0;
  // Comments keeps the response playing with its chrome hidden; Replies pauses and dims it.
  const sheet = sheetOverPage(overlay, current?.kind === 'response' ? current.response.id : null);

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<Page>[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first && typeof first.index === 'number') {
      setIndex(first.index);
      setProgress(0);
      endView();
      if (first.item.kind === 'response') {
        viewing.current = { id: first.item.response.id, position: first.index, since: Date.now(), durationMs: first.item.response.duration_ms ?? 0 };
        if (!seen.current.includes(first.item.response.id)) seen.current.push(first.item.response.id);
      } else if (first.item.kind === 'end') {
        track('player_end_reached', { prompt_id: promptId ?? '' });
      }
    }
  }, [endView, promptId]);

  const goTo = (i: number) => {
    track('player_jump', { prompt_id: promptId ?? '' });
    list.current?.scrollToIndex({ index: i, animated: true });
  };
  const advance = useCallback(() => {
    if (pages && index < pages.length - 1) list.current?.scrollToIndex({ index: index + 1, animated: true });
  }, [pages, index]);

  const header = (
    <View style={[s.header, { top: insets.top + 3 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => goBack()} style={s.back}>
        <ChevronLeft color={colors.white} />
      </Pressable>
      <Text style={s.headerPrompt} numberOfLines={2}>{prompt?.text ?? ''}</Text>
      {current?.kind === 'empty' ? null : (
      <Glass style={s.counter} radius={14}>
        {current?.kind === 'end' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <CheckIcon size={13} color={colors.white} />
            <Text style={s.counterText}>All {total}</Text>
          </View>
        ) : (
          <Text style={s.counterText}>
            {currentNumber || '–'}
            <Text style={s.counterOf}> of {total}</Text>
          </Text>
        )}
      </Glass>
      )}
    </View>
  );

  const strip = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.strip, { top: insets.top + 57 }]} contentContainerStyle={s.stripContent}>
      {responses.map((p, i) => {
        const playing = current?.kind === 'response' && current.response.id === p.response.id;
        const thumb = p.response.playback_id ? thumbnailUrl(p.response.playback_id, { width: 76, height: 100 }) : null;
        return (
          <Pressable key={p.response.id} accessibilityRole="button" accessibilityLabel={`${p.response.author.name.split(' ')[0]}, response ${i + 1}${playing ? ', playing' : ''}`} onPress={() => goTo((pages ?? []).indexOf(p))} style={{ width: playing ? 38 : 34 }}>
            <View style={[s.thumb, playing && s.thumbPlaying]}>
              {thumb ? <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
            </View>
            {playing ? (
              <View style={s.thumbProgress}>
                <View style={[s.thumbProgressFill, { width: `${progress * 100}%` }]} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
      {current?.kind === 'end' ? (
        <View style={s.yourSlot} accessibilityLabel="Your response goes here">
          <PlusSlotIcon />
        </View>
      ) : null}
    </ScrollView>
  );

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      {pages === null ? (
        <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
          <Spinner />
        </View>
      ) : (
        <FlatList
          ref={list}
          data={pages}
          keyExtractor={(p, i) => (p.kind === 'response' ? p.response.id : `${p.kind}-${i}`)}
          renderItem={({ item, index: i }) => (
            <View style={{ height }}>
              {item.kind === 'response' ? (
                <ResponsePage
                  response={item.response}
                  prompt={prompt}
                  active={i === index && sheet !== 'replies'}
                  chrome={!(i === index && sheet === 'comments')}
                  next={pages[i + 1]?.kind === 'response' ? (pages[i + 1] as Extract<Page, { kind: 'response' }>).response : null}
                  onProgress={setProgress}
                  onEnd={advance}
                  onNext={advance}
                />
              ) : item.kind === 'empty' ? (
                <SwipeUpToNext enabled={!!nextConversation} onNext={openNextConversation}>
                  {prompt ? <EmptyPrompt item={{ prompt, response: null }} next={nextConversation} topInset={insets.top} bottomSpace={Math.max(insets.bottom, 10)} /> : null}
                </SwipeUpToNext>
              ) : item.kind === 'end' ? (
                <EndCard
                  prompt={prompt}
                  total={total}
                  faces={responses.slice(-5).map((r) => r.response.author)}
                  background={responses.length ? responses[responses.length - 1].response.playback_id : null}
                  next={nextConversation}
                  onWatchAgain={() => goTo(0)}
                  onNextConversation={openNextConversation}
                />
              ) : (
                <Unavailable onNext={advance} onRetry={() => void load()} />
              )}
            </View>
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          windowSize={3}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
        />
      )}
      {sheet === 'comments' ? null : header}
      {pages && current?.kind !== 'empty' && sheet !== 'comments' ? strip : null}
      {sheet === 'replies' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.25)' }]} /> : null}
    </View>
  );
}

function ResponsePage({ response, prompt, active, chrome, next, onProgress, onEnd, onNext }: { response: ResponseCard; prompt: PromptCard | null; active: boolean; chrome: boolean; next: ResponseCard | null; onProgress: (f: number) => void; onEnd: () => void; onNext: () => void }) {
  const router = useRouter();
  const openRecord = useOpenRecord();
  const insets = useSafeAreaInsets();
  const [following, setFollowing] = useState(response.following_author);
  const [liked, setLiked] = useState(response.liked);
  const [likes, setLikes] = useState(response.like_count);
  const [progress, setProgress] = useState(0);
  // A video that fails to load shows X-Unavailable with its Try again (SPEC.md Section 20).
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const onFailed = useCallback(() => setFailed(true), []);
  const toggleLike = async () => {
    const nextValue = !liked;
    setLiked(nextValue);
    setLikes((n) => Math.max(0, n + (nextValue ? 1 : -1)));
    try {
      setLikes(nextValue ? await likeVideo(response.id) : await unlikeVideo(response.id));
    } catch {
      setLiked(!nextValue);
      setLikes((n) => Math.max(0, n + (nextValue ? -1 : 1)));
    }
  };
  const report = (f: number) => {
    setProgress(f);
    if (active) onProgress(f);
  };
  const toggleFollow = async () => {
    const nextValue = !following;
    setFollowing(nextValue);
    try {
      if (nextValue) await followUser(response.author.id, 'player');
      else await unfollowUser(response.author.id, 'player');
    } catch {
      setFollowing(!nextValue);
    }
  };
  const firstName = response.author.name.split(' ')[0];
  return (
    <View style={s.root}>
      <VideoSurface playbackId={response.playback_id} active={active && !failed} loop={false} onProgress={report} onEnd={onEnd} onFailed={onFailed} retryKey={retryKey} />
      {failed ? (
        <View style={StyleSheet.absoluteFill}>
          <Unavailable
            onNext={next ? onNext : undefined}
            onRetry={() => {
              setFailed(false);
              setRetryKey((k) => k + 1);
            }}
          />
        </View>
      ) : null}
      {!chrome || failed ? null : (
      <>
      <VideoGradients top={220} bottom={440} topAlpha={0.6} bottomAlpha={0.72} />
      <View style={[s.rail, { top: 392 }]}>
        <RailAction icon={<HeartIcon filled={liked} color={liked ? '#FF375F' : colors.white} />} count={likes} label={liked ? `Liked, ${likes}` : `Like, ${likes}`} onPress={() => void toggleLike()} />
        <RailAction icon={<CommentIcon />} count={response.comment_count} label="Comments" onPress={() => router.push({ pathname: '/comments/[responseId]', params: { responseId: response.id } })} />
        <RailAction icon={<VideoReplyIcon />} count={response.reply_count} label="Video replies" onPress={() => router.push({ pathname: '/replies/[rootId]', params: { rootId: response.id } })} />
        {response.is_own ? (
          <RailAction icon={<MoreIcon />} label="More" onPress={() => router.push({ pathname: '/safety', params: { flow: 'delete', kind: 'video', id: response.id, title: 'response' } })} />
        ) : (
          <RailAction
            icon={<ShareIcon />}
            label="Share"
            onPress={() =>
              router.push({ pathname: '/safety', params: { flow: 'share', kind: 'video', id: response.id, authorId: response.author.id, authorName: response.author.name, authorUsername: response.author.username, authorPhoto: response.author.photo_path ?? '', title: `${response.author.name} · ${prompt?.text ?? ''}` } })
            }
          />
        )}
      </View>
      <View style={[s.author, { bottom: 844 - 536 - 90 + Math.max(insets.bottom - 34, 0) }]}>
        <View style={s.authorRow}>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/profile/[id]', params: { id: response.author.id } })} style={s.authorRow}>
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
      <View style={[s.buttons, { bottom: 844 - 680 - 36 + Math.max(insets.bottom - 34, 0) }]}>
        <GlassPillButton label={`Reply to ${firstName}`} onPress={() => prompt && openRecord.open({ pathname: '/record/[promptId]', params: { promptId: prompt.id, replyTo: response.id } })}>
          <VideoReplyIcon size={17} />
          <Text style={pillText}>Reply to {firstName}</Text>
        </GlassPillButton>
        <GlassPillButton label="Respond" onPress={() => prompt && openRecord.open({ pathname: '/record/[promptId]', params: { promptId: prompt.id } })}>
          <RecordDotIcon />
          <Text style={pillText}>Respond</Text>
        </GlassPillButton>
      </View>
      <ProgressLine fraction={progress} style={{ position: 'absolute', left: 0, right: 0, bottom: 844 - 735 - 2 + Math.max(insets.bottom - 34, 0) }} />
      {next ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Next response: ${next.author.name}`} onPress={onNext} style={[s.next, { bottom: Math.max(insets.bottom, 10) + 26 }]}>
          <ChevronRightIcon color="rgba(255,255,255,0.86)" />
          <Avatar uri={avatarUrl(next.author.photo_path)} size={22} />
          <Text style={s.nextText}>
            Next · <Text style={{ fontWeight: '600', color: colors.white }}>{next.author.name}</Text>
          </Text>
        </Pressable>
      ) : null}
      </>
      )}
    </View>
  );
}

function EndCard({ prompt, total, faces, background, next, onWatchAgain, onNextConversation }: { prompt: PromptCard | null; total: number; faces: { id: string; photo_path: string | null }[]; background: string | null; next: Conversation | null; onWatchAgain: () => void; onNextConversation: () => void }) {
  const openRecord = useOpenRecord();
  const insets = useSafeAreaInsets();
  const lift = Math.max(insets.bottom - 34, 0);
  const nextThumb = next?.response?.playback_id ? thumbnailUrl(next.response.playback_id, { width: 80, height: 96 }) : null;
  return (
    <SwipeUpToNext enabled={!!next} onNext={onNextConversation}>
      {/* The last video, blurred, behind the card (board: blur 28, saturate 1.1, opacity 0.55). */}
      {background ? (
        <Image
          source={{ uri: thumbnailUrl(background, { width: 540, height: 1080 }) }}
          style={[StyleSheet.absoluteFill, { left: -40, top: -40, right: -40, bottom: -40, opacity: 0.55 }]}
          contentFit="cover"
          blurRadius={28}
          transition={200}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.55)' }]} />
      <View style={s.endBlock}>
        <View style={{ flexDirection: 'row' }}>
          {faces.map((f, i) => (
            <Avatar key={f.id + i} uri={avatarUrl(f.photo_path)} size={44} borderWidth={2} borderColor="#1A1A1C" style={i > 0 ? { marginLeft: -12 } : undefined} />
          ))}
        </View>
        <Text style={s.endTitle}>You&apos;ve seen all {total} responses.</Text>
        <Text style={s.endSub}>Add yours to the conversation.</Text>
        <Pressable accessibilityRole="button" onPress={() => prompt && openRecord.open({ pathname: '/record/[promptId]', params: { promptId: prompt.id } })} style={({ pressed }) => [s.endButton, pressed && { opacity: 0.8 }]}>
          <RecordDotIcon color={colors.black} />
          <Text style={s.endButtonText}>Add your response</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onWatchAgain} style={s.watchAgain}>
          <Text style={s.watchAgainText}>Watch again</Text>
        </Pressable>
      </View>
      {next ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Next conversation: ${next.prompt.text}`} onPress={onNextConversation} style={({ pressed }) => [{ position: 'absolute', left: 16, right: 16, bottom: 844 - 702 - 64 + lift }, pressed && { opacity: 0.8 }]}>
            <Glass style={s.nextCard} radius={16}>
              <View style={s.nextThumb}>{nextThumb ? <Image source={{ uri: nextThumb }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.nextCardSub}>Next conversation · {responsesLabel(next.prompt.response_count)}</Text>
                <Text style={s.nextCardTitle} numberOfLines={1}>
                  {next.prompt.text}
                </Text>
              </View>
              <ChevronUpIcon />
            </Glass>
          </Pressable>
          <Text style={[s.swipeHint, { bottom: 844 - 778 - 15 + lift }]}>Swipe up for the next conversation</Text>
        </>
      ) : null}
    </SwipeUpToNext>
  );
}

/**
 * Swipe up on the last page = the next conversation. The list has no page after it, so the
 * gesture is read from the raw touch on the page itself (on iOS the list only bounces; on
 * Android it does not move at all).
 */
function SwipeUpToNext({ enabled, onNext, children }: { enabled: boolean; onNext: () => void; children: ReactNode }) {
  const startY = useRef<number | null>(null);
  return (
    <View
      style={[s.root, { backgroundColor: '#0E0E10' }]}
      onTouchStart={(e) => {
        startY.current = e.nativeEvent.pageY;
      }}
      onTouchEnd={(e) => {
        if (enabled && startY.current !== null && startY.current - e.nativeEvent.pageY > 50) onNext();
        startY.current = null;
      }}
    >
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black },
  header: { position: 'absolute', left: 6, right: 16, height: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerPrompt: { flex: 1, ...type.semi15, lineHeight: 19, letterSpacing: -0.2, color: colors.white, fontFamily },
  counter: { marginLeft: 8, height: 28, paddingHorizontal: 11, justifyContent: 'center' },
  counterText: { ...type.caption13, fontWeight: '600', color: colors.white, fontFamily, fontVariant: ['tabular-nums'] },
  counterOf: { fontWeight: '400', color: 'rgba(255,255,255,0.7)' },
  strip: { position: 'absolute', left: 16, right: 0, height: 60 },
  stripContent: { gap: 6, alignItems: 'flex-start', paddingRight: 16 },
  thumb: { width: 34, height: 46, borderRadius: 8, overflow: 'hidden', opacity: 0.6, backgroundColor: 'rgba(255,255,255,0.14)' },
  thumbPlaying: { width: 38, height: 50, marginTop: -2, borderRadius: 10, opacity: 1, borderWidth: 2, borderColor: colors.white },
  thumbProgress: { marginTop: 6, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  thumbProgressFill: { height: 2, borderRadius: 1, backgroundColor: colors.white },
  yourSlot: { width: 38, height: 50, marginTop: -2, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center' },
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
  endBlock: { position: 'absolute', left: 24, right: 24, top: 300, alignItems: 'center' },
  endTitle: { marginTop: 20, fontSize: 28, lineHeight: 33, fontWeight: '600', letterSpacing: -0.6, color: colors.white, textAlign: 'center', fontFamily },
  endSub: { marginTop: 8, ...type.body16, lineHeight: 22, color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontFamily },
  endButton: { marginTop: 26, height: 50, paddingHorizontal: 26, borderRadius: 25, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 8 },
  endButtonText: { ...type.button16, letterSpacing: 0, color: colors.black, fontFamily },
  watchAgain: { marginTop: 10, height: 44, justifyContent: 'center' },
  watchAgainText: { ...type.medium15, color: 'rgba(255,255,255,0.82)', fontFamily },
  nextCard: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8, paddingRight: 14 },
  nextThumb: { width: 40, height: 48, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.14)' },
  nextCardSub: { ...type.caption12, color: 'rgba(255,255,255,0.7)', fontFamily },
  nextCardTitle: { ...type.semi15, color: colors.white, fontFamily },
  swipeHint: { position: 'absolute', left: 0, right: 0, textAlign: 'center', ...type.caption12, color: colors.white62, fontFamily },
});
