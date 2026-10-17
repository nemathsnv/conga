// Pure rules for VideoSurface and the players (no native imports, Jest-tested).
import type { OverlayEntry, OverlayTop } from './overlayStack';

/** The phone pauses video when the app goes to the background and does not start it again when
 *  the app comes back. The one on screen (active) must resume by itself; the rest stay paused. */
export function shouldResumeOnForeground(appState: string, active: boolean): boolean {
  return appState === 'active' && active;
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
