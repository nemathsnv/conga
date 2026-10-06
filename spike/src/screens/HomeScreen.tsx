import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { File } from 'expo-file-system';
import { assertConfig } from '../config';
import { deleteAssets } from '../mux';
import { deviceInfo, networkInfo } from '../env';
import { clearLog, exportLog, loadRuns, log, readLogText, saveRuns } from '../log';
import type { NetworkInfo, Run } from '../types';
import { Button, Mono, Row, s } from '../ui';
import { BITRATES, FAST_MODES, bitrateLabel, settings } from '../settings';
import { isUploading } from '../upload';

export function HomeScreen({ onRecord, onRetry, onPlay, onSequence }: { onRecord: () => void; onRetry: (run: Run) => void; onPlay: (run: Run) => void; onSequence: (runs: Run[]) => void }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [net, setNet] = useState<NetworkInfo | null>(null);
  const [, bump] = useState(0);
  const cfgError = assertConfig();
  const refresh = () => setRuns(loadRuns());

  useEffect(() => {
    refresh();
    networkInfo().then((n) => { setNet(n); log('app_open', { runs: loadRuns().length }, undefined, n); });
  }, []);

  const ready = runs.filter((r) => r.status === 'ready' && r.playbackId);
  const pending = runs.filter((r) => r.status === 'recorded' || r.status === 'upload_failed' || r.status === 'uploading');
  const d = deviceInfo();

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.pad, { paddingTop: 70, paddingBottom: 60 }]}>
      <Text style={s.title}>Shortcut video spike</Text>
      <Text style={s.dim}>{d.model} · {d.platform} · net {net?.type ?? '?'} {net?.cellular ?? ''} {net?.carrier ?? ''}</Text>
      {cfgError ? <Text style={[s.text, { color: '#f66' }]}>{cfgError}</Text> : null}
      <Row>
        <Button title="Record" onPress={onRecord} disabled={!!cfgError} />
        <Button small title={`Play all ready (${ready.length})`} disabled={ready.length < 2} onPress={() => onSequence(ready.slice().reverse())} />
      </Row>
      <Row>
        <Button small title="Export log" onPress={() => exportLog().catch((e) => Alert.alert('Export failed', String(e)))} />
        <Button small title="Log size" onPress={() => Alert.alert('Log', `${readLogText().split('\n').filter(Boolean).length} lines`)} />
        <Button small danger title="Clear all" onPress={() => Alert.alert('Clear log and runs?', 'Local recordings are deleted too.', [{ text: 'Cancel' }, { text: 'Clear', style: 'destructive', onPress: () => { runs.forEach((r) => { try { if (r.fileUri) new File(r.fileUri).delete(); } catch {} }); saveRuns([]); clearLog(); refresh(); } }])} />
      </Row>
      <Row>
        <Button small title={`Encoder: ${bitrateLabel(settings.videoBitrate)}`} onPress={() => { settings.videoBitrate = BITRATES[(BITRATES.indexOf(settings.videoBitrate) + 1) % BITRATES.length]; bump((n) => n + 1); }} />
        <Button small title={`Fast start: ${settings.fastStart}`} onPress={() => { settings.fastStart = FAST_MODES[(FAST_MODES.indexOf(settings.fastStart) + 1) % FAST_MODES.length]; bump((n) => n + 1); }} />
        <Button small title="Refresh" onPress={refresh} />
      </Row>
      <Button small danger title={`Free Mux slots (delete ${ready.length} ready assets on Mux, keep the log)`} disabled={!ready.length} onPress={() => Alert.alert('Delete all assets on Mux?', 'Measurements stay in the log. The clips can no longer be played.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { const r = await deleteAssets(); log('note', { kind: 'mux_assets_deleted', count: r.deleted }); saveRuns(runs.map((x) => (x.status === 'ready' ? { ...x, status: 'errored' as const, uploadError: 'deleted on Mux to free a slot' } : x))); refresh(); Alert.alert('Deleted', `${r.deleted} assets removed on Mux.`); } catch (e) { Alert.alert('Delete failed', String(e)); } } }])} />

      {pending.some((r) => r.status !== 'uploading' || !isUploading(r.runId)) ? <Text style={[s.text, { color: '#fc6', marginTop: 8 }]}>Your response didn't post. It's saved on this phone. Check your connection.</Text> : null}
      {pending.some((r) => isUploading(r.runId)) ? <Text style={[s.text, { color: '#6cf', marginTop: 8 }]}>Still uploading in the background. Tap Refresh in a moment.</Text> : null}
      {pending.map((r) => (
        <View key={r.runId} style={{ borderColor: '#444', borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 }}>
          <Text style={s.text}>{r.label} · {r.status} · attempts {r.uploadAttempts}</Text>
          <Mono>{r.runId} · {r.fileBytes ? (r.fileBytes / 1e6).toFixed(2) : '?'} MB · {r.fileUri && new File(r.fileUri).exists ? 'file on disk' : 'FILE MISSING'}</Mono>
          {r.uploadError ? <Mono>{r.uploadError}</Mono> : null}
          <Row>
            <Button small title={isUploading(r.runId) ? 'Uploading…' : 'Retry'} onPress={() => onRetry(r)} disabled={!r.fileUri || isUploading(r.runId)} />
            <Button small danger title="Delete" onPress={() => { try { if (r.fileUri) new File(r.fileUri).delete(); } catch {} saveRuns(runs.filter((x) => x.runId !== r.runId)); log('discarded', { from: 'home' }, r.runId); refresh(); }} />
          </Row>
        </View>
      ))}

      <Text style={[s.title, { fontSize: 17, marginTop: 10 }]}>Ready on Mux ({ready.length})</Text>
      {ready.map((r) => (
        <View key={r.runId} style={{ borderColor: '#333', borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 }}>
          <Text style={s.text}>{r.label}</Text>
          <Mono>{r.durationS?.toFixed(1)}s · {r.width}x{r.height} · {r.fileBytes ? (r.fileBytes / 1e6).toFixed(2) : '?'} MB · {r.bitrateBps ? Math.round(r.bitrateBps / 1000) : '?'} kbps</Mono>
          <Mono>upload {r.uploadMs ? (r.uploadMs / 1000).toFixed(1) : '?'}s ({r.uploadNetwork?.type} {r.uploadNetwork?.cellular ?? ''}) · attempts {r.uploadAttempts} · mux {r.processingMs ? (r.processingMs / 1000).toFixed(1) : '?'}s · {r.muxMaxResolution ?? ''}</Mono>
          <Row>
            <Button small title="Play (Home loop)" onPress={() => onPlay(r)} />
          </Row>
        </View>
      ))}
      {runs.filter((r) => r.status === 'errored' || r.status === 'processing').map((r) => (
        <View key={r.runId} style={{ borderColor: '#633', borderWidth: 1, borderRadius: 10, padding: 10 }}>
          <Text style={s.text}>{r.label} · {r.status}</Text>
          <Mono>{r.uploadError ?? ''}</Mono>
          <Button small title="Check again" onPress={() => onRetry(r)} />
        </View>
      ))}
    </ScrollView>
  );
}
