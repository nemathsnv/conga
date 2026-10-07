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
  /** Phase 5 (SPEC.md Section 17): a suspended account sees LV-Suspended at sign-in. */
  suspended?: boolean;
  suspension?: { action_id: string; reason: string; review_requested: boolean } | null;
  /** Posting paused until a date (A-Restricted); watching still works. */
  restriction?: { action_id: string; until: string } | null;
};

export type OnboardingStep = 'welcome' | 'age' | 'invite' | 'waitlist' | 'profile' | 'photo' | 'home' | 'suspended';

export function resolveStep(
  signedIn: boolean,
  state: OnboardingState | null,
  photoStepPending: boolean,
): OnboardingStep {
  if (!signedIn || !state) return 'welcome';
  if (state.suspended) return 'suspended';
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
  const susp = r.suspension as Record<string, unknown> | null | undefined;
  const restr = r.restriction as Record<string, unknown> | null | undefined;
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
    suspended: r.suspended === true,
    suspension: susp ? { action_id: String(susp.action_id ?? ''), reason: String(susp.reason ?? ''), review_requested: susp.review_requested === true } : null,
    restriction: restr ? { action_id: String(restr.action_id ?? ''), until: String(restr.until ?? '') } : null,
  };
}
