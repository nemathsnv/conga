// Read-only checks for the E1 to E3 provider tests on the disposable account T2
// (docs/release/PROVIDER-TESTS.md section 6). Plain selects through scripts/provider-sql.sh (its guards
// apply) and Mux GETs through scripts/provider-mux-read.mjs. Prints ids, statuses, counts and hashes;
// never a token, key, address, invite code or upload URL.
//
//   node scripts/provider-check.mjs state   <target> --t2 <id>
//       S1 for T2: the switch, health, every open job, and T2's account, sessions (count), rows,
//       ledger and submissions.
//   node scripts/provider-check.mjs save    <target> <file> [--t2 <id>[,<id>...]] [--mux <env file>]...
//   node scripts/provider-check.mjs compare <target> <file> [--t2 <id>[,<id>...]] [--mux <env file>]...
//       The protected baseline: T1 and the founder (account, every row, ledger, session ids hashed)
//       and, per Mux environment, every asset not owned by a disposable test account (--t2: T2 on
//       hosted; the local rehearsal lists its other disposable accounts too). `save` writes it (mode 600); `compare`
//       reads it again and lists what differs. Taken fresh before each operation (normal T1 use of
//       the iPhone between operations is allowed and is reconciled by the new baseline) and compared
//       after it: inside an operation nothing protected may change.
//
// <target> is `hosted` or `local:<stack folder>` (as provider-sql.sh). --t1 and --founder override the
// built-in ids for a local rehearsal only. Exit: 0 ok (or unchanged), 1 changed, 3 could not run.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (m) => { console.error(`provider-check: ${m}`); process.exit(3); };
const [cmd, target, ...rest] = process.argv.slice(2);
if (!['state', 'save', 'compare'].includes(cmd) || !target || !(target === 'hosted' || target.startsWith('local:'))) {
  fail('usage: provider-check.mjs state|save|compare <hosted|local:<folder>> [file] [--t2 id] [--mux env]...');
}
const opt = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
const muxEnvs = rest.flatMap((a, i) => (a === '--mux' ? [rest[i + 1]] : []));
const local = target.startsWith('local:');
const T1 = (local && opt('t1')) || 'b0c14e38-4e89-4dbd-a9a3-8a8c01872a78';
const FOUNDER = (local && opt('founder')) || '70046556-4209-4471-b5bb-a770aee12466';
const DISPOSABLE = (opt('t2') ?? '').split(',').filter(Boolean);
const T2 = DISPOSABLE[0] ?? null;
for (const [k, v] of [['t1', T1], ['founder', FOUNDER], ...DISPOSABLE.map((d) => ['t2', d])]) if (!UUID.test(v)) fail(`--${k} is not an id`);
if (DISPOSABLE.some((d) => d === T1 || d === FOUNDER)) fail('a test account cannot be T1 or the founder');
if (cmd === 'state' && DISPOSABLE.length !== 1) fail('state needs exactly one --t2');

function sql(statement) {
  let text;
  try {
    text = execFileSync('bash', [join(HERE, 'provider-sql.sh'), target, statement], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    fail(`provider-sql.sh failed: ${(e.stderr ?? '').toString().trim().split('\n').pop()}`);
  }
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed) ? parsed : parsed.rows;
  const v = rows?.[0]?.v;
  return typeof v === 'string' ? JSON.parse(v) : v;
}
const md5 = (v) => createHash('md5').update(JSON.stringify(v)).digest('hex');
const lit = (id) => `'${id}'`;

// One account's protected state, as one jsonb (plain select; no function that changes anything).
const accountPart = (id) => `jsonb_build_object(
  'account', (select jsonb_build_object('deleted_at', deleted_at, 'moderation_status', moderation_status, 'moderation_action_id', moderation_action_id, 'restricted_until', restricted_until) from public.accounts where id = ${lit(id)}),
  'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'status', status, 'asset', mux_asset_id, 'playback', mux_playback_id, 'upload', mux_upload_id) order by created_at, id), '[]') from public.responses where author_id = ${lit(id)}),
  'ledger', (select coalesce(jsonb_agg(jsonb_build_object('upload', upload_id, 'status', status, 'response', response_id, 'cancelled_at', cancelled_at) order by created_at, upload_id), '[]') from public.video_uploads where account_id = ${lit(id)}),
  'session_ids_md5', (select md5(coalesce(string_agg(id::text, ',' order by id), '')) from auth.sessions where user_id = ${lit(id)}),
  'sessions', (select count(*) from auth.sessions where user_id = ${lit(id)})
)`;

function muxInventory(envFile) {
  let text;
  try {
    text = execFileSync('node', [`--env-file=${envFile}`, join(HERE, 'provider-mux-read.mjs'), 'assets'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    fail(`provider-mux-read.mjs failed for ${basename(envFile)}: ${(e.stderr ?? '').toString().trim().split('\n').pop()}`);
  }
  const all = JSON.parse(text).assets;
  const kept = all.filter((a) => !DISPOSABLE.includes(a.passthrough));
  return { total: all.length, t2_assets: all.length - kept.length, protected_count: kept.length, protected_md5: md5(kept), protected: kept.map((a) => `${a.id} ${a.status} ${a.playback_ids.join('|')}`) };
}

function snapshot() {
  const db = sql(`select jsonb_build_object('t1', ${accountPart(T1)}, 'founder', ${accountPart(FOUNDER)}) as v`);
  const mux = Object.fromEntries(muxEnvs.map((f) => [basename(f), muxInventory(f)]));
  return { taken_at: new Date().toISOString(), target, t1: T1, founder: FOUNDER, t2: DISPOSABLE, db, mux };
}

if (cmd === 'state') {
  const s = sql(`select jsonb_build_object(
    'at', now(),
    'mode', public.mux_cleanup_mode(),
    'health', public.mux_cleanup_health() -> 'status',
    'problems', public.mux_cleanup_health() -> 'problems',
    'open_jobs', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'action', action, 'reason', reason, 'status', status, 'not_before', not_before, 'asset', asset_id, 'upload', upload_id, 'response', response_id, 'owner', owner_id, 'result', result) order by created_at), '[]') from public.mux_cleanup_jobs where status in ('pending', 'running', 'failed', 'review')),
    'accounts', (select count(*) from public.accounts),
    't2', (select jsonb_build_object('deleted_at', deleted_at, 'moderation_status', moderation_status, 'age_confirmed', age_confirmed_at is not null, 'disclosure_ack', public_disclosure_ack_at is not null) from public.accounts where id = ${lit(T2)}),
    't2_auth_user', (select count(*) from auth.users where id = ${lit(T2)}),
    't2_profile', (select jsonb_build_object('username', username) from public.profiles where id = ${lit(T2)}),
    't2_invite', (select jsonb_build_object('id', id, 'redeemed_at', redeemed_at) from public.invites where redeemed_by = ${lit(T2)}),
    't2_sessions', (select count(*) from auth.sessions where user_id = ${lit(T2)}),
    't2_rows', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'status', status, 'asset', mux_asset_id, 'playback', mux_playback_id, 'upload', mux_upload_id) order by created_at), '[]') from public.responses where author_id = ${lit(T2)}),
    't2_ledger', (select coalesce(jsonb_agg(jsonb_build_object('upload', upload_id, 'status', status, 'created_at', created_at, 'expires_at', expires_at, 'cancelled_at', cancelled_at, 'response', response_id) order by created_at), '[]') from public.video_uploads where account_id = ${lit(T2)}),
    't2_submissions', (select coalesce(jsonb_agg(to_jsonb(s) - 'caption' order by created_at), '[]') from public.post_submissions s where account_id = ${lit(T2)})
  ) as v`);
  console.log(JSON.stringify(s, null, 2));
} else {
  const file = rest[0];
  if (!file || file.startsWith('--')) fail(`${cmd} needs a file`);
  const now = snapshot();
  if (cmd === 'save') {
    writeFileSync(file, JSON.stringify(now, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ saved: file, t1_rows: now.db.t1.rows.length, t1_sessions: now.db.t1.sessions, founder_rows: now.db.founder.rows.length, mux: Object.fromEntries(Object.entries(now.mux).map(([k, v]) => [k, { total: v.total, protected: v.protected_count, t2: v.t2_assets, md5: v.protected_md5 }])) }, null, 2));
  } else {
    const before = JSON.parse(readFileSync(file, 'utf8'));
    if (before.t1 !== T1 || before.founder !== FOUNDER || before.target !== target) fail('the baseline was taken for other ids or another target');
    const diffs = [];
    for (const who of ['t1', 'founder']) {
      for (const k of Object.keys(before.db[who])) {
        if (md5(before.db[who][k]) !== md5(now.db[who][k])) diffs.push({ where: `${who}.${k}`, before: before.db[who][k], now: now.db[who][k] });
      }
    }
    for (const env of Object.keys(before.mux)) {
      if (!now.mux[env]) { diffs.push({ where: `mux.${env}`, before: 'checked', now: 'not checked' }); continue; }
      if (before.mux[env].protected_md5 !== now.mux[env].protected_md5) diffs.push({ where: `mux.${env}`, before: before.mux[env].protected, now: now.mux[env].protected });
    }
    console.log(JSON.stringify({ baseline: before.taken_at, now: now.taken_at, unchanged: diffs.length === 0, diffs, mux_totals: Object.fromEntries(Object.entries(now.mux).map(([k, v]) => [k, { total: v.total, t2: v.t2_assets }])) }, null, 2));
    process.exit(diffs.length === 0 ? 0 : 1);
  }
}
