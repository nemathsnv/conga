// Onboarding state (from get_onboarding_state) and the pure route resolver.
// SPEC.md Section 13: sign in -> 18+ -> invite (beta only) -> name and username -> photo -> Home.

export type OnboardingProfile = {
  name: string;
  username: string;
  photo_path: string | null;
};

export type OnboardingState = {
  email: string | null;
  age_confirmed: boolean;
  invite_required: boolean;
  has_beta_access: boolean;
  waitlisted: boolean;
  has_profile: boolean;
  profile: OnboardingProfile | null;
};

export type OnboardingStep = 'welcome' | 'age' | 'invite' | 'waitlist' | 'profile' | 'photo' | 'home';

export function resolveStep(
  signedIn: boolean,
  state: OnboardingState | null,
  photoStepPending: boolean,
): OnboardingStep {
  if (!signedIn || !state) return 'welcome';
  if (!state.age_confirmed) return 'age';
  if (state.invite_required && !state.has_beta_access) {
    return state.waitlisted ? 'waitlist' : 'invite';
  }
  if (!state.has_profile) return 'profile';
  if (photoStepPending) return 'photo';
  return 'home';
}

export function parseOnboardingState(raw: unknown): OnboardingState {
  const r = (raw ?? {}) as Record<string, unknown>;
  const p = r.profile as Record<string, unknown> | null | undefined;
  return {
    email: typeof r.email === 'string' ? r.email : null,
    age_confirmed: r.age_confirmed === true,
    invite_required: r.invite_required !== false,
    has_beta_access: r.has_beta_access === true,
    waitlisted: r.waitlisted === true,
    has_profile: r.has_profile === true,
    profile: p
      ? {
          name: String(p.name ?? ''),
          username: String(p.username ?? ''),
          photo_path: typeof p.photo_path === 'string' ? p.photo_path : null,
        }
      : null,
  };
}
