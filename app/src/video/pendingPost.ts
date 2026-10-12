// A recording that has been posted but has not finished uploading (SPEC.md Section 19):
// it stays on the phone until it posts or the person deletes it. One at a time in v1:
// the Upload failed banner shows the recording that is waiting.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PendingPost } from './pendingPostState';

export type { PendingPost } from './pendingPostState';

const KEY = 'shortcut.pendingPost';

export async function loadPendingPost(): Promise<PendingPost | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingPost;
    return parsed && (typeof parsed.responseId === 'string' || parsed.responseId === null) ? parsed : null;
  } catch {
    return null;
  }
}

export async function savePendingPost(value: PendingPost | null): Promise<void> {
  try {
    if (value) await AsyncStorage.setItem(KEY, JSON.stringify(value));
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // Best effort; the in-memory copy still drives this launch.
  }
}
