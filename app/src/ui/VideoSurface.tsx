// One full-screen video for a feed item or player page: HLS from Mux, cover fit, sound on,
// progress reported for the 2pt line. Paused unless `active`.
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { applyPlaybackSettings, hlsUrl, rewind, thumbnailUrl } from '@/video/playback';

export function VideoSurface({ playbackId, active, loop, onEnd, onProgress, localUri }: {
  playbackId: string | null;
  /** Plays only when active; preloads otherwise. */
  active: boolean;
  loop: boolean;
  onEnd?: () => void;
  onProgress?: (fraction: number) => void;
  /** A local file instead of Mux (Post Review). */
  localUri?: string;
}) {
  const source = localUri ? { uri: localUri } : playbackId ? { uri: hlsUrl(playbackId) } : null;
  const player = useVideoPlayer(source, (p) => {
    applyPlaybackSettings(p);
    p.loop = loop;
    p.muted = false;
  });
  const [firstFrame, setFirstFrame] = useState(false);

  useEffect(() => {
    if (active) player.play();
    else {
      player.pause();
      rewind(player);
    }
  }, [active, player]);

  useEffect(() => {
    const t = player.addListener('timeUpdate', (e) => {
      if (player.duration > 0) onProgress?.(e.currentTime / player.duration);
    });
    const end = player.addListener('playToEnd', () => onEnd?.());
    const status = player.addListener('statusChange', (e) => {
      if (e.status === 'readyToPlay') setFirstFrame(true);
    });
    return () => {
      t.remove();
      end.remove();
      status.remove();
    };
  }, [player, onEnd, onProgress]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {playbackId && !firstFrame ? (
        <Image source={{ uri: thumbnailUrl(playbackId, { width: 540, height: 960 }) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
      ) : null}
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
    </View>
  );
}
