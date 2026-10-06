// Colours, type and spacing taken from the approved A1 Native boards (design/html).
import { Platform } from 'react-native';

export const colors = {
  // Light screens
  bg: '#FFFFFF',
  text: '#1C1C1E',
  textSecondary: '#6E6E73',
  textTertiary: '#8A8A8E',
  fill: '#F2F2F7',
  fillStrong: '#E5E5EA',
  separator: '#D1D1D6',
  hairline: '#E5E5EA',
  danger: '#D70015',
  dangerBorder: '#FF3B30',
  dangerFill: '#FFF5F5',
  success: '#34A853',
  chevron: '#C7C7CC',
  // Dark screens over video
  black: '#000000',
  white: '#FFFFFF',
  white78: 'rgba(255,255,255,0.78)',
  white72: 'rgba(255,255,255,0.72)',
  white65: 'rgba(255,255,255,0.65)',
  white62: 'rgba(255,255,255,0.62)',
  white50: 'rgba(255,255,255,0.5)',
  glassFill: 'rgba(28,28,30,0.38)',
  glassBorder: 'rgba(255,255,255,0.18)',
  tabBarDark: 'rgba(0,0,0,0.55)',
  tabBarDarkBorder: 'rgba(255,255,255,0.12)',
  tabBarLight: 'rgba(249,249,249,0.92)',
  tabBarLightBorder: 'rgba(0,0,0,0.15)',
} as const;

// System type: SF on iOS, Roboto on Android (SPEC.md Section 1 "system type").
export const fontFamily = Platform.select({ ios: undefined, android: 'sans-serif', default: undefined });

export const type = {
  display34: { fontSize: 34, lineHeight: 37, fontWeight: '700' as const, letterSpacing: -0.9 },
  title30: { fontSize: 30, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.7 },
  brand17: { fontSize: 17, lineHeight: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  body16: { fontSize: 16, lineHeight: 23, fontWeight: '400' as const },
  lead16: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  button16: { fontSize: 16, lineHeight: 20, fontWeight: '600' as const, letterSpacing: -0.2 },
  label15: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
  semi15: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
  medium15: { fontSize: 15, lineHeight: 20, fontWeight: '500' as const },
  semi14: { fontSize: 14, lineHeight: 18, fontWeight: '600' as const },
  medium14: { fontSize: 14, lineHeight: 18, fontWeight: '500' as const },
  body14: { fontSize: 14, lineHeight: 19, fontWeight: '400' as const },
  caption13: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  caption12: { fontSize: 12, lineHeight: 17, fontWeight: '400' as const },
  semi12: { fontSize: 12, lineHeight: 16, fontWeight: '600' as const },
  tiny11: { fontSize: 11, lineHeight: 15, fontWeight: '400' as const },
  tab10: { fontSize: 10, lineHeight: 12, fontWeight: '500' as const },
} as const;

export const layout = {
  pageInset: 24,
  controlInset: 20,
  groupInset: 16,
  buttonHeight: 52,
  buttonRadius: 26,
  groupRadius: 14,
  headerHeight: 44,
  headerTop: 3, // the boards put the header 3pt under a 47pt status bar
  bottomButton: 40,
  tabBarHeight: 84,
} as const;
