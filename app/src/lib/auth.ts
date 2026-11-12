// Sign-in methods (SPEC.md Section 13): Apple, Google and email code. No passwords, no phone.
// Each method ends in a Supabase session; the rest of onboarding is driven by server state.
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { signinProviders } from './api';
import { FOUNDER_BUILD, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from './env';
import { parseSignInConflict, type SignInProvider } from './signinConflict';
import { supabase } from './supabase';
import { OTP_LENGTH } from './validation';

export type SignInMethod = 'apple' | 'google' | 'email';

/** Thrown when the person dismissed the provider's sheet. Not an error to show. */
export class SignInCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

/**
 * The email already signs in another way (E-Linked). Raised for every method: the server
 * refuses a second provider on an account, and the email path checks before sending a code.
 */
export class SignInMethodConflict extends Error {
  constructor(
    public readonly existingProvider: SignInProvider,
    public readonly email: string | null,
  ) {
    super(`signin_method_conflict:${existingProvider}`);
  }
}

export class SignInNotConfigured extends Error {
  constructor(method: SignInMethod) {
    super(`${method}_not_configured`);
  }
}

const APPLE_REDIRECT = 'shortcut://auth/callback';

export async function signInWithApple(): Promise<void> {
  // The founder build has no Sign in with Apple entitlement (free Personal Team).
  if (FOUNDER_BUILD) throw new SignInNotConfigured('apple');
  if (Platform.OS === 'ios') {
    const rawNonce = randomNonce();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new SignInCancelled();
      throw e;
    }
    if (!credential.identityToken) throw new Error('apple_no_identity_token');
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw await conflictOrError(error, credential.email ?? emailFromIdToken(credential.identityToken), 'apple');
    return;
  }

  // Android: Apple has no native SDK, so Supabase runs the web flow in a browser sheet
  // and returns to the app with a PKCE code.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: APPLE_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('apple_no_auth_url');
  const result = await WebBrowser.openAuthSessionAsync(data.url, APPLE_REDIRECT);
  if (result.type !== 'success') throw new SignInCancelled();
  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('apple_no_code');
  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error) throw await conflictOrError(exchange.error, null, 'apple');
}

export function googleConfigured(): boolean {
  return GOOGLE_WEB_CLIENT_ID.length > 0 && (Platform.OS !== 'ios' || GOOGLE_IOS_CLIENT_ID.length > 0);
}

export async function signInWithGoogle(): Promise<void> {
  if (!googleConfigured()) throw new SignInNotConfigured('google');
  // Loaded lazily: the native module throws at import time when the config plugin was
  // left out of the build (no Google credentials yet).
  const { GoogleSignin, statusCodes } = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
  });
  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }
  let idToken: string | null = null;
  let googleEmail: string | null = null;
  try {
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') throw new SignInCancelled();
    idToken = response.data.idToken;
    googleEmail = response.data.user.email ?? null;
  } catch (e) {
    if ((e as { code?: string }).code === statusCodes.SIGN_IN_CANCELLED) throw new SignInCancelled();
    throw e;
  }
  if (!idToken) throw new Error('google_no_id_token');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw await conflictOrError(error, googleEmail, 'google');
}

/**
 * Turns the server's one-method-per-account refusal into SignInMethodConflict. If the
 * message was wrapped beyond recognition, the sign-in method lookup for the provider's
 * email settles it; otherwise the original error is returned.
 */
async function conflictOrError(error: Error, email: string | null, attempted: SignInProvider): Promise<Error> {
  const parsed = parseSignInConflict(error.message);
  if (parsed) return new SignInMethodConflict(parsed, email);
  if (email && /database error/i.test(error.message)) {
    try {
      const providers = await signinProviders(email);
      const existing = providers.find((p): p is SignInProvider => p !== attempted && (p === 'apple' || p === 'google' || p === 'email'));
      if (existing) return new SignInMethodConflict(existing, email);
    } catch {
      // fall through to the original error
    }
  }
  return error;
}

/** The email claim of an Apple identity token (present on every sign-in, unlike credential.email). */
function emailFromIdToken(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(decodeBase64Url(payload)) as { email?: string };
    return typeof json.email === 'string' ? json.email : null;
  } catch {
    return null;
  }
}

function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return decodeURIComponent(
    Array.from(atob(base64), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
  );
}

/** Sends the 6-digit code. Creates the identity on first use (SPEC.md Section 13). */
export async function sendEmailCode(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

/** Returns false when the code is wrong or expired (E-Code). */
export async function verifyEmailCode(email: string, code: string): Promise<boolean> {
  if (code.length !== OTP_LENGTH) return false;
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code,
    type: 'email',
  });
  if (!error) return true;
  if (error.status === 403 || error.status === 401 || /invalid|expired/i.test(error.message)) return false;
  throw error;
}

function randomNonce(): string {
  const bytes = Crypto.getRandomBytes(32);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
