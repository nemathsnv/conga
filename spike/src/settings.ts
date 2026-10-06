// In-memory spike settings, toggled from Home and logged with every run.
import type { VideoPlayer } from 'expo-video';

export type FastStart = 'off' | 'nowait' | 'smallbuffer';
export const FAST_MODES: FastStart[] = ['off', 'nowait', 'smallbuffer'];

export const settings = {
  /** Encoder target bitrate in bits per second; 0 = library default. iOS needs a codec with it. */
  videoBitrate: 0 as 0 | 4_000_000 | 2_000_000,
  /**
   * Playback start strategy.
   * off: AVPlayer default (waits to minimise stalling, auto buffer).
   * nowait: waitsToMinimizeStalling=false, play() only once the item reports readyToPlay.
   * smallbuffer: default waiting, but preferredForwardBufferDuration=1 s.
   */
  fastStart: 'off' as FastStart,
};
export const BITRATES: Array<0 | 4_000_000 | 2_000_000> = [0, 4_000_000, 2_000_000];
export const bitrateLabel = (b: number) => (b === 0 ? 'default' : `${b / 1e6}Mbps`);

export function applyBufferOptions(p: VideoPlayer) {
  if (settings.fastStart === 'nowait') p.bufferOptions = { waitsToMinimizeStalling: false };
  if (settings.fastStart === 'smallbuffer') p.bufferOptions = { preferredForwardBufferDuration: 1, minBufferForPlayback: 1 };
}

/** Starts playback according to the fast-start mode. Returns a cleanup. */
export function startPlayback(p: VideoPlayer): () => void {
  if (settings.fastStart !== 'nowait') { p.play(); return () => {}; }
  if (p.status === 'readyToPlay') { p.play(); return () => {}; }
  const sub = p.addListener('statusChange', ({ status }) => { if (status === 'readyToPlay') { p.play(); sub.remove(); } });
  return () => sub.remove();
}
