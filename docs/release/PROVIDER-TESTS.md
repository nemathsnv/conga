# Real-provider tests C1, C2, E1, E2 and E3 (prepared 16 Oct 2026; none run)

These are the remaining real-Mux tests of the accepted plan (`docs/BETA-READINESS.md` section 15,
"Prioritised matrix"; `docs/DECISIONS.md` 13 Oct). Everything here is **prepared, not run**: no
hosted query, Mux call, deployment, secret or switch change was made to write it. Each numbered
step that changes something needs Nemat's own approval, and a dry run never shares an approval with
a live step (section 15, "Approval checkpoints").

What was run is the local rehearsal of every script below against a fake Mux (section 8). It shows
the scripts and the code agree; it says nothing about what real Mux does.

## 1. Fixed facts and rules

- **Test account T1 already exists** (CP0, 13 Oct, `docs/BETA-READINESS.md` section 15):
  `b0c14e38-4e89-4dbd-a9a3-8a8c01872a78`, username `test_t1`. Do not create another account. (The
  13 Oct decision said T1 was "not to be created yet"; Nemat approved creating it at CP0 the same
  day.)
- **V** = T1's response `52bbaabb-6faa-4bd2-94f9-015e43be791d`: at the end of Test B2, `live` on
  asset a with public playback id P2, upload u `asset_created`.
- **Founder's video:** response `c9918f82…`, ledger `9726bb8f…`, asset `L7KxG29…`. Never a target.
  Every postflight shows it unchanged.
- **Mux budget:** Shortcut Beta 2 assets, spike 7: 9 of the free plan's 10 if the cap is
  account-wide. No step here should create an asset, except possibly the optional C2e.
- **Switches:** database `off`, `MUX_CLEANUP_MODE` unset at the start and end of every step. The
  only way any step changes Mux through the worker is one controlled drain
  (`scripts/provider-drain.sh`), with the database switch up for seconds.
- **Stop at once** (switch `off`, variable unset, nothing more until Nemat decides) on anything in
  section 15's stop list, and on: a script exiting non-zero; a job not in the step's expected list;
  any change at Mux to an object other than the step's own; a third Shortcut Beta asset (except
  in C2e, which says so in advance).
- **Never** run `supabase link`, `db push` or `functions deploy` as part of these tests; the only
  hosted commands are the `supabase db query --linked --project-ref` reads and guarded writes done
  by `scripts/provider-sql.sh`, `supabase secrets set/unset MUX_CLEANUP_MODE` around a live drain,
  and the member's own API calls by `scripts/provider-member.mjs`.

## 2. Tools

All refuse the hosted project unless explicitly enabled, print no upload URL, token or key, and
were rehearsed locally (section 8).

| Script | What it does | Hosted guard |
|---|---|---|
| `scripts/c1-retire.mjs` | Test C1 (unchanged, `docs/BETA-READINESS.md` 18.5) | `C1_HOSTED_REF`, `C1_APPROVED_BY_NEMAT=yes` |
| `scripts/provider-member.mjs` | T1's actions through the app's own endpoints: sign-in code, a video-reply row with a cut transfer, abandon, `delete_account`, the launch call that restores an account | `PT_HOSTED_REF`, `PT_APPROVED_BY_NEMAT=yes` |
| `scripts/provider-sql.sh` | One SQL statement through `supabase db query` (`--linked --project-ref` on hosted, from an empty scratch folder; `--db-url` locally) | `PROVIDER_HOSTED_REF`, `PROVIDER_APPROVED_BY_NEMAT=yes`; a write also needs `PROVIDER_WRITE_STEP=<step>` |
| `scripts/provider-drain.sh` | One controlled drain: waits for seconds 3 to 15 of a minute, then one transaction that requires the switch `off`, sets `dry_run` or `live`, requires exactly the expected jobs to be due, records exactly one worker request; prints the worker's answer; always sets `off` again and checks it | as `provider-sql.sh` |
| `scripts/provider-mux-read.mjs` | Mux `GET`s only (upload, asset, the asset inventory with a hash, HLS and thumbnail status) | none needed: it cannot send anything but `GET` |

Environment, set once per session in a shell that is not logged (values never echoed):

```bash
export PROVIDER_HOSTED_REF=picvoavfxnajfjkqawju PROVIDER_APPROVED_BY_NEMAT=yes   # only after Nemat's go
export PT_SUPABASE_URL=https://picvoavfxnajfjkqawju.supabase.co PT_ANON_KEY=<publishable key>
export PT_HOSTED_REF=picvoavfxnajfjkqawju PT_APPROVED_BY_NEMAT=yes PT_TOKEN_FILE=<scratch>/t1.token
MUXENV=<path to the Shortcut Beta read token env file, e.g. .env.mux-hosted>   # MUX_TOKEN_ID, MUX_TOKEN_SECRET
alias muxread="node --env-file=$MUXENV scripts/provider-mux-read.mjs"
```

T1's session (one Auth email to T1's disposable address; the code is read from that inbox):

```bash
node scripts/provider-member.mjs otp <T1 email>
node scripts/provider-member.mjs verify <T1 email> <6-digit code>   # token saved to PT_TOKEN_FILE (mode 600)
```

A saved token lasts one session. Get a new one (a new code) before each test day, before E1's
deletion (it needs a sign-in from the last 10 minutes), and after E1 (with `20261016000202`, the
deletion ends every session; an old token is refused with `session_revoked`). C1 and C2 do not
delete anything account-wide and keep working on one session, but they must run before E3 (after
the purge T1 is gone).

## 3. The same read-only checks before and after every step

Run with `scripts/provider-sql.sh hosted "<statement>"`. Each is one `select` that calls only
read-only functions.

**S1, state** (compare before and after; only the step's expected rows may differ):

```sql
select jsonb_build_object(
  'mode', public.mux_cleanup_mode(),
  'health', public.mux_cleanup_health() -> 'status',
  'problems', public.mux_cleanup_health() -> 'problems',
  'open_jobs', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'action', action, 'reason', reason, 'status', status, 'not_before', not_before, 'asset', asset_id, 'upload', upload_id, 'result', result) order by created_at), '[]')
                  from public.mux_cleanup_jobs where status in ('pending', 'running', 'failed', 'review')),
  't1', (select jsonb_build_object('deleted_at', deleted_at, 'moderation_status', moderation_status) from public.accounts where id = 'b0c14e38-4e89-4dbd-a9a3-8a8c01872a78'),
  'v', (select jsonb_build_object('status', status, 'asset', mux_asset_id, 'playback', mux_playback_id, 'upload', mux_upload_id) from public.responses where id = '52bbaabb-6faa-4bd2-94f9-015e43be791d'),
  't1_rows', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'status', status, 'upload', mux_upload_id, 'asset', mux_asset_id) order by created_at), '[]') from public.responses where author_id = 'b0c14e38-4e89-4dbd-a9a3-8a8c01872a78'),
  't1_ledger', (select coalesce(jsonb_agg(jsonb_build_object('upload', upload_id, 'status', status, 'created_at', created_at, 'expires_at', expires_at, 'cancelled_at', cancelled_at, 'response', response_id) order by created_at), '[]') from public.video_uploads where account_id = 'b0c14e38-4e89-4dbd-a9a3-8a8c01872a78'),
  't1_minted_1h', (select count(*) from public.video_uploads where account_id = 'b0c14e38-4e89-4dbd-a9a3-8a8c01872a78' and created_at > now() - interval '1 hour'),
  't1_minted_24h', (select count(*) from public.video_uploads where account_id = 'b0c14e38-4e89-4dbd-a9a3-8a8c01872a78' and created_at > now() - interval '24 hours'),
  'founder_live', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'asset', mux_asset_id, 'playback', mux_playback_id)), '[]') from public.responses where status = 'live' and author_id is distinct from 'b0c14e38-4e89-4dbd-a9a3-8a8c01872a78')
) as state
```

After `20261013000200` is deployed, add T1's submissions:
`(select coalesce(jsonb_agg(to_jsonb(s) - 'caption' order by created_at), '[]') from public.post_submissions s where account_id = 'b0c14e38-4e89-4dbd-a9a3-8a8c01872a78')`.

**S2, schema:** `scripts/schema-fingerprint.sql` (as in R0), compared line for line with a local stack
built from the same migrations. At the end of B2: 759 objects (`10acc19f…`), 17 migrations.

**S3, Mux:** `muxread assets` (count and `inventory_md5`; Shortcut Beta must be 2 assets: a and the
founder's), `muxread asset <a>`, `muxread playback <P2>`, and for each upload a step names,
`muxread upload <id>`. Also `supabase functions list` and `supabase secrets list` (names and digests
only): unchanged, and no `MUX_CLEANUP_MODE`.

## 4. Test C1: the stage 2 retirement of an unused URL (no switch; 0 assets)

Unchanged from `docs/BETA-READINESS.md` 18.5. **Confirmed against the final code (16 Oct):**
`mux-create-upload` (`retireAbandonedUpload`) has not changed since `43c97fe` (12 Oct), the version
deployed at R0 (bundle `bd0a6937…`; the platform has moved the version number since, with the same
bundle), and `scripts/c1-rehearsal.sh` passed against it again today (29 checks). C1 needs none of the
unreleased migrations, so it can run before or after them.

1. **Preconditions (S1, S3):** T1 holds no slot (no `reserved`, `active` or `cancelling` row with
   `expires_at` in the future); `t1_minted_1h` ≤ 6, `t1_minted_24h` ≤ 26; switch `off`.
2. **Run (approval C1: 4 upload creates and 1 cancel at Mux):**
   ```bash
   C1_SUPABASE_URL=$PT_SUPABASE_URL C1_ANON_KEY=$PT_ANON_KEY C1_ACCESS_TOKEN="$(cat $PT_TOKEN_FILE)" \
   C1_HOSTED_REF=picvoavfxnajfjkqawju C1_APPROVED_BY_NEMAT=yes node scripts/c1-retire.mjs
   ```
   Expected output: `ok: true`; calls 1 to 3 `200`; call 4 `429 upload_limit_active`; call 5 `200` with
   U4.
3. **After:** ledger U1 `cancelled` with `cancelled_at`, U2 to U4 `active`. `muxread upload` U1:
   `cancelled`, no `asset_id`; U2 to U4 `waiting`, passthrough T1. Asset count 2; V and the founder
   unchanged.
4. **Rollback:** nothing to undo. U2 to U4 time out at Mux after an hour; their slots free themselves.

## 5. Test C2: cancelling an upload abandoned mid-transfer

The original C2 relied on the app's Discard after a force-quit. The current app (after `b7a02ad`)
discards through `abandon-submission`, which cancels at Mux itself and queues no worker job, and its
Discard button is not built yet (P1 to P4 await approval). So C2 is split, and both halves are
driven by `scripts/provider-member.mjs`, which does exactly what the app does (mint, claim the row
before any byte, start the transfer, cut it, discard) without depending on the UI.

### C2w: the worker cancels it (no deployment needed)

What it proves: a `cancel_upload` job, made by `abandon_response` (the discard of every installed
build before the new one), cancels a real waiting upload that received part of a file, and nothing
else.

1. **Preconditions:** S1 with switch `off`, no due job; T1 within its limits; V `live`.
2. **C2w-a (approval: T1 mints one URL, makes one video-reply row, sends 256 KiB of an 8 MiB
   transfer to Mux and cuts it, then abandons the row; 0 assets):**
   ```bash
   node scripts/provider-member.mjs c2 --reply-to 52bbaabb-6faa-4bd2-94f9-015e43be791d \
     --submission no --bytes partial --discard abandon-response
   ```
   (`--submission no`: the hosted database has no `p_submission` until `20261013000200`.) The reply is
   to T1's own V, so the founder gets no activity. Expected: `ok: true`; `put` `cut: true`;
   `abandon_response` `204`. Then S1: the new row (U5) `deleted`; ledger U5 `claimed`; exactly one new
   job, `cancel_upload`, `abandoned`, upload U5, owner T1, no asset, due now. `muxread upload U5`:
   `waiting`, passthrough T1, no `asset_id`. **If Mux already shows `asset_created`, stop**: the worker
   would delete that asset (another test with its own approval).
3. **C2w-b, dry run (approval: `GET`s only), within the hour:**
   `PROVIDER_WRITE_STEP=C2w-b scripts/provider-drain.sh hosted dry_run "Nemat: C2w-b dry run" <job id>`.
   Expected: worker answer `200` with `claimed 1, release 1`; the job `pending` with
   `result.dry_run true` and `would` `{"act": "cancel"}` for U5; switch `off`.
4. **C2w-c, live (approval: one upload cancellation):**
   ```bash
   supabase secrets set MUX_CLEANUP_MODE=live --project-ref picvoavfxnajfjkqawju
   PROVIDER_WRITE_STEP=C2w-c scripts/provider-drain.sh hosted live "Nemat: C2w-c cancellation" <job id>
   supabase secrets unset MUX_CLEANUP_MODE --project-ref picvoavfxnajfjkqawju
   ```
   Expected: `200`, `claimed 1, done 1`; job `done` `{"outcome": "cancelled"}`; `muxread upload U5`
   `cancelled`, no `asset_id`; ledger U5 still `claimed` (the worker never frees slots); 2 assets;
   switch `off`; secrets list as before.
5. **Rollback:** none needed (a cancelled upload holds nothing). If the live step stops halfway,
   the job is `running` with an expired lease; one more controlled drain under its own approval
   finishes it (section 15, "A step that stops halfway").

### C2a: abandon-submission cancels it (needs the deployment in `VIDEO-RELIABILITY.md` section 5)

What it proves, against real Mux: the new discard path cancels a waiting upload with partial bytes
first, retires the row only after Mux confirms, and queues no worker job.

1. **Preconditions:** `20261013000200` and `20261013000300` applied and `abandon-submission`
   deployed (`VIDEO-RELIABILITY.md`, steps 1 to 5); S1 as for C2w.
2. **Run (approval: one upload create, a cut transfer, one cancel by `abandon-submission`; 0 assets):**
   ```bash
   node scripts/provider-member.mjs c2 --reply-to 52bbaabb-6faa-4bd2-94f9-015e43be791d \
     --submission yes --bytes partial --discard abandon-submission
   ```
   Expected answer `{"outcome": "abandoned", "reason": "cancelled"}`. Then: row `deleted`; the
   submission's `abandoned_at` set and `abandoning_until` null; ledger U6 `claimed` with
   `cancelled_at`; **no** new job; `muxread upload U6` `cancelled`, no `asset_id`; 2 assets.
3. **If the answer is `kept`:** `unverified` (Mux unreadable, or the cancel refused or unconfirmed)
   or `at_mux` (Mux had made an asset): stop, record `muxread upload U6`, and ask again later with
   `node scripts/provider-member.mjs abandon <submission id>` under the same approval (the app
   would). `at_mux` means a processing row with an asset: it is not deleted by anything automatic.
4. **Rollback:** none for the expected outcome.

### C2e (optional, not recommended without Nemat's explicit decision): what Mux does with `errored`

The one undocumented case the code now guards (`VIDEO-RELIABILITY.md` section 2). A complete
64 KiB transfer of random bytes (not a video) to a fresh URL, then the discard:

```bash
node scripts/provider-member.mjs c2 --reply-to 52bbaabb-6faa-4bd2-94f9-015e43be791d \
  --submission yes --bytes invalid --discard abandon-submission
```

- **Cost: possibly one errored asset** (Mux may create an asset that fails, which may count against
  the 10). Record `muxread upload` and, if there is an `asset_id`, `muxread asset` immediately and
  after 5 and 30 minutes: that is the evidence.
- Expected by the code: an upload `errored` with no asset is answered `kept`/`unverified` and the
  row stays `processing` until 10 minutes after the URL's expiry; `node scripts/provider-member.mjs
  abandon <submission>` after that retires it. With an `asset_id`: `kept`/`at_mux`.
- **Rollback:** with an asset, T1 deletes the row (`delete_video`, as the profile's Delete does),
  which queues a `cancel_upload`; a controlled dry run, then live drain, finds the asset
  (`found_asset`) and queues its deletion; one more controlled drain deletes it. Each drain is its
  own approval.

## 6. Tests E1, E2, E3: account deletion, recovery and the purge (T1, reusing V)

These need none of the unreleased video migrations (E1 to E3 use `delete_account`, the launch call
`get_onboarding_state`, `purge_deleted_accounts` and the worker, all deployed 12 and 13 Oct).
**Sessions:** with Agent C's `20261016000202_session_lifecycle` deployed, `delete_account` needs a
sign-in (not a token refresh) from the last 10 minutes, ends **every** session of the account at
once, and only a session that **began after the deletion** restores it; a token of an ended session
is refused everywhere with `session_revoked`. Before that migration, any existing session's launch
call restored the account. The steps below are written to work either way: every sign-in is a new
email code, never a reused session. Record in the results which behaviour the hosted project showed.
They must run in this order, each drain before the next account change: **a sign-in while E1's playback
job is still pending joins that job** (one `sync_playback` per video; the worker decides revoke or
restore when it runs; pgTAP `0014`), so E2 would then show no revocation.

### E1: T1 deletes the account (approval: the deletion, then a dry run; then, separately, one playback-id `DELETE`)

1. **Preconditions:** S1: V `live` with P2; T1 not deleted; no due job; health `ok`. S3: asset a
   `ready`, playback ids exactly [P2]; P2 HLS 200.
2. **The deletion.** Preferred: T1 deletes the account in the app (Settings, Delete account; it asks
   for a fresh sign-in). Or sign in with a new code (`otp`, then `verify`) and, within 10 minutes,
   `node scripts/provider-member.mjs delete-account` (expected `204`; `reauth_required` means the
   sign-in is older than 10 minutes: get a new code). Expected (S1): `deleted_at` set; T1's push
   tokens gone; exactly one new job, `sync_playback` / `account_deleted`, asset a, response V, due
   now. V stays `live` in the database but is hidden (account deleted). With `20261016000202`: T1's
   `auth.sessions` rows gone, the app on the phone is signed out, and
   `node scripts/provider-member.mjs sign-in-state` with the token just used answers
   `session_revoked` and restores nothing (check `deleted_at` is still set).
3. **E1 dry run:** `PROVIDER_WRITE_STEP=E1-dry scripts/provider-drain.sh hosted dry_run "Nemat: E1 dry run" <job>`.
   Expected: `200`; plan `direction` `revoke`, `would_revoke` [P2], `owner_verified`.
4. **E1 live (separate approval):** `secrets set MUX_CLEANUP_MODE=live`, then
   `PROVIDER_WRITE_STEP=E1-live scripts/provider-drain.sh hosted live "Nemat: E1 revocation" <job>`, then
   `secrets unset`. Expected: job `done` `{"outcome": "revoked"}`; V's `mux_playback_id` null, asset a
   kept; `muxread asset a`: `ready`, no playback ids; `muxread playback P2`: HLS 404, thumbnail 404.
5. **Rollback:** E2 is the rollback (a new playback id; P2 cannot come back).

### E2: T1 signs back in within 30 days (approval: the sign-in, then a dry run; then, separately, one playback-id `POST`)

1. **The sign-in, with a new email code** (one Auth email to T1). On the phone: sign in again from
   the sign-in screen (the deletion signed the phone out); do not expect the app's old session to
   restore anything. Or `node scripts/provider-member.mjs otp <T1 email>`, then
   `verify <T1 email> <code>` (a new session, saved over the old token), then
   `node scripts/provider-member.mjs sign-in-state`. Expected: `200`; `deleted_at` null; exactly one
   new job, `sync_playback` / `account_restored`, for V. If `sign-in-state` is tried first with the
   token from before the deletion: `session_revoked` (with `20261016000202`) and `deleted_at` still
   set; that is correct, not a failure.
2. **E2 dry run:** plan `direction` `restore`, `would_create` `public`.
3. **E2 live:** as E1 live. Expected: job `done` `{"outcome": "restored"}`; V's `mux_playback_id` =
   P3 (new); `muxread asset a` playback ids exactly [P3], same `created_at`; P3 HLS 200; still 2
   assets; V plays in the app and on `web_video`.
4. **Rollback:** none needed; V is as before E1 with a new id.

### E3: the purge (approval: the asset `DELETE`, irreversible; ends the stage 3 rollback option)

1. T1 deletes the account again (as E1, step 2, after a new sign-in: E2's session is more than 10
   minutes old by then), and nobody signs in as T1 for 30 days (a sign-in would cancel it). The 03:15 UTC
   `purge-deleted-accounts` removes it on day 31. Its playback job from the deletion is drained as in
   E1 (dry run, then live) so V's P3 is revoked during the window.
2. **Expected after the purge (S1):** no T1 account, profile or rows (V is not kept: no other
   member replied to it); T1's two moderation records anonymised; `account_purge_failures` empty;
   exactly one new job, `delete_asset` / `account_purged`, asset a, owner T1, due now (the retention
   job was closed at B1). With `20261013000200` deployed: no `post_submissions` row of T1's left
   (pgTAP `0014`).
3. **E3 dry run**, then **E3 live** (each its own approval): plan `delete` with the ownership
   verified; then job `done` `{"outcome": "deleted"}`; `muxread asset a` 404; P3 HLS 404; Shortcut Beta
   1 asset (the founder's).
4. **Fallback if 30 days is too long:** delete T1's Auth user in the Dashboard (`account_removed`,
   the same trigger, `accounts_before_delete`); the deletion is then due at once. The 03:15 purge
   itself stays unverified on hosted.
5. **Rollback:** none. Once a is deleted, V cannot be restored. Nemat accepts this before E3.

## 7. After every step

S1, S2 (when anything but data changed), S3; health `ok`, mode `off`, `MUX_CLEANUP_MODE` absent;
record request ids, job ids, Mux statuses and the asset count in `docs/BETA-READINESS.md`.

## 8. Local rehearsal (16 Oct; fake Mux, isolated stack `shortcut-a`)

`scripts/provider-rehearsal.sh <stack folder>` runs `supabase/functions/_tests/provider_rehearsal_test.ts`:
the real Edge runtime (`mux-create-upload`, `abandon-submission`, `mux-cleanup`) with fake-only
settings, pg_cron and pg_net calling the worker, and the scripts above as subprocesses with a local
target. Results are recorded in `VIDEO-RELIABILITY.md` section 9.

What the rehearsal cannot show: real Mux's answers (in particular what happens to a cut transfer,
and `errored`); the hosted `supabase db query --linked` output format (the same command's local
`--db-url` form was used); the app's own Delete account and sign-in screens.
