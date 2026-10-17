// A recording that has been posted but has not finished uploading (SPEC.md Section 19):
// it stays on the phone until it posts or the person deletes it. One at a time per member in v1:
// the Upload failed banner shows the recording that is waiting, and a second recording never
// replaces it (Nemat, 13 Oct).
//
// Each member has their own slot, so one member's post is never read, shown, retried or replaced
// for another. A post stored under the single key builds before 13 Oct used has no owner and is
// left where it is.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';

import { pendingPostFor, withRecordingFilesFound, type PendingPost } from './pendingPostState';

export type { PendingPost } from './pendingPostState';

const keyFor = (ownerId: string) => `shortcut.pendingPost.${ownerId}`;

export async function loadPendingPost(ownerId: string | null): Promise<PendingPost | null> {
  try {
    return await loadPendingPostOrThrow(ownerId);
  } catch {
    return null;
  }
}

/** For the check before a new post: storage that cannot be read must not be taken as empty. */
export async function loadPendingPostOrThrow(ownerId: string | null): Promise<PendingPost | null> {
  if (!ownerId) return null;
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(keyFor(ownerId));
  } catch {
    throw new Error('storage_failed');
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingPost;
    const post = parsed && (typeof parsed.responseId === 'string' || parsed.responseId === null) ? pendingPostFor(parsed, ownerId) : null;
    return post ? onThisPhone(post) : null;
  } catch {
    return null;
  }
}

/**
 * The post with its recording found again after an app update moved the app's folders
 * (withRecordingFilesFound). Only the copy in memory changes: the next save stores it, in the same
 * format older builds read.
 */
function onThisPhone(post: PendingPost): PendingPost {
  try {
    return withRecordingFilesFound(post, Paths.document.uri, fileExists);
  } catch {
    return post;
  }
}

function fileExists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** Best effort: a failure leaves the in-memory copy to drive this launch. */
export async function savePendingPost(ownerId: string, value: PendingPost | null): Promise<void> {
  try {
    await savePendingPostOrThrow(ownerId, value);
  } catch {
    // Best effort.
  }
}

/**
 * For the steps that must be on the phone before the next one: the request for a row, and any
 * byte sent. A post is only ever sent once the phone holds its row id, so a post stored without
 * one has provably sent nothing (what abandon_submission relies on).
 */
export async function savePendingPostOrThrow(ownerId: string, value: PendingPost | null): Promise<void> {
  if (value && value.ownerId !== ownerId) throw new Error('pending_post_owner');
  try {
    if (value) await AsyncStorage.setItem(keyFor(ownerId), JSON.stringify(value));
    else await AsyncStorage.removeItem(keyFor(ownerId));
  } catch {
    throw new Error('storage_failed');
  }
}
