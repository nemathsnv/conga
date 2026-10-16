// Boards A-Removed ("We removed your response") and A-Restricted ("Posting is paused until …").
// SPEC.md Section 17: the removed item and the reason, "treat this as a warning", Request a
// review (one per decision), no promised next step.
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getNotice, requestReview, type Notice } from '@/lib/content';
import { timeAgo } from '@/lib/format';
import { Button } from '@/ui/components';
import { Spinner } from '@/ui/HomeStates';
import { CheckIcon, ChevronLeft, ChevronRightIcon, PersonIcon, VideoReplyIcon } from '@/ui/Icons';
import { useGoBack } from '@/ui/navigation';
import { colors, fontFamily, type } from '@/ui/theme';
import { thumbnailUrl } from '@/video/playback';

function untilLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'long' })}`;
}

export default function NoticeScreen() {
  const router = useRouter();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const { actionId } = useLocalSearchParams<{ actionId: string }>();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!actionId) return;
      getNotice(actionId)
        .then(setNotice)
        .catch((e) => console.error('get_notice failed', e));
    }, [actionId]),
  );

  const review = async () => {
    if (!notice || busy) return;
    setBusy(true);
    try {
      await requestReview(notice.id);
      setNotice({ ...notice, review_requested: true });
    } catch (e) {
      console.error('request_review failed', e);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={[s.header, { top: insets.top + 3 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => goBack()} style={s.back}>
        <ChevronLeft />
      </Pressable>
    </View>
  );

  if (!notice) {
    return (
      <View style={s.root}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner light={false} />
        </View>
      </View>
    );
  }

  const reviewBlock = notice.review_requested ? (
    <View style={s.requested}>
      <View style={s.requestedDot}>
        <CheckIcon size={12} color={colors.white} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.requestedTitle}>Review requested</Text>
        <Text style={s.requestedText}>We&apos;ll review it again and let you know the outcome. One review per decision.</Text>
      </View>
    </View>
  ) : null;

  // Board A-Restricted
  if (notice.kind === 'restrict') {
    return (
      <View style={s.root}>
        {header}
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 78, paddingBottom: 180 }}>
          <View style={{ paddingHorizontal: 24 }}>
            <View style={s.bigIcon}>
              <PersonIcon size={26} color={colors.text} />
            </View>
            <Text style={s.h1}>Posting is paused until {notice.restrict_until ? untilLabel(notice.restrict_until) : ''}</Text>
            <Text style={s.lead}>You can still watch. Until then you can&apos;t respond, reply, comment or suggest prompts.</Text>
          </View>
          <View style={[s.group, { marginTop: 28 }]}>
            <View style={[s.row, { minHeight: 64 }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>Why</Text>
                <Text style={s.rowSub}>{notice.reason}</Text>
              </View>
            </View>
            {notice.removed_action_ids && notice.removed_action_ids.length > 0 ? (
              <>
                <View style={s.sep} />
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/notice/[actionId]', params: { actionId: notice.removed_action_ids![0] } })} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
                  <Text style={[s.rowTitle, { flex: 1, fontWeight: '400' }]}>See what was removed</Text>
                  <ChevronRightIcon color="#C7C7CC" size={16} />
                </Pressable>
              </>
            ) : null}
          </View>
          <Text style={s.foot}>If you think this is a mistake, ask for a review and we&apos;ll review it again.</Text>
        </ScrollView>
        <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
          {reviewBlock}
          <Button title="Keep watching" onPress={() => router.dismissTo('/(tabs)')} style={{ marginTop: reviewBlock ? 10 : 0 }} />
          {!notice.review_requested ? <Button title="Request a review" variant="text" onPress={() => void review()} disabled={busy} style={{ marginTop: 6 }} /> : null}
        </View>
      </View>
    );
  }

  // Board A-Removed
  const video = notice.video;
  return (
    <View style={s.root}>
      {header}
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 62, paddingBottom: 200 }}>
        <Text style={[s.h1, { marginHorizontal: 24, fontSize: 28, lineHeight: 31 }]}>We removed your {notice.target_kind === 'comment' ? 'comment' : video?.kind === 'reply' ? 'video reply' : 'response'}</Text>
        <View style={s.item}>
          {video ? (
            <>
              <View style={s.itemThumb}>
                {video.playback_id ? <Image source={{ uri: thumbnailUrl(video.playback_id, { width: 96, height: 128 }) }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={5} /> : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.itemKicker}>Your {video.kind === 'reply' ? 'reply' : 'response'} · {timeAgo(video.created_at)} ago</Text>
                <Text style={s.itemTitle} numberOfLines={2}>
                  {video.prompt_text}
                </Text>
              </View>
            </>
          ) : notice.comment ? (
            <View style={{ flex: 1 }}>
              <Text style={s.itemKicker}>Your comment · {timeAgo(notice.created_at)} ago</Text>
              <Text style={s.itemTitle} numberOfLines={3}>
                &ldquo;{notice.comment.body}&rdquo;
              </Text>
            </View>
          ) : null}
        </View>
        <View style={s.points}>
          <Point icon={<VideoReplyIcon size={16} color={colors.text} />} title="Why" text={notice.reason} />
          <Point icon={<PersonIcon size={16} color={colors.text} />} title="What this means" text="Nobody can watch it any more. Please treat this as a warning." />
          <Point icon={<CheckIcon size={16} color={colors.text} />} title="Think we got it wrong?" text="Ask for a review and we'll review it again." />
        </View>
      </ScrollView>
      <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        {reviewBlock}
        {!notice.review_requested ? <Button title="Request a review" onPress={() => void review()} disabled={busy} /> : null}
        {/* "Read the Community Guidelines" needs the document and its URL (docs/PHASE-5-REPORT.md). */}
        <Button title="Read the Community Guidelines" variant="text" onPress={undefined} disabled style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

function Point({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <View style={s.point}>
      <View style={s.pointIcon}>{icon}</View>
      <View style={{ flex: 1, paddingTop: 1 }}>
        <Text style={s.pointTitle}>{title}</Text>
        <Text style={s.pointText}>{text}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: { position: 'absolute', left: 6, right: 6, height: 44, flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bigIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  h1: { marginTop: 20, fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, color: colors.text, fontFamily },
  lead: { marginTop: 10, ...type.body16, lineHeight: 23, color: colors.textSecondary, fontFamily },
  group: { marginHorizontal: 16, borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { ...type.button16, color: colors.text, fontFamily },
  rowSub: { marginTop: 1, ...type.caption13, color: colors.textSecondary, fontFamily },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: colors.separator },
  foot: { marginTop: 18, marginHorizontal: 32, ...type.caption13, lineHeight: 18, color: colors.textTertiary, fontFamily },
  bottom: { position: 'absolute', left: 20, right: 20, bottom: 0, backgroundColor: colors.white, paddingTop: 10 },
  item: { marginTop: 24, marginHorizontal: 16, padding: 12, borderRadius: 16, backgroundColor: colors.fill, flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemThumb: { width: 48, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.separator },
  itemKicker: { ...type.caption13, color: colors.textSecondary, fontFamily },
  itemTitle: { marginTop: 2, ...type.semi15, lineHeight: 20, color: colors.text, fontFamily },
  points: { marginTop: 26, marginHorizontal: 24, gap: 18 },
  point: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  pointIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  pointTitle: { ...type.semi15, color: colors.text, fontFamily },
  pointText: { marginTop: 1, ...type.body14, lineHeight: 19, color: colors.textSecondary, fontFamily },
  requested: { padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.fill, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  requestedDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  requestedTitle: { ...type.semi15, color: colors.text, fontFamily },
  requestedText: { marginTop: 3, ...type.caption13, lineHeight: 18, color: colors.textSecondary, fontFamily },
});
