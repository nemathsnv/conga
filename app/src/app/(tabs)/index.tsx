// Board Main: Home, one conversation at a time, swipe up for the next prompt (For you) or
// the next response from someone you follow (Following). SPEC.md Section 4.
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Modal, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useSafeAreaInfo } from '@/ui/safeArea';

import { followSuggestions, followUser, followingFeed, getNotificationState, homeFeed, type Conversation, type FollowSuggestion } from '@/lib/content';
import { track } from '@/lib/analytics';
import { useOnline } from '@/lib/connectivity';
import { shouldAsk } from '@/lib/notificationAsk';
import { takeFeedDirty } from '@/ui/feedStore';
import { ActionSheet } from '@/ui/ActionSheet';
import { ConversationView } from '@/ui/ConversationView';
import { DISCARD_SHEET, REACHED_SHORTCUT_SHEET, discardOutcome } from '@/ui/failedPost';
import { FeedHeader } from '@/ui/dark';
import { EmptyPrompt, FollowingEmpty, HomeLoading, OfflineBanner, PostingBanner } from '@/ui/HomeStates';
import { usePosting } from '@/video/posting';

type Tab = 'following' | 'foryou';

export default function HomeTab() {
  const { height } = useWindowDimensions();
  const { top, bottomSpace } = useSafeAreaInfo();
  const posting = usePosting();
  const online = useOnline();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('foryou');
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(true);
  const [suggestions, setSuggestions] = useState<FollowSuggestion[]>([]);
  const seen = useRef<string[]>([]);
  const loading = useRef(false);
  // P4 (Discard confirmation) and P6 (it already reached Shortcut). While a Discard runs ('running')
  // the banner's buttons wait; once it has answered ('done') the posting state tells the outcome,
  // for that recording only (a later recording that processes is not P6).
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discard, setDiscard] = useState<{ status: 'idle' | 'running' | 'done'; recordingId: string | null }>({ status: 'idle', recordingId: null });
  const reachedShortcut = discard.status === 'done' && discardOutcome(posting.state) === 'reached_shortcut' && posting.state.kind === 'processing' && posting.state.post.recording.id === discard.recordingId;
  const viewing = useRef<{ id: string; promptId: string; position: number; since: number; durationMs: number } | null>(null);
  const endView = useCallback(() => {
    const v = viewing.current;
    if (!v) return;
    viewing.current = null;
    const watchMs = Date.now() - v.since;
    track('response_viewed', { response_id: v.id, prompt_id: v.promptId, position: v.position, surface: 'home', watch_ms: watchMs, completed: v.durationMs > 0 && watchMs >= v.durationMs });
  }, []);

  const runDiscard = () => {
    setConfirmDiscard(false);
    const recordingId = posting.state.kind === 'failed' ? posting.state.post.recording.id : null;
    setDiscard({ status: 'running', recordingId });
    posting
      .discardFailed()
      .catch((e) => console.error('discard failed', e))
      .then(() => setDiscard({ status: 'done', recordingId }));
  };

  const load = useCallback(async (which: Tab, reset: boolean) => {
    if (loading.current) return;
    loading.current = true;
    try {
      if (which === 'foryou') {
        const exclude = reset ? [] : seen.current;
        const page = await homeFeed(exclude, 10);
        setItems((prev) => (reset || !prev ? page : [...prev, ...page.filter((c) => !prev.some((p) => p.prompt.id === c.prompt.id))]));
      } else {
        const page = await followingFeed(null, 20);
        setItems(page);
        if (page.length === 0) setSuggestions(await followSuggestions(seen.current));
      }
    } catch (e) {
      console.error('feed failed', e);
      setItems((prev) => prev ?? []);
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    void load('foryou', true);
  }, [load]);

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    setItems(null);
    setIndex(0);
    void load(next, true);
  };

  // A finished post refreshes the feed so the new response appears (Z-First).
  useEffect(() => {
    if (posting.state.kind === 'live') {
      posting.dismiss();
      seen.current = [];
      void load(tab, true);
      // N-Prime: right after the person's first public video posts (SPEC.md Section 15).
      getNotificationState()
        .then(({ ask }) => {
          if (shouldAsk(ask, 'first_post')) router.push({ pathname: '/notifications/prime', params: { ask: '1' } });
        })
        .catch(() => undefined);
    }
  }, [posting.state.kind, posting, load, tab, router]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      if (takeFeedDirty()) {
        // Something was reported, blocked or deleted: the feed must not show it again.
        seen.current = [];
        setItems(null);
        setIndex(0);
        void load(tab, true);
      }
      return () => {
        setFocused(false);
        endView();
      };
    }, [load, tab, endView]),
  );

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<Conversation>[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first && typeof first.index === 'number') {
      setIndex(first.index);
      const id = first.item.prompt.id;
      if (!seen.current.includes(id)) {
        seen.current.push(id);
        track('prompt_viewed', { prompt_id: id, scope: first.item.prompt.place ? 'place' : 'global', surface: 'home' });
      }
      endView();
      if (first.item.response) viewing.current = { id: first.item.response.id, promptId: id, position: first.index, since: Date.now(), durationMs: first.item.response.duration_ms ?? 0 };
    }
  }, [endView]);

  const onEndReached = () => {
    if (tab === 'foryou' && items && items.length > 0) void load('foryou', false);
  };

  const follow = async (id: string) => {
    try {
      await followUser(id, 'suggestion');
      setSuggestions((s) => s.filter((x) => x.id !== id));
      void load('following', true);
    } catch (e) {
      console.error('follow failed', e);
    }
  };

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      {items === null ? (
        <HomeLoading topInset={top} bottomSpace={bottomSpace} />
      ) : tab === 'following' && items.length === 0 ? (
        <FollowingEmpty suggestions={suggestions} onFollow={(id) => void follow(id)} onBack={() => switchTab('foryou')} topInset={top} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.prompt.id + (c.response?.id ?? '')}
          renderItem={({ item, index: i }) =>
            item.response ? (
              <View style={{ height }}>
                <ConversationView item={item} active={focused && i === index} topInset={top} />
              </View>
            ) : (
              <View style={{ height }}>
                <EmptyPrompt item={item} next={items[i + 1] ?? null} topInset={top} bottomSpace={bottomSpace} />
              </View>
            )
          }
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onEndReachedThreshold={2}
          onEndReached={onEndReached}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={2}
          removeClippedSubviews
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
        />
      )}
      <FeedHeader tab={tab} onTab={switchTab} />
      {/* A-Offline takes the banner slot unless a post is in flight or waiting for Retry; a post that waits for the connection is A-Offline's own case. */}
      {(!online && (posting.state.kind === 'idle' || posting.state.kind === 'live')) || posting.state.kind === 'waiting' ? (
        <OfflineBanner topInset={top} kind={posting.state.kind === 'waiting' ? posting.state.post.kind : null} />
      ) : (
        <PostingBanner state={posting.state} onRetry={() => {
          setDiscard({ status: 'idle', recordingId: null });
          void posting.retry();
        }} onDiscard={() => setConfirmDiscard(true)} busy={discard.status === 'running'} topInset={top} />
      )}
      {/* P4 */}
      <Modal visible={confirmDiscard} transparent animationType="fade" onRequestClose={() => setConfirmDiscard(false)}>
        <ActionSheet title={DISCARD_SHEET.title} lines={[DISCARD_SHEET.line]} actions={[{ label: DISCARD_SHEET.discard, destructive: true, onPress: runDiscard }]} cancelLabel={DISCARD_SHEET.cancel} onCancel={() => setConfirmDiscard(false)} />
      </Modal>
      {/* P6 */}
      <Modal visible={reachedShortcut} transparent animationType="fade" onRequestClose={() => setDiscard({ status: 'idle', recordingId: null })}>
        <ActionSheet title={REACHED_SHORTCUT_SHEET.title} lines={[REACHED_SHORTCUT_SHEET.line]} actions={[]} cancelLabel={REACHED_SHORTCUT_SHEET.ok} onCancel={() => setDiscard({ status: 'idle', recordingId: null })} />
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: '#000000' } });
