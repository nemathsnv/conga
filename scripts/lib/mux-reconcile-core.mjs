// The pure part of scripts/mux-reconcile.mjs: compares the Mux asset inventory with the database's
// videos, upload ledger and open clean-up jobs, and counts the inventory against the plan's asset
// cap. No I/O here, so it is unit-tested (scripts/tests/mux-reconcile.test.mjs).
//
// It mirrors the rules of public.mux_cleanup_sweep (20261013000100) but only reports: nothing is
// queued, recorded or changed. Levels: "ok", "warn" (expected while clean-up is off, or close to the
// cap), "alert" (something Mux and the database cannot both be right about).

/** Statuses of a video row that use its asset (public.mux_cleanup_sweep: in use). */
const IN_USE = new Set(['live', 'processing', 'draft']);
const HIDDEN = new Set(['deleted', 'removed']);

const rank = { ok: 0, warn: 1, alert: 2 };
const worst = (a, b) => (rank[b] > rank[a] ? b : a);

/**
 * @param {object} p
 * @param {Array<{id: string, status?: string, passthrough?: string|null, upload_id?: string|null,
 *   playback_ids?: Array<{id: string, policy?: string}>, created_at?: string|number|null}>} p.assets Mux's list
 * @param {Array<{id: string, kind?: string, status: string, author_id: string|null, mux_asset_id: string|null,
 *   mux_upload_id: string|null, mux_playback_id: string|null, case_open?: boolean, author_deleted?: boolean}>} p.rows
 *   video rows with an asset or an upload; case_open: removed and its moderation case still open
 * @param {Array<{upload_id: string, account_id: string}>} p.ledger video_uploads rows
 * @param {Array<{id: string, action: string, status: string, asset_id: string|null, upload_id: string|null}>} p.jobs open clean-up jobs
 * @param {{cap?: number|null, warnAt?: number|null, nowSeconds: number, youngSeconds?: number}} p.opts
 */
export function reconcile({ assets, rows, ledger, jobs, opts }) {
  const young = opts.youngSeconds ?? 3600;
  const byAsset = new Map();
  const byUpload = new Map();
  for (const r of rows) {
    if (r.mux_asset_id) push(byAsset, r.mux_asset_id, r);
    if (r.mux_upload_id) push(byUpload, r.mux_upload_id, r);
  }
  const owner = new Map(ledger.map((l) => [l.upload_id, l.account_id]));
  const openJob = (assetId, uploadId) =>
    jobs.find((j) => (j.asset_id && j.asset_id === assetId) || (uploadId && j.upload_id && j.upload_id === uploadId)) ?? null;

  const findings = [];
  const add = (level, check, detail) => findings.push({ level, check, ...detail });
  const perAccount = {};
  const seen = new Set();

  for (const a of assets) {
    seen.add(a.id);
    const uploadId = a.upload_id ?? null;
    const pass = a.passthrough ?? null;
    perAccount[pass ?? '(none)'] = (perAccount[pass ?? '(none)'] ?? 0) + 1;
    const matched = uniq([...(byAsset.get(a.id) ?? []), ...(uploadId ? byUpload.get(uploadId) ?? [] : [])]);
    const publicIds = (a.playback_ids ?? []).filter((p) => (p.policy ?? 'public') === 'public').map((p) => p.id);
    const job = openJob(a.id, uploadId);
    const created = Number(a.created_at);
    const isYoung = Number.isFinite(created) && created > opts.nowSeconds - young;

    if (a.status && a.status !== 'ready' && a.status !== 'preparing') {
      add('warn', 'asset_not_ready', { asset: a.id, status: a.status, rows: matched.map((r) => r.id) });
    }
    if (matched.length === 0) {
      if (job) { add('ok', 'queued', { asset: a.id, job: job.id, action: job.action }); continue; }
      if (isYoung) { add('ok', 'young_unmatched', { asset: a.id }); continue; }
      const ledgerOwner = uploadId ? owner.get(uploadId) ?? null : null;
      if (ledgerOwner && ledgerOwner === pass) {
        add('warn', 'orphan', { asset: a.id, owner: pass, detail: 'no video row; its upload was minted for the passthrough account (the sweep would delete it)' });
      } else {
        add('alert', 'orphan_unproven', { asset: a.id, passthrough: pass, detail: 'no video row and no ledger upload minted for its passthrough (the sweep would hold it for review)' });
      }
      continue;
    }
    if (matched.length > 1) add('alert', 'asset_shared', { asset: a.id, rows: matched.map((r) => r.id) });
    for (const r of matched) {
      if (r.author_id && pass !== r.author_id) {
        add('alert', 'owner_mismatch', { asset: a.id, row: r.id, detail: 'the asset passthrough is not the row author' });
      }
      if (r.mux_asset_id && r.mux_asset_id !== a.id) {
        add('alert', 'asset_mismatch', { asset: a.id, row: r.id, detail: 'the row names another asset for the same upload' });
      }
    }
    const use = matched.find((r) => IN_USE.has(r.status));
    if (use) {
      const where = job ? { job: job.id, action: job.action } : {};
      if (use.author_deleted) {
        // The author deleted the account: the row stays live (hidden) and its playback is revoked
        // by a sync_playback job (delete_account -> mux_sync_account_playback).
        if (publicIds.length > 0) {
          add(job ? 'warn' : 'alert', 'hidden_still_playable', { asset: a.id, row: use.id, status: 'account_deleted', ...where,
            detail: job ? 'the author deleted the account; still playable at Mux until its job runs' : 'the author deleted the account; still playable at Mux, and no clean-up job is open' });
        } else {
          add('ok', 'revoked', { asset: a.id, row: use.id });
        }
      } else if (use.status === 'live' && use.mux_playback_id && !publicIds.includes(use.mux_playback_id)) {
        add('alert', 'playback_missing', { asset: a.id, row: use.id, detail: 'the row plays a playback id the asset does not have' });
      } else if (use.status === 'live' && !use.mux_playback_id) {
        add(job ? 'warn' : 'alert', 'live_without_playback', { asset: a.id, row: use.id, ...where, detail: 'a live row of an active account has no playback id' });
      } else {
        add('ok', 'in_use', { asset: a.id, row: use.id });
      }
      continue;
    }
    const hidden = matched.find((r) => HIDDEN.has(r.status));
    if (hidden) {
      const where = job ? { job: job.id, action: job.action } : {};
      if (hidden.status === 'removed' && hidden.case_open) {
        add('ok', 'held', { asset: a.id, row: hidden.id, ...where });
      } else if (publicIds.length > 0) {
        add(job ? 'warn' : 'alert', 'hidden_still_playable', { asset: a.id, row: hidden.id, status: hidden.status, ...where,
          detail: job ? 'deleted or removed in the app, still playable at Mux until its job runs' : 'deleted or removed in the app, still playable at Mux, and no clean-up job is open' });
      } else {
        add(job ? 'ok' : 'warn', 'hidden_kept', { asset: a.id, row: hidden.id, status: hidden.status, ...where });
      }
    }
  }

  // Rows that point at an asset Mux no longer has.
  for (const r of rows) {
    if (!r.mux_asset_id || seen.has(r.mux_asset_id)) continue;
    if (IN_USE.has(r.status)) add('alert', 'missing_at_mux', { row: r.id, asset: r.mux_asset_id, status: r.status, detail: 'the row uses an asset Mux does not list' });
  }

  // Capacity.
  const count = assets.length;
  let capacity = { count, cap: opts.cap ?? null, level: 'ok' };
  if (opts.cap) {
    const warnAt = opts.warnAt ?? Math.max(1, opts.cap - 2);
    const level = count >= opts.cap ? 'alert' : count >= warnAt ? 'warn' : 'ok';
    capacity = { count, cap: opts.cap, warn_at: warnAt, free: Math.max(0, opts.cap - count), level };
    if (level !== 'ok') add(level, 'capacity', { count, cap: opts.cap, detail: level === 'alert' ? 'at or over the asset cap: new videos may fail at Mux' : 'close to the asset cap' });
  }

  let status = 'ok';
  for (const f of findings) status = worst(status, f.level);
  const counts = {};
  for (const f of findings) counts[f.check] = (counts[f.check] ?? 0) + 1;
  return { status, capacity, per_account: perAccount, counts, problems: findings.filter((f) => f.level !== 'ok'), findings };
}

/** The exit status for a level: 0 ok, 1 warn, 2 alert. */
export const exitCode = (level) => rank[level] ?? 2;

/** Combines the reconciliation with public.mux_cleanup_health()'s own status. */
export function overall(reconStatus, healthStatus) {
  const h = healthStatus === 'ok' || healthStatus === 'warn' || healthStatus === 'alert' ? healthStatus : 'alert';
  return worst(reconStatus, h);
}

function push(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value); else map.set(key, [value]);
}
function uniq(rows) {
  const out = new Map();
  for (const r of rows) out.set(r.id, r);
  return [...out.values()];
}
