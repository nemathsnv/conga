// Boards LV-Suspended and LV-ReviewRequested (SPEC.md Section 17): shown at sign-in for a
// suspended account. Request a review once per decision; the outcome arrives as a notification.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { requestReview } from '@/lib/content';
import { useSession } from '@/lib/session';
import { Button } from '@/ui/components';
import { CheckIcon, PersonIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

export default function SuspendedScreen() {
  const insets = useSafeAreaInsets();
  const { state, refresh, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const suspension = state?.suspension ?? null;

  const review = async () => {
    if (!suspension || busy) return;
    setBusy(true);
    try {
      await requestReview(suspension.action_id);
      await refresh();
    } catch (e) {
      console.error('request_review failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <View style={{ paddingTop: insets.top + 78, paddingHorizontal: 24 }}>
        <View style={s.icon}>
          <PersonIcon size={26} color={colors.text} />
        </View>
        <Text style={s.h1}>Your account is suspended</Text>
        <Text style={s.lead}>This suspension is permanent. You can&apos;t watch, post or reply on Shortcut with this account.</Text>
      </View>
      <View style={[s.group, { marginTop: 36 }]}>
        <View style={s.row}>
          <Text style={s.rowTitle}>Why</Text>
          <Text style={s.rowSub}>{suspension?.reason ?? ''}</Text>
        </View>
      </View>
      {!suspension?.review_requested ? <Text style={s.foot}>If you think this is a mistake, ask for a review and we&apos;ll review it again.</Text> : null}
      <View style={[s.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        {suspension?.review_requested ? (
          <View style={s.requested}>
            <View style={s.requestedDot}>
              <CheckIcon size={12} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.requestedTitle}>Review requested</Text>
              <Text style={s.requestedText}>We&apos;ll review it again and let you know the outcome. One review per decision.</Text>
            </View>
          </View>
        ) : (
          <Button title="Request a review" onPress={() => void review()} disabled={busy} />
        )}
        <Pressable accessibilityRole="button" onPress={() => void signOut()} style={s.signOut}>
          <Text style={s.signOutText}>Sign out</Text>
        </Pressable>
        <Text style={s.signedAs}>Signed in as {state?.email ?? ''}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  h1: { marginTop: 20, fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6, color: colors.text, fontFamily },
  lead: { marginTop: 10, ...type.body16, lineHeight: 23, color: colors.textSecondary, fontFamily },
  group: { marginHorizontal: 16, borderRadius: 14, backgroundColor: colors.fill, overflow: 'hidden' },
  row: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  rowTitle: { ...type.button16, color: colors.text, fontFamily },
  rowSub: { marginTop: 1, ...type.caption13, color: colors.textSecondary, fontFamily },
  foot: { marginTop: 7, marginHorizontal: 32, ...type.caption13, lineHeight: 18, color: colors.textTertiary, fontFamily },
  bottom: { position: 'absolute', left: 20, right: 20, bottom: 0 },
  requested: { padding: 14, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.fill, flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  requestedDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  requestedTitle: { ...type.semi15, color: colors.text, fontFamily },
  requestedText: { marginTop: 3, ...type.caption13, lineHeight: 18, color: colors.textSecondary, fontFamily },
  signOut: { marginTop: 10, height: 44, alignItems: 'center', justifyContent: 'center' },
  signOutText: { ...type.medium15, color: colors.text, fontFamily },
  signedAs: { marginTop: 4, ...type.caption12, color: colors.textTertiary, textAlign: 'center', fontFamily },
});
