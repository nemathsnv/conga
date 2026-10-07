// Pure text helpers for the boards' labels.

/** "2h", "5h", "3d", "Just now" (Main, R-Player, Z-First). */
/** "just now" or "15m ago": timeAgo with the trailing word, for sentences. */
export function agoLabel(iso: string | null, now: number = Date.now()): string {
  const t = timeAgo(iso, now);
  return t === 'Just now' ? 'just now' : `${t} ago`;
}

export function timeAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'Just now';
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "23 responses", "1 response". */
export function responsesLabel(count: number): string {
  return count === 1 ? '1 response' : `${count} responses`;
}

/** "22 more responses" under the face strip on Home. */
export function moreResponsesLabel(total: number): string {
  const more = Math.max(0, total - 1);
  return more === 1 ? '1 more response' : `${more} more responses`;
}

/** "Followed by Putu, Wayan and 4 others" (R-Profile). */
export function followedByLabel(names: string[], total: number): string | null {
  if (total === 0) return null;
  const first = names.slice(0, 2).map((n) => n.split(' ')[0]);
  const rest = total - first.length;
  if (first.length === 1 && rest === 0) return `Followed by ${first[0]}`;
  if (rest <= 0) return `Followed by ${first.join(' and ')}`;
  return `Followed by ${first.join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}
