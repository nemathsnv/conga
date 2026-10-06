#!/usr/bin/env node
// Turns exported spike logs (JSON lines) into per-run rows and a markdown table.
// Usage: node scripts/summarize.mjs logs/*.jsonl
import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/summarize.mjs <file.jsonl> [...]'); process.exit(1); }

const lines = files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
const runs = new Map();
const runsIndex = lines.filter((l) => l.event === 'runs_index').flatMap((l) => l.runs ?? []);
for (const r of runsIndex) runs.set(r.runId, { ...r, playback: [], stalls: 0, stallMs: 0, loopFlickers: 0, loops: 0, errors: 0, uploadFailures: 0 });

const get = (id) => { if (!runs.has(id)) runs.set(id, { runId: id, playback: [], stalls: 0, stallMs: 0, loopFlickers: 0, loops: 0, errors: 0, uploadFailures: 0 }); return runs.get(id); };
let device = null;
for (const l of lines) {
  if (l.device && !device) device = l.device;
  if (!l.runId) continue;
  const r = get(l.runId);
  const d = l.data ?? {};
  switch (l.event) {
    case 'recorded': Object.assign(r, { facing: d.facing, quality: d.quality, zoom: d.zoom, torch: d.torch, codec: d.codec, fileBytes: d.bytes, wallMs: d.wallMs, requestedBitrate: d.requestedBitrate ?? 0, createdAt: l.ts }); break;
    case 'preview_metrics': Object.assign(r, { durationS: d.durationS, width: d.width, height: d.height, bitrateBps: d.bitrateBps, fps: d.fps }); break;
    case 'upload_started': r.uploadNet = l.network; r.uploadHost = d.uploadHost; r.mintMs = d.mintMs; break;
    case 'upload_failed': r.uploadFailures += 1; r.lastUploadError = d.error; break;
    case 'upload_finished': r.uploadMs = d.uploadMs; r.throughputMbps = d.throughputMbps; r.attempts = d.attempt; break;
    case 'asset_ready': r.processingMs = d.processingMs; r.maxResolution = d.maxResolution; break;
    case 'playback_start': r.lastFast = d.fastStart && d.fastStart !== 'off' ? String(d.fastStart) : null; break;
    case 'playback_first_frame': if (String(d.label).startsWith('preview')) r.localFirstFrame = d.firstFrameMs; else r.playback.push({ label: d.label, firstFrameMs: d.firstFrameMs, net: l.network?.type, track: d.track, fast: r.lastFast }); break;
    case 'playback_stall': r.pendingStall = d; break;
    case 'playback_stall_end': { const ms = d.stallMs ?? 0; if (ms < 250) r.loopFlickers += 1; else { r.stalls += 1; r.stallMs += ms; } break; }
    case 'playback_loop': r.loops = Math.max(r.loops, d.loops ?? 0); break;
    case 'playback_error': r.errors += 1; break;
  }
}

const rows = [...runs.values()].filter((r) => r.facing || r.fileBytes).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
const f = (v, dp = 1) => (v == null || Number.isNaN(v) ? '–' : typeof v === 'number' ? v.toFixed(dp) : String(v));
const ff = (r, fast) => r.playback.filter((p) => fast == null || (fast === false ? !p.fast : !!p.fast)).map((p) => p.firstFrameMs).filter((x) => x != null);
const ffModes = (r) => [...new Set(r.playback.filter((p) => p.fast).map((p) => p.fast))].map((m) => `${m}: ${r.playback.filter((p) => p.fast === m).map((p) => p.firstFrameMs).join('/')}`).join('; ') || '–';
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

console.log(`Device: ${device ? `${device.model} (${device.platform})` : '?'}\n`);
console.log('| # | Camera | Quality | Encoder | Dur s | Res | File MB | kbps | Net | Upload s | Mbps | Attempts | Mux proc s | Local first frame ms | First frame ms default (n) | First frame ms fast-start | Stalls ≥250 ms | Loops |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
rows.forEach((r, i) => {
  console.log(`| ${i + 1} | ${r.facing ?? '?'}${r.torch ? '+light' : ''} z${r.zoom ?? 0} | ${r.quality ?? '?'} | ${r.requestedBitrate ? `${r.requestedBitrate / 1e6} Mbps` : 'default'} | ${f(r.durationS)} | ${r.width ?? '?'}x${r.height ?? '?'} | ${f((r.fileBytes ?? 0) / 1e6, 2)} | ${r.bitrateBps ? Math.round(r.bitrateBps / 1000) : '–'} | ${r.uploadNet ? `${r.uploadNet.type} ${r.uploadNet.cellular ?? ''}`.trim() : '–'} | ${f((r.uploadMs ?? NaN) / 1000)} | ${f(r.throughputMbps)} | ${r.attempts ?? r.uploadFailures ?? '–'}${r.uploadFailures ? ` (${r.uploadFailures} fail)` : ''} | ${f((r.processingMs ?? NaN) / 1000)} | ${f(r.localFirstFrame, 0)} | ${f(med(ff(r, false)), 0)} (${ff(r, false).length}) | ${ffModes(r)} | ${r.stalls} (${r.stallMs} ms) | ${r.loops} |`);
});

const all = rows.filter((r) => r.uploadMs);
if (all.length) {
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`\nSummary over ${all.length} uploaded runs: upload median ${f(med(all.map((r) => r.uploadMs)) / 1000)} s, throughput avg ${f(avg(all.map((r) => r.throughputMbps ?? 0)))} Mbps, Mux processing median ${f(med(all.map((r) => r.processingMs ?? 0)) / 1000)} s, first-frame median ${f(med(rows.flatMap((r) => ff(r, false))), 0)} ms default (n=${rows.flatMap((r) => ff(r, false)).length}) and ${f(med(rows.flatMap((r) => ff(r, true))), 0)} ms fast-start (n=${rows.flatMap((r) => ff(r, true)).length}), stalls ≥250 ms ${rows.reduce((a, r) => a + r.stalls, 0)}, loop-boundary flickers ${rows.reduce((a, r) => a + r.loopFlickers, 0)}, upload failures ${rows.reduce((a, r) => a + r.uploadFailures, 0)}.`);
}
const unmatched = lines.filter((l) => l.event === 'too_short' || l.event === 'asset_errored' || l.event === 'playback_error' || l.event === 'camera_capability');
if (unmatched.length) { console.log('\nOther events:'); for (const l of unmatched) console.log(`- ${l.iso} ${l.event} ${JSON.stringify(l.data)}`); }
