// Board X-Unavailable: "This response isn't available / It was deleted or removed." with Next
// response and "If it just didn't load: Try again". One neutral message, never the reason (SPEC.md
// Section 20). Used for an entry that is gone, and for a video that failed to load (the board's
// Try again).
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Glass } from '@/ui/components';
import { GlassPillButton, pillText } from '@/ui/dark';
import { ChevronRightIcon, VideoReplyIcon } from '@/ui/Icons';
import { colors, fontFamily, type } from '@/ui/theme';

export function Unavailable({ onNext, onRetry }: { onNext?: () => void; onRetry: () => void }) {
  return (
    <View style={[s.root, { backgroundColor: '#0E0E10' }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,12,0.6)' }]} />
      <View style={s.block}>
        <Glass style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }} radius={28}>
          <VideoReplyIcon size={26} />
        </Glass>
        <Text accessibilityRole="header" style={s.title}>This response isn&apos;t available</Text>
        <Text style={s.text}>It was deleted or removed.</Text>
        {onNext ? (
          <GlassPillButton label="Next response" onPress={onNext} style={{ marginTop: 24, height: 44, borderRadius: 22 }}>
            <Text style={[pillText, { fontSize: 15 }]}>Next response</Text>
            <ChevronRightIcon />
          </GlassPillButton>
        ) : null}
      </View>
      <View style={s.tryAgainRow}>
        <Text style={s.tryAgain}>If it just didn&apos;t load: </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Try again" hitSlop={10} onPress={onRetry}>
          <Text style={[s.tryAgain, { color: colors.white, fontWeight: '600' }]}>Try again</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  block: { position: 'absolute', left: 32, right: 32, top: 300, alignItems: 'center' },
  title: { marginTop: 18, fontSize: 22, lineHeight: 27, fontWeight: '600', letterSpacing: -0.4, color: colors.white, textAlign: 'center', fontFamily },
  text: { marginTop: 8, ...type.label15, lineHeight: 21, color: 'rgba(255,255,255,0.75)', textAlign: 'center', fontFamily },
  tryAgainRow: { position: 'absolute', left: 32, right: 32, top: 640, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  tryAgain: { ...type.caption13, color: colors.white62, fontFamily },
});
