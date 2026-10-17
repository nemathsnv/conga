// Pure rules for VideoSurface and the players (no native imports, Jest-tested).
import type { OverlayEntry } from './overlayStack';

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
 *  for this page's response. A sheet for another response says nothing about this page. */
export function sheetOverPage(top: OverlayEntry | null, pageResponseId: string | null): OverlayEntry['mode'] | null {
  return top && pageResponseId && top.responseId === pageResponseId ? top.mode : null;
}
