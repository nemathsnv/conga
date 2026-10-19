// Board Main: Home, one conversation at a time, swipe up for the next prompt (For you) or
// the next response from someone you follow (Following). SPEC.md Section 4. Swipe sideways or tap
// the tabs to change list (ui/SwipePages.tsx).
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useSafeAreaInfo } from '@/ui/safeArea';

import { followSuggestions, followUser, followingFeed, getNotificationState, homeFeed, type Conversation, type FollowSuggestion } from '@/lib/content';
import { track } from '@/lib/analytics';
import { useOnline } from '@/lib/connectivity';
import { createLatest } from '@/lib/latest';
import { applyPromptCards } from '@/lib/responded';
import { shouldAsk } from '@/lib/notificationAsk';
import { takeFeedDirty } from '@/ui/feedStore';
import { ActionSheet } from '@/ui/ActionSheet';
import { ConversationView } from '@/ui/ConversationView';
import { DISCARD_SHEET, REACHED_CONGA_SHEET, discardOutcome } from '@/ui/failedPost';
import { FeedHeader } from '@/ui/dark';
import { EmptyPrompt, FollowingEmpty, HomeLoading, OfflineBanner, PostingBanner } from '@/ui/HomeStates';
import { OverlaySheet } from '@/ui/OverlaySheet';
import { SwipePages } from '@/ui/SwipePages';
import { useTabsOverlay } from '@/ui/tabsOverlay';
import { usePosting } from '@/video/posting';

type Tab = 'following' | 'foryou';
const PAGES: readonly Tab[] = ['following', 'foryou'];

/** A reload Home asks of its lists: `clear` shows X-Loading first (something must not show again, or
 *  the page was left), otherwise the current list stays until the new one lands (a finished post).
 *  `page`: only that list; otherwise both. */
type Reload = { clear: boolean; page?: Tab };
type Reloads = { emit: (r: Reload) => void; subscribe: (fn: (r: Reload) => void) => () => void };

function createReloads(): Reloads {
  const listeners = new Set<(r: Reload) => void>();
  return {
    emit: (r) => listeners.forEach((l) => l(r)),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

/** One load of a list; Following with no one in it also brings people to follow. */
async function fetchFeed(which: Tab, exclude: string[], seen: string[]): Promise<{ page: Conversation[]; people?: FollowSuggestion[] }> {
  if (which === 'foryou') return { page: await homeFeed(exclude, 10) };
  const page = await followingFeed(null, 20);
  return page.length === 0 ? { page, people: await followSuggestions(seen) } : { page };
}

export default function HomeTab() {
  const { top, bottomSpace } = useSafeAreaInfo();
  const posting = usePosting();
  const online = useOnline();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('foryou');
  const [focused, setFocused] = useState(true);
  const [reloads] = useState(createReloads);
  // Prompts seen this session, shared by both lists (For you skips them; Following's suggestions use them).
  const seen = useRef<string[]>([]);
  // P4 (Discard confirmation) and P6 (it already reached Conga). While a Discard runs ('running')
  // the banner's buttons wait; once it has answered ('done') the posting state tells the outcome,
  // for that recording only (a later recording that processes is not P6).
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discard, setDiscard] = useState<{ status: 'idle' | 'running' | 'done'; recordingId: string | null }>({ status: 'idle', recordingId: null });
  const reachedConga = discard.status === 'done' && discardOutcome(posting.state) === 'reached_conga' && posting.state.kind === 'processing' && posting.state.post.recording.id === discard.recordingId;

  const runDiscard = () => {
    setConfirmDiscard(false);
    const recordingId = posting.state.kind === 'failed' ? posting.state.post.recording.id : null;
    setDiscard({ status: 'running', recordingId });
    posting
      .discardFailed()
      .catch((e) => console.error('discard failed', e))
      .then(() => setDiscard({ status: 'done', recordingId }));
  };

  // A finished post refreshes the feed so the new response appears (Z-First).
  useEffect(() => {
    if (posting.state.kind === 'live') {
      posting.dismiss();
      seen.current = [];
      reloads.emit({ clear: false });
      // N-Prime: right after the person's first public video posts (SPEC.md Section 15).
      getNotificationState()
        .then(({ ask }) => {
          if (shouldAsk(ask, 'first_post')) router.push({ pathname: '/notifications/prime', params: { ask: '1' } });
        })
        .catch(() => undefined);
    }
  }, [posting.state.kind, posting, router, reloads]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      if (takeFeedDirty()) {
        // Something was reported, blocked or deleted: the feed must not show it again.
        seen.current = [];
        reloads.emit({ clear: true });
      }
      return () => setFocused(false);
    }, [reloads]),
  );

  // Swiped or tapped to the other list: the one left goes back to the top with a fresh list, as a
  // tab switch always did, so it is current when it comes back.
  const changeTab = useCallback((next: Tab) => {
    if (next === tab) return;
    reloads.emit({ clear: true, page: tab });
    setTab(next);
  }, [tab, reloads]);
  const backToForYou = useCallback(() => changeTab('foryou'), [changeTab]);
  // The pages are memoized (FeedPage): a posting banner update or a Discard here does not draw the
  // two lists again.
  const renderPage = useCallback(
    (which: Tab, shown: boolean) => <FeedPage which={which} shown={shown} focused={focused} reloads={reloads} seen={seen} topInset={top} bottomSpace={bottomSpace} onBackToForYou={backToForYou} />,
    [focused, reloads, top, bottomSpace, backToForYou],
  );

  // P4 and P6 cover the tab bar, so the tabs layout draws them (ui/tabsOverlay.tsx); in the view
  // tree, never a <Modal> (ui/OverlaySheet.tsx: a refused <Modal> left Discard and the whole of
  // Home unresponsive until the app restarted).
  useTabsOverlay(
    <>
      {/* P4 */}
      <OverlaySheet visible={focused && confirmDiscard} onRequestClose={() => setConfirmDiscard(false)}>
        <ActionSheet title={DISCARD_SHEET.title} lines={[DISCARD_SHEET.line]} actions={[{ label: DISCARD_SHEET.discard, destructive: true, onPress: runDiscard }]} cancelLabel={DISCARD_SHEET.cancel} onCancel={() => setConfirmDiscard(false)} />
      </OverlaySheet>
      {/* P6 */}
      <OverlaySheet visible={focused && reachedConga} onRequestClose={() => setDiscard({ status: 'idle', recordingId: null })}>
        <ActionSheet title={REACHED_CONGA_SHEET.title} lines={[REACHED_CONGA_SHEET.line]} actions={[]} cancelLabel={REACHED_CONGA_SHEET.ok} onCancel={() => setDiscard({ status: 'idle', recordingId: null })} />
      </OverlaySheet>
    </>,
  );

  return (
    <View style={s.root}>
      <StatusBar style="light" />
      {/* Swipe sideways between Following and For you, or tap the tabs (founder iPhone test, 19 Oct). */}
      <SwipePages pages={PAGES} selected={tab} onSelect={changeTab} renderPage={renderPage} />
      <FeedHeader tab={tab} onTab={changeTab} />
      {/* A-Offline takes the banner slot unless a post is in flight or waiting for Retry; a post that waits for the connection is A-Offline's own case. */}
      {(!online && (posting.state.kind === 'idle' || posting.state.kind === 'live')) || posting.state.kind === 'waiting' ? (
        <OfflineBanner topInset={top} kind={posting.state.kind === 'waiting' ? posting.state.post.kind : null} />
      ) : (
        <PostingBanner state={posting.state} onRetry={() => {
          setDiscard({ status: 'idle', recordingId: null });
          void posting.retry();
        }} onDiscard={() => setConfirmDiscard(true)} busy={discard.status === 'running'} topInset={top} />
      )}
    </View>
  );
}

/**
 * One of Home's two lists, a page of the pager, with its own list and position. Only the page on
 * screen plays, counts views and opens video streams (the other shows stills).
 */
const FeedPage = memo(function FeedPage({ which, shown, focused, reloads, seen, topInset, bottomSpace, onBackToForYou }: {
  which: Tab;
  shown: boolean;
  focused: boolean;
  reloads: Reloads;
  seen: MutableRefObject<string[]>;
  topInset: number;
  bottomSpace: number;
  onBackToForYou: () => void;
}) {
  const { height } = useWindowDimensions();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [index, setIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<FollowSuggestion[]>([]);
  const loads = useRef(createLatest());
  const active = shown && focused;

  // A reset (leaving the page, refresh) always loads and makes a running load stale; a next page is
  // skipped while a load runs; only the latest load's answer lands (lib/latest.ts).
  const load = useCallback((reset: boolean) => {
    const ticket = loads.current.begin(reset);
    if (ticket === null) return;
    const current = () => loads.current.isCurrent(ticket);
    fetchFeed(which, reset ? [] : seen.current, seen.current)
      .then(({ page, people }) => {
        applyPromptCards(page.map((c) => c.prompt));
        if (!current()) return;
        setItems((prev) => (which === 'following' || reset || !prev ? page : [...prev, ...page.filter((c) => !prev.some((p) => p.prompt.id === c.prompt.id))]));
        if (people) setSuggestions(people);
      })
      .catch((e) => {
        console.error('feed failed', e);
        if (current()) setItems((prev) => prev ?? []);
      })
      .finally(() => loads.current.end(ticket));
  }, [which, seen]);

  useEffect(() => {
    load(true);
  }, [load]);

  // Home asks for a reload: a finished post, something reported or blocked, or this page was left.
  useEffect(
    () =>
      reloads.subscribe((r) => {
        if (r.page && r.page !== which) return;
        if (r.clear) {
          setItems(null);
          setIndex(0);
        }
        load(true);
      }),
    [reloads, which, load],
  );

  // The conversation on screen: prompt_viewed once per session, response_viewed when it leaves the
  // screen (scrolled past, the other page, another screen on top).
  const item = items?.[index] ?? null;
  useEffect(() => {
    if (!shown || !item) return;
    const id = item.prompt.id;
    if (!seen.current.includes(id)) {
      seen.current.push(id);
      track('prompt_viewed', { prompt_id: id, scope: item.prompt.place ? 'place' : 'global', surface: 'home' });
    }
  }, [shown, item, seen]);
  useEffect(() => {
    const response = item?.response;
    if (!active || !item || !response) return;
    const since = Date.now();
    const durationMs = response.duration_ms ?? 0;
    return () => {
      const watchMs = Date.now() - since;
      track('response_viewed', { response_id: response.id, prompt_id: item.prompt.id, position: index, surface: 'home', watch_ms: watchMs, completed: durationMs > 0 && watchMs >= durationMs });
    };
  }, [active, item, index]);

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<Conversation>[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first && typeof first.index === 'number') setIndex(first.index);
  }, []);

  const onEndReached = () => {
    if (which === 'foryou' && items && items.length > 0) load(false);
  };

  const follow = async (id: string) => {
    try {
      await followUser(id, 'suggestion');
      setSuggestions((s) => s.filter((x) => x.id !== id));
      load(true);
    } catch (e) {
      console.error('follow failed', e);
    }
  };

  if (items === null) return <HomeLoading topInset={topInset} bottomSpace={bottomSpace} />;
  if (which === 'following' && items.length === 0) return <FollowingEmpty suggestions={suggestions} onFollow={(id) => void follow(id)} onBack={onBackToForYou} topInset={topInset} />;
  return (
    <FlatList
      data={items}
      keyExtractor={(c) => c.prompt.id + (c.response?.id ?? '')}
      renderItem={({ item: row, index: i }) =>
        row.response ? (
          <View style={{ height }}>
            <ConversationView item={row} active={active && i === index} load={shown} topInset={topInset} />
          </View>
        ) : (
          <View style={{ height }}>
            <EmptyPrompt item={row} next={items[i + 1] ?? null} topInset={topInset} bottomSpace={bottomSpace} />
          </View>
        )
      }
      pagingEnabled
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewable}
      viewabilityConfig={VIEWABILITY}
      onEndReachedThreshold={2}
      onEndReached={onEndReached}
      windowSize={3}
      maxToRenderPerBatch={2}
      initialNumToRender={2}
      removeClippedSubviews
      getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
    />
  );
});

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: '#000000' } });
