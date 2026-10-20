// node --test scripts/tests/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exitCode, overall, reconcile } from '../lib/mux-reconcile-core.mjs';

const NOW = 1_800_000_000;
const OLD = String(NOW - 86_400);
const MEMBER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

const asset = (id, extra = {}) => ({ id, status: 'ready', passthrough: MEMBER, upload_id: `up${id}`, playback_ids: [{ id: `pb${id}`, policy: 'public' }], created_at: OLD, ...extra });
const row = (id, assetId, extra = {}) => ({ id, kind: 'response', status: 'live', author_id: MEMBER, mux_asset_id: assetId, mux_upload_id: `up${assetId}`, mux_playback_id: `pb${assetId}`, ...extra });
const run = (p) => reconcile({ assets: [], rows: [], ledger: [], jobs: [], ...p, opts: { nowSeconds: NOW, ...(p.opts ?? {}) } });
const checks = (r) => r.findings.map((f) => `${f.level}:${f.check}`).sort();

test('every asset used by its own live row: ok', () => {
  const r = run({ assets: [asset('A'), asset('B')], rows: [row('r1', 'A'), row('r2', 'B')] });
  assert.equal(r.status, 'ok');
  assert.deepEqual(checks(r), ['ok:in_use', 'ok:in_use']);
  assert.deepEqual(r.per_account, { [MEMBER]: 2 });
});

test('a processing row found by its upload id (no asset id yet) is in use', () => {
  const r = run({ assets: [asset('A')], rows: [row('r1', null, { status: 'processing', mux_upload_id: 'upA', mux_playback_id: null })] });
  assert.equal(r.status, 'ok');
});

test('the passthrough is not the row author: alert', () => {
  const r = run({ assets: [asset('A', { passthrough: OTHER })], rows: [row('r1', 'A')] });
  assert.equal(r.status, 'alert');
  assert.ok(checks(r).includes('alert:owner_mismatch'));
});

test('a live row whose playback id the asset does not have: alert', () => {
  const r = run({ assets: [asset('A', { playback_ids: [{ id: 'pbNEW', policy: 'public' }] })], rows: [row('r1', 'A')] });
  assert.ok(checks(r).includes('alert:playback_missing'));
});

test('a live row whose asset Mux does not list: alert', () => {
  const r = run({ assets: [], rows: [row('r1', 'GONE')] });
  assert.equal(r.status, 'alert');
  assert.deepEqual(checks(r), ['alert:missing_at_mux']);
});

test('a deleted row with no asset at Mux is not a problem', () => {
  const r = run({ assets: [], rows: [row('r1', 'GONE', { status: 'deleted' })] });
  assert.equal(r.status, 'ok');
});

test('deleted in the app, still playable, job open: warn; no job: alert', () => {
  const rows = [row('r1', 'A', { status: 'deleted' })];
  const withJob = run({ assets: [asset('A')], rows, jobs: [{ id: 'j1', action: 'delete_asset', status: 'pending', asset_id: 'A', upload_id: null }] });
  assert.deepEqual(checks(withJob), ['warn:hidden_still_playable']);
  const noJob = run({ assets: [asset('A')], rows });
  assert.deepEqual(checks(noJob), ['alert:hidden_still_playable']);
});

test('a job found by upload id counts (cancel_upload before the asset id is known)', () => {
  const r = run({ assets: [asset('A')], rows: [row('r1', null, { status: 'deleted', mux_upload_id: 'upA', mux_playback_id: null })],
    jobs: [{ id: 'j1', action: 'cancel_upload', status: 'pending', asset_id: null, upload_id: 'upA' }] });
  assert.deepEqual(checks(r), ['warn:hidden_still_playable']);
});

test('removed with its case still open is held, not a problem', () => {
  const r = run({ assets: [asset('A')], rows: [row('r1', 'A', { status: 'removed', case_open: true })] });
  assert.equal(r.status, 'ok');
  assert.deepEqual(checks(r), ['ok:held']);
});

test('deleted and already revoked (no public playback id) with no job: warn (asset kept)', () => {
  const r = run({ assets: [asset('A', { playback_ids: [] })], rows: [row('r1', 'A', { status: 'deleted' })] });
  assert.deepEqual(checks(r), ['warn:hidden_kept']);
});

test('account deleted: playable with a job is warn, without a job alert, revoked is ok', () => {
  const rows = [row('r1', 'A', { author_deleted: true })];
  const job = [{ id: 'j1', action: 'sync_playback', status: 'pending', asset_id: 'A', upload_id: null }];
  assert.deepEqual(checks(run({ assets: [asset('A')], rows, jobs: job })), ['warn:hidden_still_playable']);
  assert.deepEqual(checks(run({ assets: [asset('A')], rows })), ['alert:hidden_still_playable']);
  const revoked = [row('r1', 'A', { author_deleted: true, mux_playback_id: null })];
  assert.deepEqual(checks(run({ assets: [asset('A', { playback_ids: [] })], rows: revoked })), ['ok:revoked']);
});

test('a live row of an active account with no playback id: alert', () => {
  const r = run({ assets: [asset('A')], rows: [row('r1', 'A', { mux_playback_id: null })] });
  assert.deepEqual(checks(r), ['alert:live_without_playback']);
});

test('orphans: ledger proves the owner -> warn; unproven -> alert; young -> ok; queued -> ok', () => {
  const owned = run({ assets: [asset('A')], ledger: [{ upload_id: 'upA', account_id: MEMBER }] });
  assert.deepEqual(checks(owned), ['warn:orphan']);
  const wrongOwner = run({ assets: [asset('A')], ledger: [{ upload_id: 'upA', account_id: OTHER }] });
  assert.deepEqual(checks(wrongOwner), ['alert:orphan_unproven']);
  const unknown = run({ assets: [asset('A', { upload_id: null })] });
  assert.deepEqual(checks(unknown), ['alert:orphan_unproven']);
  const young = run({ assets: [asset('A', { created_at: String(NOW - 60) })] });
  assert.deepEqual(checks(young), ['ok:young_unmatched']);
  const queued = run({ assets: [asset('A')], jobs: [{ id: 'j', action: 'delete_asset', status: 'pending', asset_id: 'A', upload_id: null }] });
  assert.deepEqual(checks(queued), ['ok:queued']);
});

test('two rows on one asset: alert', () => {
  const r = run({ assets: [asset('A')], rows: [row('r1', 'A'), row('r2', 'A', { mux_upload_id: 'upOther' })] });
  assert.ok(checks(r).includes('alert:asset_shared'));
});

test('an errored asset is reported', () => {
  const r = run({ assets: [asset('A', { status: 'errored', playback_ids: [] })], rows: [row('r1', null, { status: 'processing', mux_upload_id: 'upA', mux_playback_id: null })] });
  assert.ok(checks(r).includes('warn:asset_not_ready'));
});

test('capacity: below, near and at the cap; no cap means not judged', () => {
  const five = ['A', 'B', 'C', 'D', 'E'].map((x) => asset(x));
  const rows = five.map((a, i) => row(`r${i}`, a.id));
  assert.equal(run({ assets: five, rows, opts: { cap: 10 } }).capacity.level, 'ok');
  assert.equal(run({ assets: five, rows, opts: { cap: 10 } }).capacity.free, 5);
  const near = run({ assets: five, rows, opts: { cap: 6 } });
  assert.equal(near.capacity.level, 'warn');
  assert.equal(near.status, 'warn');
  const at = run({ assets: five, rows, opts: { cap: 5 } });
  assert.equal(at.capacity.level, 'alert');
  assert.equal(at.status, 'alert');
  assert.equal(run({ assets: five, rows, opts: { cap: 10, warnAt: 5 } }).capacity.level, 'warn');
  assert.equal(run({ assets: five, rows }).capacity.cap, null);
});

test('overall status takes the worse of the two; an unknown health status is an alert', () => {
  assert.equal(overall('ok', 'warn'), 'warn');
  assert.equal(overall('alert', 'ok'), 'alert');
  assert.equal(overall('ok', undefined), 'alert');
  assert.deepEqual([exitCode('ok'), exitCode('warn'), exitCode('alert')], [0, 1, 2]);
});
