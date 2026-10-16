// Push notifications on the phone (SPEC.md Section 15). The permission is never asked on
// first launch: N-Prime asks at the moments notificationAsk.ts defines. Once allowed, the
// Expo push token is registered server-side; the server decides what to send.
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerPushToken, setTimezone } from './content';
import { FOUNDER_BUILD } from './env';
import { ANDROID_CHANNEL_ID, ANDROID_CHANNEL_NAME, hrefForPush, type PushData } from './pushRoutes';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Android only: the channel pushes arrive on. Android 13 and later show the permission prompt only
 * once a channel exists, and without one delivery falls back to a hidden default. Safe to call again.
 * The ask timing is not touched: this only creates the channel, before the ask or a token request.
 */
export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, { name: ANDROID_CHANNEL_NAME, importance: Notifications.AndroidImportance.DEFAULT, sound: 'default' });
  } catch (e) {
    console.warn('notification channel failed', e);
  }
}

export async function permissionGranted(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/** N-Prime "Turn on notifications": the phone's permission prompt, then the token. */
export async function requestPermissionAndRegister(): Promise<boolean> {
  await ensureNotificationChannel();
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
  await ensureNotificationChannel();
  // The founder build has no push entitlement (free Personal Team), so no token can exist.
  if (FOUNDER_BUILD) return;
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

export { hrefForPush, type PushData } from './pushRoutes';

/** A tapped notification: where it goes, and a stable id so a tap is handled once. */
export type PushTap = { id: string | null; href: string; kind: string };

function tapFrom(response: Notifications.NotificationResponse): PushTap {
  const data = (response.notification.request.content.data ?? {}) as PushData;
  return { id: response.notification.request.identifier ?? null, href: hrefForPush(data), kind: data.kind ?? 'unknown' };
}

/** A tap while the app is running (in the foreground, or in the background and brought forward). */
export function onNotificationTap(handler: (tap: PushTap) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => handler(tapFrom(response)));
  return () => sub.remove();
}

/** The tap that launched the app from closed, if there was one. The tap listener above is not yet
 *  registered when a closed app is opened by a tap, so the phone's last response is read instead. */
export function launchTap(): PushTap | null {
  const last = Notifications.getLastNotificationResponse();
  return last ? tapFrom(last) : null;
}
