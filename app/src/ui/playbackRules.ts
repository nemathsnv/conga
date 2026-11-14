// Pure rules for VideoSurface and the players (no native imports, Jest-tested).
import type { OverlayEntry, OverlayTop } from './overlayStack';

/** The phone pauses video when the app goes to the background and does not start it again when
 *  the app comes back. The one on screen (active) must resume by itself; the rest stay paused. */
export function shouldResumeOnForeground(appState: string, active: boolean): boolean {
  return appState === 'active' && active;
}

/** How long the video on screen may go without its first frame before it counts as failed to load.
 *  A stream can stall without ever reporting an error (a Mux asset opened seconds after it went
 *  live did, on the founder iPhone, 14 Nov 2026); without this limit the page shows its still
 *  forever. Failing shows X-Unavailable's Try again (SPEC.md Section 20), which loads it again.
 *  15 s is about 2.5 times the slowest cold first frame measured over Bali mobile data (5.8 s). */
export const FIRST_FRAME_LIMIT_MS = 15_000;

/** Whether to start the first-frame watchdog: only for a player that is on screen, has a stream to
 *  load, and has not drawn its first frame for this load yet. */
export function watchFirstFrame({ active, hasSource, firstFrame }: { active: boolean; hasSource: boolean; firstFrame: boolean }): boolean {
  return active && hasSource && !firstFrame;
}

/** The file to show a still of: a recording's video file on the phone, or nothing (no file, an empty
 *  string). An image view cannot show it; the banner plays it paused on its first frame. */
export function stillSource(uri: string | null | undefined): string | null {
  return typeof uri === 'string' && uri.trim() !== '' ? uri : null;
}

/** expo-video's statusChange values that mean the video failed to load or play. */
export function isPlaybackFailure(status: string): boolean {
  return status === 'error';
}

/** The sheet over a player page: the sheet on top of the stack (overlayStack.ts), if it was opened
 *  for this page's response. A sheet for another response says nothing about this page, and a
 *  player that is itself the focused screen has no sheet over it. */
export function sheetOverPage(top: OverlayEntry | null, pageResponseId: string | null, screenFocused: boolean): OverlayEntry['mode'] | null {
  if (screenFocused) return null;
  return top && pageResponseId && top.responseId === pageResponseId ? top.mode : null;
}

/** The sheet the response player opens by itself over its entry (opened from Activity, a
 *  notification or a rail icon on Home with openComments / openReplies). Only when the first page
 *  is that entry, live: a deleted or removed entry is X-Unavailable, and a sheet over it would ask
 *  for a response that is not there and never finish loading. */
export function autoSheet({ entry, openComments, openReplies, firstPage }: { entry: string | undefined; openComments: string | undefined; openReplies: string | undefined; firstPage: { kind: string; responseId?: string } | undefined }): { pathname: '/comments/[responseId]'; params: { responseId: string } } | { pathname: '/replies/[rootId]'; params: { rootId: string } } | null {
  if (!entry || firstPage?.kind !== 'response' || firstPage.responseId !== entry) return null;
  if (openComments === '1') return { pathname: '/comments/[responseId]', params: { responseId: entry } };
  if (openReplies === '1') return { pathname: '/replies/[rootId]', params: { rootId: entry } };
  return null;
}

/** Whether a player page plays. Only the page on screen, and only while its screen is the one the
 *  person sees: a profile, the recorder, another player or a sheet pushed over it stops it (sound
 *  included; VideoSurface also resumes only active players on foreground). The one exception is
 *  Comments over this same response, while nothing covers Comments: the response "keeps playing in
 *  the top third" (SPEC.md Section 8). */
export function playerPageActive({ isCurrentPage, screenFocused, overlay, responseId }: { isCurrentPage: boolean; screenFocused: boolean; overlay: OverlayTop | null; responseId: string | null }): boolean {
  if (!isCurrentPage) return false;
  if (screenFocused) return true;
  return !!overlay && !overlay.covered && sheetOverPage(overlay, responseId, screenFocused) === 'comments';
}

/** Whether a response page moves on to the next response when it ends. Not while Comments is over it
 *  (its chrome hidden): the comments belong to this response, which "keeps playing in the top third"
 *  (SPEC.md Section 8), so it loops there instead. */
export function endsToNext(chrome: boolean): boolean {
  return chrome;
}

/** Whether a player page draws its own chrome (the prompt header, the "N of M" strip, the author and
 *  the rail). Not under a sheet opened for it: under Comments the sheet shows who and what above itself,
 *  and under Replies the board shows only the dimmed video. */
export function pageShowsChrome(isCurrentPage: boolean, sheet: OverlayEntry['mode'] | null): boolean {
  return !(isCurrentPage && sheet !== null);
}
