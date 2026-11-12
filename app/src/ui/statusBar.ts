// The status bar's style for the screen in front, set by the root layout whenever the route changes.
//
// Each screen used to mount its own <StatusBar>. expo-status-bar applies the most recently mounted one,
// and tabs and the screens under a pushed one stay mounted, so the style followed the order screens were
// first opened rather than the screen shown (Android emulator, 2 Nov 2026: white icons on Discover after
// Home, dark icons over Home's video after Me). One rule per route avoids that.
import type { StatusBarStyle } from 'expo-status-bar';

/** Screens drawn on black or on video: light icons. Every other screen is light and gets dark icons. */
const ON_DARK = new Set([
  '(tabs)/index',
  '(onboarding)/welcome',
  'player/[promptId]',
  'record/[promptId]',
  'record/review',
  'reply/[id]',
  'suggestion/[id]',
  'suggest/preview',
]);

/**
 * Overlays drawn over the screen beneath (transparent modals), and routes that only redirect: the
 * status bar stays as the screen beneath set it.
 */
const KEEP = new Set([
  'plus',
  'comments/[responseId]',
  'replies/[rootId]',
  'notifications/prime',
  'safety',
  'camera-blocked',
  '(tabs)/create',
  '(onboarding)/index',
  'a/[activityId]',
  'i/[code]',
  'p/[id]',
  'r/[id]',
  'u/[username]',
  '+not-found',
]);

/** The route's file path, e.g. "record/[promptId]", from expo-router's segments; a group alone is its index. */
export function routeKey(segments: readonly string[]): string {
  if (segments.length === 0) return '';
  const key = segments.join('/');
  return /^\(.+\)$/.test(key) ? `${key}/index` : key;
}

/** The style the screen at these segments needs, or null to keep the current one. */
export function statusBarStyleFor(segments: readonly string[]): StatusBarStyle | null {
  const key = routeKey(segments);
  if (!key || KEEP.has(key)) return null;
  return ON_DARK.has(key) ? 'light' : 'dark';
}
