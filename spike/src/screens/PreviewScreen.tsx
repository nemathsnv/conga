import { File } from 'expo-file-system';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { loadRuns, log, saveRuns, upsertRun } from '../log';
import { attachPlaybackMetrics } from '../playback';
import type { Run } from '../types';
import { Button, Row, s } from '../ui';

export function PreviewScreen({ run, onPost, onDiscard }: { run: Run; onPost: (run: Run) => void; onDiscard: () => void }) {
  const [meta, setMeta] = useState<string>('reading…');
  const [measured, setMeasured] = useState<Run>(run);
  const player = useVideoPlayer(run.fileUri, (p) => { p.loop = true; p.muted = false; p.play(); });

  useEffect(() => {
    const m = attachPlaybackMetrics(player, run.runId, 'preview-local', () => {});
    return () => m.detach();
  }, [player]);

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status !== 'readyToPlay') return;
      const t = player.videoTrack;
      const durationS = player.duration;
      const bytes = run.fileBytes ?? 0;
      const bitrateBps = durationS > 0 ? Math.round((bytes * 8) / durationS) : null;
      const next: Run = { ...run, durationS, width: t?.size.width ?? null, height: t?.size.height ?? null, trackBitrateBps: t?.averageBitrate ?? t?.peakBitrate ?? t?.bitrate ?? null, frameRate: t?.frameRate ?? null, bitrateBps };
      setMeasured(next);
      upsertRun(next);
      setMeta(`${durationS.toFixed(2)}s · ${t ? `${t.size.width}x${t.size.height}` : '?x?'} · ${(bytes / 1e6).toFixed(2)} MB · ${bitrateBps ? Math.round(bitrateBps / 1000) : '?'} kbps (size/dur)${t?.averageBitrate ? ` · track ${Math.round(t.averageBitrate / 1000)} kbps` : ''}${t?.frameRate ? ` · ${t.frameRate} fps` : ''}`);
      log('preview_metrics', { durationS, bytes, width: t?.size.width, height: t?.size.height, bitrateBps, trackAvgBps: t?.averageBitrate, trackPeakBps: t?.peakBitrate, fps: t?.frameRate, mime: t?.mimeType, codec: run.recording.codec }, run.runId);
    });
    return () => sub.remove();
  }, [player]);

  function discard() {
    try { if (run.fileUri) new File(run.fileUri).delete(); } catch {}
    saveRuns(loadRuns().filter((r) => r.runId !== run.runId));
    log('discarded', {}, run.runId);
    onDiscard();
  }

  return (
    <View style={s.screen}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />
      <View style={s.overlayTop}>
        <Text style={s.pill}>Preview (local, looping, sound on)</Text>
        <Text style={s.pill}>{meta}</Text>
        <Text style={s.pill}>{run.label} · codec {run.recording.codec ?? '?'}</Text>
      </View>
      <View style={s.overlayBottom}>
        <Row>
          <Button title="Re-record" danger onPress={discard} />
          <Button title="Post (upload to Mux)" onPress={() => onPost(measured)} />
        </Row>
      </View>
    </View>
  );
}
