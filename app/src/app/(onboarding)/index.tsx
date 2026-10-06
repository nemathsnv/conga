import { Redirect } from 'expo-router';

import { useSession } from '@/lib/session';

// Lands on the step the server state says comes next (SPEC.md Section 13 order).
export default function OnboardingIndex() {
  const { step } = useSession();
  switch (step) {
    case 'age':
      return <Redirect href="/(onboarding)/age" />;
    case 'invite':
      return <Redirect href="/(onboarding)/invite" />;
    case 'waitlist':
      return <Redirect href="/(onboarding)/waitlist" />;
    case 'profile':
      return <Redirect href="/(onboarding)/profile" />;
    case 'photo':
      return <Redirect href="/(onboarding)/photo" />;
    default:
      return <Redirect href="/(onboarding)/welcome" />;
  }
}
