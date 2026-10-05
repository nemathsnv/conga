// JSON-lines measurement log, persisted in the app's document directory.
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { deviceInfo } from './env';
import type { LogEvent, LogLine, NetworkInfo, Run } from './types';

const dir = new Directory(Paths.document, 'spike');
const logFile = new File(dir, 'spike-log.jsonl');
const stateFile = new File(dir, 'runs.json');
export const recordingsDir = new Directory(dir, 'recordings');

function ensure() {
  if (!dir.exists) dir.create({ intermediates: true });
  if (!recordingsDir.exists) recordingsDir.create({ intermediates: true });
}

export function log(event: LogEvent, data?: Record<string, unknown>, runId?: string, network?: NetworkInfo) {
  ensure();
  const line: LogLine = { ts: Date.now(), iso: new Date().toISOString(), event, runId, device: deviceInfo(), network, data };
  const text = JSON.stringify(line) + '\n';
  try {
    const existing = logFile.exists ? logFile.textSync() : '';
    logFile.write(existing + text);
  } catch (e) {
    console.warn('log write failed', e);
  }
  console.log('[spike]', event, runId ?? '', data ? JSON.stringify(data) : '');
}

export function readLogText(): string {
  return logFile.exists ? logFile.textSync() : '';
}

export function clearLog() {
  if (logFile.exists) logFile.delete();
}

export async function exportLog() {
  ensure();
  if (!logFile.exists) logFile.write('');
  // Bundle the runs index into the export too, as a second share would be annoying.
  const bundle = new File(dir, `spike-export-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  bundle.write(readLogText() + JSON.stringify({ ts: Date.now(), event: 'runs_index', runs: loadRuns() }) + '\n');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(bundle.uri, { mimeType: 'application/json', dialogTitle: 'Export spike log' });
  }
}

export function loadRuns(): Run[] {
  ensure();
  if (!stateFile.exists) return [];
  try {
    return JSON.parse(stateFile.textSync()) as Run[];
  } catch {
    return [];
  }
}

export function saveRuns(runs: Run[]) {
  ensure();
  stateFile.write(JSON.stringify(runs));
}

export function upsertRun(run: Run): Run[] {
  const runs = loadRuns();
  const i = runs.findIndex((r) => r.runId === run.runId);
  if (i >= 0) runs[i] = run;
  else runs.unshift(run);
  saveRuns(runs);
  return runs;
}

export function newRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
