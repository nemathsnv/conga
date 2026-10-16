// Pure rules for VideoSurface (no native imports, Jest-tested).

/** The phone pauses video when the app goes to the background and does not start it again when
 *  the app comes back. The one on screen (active) must resume by itself; the rest stay paused. */
export function shouldResumeOnForeground(appState: string, active: boolean): boolean {
  return appState === 'active' && active;
}

/** expo-video's statusChange values that mean the video failed to load or play. */
export function isPlaybackFailure(status: string): boolean {
  return status === 'error';
}
