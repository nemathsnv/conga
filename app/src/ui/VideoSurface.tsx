// One full-screen video for a feed item or player page: HLS from Mux, cover fit, sound on,
// progress reported for the 2pt line. Paused unless `active`.
// - A video that cannot load or play tells its page (`onFailed`), which shows X-Unavailable's
//   "Try again"; `retryKey` changing loads the source again.
// - The video on screen starts again when the app returns from the background (the phone pauses it).
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { isPlaybackFailure, shouldResumeOnForeground } from '@/ui/playbackRules';
import { applyPlaybackSettings, hlsUrl, rewind, setLooping, thumbnailUrl } from '@/video/playback';

export function VideoSurface({ playbackId, active, loop, onEnd, onProgress, onFailed, retryKey = 0, localUri }: {
  playbackId: string | null;
  /** Plays only when active; preloads otherwise. */
  active: boolean;
  loop: boolean;
  onEnd?: () => void;
  onProgress?: (fraction: number) => void;
  /** The video failed to load or play. */
  onFailed?: () => void;
  /** Change to load the video again (the page's Try again). */
  retryKey?: number;
  /** A local file instead of Mux (Post Review). */
  localUri?: string;
}) {
  const source = localUri ? { uri: localUri } : playbackId ? { uri: hlsUrl(playbackId) } : null;
  const player = useVideoPlayer(source, (p) => {
    applyPlaybackSettings(p);
    p.loop = loop;
    p.muted = false;
  });
  // `loop` can change while the player lives (the response player loops while Comments is over it).
  useEffect(() => {
    setLooping(player, loop);
  }, [player, loop]);
  const [firstFrame, setFirstFrame] = useState(false);
  // The latest `active`, for the AppState and retry callbacks (they outlive a render).
  const activeNow = useRef(active);
  useEffect(() => {
    activeNow.current = active;
  }, [active]);

  useEffect(() => {
    if (active) player.play();
    else {
      player.pause();
      rewind(player);
    }
  }, [active, player]);

  // Back from the background: the phone paused the video; start the one on screen again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (shouldResumeOnForeground(next, activeNow.current)) player.play();
    });
    return () => sub.remove();
  }, [player]);

  // Try again: load the source again, then play it if it is the one on screen.
  const firstRetryKey = useRef(retryKey);
  useEffect(() => {
    if (firstRetryKey.current === retryKey) return;
    firstRetryKey.current = retryKey;
    setFirstFrame(false);
    void player
      .replaceAsync(source)
      .then(() => {
        if (activeNow.current) player.play();
      })
      .catch(() => onFailed?.());
    // `source` is derived from props that do not change on a retry.
  }, [retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = player.addListener('timeUpdate', (e) => {
      if (player.duration > 0) onProgress?.(e.currentTime / player.duration);
    });
    const end = player.addListener('playToEnd', () => onEnd?.());
    const status = player.addListener('statusChange', (e) => {
      if (e.status === 'readyToPlay') setFirstFrame(true);
      else if (isPlaybackFailure(e.status)) onFailed?.();
    });
    return () => {
      t.remove();
      end.remove();
      status.remove();
    };
  }, [player, onEnd, onProgress, onFailed]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {playbackId && !firstFrame ? (
        <Image source={{ uri: thumbnailUrl(playbackId, { width: 540, height: 960 }) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      ) : null}
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
    </View>
  );
}
