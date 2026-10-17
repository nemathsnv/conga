// Home's non-video states: X-Loading, Z-Empty (prompt with no responses), X-Following-Empty,
// the posting banners PR-Posting / X-Upload-Failed, and A-Offline.
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { track } from '@/lib/analytics';
import { avatarUrl } from '@/lib/api';
import type { Conversation, FollowSuggestion } from '@/lib/content';
import { agoLabel, responsesLabel } from '@/lib/format';
import { Avatar, Button, Glass } from '@/ui/components';
import { RecordingStill } from '@/ui/RecordingStill';
import { useOpenRecord } from '@/ui/recordEntry';
import { ChevronRightIcon, OfflineIcon, PlacePinIcon, PlusSlotIcon, RecordDotIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';
import { thumbnailUrl } from '@/video/playback';
import type { PendingPost } from '@/video/pendingPostState';
import type { PostingState } from '@/video/posting';
import { uploadFailedDetail } from '@/video/postingFlow';
import { failedDetail, failedTitle, failedView, offlineDetail, postingTitle } from '@/ui/failedPost';

export function Spinner({ size = 28, light = true }: { size?: number; light?: boolean }) {
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2.5, borderColor: light ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', borderTopColor: light ? 'rgba(255,255,255,0.85)' : colors.text, transform: [{ rotate }] }}
    />
  );
}

/** Board X-Loading: placeholder shapes in the real layout and a spinner. */
export function HomeLoading({ topInset, bottomSpace }: { topInset: number; bottomSpace: number }) {
  return (
    <View style={[s.fill, { backgroundColor: '#0E0E10' }]}>
      <Glass style={[s.skPrompt, { top: topInset + 57 }]}>
        <View style={[s.sk, { width: 180, height: 11 }]} />
        <View style={[s.sk, { marginTop: 9, width: 74, height: 9 }]} />
      </Glass>
      <View style={[s.center, { top: 380 }]}>
        <Spinner />
      </View>
      <View style={[s.skRail, { top: 404 }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[s.sk, { width: 26, height: 26, borderRadius: 13 }]} />
        ))}
      </View>
      <View style={{ position: 'absolute', left: 16, bottom: bottomSpace + 120 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={[s.sk, { width: 34, height: 34, borderRadius: 17 }]} />
          <View style={[s.sk, { width: 120, height: 12 }]} />
        </View>
        <View style={[s.sk, { marginTop: 14, width: 260, height: 11 }]} />
        <View style={[s.sk, { marginTop: 8, width: 200, height: 11 }]} />
      </View>
    </View>
  );
}

/** Board Z-Empty: a prompt with no responses. */
export function EmptyPrompt({ item, next, topInset, bottomSpace }: { item: Conversation; next: Conversation | null; topInset: number; bottomSpace: number }) {
  const openRecord = useOpenRecord();
  const p = item.prompt;
  const nextThumb = next?.response?.playback_id ? thumbnailUrl(next.response.playback_id, { width: 80, height: 96 }) : null;
  return (
    <View style={[s.fill, { backgroundColor: '#0E0E10' }]}>
      <View style={[s.fill, { backgroundColor: 'rgba(10,10,12,0.5)' }]} />
      <View style={[s.emptyBlock, { top: topInset + 149 }]}>
        <View style={s.newPromptRow}>
          {p.place ? <PlacePinIcon size={13} color="rgba(255,255,255,0.72)" /> : null}
          <Text style={s.newPrompt}>{p.place ? `${p.place.name} · ` : ''}New prompt · {agoLabel(p.published_at)}</Text>
        </View>
        <Text style={s.emptyTitle}>{p.text}</Text>
        <View style={s.dash}>
          <PlusSlotIcon />
        </View>
        <Text style={s.noResponses}>No responses yet.</Text>
        <Pressable accessibilityRole="button" onPress={() => openRecord.open({ pathname: '/record/[promptId]', params: { promptId: p.id } })} style={({ pressed }) => [s.firstButton, pressed && { opacity: 0.8 }]}>
          <RecordDotIcon color={colors.black} />
          <Text style={s.firstButtonText}>Be the first to respond</Text>
        </Pressable>
        <Text style={s.upTo}>Up to 30 seconds</Text>
      </View>
      {next ? (
        <Glass style={[s.nextCard, { bottom: bottomSpace + 120 }]}>
          <View style={s.nextRow}>
            {nextThumb ? <Image source={{ uri: nextThumb }} style={s.nextThumb} contentFit="cover" /> : <View style={[s.nextThumb, { backgroundColor: 'rgba(255,255,255,0.14)' }]} />}
            <View style={{ flex: 1 }}>
              <Text style={s.nextKicker}>Keep watching · {responsesLabel(next.prompt.response_count)}</Text>
              <Text style={s.nextTitle} numberOfLines={1}>{next.prompt.text}</Text>
            </View>
            <ChevronRightIcon color="rgba(255,255,255,0.7)" />
          </View>
        </Glass>
      ) : null}
    </View>
  );
}

/** Board X-Following-Empty. */
export function FollowingEmpty({ suggestions, onFollow, onBack, topInset }: { suggestions: FollowSuggestion[]; onFollow: (id: string) => void; onBack: () => void; topInset: number }) {
  return (
    <View style={[s.fill, { backgroundColor: '#0E0E10' }]}>
      <View style={[s.fill, { backgroundColor: 'rgba(10,10,12,0.55)' }]} />
      <View style={{ position: 'absolute', left: 24, right: 24, top: topInset + 103, alignItems: 'center' }}>
        <Text style={s.followingTitle}>You&apos;re not following anyone yet</Text>
        <Text style={s.followingSub}>Follow people and their new responses show up here.</Text>
      </View>
      {suggestions.length > 0 ? (
        <View style={{ position: 'absolute', left: 16, right: 16, top: topInset + 243, gap: 8 }}>
          <Text style={s.suggestHead}>People responding to prompts you watched</Text>
          {suggestions.map((p) => (
            <Glass key={p.id} style={s.suggestCard}>
              <View style={s.suggestRow}>
                <Avatar uri={avatarUrl(p.photo_path)} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.suggestName}>{p.name}</Text>
                  <Text style={s.suggestSub} numberOfLines={1}>{responsesLabel(p.response_count)} · {p.prompt_text}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => onFollow(p.id)} style={({ pressed }) => [s.suggestFollow, pressed && { opacity: 0.7 }]}>
                  <Text style={s.suggestFollowText}>Follow</Text>
                </Pressable>
              </View>
            </Glass>
          ))}
        </View>
      ) : null}
      <Button title="Back to For you" variant="textOnDark" onPress={onBack} style={{ position: 'absolute', left: 0, right: 0, top: 640 }} textStyle={{ fontWeight: '600', color: colors.white }} />
    </View>
  );
}

/** Board A-Offline: the banner at the top of Home while the phone has no connection. */
export function OfflineBanner({ topInset, kind = null }: { topInset: number; kind?: PendingPost['kind'] | null }) {
  useEffect(() => {
    track('offline_shown');
  }, []);
  return (
    <Glass style={[s.banner, { top: topInset + 53 }]}>
      <View style={s.bannerRow} accessibilityLiveRegion="polite">
        <View style={s.offlineIcon}>
          <OfflineIcon />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.bannerTitle}>You&apos;re offline</Text>
          <Text style={s.bannerSub}>{offlineDetail(kind)}</Text>
        </View>
      </View>
    </Glass>
  );
}

/** Boards PR-Posting, X-Upload-Failed and P1 to P3, P5, P8-R: the banner at the top of Home. */
export function PostingBanner({ state, onRetry, onDiscard, busy = false, topInset }: { state: PostingState; onRetry: () => void; onDiscard: () => void; busy?: boolean; topInset: number }) {
  // 'waiting' (Post tapped offline) is drawn by A-Offline, not here.
  if (state.kind === 'idle' || state.kind === 'live' || state.kind === 'waiting') return null;
  const post = state.post;
  const thumb = post.recording.segments[0]?.uri;
  const failed = state.kind === 'failed';
  const view = failed ? failedView(post) : 'retry';
  const progress = state.kind === 'uploading' ? state.progress : state.kind === 'processing' ? 1 : 0;
  return (
    <Glass style={[s.banner, { top: topInset + 53 }]}>
      <View style={s.bannerRow} accessibilityLiveRegion="polite">
        <RecordingStill uri={thumb} style={s.bannerThumb} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {failed ? (
            <>
              <Text style={s.bannerTitle}>{failedTitle(post.kind, view)}</Text>
              <Text style={s.bannerSub}>{view === 'retry' ? uploadFailedDetail(post.failedReason) : failedDetail(view)}</Text>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={s.bannerTitle}>{postingTitle(post.kind)}</Text>
                <Text style={s.bannerPct}>{Math.round(progress * 100)}%</Text>
              </View>
              <View style={s.bannerTrack} accessible accessibilityRole="progressbar" accessibilityLabel="Upload progress" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
                <View style={[s.bannerFill, { width: `${progress * 100}%` }]} />
              </View>
              <Text style={s.bannerSub}>Keep Conga open until it&apos;s done.</Text>
            </>
          )}
        </View>
        {failed && view !== 'discarding' ? (
          <View style={s.bannerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Discard" disabled={busy} onPress={onDiscard} hitSlop={8} style={({ pressed }) => [s.discard, (pressed || busy) && { opacity: 0.6 }]}>
              <Text style={s.discardText}>Discard</Text>
            </Pressable>
            {view === 'retry' ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Retry" disabled={busy} onPress={onRetry} style={({ pressed }) => [s.retry, (pressed || busy) && { opacity: 0.7 }]}>
                <Text style={s.retryText}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </Glass>
  );
}

const s = StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  sk: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 6 },
  skPrompt: { position: 'absolute', left: 16, width: 236, height: 52, paddingHorizontal: 14, paddingVertical: 12 },
  skRail: { position: 'absolute', right: 22, gap: 28 },
  emptyBlock: { position: 'absolute', left: 28, right: 28, alignItems: 'center' },
  newPromptRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  newPrompt: { ...type.caption13, fontWeight: '500', color: colors.white72, fontFamily },
  emptyTitle: { marginTop: 12, fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8, color: colors.white, textAlign: 'center', fontFamily },
  dash: { marginTop: 34, width: 62, height: 82, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center' },
  noResponses: { marginTop: 14, ...type.body16, color: 'rgba(255,255,255,0.86)', fontFamily },
  firstButton: { marginTop: 20, height: 50, paddingHorizontal: 26, borderRadius: 25, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 8 },
  firstButtonText: { ...type.button16, letterSpacing: 0, color: colors.black, fontFamily },
  upTo: { marginTop: 10, ...type.caption13, color: colors.white62, fontFamily },
  offlineIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  nextCard: { position: 'absolute', left: 16, right: 16, height: 64, paddingLeft: 8, paddingRight: 14, justifyContent: 'center' },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextThumb: { width: 40, height: 48, borderRadius: 8 },
  nextKicker: { ...type.caption12, color: 'rgba(255,255,255,0.7)', fontFamily },
  nextTitle: { ...type.semi15, color: colors.white, fontFamily },
  followingTitle: { fontSize: 26, lineHeight: 30, fontWeight: '600', letterSpacing: -0.5, color: colors.white, textAlign: 'center', fontFamily },
  followingSub: { marginTop: 8, ...type.label15, lineHeight: 21, color: 'rgba(255,255,255,0.75)', textAlign: 'center', fontFamily },
  suggestHead: { paddingHorizontal: 4, paddingBottom: 2, ...type.caption13, fontWeight: '600', color: 'rgba(255,255,255,0.7)', fontFamily },
  suggestCard: { padding: 12 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  suggestName: { ...type.semi15, color: colors.white, fontFamily },
  suggestSub: { ...type.caption12, marginTop: 1, color: colors.white72, fontFamily },
  suggestFollow: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.white, justifyContent: 'center' },
  suggestFollowText: { ...type.semi14, color: colors.black, fontFamily },
  banner: { position: 'absolute', left: 12, right: 12, padding: 8, paddingRight: 12 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bannerThumb: { width: 40, height: 52, borderRadius: 8 },
  bannerTitle: { ...type.semi14, color: colors.white, fontFamily },
  bannerPct: { ...type.medium14, color: 'rgba(255,255,255,0.75)', fontFamily, fontVariant: ['tabular-nums'] },
  bannerTrack: { marginTop: 7, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  bannerFill: { height: 3, borderRadius: 2, backgroundColor: colors.white },
  bannerSub: { ...type.caption12, marginTop: 6, color: 'rgba(255,255,255,0.75)', fontFamily },
  bannerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  discard: { minHeight: 32, paddingHorizontal: 6, justifyContent: 'center' },
  discardText: { ...type.semi14, color: colors.white, fontFamily },
  retry: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.white, justifyContent: 'center' },
  retryText: { ...type.semi14, color: colors.black, fontFamily },
});
