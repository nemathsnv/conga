// Public client configuration. Values come from app/.env through EXPO_PUBLIC_*.
// Nothing here is secret; nothing secret may ever be added here.

export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
export const DEV_TOOLS = process.env.EXPO_PUBLIC_DEV_TOOLS === '1';
// Founder-only iPhone build signed by a free Personal Team (scripts/founder-ios.sh): no Sign in
// with Apple and no push, against the hosted project. Never set for a build anyone else gets.
export const FOUNDER_BUILD = process.env.EXPO_PUBLIC_FOUNDER_BUILD === '1';

/** The founder build must reach the hosted project with its publishable key, never localhost. */
export function founderConfigError(url: string, key: string): string | null {
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url)) return 'Founder build: EXPO_PUBLIC_SUPABASE_URL must be the hosted https://<ref>.supabase.co URL.';
  if (!key.startsWith('sb_publishable_')) return 'Founder build: EXPO_PUBLIC_SUPABASE_ANON_KEY must be the sb_publishable_ key.';
  return null;
}

export function missingConfig(): string | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return 'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Fill app/.env and rebuild.';
  }
  return null;
}
