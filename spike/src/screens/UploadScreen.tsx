import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import type { Run } from '../types';
import { uploadRun, type UploadProgress } from '../upload';
import { Button, Mono, Row, s } from '../ui';

export function UploadScreen({ run: initial, onDone, onBack }: { run: Run; onDone: (run: Run) => void; onBack: () => void }) {
  useKeepAwake();
  const [run, setRun] = useState(initial);
  const [p, setP] = useState<UploadProgress>({ bytesSent: 0, totalBytes: initial.fileBytes ?? 0, attempt: initial.uploadAttempts, phase: 'minting' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const started = useRef(false);

  async function go(r: Run) {
    setBusy(true);
    setError(null);
    try {
      const done = await uploadRun(r, (prog) => {
        setP(prog);
        if (prog.phase === 'failed' || prog.phase === 'done' || prog.phase === 'processing' && prog.polls === 1) {
          setLines((l) => [...l.slice(-8), `${new Date().toLocaleTimeString()} ${prog.phase} ${prog.message ?? ''}`]);
        }
      });
      setRun(done);
      setBusy(false);
      onDone(done);
    } catch (e) {
      setBusy(false);
      const m = e instanceof Error ? e.message : String(e);
      if (m.includes('already uploading')) { setLines((l) => [...l, 'This recording is still uploading in the background. Go Back and Refresh.']); return; }
      setError(m);
    }
  }

  useEffect(() => {
    if (!started.current) { started.current = true; go(run); }
  }, []);

  const pct = p.totalBytes > 0 ? Math.round((p.bytesSent / p.totalBytes) * 100) : 0;

  return (
    <View style={[s.screen, s.pad, { paddingTop: 70 }]}>
      <Text style={s.title}>Posting</Text>
      <Text style={s.text}>{run.label} · {(p.totalBytes / 1e6).toFixed(2)} MB · attempt {p.attempt}</Text>
      <Text style={s.text}>Phase: {p.phase}{p.phase === 'processing' ? ` (poll ${p.polls ?? 0}: ${p.message ?? ''})` : ''}</Text>
      <View style={{ height: 14, backgroundColor: '#222', borderRadius: 7, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: p.phase === 'failed' ? '#e33' : '#4c4' }} />
      </View>
      <Text style={s.text}>{pct}% · {(p.bytesSent / 1e6).toFixed(2)} / {(p.totalBytes / 1e6).toFixed(2)} MB</Text>
      {error ? <Text style={[s.text, { color: '#f66' }]}>Your response didn't post. It's saved on this phone. {error}</Text> : null}
      {lines.map((l, i) => <Mono key={i}>{l}</Mono>)}
      <Row>
        {error ? <Button title="Retry" onPress={() => go({ ...run, status: 'upload_failed' })} /> : null}
        <Button small title={busy ? 'Back (upload keeps running)' : 'Back'} onPress={onBack} />
      </Row>
      <Text style={s.dim}>To test interruption: kill the app or toggle airplane mode mid-upload, then reopen and use Retry from the home list.</Text>
    </View>
  );
}
