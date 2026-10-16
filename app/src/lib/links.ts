// Shared links (SPEC.md Section 4, "Links"): shortcut.app/r/{id}, /p/{id}, /i/{code}.
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
  | { pathname: '/player/[promptId]'; params: { promptId: string; entry: string } }
  | { pathname: '/reply/[id]'; params: { id: string } };

export function videoLinkTarget(id: string, video: { kind: 'response' | 'reply'; prompt_id: string } | null): VideoLinkTarget {
  if (video && video.kind === 'response') return { pathname: '/player/[promptId]', params: { promptId: video.prompt_id, entry: id } };
  return { pathname: '/reply/[id]', params: { id } };
}
