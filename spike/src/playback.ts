// Attaches measurement listeners to an expo-video player: first frame, stalls, loops, errors.
import type { VideoPlayer } from 'expo-video';
import { networkInfo } from './env';
import { log } from './log';
import { settings } from './settings';

export interface PlaybackStats {
  firstFrameMs: number | null;
  stalls: number;
  stallMsTotal: number;
  loops: number;
  errors: number;
  bufferedAhead: number;
  status: string;
  track: string;
}

export function attachPlaybackMetrics(player: VideoPlayer, runId: string | undefined, label: string, onStats: (s: PlaybackStats) => void) {
  const startedAt = Date.now();
  const stats: PlaybackStats = { firstFrameMs: null, stalls: 0, stallMsTotal: 0, loops: 0, errors: 0, bufferedAhead: 0, status: 'idle', track: '' };
  let readyOnce = false;
  let stallStartedAt: number | null = null;
  let firstFrameSeen = false;
  const emit = () => onStats({ ...stats });

  networkInfo().then((network) => log('playback_start', { label, source: 'hls', fastStart: settings.fastStart, bufferOptions: player.bufferOptions }, runId, network));

  const subs = [
    player.addListener('statusChange', ({ status, oldStatus, error }) => {
      stats.status = status;
      if (status === 'readyToPlay') {
        if (!readyOnce) readyOnce = true;
        if (stallStartedAt != null) {
          const ms = Date.now() - stallStartedAt;
          stats.stallMsTotal += ms;
          stallStartedAt = null;
          log('playback_stall_end', { label, stallMs: ms, atTime: player.currentTime }, runId);
        }
      } else if (status === 'loading' && readyOnce && firstFrameSeen && oldStatus === 'readyToPlay') {
        stats.stalls += 1;
        stallStartedAt = Date.now();
        const t = player.currentTime;
        const atLoopBoundary = t < 0.1 || (player.duration > 0 && player.duration - t < 0.3);
        log('playback_stall', { label, atTime: t, duration: player.duration, bufferedPosition: player.bufferedPosition, atLoopBoundary }, runId);
      } else if (status === 'error') {
        stats.errors += 1;
        log('playback_error', { label, error: error?.message ?? String(error) }, runId);
      }
      emit();
    }),
    player.addListener('timeUpdate', ({ currentTime, bufferedPosition }) => {
      if (!firstFrameSeen && currentTime > 0) {
        firstFrameSeen = true;
        stats.firstFrameMs = Date.now() - startedAt;
        const t = player.videoTrack;
        stats.track = t ? `${t.size.width}x${t.size.height} ${Math.round((t.averageBitrate ?? t.peakBitrate ?? t.bitrate ?? 0) / 1000)}kbps` : '';
        log('playback_first_frame', { label, firstFrameMs: stats.firstFrameMs, track: t ? { w: t.size.width, h: t.size.height, avgBps: t.averageBitrate, peakBps: t.peakBitrate, fps: t.frameRate, url: t.url } : null }, runId);
      }
      stats.bufferedAhead = Math.max(0, bufferedPosition - currentTime);
      emit();
    }),
    player.addListener('videoTrackChange', ({ videoTrack: t }) => {
      if (!t) return;
      stats.track = `${t.size.width}x${t.size.height} ${Math.round((t.averageBitrate ?? t.peakBitrate ?? t.bitrate ?? 0) / 1000)}kbps`;
      log('note', { label, kind: 'rendition_switch', w: t.size.width, h: t.size.height, avgBps: t.averageBitrate, peakBps: t.peakBitrate, atTime: player.currentTime }, runId);
      emit();
    }),
    player.addListener('playToEnd', () => {
      stats.loops += 1;
      log('playback_loop', { label, loops: stats.loops }, runId);
      emit();
    }),
  ];

  return {
    stats,
    detach: () => {
      subs.forEach((x) => x.remove());
      log('playback_end', { label, firstFrameMs: stats.firstFrameMs, stalls: stats.stalls, stallMsTotal: stats.stallMsTotal, loops: stats.loops, errors: stats.errors, watchedMs: Date.now() - startedAt }, runId);
    },
  };
}
