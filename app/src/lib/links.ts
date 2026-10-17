// Shared links (SPEC.md Section 4, "Links"): conga.churntech.com/r/{id}, /p/{id}, /i/{code}.
// The domain and app links are not set up yet (docs/BLOCKERS.md B-3), so links point at the
// web Edge Function on the Supabase URL until EXPO_PUBLIC_WEB_BASE_URL names the domain.
import { SUPABASE_URL } from './env';

function base(): string {
  const configured = process.env.EXPO_PUBLIC_WEB_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  return `${SUPABASE_URL}/functions/v1/web`;
}

export function videoLink(id: string): string {
  return `${base()}/r/${id}`;
}

export function promptLink(id: string): string {
  return `${base()}/p/${id}`;
}

export function profileLink(username: string): string {
  return `${base()}/u/${username}`;
}

export function inviteLink(code: string): string {
  return `${base()}/i/${code}`;
}

/** Where an opened link to a video goes in the app (SPEC.md Section 4, "Links"): a response opens in
 *  the response player at that response, a video reply opens in its own player. A video that cannot
 *  be read (deleted, removed, not found) goes to the video reply player, whose unavailable state
 *  says one neutral message and never the reason. */
export type VideoLinkTarget =
  | { pathname: '/player/[promptId]'; params: { promptId: string; entry: string; openComments?: string } }
  | { pathname: '/reply/[id]'; params: { id: string } };

/** `openComments`: a tapped comment notification opens the comments sheet over the response. */
export function videoLinkTarget(id: string, video: { kind: 'response' | 'reply'; prompt_id: string } | null, opts: { openComments?: boolean } = {}): VideoLinkTarget {
  if (video && video.kind === 'response') return { pathname: '/player/[promptId]', params: { promptId: video.prompt_id, entry: id, ...(opts.openComments ? { openComments: '1' } : {}) } };
  return { pathname: '/reply/[id]', params: { id } };
}

/** get_video's answer: a video card (it has a `status` of its own: live, processing...) or, for a video
 *  that cannot be watched, only `{ status: 'unavailable' }`. A card is not "unavailable" because it has
 *  a status field. */
export function readableVideo<T extends { status?: string; kind?: string; prompt_id?: string }>(raw: T | null | undefined): (T & { kind: 'response' | 'reply'; prompt_id: string }) | null {
  if (!raw || raw.status === 'unavailable') return null;
  if ((raw.kind !== 'response' && raw.kind !== 'reply') || typeof raw.prompt_id !== 'string') return null;
  return raw as T & { kind: 'response' | 'reply'; prompt_id: string };
}

/** shortcut://p/<id> "opens the prompt's first response" (SPEC.md Section 4): the response the player
 *  would show first for this person, passed as the entry so the player starts on it. A prompt with no
 *  responses opens the player's empty state. */
export function promptLinkTarget(promptId: string, responses: { id: string }[]): { pathname: '/player/[promptId]'; params: { promptId: string; entry?: string } } {
  const first = responses[0];
  return { pathname: '/player/[promptId]', params: { promptId, ...(first ? { entry: first.id } : {}) } };
}

/** Top-level paths the app has screens for. A link to anything else is not ours to show a page for. */
const KNOWN_LINK_ROOTS = new Set(['', 'a', 'comments', 'create', 'activity', 'discover', 'me', 'i', 'notice', 'notifications', 'p', 'place', 'player', 'plus', 'profile', 'r', 'record', 'replies', 'reply', 'safety', 'search', 'settings', 'suggest', 'suggestion', 'suggestions', 'u']);

/**
 * A link that opens the app (shortcut://x, https://conga.churntech.com/x, an Expo development URL) goes to its
 * screen when the app has one, and Home otherwise: an unknown link must never leave a blank page.
 * Used by `+native-intent.tsx`, before the router sees the URL.
 */
export function systemPathRedirect(path: string): string {
  const afterDevMarker = path.includes('/--/') ? path.slice(path.indexOf('/--/') + 3) : path;
  const hasHost = /^https?:\/\//i.test(afterDevMarker);
  let rest = afterDevMarker.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  if (hasHost) rest = rest.replace(/^[^/]*/, '');
  rest = rest.replace(/^\/+/, '');
  const root = rest.split(/[/?#]/)[0] ?? '';
  // Route groups such as (tabs) are the app's own paths, never a link's.
  if (KNOWN_LINK_ROOTS.has(root) || /^\(.*\)$/.test(root)) return path;
  return '/';
}

/** The parts of a React Navigation state that decide Back (useRootNavigationState()). */
export type NavStateLike = {
  type?: string;
  index?: number;
  routes?: { name?: string; state?: NavStateLike }[];
};

/**
 * Whether the focused screen has another screen under it in the app's stack. Walks the focused path
 * from the root (root -> routes[index].state -> ...): expo-router's root is a one-route wrapper
 * ("__root") with the app's stack inside it, so its own route count says nothing. Any stack level
 * whose focused route is not its first has a screen beneath; tab navigators do not count (Back does
 * not switch tabs). A link or a notification that opened the app leaves none, and Back then goes Home.
 */
export function hasScreenBeneath(state: NavStateLike | null | undefined): boolean {
  let level: NavStateLike | undefined = state ?? undefined;
  for (let depth = 0; level && depth < 20; depth++) {
    const routes = level.routes ?? [];
    const index = level.index ?? routes.length - 1;
    if (level.type !== 'tab' && index > 0) return true;
    level = routes[index]?.state;
  }
  return false;
}
