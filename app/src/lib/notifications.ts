// Push notifications on the phone (SPEC.md Section 15). The permission is never asked on
// first launch: N-Prime asks at the moments notificationAsk.ts defines. Once allowed, the
// Expo push token is registered server-side; the server decides what to send.
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken, setTimezone } from './content';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function permissionGranted(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/** N-Prime "Turn on notifications": the phone's permission prompt, then the token. */
export async function requestPermissionAndRegister(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return false;
  await registerTokenIfAllowed();
  return true;
}

/**
 * Registers the Expo push token when the permission is on. Needs an EAS project id in the
 * app config; without one (local development) the token cannot be minted and this is a
 * no-op, logged once. Tracked as a blocker in docs/BLOCKERS.md.
 */
export async function registerTokenIfAllowed(): Promise<void> {
  if (!(await permissionGranted())) return;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) {
    console.warn('push: no EAS project id in app config; token not registered (docs/BLOCKERS.md B-2)');
    return;
  }
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch (e) {
    console.warn('push token registration failed', e);
  }
}

let sentTimezone: string | null = null;

/**
 * The phone's current IANA timezone, for "tonight's prompt" at about 18:30 local time
 * (Nemat, 7 Oct 2026). Called on launch and when the app returns to the foreground; only
 * sent when it changed.
 */
export async function syncTimezone(): Promise<void> {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || tz === sentTimezone) return;
    await setTimezone(tz);
    sentTimezone = tz;
  } catch {
    // not fatal; tried again on the next foreground
  }
}

export type PushData = { kind?: string; video_id?: string | null; prompt_id?: string | null; activity_id?: string | null };

/** Where a tapped notification goes. Returns an expo-router href. */
export function hrefForPush(data: PushData): string {
  switch (data.kind) {
    case 'video_reply':
      return data.video_id ? `/reply/${data.video_id}` : '/(tabs)/activity';
    case 'comment':
    case 'comment_reply':
      return data.video_id ? `/comments/${data.video_id}` : '/(tabs)/activity';
    case 'tonight_prompt':
    case 'place_prompt':
    case 'followed_responded':
      return data.prompt_id ? `/player/${data.prompt_id}` : '/(tabs)';
    default:
      return '/(tabs)/activity';
  }
}

export function onNotificationTap(handler: (href: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(hrefForPush((response.notification.request.content.data ?? {}) as PushData));
  });
  return () => sub.remove();
}
