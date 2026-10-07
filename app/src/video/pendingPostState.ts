// Pure state rules for a pending post (no storage imports).
import type { Recording } from './types';

export type PendingPost = {
  /** The posted row's id (a response or a video reply; both live in responses). */
  responseId: string;
  kind: 'response' | 'reply' | 'draft';
  /** Drafts: the suggestion the draft belongs to. */
  draftFor: string | null;
  /** Replies: the video replied to and its author's first name, for the banner. */
  replyToId: string | null;
  replyToName: string | null;
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
