// Pure state rules for a pending post (no storage imports).
import type { Recording } from './types';

export type PendingPost = {
  responseId: string;
  promptId: string;
  promptText: string;
  recording: Recording;
  caption: string | null;
  uploadId: string;
  uploadUrl: string;
  /** Mux direct-upload URLs expire; a retry after this needs a fresh one. */
  uploadUrlExpiresAt: number;
  playbackId: string | null;
  state: 'uploading' | 'processing' | 'failed';
  attempts: number;
  failedReason: string | null;
};

/** What a stored post looks like after the app comes back (killed mid-upload). */
export function resumeState(post: PendingPost): PendingPost {
  // A post killed while uploading needs Retry (the banner); one killed while processing
  // only needs its status polled again.
  return post.state === 'uploading' ? { ...post, state: 'failed', failedReason: 'interrupted' } : post;
}

export function uploadUrlUsable(post: PendingPost, now: number = Date.now()): boolean {
  return post.uploadUrlExpiresAt - now > 60_000;
}
