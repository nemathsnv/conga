// Copy and rules for the failed-post boards P1 to P9 (design/proposals/FAILED-POST-REVIEW.md).
// Pure: no React, no storage. The words are the boards' words, word for word.
//
// NOT APPROVED YET. These boards are proposals awaiting Nemat's visual approval; this file lives on
// the holding branch hold/failed-post-ui and is not integrated until they are approved.
import type { PendingPost } from '@/video/pendingPostState';
import type { PostingState } from '@/video/uploadRun';

type Kind = PendingPost['kind'];

/** Which banner a failed post draws. */
export type FailedView =
  /** P1: a retry can help. Discard beside Retry. */
  | 'retry'
  /** P2: it can never post. Discard only. */
  | 'cannot_post'
  /** P3: the file is gone from the phone. Discard only. */
  | 'file_gone'
  /** P5: Discard was asked and Conga has not confirmed it yet. No buttons. */
  | 'discarding';

/** Refusals Retry cannot fix: already responded, prompt or video gone, removed, a closed submission,
 *  a conflicting request. (A busy server, a limit or the connection stay P1.) */
const CANNOT_POST = ['already_responded', 'prompt_not_found', 'prompt_not_live', 'video_not_found', 'response_not_found', 'response_removed', 'response_deleted', 'submission_closed', 'submission_conflict', 'draft_not_found', 'suggestion_not_found'];

export function failedView(post: Pick<PendingPost, 'failedReason' | 'discardRequested'>): FailedView {
  if (post.discardRequested) return 'discarding';
  const reason = post.failedReason ?? '';
  if (reason === 'recording_missing') return 'file_gone';
  if (CANNOT_POST.some((r) => reason.includes(r))) return 'cannot_post';
  return 'retry';
}

/** What is being posted, in the person's words: a response, a video reply, a draft. */
function noun(kind: Kind): string {
  return kind === 'reply' ? 'video reply' : kind === 'draft' ? 'draft' : 'response';
}

/** First line of an Upload failed banner (P1, P2, P3 and their video reply versions), or of the
 *  "Discarding" banner (P5). Drafts keep their own words ("Your draft didn't save"). */
export function failedTitle(kind: Kind, view: FailedView): string {
  if (view === 'discarding') return `Discarding your ${noun(kind)}`;
  return kind === 'draft' ? "Your draft didn't save" : `Your ${noun(kind)} didn't post`;
}

/** Second line, for the views that do not use the approved connection and limit lines. */
export function failedDetail(view: Exclude<FailedView, 'retry'>): string {
  switch (view) {
    case 'cannot_post':
      return "This recording can't be posted.";
    case 'file_gone':
      return 'This recording is no longer on this phone.';
    case 'discarding':
      return 'It stays on this phone until Conga confirms.';
  }
}

/** PR-Posting's first line (P8-R for a video reply). */
export function postingTitle(kind: Kind): string {
  return kind === 'draft' ? 'Saving your draft' : `Posting your ${noun(kind)}`;
}

/** A-Offline's line: a video reply says so. */
export function offlineDetail(kind: Kind | null): string {
  return kind === 'reply' ? "Your video reply stays saved on this phone. Post when you're back online." : "Your response stays saved on this phone. Post when you're back online.";
}

/** P4: the Discard confirmation. */
export const DISCARD_SHEET = {
  title: 'Discard this recording?',
  line: 'Conga will try to stop it from posting. If it has already uploaded, it may still appear.',
  discard: 'Discard',
  cancel: 'Cancel',
} as const;

/** P6: Discard found the recording already at Conga. */
export const REACHED_CONGA_SHEET = {
  title: 'This recording already reached Conga',
  line: 'It may finish processing. If it appears on your profile, you can delete it there.',
  ok: 'OK',
} as const;

/** P7 and P8: Respond, Reply or Record while a recording is waiting or posting. */
export type CameraBlock = 'waiting' | 'posting';

export function cameraBlock(state: Pick<PostingState, 'kind'>): CameraBlock | null {
  switch (state.kind) {
    // Failed, waiting for the connection, or a discard Conga has not confirmed: still the member's one recording.
    case 'failed':
    case 'waiting':
      return 'waiting';
    case 'uploading':
    case 'processing':
      return 'posting';
    default:
      return null;
  }
}

export const CAMERA_BLOCK_SHEET: Record<CameraBlock, { title: string; line: string; ok: string }> = {
  waiting: { title: "Your last recording hasn't posted yet", line: 'Retry or discard it first.', ok: 'OK' },
  posting: { title: 'Your last recording is still posting', line: "Keep Conga open until it's done.", ok: 'OK' },
};

/** P9: the sign-out warning, on every sign-out route. One recording waits at a time. */
export const SIGN_OUT_SHEET = {
  title: 'Sign out?',
  line: "You have 1 recording that hasn't posted. Signing out stops the upload on this phone, but it may still finish on Conga. An unresolved recording stays private on this device for your account.",
  signOut: 'Sign out anyway',
  cancel: 'Cancel',
} as const;

/** After Discard is tapped, what the posting state says about its outcome (we read it, we do not
 *  change it): `reached_conga` is P6 (Mux already has the recording and it carries on
 *  processing); `settled` means nothing more to say (it went, or P5 is drawn by the banner itself);
 *  `pending` means the answer has not arrived yet. */
export type DiscardOutcome = 'reached_conga' | 'settled' | 'pending';

export function discardOutcome(state: PostingState): DiscardOutcome {
  if (state.kind === 'processing') return 'reached_conga';
  if (state.kind === 'idle') return 'settled';
  if (state.kind === 'failed' && state.post.discardRequested) return 'settled';
  return 'pending';
}
