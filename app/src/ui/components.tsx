// Reusable primitives that reproduce the approved A1 Native parts without changing
// their appearance: buttons, headers, grouped rows, step bar, chips, avatars, glass.
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ImageStyle, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, PersonIcon } from './Icons';
import { colors, fontFamily, layout, type } from './theme';

type ButtonVariant = 'black' | 'white' | 'fill' | 'glass' | 'text' | 'textOnDark';

export function Button({
  title,
  variant = 'black',
  disabled,
  dimmed,
  onPress,
  style,
  textStyle,
}: {
  title: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Visible but inactive, as the boards draw a Continue that can't be tapped yet. */
  dimmed?: boolean;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const isText = variant === 'text' || variant === 'textOnDark';
  const content = (
    <Text
      style={[
        s.buttonText,
        variant === 'black' && { color: colors.white },
        variant === 'white' && { color: colors.black },
        variant === 'fill' && { color: colors.text },
        variant === 'glass' && { color: colors.white },
        variant === 'text' && s.textButtonText,
        variant === 'textOnDark' && [s.textButtonText, { color: 'rgba(255,255,255,0.86)' }],
        textStyle,
      ]}
    >
      {title}
    </Text>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || dimmed }}
      disabled={disabled || dimmed}
      onPress={onPress}
      style={({ pressed }) => [
        isText ? s.textButton : s.button,
        variant === 'black' && { backgroundColor: colors.text },
        variant === 'white' && { backgroundColor: colors.white },
        variant === 'fill' && { backgroundColor: colors.fill },
        variant === 'glass' && s.glassButton,
        dimmed && { opacity: variant === 'black' ? 0.35 : 0.5 },
        pressed && !dimmed && { opacity: 0.75 },
        style,
      ]}
    >
      {variant === 'glass' ? (
        <>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
          {content}
        </>
      ) : (
        content
      )}
    </Pressable>
  );
}

/** 44x44 back chevron at the top-left, as on every light onboarding board. */
export function Header({ onBack, children }: { onBack?: () => void; children?: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { marginTop: insets.top + layout.headerTop }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : undefined))}
        style={({ pressed }) => [s.backButton, pressed && { opacity: 0.5 }]}
      >
        <ChevronLeft />
      </Pressable>
      {children}
    </View>
  );
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.title, style]}>{children}</Text>;
}

export function Lead({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.lead, style]}>{children}</Text>;
}

/** Grey circle with the person glyph (E-Linked, A-Age, W-Waitlist). */
export function IconCircle({ children, size = 56 }: { children: ReactNode; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </View>
  );
}

/** Rounded grey group with 0.5pt separators (O-Profile, O-Photo). */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.group, style]}>{children}</View>;
}

export function Separator({ inset = 16 }: { inset?: number }) {
  return <View style={[s.separator, { marginLeft: inset }]} />;
}

/** Step bar with 3pt segments (O-Profile "Step 1 of 2", O-Photo "Step 2 of 2"). */
export function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={s.stepBar} accessibilityLabel={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[s.stepSegment, i < step && { backgroundColor: colors.text }]} />
      ))}
    </View>
  );
}

export function Chip({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.chip, pressed && { opacity: 0.6 }]}>
      <Text style={s.chipText}>{title}</Text>
    </Pressable>
  );
}

/** Small rounded grey pill button (O-Invite "Join waitlist"). */
export function Pill({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.pill, (pressed || disabled) && { opacity: 0.6 }]}>
      <Text style={s.pillText}>{title}</Text>
    </Pressable>
  );
}

export function Avatar({
  uri,
  size,
  borderColor,
  borderWidth = 0,
  style,
  radius: radiusProp,
}: {
  uri: string | number | null | undefined;
  size: number;
  borderColor?: string;
  borderWidth?: number;
  style?: StyleProp<ImageStyle>;
  /** Square-ish avatars (the N-Prime example notification); round by default. */
  radius?: number;
}) {
  const radius = radiusProp ?? size / 2;
  if (uri) {
    return (
      <Image
        source={typeof uri === 'number' ? uri : { uri }}
        style={[{ width: size, height: size, borderRadius: radius, borderWidth, borderColor }, style]}
        contentFit="cover"
        transition={0}
      />
    );
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: radius, borderWidth, borderColor, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' }, style]}>
      <PersonIcon size={Math.round(size * 0.41)} color={colors.textTertiary} strokeWidth={1.4} />
    </View>
  );
}

/** Frosted dark card over video (Welcome prompt card, glass buttons). */
export function Glass({ children, style, radius = 16 }: { children: ReactNode; style?: StyleProp<ViewStyle>; radius?: number }) {
  return (
    <View style={[s.glass, { borderRadius: radius }, style]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassFill }]} />
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  button: {
    height: layout.buttonHeight,
    borderRadius: layout.buttonRadius,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glassButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  buttonText: { ...type.button16, fontFamily },
  textButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
  textButtonText: { ...type.medium15, color: colors.text, letterSpacing: 0 },
  header: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 20,
    gap: 10,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.title30, color: colors.text, fontFamily },
  lead: { ...type.lead16, color: colors.textSecondary, marginTop: 10, fontFamily },
  group: { marginHorizontal: layout.groupInset, borderRadius: layout.groupRadius, backgroundColor: colors.fill, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  stepBar: { flex: 1, flexDirection: 'row', gap: 6 },
  stepSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.fillStrong },
  chip: { height: 34, paddingHorizontal: 13, borderRadius: 17, backgroundColor: colors.fill, justifyContent: 'center' },
  chipText: { ...type.medium14, color: colors.text, fontFamily },
  pill: { height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: colors.fill, justifyContent: 'center' },
  pillText: { ...type.semi15, color: colors.text, fontFamily },
  glass: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder },
});
