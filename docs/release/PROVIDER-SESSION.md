# Provider session: C2w (fresh), C2a; E1 to E3 on a disposable account (plan 17 Oct, revised 20 Oct 2026; not run)

This is a plan. Nothing in it has been run against the hosted project or real Mux. It is built on
Nemat's decision 3 (16 Oct): C2 stays deferred until one uninterrupted verification window, U5 is
not recreated, and the production clean-up switch is not toggled over and over. The procedures and
checks themselves are in `PROVIDER-TESTS.md`; this document orders them into one sitting, says who
types what, and keeps the switch windows as few and as short as possible.

Where things stand (`docs/BETA-READINESS.md` sections 21 to 28):

- Batch A (`20261013000200`, `20261013000300`) and `abandon-submission` were deployed (H2, H3), and
  so was batch B (`20261016000200` to `204`, H4). So posting is idempotent, Discard asks Mux first,
  deleting an account ends every session, and only a new sign-in restores it.
- C1 passed.
- C2w-a and C2w-b passed, but U5 timed out at Mux before the live step. Job `e48cdb45…`
  (`cancel_upload`, `abandoned`, upload U5, owner T1) is still `pending` and due.
- Both switches are off (database `off`, no `MUX_CLEANUP_MODE`). Mux: 2 Shortcut Beta assets (a,
  which is V's, and the founder's `L7KxG29…`), plus 7 spike assets on record.
- T1 (`b0c14e38-4e89-4dbd-a9a3-8a8c01872a78`) is active. V (`52bbaabb-6faa-4bd2-94f9-015e43be791d`)
  is `live` on P2.

## 0. Baseline refresh, 20 Oct 10:22 UTC (read-only; supersedes the numbers above and in section 5)

Read with `scripts/mux-reconcile.mjs hosted --cap 10` and one plain select; no write, no Mux change.

- **Mux (Shortcut Beta): 5 assets, not 2.** `inventory_md5` `2fee72342da7f36906d5522d2459e407`
  (same hash as `provider-mux-read.mjs assets`). Every asset is used by its own `live` row and its
  passthrough is that row's author; no orphan, nothing missing at Mux, no deleted video still
  playable. Founder `L7KxG29…` unchanged.
- **T1 now owns 4 live videos, not 1:** V (asset `01IyQdSi…`), and three made from the founder
  iPhone build after the multiple-responses work: reply `cef19888…` (19 Oct 05:05, asset
  `H923MkjG…`), responses `bcf65f4d…` (20 Oct 07:56, `ZL8jBUce…`) and `1eb1ce41…` (20 Oct 07:58,
  `023QkUtH…`). So the phone has been signed in as T1.
- Hosted: 27 migrations (last `20261019000200`); clean-up `off`, no `MUX_CLEANUP_MODE` assumed (not
  re-read: `secrets list` is Nemat's); health `warn`, only `waiting_while_not_live` (e48); open
  jobs: exactly e48, `pending`, `result.dry_run` from C2w-b; all six clean-up schedules active, 0
  failures in 24 h. T1 holds no unexpired URL. `post_submissions` 3, none abandoned.

**Plan as revised by Nemat, 20 Oct (`docs/DECISIONS.md`; supersedes the timeline in section 5 for E1 to E3):**

- **E1, E2 and E3 never run against T1.** T1's four videos, their playback ids and the iPhone's T1
  sign-in are kept. Section 5's E rows are retired; E1 to E3 move to a disposable account, below.
- **Closed, not repeated:** A1, A2, B1, B2, C1.
- **Nobody uses the phone as T1 during C2w or C2a.** Opening Post Review mints a URL for T1, which
  changes T1's ledger in the middle of a test and could retire a test URL by the C1 rule. A test
  sign-in (`provider-member.mjs otp`/`verify`) starts a new session and does not end the phone's.
- **U5 is not recreated.** Job e48 is listed with C2w's own job in C2w's dry run and live drain.
  There it closes as `done`/`timed_out` with one Mux `GET` and no other Mux call (Mux reports U5
  `timed_out`, no asset). No separate window is opened for it.
- **No continuous clean-up and no scheduled reconciliation** until the Mux quota scope is confirmed.

**Operation C2w (its own approval; 0 assets; one window W1 of about 5 minutes):**

1. T1 code 1: `provider-member.mjs otp`, then Nemat runs `provider-t1-verify.sh`. That is one Auth
   email to T1's inbox.
2. **C2w-a′:** one mint (U6), one video-reply row R6 to V, a cut PUT (256 KiB of 8 MiB), then
   `abandon_response`. Expected: one job J6.
3. **C2w-b′ dry run**, listing e48 and J6: Mux `GET`s only.
4. Nemat opens W1 (`secrets set MUX_CLEANUP_MODE=live`).
5. **C2w-c live drain**, listing e48 and J6. Expected: one Mux cancel, of U6; J6 `cancelled`; e48
   `timed_out`.
6. Nemat closes W1 (`secrets unset`).
7. Postflight: `mux-reconcile.mjs` reports 5 assets and `2fee7234…`, and the health check is `ok`,
   because e48 is closed.

Stop rules 1 to 5 and 9 apply. If C2w-c cannot start by U6's mint + 45 minutes, it is not run
(stop rule 3).

**Operation C2a (its own approval, any later day; 0 assets; no window, no worker):** a new T1 code
if the session has expired, then
`provider-member.mjs c2 --reply-to <V> --submission yes --bytes partial --discard abandon-submission`.
Expected: `{"outcome": "abandoned", "reason": "cancelled"}`, U7 `cancelled` at Mux, no job, 5 assets.

**E1 to E3 on a disposable account T2 (revised 21 Oct; tooling rehearsed locally; nothing approved
on hosted).** The quota scope is settled for this purpose (`BETA-READINESS.md` section 38): Beta 5,
spike 7, one disposable asset fits.

*Tooling* (`PROVIDER-TESTS.md` section 2, rehearsed in `provider_t2_rehearsal_test.ts`):

- `provider-member.mjs` acts only as the account in `PT_EXPECT_USER` (T2's id, from
  `~/.conga-provider/t2.id`). Every acting command refuses T1 and the founder unconditionally: both ids
  are built in and no setting removes them.
- T2 is made with `otp --create` (refused if the address already has an account) and
  `verify --new`. The latter refuses, and removes the token, unless the account is brand new, has one
  email identity, matches the address and is not onboarded.
- `onboard` does what the app's sign-up does, and `respond` makes the one video as the app posts it.
- `provider-check.mjs` gives S1 for T2 (`state`) and the protected baseline (`save`/`compare`): T1, the
  founder, and every Mux asset in Beta and the spike that is not T2's.
- T2's files are separate (`provider-env.sh`, `PT_MEMBER=t2`; T1's are refused).

*Three rules (Nemat, 21 Oct):*

1. **T1's iPhone is not frozen.** Normal use of the app as T1 is fine between operations. It is
   restricted only while an operation runs: from its fresh baseline to its postflight, and for all of
   W1. Each operation starts with `provider-check save` (a fresh baseline that absorbs any normal use
   since the last one) and ends with `provider-check compare`; inside the operation nothing protected
   may change. A difference is a stop until it is explained.
2. **The 31-day purge and a manual Auth-user deletion are different outcomes,** recorded separately.
   - **E3(i)**, the real 03:15 `purge_deleted_accounts()` on day 31: the only outcome that verifies the
     automatic purge (`delete_asset` / `account_purged`).
   - **E3(ii)**, Nemat deleting T2's Auth user in the Dashboard: the same day, a different trigger path
     (`account_removed`). It verifies that path and the asset deletion, and **not** the purge.
   - Choosing (ii) leaves the automatic purge unverified on hosted, and the record says so.
3. **An uncertain upload is inspected at the provider before anything is retried.** `respond --resume`
   asks `mux-upload-status` (the server reads Mux) first, and acts only on a definite answer:
   - asset made: wait for live and send nothing;
   - still waiting: the same file to the same URL (one upload makes at most one asset);
   - cancelled or timed out with no asset: stop, unless Nemat approves `--new-upload`;
   - errored, unknown or no answer: stop.

   Cancellation is never assumed, and no new URL is minted while Mux has not proven the old one empty.

**Blocker for E3, found by the rehearsal (21 Oct; fixed and deployed 21 Oct 07:06 UTC):** an account that
redeemed an invite cannot be removed. Nemat decided (21 Oct) that the invite keeps its history, loses
the link to the person and stays used: `20261021000100_invite_member_deletion.sql`, rehearsed locally
(`docs/release/INVITE-DELETION-FIX-21OCT.md`). Deployed and verified on hosted
(`docs/BETA-READINESS.md` section 40); E3(i) and E3(ii) are no longer blocked by it.

- **Cause:** `invites.redeemed_by` is `on delete set null`, but `redeemed_at` stays set, so
  `invites_redeemed_pair` refuses the row and the whole deletion rolls back.
- **The purge:** the 03:15 purge records an `account_purge_failures` row for such an account every day
  and never queues its `delete_asset`.
- **A manual deletion:** the Dashboard's "Delete user" fails (500).
- **Who it affects:** every closed-beta member redeemed an invite, T1 and T2 included. On hosted today
  no account is deleted, so nothing has failed yet.
- **Consequence for this plan:** CP0′-a, CP0′-b, E1, E2 and E3a are unaffected. E3(i) and E3(ii) both
  fail until a migration fixes it.
- **Also:** once T2 redeems its invite, T2 cannot be removed by any route until then.

**Operations, each its own approval. Each starts with a fresh baseline and the read-only checks, and
ends with the postflight.**

- **CP0′-a: invite and account (hosted DB and Auth; one email; no Mux call).**
  - Before: Nemat writes T2's address (a `+` alias of an inbox he controls) to `~/.conga-provider/t2.email`, mode 600.
  - The lead, in a shell that has run `source scripts/provider-env.sh`:
    1. **Preflight (read-only):**
       - `node scripts/provider-check.mjs save hosted ~/.conga-provider/baseline-cp0a.json --mux "$MUXENV" --mux <spike env>`;
       - one select for 2 accounts, 2 invites, none unused;
       - switch `off`, 0 open jobs.
    2. **Write 1, one invite:** `PROVIDER_WRITE_STEP=CP0a-invite scripts/provider-t2-invite.sh hosted 2 "$PT_INVITE_FILE"`.
       - One guarded transaction: it requires exactly 2 invites and no unused one, then makes one team
         invite (`team_create_invite(null, 'canggu', null, null)`).
       - The code goes to `~/.conga-provider/t2.invite` (600) and is not printed.
    3. **Write 2, the account and one email:** `node scripts/provider-member.mjs otp "$(cat "$PT_EMAIL_FILE")" --create`.
       - First the app's address check (`auth-signin-method`); refused if the address has an account.
       - Then `/auth/v1/otp` with `create_user: true`: one Auth user, unconfirmed, and one email.
    4. **Nemat:** `scripts/provider-member-verify.sh --new` confirms the address and starts T2's first session.
       - `get_onboarding_state` creates T2's `accounts` row.
       - T2's id is written to `~/.conga-provider/t2.id`.
       - Any mismatch removes the token and writes nothing.
    5. **Write 3, onboarding:** `node scripts/provider-member.mjs onboard --invite-file "$PT_INVITE_FILE" --name "test two" --username test_t2`, which runs:
       - `confirm_age`;
       - `redeem_invite` (T2 follows Canggu, as redemption does);
       - `create_profile`;
       - `acknowledge_disclosure`.
    6. **Postflight:**
       - `provider-check compare` unchanged;
       - `provider-check state hosted --t2 <id>`: onboarded, 0 rows, 0 ledger rows, 0 jobs;
       - 3 accounts, 3 invites (T2's redeemed);
       - Mux unchanged: Beta 5 `2fee7234…`, spike 7 `315652b2…`.
  - **Rollback:** none needed, since T2 holds nothing. Because of the blocker, T2 cannot be removed until the fix.
- **CP0′-b: V2 (one new Beta asset).**
  - `respond --prompt ddd5a383-be11-475f-9576-0a6db79cabe3 --file ~/.conga-provider/t2-clip.mp4`.
    The clip is 6.000 s, no person, sha256 `11d12a97…`.
  - Expected: one mint, one row, one complete PUT, `live`. Beta 6 (spike 7 unchanged); T1 and the founder unchanged.
  - Any uncertain state: rule 3.
- **E1, E2, E3a:** as in section 5's E rows, with T2 for T1 and V2 for V, using
  `provider-member-verify.sh` for each code. W1 opens before E1 live and closes after E3a live. Rule 1
  applies throughout W1.
- **E3b:** the invite fix is deployed (21 Oct). Then (i) or (ii), as in rule 2.

Each drain is listed by job id. pgTAP `0030` section 9 has already shown, locally, the per-video
job counts for an account with several responses on one prompt.

## 1. Constraints the timeline respects

| Constraint | Consequence in this plan |
|---|---|
| A T1 session lasts 60 minutes from the code (`jwt_expiry` 3600; the scripts do not refresh) | Code 1 covers C2w and C2a (about 12 minutes). E1, E2 and E3 each start with their own code. |
| `delete_account` needs a sign-in (the token's `amr` time) from the last 10 minutes | Codes 2 and 4 are entered immediately before E1's and E3's deletions. Code 3 can serve E3 if E3's deletion starts within 10 minutes of it. |
| Since H4, a deletion ends every session, and only a session that began after it restores the account | E2 starts with a new code, never the old token. The old token is checked to be refused (`session_revoked`). |
| An upload URL expires 60 minutes after its mint (`timeout` 3600; ledger `expires_at`) | C2w-c runs within minutes of C2w-a. If it cannot start by **mint + 45 minutes**, it is not run (stop rule 3). |
| A dry-run release holds a job for an hour, but `mux_cleanup_set_mode('live')` makes dry-run-planned jobs due at once | Each live drain lists the same jobs as its dry run. If a live step is skipped, its jobs are due again in the next live drain (or an hour later) and must be listed there. `provider-drain.sh` refuses any other due set, so a forgotten job stops the step; it is never acted on silently. |
| Auth sends at most one email per address every 60 seconds; the project has custom SMTP (Resend), about 30 emails an hour | Four codes, at least 60 seconds apart. |
| E3 is irreversible once the purge runs (day 31); the second deletion itself can be undone by signing in within 30 days | E3 is split into E3a (the deletion and its playback revocation, in this session) and E3b (the purge and the asset deletion, on day 31). Nemat decides E3a separately, knowing no one may sign in as T1 for 30 days afterwards. |

## 2. Roles

- **Nemat:**
  - every approval (section 6);
  - both function-secret toggles (`supabase secrets set/unset MUX_CLEANUP_MODE`; the lead's shell may not write the secret store);
  - each sign-in code: he reads T1's inbox, and enters the code with `scripts/provider-t1-verify.sh`, which reads it without echo.
- **The lead:** everything else. That covers:
  - sending each code (`provider-member.mjs otp`);
  - the member's actions;
  - the drains (`provider-drain.sh`);
  - the read-only checks (S1 to S3);
  - the records.

Both work in a shell that has run `source scripts/provider-env.sh` (it prints no value). Before
code 1, the lead writes T1's address from `auth.users` into `~/.conga-provider/t1.email`
(read-only query, mode 600, never printed), as for C1.

## 3. The two switches in this session

- **The function secret `MUX_CLEANUP_MODE` goes live once in this session.** That is window W1: it
  opens just before C2w-c and closes after E3a-live, for about 30 to 35 minutes. It goes live once
  more on day 31 for E3b (W2, a few minutes). **Total: 2 windows, 2 sets and 2 unsets**, against 8
  for one window per live step. Each set or unset moves every function up one version without
  changing a bundle, as on 13 and 16 Oct.
  - If Nemat chooses the same-day fallback for E3b (deleting T1's Auth user in the Dashboard;
    `PROVIDER-TESTS.md` section 6), E3b runs inside W1 and the total is **1 window**.
- **Why W1 is safe to hold open:** the effective mode is the lower of the two switches.
  - The database switch stays `off` except inside each guarded drain's own transaction, so the
    scheduled worker (every minute) does nothing while W1 is open.
  - A dry run inside W1 is still only a dry run (database `dry_run` with function `live` gives
    `dry_run`).
- **The database switch is raised 8 times in the session, for seconds each:**
  - dry runs C2w-b′, E1, E2, E3a;
  - live drains C2w-c, E1, E2, E3a.

  Each raise happens inside one `provider-drain.sh` transaction, which always sets it back to `off`
  and checks that. Optional reduction to 7: skip C2w-b′, since C2w-b proved the same plan on real
  Mux on 16 Oct. Not recommended: the dry run is what shows the fresh job's plan before it is acted
  on.

## 4. The pending job `e48cdb45…`

It is **listed alongside the new job** in C2w-b′ and C2w-c, rather than drained on its own first.
Draining it alone would need its own live window, against decision 3.

- **In the dry run:**
  - the worker `GET`s U5 and finds it `timed_out` (passthrough T1);
  - the job is released with `would {"outcome": "timed_out"}`.
- **In the live drain:**
  - the job is `done` with `{"outcome": "timed_out"}`;
  - the only Mux call for it is that `GET`, because a timed-out upload holds nothing.

Its full id comes from the first S1 (`open_jobs`). It is the only open job at the start.

## 5. Timeline and commands

t = minutes from code 1 being accepted. Times are targets, not deadlines, except the ones marked as
stop rules. After every row that changes something, the lead runs **S1 and S3**
(`PROVIDER-TESTS.md` section 3) and records them as in section 7 of that file. The table lists only
what must differ from the previous check.

| t | Who | Step (approval) | Command | Expected |
|---|---|---|---|---|
| −20 | lead | **P0** preflight, read-only | S1, S2 (fingerprint against the local 24-migration stack, 847 objects), S3, `supabase functions list`, `supabase secrets list` | Clean-up `off`. Health `warn` only for `waiting_while_not_live` (e48 has waited over 24 h); anything else stops the session. Open jobs: exactly e48, `pending`, due. T1 active. V `live` on P2. Founder hashes unchanged. Mux: 2 assets, inventory `ccb8b093…`; U5 `timed_out`, no `asset_id`. No `MUX_CLEANUP_MODE`. |
| −5 | lead | send code 1 (A0) | `node scripts/provider-member.mjs otp "$(cat ~/.conga-provider/t1.email)"` | `http 200` |
| 0 | Nemat | enter code 1 | `scripts/provider-t1-verify.sh` | "token saved … (-rw-------)" |
| +1 | lead | **C2w-a′** (A1) | `node scripts/provider-member.mjs c2 --reply-to 52bbaabb-6faa-4bd2-94f9-015e43be791d --submission no --bytes partial --discard abandon-response` | `ok: true`; mint `200` (U6). No retirement, since T1 holds no unexpired unclaimed URL. `post_reply` `200` (row R6). PUT `cut: true`, 262,144 of 8,388,608 bytes. `abandon_response` `204`. S1: R6 `deleted`; ledger U6 `claimed`; one new job J6 (`cancel_upload`, `abandoned`, U6, owner T1, due). S3: U6 `waiting`, passthrough T1, no `asset_id`. **Note the mint time: C2w-c deadline = mint + 45 min.** |
| +3 | lead | **C2w-b′** dry run (A2) | `PROVIDER_WRITE_STEP=C2w-b2 scripts/provider-drain.sh hosted dry_run "Nemat: C2w-b2 dry run" <e48 id>,<J6 id>` | `200`, `mode dry_run`, `claimed 2, release 2`. J6 `would {act cancel, upload_status waiting, owner_verified true}`. e48 `would {outcome timed_out}`. Mux: `GET`s only. Switch after: `off`. |
| +6 | Nemat | **open W1** (A3 covers W1 and C2w-c) | `supabase secrets set MUX_CLEANUP_MODE=live --project-ref picvoavfxnajfjkqawju` | Secrets list shows `MUX_CLEANUP_MODE` (digest of `live`); functions up one version, bundles unchanged |
| +7 | lead | **C2w-c** live | `PROVIDER_WRITE_STEP=C2w-c scripts/provider-drain.sh hosted live "Nemat: C2w-c cancellation" <e48 id>,<J6 id>` | `200`, `claimed 2, done 2`. J6 `done {"outcome": "cancelled"}`. e48 `done {"outcome": "timed_out"}`. Mux: one `PUT /uploads/U6/cancel`; U6 `cancelled`, no `asset_id`; 2 assets; ledger U6 still `claimed`. Switch `off`. No open job. |
| +10 | lead | **C2a** (A4) | `node scripts/provider-member.mjs c2 --reply-to 52bbaabb-6faa-4bd2-94f9-015e43be791d --submission yes --bytes partial --discard abandon-submission` | `ok: true`; U7 minted; row R7; PUT cut; answer `{"outcome": "abandoned", "reason": "cancelled"}`. S1: R7 `deleted`; R7's submission `abandoned_at` set, `abandoning_until` null; ledger U7 `claimed` with `cancelled_at`; **no new job**. S3: U7 `cancelled`, no `asset_id`; 2 assets. Not a worker step; W1 does not matter to it. |
| +13 | lead | send code 2 (≥ 60 s after code 1) | `otp` as above | `200` |
| +15 | Nemat | enter code 2 | `scripts/provider-t1-verify.sh` | token saved. **Deletion deadline: +25.** |
| +16 | lead | **E1 deletion** (A5) | `node scripts/provider-member.mjs delete-account` | `204`. S1: `deleted_at` set; one new job J_E1 (`sync_playback`, `account_deleted`, asset a, V, due). `auth.sessions` for T1: 0 (count only). Then `node scripts/provider-member.mjs sign-in-state` with the same token: `session_revoked`, and `deleted_at` still set. |
| +18 | lead | **E1 dry run** (A6) | `PROVIDER_WRITE_STEP=E1-dry scripts/provider-drain.sh hosted dry_run "Nemat: E1 dry run" <J_E1>` | `200`, `claimed 1, release 1`; `would {act sync, direction revoke, would_revoke [P2…], owner_verified true}` |
| +20 | lead | **E1 live** (A7) | `PROVIDER_WRITE_STEP=E1-live scripts/provider-drain.sh hosted live "Nemat: E1 revocation" <J_E1>` | J_E1 `done {"outcome": "revoked"}`. V `mux_playback_id` null, asset a kept. Mux: asset a `ready`, no playback ids; `muxread playback P2`: HLS 404, thumbnail 404; 2 assets. |
| +22 | lead | send code 3 | `otp` | `200` |
| +24 | Nemat | enter code 3 | `scripts/provider-t1-verify.sh` | token saved (replaces code 2's) |
| +25 | lead | **E2 restore** (A8) | `node scripts/provider-member.mjs sign-in-state` | `200`; `deleted_at` null; one new job J_E2 (`sync_playback`, `account_restored`, V, due) |
| +27 | lead | **E2 dry run** (A9) | `PROVIDER_WRITE_STEP=E2-dry scripts/provider-drain.sh hosted dry_run "Nemat: E2 dry run" <J_E2>` | `would {act sync, direction restore, would_create public}` |
| +29 | lead | **E2 live** (A10) | `PROVIDER_WRITE_STEP=E2-live scripts/provider-drain.sh hosted live "Nemat: E2 restoration" <J_E2>` | J_E2 `done {"outcome": "restored"}`. V `mux_playback_id` = P3 (new). Mux: asset a with exactly [P3], same `created_at`; P3 HLS 200; 2 assets. `select public.web_video('<V>')` answers `live` (the page itself cannot be checked on the default domain, H5b). |
| +31 | Nemat | **E3 decision** (A11) | — | Go: the second deletion, no sign-in as T1 for 30 days, then the purge deletes asset a for good. No-go: Nemat closes W1 now (`unset`), and the session ends after E2. |
| +32 | lead | **E3a deletion** | if before +34 (10 min after code 3): `delete-account` with the current token; otherwise send code 4, Nemat enters it, then `delete-account` | `204` (`reauth_required` means a new code is needed; it is not retried blindly). One new job J_E3a (`sync_playback`, `account_deleted`, V). The old token gives `session_revoked`. |
| +34 | lead | **E3a dry run** (A12) | `PROVIDER_WRITE_STEP=E3a-dry scripts/provider-drain.sh hosted dry_run "Nemat: E3a dry run" <J_E3a>` | `direction revoke, would_revoke [P3…]` |
| +36 | lead | **E3a live** (A13) | `PROVIDER_WRITE_STEP=E3a-live scripts/provider-drain.sh hosted live "Nemat: E3a revocation" <J_E3a>` | `revoked`; P3 HLS 404; asset a kept; 2 assets |
| +38 | Nemat | **close W1** | `supabase secrets unset MUX_CLEANUP_MODE --project-ref picvoavfxnajfjkqawju` | No `MUX_CLEANUP_MODE`; functions up one version |
| +40 | lead | postflight | S1, S2, S3, functions and secrets lists; the token file deleted (`rm ~/.conga-provider/t1.token`); the address file kept only if E3b needs it (it does not) | Clean-up `off`. Health `ok` (e48 is done). No open job. T1 deleted, waiting for the purge. V hidden, no playback id, asset a kept. 2 assets. Founder unchanged. |
| day 31 | lead | **E3b check**, read-only | after 03:15 UTC on the first day more than 30 days after E3a (for a deletion on 17 Oct: 17 Nov 03:15 UTC), S1 | T1's account, profile and rows gone. `account_purge_failures` empty. One job J_E3b (`delete_asset`, `account_purged`, asset a, owner T1, due). No `post_submissions` row for T1. |
| day 31 | lead | **E3b dry run** (A14) | `PROVIDER_WRITE_STEP=E3b-dry scripts/provider-drain.sh hosted dry_run "Nemat: E3b dry run" <J_E3b>` | `would {act delete, asset_id a, owner_verified true}` |
| day 31 | Nemat, then lead, then Nemat | **E3b live** (A15): W2 open, drain, W2 close | `secrets set …=live`; `PROVIDER_WRITE_STEP=E3b-live scripts/provider-drain.sh hosted live "Nemat: E3b deletion" <J_E3b>`; `secrets unset …` | J_E3b `done {"outcome": "deleted"}`; `muxread asset a` 404; **1 Shortcut Beta asset** (the founder's) |

Notes on the table:
- **C2w-a′ uses `--submission no`** to exercise the legacy discard path (`abandon_response`, then a
  worker `cancel_upload`) that installed builds before `b7a02ad` use. It is no longer a database
  limitation: since H2 the database accepts `p_submission`.
- **Session length:** the whole sitting is about 60 minutes of attention, of which W1 is about 32.
  If a code is slow and W1 is open, see stop rule 6.

## 6. Approval points

Each needs Nemat's go in chat, and none carries over to the next. A dry run never shares an approval
with its live step.

| # | Approval |
|---|---|
| A0 | Starting the session: P0 passed; the first code sent |
| A1 | C2w-a′: one mint, one row, a cut transfer, one `abandon_response` |
| A2 | C2w-b′ dry run (`GET`s only) |
| A3 | Opening W1 and C2w-c: one cancel at Mux, plus the timed-out job closing with no Mux change |
| A4 | C2a: one mint, one row, a cut transfer, one cancel by `abandon-submission` |
| A5 | E1's deletion of T1 |
| A6 | E1 dry run |
| A7 | E1 live: revoke P2 |
| A8 | E2's sign-in and restore |
| A9 | E2 dry run |
| A10 | E2 live: create P3 |
| A11 | E3: the second deletion, the 30-day wait and the final purge. This is the irreversible decision. |
| A12 | E3a dry run |
| A13 | E3a live: revoke P3. W1 closes after it. |
| A14 | E3b dry run (day 31) |
| A15 | E3b live: W2 and the deletion of asset a. Cannot be undone. |

## 7. Mux asset budget

- **On record:** 2 Shortcut Beta assets and 7 spike assets, so 9 of the free plan's 10 if the cap
  is account-wide. **No step creates an asset.** E3b deletes one, leaving 1 Beta asset.
- **Worst case per step:**
  - **C2w-a′ and C2a:** the transfer is cut after 256 KiB of a declared 8 MiB, so Mux cannot finish
    it. If it somehow completed, the random bytes would leave an errored upload, possibly with one
    errored asset. That is 1 per step at worst, theoretically. Stop rule 4 catches it, because the
    worker would then plan `found_asset`, and C2a would answer `at_mux`.
  - **C2w-b′, C2w-c, all dry runs:** 0 (`GET`s, and one cancel).
  - **E1, E2, E3a:** 0. They change playback ids, not assets. E2 creates a playback id, not an
    asset.
  - **E3b:** −1.
- Optional C2e (`PROVIDER-TESTS.md`) is **not** in this session.

## 8. Stop rules

On any of these: the drain has already set the database switch `off`. Nemat unsets
`MUX_CLEANUP_MODE` if W1 is open. Nothing more runs until Nemat decides. The lead records the state
with S1 and S3.

1. Any script exits non-zero: the guarded transaction refused, the worker did not answer `200`, or
   the switch was not `off` afterwards.
2. Any job outside the step's expected list, or any `failed`, `not_verified` or `review` result.
3. **C2w-c cannot start by U6's mint + 45 minutes.** Do not run it. U6 will time out like U5; record
   that, and do not mint another URL in this session (decision 3). With W1 still closed, skip to C2a
   and E1 only on Nemat's word. J6 and e48 then stay pending and must be listed in the next live
   drain (`set_mode('live')` makes the dry-run-planned J6 due).
4. Mux shows an `asset_id` or `asset_created` for U6 or U7, or the inventory changes in any way other
   than expected (count other than 2, or the md5 changes outside E3b).
5. Anything touches the founder's response, ledger row or asset, or any object at Mux other than
   the step's own.
6. **A code does not arrive within 10 minutes.** Pause. If W1 is open and the pause passes 15
   minutes, Nemat closes W1. Reopening it later counts as one more window, and he is told so.
7. `delete_account` answers `reauth_required`: get a new code. Never retry with the same token.
8. **After E1 or E3a, the old token is not refused** (`sign-in-state` restores the account instead
   of answering `session_revoked`). Stop: the deployed session gate is not doing what H4 verified.
9. The lead's shell or connection is lost with W1 open. Nemat closes W1 first. The lead's first
   action afterwards is S1.
10. Health shows `alert`, or any cron failure (`schedules`), at any check.

## 9. After the session

- **Record:** request ids, job ids, Mux statuses, the inventory md5 and the times, in
  `docs/BETA-READINESS.md`, as for C1 and C2w.
- **If E3a ran:** nobody signs in as T1 until E3b. One sign-in cancels the purge and keeps asset a
  (that is the rollback, until day 30).
- **Still open after a full pass:**
  - E3b (day 31);
  - C2e (not planned);
  - the questions only real Mux can answer (`VIDEO-RELIABILITY.md` section 10);
  - the continuous clean-up decision (`VIDEO-RELIABILITY.md` section 8). C1, C2w, C2a, E1 and E2
    passing meets its first precondition.
