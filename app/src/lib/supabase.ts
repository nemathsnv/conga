import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { authStorageKey, configError, SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

// No fallback server: a build with a missing or (outside development) non-hosted URL stops here
// with the reason, instead of quietly talking to localhost.
const startupError = configError(SUPABASE_URL, SUPABASE_ANON_KEY, __DEV__);
if (startupError) throw new Error(startupError);

// supabase-js's own default key, pinned so that removeLocalSession clears the key the client reads.
const AUTH_STORAGE_KEY = authStorageKey(SUPABASE_URL);

// One client for the whole app. The anon key is public; every privilege comes from
// the signed-in user's JWT and Row Level Security on the server.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    storageKey: AUTH_STORAGE_KEY,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

/**
 * Removes the stored session from this phone without asking the server (the keys supabase-js
 * removes when it signs out). For a sign-out supabase-js refused: it refreshes an expired access
 * token first, and keeps the session when that fails, e.g. with no connection.
 */
export async function removeLocalSession(): Promise<void> {
  await Promise.all([AsyncStorage.removeItem(AUTH_STORAGE_KEY), AsyncStorage.removeItem(`${AUTH_STORAGE_KEY}-user`)]);
}

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
