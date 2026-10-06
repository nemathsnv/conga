import {
  formatCountdown,
  inviteCodeComplete,
  isValidEmail,
  nameOk,
  normaliseInviteCode,
  normaliseName,
  normaliseOtp,
  normaliseUsername,
  usernameFormatOk,
} from '@/lib/validation';

describe('email', () => {
  it('accepts ordinary addresses and Apple relay addresses', () => {
    expect(isValidEmail('lena@hey.com')).toBe(true);
    expect(isValidEmail(' lena@hey.com ')).toBe(true);
    expect(isValidEmail('abc123@privaterelay.appleid.com')).toBe(true);
  });
  it('rejects incomplete addresses', () => {
    expect(isValidEmail('lena')).toBe(false);
    expect(isValidEmail('lena@')).toBe(false);
    expect(isValidEmail('lena@hey')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('username (SPEC.md Section 9: 3-24, lowercase letters, digits, dot, underscore)', () => {
  it('normalises as typed', () => {
    expect(normaliseUsername('Lena Hart!')).toBe('lenahart');
    expect(normaliseUsername('lena.hart_1')).toBe('lena.hart_1');
    expect(normaliseUsername('a'.repeat(30))).toHaveLength(24);
  });
  it('validates the final shape', () => {
    expect(usernameFormatOk('len')).toBe(true);
    expect(usernameFormatOk('le')).toBe(false);
    expect(usernameFormatOk('a'.repeat(24))).toBe(true);
    expect(usernameFormatOk('a'.repeat(25))).toBe(false);
    expect(usernameFormatOk('Lena')).toBe(false);
    expect(usernameFormatOk('lena-hart')).toBe(false);
  });
});

describe('name (up to 40 characters)', () => {
  it('collapses whitespace and caps the length', () => {
    expect(normaliseName('Lena   Hart')).toBe('Lena Hart');
    expect(normaliseName('x'.repeat(50))).toHaveLength(40);
  });
  it('needs at least one character', () => {
    expect(nameOk('   ')).toBe(false);
    expect(nameOk('Lena')).toBe(true);
  });
});

describe('invite code (readable, e.g. PUTU-7K2)', () => {
  it('upper-cases and strips other characters', () => {
    expect(normaliseInviteCode('putu-7k2')).toBe('PUTU-7K2');
    expect(normaliseInviteCode(' putu 7k2 ')).toBe('PUTU7K2');
  });
  it('knows when a code has its full shape', () => {
    expect(inviteCodeComplete('PUTU-7K2')).toBe(true);
    expect(inviteCodeComplete('SC-ABC')).toBe(true);
    expect(inviteCodeComplete('PUTU7K2')).toBe(false);
    expect(inviteCodeComplete('P-7')).toBe(false);
  });
});

describe('email code', () => {
  it('keeps six digits', () => {
    expect(normaliseOtp('48 29-15')).toBe('482915');
    expect(normaliseOtp('1234567')).toBe('123456');
  });
  it('formats the resend countdown as m:ss', () => {
    expect(formatCountdown(24)).toBe('0:24');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});
