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
