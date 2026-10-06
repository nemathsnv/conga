// Pure rules from SPEC.md Sections 9, 13 and 14. No I/O, fully unit-tested.

export const NAME_MAX = 40;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;
export const USERNAME_RE = /^[a-z0-9._]{3,24}$/;
export const INVITE_CODE_RE = /^[A-Z0-9]{2,12}-[A-Z0-9]{2,8}$/;
export const OTP_LENGTH = 6;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= 254 && EMAIL_RE.test(v);
}

/** Lowercase letters, digits, dot and underscore only; everything else is dropped as typed. */
export function normaliseUsername(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, USERNAME_MAX);
}

export function usernameFormatOk(value: string): boolean {
  return USERNAME_RE.test(value);
}

export function normaliseName(value: string): string {
  return value.replace(/\s+/g, ' ').slice(0, NAME_MAX);
}

export function nameOk(value: string): boolean {
  const v = value.trim();
  return v.length >= 1 && v.length <= NAME_MAX;
}

/** Upper-case, keep letters, digits and the dash, as the person types. */
export function normaliseInviteCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 21);
}

export function inviteCodeComplete(value: string): boolean {
  return INVITE_CODE_RE.test(value);
}

export function normaliseOtp(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_LENGTH);
}

/** "0:24" style countdown for "Resend code in 0:24" (O-Email). */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
