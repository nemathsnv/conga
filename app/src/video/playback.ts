// Playback helpers for Mux HLS (phase 1 conditions: 1 s forward buffer on iOS, preload next).
import type { VideoPlayer } from 'expo-video';
import { Platform } from 'react-native';

export function hlsUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

/** A still from the video for grids, strips and banners. */
export function thumbnailUrl(playbackId: string, opts: { width?: number; height?: number; time?: number } = {}): string {
  const q = new URLSearchParams();
  q.set('time', String(opts.time ?? 1));
  if (opts.width) q.set('width', String(opts.width));
  if (opts.height) q.set('height', String(opts.height));
  q.set('fit_mode', 'crop');
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?${q.toString()}`;
}

/** The spike's fastest-start settings. */
export function applyPlaybackSettings(player: VideoPlayer): void {
  if (Platform.OS === 'ios') {
    player.bufferOptions = { preferredForwardBufferDuration: 1, waitsToMinimizeStalling: true };
  }
  player.timeUpdateEventInterval = 0.25;
}
