import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { log } from '../log';
import { hlsUrl } from '../mux';
import type { Run } from '../types';
import { Button, Row, s } from '../ui';
import { applyBufferOptions, startPlayback } from '../settings';
import { StatsPill } from './PlayerScreen';

/** Response Player: several clips, each plays once, auto-advance, swipe replaced by Next/Prev buttons. */
export function SequenceScreen({ runs, onBack }: { runs: Run[]; onBack: () => void }) {
  useKeepAwake();
  const [index, setIndex] = useState(0);
  const current = runs[index];
  const player = useVideoPlayer(null, (p) => { applyBufferOptions(p); p.loop = false; p.muted = false; p.timeUpdateEventInterval = 0.25; });
  const startedAt = useRef(Date.now());

  useEffect(() => {
    log('sequence_start', { clips: runs.map((r) => r.runId) });
    return () => log('sequence_end', { clips: runs.length, totalMs: Date.now() - startedAt.current });
  }, []);

  useEffect(() => {
    if (!current?.playbackId) return;
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      await player.replaceAsync({ uri: hlsUrl(current.playbackId!) });
      if (!cancelled) cleanup = startPlayback(player);
    })();
    return () => { cancelled = true; cleanup(); };
  }, [index]);

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      if (index < runs.length - 1) setIndex((i) => i + 1);
    });
    return () => sub.remove();
  }, [index, runs.length]);

  if (!current) return <View style={[s.screen, s.pad]}><Text style={s.text}>No ready clips.</Text><Button title="Back" onPress={onBack} /></View>;

  return (
    <View style={s.screen}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />
      <View style={s.overlayTop}>
        <Text style={s.pill}>Response player · {index + 1} of {runs.length} · {current.label}</Text>
        <StatsPill player={player} runId={current.runId} label={`sequence-${index + 1}`} />
      </View>
      <View style={s.overlayBottom}>
        <Row>
          <Button small title="Prev" disabled={index === 0} onPress={() => setIndex((i) => i - 1)} />
          <Button small title="Next" disabled={index >= runs.length - 1} onPress={() => setIndex((i) => i + 1)} />
          <Button small title="Back" onPress={onBack} />
        </Row>
      </View>
    </View>
  );
}
