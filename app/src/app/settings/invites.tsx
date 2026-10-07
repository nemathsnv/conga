// Board S-Invites (SPEC.md Section 14): Invite people. The personal link with Copy and Share,
// "4 of 5 left", the cohort line, and the sent invites: joined (with Follow / Following), or
// opened and not yet joined (with its expiry and Cancel, which gives the invite back).
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { track } from '@/lib/analytics';
import { avatarUrl } from '@/lib/api';
import { cancelInvite, followUser, myInvites, unfollowUser, type MyInvites, type SentInvite } from '@/lib/content';
import { inviteLink } from '@/lib/links';
import { Avatar } from '@/ui/components';
import { Spinner } from '@/ui/HomeStates';
import { ChevronLeft, PlacePinIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

function joinedLabel(iso: string | null): string {
  if (!iso) return 'Joined';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Joined today';
  if (days === 1) return 'Joined yesterday';
  return `Joined ${days} days ago`;
}

function expiresLabel(iso: string | null): string {
  if (!iso) return '';
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (days <= 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

/** The link as the board shows it: no scheme, the code in lower case. */
function displayLink(code: string): string {
  return inviteLink(code.toLowerCase()).replace(/^https?:\/\//, '');
}

export default function InvitesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<MyInvites | null>(null);
  const [copied, setCopied] = useState(false);
  const [follows, setFollows] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    myInvites()
      .then((d) => {
        setData(d);
        setFollows({});
      })
      .catch((e) => console.error('my_invites failed', e));
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const link = data ? inviteLink(data.code.toLowerCase()) : '';

  const copy = async () => {
    if (!data) return;
    track('share_tapped', { target: 'invite', method: 'copy', logged_in: true });
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const share = async () => {
    if (!data) return;
    track('share_tapped', { target: 'invite', method: 'share', logged_in: true });
    await Share.share({ url: link, message: link }).catch(() => undefined);
  };
  const cancel = async (sent: SentInvite) => {
    try {
      await cancelInvite(sent.id);
      load();
    } catch (e) {
      console.error('cancel_invite failed', e);
    }
  };
  const toggleFollow = async (sent: SentInvite) => {
    if (!sent.profile) return;
    const id = sent.profile.id;
    const next = !(follows[id] ?? sent.following);
    setFollows((m) => ({ ...m, [id]: next }));
    try {
      if (next) await followUser(id, 'invites');
      else await unfollowUser(id, 'invites');
    } catch {
      setFollows((m) => ({ ...m, [id]: !next }));
    }
  };

  return (
    <View style={s.root}>
      <View style={[s.header, { top: insets.top + 3 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={s.back}>
          <ChevronLeft />
        </Pressable>
        <Text style={s.headerTitle}>Invite people</Text>
      </View>
      {data === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner light={false} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 54, paddingBottom: 40 }}>
          <Text style={s.lead}>Shortcut is in closed beta. Each invite lets one person skip the waitlist.</Text>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={s.cardTitle}>Your invite link</Text>
              <Text style={s.left}>
                {data.left} of {data.total} left
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Copy invite link" onPress={() => void copy()} style={s.linkRow}>
              <Text style={s.linkText} numberOfLines={1}>
                {displayLink(data.code)}
              </Text>
              <Text style={s.copy}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void share()} style={({ pressed }) => [s.shareButton, pressed && { opacity: 0.85 }]}>
              <Text style={s.shareText}>Share invite</Text>
            </Pressable>
            <View style={s.noteRow}>
              <PlacePinIcon size={12} color={colors.textSecondary} />
              <Text style={s.note}>During the beta, people you invite start following {data.cohort_name ?? 'Canggu'}, plus global prompts. They can change it.</Text>
            </View>
          </View>
          {data.sent.length > 0 ? (
            <>
              <Text style={s.cap}>Sent</Text>
              <View style={s.group}>
                {data.sent.map((sent, i) => (
                  <View key={sent.id}>
                    {i > 0 ? <View style={s.sep} /> : null}
                    {sent.status === 'joined' && sent.profile ? (
                      <View style={s.row}>
                        <Avatar uri={avatarUrl(sent.profile.photo_path)} size={36} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.rowTitleBold}>{sent.profile.name}</Text>
                          <Text style={s.sub}>{joinedLabel(sent.joined_at)}</Text>
                        </View>
                        {(() => {
                          const on = follows[sent.profile.id] ?? sent.following;
                          return (
                            <Pressable accessibilityRole="button" onPress={() => void toggleFollow(sent)} style={[s.pill, on ? s.pillGrey : s.pillBlack]}>
                              <Text style={[s.pillText, on ? { color: colors.text } : { color: colors.white }]}>{on ? 'Following' : 'Follow'}</Text>
                            </Pressable>
                          );
                        })()}
                      </View>
                    ) : (
                      <View style={s.row}>
                        <View style={s.dashedAvatar} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.rowTitle}>Link opened, not joined yet</Text>
                          <Text style={s.sub}>{expiresLabel(sent.expires_at)}</Text>
                        </View>
                        <Pressable accessibilityRole="button" onPress={() => void cancel(sent)} hitSlop={8}>
                          <Text style={s.cancel}>Cancel</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                ))}
              </View>
              <Text style={s.foot}>Cancelling gives you the invite back.</Text>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { position: 'absolute', left: 6, right: 6, height: 44, flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { position: 'absolute', left: 54, right: 54, textAlign: 'center', fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3, color: colors.text, fontFamily },
  lead: { marginHorizontal: 24, ...type.label15, lineHeight: 21, color: colors.textSecondary, fontFamily },
  card: { marginHorizontal: 16, marginTop: 18, borderRadius: 16, backgroundColor: colors.fill, padding: 16 },
  cardTitle: { ...type.semi15, color: colors.text, fontFamily },
  left: { ...type.caption13, color: colors.textSecondary, fontFamily },
  linkRow: { marginTop: 10, height: 44, borderRadius: 11, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  linkText: { flex: 1, ...type.label15, color: colors.text, fontFamily },
  copy: { ...type.semi14, color: colors.textSecondary, fontFamily },
  shareButton: { marginTop: 10, height: 44, borderRadius: 22, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  shareText: { ...type.semi15, color: colors.white, fontFamily },
  noteRow: { marginTop: 10, flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  note: { flex: 1, ...type.caption12, lineHeight: 16, color: colors.textSecondary, fontFamily },
  cap: { paddingTop: 22, paddingHorizontal: 32, paddingBottom: 7, ...type.caption13, color: colors.textSecondary, fontFamily },
  group: { marginHorizontal: 16, borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 64, backgroundColor: colors.separator },
  rowTitle: { ...type.body16, color: colors.text, fontFamily },
  rowTitleBold: { ...type.button16, letterSpacing: 0, color: colors.text, fontFamily },
  sub: { marginTop: 1, ...type.caption13, color: colors.textSecondary, fontFamily },
  pill: { height: 30, paddingHorizontal: 13, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillBlack: { backgroundColor: colors.text },
  pillGrey: { backgroundColor: '#E5E5EA' },
  pillText: { ...type.semi14, fontFamily },
  dashedAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C7C7CC' },
  cancel: { ...type.label15, color: '#FF3B30', fontFamily },
  foot: { paddingTop: 7, paddingHorizontal: 32, ...type.caption13, lineHeight: 18, color: colors.textTertiary, fontFamily },
});
