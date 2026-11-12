import { parseOnboardingState, resolveStep, type OnboardingState } from '@/lib/onboarding';

const base: OnboardingState = {
  email: 'lena@hey.com',
  age_confirmed: false,
  invite_required: true,
  has_beta_access: false,
  waitlisted: false,
  has_profile: false,
  profile: null,
};

describe('resolveStep (SPEC.md Section 13 order)', () => {
  it('starts at welcome without a session', () => {
    expect(resolveStep(false, null, false)).toBe('welcome');
    expect(resolveStep(false, base, false)).toBe('welcome');
  });
  it('asks for 18+ first', () => {
    expect(resolveStep(true, base, false)).toBe('age');
  });
  it('then the invite step during the beta', () => {
    expect(resolveStep(true, { ...base, age_confirmed: true }, false)).toBe('invite');
  });
  it('shows the waitlist screen to someone who joined it', () => {
    expect(resolveStep(true, { ...base, age_confirmed: true, waitlisted: true }, false)).toBe('waitlist');
  });
  it('skips the invite step once invite_required is off', () => {
    expect(resolveStep(true, { ...base, age_confirmed: true, invite_required: false }, false)).toBe('profile');
  });
  it('goes to name and username with beta access', () => {
    expect(resolveStep(true, { ...base, age_confirmed: true, has_beta_access: true }, false)).toBe('profile');
  });
  it('shows the photo step only right after the profile was created', () => {
    const withProfile = { ...base, age_confirmed: true, has_beta_access: true, has_profile: true };
    expect(resolveStep(true, withProfile, true)).toBe('photo');
    expect(resolveStep(true, withProfile, false)).toBe('home');
    expect(resolveStep(true, { ...withProfile, suspended: true, suspension: { action_id: 'a', reason: 'r', review_requested: false } }, false)).toBe('suspended');
  });
  it('never asks a member for the invite again', () => {
    const member = { ...base, age_confirmed: true, has_beta_access: true, has_profile: true };
    expect(resolveStep(true, { ...member, invite_required: true }, false)).toBe('home');
  });
});

describe('parseOnboardingState', () => {
  it('reads the server payload', () => {
    expect(
      parseOnboardingState({
        email: 'lena@hey.com',
        age_confirmed: true,
        invite_required: false,
        has_beta_access: true,
        waitlisted: false,
        has_profile: true,
        profile: { name: 'Lena Hart', username: 'lenahart', photo_path: null },
      }),
    ).toEqual({
      email: 'lena@hey.com',
      age_confirmed: true,
      invite_required: false,
      has_beta_access: true,
      waitlisted: false,
      has_profile: true,
      profile: { name: 'Lena Hart', username: 'lenahart', photo_path: null },
      suspended: false,
      suspension: null,
      restriction: null,
    });
  });
  it('fails closed: a missing invite_required means the beta gate is on', () => {
    expect(parseOnboardingState({}).invite_required).toBe(true);
    expect(parseOnboardingState(null).has_profile).toBe(false);
  });
});
