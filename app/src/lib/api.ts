// Server calls for phase 2. Every function derives the acting user from the JWT on the
// server; nothing here sends a user id.
import { FunctionsHttpError } from '@supabase/supabase-js';

import { track } from './analytics';
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
  /** refused: the server answered with an error code, so nothing it was asked to do happened (the
   *  transaction rolled back). False when there was no such answer (no connection, a gateway
   *  error): the request may or may not have been carried out. */
  constructor(public readonly code: string, public readonly refused: boolean = true) {
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
  track('age_confirmed');
}

export async function checkInvite(code: string): Promise<InviteCheck> {
  return unwrap(await supabase.rpc('check_invite', { p_code: code })) as InviteCheck;
}

export type InvitePreview = {
  status: InviteStatus;
  inviter_name?: string | null;
  inviter_photo_path?: string | null;
  cohort_name?: string | null;
};

/** What an invite link shows before sign-in (W-Link). Works without a session. */
export async function invitePreview(code: string): Promise<InvitePreview> {
  return unwrap(await supabase.rpc('invite_preview', { p_code: code })) as InvitePreview;
}

export async function redeemInvite(code: string, source: 'code' | 'link' = 'code'): Promise<InviteCheck> {
  const result = unwrap(await supabase.rpc('redeem_invite', { p_code: code })) as InviteCheck;
  if (result.status === 'valid' || result.status === 'already_in') track('invite_redeemed', { source });
  else track('invite_failed', { source, reason: result.status });
  return result;
}

export async function joinWaitlist(): Promise<void> {
  unwrap(await supabase.rpc('join_waitlist'));
  track('waitlist_joined');
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
  const { data } = await supabase.auth.getSession();
  track('signup_completed', { method: String(data.session?.user.app_metadata?.provider ?? 'unknown') });
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
