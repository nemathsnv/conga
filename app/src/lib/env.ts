// Public client configuration. Values come from app/.env through EXPO_PUBLIC_*.
// Nothing here is secret; nothing secret may ever be added here.

export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
export const DEV_TOOLS = process.env.EXPO_PUBLIC_DEV_TOOLS === '1';
const HOSTED_URL = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
// Founder-only iPhone build signed by a free Personal Team (scripts/founder-ios.sh): no Sign in
// with Apple and no push, against the hosted project. Never set for a build anyone else gets.
export const FOUNDER_BUILD = process.env.EXPO_PUBLIC_FOUNDER_BUILD === '1';

/** The founder build must reach the hosted project with its publishable key, never localhost. */
export function founderConfigError(url: string, key: string): string | null {
  if (!HOSTED_URL.test(url)) return 'Founder build: EXPO_PUBLIC_SUPABASE_URL must be the hosted https://<ref>.supabase.co URL.';
  if (!key.startsWith('sb_publishable_')) return 'Founder build: EXPO_PUBLIC_SUPABASE_ANON_KEY must be the sb_publishable_ key.';
  return null;
}

export function missingConfig(url: string = SUPABASE_URL, key: string = SUPABASE_ANON_KEY): string | null {
  if (!url || !key) {
    return 'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Fill app/.env and rebuild.';
  }
  return null;
}

/**
 * Why the Supabase configuration must not be used, or null. Checked once at startup (supabase.ts),
 * which throws: a build never falls back to another server. Missing values are refused in every
 * build; outside development (__DEV__ false) only a hosted https://<ref>.supabase.co URL is
 * accepted, so a release build cannot talk to localhost, a LAN address or plain http. The founder
 * build also needs the publishable key.
 */
export function configError(url: string, key: string, dev: boolean, founder: boolean = FOUNDER_BUILD): string | null {
  const missing = missingConfig(url, key);
  if (missing) return missing;
  if (founder) return founderConfigError(url, key);
  if (!dev && !HOSTED_URL.test(url)) return 'EXPO_PUBLIC_SUPABASE_URL must be the hosted https://<ref>.supabase.co URL outside development.';
  return null;
}
