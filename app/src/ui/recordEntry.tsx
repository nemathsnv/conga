// Camera entry (P7 and P8): Respond, Reply and Record do not open the camera while the member's last
// recording is waiting (failed, offline, or a discard Conga has not confirmed) or still posting.
// The sheet says why; no second take exists to replace the first. Every place that opens the camera
// goes through useOpenRecord. Reads the posting state (app/src/video), never changes it.
// Respond always opens the camera when nothing is waiting: a member may respond to the same prompt
// any number of times (Nemat, 19 Oct 2026; SPEC.md Section 6).
// The sheet is the route app/camera-blocked.tsx, not a <Modal> (ui/OverlaySheet.tsx says why).
import { useRouter, type Href } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { refreshResponded } from '@/lib/responded';
import { useSession } from '@/lib/session';

import { cameraBlock } from '@/ui/failedPost';
import { usePosting } from '@/video/posting';

type RecordEntry = {
  /** Opens the camera, or shows P7 or P8 and does not. `replace` swaps the current screen (sheets). */
  open: (href: Href, mode?: 'push' | 'replace') => void;
  /** Shows the P7 or P8 sheet for the current state, if one applies (for Post Review's post_pending refusal). Returns whether it did. */
  showBlock: () => boolean;
};

const RecordEntryContext = createContext<RecordEntry | null>(null);

export function RecordEntryProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const posting = usePosting();
  const { session, step } = useSession();
  // Only a member (step 'home') may read profile_responses: before that the member gate refuses
  // it with profile_required (20261102000100_member_gate.sql), so it would only fail in the background.
  const ownerId = step === 'home' ? session?.user.id ?? null : null;
  const block = cameraBlock(posting.state);

  // The member's own responses (the + sheet's "Respond again"): at sign-in and whenever the app
  // comes back to the foreground.
  useEffect(() => {
    void refreshResponded(ownerId);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void refreshResponded(ownerId);
    });
    return () => sub.remove();
  }, [ownerId]);

  // `navigate`, not `push`: a second tap while the sheet opens does not stack another one.
  const showSheet = useCallback(() => {
    if (!block) return false;
    router.navigate({ pathname: '/camera-blocked', params: { kind: block } });
    return true;
  }, [block, router]);

  const open = useCallback<RecordEntry['open']>(
    (href, mode = 'push') => {
      if (showSheet()) return;
      if (mode === 'replace') router.replace(href);
      else router.push(href);
    },
    [showSheet, router],
  );

  const value = useMemo(() => ({ open, showBlock: showSheet }), [open, showSheet]);
  return <RecordEntryContext.Provider value={value}>{children}</RecordEntryContext.Provider>;
}

export function useOpenRecord(): RecordEntry {
  const ctx = useContext(RecordEntryContext);
  if (!ctx) throw new Error('useOpenRecord must be used inside RecordEntryProvider');
  return ctx;
}
