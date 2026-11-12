// Read-only reconciliation of Mux with the database, and the daily clean-up check
// (docs/release/VIDEO-RELIABILITY.md section 8, preconditions 4 and 5).
//
//   node --env-file=<file with MUX_TOKEN_ID and MUX_TOKEN_SECRET> scripts/mux-reconcile.mjs \
//     <local:<stack folder>|hosted> [--cap 10] [--warn-at 8] [--full]
//
// What it does, and nothing else:
//   - Mux: GET /video/v1/assets (paged). There is no code path here that sends anything but GET.
//   - Database: one plain select through scripts/provider-sql.sh (its guards apply: the hosted
//     project needs PROVIDER_HOSTED_REF and PROVIDER_APPROVED_BY_NEMAT=yes; the founder's local
//     stack is refused). The select calls only stable functions (mux_cleanup_health,
//     moderation_case_closed_at).
// It prints asset ids, row ids and counts; never an upload URL, a token or a key.
//
// Exit status: 0 ok, 1 warn, 2 alert (the worse of the reconciliation and mux_cleanup_health),
// 3 the check itself could not run. So a scheduler or a person can act on the number alone.
//
// --cap is the plan's asset limit (or MUX_ASSET_CAP); without it capacity is reported, not judged.
// MUX_API_BASE may point at a local http fake (127.0.0.1, localhost) for a rehearsal.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exitCode, overall, reconcile } from './lib/mux-reconcile-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ID = /^[A-Za-z0-9]{1,128}$/;

function fail(message) {
  console.error(`mux-reconcile: ${message}`);
  process.exit(3);
}

const args = process.argv.slice(2);
const target = args[0];
if (!target || !(target === 'hosted' || target.startsWith('local:'))) {
  fail('usage: mux-reconcile.mjs <local:<stack folder>|hosted> [--cap N] [--warn-at N] [--full]');
}
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const n = Number(args[i + 1]);
  if (!Number.isInteger(n) || n < 1) fail(`${name} needs a positive whole number`);
  return n;
};
const cap = flag('--cap') ?? (process.env.MUX_ASSET_CAP ? Number(process.env.MUX_ASSET_CAP) : null);
const warnAt = flag('--warn-at');
const full = args.includes('--full');

function apiBase() {
  const v = process.env.MUX_API_BASE;
  if (!v) return 'https://api.mux.com';
  const u = new URL(v);
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(u.hostname)) fail('MUX_API_BASE must be a local http fake');
  return u.origin;
}

async function muxAssets() {
  const id = process.env.MUX_TOKEN_ID, secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) fail('MUX_TOKEN_ID / MUX_TOKEN_SECRET not set');
  const auth = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
  const all = [];
  for (let page = 1; page <= 50; page += 1) {
    const res = await fetch(`${apiBase()}/video/v1/assets?limit=100&page=${page}`, { method: 'GET', headers: { Authorization: auth } });
    const body = await res.json().catch(() => ({}));
    if (res.status !== 200) fail(`Mux answered ${res.status} on page ${page}`);
    const data = body?.data ?? [];
    all.push(...data);
    if (data.length < 100) return all;
  }
  fail('more than 5,000 assets: the listing was not finished');
}

function snapshotSql(uploadIds) {
  const list = uploadIds.filter((u) => ID.test(u)).map((u) => `'${u}'`).join(',');
  const uploads = list ? `array[${list}]::text[]` : `array[]::text[]`;
  return `select jsonb_build_object(
  'now', extract(epoch from now())::bigint,
  'health', public.mux_cleanup_health(),
  'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'status', r.status, 'author_id', r.author_id,
             'mux_asset_id', r.mux_asset_id, 'mux_upload_id', r.mux_upload_id, 'mux_playback_id', r.mux_playback_id,
             'author_deleted', a.deleted_at is not null,
             'case_open', r.status = 'removed' and public.moderation_case_closed_at(r.removed_action_id) is null)), '[]')
           from public.responses r left join public.accounts a on a.id = r.author_id
          where r.mux_asset_id is not null or r.mux_upload_id = any(${uploads})),
  'ledger', (select coalesce(jsonb_agg(jsonb_build_object('upload_id', u.upload_id, 'account_id', u.account_id)), '[]')
               from public.video_uploads u where u.upload_id = any(${uploads})),
  'jobs', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'action', j.action, 'status', j.status, 'asset_id', j.asset_id, 'upload_id', j.upload_id)), '[]')
             from public.mux_cleanup_jobs j where j.status in ('pending', 'running', 'failed', 'review'))
) as snapshot`;
}

function dbSnapshot(sql) {
  let out;
  try {
    out = execFileSync(join(HERE, 'provider-sql.sh'), [target, sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  } catch {
    fail('the database read failed (scripts/provider-sql.sh)');
  }
  let parsed;
  try { parsed = JSON.parse(out); } catch { fail('the database answer was not JSON'); }
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  const snap = rows?.[0]?.snapshot;
  if (!snap) fail('the database answer had no snapshot');
  return typeof snap === 'string' ? JSON.parse(snap) : snap;
}

const assets = await muxAssets();
const snap = dbSnapshot(snapshotSql(assets.map((a) => a.upload_id).filter(Boolean)));
const result = reconcile({ assets, rows: snap.rows, ledger: snap.ledger, jobs: snap.jobs, opts: { cap, warnAt, nowSeconds: Number(snap.now) } });
const health = snap.health ?? {};
const status = overall(result.status, health.status);
const inventory = assets.map((a) => ({ id: a.id, status: a.status, passthrough: a.passthrough ?? null, upload_id: a.upload_id ?? null,
  playback_ids: (a.playback_ids ?? []).map((p) => `${p.id} ${p.policy}`), created_at: a.created_at ?? null, duration: a.duration ?? null,
  errors: a.errors ?? null })).sort((x, y) => x.id.localeCompare(y.id));

console.log(JSON.stringify({
  status,
  checked_at: new Date(Number(snap.now) * 1000).toISOString(),
  reconciliation: result.status,
  health: { status: health.status ?? null, mode: health.mode ?? null, problems: health.problems ?? null },
  capacity: result.capacity,
  // Same hash as scripts/provider-mux-read.mjs assets, so the two can be compared.
  inventory_md5: createHash('md5').update(JSON.stringify(inventory)).digest('hex'),
  per_account: result.per_account,
  counts: result.counts,
  problems: result.problems,
  ...(full ? { findings: result.findings } : {}),
}, null, 2));
process.exit(exitCode(status));
