// The prompts the signed-in member already has their one primary response on (SPEC.md Section 6:
// "One primary response per person per prompt. To change it, the person deletes it and records
// again."), so the + sheet can say so and Respond does not open the camera for a recording the
// server will refuse (founder iPhone test, 19 Oct: the + sheet offered answered prompts and the
// refusal came only after recording).
//
// Read from the server, never guessed. For each prompt the newest of:
// - `viewer_responded` on a prompt card, when the server sends it (supabase/proposed: not deployed
//   yet). It applies the server's own rule, true or false.
// - A refusal `already_responded`, or a response of theirs going live, on this phone.
// - The member's own responses (profile_responses: live and processing). Being listed there means
//   responded; not being listed proves nothing (a response a moderator removed holds the slot but
//   is not listed), so it never overrides the other two.
// A deletion of the member's own video forgets all but the list, which is then read again.
// The server stays the only judge: this only decides what the app offers.
import { useSyncExternalStore } from 'react';

import { profileResponses, type PromptCard } from './content';

type Evidence = { responded: boolean; at: number };

/** From the member's own responses, read at `listedAt`. */
let listed = new Set<string>();
let listedAt = 0;
/** From prompt cards and from what happened on this phone. */
let evidence = new Map<string, Evidence>();
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
  evidence = new Map();
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
    changed();
  } catch {
    // Offline or a blip: what was known stays; the server still refuses a second response.
  }
}

function record(promptId: string, responded: boolean): boolean {
  const before = hasResponded(promptId);
  evidence.set(promptId, { responded, at: now() });
  return before !== hasResponded(promptId);
}

/** Cards carry the server's answer once `viewer_responded` is deployed. */
export function applyPromptCards(cards: readonly Pick<PromptCard, 'id' | 'viewer_responded'>[]): void {
  let any = false;
  for (const c of cards) {
    if (typeof c.viewer_responded === 'boolean' && record(c.id, c.viewer_responded)) any = true;
  }
  if (any) changed();
}

/** The server refused with already_responded, or the member's response went live. */
export function markResponded(promptId: string): void {
  if (record(promptId, true)) changed();
}

/** The member deleted one of their videos: the slot may be free again. */
export function afterOwnVideoDeleted(): Promise<void> {
  evidence = new Map();
  changed();
  return refreshResponded(owner);
}

export function hasResponded(promptId: string): boolean {
  const e = evidence.get(promptId);
  if (listed.has(promptId) && (!e || listedAt >= e.at)) return true;
  return e?.responded ?? false;
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
