// Where a tapped push goes, and which taps count (pure: no native imports, Jest-tested).
// SPEC.md Section 15 lists what is sent; a tap goes where the same event goes from Activity
// (boards Activity, X-Activity-Empty). The push carries {kind, video_id, prompt_id, activity_id}
// (supabase/functions/send-push), so:
// - video reply: its player; comment, comment reply: the comments sheet over the commented response
//   (r/<id> finds the prompt); the three prompt kinds: the prompt's player, at the response for
//   "people you follow respond";
// - follow, moderation notice, review outcome, suggestion outcomes: a/<activity_id> finds the
//   Activity row and opens what tapping that row opens (a profile, the notice, the suggestion), and
//   falls back to the Activity tab;
// - likes (shown in Activity "as one quiet line either way") and anything unknown: the Activity tab.

export type PushData = { kind?: string; video_id?: string | null; prompt_id?: string | null; activity_id?: string | null };

const enc = encodeURIComponent;

/** Where a tapped notification goes. Returns an expo-router href. */
export function hrefForPush(data: PushData): string {
  const { video_id: video, prompt_id: prompt, activity_id: activity } = data;
  switch (data.kind) {
    case 'video_reply':
      return video ? `/reply/${enc(video)}` : '/(tabs)/activity';
    case 'comment':
    case 'comment_reply':
      return video ? `/r/${enc(video)}?openComments=1` : '/(tabs)/activity';
    case 'tonight_prompt':
    case 'place_prompt':
      return prompt ? `/player/${enc(prompt)}` : '/(tabs)';
    case 'followed_responded':
      return prompt ? `/player/${enc(prompt)}${video ? `?entry=${enc(video)}` : ''}` : '/(tabs)';
    case 'follow':
    case 'removed':
    case 'restricted':
    case 'suspended':
    case 'review_outcome':
    case 'suggestion_live':
    case 'suggestion_declined':
      return activity ? `/a/${enc(activity)}` : '/(tabs)/activity';
    default:
      // like, and any kind a newer server sends
      return '/(tabs)/activity';
  }
}

/** A tap is handled once, whether it arrives as a tap while the app runs or as the last response
 *  after a launch from a closed app (the phone keeps the last response for the whole session). */
export function claimPush(id: string | null | undefined, handled: Set<string>): boolean {
  if (!id) return true;
  if (handled.has(id)) return false;
  handled.add(id);
  return true;
}

/** The Android channel pushes arrive on. Android 13 and later show no permission prompt until a
 *  channel exists, so it is created before the ask (the ask itself, N-Prime, is unchanged). The name
 *  is what the phone's settings list: the app's name. */
export const ANDROID_CHANNEL_ID = 'default';
export const ANDROID_CHANNEL_NAME = 'Conga';
