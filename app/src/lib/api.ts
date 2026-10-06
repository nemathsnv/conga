// Server calls for phase 2. Every function derives the acting user from the JWT on the
// server; nothing here sends a user id.
import { FunctionsHttpError } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY } from './env';
import { parseOnboardingState, type OnboardingState } from './onboarding';
import { supabase } from './supabase';

export type InviteStatus = 'valid' | 'not_found' | 'expired' | 'used' | 'already_in';

export type InviteCheck = {
  status: InviteStatus;
  cohort?: string;
  inviter_name?: string | null;
  inviter_first_name?: string | null;
  inviter_photo_path?: string | null;
};

export type UsernameStatus = 'available' | 'taken' | 'invalid';

/** Error raised by a server function, e.g. "username_taken". */
export class ServerError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new ServerError(res.error.message);
  return res.data;
}

export async function getOnboardingState(): Promise<OnboardingState> {
  const data = unwrap(await supabase.rpc('get_onboarding_state'));
  return parseOnboardingState(data);
}

export async function confirmAge(): Promise<void> {
  unwrap(await supabase.rpc('confirm_age'));
}

export async function checkInvite(code: string): Promise<InviteCheck> {
  return unwrap(await supabase.rpc('check_invite', { p_code: code })) as InviteCheck;
}

export async function redeemInvite(code: string): Promise<InviteCheck> {
  return unwrap(await supabase.rpc('redeem_invite', { p_code: code })) as InviteCheck;
}

export async function joinWaitlist(): Promise<void> {
  unwrap(await supabase.rpc('join_waitlist'));
}

export async function usernameStatus(username: string): Promise<UsernameStatus> {
  return unwrap(await supabase.rpc('username_status', { p_username: username })) as UsernameStatus;
}

export async function usernameSuggestions(name: string, username: string): Promise<string[]> {
  const data = unwrap(await supabase.rpc('username_suggestions', { p_name: name, p_username: username }));
  return Array.isArray(data) ? data.map(String) : [];
}

export async function createProfile(name: string, username: string): Promise<void> {
  unwrap(await supabase.rpc('create_profile', { p_name: name, p_username: username }));
}

export async function setProfilePhoto(path: string | null): Promise<void> {
  unwrap(await supabase.rpc('set_profile_photo', { p_path: path }));
}

/** Which sign-in methods an email already uses (E-Linked). Empty when unknown. */
export async function signinProviders(email: string): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke('auth-signin-method', {
    body: { email },
    headers: { apikey: SUPABASE_ANON_KEY },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) throw new ServerError('signin_method_failed');
    throw error;
  }
  return Array.isArray(data?.providers) ? data.providers.map(String) : [];
}

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
