// The recording in flight between R-Record and Post Review. One at a time; in memory only
// (the file itself is already on disk via recorder.keepSegment).
import type { PromptCard, Video } from '@/lib/content';
import type { Recording } from './types';

/** A reply take carries the video it replies to (Record-Reply, PR-Reply). */
export type Current = { recording: Recording; prompt: PromptCard; replyTo?: Video; /** A private first response for a suggestion in review (PR-Draft). */ draftFor?: string } | null;

let current: Current = null;
const listeners = new Set<() => void>();

export function setCurrentRecording(value: Current): void {
  current = value;
  listeners.forEach((l) => l());
}

export function getCurrentRecording(): Current {
  return current;
}

export function subscribeRecording(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
