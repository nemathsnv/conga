import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { FOUNDER_BUILD, founderConfigError, SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

const founderError = FOUNDER_BUILD ? founderConfigError(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
if (founderError) throw new Error(founderError);

// One client for the whole app. The anon key is public; every privilege comes from
// the signed-in user's JWT and Row Level Security on the server.
export const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_ANON_KEY || 'anon', {
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
