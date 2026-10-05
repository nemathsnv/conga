// Public client configuration only. Values come from spike/.env via EXPO_PUBLIC_*.
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const MIN_DURATION_S = 2;
export const MAX_DURATION_S = 30;

export function assertConfig(): string | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return 'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Fill spike/.env and rebuild.';
  }
  return null;
}
