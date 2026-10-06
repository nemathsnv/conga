// In-memory spike settings, toggled from Home and logged with every run.
export const settings = {
  /** Encoder target bitrate in bits per second; 0 = library default. iOS needs a codec with it. */
  videoBitrate: 0 as 0 | 4_000_000 | 2_000_000,
  /** Playback: false = AVPlayer default (waits to minimise stalling); true = start as soon as possible. */
  fastStart: false,
};
export const BITRATES: Array<0 | 4_000_000 | 2_000_000> = [0, 4_000_000, 2_000_000];
export const bitrateLabel = (b: number) => (b === 0 ? 'default' : `${b / 1e6}Mbps`);

import type { VideoPlayer } from 'expo-video';
export function applyBufferOptions(p: VideoPlayer) {
  if (settings.fastStart) {
    p.bufferOptions = { waitsToMinimizeStalling: false, preferredForwardBufferDuration: 2, minBufferForPlayback: 1 };
  }
}
