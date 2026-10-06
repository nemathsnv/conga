// An invite link (shortcut://i/<code>, later shortcut.app/i/<code>) opened before sign-in.
// Kept on the phone until the code is redeemed, so the person skips the code step (W-Link).
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { InvitePreview } from './api';

const KEY = 'shortcut.pendingInvite';

export type PendingInvite = { code: string; preview: InvitePreview };

export async function loadPendingInvite(): Promise<PendingInvite | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingInvite;
    return parsed && typeof parsed.code === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export async function savePendingInvite(value: PendingInvite | null): Promise<void> {
  try {
    if (value) await AsyncStorage.setItem(KEY, JSON.stringify(value));
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // Best effort: the code is still in memory for this launch.
  }
}
