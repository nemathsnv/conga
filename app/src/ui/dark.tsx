// Primitives for the dark, over-video screens (Main, R-Record, R-Player, PR-*): glass tool
// buttons, the feed header, the prompt label, the rail, the progress bar and gradients.
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { responsesLabel } from '@/lib/format';
import { Glass } from './components';
import { PlacePinIcon, PromptBubbleIcon, SearchIcon } from './Icons';
import { colors, fontFamily, type } from './theme';

/** 44x44 round glass button (Cancel, Flip, Light, Zoom on R-Record; Discard on PR-Review). */
export function GlassTool({ children, onPress, label, style, disabled }: { children: ReactNode; onPress?: () => void; label: string; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} style={({ pressed }) => [s.tool, (pressed || disabled) && { opacity: 0.6 }, style]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
      {children}
    </Pressable>
  );
}

/** 36pt glass pill with icon and text (Respond, Reply to …). */
export function GlassPillButton({ children, onPress, label, style }: { children: ReactNode; onPress?: () => void; label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.pill, pressed && { opacity: 0.7 }, style]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
      <View style={s.pillContent}>{children}</View>
    </Pressable>
  );
}

export const pillText = StyleSheet.create({ text: { ...type.semi14, color: colors.white, fontFamily } }).text;

/** Top and bottom gradients over video (Main: 200 / 420; R-Record: 240 / 240). */
export function VideoGradients({ top = 200, bottom = 420, bottomAlpha = 0.62, topAlpha = 0.5 }: { top?: number; bottom?: number; bottomAlpha?: number; topAlpha?: number }) {
  return (
    <>
      <LinearGradient pointerEvents="none" colors={[`rgba(0,0,0,${topAlpha})`, 'rgba(0,0,0,0)']} style={[s.gradient, { top: 0, height: top }]} />
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', `rgba(0,0,0,${bottomAlpha})`]} locations={[0, 0.7]} style={[s.gradient, { bottom: 0, height: bottom }]} />
    </>
  );
}

/** "Following · For you" header with the search icon (Main). */
export function FeedHeader({ tab, onTab }: { tab: 'following' | 'foryou'; onTab: (t: 'following' | 'foryou') => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[s.feedHeader, { top: insets.top + 7 }]}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'following' }} onPress={() => onTab('following')} hitSlop={8}>
        <Text style={[s.feedTab, tab === 'following' && s.feedTabOn]}>Following</Text>
        {tab === 'following' ? <View style={s.feedTabLine} /> : null}
      </Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === 'foryou' }} onPress={() => onTab('foryou')} hitSlop={8}>
        <Text style={[s.feedTab, tab === 'foryou' && s.feedTabOn]}>For you</Text>
        {tab === 'foryou' ? <View style={s.feedTabLine} /> : null}
      </Pressable>
      {/* Search icon, top right (board Main, SPEC.md Section 4): opens SR-Recent. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => router.push('/search')} style={s.searchButton}>
        <SearchIcon />
      </Pressable>
    </View>
  );
}

/** The glass prompt label on Home (Main): bubble icon, text, "23 responses". */
export function PromptLabel({ text, count, place, onPress, onPlacePress, style, subtitle }: { text: string; count: number; place?: { name: string } | null; onPress?: () => void; onPlacePress?: () => void; style?: StyleProp<ViewStyle>; subtitle?: string }) {
  const sub = subtitle ?? `${place ? `${place.name} · ` : ''}${responsesLabel(count)}`;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [{ maxWidth: 286 }, pressed && { opacity: 0.8 }, style]}>
      <Glass style={s.promptLabel}>
        <View style={s.promptRow}>
          <View style={{ marginTop: 2 }}>{place ? <PlacePinIcon size={15} /> : <PromptBubbleIcon />}</View>
          <View style={{ flexShrink: 1 }}>
            <Text style={s.promptText}>{text}</Text>
            {place && onPlacePress ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`${place.name}, place page`} onPress={onPlacePress} hitSlop={6}>
                <Text style={s.promptSub}>{sub}</Text>
              </Pressable>
            ) : (
              <Text style={s.promptSub}>{sub}</Text>
            )}
          </View>
        </View>
      </Glass>
    </Pressable>
  );
}

/** Rail action: icon with a count underneath (counts are hidden when zero, as on Z-First). */
export function RailAction({ icon, count, label, onPress }: { icon: ReactNode; count?: number; label: string; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.rail}>
      {icon}
      {count ? <Text style={s.railCount}>{count}</Text> : null}
    </Pressable>
  );
}

/** 2pt playback progress line. */
export function ProgressLine({ fraction, style }: { fraction: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.progress, style]}>
      <View style={[s.progressFill, { width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }]} />
    </View>
  );
}

const s = StyleSheet.create({
  tool: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
  pill: { minHeight: 36, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
  pillContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 },
  gradient: { position: 'absolute', left: 0, right: 0 },
  feedHeader: { position: 'absolute', left: 0, right: 0, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
  feedTab: { ...type.button16, letterSpacing: -0.2, color: colors.white65, fontFamily },
  feedTabOn: { color: colors.white },
  feedTabLine: { position: 'absolute', left: '50%', bottom: -7, width: 18, marginLeft: -9, height: 2, borderRadius: 1, backgroundColor: colors.white },
  searchButton: { position: 'absolute', right: 8, top: -4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  promptLabel: { paddingTop: 9, paddingBottom: 10, paddingLeft: 12, paddingRight: 14 },
  promptRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  promptText: { ...type.semi14, lineHeight: 18, letterSpacing: -0.1, color: colors.white, fontFamily },
  promptSub: { ...type.caption12, lineHeight: 15, marginTop: 2, color: colors.white72, fontFamily },
  rail: { width: 48, alignItems: 'center', gap: 2 },
  railCount: { ...type.semi12, color: colors.white, fontFamily, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  progress: { height: 2, backgroundColor: 'rgba(255,255,255,0.22)' },
  progressFill: { height: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
});
