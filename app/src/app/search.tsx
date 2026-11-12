// Boards SR-Recent, SR-Results, SR-People, SR-None (SPEC.md Sections 3, 10): one grouped list
// (Places, Prompts, People), recent searches on this phone only, places not open yet without
// Follow, "Suggest a prompt" when nothing matches.
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/api';
import { followPlace, followUser, search, unfollowPlace, unfollowUser, type PlaceCard, type SearchResults } from '@/lib/content';
import { responsesLabel } from '@/lib/format';
import { loadRecent, pushRecent, saveRecent } from '@/lib/recentSearches';
import { Avatar } from '@/ui/components';
import { CloseIcon, PlacePinIcon, PromptBubbleIcon, SearchIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [placeFollows, setPlaceFollows] = useState<Record<string, boolean>>({});
  const [peopleFollows, setPeopleFollows] = useState<Record<string, boolean>>({});
  const input = useRef<TextInput>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadRecent().then(setRecent).catch(() => undefined);
  }, []);

  const run = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    const t = text.trim();
    if (!t) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(() => {
      search(t)
        .then(setResults)
        .catch((e) => console.error('search failed', e));
    }, 250);
  };

  const commit = (text: string) => {
    const next = pushRecent(recent, text);
    setRecent(next);
    void saveRecent(next);
  };

  const openPlace = (p: PlaceCard) => {
    commit(q);
    router.push({ pathname: '/place/[id]', params: { id: p.id } });
  };
  const togglePlace = async (p: PlaceCard) => {
    const next = !(placeFollows[p.id] ?? p.following);
    setPlaceFollows((m) => ({ ...m, [p.id]: next }));
    try {
      if (next) await followPlace(p.id);
      else await unfollowPlace(p.id);
    } catch {
      setPlaceFollows((m) => ({ ...m, [p.id]: !next }));
    }
  };
  const togglePerson = async (id: string, current: boolean) => {
    const next = !current;
    setPeopleFollows((m) => ({ ...m, [id]: next }));
    try {
      if (next) await followUser(id, 'search');
      else await unfollowUser(id, 'search');
    } catch {
      setPeopleFollows((m) => ({ ...m, [id]: !next }));
    }
  };

  const nothing = results && results.people.length === 0 && results.prompts.length === 0;

  return (
    <View style={s.root}>
      <View style={[s.bar, { marginTop: insets.top + 8 }]}>
        <View style={s.field}>
          <TextInput
            ref={input}
            style={s.input}
            value={q}
            onChangeText={(v) => {
              setQ(v);
              run(v);
            }}
            placeholder="People, prompts and places"
            placeholderTextColor={colors.textTertiary}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => {
              commit(q);
              Keyboard.dismiss();
            }}
            accessibilityLabel="Search"
          />
          {q ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear" onPress={() => { setQ(''); setResults(null); input.current?.focus(); }} style={s.clear} hitSlop={6}>
              <CloseIcon size={10} color={colors.white} />
            </Pressable>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={8}>
          <Text style={s.cancel}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        {!q.trim() ? (
          recent.length ? (
            <>
              <View style={[s.cap, { flexDirection: 'row', justifyContent: 'space-between', paddingRight: 32 }]}>
                <Text style={s.capText}>Recent</Text>
                <Pressable accessibilityRole="button" onPress={() => { setRecent([]); void saveRecent([]); }} hitSlop={6}>
                  <Text style={[s.capText, { color: '#007AFF' }]}>Clear</Text>
                </Pressable>
              </View>
              <View style={s.group}>
                {recent.map((r, i) => (
                  <View key={r}>
                    {i > 0 ? <View style={[s.sep, { marginLeft: 46 }]} /> : null}
                    <Pressable accessibilityRole="button" onPress={() => { setQ(r); run(r); }} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
                      <SearchIcon size={16} color={colors.textTertiary} />
                      <Text style={[s.rowText, { flex: 1 }]}>{r}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
              <Text style={s.foot}>Recent searches stay on this phone.</Text>
            </>
          ) : null
        ) : results === null ? null : (
          <>
            {results.places.length ? (
              <>
                <Text style={[s.cap, s.capText]}>Places</Text>
                <View style={s.group}>
                  {results.places.map((p, i) => {
                    const following = placeFollows[p.id] ?? p.following;
                    return (
                      <View key={p.id}>
                        {i > 0 ? <View style={[s.sep, { marginLeft: 68 }]} /> : null}
                        <View style={[s.row, { minHeight: 64 }]}>
                          <Pressable accessibilityRole="button" disabled={!p.open} onPress={() => openPlace(p)} style={s.rowMain}>
                            <PlaceThumb place={p} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={s.rowTitle}>{p.name}</Text>
                              <Text style={s.sub}>
                                {p.region} · {p.open ? (p.prompt_count === 1 ? '1 prompt' : `${p.prompt_count} prompts`) : 'Not open yet'}
                              </Text>
                            </View>
                          </Pressable>
                          {p.open ? (
                            <Pressable accessibilityRole="button" onPress={() => void togglePlace(p)} style={[s.pill, following ? s.pillGrey : s.pillBlack]}>
                              <Text style={[s.pillText, following && { color: colors.text }]}>{following ? 'Following' : 'Follow'}</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
                {results.places.some((p) => !p.open) ? <Text style={s.foot}>Places open as the beta grows.</Text> : null}
              </>
            ) : null}
            {results.people.length ? (
              <>
                <Text style={[s.cap, s.capText]}>People</Text>
                <View style={s.group}>
                  {results.people.map((p, i) => {
                    const following = peopleFollows[p.id] ?? p.is_following;
                    return (
                      <View key={p.id}>
                        {i > 0 ? <View style={[s.sep, { marginLeft: 68 }]} /> : null}
                        <View style={[s.row, { minHeight: 60 }]}>
                          <Pressable accessibilityRole="button" onPress={() => { commit(q); router.push({ pathname: '/profile/[id]', params: { id: p.id } }); }} style={s.rowMain}>
                            <Avatar uri={avatarUrl(p.photo_path)} size={40} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={s.rowTitle}>{p.name}</Text>
                              <Text style={s.sub}>@{p.username}</Text>
                            </View>
                          </Pressable>
                          {p.is_self ? null : (
                            <Pressable accessibilityRole="button" onPress={() => void togglePerson(p.id, following)} style={[s.pill, following ? s.pillGrey : s.pillBlack]}>
                              <Text style={[s.pillText, following && { color: colors.text }]}>{following ? 'Following' : 'Follow'}</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}
            {results.prompts.length ? (
              <>
                <Text style={[s.cap, s.capText]}>Prompts</Text>
                <View style={s.group}>
                  {results.prompts.map((p, i) => (
                    <View key={p.id}>
                      {i > 0 ? <View style={[s.sep, { marginLeft: 68 }]} /> : null}
                      <Pressable accessibilityRole="button" onPress={() => { commit(q); router.push({ pathname: '/player/[promptId]', params: { promptId: p.id } }); }} style={({ pressed }) => [s.row, { minHeight: 62 }, pressed && { opacity: 0.6 }]}>
                        <View style={s.promptIcon}>
                          <PromptBubbleIcon color={colors.text} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.rowTitle, { letterSpacing: -0.2 }]} numberOfLines={1}>
                            {p.text}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {p.place ? <PlacePinIcon size={11} color={colors.textSecondary} /> : null}
                            <Text style={s.sub}>
                              {p.place ? `${p.place.name} · ` : ''}
                              {p.response_count === 0 ? 'No responses yet' : responsesLabel(p.response_count)}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
            {nothing ? (
              <View style={s.none}>
                <View style={s.noneIcon}>
                  <SearchIcon size={24} color={colors.textTertiary} />
                </View>
                <Text style={s.noneTitle}>No people or prompts match &ldquo;{q.trim()}&rdquo;</Text>
                <Text style={s.noneText}>Try a name, a username or a few words from a prompt.</Text>
                <Pressable accessibilityRole="button" onPress={() => router.push('/suggest/write')} style={({ pressed }) => [s.suggest, pressed && { opacity: 0.7 }]}>
                  <PromptBubbleIcon color={colors.text} />
                  <Text style={s.suggestText}>Suggest a prompt</Text>
                </Pressable>
              </View>
            ) : results.people.length === 0 && results.prompts.length > 0 ? (
              <Text style={s.foot}>No people match &ldquo;{q.trim()}&rdquo;.</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PlaceThumb({ place }: { place: PlaceCard }) {
  if (place.image_path) return <Image source={{ uri: place.image_path }} style={s.placeThumb} contentFit="cover" />;
  return (
    <View style={[s.placeThumb, { alignItems: 'center', justifyContent: 'center' }]}>
      <PlacePinIcon size={16} color={place.open ? colors.text : colors.textTertiary} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  bar: { marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  field: { flex: 1, height: 38, borderRadius: 11, backgroundColor: 'rgba(118,118,128,0.12)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8 },
  input: { flex: 1, ...type.body16, color: colors.text, fontFamily, padding: 0 },
  clear: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#AEAEB2', alignItems: 'center', justifyContent: 'center' },
  cancel: { ...type.body16, color: '#007AFF', fontFamily },
  cap: { paddingTop: 22, paddingHorizontal: 32, paddingBottom: 7 },
  capText: { ...type.caption13, color: colors.textSecondary, fontFamily },
  group: { marginHorizontal: 16, borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { minHeight: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowText: { ...type.body16, color: colors.text, fontFamily },
  rowTitle: { ...type.button16, color: colors.text, fontFamily },
  sub: { marginTop: 1, ...type.caption13, color: colors.textSecondary, fontFamily },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: colors.separator },
  foot: { paddingTop: 7, paddingHorizontal: 32, ...type.caption13, lineHeight: 18, color: colors.textTertiary, fontFamily },
  pill: { height: 30, paddingHorizontal: 13, borderRadius: 15, justifyContent: 'center' },
  pillBlack: { backgroundColor: colors.text },
  pillGrey: { backgroundColor: '#E5E5EA' },
  pillText: { ...type.semi14, color: colors.white, fontFamily },
  placeThumb: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#E5E5EA' },
  promptIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#E5E5EA', alignItems: 'center', justifyContent: 'center' },
  none: { marginTop: 48, marginHorizontal: 32, alignItems: 'center' },
  noneIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  noneTitle: { marginTop: 14, fontSize: 17, lineHeight: 22, fontWeight: '600', color: colors.text, textAlign: 'center', fontFamily },
  noneText: { marginTop: 6, ...type.body14, lineHeight: 19, color: colors.textSecondary, textAlign: 'center', fontFamily },
  suggest: { marginTop: 18, height: 40, paddingHorizontal: 18, borderRadius: 20, backgroundColor: colors.fill, flexDirection: 'row', alignItems: 'center', gap: 7 },
  suggestText: { ...type.semi15, color: colors.text, fontFamily },
});
