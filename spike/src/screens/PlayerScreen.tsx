import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { hlsUrl } from '../mux';
import { attachPlaybackMetrics, type PlaybackStats } from '../playback';
import type { Run } from '../types';
import { Button, s } from '../ui';

/** Shortcut Home: one clip, full-screen vertical, looping, sound on. */
export function PlayerScreen({ run, onBack }: { run: Run; onBack: () => void }) {
  useKeepAwake();
  const player = useVideoPlayer({ uri: hlsUrl(run.playbackId!) }, (p) => { p.loop = true; p.muted = false; p.timeUpdateEventInterval = 0.25; p.play(); });
  return (
    <View style={s.screen}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />
      <View style={s.overlayTop}>
        <Text style={s.pill}>Home loop · HLS · sound on · {run.label}</Text>
        <StatsPill player={player} runId={run.runId} label="home-loop" />
      </View>
      <View style={s.overlayBottom}>
        <Button title="Back" onPress={onBack} />
      </View>
    </View>
  );
}

/** Attaches the measurement listeners exactly once per (player, runId, label) and shows live numbers. */
export function StatsPill({ player, runId, label }: { player: VideoPlayer; runId?: string; label: string }) {
  const [st, setSt] = useState<PlaybackStats | null>(null);
  useEffect(() => {
    setSt(null);
    const m = attachPlaybackMetrics(player, runId, label, setSt);
    return () => m.detach();
  }, [player, runId, label]);
  if (!st) return <Text style={s.pill}>starting…</Text>;
  return <Text style={s.pill}>first frame {st.firstFrameMs ?? '…'} ms · stalls {st.stalls} ({st.stallMsTotal} ms) · loops {st.loops} · buf +{st.bufferedAhead.toFixed(1)}s · {st.status} · {st.track}</Text>;
}
