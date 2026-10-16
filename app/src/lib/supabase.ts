import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { configError, SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

// No fallback server: a build with a missing or (outside development) non-hosted URL stops here
// with the reason, instead of quietly talking to localhost.
const startupError = configError(SUPABASE_URL, SUPABASE_ANON_KEY, __DEV__);
if (startupError) throw new Error(startupError);

// One client for the whole app. The anon key is public; every privilege comes from
// the signed-in user's JWT and Row Level Security on the server.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
