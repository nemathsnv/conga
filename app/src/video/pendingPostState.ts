// Pure state rules for a pending post (no storage imports).
import type { Recording } from './types';

export type PendingPost = {
  /** The member who posted it. Only they see its banner or can Retry it; another member signed in
   *  on this phone never does. Missing on a post stored by a build before 13 Oct. */
  ownerId: string;
  /** The posted row's id (a response or a video reply; both live in responses). Null when no
   *  upload URL could be had at Post: Retry gets one and creates the row. */
  responseId: string | null;
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
  /** waiting: Post was tapped offline; the upload starts by itself when the connection returns (Nemat, 9 Oct). */
  state: 'waiting' | 'uploading' | 'processing' | 'failed';
  attempts: number;
  failedReason: string | null;
};

/** How long a stored upload URL is used, from when it was asked for (ticketStore's mintedAt). The
 *  server's slot and Mux's URL last 60 minutes from moments after that. */
export const UPLOAD_URL_TTL_MS = 55 * 60 * 1000;

/**
 * The post stored when Post is tapped. `upload` is the row and URL Post got (null when no URL could
 * be had: Retry gets one). The URL lasts from when it was asked for, which may be well before Post
 * (Post Review holds it), not from Post.
 */
export function newPendingPost(
  args: { ownerId: string; recording: Recording; promptId: string; promptText: string; caption: string | null; replyTo?: { id: string; name: string }; draftFor?: string },
  upload: { responseId: string; uploadId: string; uploadUrl: string; mintedAt: number } | null,
  state: PendingPost['state'],
  failedReason: string | null = null,
): PendingPost {
  return {
    ownerId: args.ownerId,
    responseId: upload?.responseId ?? null,
    kind: args.draftFor ? 'draft' : args.replyTo ? 'reply' : 'response',
    draftFor: args.draftFor ?? null,
    replyToId: args.replyTo?.id ?? null,
    replyToName: args.replyTo?.name ?? null,
    promptId: args.promptId,
    promptText: args.promptText,
    recording: args.recording,
    caption: args.caption,
    uploadId: upload?.uploadId ?? '',
    uploadUrl: upload?.uploadUrl ?? '',
    uploadUrlExpiresAt: upload ? upload.mintedAt + UPLOAD_URL_TTL_MS : 0,
    playbackId: null,
    state,
    attempts: 0,
    failedReason,
  };
}

/** What a stored post looks like after the app comes back (killed mid-upload). */
export function resumeState(post: PendingPost): PendingPost {
  // A post killed while uploading, or while waiting offline, needs Retry (the banner): no queue
  // survives the app closing (SPEC.md Section 19). One killed while processing only needs its
  // status polled again.
  if (post.state === 'uploading') return { ...post, state: 'failed', failedReason: 'interrupted' };
  if (post.state === 'waiting') return { ...post, state: 'failed', failedReason: 'offline' };
  return post;
}

/**
 * The stored post if it belongs to this member, else null. A post stored before posts had an owner
 * belongs to nobody: whose it is cannot be known, and Retry would post it as the signed-in member.
 */
export function pendingPostFor(post: PendingPost | null, ownerId: string | null): PendingPost | null {
  if (!post || !ownerId || typeof post.ownerId !== 'string') return null;
  return post.ownerId === ownerId ? post : null;
}

export function uploadUrlUsable(post: PendingPost, now: number = Date.now()): boolean {
  return post.uploadUrlExpiresAt - now > 60_000;
}
