// Board Main: Home, one conversation at a time, swipe up for the next prompt (For you) or
// the next response from someone you follow (Following). SPEC.md Section 4.
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useSafeAreaInfo } from '@/ui/safeArea';

import { followSuggestions, followUser, followingFeed, homeFeed, type Conversation, type FollowSuggestion } from '@/lib/content';
import { ConversationView } from '@/ui/ConversationView';
import { FeedHeader } from '@/ui/dark';
import { EmptyPrompt, FollowingEmpty, HomeLoading, PostingBanner } from '@/ui/HomeStates';
import { usePosting } from '@/video/posting';

type Tab = 'following' | 'foryou';

export default function HomeTab() {
  const { height } = useWindowDimensions();
  const { top, bottomSpace } = useSafeAreaInfo();
  const posting = usePosting();
  const [tab, setTab] = useState<Tab>('foryou');
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(true);
  const [suggestions, setSuggestions] = useState<FollowSuggestion[]>([]);
  const seen = useRef<string[]>([]);
  const loading = useRef(false);

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
    }
  }, [posting.state.kind, posting, load, tab]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<Conversation>[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first && typeof first.index === 'number') {
      setIndex(first.index);
      const id = first.item.prompt.id;
      if (!seen.current.includes(id)) seen.current.push(id);
    }
  }, []);

  const onEndReached = () => {
    if (tab === 'foryou' && items && items.length > 0) void load('foryou', false);
  };

  const follow = async (id: string) => {
    try {
      await followUser(id);
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
      <PostingBanner state={posting.state} onRetry={() => void posting.retry()} topInset={top} />
    </View>
  );
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: '#000000' } });
