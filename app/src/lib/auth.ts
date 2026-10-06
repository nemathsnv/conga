// Sign-in methods (SPEC.md Section 13): Apple, Google and email code. No passwords, no phone.
// Each method ends in a Supabase session; the rest of onboarding is driven by server state.
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from './env';
import { supabase } from './supabase';
import { OTP_LENGTH } from './validation';

export type SignInMethod = 'apple' | 'google' | 'email';

/** Thrown when the person dismissed the provider's sheet. Not an error to show. */
export class SignInCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

export class SignInNotConfigured extends Error {
  constructor(method: SignInMethod) {
    super(`${method}_not_configured`);
  }
}

const APPLE_REDIRECT = 'shortcut://auth/callback';

export async function signInWithApple(): Promise<void> {
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
    if (error) throw error;
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
  if (exchange.error) throw exchange.error;
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
  try {
    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') throw new SignInCancelled();
    idToken = response.data.idToken;
  } catch (e) {
    if ((e as { code?: string }).code === statusCodes.SIGN_IN_CANCELLED) throw new SignInCancelled();
    throw e;
  }
  if (!idToken) throw new Error('google_no_id_token');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
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
