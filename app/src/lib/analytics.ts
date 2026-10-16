// Product events (SPEC.md Section 21) into our own table, no SDK (Section 22 "Analytics",
// Section 2 "no ads or tracking SDKs"). Events queue on the phone and go to `track_events` in
// batches once signed in; the server adds the pseudonymous id and the cohort (Nemat, 9 Oct: the
// account-linked identifier is pseudonymous, not anonymous). Nothing here carries
// an email, a name or a username.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { supabase } from './supabase';

export type EventName =
  | 'signup_started' | 'signup_completed'
  | 'age_confirmed' | 'age_declined'
  | 'invite_redeemed' | 'invite_failed'
  | 'waitlist_joined'
  | 'onboarding_photo'
  | 'prompt_viewed'
  | 'response_viewed'
  | 'player_jump' | 'player_end_reached'
  | 'record_started' | 'record_completed'
  | 'disclosure_shown' | 'disclosure_accepted' | 'disclosure_back'
  | 'video_published'
  | 'upload_failed' | 'upload_retried'
  | 'reply_room_opened' | 'comments_opened'
  | 'comment_posted' | 'like_added'
  | 'follow_user' | 'unfollow_user'
  | 'place_followed' | 'place_unfollowed'
  | 'suggestion_submitted' | 'suggestion_withdrawn'
  | 'draft_published' | 'draft_rerecorded' | 'draft_deleted'
  | 'notif_ask_shown' | 'notif_ask_accepted' | 'notif_ask_declined'
  | 'push_opened'
  | 'share_tapped' | 'web_link_opened' | 'web_signin_sheet_shown'
  | 'report_submitted' | 'user_blocked'
  | 'content_deleted' | 'account_deletion_requested' | 'account_deletion_cancelled'
  | 'permission_denied'
  | 'offline_shown';

export type EventProps = Record<string, string | number | boolean | null>;

type Queued = { name: EventName; props: EventProps; ts: string };

const KEY = 'shortcut.events';
const MAX_QUEUE = 1000;
const BATCH = 200;
const FLUSH_MS = 5000;

let queue: Queued[] = [];
let loaded = false;
let flushing = false;
let timer: ReturnType<typeof setInterval> | null = null;

function appVersion(): string {
  return Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '0';
}

function platform(): 'ios' | 'android' | 'web' {
  return Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
}

async function persist(): Promise<void> {
  // Until the stored queue is merged in, writing would overwrite it (and load() persists).
  if (!loaded) return;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // Best effort: the queue is still in memory for this launch.
  }
}

let loading: Promise<void> | null = null;

/** Merges the queue stored by an earlier launch in front of what this launch has tracked. */
function load(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const stored = raw ? (JSON.parse(raw) as Queued[]) : [];
        if (Array.isArray(stored)) queue = [...stored, ...queue].slice(-MAX_QUEUE);
      } catch {
        // Nothing stored or unreadable: start with this launch's events.
      }
      loaded = true;
      await persist();
    })();
  }
  return loading;
}

/** Records an event. Safe to call anywhere; it never throws and never blocks. */
export function track(name: EventName, props: EventProps = {}): void {
  queue.push({ name, props, ts: new Date().toISOString() });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  void persist();
}

/** Sends what is queued, if signed in. Keeps the queue on any failure. */
export async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    await load();
    if (queue.length === 0) return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    while (queue.length > 0) {
      const batch = queue.slice(0, BATCH);
      const { error } = await supabase.rpc('track_events', { p_platform: platform(), p_app_version: appVersion(), p_events: batch });
      if (error) return;
      queue = queue.slice(batch.length);
      await persist();
    }
  } catch {
    // Network or server trouble: try again at the next flush.
  } finally {
    flushing = false;
  }
}

/**
 * Sign-out: what is still queued belongs to the account that is leaving. Called after a last
 * flush, so a later sign-in on this phone never sends it under the next account's id.
 */
export async function clearQueue(): Promise<void> {
  await load();
  queue = [];
  await persist();
}

/** Starts the periodic flush and the flush on going to the background. Returns a stop function. */
export function startAnalytics(): () => void {
  void load();
  timer = setInterval(() => void flush(), FLUSH_MS);
  const sub = AppState.addEventListener('change', (st) => {
    if (st === 'background' || st === 'inactive') void flush();
  });
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    sub.remove();
  };
}

/** Test seam. */
export function _resetForTests(): void {
  queue = [];
  loaded = false;
  loading = null;
  flushing = false;
}

export function _queued(): readonly Queued[] {
  return queue;
}
