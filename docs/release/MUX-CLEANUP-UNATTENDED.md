# Mux clean-up left on unattended

Status, 21 Oct 2026: **built and tested locally; not deployed.** Rollout steps U0 to U5 below need
Nemat's one approval (`docs/BETA-READINESS.md` section 48).

## 1. What already existed, and what was missing

The worker is not new. `mux-cleanup` (v22 on hosted) and migrations `20261012000200` and
`20261013000100` already provide:

- the queue;
- one claimer at a time, and one job per asset at a time;
- leases, with retries backing off from 1 minute to 6 hours over 10 attempts;
- an ownership check at Mux and a last-moment database check before every write;
- dry runs, the daily orphan sweep and the 30-day retention;
- `mux_cleanup_health()`;
- the schedules: the drain every minute, the sweep daily, the monitor every 10 minutes.

On hosted it has made every kind of change: an asset deletion, a playback revocation and restore,
and an upload cancellation. Each ran in a supervised window (both switches up, one drain, both down).

To leave it on with nobody watching, three things were missing. They are added by
`20261021000200_cleanup_unattended.sql`; the worker's code is unchanged.

| Gap | Why it mattered unattended | Added |
|---|---|---|
| Nothing was sent anywhere | `mux_cleanup_health()` only answered when asked | **U3** email alerts: on change, a 24 h reminder, and recovery; a weekly status as a dead-man signal |
| A worker not in live mode was invisible | With the switch `live` and `MUX_CLEANUP_MODE` unset, every job is released as a dry run each hour. Nothing alerted, and deleted videos stayed public | **U2** `worker_not_live` alert, plus `retrying_jobs`, `no_deletion_cap`, `alerts_not_configured` and `alert_not_delivered` |
| No bound on irreversible work | A bug or a mistaken bulk deletion (for example Auth users deleted in the Dashboard) would delete every affected asset within minutes | **U1** a deletion cap with a latch: at most N asset deletions in 24 hours. Once N are done, the next one pauses deletions for a person; revocations go on. Deletions still in flight (a Mux outage, retries) hold the next ones back but do not pause. A deletion whose answer was lost counts as done |

Every change to `mux_cleanup_settings` is now kept, with who made it, in `mux_cleanup_settings_log`.

## 2. How unattended operation works

- **Two switches, two roles.**
  - **Function switch, `MUX_CLEANUP_MODE`:** set to `live` once and left there. It is the deployment's
    permission to write to Mux.
  - **Database switch, `mux_cleanup_set_mode`:** the operating switch. It is instant, logged, visible
    to the health check, and read again before every single write at Mux.
  - **Why not the other way round:** a secret change needs the CLI and an access token. It also
    restarts every function (6 version bumps during E1 to E3). The database cannot see it, and
    nothing logs it. That makes a poor operating switch.
  - **Why keep the function switch at all:** it stays as an independent second key. Unsetting it
    stops every write even if the database says `live`.
- **The worker's limits are unchanged:**
  - drain every minute, and only when a job is due (otherwise no HTTP call);
  - 10 jobs per claim, at most 5 claims per call;
  - leases of 120 s;
  - backoff from 1 minute to 6 hours, 10 attempts, then `failed`.
- **New limits:**
  - deletion cap **5 per 24 hours** to start;
  - alerts checked every 10 minutes (minute 5, after the monitor at minute 0);
  - at most 30 messages a day;
  - the weekly status on Mondays at 02:00 UTC.
- **Why a cap of 5:**
  - Shortcut Beta holds 5 assets and the free plan stops at 10.
  - The two accounts produce about 0 to 2 deletions a week.
  - Removing T1 completely would be 4 deletions, inside the cap.
  - Raise it to 10 to 20 once outside testers join and the real pattern is known:
    `mux_cleanup_set_deletion_cap(<n>, '<who>')`.
- **What the cap does not hold:** playback revocations and restores, and upload cancellations. All
  three are reversible or harmless, and revocation is the privacy-protecting step, so it must not wait.
- **What counts as a new alert:** the status and the set of problem checks. A count growing within
  one check (1 failed job, then 40) waits for the 24-hour reminder. Test and weekly messages do not
  count toward the 30-a-day limit.
- **`mux_cleanup_alert_to` is one address.** Resend refuses a comma-separated list.
- **A cap of 0 holds every deletion.** It shows as a standing `deletions_paused` alert, with a
  reminder every 24 hours. Use it only as a temporary stop.

## 3. Operating it

| Situation | Do |
|---|---|
| Any alert email | `select public.mux_cleanup_health();` then `select public.mux_cleanup_overview();` |
| **Stop everything now** | `select public.mux_cleanup_set_mode('off', '<who>: <why>');`. It works within the second: new claims stop, and a job already leased is released at its last-moment check before any write (tested) |
| Stop deletions only | `select public.mux_cleanup_set_deletion_cap(0, '<who>');` |
| `deletions_paused` | Check the waiting deletions (`select id, reason, asset_id, created_at from public.mux_cleanup_jobs where status = 'pending' and action = 'delete_asset';`), then `select public.mux_cleanup_resume_deletions('<who>');` |
| `worker_not_live` | `supabase secrets list --project-ref picvoavfxnajfjkqawju` should show `MUX_CLEANUP_MODE`. If not: `supabase secrets set MUX_CLEANUP_MODE=live …`, then `select public.mux_cleanup_set_mode('live', '<who>');` to put released jobs back in the queue |
| `failed_jobs` | Read `last_error` in the overview. `not_verified` means an ownership mismatch: never retry before understanding it. Otherwise fix the cause, then `select public.mux_cleanup_retry('<id>');` |
| `review_jobs` | An asset at Mux of unproven ownership. It is never acted on automatically; decide by hand |
| Second-layer stop | `supabase secrets unset MUX_CLEANUP_MODE --project-ref picvoavfxnajfjkqawju`. Every write is refused even if the database says live |
| Undo the migration | Switch off first, then `supabase/rollback/20261021000200_cleanup_unattended.down.sql` as a forward migration. Rehearsed: the schema afterwards equals the 28-migration fingerprint line for line |

**Silence is not health.** If no weekly status arrives by Monday 03:00 UTC, the alerts are broken:
check the project (a paused free project stops everything), `cron.job_run_details` and
`mux_cleanup_alerts`.

## 4. Rollout (one approval covers U0 to U5)

From branch `claude/conga-mux-production-ready-2aad5b`. The exact commit and the migration's md5 are
in section 48 of `BETA-READINESS.md`.

- **The lead** runs every read and the guarded SQL writes. Writes go through `scripts/provider-sql.sh`
  with `PROVIDER_WRITE_STEP=U<n>`.
- **Nemat** handles the two secret steps: the Resend key, and `MUX_CLEANUP_MODE`.

Stop at any FAIL or anything unexpected; the switch stays `off` until U3d.

**U0. Preflight and backup (read-only).**
- `scripts/cleanup-unattended-hosted-check.sh pre <dir>`, all PASS:
  - 28 migrations, and the fingerprint equal to `inv-expected-28-migrations.fp`;
  - switch `off`, health `ok`, 0 open jobs;
  - 2 accounts, 0 deleted, 0 purge failures;
  - 10 schedules, no cron failure in 24 h;
  - no `MUX_CLEANUP_MODE`, `MUX_API_BASE` or `MUX_STREAM_BASE`;
  - the worker's Mux token is Shortcut Beta's (by digest), not the spike's.
- Protected baseline: `provider-check.mjs save hosted ~/.conga-provider/baseline-u0.json --mux "$MUXENV" --mux <main>/spike/supabase/.env`.
- `provider-mux-read.mjs playbacks` for both environments:
  - Beta: 5 assets, inventory `2fee7234…`;
  - spike: 7 assets, inventory `315652b2…`;
  - all 12 playback ids 200 for both HLS and thumbnail.
- `scripts/mux-reconcile.mjs hosted`: exit 0.
- Backup: `mux_cleanup_settings` (1 row) and `mux_cleanup_jobs` (10 rows) as JSON, saved to
  `~/.conga-provider/backups/` with mode 600. These are the only tables the migration touches.

**U1. The migration.**
- Use a `git archive` of `supabase/migrations`, `config.toml` and `templates`.
- `supabase db push --linked --project-ref picvoavfxnajfjkqawju --workdir <scratch> --dry-run` must
  list exactly `20261021000200_cleanup_unattended.sql` (md5 as recorded).
- Then the same command without `--dry-run`.
- `check post`, all PASS:
  - 29 migrations, and the fingerprint equal to `cu-expected-29-migrations.fp`;
  - 12 schedules;
  - switch `off`, no cap, health `ok`;
  - every table hash unchanged except `mux_cleanup_settings`, which gains three null columns;
  - no Edge Function changed.

**U2. The alert channel.**
- *Before U2:* Nemat creates a Resend API key in the Resend dashboard:
  - name `conga-cleanup-alerts`;
  - permission **Sending access**;
  - domain `auth.churntech.com`;
  - never pasted into chat.
- Nemat, in the hosted SQL editor:
  `select vault.create_secret('<the key>', 'mux_cleanup_alert_key');`
- The lead sets:
  - `mux_cleanup_alert_to` = Nemat's address;
  - `mux_cleanup_alert_from` = `Conga ops <alerts@auth.churntech.com>`.
- The lead runs `select public.mux_cleanup_alert('test');`.
- Nemat confirms the email arrived (inbox, not spam).
- The lead sees Resend's 2xx recorded in `mux_cleanup_alerts`. `mux_cleanup_alert_url` stays unset.

**U3. Cap, function switch, dry run, live.**
- **a.** `select public.mux_cleanup_set_deletion_cap(5, 'Nemat: unattended rollout');`
- **b.** Nemat: `supabase secrets set MUX_CLEANUP_MODE=live --project-ref picvoavfxnajfjkqawju`.
  Every function goes up one version and no bundle changes. With the database `off`, nothing can act.
- **c.** One guarded transaction:
  - checks: switch `off`, 0 open jobs, cap 5, 3 alert secrets;
  - sets `dry_run`;
  - runs `run_mux_cleanup('sweep')`.

  The worker's answer must be: `mode dry_run`, `listed 5`, `complete true`, `in_use 5`, `queued 0`,
  `review 0`, empty `would_queue` and `would_review`.
- **d.** One guarded transaction:
  - checks: switch `dry_run`, 0 open jobs;
  - sets `live`.
- **e.** `select public.run_mux_cleanup('sweep');`

  The answer must be: `mode live`, `listed 5`, `in_use 5`, `queued 0`, `review 0`. This is the
  end-to-end proof that the function's switch is live. It is safe because U3c showed nothing to
  queue.

**U4. Observe (read-only, at least 30 minutes).**
- The schedules running on their own:
  - `mux-cleanup`: at least 30 runs, every one `succeeded`. No worker call while no job is due;
  - `mux-cleanup-monitor`: 3 runs;
  - `mux-cleanup-alert`: 3 runs.
- Health `ok`, and no job created.
- `check live`, all PASS:
  - switch `live`, cap 5, `MUX_CLEANUP_MODE` digest of `live`;
  - 0 open jobs, health `ok`;
  - every table hash unchanged since U1, except the clean-up bookkeeping (`mux_cleanup_settings`,
    `_settings_log`, `_runs`, `_alerts`).
- `provider-check.mjs compare` against `baseline-u0.json`: T1, the founder and both Mux
  environments unchanged.
- `playbacks`: the same 12 ids, all 200/200, with the same inventory hashes.

**U5. Final state and record.**
- **Left on:** database switch `live`, `MUX_CLEANUP_MODE=live`, cap 5, alerts to Nemat, 12 schedules.
- **Recorded:** in `BETA-READINESS.md` and `DECISIONS.md`.
- **Follow-up reads, outside the window:** the first scheduled 04:45 sweep, and the first weekly
  message on Monday 27 Oct at 02:00 UTC.

**Not in this rollout:**
- no new account, invite or Mux asset;
- no deletion;
- no change to T1, the founder or the spike;
- no Edge Function deployment;
- no app or EAS change.

## 5. Verification done locally (21 Oct; isolated stack `shortcut-mxp`, fake Mux and fake Resend only)

| Suite | Result |
|---|---|
| pgTAP, all files | **1880/1880**: 1775 existing plus `0034_cleanup_unattended.sql` 105 |
| `cleanup_integration_test.ts` | **37/37**: 28 existing plus 9 new (below) |
| `alert_integration_test.ts` (new): pg_cron, then pg_net, then a fake Resend | **4/4** |
| `scheduler-integration.sh` (pg_cron, then pg_net, then the served worker) | **13/13** |
| Deno unit (`cleanup_unit_test`, `mux_test`) | 11/11, 22/22 |
| Rollback | Schema after it equals `inv-expected-28-migrations.fp` (0 lines differ); forward again equals `cu-expected-29-migrations.fp` |

The new integration cases are:

- no jobs;
- a lost answer after Mux acted, for an asset `DELETE`, a playback `POST`, a playback `DELETE` and an
  upload cancel. Each is acted on exactly once, and the retry finishes it;
- the switch turned off while the worker is reading Mux: nothing changed, and the job waits with no
  attempt used;
- the cap pausing deletions while a revocation goes through, then a resume;
- the database live with the function in dry run (`worker_not_live`);
- forged deletions of the founder's live asset, named with the right owner or a wrong one: kept,
  never reaching Mux.

The cases that already existed cover:

- one job and many jobs;
- three workers at once;
- a worker killed halfway;
- ownership mismatches;
- a restore during a pending revoke;
- retries and failure.

Not run: anything against hosted, real Mux or real Resend; any device.

## 6. Remaining risks

- **The alerts run on the same database.** If the project is down or paused, nothing is sent. Only
  the missing weekly message shows it.
- **Free tiers:**
  - Resend allows 100 messages a day, and the function sends at most 30;
  - Mux's rate limits are not verified (a 429 is retried);
  - **the Mux free plan's 10-asset cap is a separate external-beta blocker.**
- **CDN caching** may play cached segments briefly after a revocation or deletion.
- **The unknown-result paths are tested against the fake only.** The real Mux calls themselves have
  each run on hosted.
- **The scheduled 03:15 purge after 30 days (E3(i)) is still unverified on hosted.** See section 7.

## 7. The scheduled purge (E3(i)): what would verify it, and whether it blocks

**Not passed.**

The manual Auth deletion (E3b) proved the trigger, `prepare_account_removal` and the asset deletion
on hosted. It did not prove the 03:15 timer or `purge_deleted_accounts()` itself there.

**Evidence needed:**
- an account deleted in the app and not restored for 30 days;
- on day 31, a `purge-deleted-accounts` run `succeeded`;
- the account and its Auth user gone, and 0 `account_purge_failures`;
- one `delete_asset` job with reason `account_purged` per asset, each `done` with `deleted`;
- Mux `GET` 404 for each asset;
- health `ok`.

**Blocking?** In my assessment, no, for the closed beta. The function is rehearsed locally (pgTAP
0033, provider rehearsal). The hosted schedule runs and succeeds daily. A failure on hosted records
an `account_purge_failures` row, and that is now an emailed alert, not a silent one.

The first tester who deletes their account will produce the evidence 31 days later. A disposable
account created only to wait 31 days is not worth its Mux asset or the setup.

This is Nemat's gate decision. The 90-day retention target for anonymised used-invite records is
unrelated to this work and stays unimplemented.
