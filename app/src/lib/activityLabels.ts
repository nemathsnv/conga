// Pure label rules for the Activity board (no native imports, Jest-tested).
import type { ActivityRow } from './content';

function first(name: string): string {
  return name.split(' ')[0] ?? name;
}

/** "Maya", "Maya and Adam", "Maya, Adam and 2 others": the people behind a grouped row. */
export function actorNames(row: Pick<ActivityRow, 'actors' | 'actor_count' | 'actor'>, opts: { firstNames: boolean } = { firstNames: true }): string {
  const names = (row.actors.length ? row.actors : row.actor ? [row.actor] : []).map((a) => (opts.firstNames ? first(a.name) : a.name));
  const total = Math.max(row.actor_count, names.length);
  if (names.length === 0) return '';
  if (total === 1) return names[0];
  if (total === 2 && names.length >= 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 1) return `${names[0]} and ${total - 1} ${total - 1 === 1 ? 'other' : 'others'}`;
  return `${names[0]}, ${names[1]} and ${total - 2} ${total - 2 === 1 ? 'other' : 'others'}`;
}

export type ActivityText = { names: string; rest: string; quote: string | null };

/** The sentence after the names, exactly as the board writes it. */
export function activityText(row: ActivityRow): ActivityText {
  switch (row.kind) {
    case 'video_reply':
      return {
        names: row.actor?.name ?? '',
        rest: row.video?.kind === 'reply' && row.video.root_response_id ? 'replied to your response with a video' : 'replied to your response with a video',
        quote: row.video?.caption ?? null,
      };
    case 'comment':
      return {
        names: actorNames(row),
        rest: 'commented on your response',
        quote: row.comment && !row.comment.deleted ? `${first(row.actor?.name ?? '')}: "${row.comment.body}"` : null,
      };
    case 'comment_reply':
      return { names: row.actor?.name ?? '', rest: 'replied to your comment', quote: row.comment && !row.comment.deleted ? `"${row.comment.body}"` : null };
    case 'follow':
      return { names: row.actor?.name ?? '', rest: 'started following you', quote: null };
    case 'followed_responded':
      return { names: actorNames(row), rest: `${row.actor_count > 1 ? 'you follow responded to' : 'you follow responded to'}`, quote: row.prompt?.text ?? null };
    case 'like': {
      const n = row.like_count ?? row.actor_count;
      const who = n <= 1 ? (row.actor?.name ?? '') : `${first(row.actor?.name ?? '')} and ${n - 1} ${n - 1 === 1 ? 'other' : 'others'}`;
      return { names: who, rest: 'liked your response', quote: null };
    }
  }
}

/** "4m", "2h", "1d": the board's short relative time. */
export function shortAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
