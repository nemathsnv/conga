// When to show N-Prime (SPEC.md Section 15), as a pure rule.
// 1. Right after the person's first public video posts.
// 2. After Not now, once more, only when their first reply or comment arrives.
// 3. After that, only from Settings.
import type { ActivityRow, NotificationAsk } from './content';

export type AskMoment = 'first_post' | 'first_reply_or_comment';

export function shouldAsk(state: NotificationAsk, moment: AskMoment): boolean {
  if (state === 'accepted' || state === 'declined_twice') return false;
  if (moment === 'first_post') return state === 'never';
  return state === 'declined_once';
}

/** True when the activity list holds a reply or a comment for the person. */
export function hasReplyOrComment(rows: Pick<ActivityRow, 'kind'>[]): boolean {
  return rows.some((r) => r.kind === 'video_reply' || r.kind === 'comment' || r.kind === 'comment_reply');
}
