// Profile content shared by R-Profile (someone else), LV-MyProfile (own, populated) and
// X-Me-Empty (own, no responses). SPEC.md Section 9.
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { avatarUrl } from '@/lib/api';
import { followUser, getProfile, profileReplies, profileResponses, unfollowUser, type Profile, type ProfileReply, type ProfileResponse } from '@/lib/content';
import { followedByLabel, formatCount } from '@/lib/format';
import { Avatar, Separator } from '@/ui/components';
import { Spinner } from '@/ui/HomeStates';
import { PinIcon, PlusSlotIcon, RecordDotIcon, ShareIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';
import { thumbnailUrl } from '@/video/playback';

export function useProfile(args: { id?: string; username?: string }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [responses, setResponses] = useState<ProfileResponse[] | null>(null);
  const reload = useCallback(
    () =>
      getProfile(args)
        .then(async (p) => {
          setProfile(p);
          if (p) setResponses(await profileResponses(p.id));
        })
        .catch((e) => {
          console.error('profile failed', e);
          setProfile(null);
        }),
    [args.id, args.username], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  return { profile, responses, reload, setProfile };
}

export function ProfileBody({ profile, responses, own, onTonight }: { profile: Profile; responses: ProfileResponse[] | null; own: boolean; onTonight?: () => void }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [following, setFollowing] = useState(profile.is_following);
  const [tab, setTab] = useState<'responses' | 'replies'>('responses');
  const [replies, setReplies] = useState<ProfileReply[] | null>(null);
  // Replies load when the tab is first opened, and again whenever the profile is reloaded (Me
  // reloads on every focus), so a video reply deleted from its player is gone when you come back.
  const repliesLoaded = replies !== null;
  useEffect(() => {
    if (tab !== 'replies' && !repliesLoaded) return;
    let cancelled = false;
    profileReplies(profile.id)
      .then((list) => {
        if (!cancelled) setReplies(list);
      })
      .catch((e) => console.error('profile_replies failed', e));
    return () => {
      cancelled = true;
    };
    // `responses` changes identity on each reload of the profile (useProfile).
  }, [tab, responses, profile.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const empty = own && profile.response_count === 0 && (responses?.length ?? 0) === 0;
  const cell = (width - 4) / 3;
  const followedBy = followedByLabel(profile.followed_by.map((f) => f.name), profile.followed_by_count);

  const toggleFollow = async () => {
    const next = !following;
    setFollowing(next);
    try {
      if (next) await followUser(profile.id);
      else await unfollowUser(profile.id);
    } catch {
      setFollowing(!next);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <View style={[s.head, own && !empty && { paddingTop: 0 }]}>
        <Avatar uri={avatarUrl(profile.photo_path)} size={own && !empty ? 84 : 92} />
        <Text style={[s.name, own && !empty && { fontSize: 22, lineHeight: 26, marginTop: 10 }]}>{profile.name}</Text>
        <Text style={s.username}>@{profile.username}</Text>
        {profile.bio ? <Text style={[s.bio, own && !empty && { fontSize: 14, lineHeight: 19, marginTop: 6 }]}>{profile.bio}</Text> : null}
        <View style={[s.stats, own && !empty && { marginTop: 10 }]}>
          <Text style={s.stat}><Text style={s.statNum}>{formatCount(profile.response_count)}</Text> responses</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/profile/follows', params: { id: profile.id, kind: 'followers', username: profile.username } })}>
            <Text style={s.stat}><Text style={s.statNum}>{formatCount(profile.follower_count)}</Text> followers</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/profile/follows', params: { id: profile.id, kind: 'following', username: profile.username } })}>
            <Text style={s.stat}><Text style={s.statNum}>{formatCount(profile.following_count)}</Text> following</Text>
          </Pressable>
        </View>
      </View>

      {own ? (
        <View style={[s.actions, { marginTop: 18 }]}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/profile/edit')} style={({ pressed }) => [s.ownButton, pressed && { opacity: 0.6 }]}>
            <Text style={s.ownButtonText}>Edit profile</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/safety', params: { flow: 'share', kind: 'profile', id: profile.id, authorUsername: profile.username, title: `${profile.name} · @${profile.username}` } })} style={({ pressed }) => [s.ownButton, pressed && { opacity: 0.7 }]}>
            <Text style={s.ownButtonText}>Share profile</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[s.actions, { marginTop: 18 }]}>
            <Pressable accessibilityRole="button" onPress={() => void toggleFollow()} style={({ pressed }) => [s.followButton, following && s.followingButton, pressed && { opacity: 0.7 }]}>
              <Text style={[s.followButtonText, following && { color: colors.text }]}>{following ? 'Following' : 'Follow'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Share profile" onPress={() => router.push({ pathname: '/safety', params: { flow: 'share', kind: 'profile', id: profile.id, authorId: profile.id, authorName: profile.name, authorUsername: profile.username, authorPhoto: profile.photo_path ?? '', title: `${profile.name} · @${profile.username}` } })} style={({ pressed }) => [s.shareButton, pressed && { opacity: 0.7 }]}>
              <ShareIcon size={20} color={colors.text} />
            </Pressable>
          </View>
          {followedBy ? (
            <View style={s.followedBy}>
              <View style={{ flexDirection: 'row' }}>
                {profile.followed_by.map((f, i) => (
                  <Avatar key={f.id} uri={avatarUrl(f.photo_path)} size={22} borderWidth={2} borderColor={colors.white} style={i > 0 ? { marginLeft: -8 } : undefined} />
                ))}
              </View>
              <Text style={s.followedByText}>{followedBy}</Text>
            </View>
          ) : null}
        </>
      )}

      <View style={[s.tabs, { marginTop: own ? 10 : 20 }]}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'responses' }} onPress={() => setTab('responses')} style={s.tab}>
          <Text style={[s.tabText, tab !== 'responses' && s.tabOff]}>
            Responses{profile.response_count > 0 ? <Text style={s.tabCount}> {profile.response_count}</Text> : null}
          </Text>
          {tab === 'responses' ? <View style={s.tabLine} /> : null}
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'replies' }} onPress={() => setTab('replies')} style={s.tab}>
          <Text style={[s.tabText, tab !== 'replies' && s.tabOff]}>
            Replies{profile.reply_count > 0 ? <Text style={s.tabCount}> {profile.reply_count}</Text> : null}
          </Text>
          {tab === 'replies' ? <View style={s.tabLine} /> : null}
        </Pressable>
      </View>
      <Separator inset={0} />

      {tab === 'replies' ? (
        replies === null ? (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Spinner light={false} />
          </View>
        ) : (
          <View style={s.grid}>
            {replies.map((r) => (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={r.reply_to_name ? `Reply to ${r.reply_to_name}` : 'Video reply'}
                disabled={r.status !== 'live'}
                onPress={() => router.push({ pathname: '/reply/[id]', params: { id: r.id } })}
                style={[s.cell, { width: cell, height: 206 }]}
              >
                {r.playback_id ? <Image source={{ uri: thumbnailUrl(r.playback_id, { width: 260, height: 412 }) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                {r.status === 'processing' ? (
                  <View style={s.processing}>
                    <Spinner size={22} />
                    <Text style={s.processingText}>Processing</Text>
                  </View>
                ) : (
                  <View style={s.cap}>
                    <Text style={s.capText} numberOfLines={2}>{r.reply_to_name ? `Replying to ${r.reply_to_name.split(' ')[0]}` : r.prompt_text}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        )
      ) : empty ? (
        // Board X-Me-Empty
        <View style={s.emptyBlock}>
          <View style={s.emptySlot}>
            <PlusSlotIcon color={colors.textTertiary} />
          </View>
          <Text style={s.emptyText}>Your responses show up here.</Text>
          <Pressable accessibilityRole="button" onPress={onTonight} style={({ pressed }) => [s.tonight, pressed && { opacity: 0.8 }]}>
            <RecordDotIcon />
            <Text style={s.tonightText}>Respond to tonight&apos;s prompt</Text>
          </Pressable>
        </View>
      ) : responses === null ? (
        <View style={{ alignItems: 'center', marginTop: 40 }}>
          <Spinner light={false} />
        </View>
      ) : (
        <View style={s.grid}>
          {responses.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              disabled={r.status !== 'live'}
              onPress={() => router.push({ pathname: '/player/[promptId]', params: { promptId: r.prompt_id, entry: r.id } })}
              style={[s.cell, { width: cell, height: 206 }]}
            >
              {r.playback_id ? <Image source={{ uri: thumbnailUrl(r.playback_id, { width: 260, height: 412 }) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              {r.status === 'processing' ? (
                <View style={s.processing}>
                  <Spinner size={22} />
                  <Text style={s.processingText}>Processing</Text>
                </View>
              ) : (
                <>
                  {r.pinned ? <View style={s.pin}><PinIcon /></View> : null}
                  <View style={s.cap}>
                    <Text style={s.capText} numberOfLines={2}>{r.prompt_text}</Text>
                  </View>
                </>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  head: { paddingHorizontal: 24, paddingTop: 2, alignItems: 'center' },
  name: { marginTop: 14, fontSize: 24, lineHeight: 29, fontWeight: '600', letterSpacing: -0.6, color: colors.text, textAlign: 'center', fontFamily },
  username: { marginTop: 3, ...type.body14, color: colors.textSecondary, fontFamily },
  bio: { marginTop: 10, maxWidth: 300, ...type.label15, lineHeight: 21, color: '#3A3A3C', textAlign: 'center', fontFamily },
  stats: { marginTop: 14, flexDirection: 'row', gap: 18 },
  stat: { ...type.body14, color: colors.textSecondary, fontFamily },
  statNum: { fontWeight: '600', color: colors.text },
  actions: { marginHorizontal: 20, flexDirection: 'row', gap: 8 },
  ownButton: { flex: 1, height: 40, borderRadius: 20, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  ownButtonText: { ...type.semi15, color: colors.text, fontFamily },
  followButton: { flex: 1, height: 44, borderRadius: 22, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  followingButton: { backgroundColor: colors.fillStrong },
  followButtonText: { ...type.button16, color: colors.white, fontFamily },
  shareButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  followedBy: { marginTop: 12, marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  followedByText: { ...type.caption13, color: colors.textSecondary, fontFamily },
  tabs: { flexDirection: 'row' },
  tab: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabText: { ...type.semi15, color: colors.text, fontFamily },
  tabOff: { fontWeight: '500', color: colors.textTertiary },
  tabCount: { fontWeight: '400', color: colors.textTertiary },
  tabLine: { position: 'absolute', left: '50%', bottom: 0, width: 32, marginLeft: -16, height: 2, borderRadius: 1, backgroundColor: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 2 },
  cell: { backgroundColor: colors.fillStrong, overflow: 'hidden' },
  processing: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(28,28,30,0.7)', alignItems: 'center', justifyContent: 'center', gap: 8 },
  processingText: { ...type.semi12, color: colors.white, fontFamily },
  pin: { position: 'absolute', right: 7, top: 6 },
  cap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 28, paddingHorizontal: 8, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.35)' },
  capText: { ...type.semi12, lineHeight: 15, letterSpacing: -0.1, color: colors.white, fontFamily },
  emptyBlock: { marginHorizontal: 32, marginTop: 34, alignItems: 'center' },
  emptySlot: { width: 62, height: 82, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.chevron, alignItems: 'center', justifyContent: 'center' },
  emptyText: { marginTop: 12, ...type.label15, lineHeight: 21, color: colors.textSecondary, textAlign: 'center', fontFamily },
  tonight: { marginTop: 16, height: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: colors.text, flexDirection: 'row', alignItems: 'center', gap: 8 },
  tonightText: { ...type.semi15, color: colors.white, fontFamily },
});
