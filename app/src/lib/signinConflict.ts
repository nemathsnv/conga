// Server rule (migration 20261006000400): one sign-in method per account. When a second
// provider is attempted, the database raises "signin_method_conflict:<existing provider>".
// Supabase may wrap that text; this finds it wherever it sits in the message.

export type SignInProvider = 'apple' | 'google' | 'email';

export function parseSignInConflict(message: string | null | undefined): SignInProvider | null {
  const m = /signin_method_conflict:(apple|google|email)/.exec(message ?? '');
  return m ? (m[1] as SignInProvider) : null;
}

export function providerLabel(provider: SignInProvider): string {
  return provider === 'apple' ? 'Apple' : provider === 'google' ? 'Google' : 'email';
}
