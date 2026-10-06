// Public client configuration. Values come from app/.env through EXPO_PUBLIC_*.
// Nothing here is secret; nothing secret may ever be added here.

export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
export const DEV_TOOLS = process.env.EXPO_PUBLIC_DEV_TOOLS === '1';

export function missingConfig(): string | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return 'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Fill app/.env and rebuild.';
  }
  return null;
}
