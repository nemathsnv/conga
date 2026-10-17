// P9: the sign-out warning, before every sign-out while a recording waits to post: Settings,
// LV-Suspended, and the end of Delete account (the Apple and Google path, and confirm email).
// `confirm()` resolves true when there is nothing waiting or the person taps "Sign out anyway", and
// false on Cancel. Then the caller runs `signOut()` from this hook: it first discards the waiting
// recording the way Discard does (stops the upload; one Conga cannot confirm yet stays private on
// this phone under this account) and never blocks the sign-out.
//
// P9 was approved as drawn by Nemat on 16 Oct 2026 (design/BOARDS.md, "Failed posts").
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal } from 'react-native';

import { useSession } from '@/lib/session';
import { ActionSheet } from '@/ui/ActionSheet';
import { SIGN_OUT_SHEET } from '@/ui/failedPost';
import { loadPendingPost } from '@/video/pendingPost';
import { usePosting } from '@/video/posting';

export function useSignOutWarning(): { confirm: () => Promise<boolean>; signOut: () => Promise<void>; sheet: ReactNode } {
  const { session, signOut: signOutOfSession } = useSession();
  const posting = usePosting();
  const [asking, setAsking] = useState(false);
  const answer = useRef<((ok: boolean) => void) | null>(null);

  const finish = useCallback((ok: boolean) => {
    setAsking(false);
    answer.current?.(ok);
    answer.current = null;
  }, []);

  const confirm = useCallback(async () => {
    // Only this member's own waiting recording counts.
    const pending = await loadPendingPost(session?.user.id ?? null);
    if (!pending) return true;
    return new Promise<boolean>((resolve) => {
      answer.current = resolve;
      setAsking(true);
    });
  }, [session]);

  const signOut = useCallback(async () => {
    await posting.deleteUnposted();
    await signOutOfSession();
  }, [posting, signOutOfSession]);

  const sheet = (
    <Modal visible={asking} transparent animationType="fade" onRequestClose={() => finish(false)}>
      <ActionSheet
        title={SIGN_OUT_SHEET.title}
        lines={[SIGN_OUT_SHEET.line]}
        actions={[{ label: SIGN_OUT_SHEET.signOut, destructive: true, onPress: () => finish(true) }]}
        cancelLabel={SIGN_OUT_SHEET.cancel}
        onCancel={() => finish(false)}
      />
    </Modal>
  );
  return { confirm, signOut, sheet };
}
