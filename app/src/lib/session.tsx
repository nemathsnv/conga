// Session and onboarding state for the whole app. The root layout uses it to decide
// between the onboarding stack and the tabs; screens call refresh() after a server
// action so the next step is computed from server truth, never from local guesses.
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { afterSignOut, beforeSignOut } from './accountCleanup';
import { setSuspendedHandler } from './content';
import { getOnboardingState } from './api';
import { loadPendingInvite, savePendingInvite, type PendingInvite } from './pendingInvite';
import { type OnboardingState, type OnboardingStep, resolveStep } from './onboarding';
import { supabase } from './supabase';

type SessionContextValue = {
  ready: boolean;
  session: Session | null;
  state: OnboardingState | null;
  step: OnboardingStep;
  photoStepPending: boolean;
  setPhotoStepPending: (pending: boolean) => void;
  /** An invite link opened before sign-in (W-Link); cleared once redeemed. */
  pendingInvite: PendingInvite | null;
  setPendingInvite: (value: PendingInvite | null) => void;
  refresh: () => Promise<OnboardingState | null>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [stateLoadedFor, setStateLoadedFor] = useState<string | null>(null);
  const [photoStepPending, setPhotoStepPending] = useState(false);
  const [pendingInvite, setPendingInviteState] = useState<PendingInvite | null>(null);
  const latestUser = useRef<string | null>(null);

  useEffect(() => {
    void loadPendingInvite().then((value) => {
      if (value) setPendingInviteState((current) => current ?? value);
    });
  }, []);

  const setPendingInvite = useCallback((value: PendingInvite | null) => {
    setPendingInviteState(value);
    void savePendingInvite(value);
  }, []);

  const load = useCallback(async (userId: string) => {
    try {
      const next = await getOnboardingState();
      if (latestUser.current === userId) {
        setState(next);
        setStateLoadedFor(userId);
      }
      return next;
    } catch (e) {
      // This session was ended on the server (signed out everywhere, or the account deleted on
      // another phone): pre_request refuses it, and only this phone still holds it.
      if (e instanceof Error && e.message.includes('session_revoked')) {
        void supabase.auth.signOut({ scope: 'local' });
        return null;
      }
      // Keep the splash up; the auth listener retries when the session changes.
      console.warn('get_onboarding_state failed', e);
      return null;
    }
  }, []);

  // Session changes come from Supabase (an external system); state resets and loads
  // happen in those callbacks, never in an effect body.
  useEffect(() => {
    let cancelled = false;
    const apply = (next: Session | null) => {
      const userId = next?.user.id ?? null;
      const changed = latestUser.current !== userId;
      // The account that was signed in has left this phone: drop what was kept for it.
      if (changed && latestUser.current !== null) void afterSignOut();
      latestUser.current = userId;
      setSession(next);
      setSessionLoaded(true);
      if (!userId) {
        setState(null);
        setStateLoadedFor(null);
        setPhotoStepPending(false);
      } else if (changed) {
        void load(userId);
      }
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) apply(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!cancelled) apply(next);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const refresh = useCallback(async () => {
    const userId = latestUser.current;
    if (!userId) return null;
    return load(userId);
  }, [load]);

  // A 'suspended' refusal anywhere re-reads the sign-in state (LV-Suspended).
  useEffect(() => {
    setSuspendedHandler(() => void refresh());
  }, [refresh]);

  const signOut = useCallback(async () => {
    setPhotoStepPending(false);
    // While the session is still there: this phone stops getting the account's pushes, and its
    // queued events go out under it. Bounded; never stops the sign-out.
    await beforeSignOut();
    await supabase.auth.signOut();
  }, []);

  const signedIn = !!session;
  const ready = sessionLoaded && (!signedIn || stateLoadedFor === session?.user.id);
  const step = resolveStep(signedIn, state, photoStepPending);

  const value = useMemo<SessionContextValue>(
    () => ({ ready, session, state, step, photoStepPending, setPhotoStepPending, pendingInvite, setPendingInvite, refresh, signOut }),
    [ready, session, state, step, photoStepPending, pendingInvite, setPendingInvite, refresh, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
