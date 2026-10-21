// Read-only look at Mux for the provider tests (docs/release/PROVIDER-TESTS.md). GET requests only:
// there is no code path here that sends anything else. Prints the fields the tests compare, never
// an upload URL or a credential.
//
//   node --env-file=<file with MUX_TOKEN_ID and MUX_TOKEN_SECRET> scripts/provider-mux-read.mjs <what>
//
//   upload <upload id>        status, asset_id, passthrough, timeout, error
//   asset <asset id>          status, passthrough, upload_id, playback ids, created_at, duration, errors
//   assets                    every asset (paged), with the count and an inventory hash
//   playback <playback id>    HLS manifest and thumbnail HTTP status (no credential sent)
//   playbacks                 every asset, and for each of its playback ids (taken from Mux's
//                             structured playback_ids[].id) the HLS and thumbnail status
//
// MUX_API_BASE / MUX_STREAM_BASE / MUX_IMAGE_BASE may point at a local fake (http, 127.0.0.1,
// localhost) for the local rehearsal; anything else is refused.
import { createHash } from 'node:crypto';

const LOCAL = ['127.0.0.1', 'localhost'];
function base(name, real) {
  const v = process.env[name];
  if (!v) return real;
  const u = new URL(v);
  if (u.protocol !== 'http:' || !LOCAL.includes(u.hostname)) throw new Error(`${name} must be a local http fake`);
  return u.origin;
}
const API = base('MUX_API_BASE', 'https://api.mux.com');
const STREAM = base('MUX_STREAM_BASE', 'https://stream.mux.com');
const IMAGE = base('MUX_IMAGE_BASE', 'https://image.mux.com');
const ID = /^[A-Za-z0-9]{1,128}$/;

async function get(path) {
  const id = process.env.MUX_TOKEN_ID, secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) throw new Error('MUX_TOKEN_ID / MUX_TOKEN_SECRET not set');
  const res = await fetch(API + path, { method: 'GET', headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64') } });
  const body = await res.json().catch(() => ({}));
  return { http: res.status, data: body?.data ?? null, error: res.ok ? null : body?.error ?? body };
}
const arg = (n) => {
  const v = process.argv[n];
  if (!ID.test(v ?? '')) throw new Error('an id of letters and digits is required');
  return v;
};
const out = (o) => console.log(JSON.stringify(o, null, 2));
const assetView = (a) => a && ({
  id: a.id, status: a.status, passthrough: a.passthrough ?? null, upload_id: a.upload_id ?? null,
  playback_ids: (a.playback_ids ?? []).map((p) => `${p.id} ${p.policy}`), created_at: a.created_at ?? null,
  duration: a.duration ?? null, errors: a.errors ?? null,
});

async function listAll() {
  const all = [];
  for (let page = 1; page <= 50; page += 1) {
    const r = await get(`/video/v1/assets?limit=100&page=${page}`);
    if (r.http !== 200) { out({ http: r.http, error: r.error, page }); process.exit(1); }
    all.push(...(r.data ?? []));
    if ((r.data ?? []).length < 100) break;
  }
  return all;
}
async function playbackStatus(p) {
  const hls = await fetch(`${STREAM}/${p}.m3u8`, { method: 'GET' });
  const thumb = await fetch(`${IMAGE}/${p}/thumbnail.jpg`, { method: 'GET' });
  await hls.arrayBuffer().catch(() => null);
  await thumb.arrayBuffer().catch(() => null);
  return { playback_id: p, hls: hls.status, thumbnail: thumb.status };
}

const what = process.argv[2];
if (what === 'upload') {
  const r = await get(`/video/v1/uploads/${arg(3)}`);
  const u = r.data;
  out({ http: r.http, error: r.error, upload: u && { id: u.id, status: u.status, asset_id: u.asset_id ?? null, passthrough: u.new_asset_settings?.passthrough ?? null, timeout: u.timeout ?? null, error: u.error ?? null } });
} else if (what === 'asset') {
  const r = await get(`/video/v1/assets/${arg(3)}`);
  out({ http: r.http, error: r.error, asset: assetView(r.data) });
} else if (what === 'assets') {
  const all = await listAll();
  const rows = all.map(assetView).sort((a, b) => a.id.localeCompare(b.id));
  out({ count: rows.length, inventory_md5: createHash('md5').update(JSON.stringify(rows)).digest('hex'), assets: rows });
} else if (what === 'playback') {
  out(await playbackStatus(arg(3)));
} else if (what === 'playbacks') {
  const assets = [];
  for (const a of (await listAll()).sort((x, y) => x.id.localeCompare(y.id))) {
    const ids = (a.playback_ids ?? []).map((p) => p.id);
    if (ids.some((id) => !ID.test(id ?? ''))) { out({ error: 'a playback id that is not letters and digits', asset: a.id }); process.exit(1); }
    const playbacks = [];
    for (const id of ids) playbacks.push({ ...(await playbackStatus(id)), policy: (a.playback_ids ?? []).find((p) => p.id === id)?.policy ?? null });
    assets.push({ asset: a.id, status: a.status, passthrough: a.passthrough ?? null, playbacks });
  }
  const all = assets.flatMap((a) => a.playbacks);
  out({ assets: assets.length, playback_ids: all.length, all_200: all.every((p) => p.hls === 200 && p.thumbnail === 200), list: assets });
} else {
  console.error('usage: provider-mux-read.mjs upload <id> | asset <id> | assets | playback <id> | playbacks');
  process.exit(2);
}
