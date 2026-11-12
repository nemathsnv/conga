// Invite link: shortcut://i/<code> (and conga.churntech.com/i/<code> once the domain exists).
// Looks the code up, keeps it for the invite step, and opens Welcome with the inviter's
// card (W-Link). SPEC.md Section 14: invite links skip the code step.
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { invitePreview } from '@/lib/api';
import { useSession } from '@/lib/session';
import { normaliseInviteCode } from '@/lib/validation';

export default function InviteLinkScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { setPendingInvite, step } = useSession();
  const normalised = normaliseInviteCode(String(code ?? ''));
  // Someone already in the app has no use for an invite; an empty code has nothing to look up.
  const skip = !normalised || step === 'home';
  const [looked, setLooked] = useState<string | null>(null);

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    void invitePreview(normalised)
      .then((preview) => {
        if (!cancelled) setPendingInvite({ code: normalised, preview });
      })
      .catch((e) => console.error('invite_preview failed', e))
      .finally(() => {
        if (!cancelled) setLooked(normalised);
      });
    return () => {
      cancelled = true;
    };
  }, [normalised, skip, setPendingInvite]);

  if (skip) return <Redirect href={step === 'home' ? '/(tabs)' : '/(onboarding)'} />;
  if (looked !== normalised) return null;
  return <Redirect href="/(onboarding)" />;
}
