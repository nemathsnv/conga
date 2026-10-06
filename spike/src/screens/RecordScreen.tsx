import { CameraView, useCameraPermissions, useMicrophonePermissions, type VideoQuality } from 'expo-camera';
import { File } from 'expo-file-system';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { MAX_DURATION_S, MIN_DURATION_S } from '../config';
import { log, newRunId, recordingsDir } from '../log';
import { bitrateLabel, settings } from '../settings';
import type { Facing, Run } from '../types';
import { Button, Row, s } from '../ui';

const ZOOMS = [0, 0.1, 0.25];
const QUALITIES: VideoQuality[] = ['1080p', '720p'];

export function RecordScreen({ onRecorded, onCancel }: { onRecorded: (run: Run) => void; onCancel: () => void }) {
  const cam = useRef<CameraView>(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<Facing>('front');
  const [torch, setTorch] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(0);
  const [qualityIdx, setQualityIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lenses, setLenses] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentRunId = useRef<string | null>(null);

  useEffect(() => {
    if (!camPerm?.granted) requestCam();
    if (!micPerm?.granted) requestMic();
  }, [camPerm?.granted, micPerm?.granted]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => { log('note', { kind: 'camera_ready_timeout', facing }); setReady(true); }, 3000);
    return () => clearTimeout(t);
  }, [ready, facing]);

  async function start() {
    if (!cam.current || !ready) return;
    setMsg(null);
    setRecording(true);
    setElapsed(0);
    startedAt.current = Date.now();
    timer.current = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 100);
    const quality = QUALITIES[qualityIdx];
    const zoom = ZOOMS[zoomIdx];
    const runId = newRunId();
    currentRunId.current = runId;
    try {
      // maxDuration enforces the 30 s ceiling natively; the 2 s floor is enforced below.
      if (torch) { setTimeout(() => { setTorch(false); setTimeout(() => { setTorch(true); log('note', { kind: 'torch_reapplied' }, runId); }, 150); }, 700); }
      const result = await cam.current.recordAsync({ maxDuration: MAX_DURATION_S, ...(settings.videoBitrate ? { codec: 'avc1' as const } : {}) });
      const stoppedAt = Date.now();
      if (timer.current) clearInterval(timer.current);
      setRecording(false);
      log('note', { kind: 'record_resolved', wallMs: stoppedAt - startedAt.current, hasUri: !!result?.uri, facingNow: facing }, runId);
      if (!result?.uri) throw new Error('no uri from recordAsync');
      const wallMs = stoppedAt - startedAt.current;
      const src = new File(result.uri);
      const bytes = src.size ?? 0;
      if (wallMs < MIN_DURATION_S * 1000) {
        log('too_short', { wallMs, bytes }, runId);
        try { src.delete(); } catch {}
        setMsg(`Too short: ${(wallMs / 1000).toFixed(1)}s. Minimum is ${MIN_DURATION_S}s. Hold longer.`);
        return;
      }
      // Move out of the cache dir so it survives until posted (SPEC 19).
      const dest = new File(recordingsDir, `${runId}.mp4`);
      src.moveSync(dest);
      const run: Run = {
        runId,
        label: `${facing} ${quality} ${bitrateLabel(settings.videoBitrate)} z${zoom}${torch ? ' torch' : ''}`,
        createdAt: startedAt.current,
        fileUri: dest.uri,
        fileBytes: bytes,
        durationS: null, width: null, height: null, bitrateBps: null, trackBitrateBps: null, frameRate: null,
        recording: { facing, torch, zoom, videoQuality: quality, codec: (result as { codec?: string }).codec ?? null, lens: lenses[0] ?? null },
        uploadId: null, uploadAttempts: 0, uploadStartedAt: null, uploadFinishedAt: null, uploadMs: null, uploadError: null, uploadNetwork: null,
        assetId: null, playbackId: null, assetReadyAt: null, processingMs: null, muxMaxResolution: null, muxResolutionTier: null,
        status: 'recorded',
      };
      log('recorded', { wallMs, bytes, facing, torch, zoom, quality, selectedLens: facing === 'back' ? 'Back Camera' : 'Front Camera', requestedBitrate: settings.videoBitrate, codec: run.recording.codec, lenses, uri: dest.uri }, runId);
      onRecorded(run);
    } catch (e) {
      if (timer.current) clearInterval(timer.current);
      setRecording(false);
      const m = e instanceof Error ? e.message : String(e);
      log('note', { kind: 'record_error', error: m }, runId);
      setMsg(`Record failed: ${m}`);
    }
  }

  function stop() {
    cam.current?.stopRecording();
  }

  if (!camPerm?.granted || !micPerm?.granted) {
    return (
      <View style={[s.screen, s.pad, { justifyContent: 'center' }]}>
        <Text style={s.text}>Camera: {camPerm?.status} · Mic: {micPerm?.status}</Text>
        <Button title="Grant permissions" onPress={() => { requestCam(); requestMic(); }} />
        <Button title="Back" onPress={onCancel} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <CameraView
        ref={cam}
        style={{ flex: 1 }}
        facing={facing}
        mode="video"
        videoQuality={QUALITIES[qualityIdx]}
        videoBitrate={settings.videoBitrate || undefined}
        selectedLens={facing === 'back' ? 'Back Camera' : 'Front Camera'}
        zoom={ZOOMS[zoomIdx]}
        enableTorch={torch}
        mute={false}
        onCameraReady={() => setReady(true)}
        onAvailableLensesChanged={({ lenses: l }) => { setLenses(l); setReady(true); log('camera_capability', { facing, lenses: l }); }}
        onMountError={(e) => setMsg(`Mount error: ${e.message}`)}
      />
      <View style={s.overlayTop}>
        <Text style={s.pill}>{facing} · {QUALITIES[qualityIdx]} · {bitrateLabel(settings.videoBitrate)} · zoom {ZOOMS[zoomIdx]} · torch {torch ? 'on' : 'off'} · lenses: {lenses.join(', ') || '?'}</Text>
        <Text style={[s.pill, { color: recording ? '#f55' : '#fff', fontSize: 20, fontWeight: '700' }]}>{recording ? `● ${elapsed.toFixed(1)}s / ${MAX_DURATION_S}s` : `Responding · ${MIN_DURATION_S}–${MAX_DURATION_S} seconds`}</Text>
        {msg ? <Text style={[s.pill, { color: '#fc6' }]}>{msg}</Text> : null}
      </View>
      <View style={s.overlayBottom}>
        <Row>
          <Button small title="Flip" onPress={() => { if (recording) log('note', { kind: 'flip_while_recording', from: facing, elapsedMs: Date.now() - startedAt.current }, currentRunId.current ?? undefined); setFacing((f) => (f === 'front' ? 'back' : 'front')); }} />
          <Button small title={`Light ${torch ? 'off' : 'on'}`} onPress={() => setTorch((t) => !t)} />
          <Button small title={`Zoom ${ZOOMS[(zoomIdx + 1) % ZOOMS.length]}`} onPress={() => setZoomIdx((i) => (i + 1) % ZOOMS.length)} />
          <Button small title={`Quality: ${QUALITIES[qualityIdx]}`} disabled={recording} onPress={() => setQualityIdx((i) => (i + 1) % QUALITIES.length)} />
        </Row>
        {recording ? <Button danger title="Stop" onPress={stop} /> : <Button title={ready ? 'Record' : 'Camera starting…'} disabled={!ready} onPress={start} />}
        {!recording ? <Button small title="Cancel" onPress={onCancel} /> : null}
      </View>
    </View>
  );
}
