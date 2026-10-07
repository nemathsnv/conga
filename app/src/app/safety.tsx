// Boards SF-Menu (share sheet: Copy link, Share to…, Report, Block), SF-Report, SF-Reported,
// SF-Block, SF-Delete and LV-CommentActions. SPEC.md Sections 4, 17, 18.
// One transparent-modal route; `flow` says which stack opens:
//   share   — the share sheet for a video or a profile (kind, id, authorId, authorName, title)
//   delete  — SF-Delete for your own video (id)
//   comment — LV-CommentActions for someone else's comment (id, authorId, authorName, body)
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { avatarUrl } from '@/lib/api';
import { blockUser, deleteVideo, reportItem, REPORT_REASONS, type ProfileCard, type ReportKind, type ReportReason } from '@/lib/content';
import { profileLink, videoLink } from '@/lib/links';
import { markFeedDirty } from '@/ui/feedStore';
import { ActionSheet, WhiteSheet } from '@/ui/ActionSheet';
import { Avatar, Button } from '@/ui/components';
import { CheckIcon, ChevronLeft, LinkIcon, ShareIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

type Params = {
  flow: 'share' | 'delete' | 'comment';
  kind?: ReportKind;
  id: string;
  authorId?: string;
  authorName?: string;
  authorUsername?: string;
  authorPhoto?: string;
  title?: string;
  body?: string;
};

type Stage = 'menu' | 'report' | 'reported' | 'block' | 'delete' | 'comment';

export default function SafetyScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const p = useLocalSearchParams<Params>();
  const kind: ReportKind = p.kind ?? (p.flow === 'comment' ? 'comment' : 'video');
  const [stage, setStage] = useState<Stage>(p.flow === 'delete' ? 'delete' : p.flow === 'comment' ? 'comment' : 'menu');
  const [author, setAuthor] = useState<ProfileCard | null>(p.authorId ? { id: p.authorId, name: p.authorName ?? '', username: p.authorUsername ?? '', photo_path: p.authorPhoto ?? null } : null);
  const [busy, setBusy] = useState(false);
  const firstName = (author?.name ?? '').split(' ')[0];
  const noun = kind === 'profile' ? 'profile' : kind === 'comment' ? 'comment' : 'response';

  const close = () => router.back();

  const link = kind === 'profile' ? profileLink(author?.username ?? '') : videoLink(p.id);
  const copyLink = async () => {
    await Clipboard.setStringAsync(link);
    close();
  };
  const shareTo = async () => {
    try {
      await Share.share({ url: link, message: link });
    } finally {
      close();
    }
  };

  const report = async (reason: ReportReason) => {
    if (busy) return;
    setBusy(true);
    try {
      const who = await reportItem(kind, p.id, reason);
      markFeedDirty();
      setAuthor(who);
      setStage('reported');
    } catch (e) {
      console.error('report failed', e);
      close();
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    if (!author || busy) return;
    setBusy(true);
    try {
      await blockUser(author.id);
      markFeedDirty();
      router.dismissTo('/(tabs)');
    } catch (e) {
      console.error('block failed', e);
      close();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteVideo(p.id);
      markFeedDirty();
      router.dismissTo('/(tabs)');
    } catch (e) {
      console.error('delete_video failed', e);
      close();
    } finally {
      setBusy(false);
    }
  };

  // Board SF-Block
  if (stage === 'block') {
    return (
      <ActionSheet
        title={`Block ${author?.name ?? ''}?`}
        lines={[
          // Board copy is written for Adam ("He won't…"); profiles carry no pronouns, so "they" (docs/PHASE-5-REPORT.md).
          "They won't be able to see your responses, reply to you or follow you, and you won't see theirs. They won't be told.",
        ]}
        actions={[{ label: 'Block', destructive: true, onPress: () => void block() }]}
        onCancel={close}
      />
    );
  }

  // Board SF-Delete
  if (stage === 'delete') {
    return (
      <ActionSheet
        title={p.kind === 'video' && p.title === 'reply' ? 'Delete your reply?' : 'Delete your response?'}
        lines={["It's removed from the conversation along with its comments. Video replies people sent stay on their own profiles."]}
        actions={[{ label: p.title === 'reply' ? 'Delete reply' : 'Delete response', destructive: true, onPress: () => void remove() }]}
        onCancel={close}
      />
    );
  }

  // Board LV-CommentActions
  if (stage === 'comment') {
    return (
      <ActionSheet
        title={`${author?.name ?? ''}'s comment`}
        lines={p.body ? [`“${p.body}”`] : undefined}
        actions={[
          { label: 'Report comment', destructive: true, onPress: () => setStage('report') },
          { label: `Block ${author?.name ?? ''}`, destructive: true, onPress: () => setStage('block') },
        ]}
        onCancel={close}
      />
    );
  }

  // Board SF-Report
  if (stage === 'report') {
    return (
      <WhiteSheet onClose={close} top={Math.round(height * (96 / 844))}>
        <View style={s.reportHead}>
          <Text style={s.reportTitle}>Report</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => setStage(p.flow === 'comment' ? 'comment' : 'menu')} style={s.reportBack}>
            <ChevronLeft size={20} />
          </Pressable>
        </View>
        <Text style={s.reportQuestion}>Why are you reporting this {noun}?</Text>
        <ScrollView style={{ marginTop: 14 }} contentContainerStyle={s.group}>
          {REPORT_REASONS.map((r, i) => (
            <View key={r.id}>
              {i > 0 ? <View style={s.sep} /> : null}
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void report(r.id)} style={({ pressed }) => [s.reasonRow, pressed && { opacity: 0.6 }]}>
                <Text style={s.reasonText}>{r.label}</Text>
                <Text style={s.reasonChevron}>›</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
        <Text style={s.anon}>{firstName || 'They'} won&apos;t know who reported it.</Text>
      </WhiteSheet>
    );
  }

  // Board SF-Reported
  if (stage === 'reported') {
    return (
      <WhiteSheet onClose={close}>
        <View style={s.reportedBlock}>
          <View style={s.reportedIcon}>
            <CheckIcon size={24} color={colors.text} />
          </View>
          <Text style={s.reportedTitle}>Thanks for telling us</Text>
          <Text style={s.reportedText}>We&apos;ll review it. You won&apos;t see this {noun} again.</Text>
        </View>
        {author ? (
          <View style={[s.group, { marginTop: 22 }]}>
            <View style={s.blockRow}>
              <Avatar uri={avatarUrl(author.photo_path)} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={s.blockTitle}>Block {author.name}</Text>
                <Text style={s.blockSub}>You won&apos;t see each other on Shortcut</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setStage('block')} style={({ pressed }) => [s.blockPill, pressed && { opacity: 0.7 }]}>
                <Text style={s.blockPillText}>Block</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <Button title="Done" onPress={() => router.dismissTo('/(tabs)')} style={{ marginTop: 16 }} />
      </WhiteSheet>
    );
  }

  // Board SF-Menu
  return (
    <WhiteSheet onClose={close}>
      {p.title ? (
        <Text style={s.menuContext} numberOfLines={1}>
          {p.title}
        </Text>
      ) : null}
      <View style={s.menuIcons}>
        <Pressable accessibilityRole="button" onPress={() => void copyLink()} style={s.menuIcon}>
          <View style={s.menuCircle}>
            <LinkIcon size={22} color={colors.text} />
          </View>
          <Text style={s.menuIconText}>Copy link</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void shareTo()} style={s.menuIcon}>
          <View style={s.menuCircle}>
            <ShareIcon size={22} color={colors.text} />
          </View>
          <Text style={s.menuIconText}>Share to…</Text>
        </Pressable>
      </View>
      {author ? (
        <View style={[s.group, { marginTop: 20 }]}>
          <Pressable accessibilityRole="button" onPress={() => setStage('report')} style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.6 }]}>
            <Text style={s.menuDanger}>Report {noun}</Text>
          </Pressable>
          <View style={[s.sep, { marginLeft: 46 }]} />
          <Pressable accessibilityRole="button" onPress={() => setStage('block')} style={({ pressed }) => [s.menuRow, pressed && { opacity: 0.6 }]}>
            <Text style={s.menuDanger}>Block {author.name}</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => [s.menuCancel, pressed && { opacity: 0.7 }]}>
        <Text style={s.menuCancelText}>Cancel</Text>
      </Pressable>
    </WhiteSheet>
  );
}

const s = StyleSheet.create({
  group: { borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: colors.separator },
  menuContext: { marginTop: 14, ...type.caption13, color: colors.textSecondary, textAlign: 'center', fontFamily },
  menuIcons: { marginTop: 16, flexDirection: 'row', justifyContent: 'center', gap: 12 },
  menuIcon: { width: 72, alignItems: 'center', gap: 6 },
  menuCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  menuIconText: { ...type.caption12, color: colors.text, fontFamily },
  menuRow: { minHeight: 52, paddingHorizontal: 16, justifyContent: 'center' },
  menuDanger: { ...type.button16, fontWeight: '400', color: colors.dangerBorder, fontFamily },
  menuCancel: { marginTop: 12, height: 50, borderRadius: 14, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  menuCancelText: { ...type.button16, color: colors.text, fontFamily },
  reportHead: { marginTop: 14, alignItems: 'center', justifyContent: 'center' },
  reportTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: colors.text, fontFamily },
  reportBack: { position: 'absolute', left: -6, top: -5, width: 44, height: 32, alignItems: 'center', justifyContent: 'center' },
  reportQuestion: { marginTop: 16, fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4, color: colors.text, fontFamily },
  reasonRow: { minHeight: 46, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  reasonText: { flex: 1, ...type.label15, color: colors.text, fontFamily },
  reasonChevron: { fontSize: 20, color: '#C7C7CC', fontFamily },
  anon: { marginTop: 12, ...type.caption13, color: colors.textTertiary, textAlign: 'center', fontFamily },
  reportedBlock: { marginTop: 26, alignItems: 'center' },
  reportedIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  reportedTitle: { marginTop: 16, fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.4, color: colors.text, fontFamily },
  reportedText: { marginTop: 8, ...type.label15, lineHeight: 21, color: colors.textSecondary, textAlign: 'center', fontFamily },
  blockRow: { minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  blockTitle: { ...type.button16, color: colors.text, fontFamily },
  blockSub: { marginTop: 1, ...type.caption13, color: colors.textSecondary, fontFamily },
  blockPill: { height: 30, paddingHorizontal: 13, borderRadius: 15, backgroundColor: colors.white, justifyContent: 'center' },
  blockPillText: { ...type.semi14, color: colors.dangerBorder, fontFamily },
});
