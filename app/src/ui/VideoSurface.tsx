// One full-screen video for a feed item or player page: HLS from Mux, cover fit, sound on,
// progress reported for the 2pt line. Paused unless `active`.
// - A video that cannot load or play tells its page (`onFailed`), which shows X-Unavailable's
//   "Try again"; `retryKey` changing loads the source again.
// - The video on screen starts again when the app returns from the background (the phone pauses it).
// - `load` false (a list that is not on screen): only the still is drawn and no stream is opened,
//   so the list beside the one on screen does not compete with it for the network and the
//   decoders (founder iPhone test, 19 Oct). Turning it on opens the stream.
// - The callbacks are read through refs: a parent that passes a new function on each render
//   (every progress tick, in the players) no longer removes and adds the player's listeners each
//   time.
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { FIRST_FRAME_LIMIT_MS, isPlaybackFailure, shouldResumeOnForeground, watchFirstFrame } from '@/ui/playbackRules';
import { applyPlaybackSettings, hlsUrl, rewind, setLooping, thumbnailUrl } from '@/video/playback';

export function VideoSurface({ playbackId, active, loop, onEnd, onProgress, onFailed, retryKey = 0, localUri, load = true }: {
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
  /** Whether to open the stream at all (see the top of the file). */
  load?: boolean;
}) {
  const source = !load ? null : localUri ? { uri: localUri } : playbackId ? { uri: hlsUrl(playbackId) } : null;
  const player = useVideoPlayer(source, (p) => {
    applyPlaybackSettings(p);
    p.loop = loop;
    p.muted = false;
  });
  // `loop` can change while the player lives (the response player loops while Comments is over it).
  useEffect(() => {
    setLooping(player, loop);
  }, [player, loop]);
  // The still shows until this player, for this load (retryKey), is ready: a new player (the
  // stream turned on, another source) or a Try again has not drawn a frame yet.
  const [ready, setReady] = useState<{ player: VideoPlayer; retryKey: number } | null>(null);
  const firstFrame = ready !== null && ready.player === player && ready.retryKey === retryKey;
  // The latest props, for the listeners and callbacks (they outlive a render).
  const activeNow = useRef(active);
  const latest = useRef({ onEnd, onProgress, onFailed, retryKey });
  useEffect(() => {
    activeNow.current = active;
    latest.current = { onEnd, onProgress, onFailed, retryKey };
  });

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
    void player
      .replaceAsync(source)
      .then(() => {
        if (activeNow.current) player.play();
      })
      .catch(() => latest.current.onFailed?.());
    // `source` is derived from props that do not change on a retry.
  }, [retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A stream that stalls without an error would show the still forever: past the limit, count it
  // as failed so the page shows Try again (playbackRules.ts, FIRST_FRAME_LIMIT_MS).
  useEffect(() => {
    if (!watchFirstFrame({ active, hasSource: source !== null, firstFrame })) return;
    const timer = setTimeout(() => latest.current.onFailed?.(), FIRST_FRAME_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [active, firstFrame, player, retryKey, source === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = player.addListener('timeUpdate', (e) => {
      if (player.duration > 0) latest.current.onProgress?.(e.currentTime / player.duration);
    });
    const end = player.addListener('playToEnd', () => latest.current.onEnd?.());
    const status = player.addListener('statusChange', (e) => {
      if (e.status === 'readyToPlay') setReady({ player, retryKey: latest.current.retryKey });
      else if (isPlaybackFailure(e.status)) latest.current.onFailed?.();
    });
    return () => {
      t.remove();
      end.remove();
      status.remove();
    };
  }, [player]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {playbackId && !firstFrame ? (
        <Image source={{ uri: thumbnailUrl(playbackId, { width: 540, height: 960 }) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      ) : null}
      {source ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} /> : null}
    </View>
  );
}
