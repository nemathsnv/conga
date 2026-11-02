# Playback revocation fix (20261101000100): preflight and GO/NO-GO (2 Nov 2026)

Branch `claude/conga-revocation-preflight`, from `3ee6d95` (the tip of `claude/conga-beta-readiness-0d8b16`,
which holds the fix `e963897`). Local commits only, not pushed.

**Nothing hosted was changed.** Reads only: selects through the select-only guard of
`scripts/cleanup-unattended-hosted-check.sh`, `supabase functions download` / `secrets list` /
`backups list`, Mux GETs (`scripts/mux-reconcile.mjs`), and one unauthenticated GET to the worker
(answered `405 POST only` by the function's own code). No Mux asset, playback id, account, video or
upload was created, changed or deleted. No Edge Function was deployed, no secret, cap or switch changed.

## 1. The change

Only `public.mux_forget_video` changes. Its callers (`delete_video`, `abandon_response`,
`discard_draft`, `post_draft`) and its grants are unchanged.

- `supabase/migrations/20261101000100_forget_video_revokes_playback.sql` (md5 `ee9c5b85…`)
- `supabase/rollback/20261101000100_forget_video_revokes_playback.down.sql` (md5 `80d2a769…`)

```sql
create or replace function public.mux_forget_video(p_response uuid, p_asset text, p_upload text, p_owner uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_asset is not null then
    perform public.mux_cleanup_enqueue('sync_playback', p_reason, p_asset, p_upload, p_response, p_owner, now() - interval '1 second');
    perform public.mux_cleanup_enqueue('delete_asset', p_reason, p_asset, p_upload, p_response, p_owner);
    update public.mux_cleanup_jobs
       set not_before = now(), reason = p_reason, response_id = coalesce(response_id, p_response)
     where dedupe_key = 'delete_asset:' || p_asset and status = 'pending' and not_before > now();
  elsif p_upload is not null then
    perform public.mux_cleanup_enqueue('cancel_upload', p_reason, null, p_upload, p_response, p_owner);
  end if;
end;
$$;
```

The rollback restores the 20261013000100 body (the same without the `sync_playback` line).

Files changed by `e963897` (already reviewed in section 50 of `docs/BETA-READINESS.md`): the migration
and its rollback, pgTAP `0035` (new) and `0010`, the Deno clean-up and scheduler suites, and
`scripts/rollback-check/tests-before-20261101000100.patch`.

Added by this preflight (tests and tooling only; no product or migration code):

- `supabase/tests/0036_forget_video_revocation_edges.sql`: 30 pgTAP tests for what `0035` left out.
- `supabase/functions/_tests/cleanup_integration_test.ts`:
  - the cap test now also asserts that the held video's own playback is revoked;
  - its job lookup is by action, not by position;
  - a new test covers a revocation that fails part-way under cap 0.
- `scripts/revocation-rollback-check.sh`: a rollback rehearsal of this migration on its own.
- `scripts/cleanup-unattended-hosted-check.sh`: a `revoke` phase (30 migrations).
- `docs/release/rv-expected-30-migrations.fp`: the expected fingerprint after the deploy.

## 2. Why it fixes the gap

**Before:** an author's deletion, abandonment or draft replacement queued only `delete_asset`.
Since 20261021000200 the cap (2 per 24 h) can hold that job, and so can a retry or a pause. Until
the asset was deleted, the public playback id kept working on `stream.mux.com` for anyone who
already had it (another member's player cache, a shared web page loaded earlier).

**After:** the same call also queues `sync_playback`. The cap never touches it:

- `mux_cleanup_claim` applies the cap only inside `if j.action = 'delete_asset'`;
- `run_mux_cleanup` skips only `delete_asset` while deletions are paused.

The worker reads `mux_playback_wanted`, which is false for a deleted video. It deletes every public
playback id on the asset. Only then does the row forget its `mux_playback_id`.

| Requirement | How it holds | Evidence |
|---|---|---|
| Revocation before deletion | The revocation is due `now() - 1 s`. The deletion keeps the later of its times, at least `now()`. The claim orders by `not_before`. It never leases two jobs for one asset in a batch, nor while one runs. If the deletion still went first, the asset's deletion removes playback anyway (the revocation then closes `already_gone`). | 0035; 0036 §2, §4; integration `["GET", "DELETE playback", "GET", "DELETE"]` |
| Cap cannot block revocation | Paused, or reached within this very claim: the deletion is skipped without being added to the batch's assets, and the revocation is leased. | 0035; 0036 §4; integration cap tests |
| Idempotent, no duplicates | One open job per `dedupe_key` (forgetting twice merges). A playback id that is already gone counts as revoked. Each attempt re-reads the asset. | 0035; "unknown result: a revocation's DELETE is lost"; new partial-failure test (no second DELETE of an id already revoked) |
| Failure never reported as success | Any non-404 error is a `retry`, not `done`. After 10 attempts the job is `failed`, with no outcome recorded. The row keeps its playback id until Mux confirms. | 0036 §3; new partial-failure test |
| Retries keep the authorization checks | `owner_id` and `response_id` stay until `done`. Every attempt checks the asset's passthrough and upload id at Mux, then asks `mux_cleanup_check` again under a row lock. | 0036 §3; "ownership" test |
| Concurrency | Advisory lock and `skip locked` in the claim; one job per asset. An expired lease makes the old worker's result `stale`. | "three workers at once"; "a restore never overlaps a running revoke" |
| Account deletion and moderator removal | Functions unchanged (the fingerprint differs from the hosted one in this single function). Their suites pass. | fingerprint diff; integration and pgTAP suites |
| Unrelated videos and users untouched | Jobs target one asset and one response. The tests check the author's other videos and the founder's. | 0035, 0036, integration |

**Edge Functions:**

- **No change needed.** The worker already handles `sync_playback` for any reason, and
  `author_deleted` and `abandoned` are already allowed reasons.
- **The deployed bundle matches the repo.** The `mux-cleanup` v23 bundle was downloaded and compared
  after normalising both sides. Its `index.ts`, `handler.ts` and `_shared/supabase.ts` are
  identical to the repo's.
- **One drift, outside the worker.** The deployed `_shared/mux.ts` predates `muxStreamBase()`, so its
  `prewarm()` differs. `prewarm()` is used by the webhook and upload status, never by the worker.
  Deploying the migration alone is therefore sufficient.

## 3. Hosted baseline (2 Nov, 07:04 to 07:20 UTC, read-only)

**Matches the fix's assumptions:**
- **Schema:** 29 migrations, the newest `20261021000200`. The fingerprint equals
  `cu-expected-29-migrations.fp` line for line: no drift. The only pending migration is
  `20261101000100`.
- **Mode:** switch `live`, `MUX_CLEANUP_MODE` = `live` (by digest).
- **Cap:** 2, not paused, never resumed. 0 deletions counted in 24 h, so the full capacity of 2 is
  free.
- **Jobs:** 10 (9 done, 1 skipped). 0 pending, running, failed, for review or retrying.
- **Schedules:** 12, all active, no cron failure in 24 h.
- **Purge:** the 03:15 purge succeeded.
- **Worker:** `mux-cleanup` v23 (`5adecf46…`, as on 1 Nov). 14 secret names. The worker's Mux token
  is Shortcut Beta's, not the spike's (by digest).
- **Accounts:** 2 accounts, 2 Auth users, 0 purge failures.
- **Videos:** 10 responses: 6 live, each with its own asset and playback id, and 4 deleted, none
  holding an asset. **No deleted video holds a playback id today.**
- **Mux reconciliation (GET only):** 6 assets, all 6 in use, no orphans, no candidates.
- **New since 1 Nov:** one live response, posted 2 Nov 06:46 UTC. This is normal owner activity.

**Does not match: health is `alert` (`worker_errors`).**
- **What failed:** the scheduled 04:45 UTC sweep (request 37) got `502 Bad Gateway`, an HTML page from
  the gateway, 40 ms after the request. The function's own code always answers JSON, and a sweep lists
  Mux, which takes seconds. So the gateway answered before the worker ran.
- **The alert went out:** it was emailed at 04:55 (Resend 200).
- **The worker boots now:** a GET at 07:13 answered `405 {"error":"POST only"}` from the handler.
- **No job was affected:** none was due, so no drain was attempted.
- **When it clears:** the alert leaves the 24-hour window after 04:45 UTC on 3 Nov. The next
  scheduled sweep runs at that time.
- **Material?** I judge it not material to the fix: schema, functions, cap and worker match. But it
  is an unexplained platform failure of the same function that would run the revocations, and it
  makes the post-deploy health check fail. See section 12.

**Backups:** `supabase backups list` returns none, and PITR is off. The platform offers no restore
point. Section 6 covers what that means here.

## 4. Tests (2 Nov, isolated stack `shortcut-rvk`, fake Mux only)

`scripts/full-local-verification.sh rvk 557` (`CONTINUE=1 KEEP_STACK=1`) on 30 migrations:

| Step | Result |
|---|---|
| pgTAP (26 files, with 0035 and the new 0036) | PASS, 1931 tests (1901 before plus 30) |
| Deno unit (6 files) | PASS |
| Deno integration: clean-up | PASS 38/38 (37 plus the new partial-failure test) |
| Deno integration: abandon 16, admin 7, alert 4, avatar 3, idempotency 13, core 20, sign-in method 3, uploads 32, web beacon 1, admin HTTP 4 | PASS |
| Idempotency rollback chain, all 30 migrations back to batch A and forward (old suite 1089 tests) | PASS |
| Scheduler integration (real pg_cron and pg_net, fake Mux) | PASS |
| C1 rehearsal; provider rehearsal (mocked Mux, E1 to E3) | PASS |
| Auth integration | PASS |
| App typecheck, lint, jest | FAIL in this worktree: no `app/node_modules`, so `tsc` and `expo` were not found, and the script's `tail` hid jest's failure. Run on the identical app code (`3ee6d95`, 0 lines of app diff) in the `conga-beta-readiness-0d8b16` worktree: typecheck 0, lint 0, jest 42 suites and 528 tests PASS. The fix touches no app file. |
| `scripts/revocation-rollback-check.sh` (this migration alone) | PASS 10/10. 30 migrations differ from the hosted 29 in one fingerprint line. After the rollback the fingerprint equals `cu-expected-29-migrations.fp`, queued jobs are unchanged, and the old behaviour is back. Forward again, the fingerprint, `schema_migrations` and row counts are as at the start. |

The stack was stopped afterwards.

**Cap exhausted, explicitly:**
- **pgTAP 0035:** paused before the deletion.
- **pgTAP 0036 §4:** the cap reached inside the claim pauses deletions, and the revocation is still
  leased.
- **Integration "deletion cap: past the cap…":** the third deleted video's playback is revoked at Mux
  while its asset waits with no attempt used. The founder's video is untouched.
- **Integration "…a revocation that fails part-way…":** cap 0, two public ids, the second DELETE
  answers 503:
  - the job is `pending` with attempt 1, not `done`;
  - the next attempt deletes only the remaining id;
  - the row forgets its id only then;
  - the asset waits;
  - a further drain changes nothing at Mux;
  - after the resume the asset is deleted, once.

**Limits of this verification:**
- Mux was faked throughout.
- That a revoked playback id stops serving on Mux's CDN was observed on the real Mux in October
  (E1 to E3b). It was not re-run.
- A real unattended revocation on hosted has still not happened.

## 5. Deployment steps (only the migration)

All steps are from this branch at the reviewed commit, against the Conga hosted project.

**D0. Fresh baseline (read-only, immediately before):**
- `scripts/cleanup-unattended-hosted-check.sh live <dir>` all PASS, health `ok` included. See
  section 11 on the current alert.
- `mux-reconcile.mjs hosted` `ok`, and the worker GET answers 405.
- `provider-check.mjs save hosted ~/.conga-provider/baseline-rv.json --mux …`, as in U0.
- Back up `mux_cleanup_settings` and `mux_cleanup_jobs` as JSON to `~/.conga-provider/backups/`
  (mode 600). They are the only tables whose behaviour the change touches.

**D1. Migration:**
- Make a `git archive` of `supabase/migrations`, `config.toml` and `templates` into a scratch workdir.
- `supabase db push --linked --project-ref <ref> --workdir <scratch> --dry-run` must list exactly
  `20261101000100_forget_video_revokes_playback.sql`.
- Run the same command without `--dry-run`.

**D2. `scripts/cleanup-unattended-hosted-check.sh revoke <dir>` all PASS:**
- 30 migrations, and the fingerprint equal to `rv-expected-30-migrations.fp`. It differs from the 29
  in the `mux_forget_video` line only.
- Live, cap 2, not paused, 0 open jobs, health `ok`, 12 schedules.
- 14 secrets, and `mux-cleanup` still v23.
- Every table hash equal to D0's: the migration changes no row.

**D3. Catalog check (select):** `mux_forget_video` is `security definer`, executable only by
`postgres`, and its body queues `sync_playback` before `delete_asset`.

**D4. Observe for 30 minutes:**
- every `mux-cleanup` run succeeds;
- no worker call, since nothing is due;
- no alert, and no job created;
- `provider-check compare` is `unchanged`.

**D5.** Record the result in `BETA-READINESS.md` (section 52) and `DECISIONS.md`.

**Not part of the deploy:** Edge Functions, secrets, the cap, the switch, Mux, the app and EAS.

## 6. Backup and recovery

**What can be undone, and what cannot:**

| Effect | Reversible? | Notes |
|---|---|---|
| The function body | Yes, by the rollback file (as a new forward migration) | Rehearsed: the fingerprint returns exactly to today's hosted 29, and no job row changes |
| Queued `sync_playback` jobs | Not undone by the rollback (by design) | They still run and revoke a deleted video. Do not delete them: that is the privacy step |
| Completed revocations at Mux | No | A playback id is only re-created by `sync_playback` with `playback_wanted = true`, which a deleted video never has. The video's owner deleted it, so nothing should restore it |
| Asset deletions at Mux | No | **Unchanged by this migration:** the same `delete_asset` job, the same cap. It adds no irreversible action |

**Recovery strategy, privacy first:**

- **Prefer stopping to rolling back.** If the worker misbehaves:
  - to stop deletions only, set the cap to 0 (`mux_cleanup_set_deletion_cap(0, …)`). Revocations go
    on;
  - to stop every Mux write, use the emergency stop (`mux_cleanup_set_mode('off', …)`). This also
    stops revocations, so keep it short.
- **Roll back only for a defect in the function itself.** A rollback brings the gap back for every
  later deletion.
- **No database restore across user deletions.**
  - There is no backup or PITR today, but this matters if one is added.
  - A snapshot from before a member's deletion brings the video back as `live`, with a playback id
    already revoked at Mux.
  - The next account restore would then mint a new public id for content its author deleted.
  - Any restore must re-apply every deletion made after the snapshot.
- **Without platform backups, rely on these:**
  - the migration changes no data, so there is nothing to restore;
  - the old function body is in git (20261013000100) and in the rollback file;
  - D0's JSON copy covers the clean-up tables.

## 7. Rollback risks

**Rolling back reopens the gap:**
- Deletions after the rollback queue only `delete_asset`.
- With the cap held, their playback stays public until a person resumes deletions.

**Safe either way:**
- Jobs already queued are untouched and keep revoking.
- No Mux action is reversed or repeated.

**Rehearsed on its own** (`scripts/revocation-rollback-check.sh`): rollback, then old behaviour, then
forward again. The fingerprint and `schema_migrations` match at every step.

## 8. Live clean-up after the deploy

**What changes:**
- **Two jobs per video:** each author deletion, abandonment (once Mux has made the asset) or draft
  replacement queues two jobs, not one.
- **Mux calls per deleted video:** GET and DELETE of each public playback id, then GET and DELETE of
  the asset. That is one more GET and one more DELETE than today, far below Mux's limits.
- **When deletions are paused:** the revocation still runs within about a minute. The deletion waits
  for a person, as today, with the same `deletions_paused` alert.

**What stays the same:**
- the cap's counting (only asset deletions count);
- account deletion, recovery and moderator removal;
- the sweep, the purge and the alerts.

## 9. Impact on existing users, videos and Mux assets

**At deploy time, none:**
- no row changes;
- no job is created (no open jobs, and no deleted video holds an asset);
- the deploy itself makes no call to Mux.

All 6 live videos and their playback ids are untouched. Only deletions after the deploy are affected.

## 10. After the deploy

- **D2 to D4 above.**
- **The first real deletion:** when Nemat next deletes, abandons or replaces a video in normal use,
  read (select only):
  - its `sync_playback` is `done` / `revoked`, and finished before its `delete_asset`;
  - `mux_cleanup_deletions_counted()` grew by one only for the asset deletion;
  - no `failed` or retrying job;
  - health `ok`;
  - `mux-reconcile` `ok`.

  No test video is created for this.

## 11. Remaining risks

**R1. Upload abandoned before Mux finished (low).**
- **The gap:** the video is deleted while Mux has not yet made the asset, or before the ready event
  arrives. Three paths still queue only `delete_asset` for that asset, which has a public playback id:
  - `mark_response_live`'s deleted branch;
  - `cancel_upload`'s `found_asset`;
  - the `unknown_upload` orphan.
- **Why low:** that id was never stored in the database or shown to any other member. At most the
  author's own app sees it, through `mux-upload-status`.
- **The fix:** queue `sync_playback` on these paths too. This is a separate change; it is not made
  here.

**R2. No platform backup or PITR.** A product and plan decision, outside this fix.

**R3. The 502 on today's sweep is unexplained.**
- It was a platform gateway failure, and the worker answers now.
- If it recurs on the worker's drain calls, revocations wait: each failed call is retried the next
  minute, and alerts fire.

**R4. A revocation that fails 10 times becomes `failed`.**
- That happens after a long Mux outage (about 14 h of backoff).
- An alert goes out, and a person runs `mux_cleanup_retry`. Until then the id plays.

**R5. A wrong comment in the migration.** Its comment says "both post_draft signatures"; only one
exists since 20261013000200. This is harmless and left as is, so the reviewed file stays byte for
byte.

## 12. GO/NO-GO

**GO for the migration alone, held until the worker's health is clean again.**

**The code is ready:**
- every backend suite and both rollback checks pass;
- the hosted schema has no drift;
- the deployed worker needs no change;
- the deploy changes no row and calls Mux for nothing.

**Why wait for 3 Nov:**
- **Clean health:** today's `worker_errors` alert would fail D0 and D2. It would also make any new
  alert after the deploy ambiguous.
- **Little exposure meanwhile:** no deleted video holds a playback id today, and the cap has its full
  capacity of 2. The gap needs a third deletion within 24 h, or a failing deletion, before it exposes
  anything.

**Condition:** deploy after the 3 Nov 04:45 UTC sweep answers 200 and health returns `ok`, then run
D0 to D5.

**If Nemat wants it today instead:** it is acceptable, with one documented exception in D0 and D2.
The only allowed health problem is `worker_errors` from request 37 (2 Nov 04:45 UTC), and the worker
GET must answer 405.

**NO-GO triggers at deploy time:**
- any fingerprint drift;
- a migration count other than 29 before (or 30 after);
- an open, failed or retrying job;
- deletions paused;
- `mux-cleanup` not v23;
- another 502.
