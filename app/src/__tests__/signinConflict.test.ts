import { parseSignInConflict, providerLabel } from '@/lib/signinConflict';

describe('parseSignInConflict', () => {
  it('finds the existing provider in the raw database message', () => {
    expect(parseSignInConflict('signin_method_conflict:apple')).toBe('apple');
  });
  it('finds it when Supabase wraps the message', () => {
    expect(parseSignInConflict('Database error saving new identity: ERROR: signin_method_conflict:email (SQLSTATE P0001)')).toBe('email');
  });
  it('returns null for other errors', () => {
    expect(parseSignInConflict('Invalid login credentials')).toBeNull();
    expect(parseSignInConflict(undefined)).toBeNull();
  });
  it('labels providers the way the E-Linked copy reads', () => {
    expect(providerLabel('apple')).toBe('Apple');
    expect(providerLabel('google')).toBe('Google');
    expect(providerLabel('email')).toBe('email');
  });
});
