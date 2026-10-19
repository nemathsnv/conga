// The prompts the signed-in member has responded to at least once, so the + sheet can offer
// "Respond again" on them instead of "Respond". A member may respond to the same prompt any number
// of times (Nemat, 19 Oct 2026; SPEC.md Section 6); this decides a label only, never whether the
// camera opens. The server is the only judge of a post.
//
// Read from the server, never guessed:
// - The member's own responses (profile_responses: live and processing).
// - What happened on this phone: a response of theirs accepted or live, or (an older server, before
//   20261019000200) a refusal `already_responded`.
// A deletion of the member's own video forgets the marks and reads the list again.
import { useSyncExternalStore } from 'react';

import { profileResponses } from './content';

/** From the member's own responses, read at `listedAt`. */
let listed = new Set<string>();
let listedAt = 0;
/** From what happened on this phone, with when. */
let marked = new Map<string, number>();
let owner: string | null = null;
let version = 0;
const listeners = new Set<() => void>();
let now: () => number = Date.now;

function changed(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function clear(): void {
  listed = new Set();
  listedAt = 0;
  marked = new Map();
}

/** Loads the member's own responses. Keeps what it had if the server cannot answer. */
export async function refreshResponded(ownerId: string | null): Promise<void> {
  if (ownerId !== owner) {
    owner = ownerId;
    clear();
    changed();
  }
  if (!ownerId) return;
  const startedAt = now();
  try {
    const mine = await profileResponses(ownerId, 60);
    if (owner !== ownerId || startedAt < listedAt) return;
    listed = new Set(mine.filter((r) => r.status === 'live' || r.status === 'processing').map((r) => r.prompt_id));
    listedAt = startedAt;
    // A mark the list has caught up with is no longer needed; a newer one (a post the list was
    // read before) stays.
    for (const [promptId, at] of marked) if (at <= startedAt) marked.delete(promptId);
    changed();
  } catch {
    // Offline or a blip: what was known stays.
  }
}

/** A response of the member's to this prompt was accepted or went live on this phone. */
export function markResponded(promptId: string): void {
  const before = hasResponded(promptId);
  marked.set(promptId, now());
  if (!before) changed();
}

/** The member deleted one of their videos: the list is read again. */
export function afterOwnVideoDeleted(): Promise<void> {
  marked = new Map();
  changed();
  return refreshResponded(owner);
}

export function hasResponded(promptId: string): boolean {
  return listed.has(promptId) || marked.has(promptId);
}

/** Re-renders when what is known changes. */
export function useRespondedVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => version,
  );
}

/** Sign-out or another account: nothing carries over. */
export function resetResponded(): void {
  owner = null;
  clear();
  changed();
}

/** Test seam. */
export function _setClockForTests(clock: () => number): void {
  now = clock;
}
