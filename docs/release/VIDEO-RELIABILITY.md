# Video infrastructure reliability: release notes (16 Oct 2026; local only, not deployed)

Scope: the upload, discard and Mux clean-up paths before the hosted rollout of the unreleased
migrations `20261013000200` and `20261013000300` and the `abandon-submission` function. Work done
under Nemat's authorisation of local work for this effort.

**Verification status, honestly:** everything below ran on an isolated local stack (`shortcut-a`)
with Mux stubbed or faked. Nothing ran on a device, a simulator, the hosted project or real Mux.
Nothing was deployed, pushed, linked, or switched.

## 1. Commits (branch `worktree-agent-a373313092bbb432d`, on top of `7ebb69e`)

| Commit | What |
|---|---|
| `5d9fd61` | Scripts: `scheduler-integration.sh` takes `FAKE_MUX_PORT`, so two local stacks can run it at once |
| `be99363` | `abandon-submission`: an `errored` or undocumented Mux upload is kept unverified until its URL has long expired (section 2), with unit, integration and Jest tests |
| `4666545` | pgTAP `0014`: posting submissions across account deletion, recovery, purge and Admin deletion |
| `1a288a0` | Scripts: provider tests C2, E1 to E3 (`provider-member.mjs`, `provider-sql.sh`, `provider-drain.sh`, `provider-mux-read.mjs`) and their local rehearsal (`provider-rehearsal.sh`, `provider_rehearsal_test.ts`) |
| this one | This document and `PROVIDER-TESTS.md` |

No migration was added: the errored change is in the function only, and pgTAP `0014` tests existing
behaviour. The deployable set is therefore unchanged: `20261013000200`, `20261013000300` and the
`abandon-submission` function (now with `be99363`).

## 2. Mux `errored` uploads in `abandon-submission` (20.2, 20.6)

**The problem.** `abandon-submission` retired a row whose upload Mux reported `errored` with no
`asset_id` as if it were `timed_out`, and the app then deleted the recording. Mux documents a
no-asset guarantee for two cases only (API reference, read 14 Oct, `docs/BETA-READINESS.md` 20.2): a
**confirmed cancel** of a `waiting` upload ("If a pending upload finishes after this request, no
asset will be created"), and **`timed_out`** (no successful transfer before the URL expired). Mux's
upload states are `waiting`, `asset_created`, `errored`, `cancelled`, `timed_out`; `errored` means
asset creation failed after bytes arrived, and whether an asset can still follow is not documented.

**Decision (the simplest safe, bounded rule).** `decideAbandon` in
`supabase/functions/abandon-submission/handler.ts`:

| Mux says about the row's upload | Answer | Row | Phone |
|---|---|---|---|
| any `asset_id`, or `asset_created` | `kept` / `at_mux` | untouched | carries on as processing |
| `cancelled`, `timed_out` (documented) | `abandoned` | retired | recording deleted |
| `waiting` | cancel at Mux, then `abandoned` only on a confirmed cancel | retired / kept | as answered |
| **`errored`, or any state not in Mux's list**, no asset | **`kept` / `unverified`** until 10 minutes after the URL's recorded expiry (`video_uploads.expires_at`, the reservation plus 3600 s; Mux's own expiry is at most 60 s later); after that, **`abandoned`** if Mux still reports the same upload with no asset | kept, then retired | kept and asked again (30 s, 2 min, 10 min, then at launch, foreground and reconnection), then deleted |
| no answer, malformed answer (no status, another upload's id), ledger expiry unreadable | `kept` / `unverified` | untouched | kept, asked again |

Why the bound is safe: once the URL has expired no transfer can start, and Mux has already reported
asset creation as failed. If Mux nevertheless made an asset later, its `video.asset.ready` finds a
`deleted` row and `mark_response_live` records it and queues its deletion (`delete_asset`,
`abandoned`): it can never be published (tested). Why it is bounded: without the bound an errored
upload would block the member's next recording forever (an unconfirmed discard keeps blocking new
recordings, decision 3 of 14 Oct); with it the block lasts at most about 70 minutes after the URL was
minted, ended by the first reconciliation after that (a timer within the first 12.5 minutes, then the
app's launch, foreground or reconnection events).

**Compatibility.** No new answer: `kept` / `unverified` is what every build since `b7a02ad` already
handles (the recording stays, the discard stays requested and is asked again). No migration. Older
builds (`ede68ed`) never call this function. Unchanged elsewhere: Retry of an errored upload still
gets one fresh URL (`planResend`), the stage 2 retire keeps an errored URL (`retireAbandonedUpload`
treats anything but `waiting`, `cancelled`, `timed_out` as not retirable), and the worker's
`cancel_upload` treats `errored` as nothing left to cancel.

**Tests:** `abandon_unit_test.ts` (new, 4); `abandon_integration_test.ts` 12 → 16 (errored and an
undocumented state before the bound, just after expiry and inside the margin; retired on a later ask
once settled, then a replay is `submission_closed` and a late asset is queued for deletion, not
published; errored with an asset id; a ledger row not matching the member; malformed answers);
`memberPosting.test.ts` +1 (the phone holds the recording through every timer and an early
foreground, and the first foreground after the bound settles it). Mutation check: restoring the old
rule (`errored` retires at once) fails 2 unit and 3 integration tests.

**Not known, and only real Mux can tell:** what an `errored` upload looks like (with or without an
`asset_id`, and whether an errored asset counts against the plan's 10). Optional provider step C2e
(`PROVIDER-TESTS.md` 5) would show it, at the possible cost of one errored asset.

## 3. Verification of the existing reliability work (no rebuild)

Each claim is checked against the code and a test that would fail if it broke. Findings already
resolved in `docs/BETA-READINESS.md` sections 16 to 20 are not reopened. New evidence produced one
fix (section 2) and one set of regression tests (pgTAP `0014`); nothing else needed changing.

| # | Property | Code | Proving tests | Verdict |
|---|---|---|---|---|
| 1 | Upload URL single-flight | `ticketStore.ts` (`createTicketStore`: one entry per member, `get` joins a running request, 50-min age from the request); `postingFlow.ts` `createGate`, `createOncePerKey`, `createQueue`; server cap `reserve_video_upload` (3 unused) | `uploadRace.test.ts` (CP0 race, disclosure path, StrictMode double prefetch, rapid taps: one mint and one row); uploads integration "ten simultaneous mints give exactly three URLs" | Holds |
| 2 | Account-scoped recordings | `pendingPost.ts` (`shortcut.pendingPost.<member>`, `savePendingPostOrThrow` refuses another owner); `pendingPostFor` (ownerless = nobody's); `memberPosting.stop()` on member change; `ticketStore.forOwner` / `reset` | `uploadRun.test.ts` "only its member gets it back", "a post stored before posts had an owner belongs to nobody"; `postingFlow.test.ts` "read from the member's own slot"; `memberPosting.test.ts` C2 suite; `uploadRace.test.ts` "another member never gets…", "signing out resets the store" | Holds |
| 3 | Submission UUID idempotency | `20261013000200`: member lock, `submission_replay` (fingerprint with `IS DISTINCT FROM`, 0300), `record_submission`, `post_submissions` (id, upload and row each unique) | pgTAP `0012` (77), `0013`; idempotency integration "six simultaneous attempts…" (response, reply, draft), "another member reusing a submission id gets submission_conflict", "a changed request with the same id is refused"; `postRpc.test.ts` | Holds |
| 4 | Lost-response recovery | `submitPost` stores the post with URL and submission before the request; `ensureUploadRow` re-sends the same URL; `runPendingPost` asks Mux before resending a replayed row (`resent`) | `uploadRun.test.ts` "a lost answer…", "after a lost answer and an app restart, Retry gets the same row back"; idempotency integration "lost answer: the same post_response again returns the same row"; `discardSafety.test.ts` "the row comes back from a repeated request with attempts 0: Mux is still asked" | Holds |
| 5 | Retry handling | `planResend` (table in BETA-READINESS 17.2); `retry_response_upload` (same upload is a no-op; `submission_busy` during a hold); `memberPosting.retry` (offline waits; never during a discard) | `uploadRun.test.ts` planResend suite (cut part-way, answer lost, force-quit, closed while processing, timed_out/cancelled/errored, no answer, two Retries = one transfer); idempotency integration "retry_response_upload repeated after a lost answer changes nothing" | Holds. Unverified at Mux: a second full PUT to a URL that has part of a file |
| 6 | Duplicate upload prevention | `claim_video_upload` (row lock; once; owner; unexpired; not cancelled); `post_submissions.upload_id` unique; a URL sent with a post leaves the store and is never replaced automatically | uploads integration "reuse…", "six simultaneous posts of one upload; exactly one wins", "cross-account…"; idempotency integration "six different submissions racing for one upload"; `uploadRace.test.ts` "re-recording never gets a URL a transfer could have started on" | Holds |
| 7 | Foreground upload coordination | `putRecording` (`sessionType: 'foreground'`, abort signal); `createExclusive` (upload and discard never overlap); `resumeState` (`uploading` → Upload failed `interrupted`) | `putRecording.test.ts`; `discardSafety.test.ts` "Discard during an upload stops it and waits", "a second Retry joins the running upload", "PR-Posting is shown before the first request" | Holds in code. iOS suspension timing is device-unverified |
| 8 | Mux status reconciliation | `mux-upload-status` (author-filtered; `mark_response_live` with the passthrough); `mux-webhook`; `waitUntilLive` | integration "the caller's own ready upload goes live", "F13: another member's processing upload is 404"; uploads integration "owner check…"; `mintUpload.test.ts` (`status_not_found`) | Holds |
| 9a | Cancel vs webhook | Mux's documented cancel guarantee; `finish_submission_abandon` re-checks under the row lock; `mark_response_live` locks the row | pgTAP `0013` "a webhook makes the video live between the question to Mux and the finish"; abandon integration "cancel refused…", and the new late-asset check | Holds |
| 9b | Concurrent abandon calls | 2-minute hold with a token; a stale token's finish does nothing | abandon integration "two abandonments at once ask Mux once; the second is kept busy" (and a replay is `submission_busy`); pgTAP `0013` expired holder; pgTAP `0014` late finish after an Auth deletion | Holds |
| 9c | Retry after an interrupted transfer, vs Discard | `createExclusive`; Discard stops a Post in flight and waits (`memberPosting.discard`) | `discardSafety.test.ts` "Retry got the row back and is about to send; Discard stops it first"; `memberPosting.test.ts` C1 suite | Holds |
| 9d | Undocumented Mux states | `decideAbandon` | section 2 | **Was a gap; fixed in `be99363`** |
| 10 | Abandoned upload cleanup | stage 2 `retireAbandonedUpload` (`begin/finish_upload_cancellation`); stage 3 `cancel_upload` from `mux_forget_video`, a Retry's replacement and account removal; worker `planCancel`; daily sweep; a ready event for an unused upload deletes it once expired | uploads integration "each re-record retires the oldest unused URL", "an upload Mux already reports cancelled or timed out frees its slot", "a post arriving while its upload is being cancelled is refused"; cleanup integration "deleted before Mux finished…", "an upload never posted…", "sweep: an orphan…"; `c1-rehearsal.sh` (29); provider rehearsal C2 | Holds |
| 11 | Asset ownership | passthrough = the minting member; `mark_response_live` `owner_mismatch`; worker `assetMismatch` (passthrough and upload); sweep acts only on ledger-proven owners | uploads integration "owner check…"; cleanup integration "ownership: an asset whose passthrough or upload is not the recorded one is never changed"; `cleanup_unit_test.ts`; abandon integration "ownership…" | Holds |
| 12 | Account and media deletion | `delete_video`, `abandon_response`, `discard_draft` → `mux_forget_video`; `delete_account` → `mux_sync_account_playback`; the restore in `get_onboarding_state`; `prepare_account_removal` via `accounts_before_delete` (purge and Admin deletion) | pgTAP `0010`, **`0014` (new, 26)**; cleanup integration "author deletion…", "account deletion and recovery…", "purge…", "Admin API deletion…"; provider rehearsal E1 to E3 | Holds (now also with submissions: none survives an account, none blocks a purge, a deleted account cannot replay) |
| 13 | Retention lifecycle | `mux_asset_hold` and `moderation_case_closed_at` (30 days after a case closes); `prune_moderation_records` (90 days); `prune_mux_cleanup_jobs` (30 days; failed and review never) | pgTAP `0010`, `0011` (G2); cleanup integration "moderation…", "G2…", "ordering…"; scheduler "the sweep and the prunes daily" | Holds. Note: `post_submissions` has no retention of its own; it lives and dies with the account (`0014`), like `responses.caption` of a deleted row |
| 14 | Rollback compatibility | `supabase/rollback/20261013000300…down.sql`, `…20261013000200…down.sql` (five-argument versions kept with no default) | `scripts/idempotency-rollback-check.sh` (run today: passed) | Holds |
| 15 | Older-client compatibility | four named arguments resolve to the five-argument functions (`p_submission` null); `abandon_response` kept; `abandon-submission` answers unchanged in shape and values | pgTAP `0001`–`0011` unchanged; idempotency integration "old clients get the old answers"; rollback check "a build sending p_submission and an older build both post" | Holds |

Also found, tooling only: `scripts/scheduler-integration.sh` hard-coded its fake Mux port, so two
agents' stacks could not run it at once (`5d9fd61`).

## 4. Prerequisites for the rollout

- **The test account T1 already exists.** Nemat created it at CP0 on 13 Oct
  (`b0c14e38-4e89-4dbd-a9a3-8a8c01872a78`, username `test_t1`; `docs/BETA-READINESS.md` section 15),
  with its response V. The 13 Oct row in `docs/DECISIONS.md` says T1 is "not to be created yet":
  CP0 supersedes that wording. The row is not edited here (DECISIONS.md is Nemat's record). No
  provider test creates another account.

- Nemat's review of `be99363`, `4666545` and the earlier unreleased commits (`70f2a3b`, `ddd8e0f`,
  `b7a02ad`, `bc1e765`, `654c03c`), and separate approval of each hosted step below.
- `supabase` CLI 2.119+ logged in to the account that owns `picvoavfxnajfjkqawju`; a clean
  `git archive` of the reviewed commit to push from (as in R0).
- No new secret and no config change: `abandon-submission` uses `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`
  (already set) and the platform's `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
  `MUX_API_BASE` must stay unset on hosted (it only accepts a local http address anyway).
  `config.toml` already has `[functions.abandon-submission] verify_jwt = false` (hosted tokens are
  ES256, which the gateway check does not support; the function checks the caller itself).
- Both clean-up switches non-live (database `off`, `MUX_CLEANUP_MODE` unset). The rollout does not
  touch them.

## 5. Deployment plan (ordered; each step its own approval; STOP between steps)

1. **Hosted preflight (read-only):** schema fingerprint (`scripts/schema-fingerprint.sql`; 759 objects
   at the end of Test B2), line for line against a local stack built from the same 17 migrations;
   last applied migration `20261013000100`; `post_response(uuid, text, text, integer)` exists and
   `post_submissions` does not; functions and secrets as in B2 (`mux-create-upload` bundle
   `bd0a6937…`; no `abandon-submission`); health `ok`; no open job; founder and V hashes.
2. **Dry run of the push:** from the clean archive,
   `supabase db push --linked --dry-run` must list exactly `20261013000200_post_idempotency.sql` and
   `20261013000300_safe_submission_abandon.sql`, in that order, and nothing else.
3. **Migrations:** `supabase db push --linked`. Both in one push (0300 drops the `abandon_submission`
   that 0200 creates; nothing ever calls it). Effects: four-argument posting functions replaced by
   five-argument ones with a default, so the installed build keeps posting; a call during the DDL
   may fail once (Retry recovers it). No data is rewritten; `post_submissions` starts empty.
4. **Read-only verification:** the five-argument signatures, grants (`authenticated` only) and
   `SECURITY DEFINER`; the four-argument versions gone; `begin_submission_abandon` and
   `finish_submission_abandon` executable by `service_role` only; `post_submissions` RLS on with no
   policy; `abandon_submission` absent; PostgREST reloaded (`GET /rest/v1/` lists `post_response`
   with `p_submission`); fingerprint = local stack with 19 migrations.
5. **Function:** `supabase functions deploy abandon-submission --project-ref picvoavfxnajfjkqawju
   --no-verify-jwt` from the reviewed commit. No other function is redeployed (none changed since
   R0). Verify: `functions list` shows it `ACTIVE`, `verify_jwt` false; `POST` without a session
   answers 401; the other bundles unchanged.
6. **Provider tests** in `PROVIDER-TESTS.md`: C1 and C2w may run before step 1 (they need none of
   this); C2a after step 5; E1 to E3 at any point, in their order.
7. **App:** a founder build from the reviewed commit only after step 5 (builds since `b7a02ad` send
   `p_submission` and have no fallback, so without the migration their posts fail visibly), and
   after Nemat's decisions on the failed-post boards P1 to P9 (Discard is not built yet). Device
   checks as in `docs/BETA-READINESS.md` 19.5, step 8.

## 6. Rollback

- **Function only (for example, to undo `be99363`):** redeploy `abandon-submission` from `ddd8e0f`
  (the 14 Oct handler), or delete it (`supabase functions delete abandon-submission`). Without the
  function the app's discards get no answer, so recordings stay on the phone and are asked again:
  nothing is deleted by the rollback.
- **Migrations:** newest first, each as a **new forward migration** whose body is the rollback file
  (never edit or remove an applied migration): `supabase/rollback/20261013000300_safe_submission_abandon.down.sql`,
  then `supabase/rollback/20261013000200_post_idempotency.down.sql`; `supabase db push --dry-run`,
  then the push. Rehearsed by `scripts/idempotency-rollback-check.sh` (passed 16 Oct): the
  tombstones go, rows posted with submissions stay as ordinary rows, the four-argument functions
  return, the five-argument versions stay (no default) so new builds keep posting without replay,
  and `abandon-submission` then answers `kept`/`unverified` and deletes nothing.
- **Going forward again** after a rollback: a migration that first drops the five-argument versions
  (as the rollback check does), then the two migrations' bodies.
- **The app** needs no rollback build; after a database rollback, a lost answer costs a Retry that
  can end as Upload failed (`upload_already_used` keeps the URL and mints nothing).

## 7. Compatibility

- **Existing hosted data:** no row is rewritten. Existing `processing` rows have no submission, so
  `abandon-submission` never touches them; the app never asks it about a post with no submission id
  (`discardPost`: `no_submission`, kept). The founder's and V's rows are untouched by the migrations.
- **Installed build `ede68ed`:** posts with four named arguments (resolved to the new functions with
  `p_submission` null: exactly the old behaviour); discards with `abandon_response` (unchanged);
  never calls `abandon-submission`; never sees `submission_busy` (only that function's hold makes it).
- **Builds from `b7a02ad` on:** need steps 3 and 5 (posting fails visibly without the migration;
  discarding stays unconfirmed without the function, and is retried).
- **The errored change:** answers only values these builds already handle.

## 8. Continuous clean-up: can it be left on? (recommendation only; nothing activated)

**Yes, once the preconditions below hold; not before.** The worker's design is sound for continuous
use (one claimer, one job per asset, ownership checked at Mux and in the database immediately before
acting, retries with backoff, failures never deleted automatically, both switches required). It has
made real Mux changes three times (the canary asset deletion on 12 Oct, Tests A2 and B2), each as one
controlled drain. Leaving it
on changes the risk from "one supervised job" to "any job, unsupervised", so:

Preconditions (in order):
1. C1, C2w, E1 and E2 pass on hosted; C2a passes after the rollout (it does not involve the worker,
   but it is the discard path that will run continuously). E3 is not a precondition: its Mux action
   is the same `delete_asset` the canary verified; its first real purge should be watched instead.
2. The abandon-submission rollout (section 5) is either done or explicitly deferred, so the set of
   job sources is known: author deletion, discarded drafts, a Retry's replaced upload, moderation,
   account deletion, restore and purge, the ready event of an unused upload, and the daily sweep.
3. **A continuous dry run of 3 to 7 days** (database `dry_run`, variable unset): every plan read daily
   from `mux_cleanup_overview().dry_run_planned`; each must correspond to a deliberate deletion,
   removal, account change or abandonment; zero `not_verified`; the 04:45 sweep's dry run lists only
   proven orphans.
4. **Someone owns the health check daily** (`select public.mux_cleanup_health();`), because nothing
   alerts on its own: `mux_cleanup_health()` only reports. A scheduled check that sends its `status`
   somewhere is the missing piece; until then, a named person and a time of day.
5. The Mux asset count is reconciled with the database by hand once (a `muxread assets` against the
   rows with assets), since the health check does not compare them.

   **20 Oct:** `scripts/mux-reconcile.mjs` does preconditions 4 (the check, not yet its schedule or
   delivery) and 5 in one read-only command: Mux `GET`s and one plain select; it classifies every
   asset as the sweep would (in use, held, queued, orphan, ownership unproven), flags rows whose
   asset or playback id Mux lacks, deleted or removed videos still playable at Mux, and the asset
   count against `--cap`; it exits 0/1/2 on the worse of that and `mux_cleanup_health()`. Unit tests:
   `node --test scripts/tests/*.test.mjs`. First hosted run, 20 Oct 10:26 UTC: 5 assets, all in use
   by their own author, exit 1 for the e48 warning only (`BETA-READINESS.md` section 34).
6. Nemat accepts the mechanics in `docs/BETA-READINESS.md` section 15 ("Mechanics to accept or tune":
   backoff to 6 hours, 10 attempts, 120 s leases, batch size) and that Mux's rate limits are not
   verified.

Then: `supabase secrets set MUX_CLEANUP_MODE=live`, `select public.mux_cleanup_set_mode('live',
'<who>')`, left on. Health daily for 7 days, then weekly.

Monitoring (`mux_cleanup_health()`): **stop** (switch `off` first, then unset the variable) on any
`alert`; on `failed`, `review` or any `not_verified` result; `stuck` over 10 minutes; `oldest_due`
over 15 minutes; a cron failure (`schedules`); worker errors, timeouts or uncollected answers
(`worker`); an asset count Mux and the database cannot explain; any job touching the founder's video.
`warn` for `sweep_not_requested` while `off` is expected and not a reason to stop.

Gate 5 note (section 15): before any outside tester, clean-up must be live, or left in dry run with a
recorded decision; until then a deleted or removed video stays playable at Mux by its playback id.

## 9. Tests run (16 Oct, stack `shortcut-a`; Mux stubbed in-process or faked over HTTP)

| What | Command | Result |
|---|---|---|
| pgTAP, before changes | `supabase test db` (stack folder) | 13 files, **1219/1219** |
| pgTAP, after | same | 14 files, **1245/1245** (`0014`: 26) |
| Deno unit | `deno test … mux_test.ts`, `cleanup_unit_test.ts`, `abandon_unit_test.ts` | 21/21, 11/11, **4/4 (new)** |
| uploads integration | `deno test … uploads_integration_test.ts` | 32/32 |
| integration | `… integration_test.ts` | 20/20 |
| cleanup integration | `… cleanup_integration_test.ts` | 28/28 |
| idempotency integration (`DB_CONTAINER` set) | `… idempotency_integration_test.ts` | 12/12, none ignored |
| abandon integration | `… abandon_integration_test.ts` | 12/12 before, **16/16** after |
| rollback check | `scripts/idempotency-rollback-check.sh <stack>` | passed at the baseline and after the changes (both rollbacks, old suite 1089, both builds post, forward again, all 1245). One run in between failed in step 4; **cause found and fixed (follow-up, section 11)** |
| scheduler | `FAKE_MUX_PORT=55711 scripts/scheduler-integration.sh <stack>` | 13/13 |
| C1 rehearsal | `FAKE_MUX_PORT=55712 scripts/c1-rehearsal.sh <stack>` | passed, 29 checks |
| provider rehearsal | `scripts/provider-rehearsal.sh <stack>` (fake Mux on 55713) | **8/8** in 5 min 40 s: C2w (dry run, then one cancel), C2a, C2e (assumed fake behaviour), E1, E2, E3, hosted guards, cleanup |
| Jest | `npx jest` (app) | 246/246 before, **247/247** after |
| Typecheck, lint | `npx tsc --noEmit`, `npx eslint src` | clean |
| Deno type check | `deno check` on the changed function and tests | clean |

Not run: `scripts/auth-integration.mjs` (no auth code changed); anything on a device, simulator,
the hosted project or real Mux.

## 10. Remaining external dependencies and risks

- **Real Mux:** what `errored` looks like (C2e); what a second full PUT does to a URL holding part of
  a file (17.2); cancelling a waiting upload that received part of a file (C2w and C2a show it);
  Mux's rate limits; whether the 10-asset cap is account-wide.
- **Hosted approvals:** each step of section 5 and of `PROVIDER-TESTS.md`.
- **Device:** foreground suspension timing on iOS, the whole discard path end to end, Android never
  run.
- **Design:** the failed-post boards P1 to P9 (Discard) are not built; until then Discard is
  reachable only through Sign out anyway, and an errored upload now holds the member's next
  recording for up to about 70 minutes instead of being cleared at once (the safer of the two).
- **Monitoring:** no alerting path for `mux_cleanup_health()`.
- **Spec:** the online master spec lacks the SPEC.md §19 revision (20.3).

## 11. The rollback check's intermittent failure (follow-up, 16 Oct)

`scripts/idempotency-rollback-check.sh` is the rehearsal of the deployment rollback (section 6), so
its one unexplained failure (section 9) was chased down.

**Reproduced:** 15 back-to-back runs of the unchanged script on `shortcut-a`, each run's output kept:
**4 failed.** Three failed in step 4 (the old suite, after the rollback), one in step 5 (all files,
after going forward again), so the rollback itself was not the cause.

| Failing test | Why |
|---|---|
| `0005_places_suggestions.sql` 36, "the draft waits for Mux" (have NULL, want false), in all 4 | It read `my_suggestions()->'suggestions'->0`. The list is ordered by in-review first, then `updated_at`, and every suggestion in the test is written in one transaction, so all have the same `updated_at`: the first element is a tie, decided by where the rows happen to sit on disk. The rows the rollback check and earlier runs leave behind change that layout, so it flipped between runs. |
| `0003_conversation.sql` 26 and 27, "a reply to a reply carries "Replying to Lena"" (found while checking the fix: 1 of 15 runs) | The same kind of tie: `reply_room(...)->'replies'->1` and `->0`, two replies with the same `created_at`. |

Not the cause: pg_cron or pg_net (no failed cron run; the failing runs, 06:58:23 to 06:59:27 UTC, did not line up with the 10-minute jobs), wall-clock
time (the one wall-clock test, 0003's evening time zone, is computed inside the transaction), or the
script's ordering.

**Fixed in the tests, not in any migration or product behaviour:** both now find the item by its
text or author instead of its position (the ordering rule itself is unchanged). After the fix: 25
consecutive rollback checks passed, then 30 full-suite runs passed.

**The script itself, which had made things worse:** a failure left the stack rolled back and left
its throwaway member and prompts behind (6 such members had accumulated). It now:
- writes everything to a log (`ROLLBACK_CHECK_LOG`, default a new file under `$TMPDIR`) and prints
  its path at the start and end;
- on a failure, prints the failing pgTAP lines (with have/want) and the pg_cron runs since it
  started;
- puts the stack back to the forward state from the step it stopped at (re-applies 0300 only, or
  both migrations), and removes its throwaway member and prompts.

The restore was checked with a deliberately injected failure after the second rollback (stack back
to forward, member removed) and in the real failure of run 14 (the next run passed).

Files touched outside this effort's usual ownership, as the follow-up asked:
`supabase/tests/0003_conversation.sql` and `supabase/tests/0005_places_suggestions.sql` (one
assertion each, by name instead of position).
