# H1: read-only hosted preflight (16 Oct 2026)

Step H1 of `RELEASE-CHECKLIST.md` Part 1B. **One command does all of it:** from a folder linked to
the project (`supabase link --project-ref picvoavfxnajfjkqawju`, which writes only local files),
run `scripts/h1-preflight.sh`; it runs blocks 1 to 8 as single read-only SELECTs through
`supabase db query --linked`, compares each with the expected value below, prints PASS/FAIL per
block and writes `docs/release/h1-results-<timestamp>.txt` with no key, token, email or name in
it (tested on a local 17-migration stack on 16 Oct; reviewed independently the same day). The
script sends plain SELECTs with no transaction wrapper (the CLI runs one statement per call), so
its safety rests on every statement being a SELECT of catalogs, counts and hashes, which the review
confirmed; the blocks below are the same checks for the SQL editor, wrapped in a read-only
transaction, if you prefer to run them by hand. Block 8 (functions, secret names, migration list)
is printed, not compared: read it. Everything here only reads. Nothing is deployed or changed by it. Run the SQL blocks in the Supabase SQL
editor of project `picvoavfxnajfjkqawju` (it runs as `postgres`), each block as written: they
open a `read only` transaction and roll it back. Paste each result back; the "expected" lines
say what passes. **Stop at the first block that does not match** and report it; the H-sequence
does not start until H1 is clean.

The expected values come from the last recorded hosted state (end of Test B2, 13 Oct, in
`docs/BETA-READINESS.md` section 15) and from a local stack built from the same 17 migrations
on 16 Oct.

## 1. Migrations

```sql
begin read only;
select count(*) as applied, max(version) as latest
  from supabase_migrations.schema_migrations;
select version from supabase_migrations.schema_migrations order by version;
rollback;
```

Expected: `applied` 17, `latest` `20261013000100`; the list runs from `20261006000100` to
`20261013000100` with nothing after it. If `20261013000200` or later already shows, stop: the
sequence assumes they are pending.

## 2. Schema fingerprint

Run `scripts/schema-fingerprint.sql` wrapped like this (copy the script's `with objects(...)`
body in place of the comment; it is the file in the repository at `d708cc7` or later, unchanged
since 12 Oct):

```sql
begin read only;
with objects(kind, name, def) as (
  -- paste the body of scripts/schema-fingerprint.sql here, from "select 'function'" to the
  -- line before its final "select kind, name, md5(...)"
)
select count(*) as objects,
       md5(string_agg(kind || '|' || name || '|' || md5(coalesce(def, '')), E'\n' order by kind, name)) as listing_md5
  from objects;
rollback;
```

Expected: `objects` 759, `listing_md5` `f4990575c686f379fa6bec9c70e37e16` (a local stack built from
the same 17 migrations on 16 Oct; the `10acc19f…` recorded on 13 Oct is the md5 of the same listing
as a file with a trailing newline, so the two conventions agree; its full listing is `docs/release/h1-expected-17-migrations.fp`,
759 lines, for a line-by-line diff). If the count matches but the md5 does not, run the script
unwrapped (its own final `select`), export the result as CSV and send it; the diff names the
changed objects. Extension
versions can differ between hosted and local without meaning anything (they are listed as
`extension|…`); anything under `function`, `table`, `column`, `policy`, `trigger` or `cron` that
differs must be explained before H2.

## 3. The posting functions that H2 replaces

```sql
begin read only;
select to_regprocedure('public.post_response(uuid, text, text, integer)') is not null as four_arg_post_response,
       to_regprocedure('public.post_response(uuid, text, text, integer, uuid)') is not null as five_arg_post_response,
       to_regclass('public.post_submissions') is not null as post_submissions_exists,
       to_regprocedure('public.begin_submission_abandon(uuid, uuid)') is not null as abandon_helpers_exist;
rollback;
```

Expected: `true, false, false, false`. Anything else means part of batch A is already there.

## 4. `auth.sessions` privileges (the session hardening depends on it)

```sql
begin read only;
select has_table_privilege('postgres', 'auth.sessions', 'select') as s,
       has_table_privilege('postgres', 'auth.sessions', 'delete') as d,
       has_table_privilege('postgres', 'auth.users', 'select') as u;
select count(*) as pg_graphql from pg_extension where extname = 'pg_graphql';
select policyname from pg_policies where schemaname = 'storage' and policyname like 'avatars:%' order by 1;
rollback;
```

Expected: `s`, `d`, `u` all `true`; `pg_graphql` `0` (if `1`, nothing breaks: the same row rules
apply through `/graphql/v1`, note it); exactly 4 `avatars:` policies. If `s` is false,
`session_is_current()` falls back to the old behaviour with a warning (sessions are not checked,
nothing fails), and if `d` is false `delete_account` would fail: both must be fixed by a grant
before H4, and H4 does not start until they are true.

## 5. Response slot: nobody has two primary rows on one prompt (H4b pre-check)

```sql
begin read only;
select author_id, prompt_id, array_agg(id) as responses
  from public.responses
 where kind = 'response' and status in ('processing', 'live', 'removed')
 group by 1, 2 having count(*) > 1;
rollback;
```

Expected: no rows. A row is a member who responded again after a moderator removal; migration
`20261016000300` refuses to run until it is decided by hand which response stands.

## 6. Mux clean-up state (must be quiet and off)

```sql
begin read only;
select public.mux_cleanup_health() as health;
select status, count(*) from public.mux_cleanup_jobs group by 1 order by 1;
select count(*) as open_jobs from public.mux_cleanup_jobs where status not in ('done', 'skipped');
select count(*) as purge_failures from public.account_purge_failures;
select jobname, schedule, active from cron.job order by jobname;
rollback;
```

Expected: `health` says `ok` with mode `off`; no job in `pending`, `running` or `failed`
(after Test B2 the only job, J3, finished `done`); `purge_failures` 0; exactly these 8 cron jobs, all active: `mux-cleanup` (`* * * * *`),
`mux-cleanup-monitor` (`*/10 * * * *`), `mux-sweep` (`45 4 * * *`), `prune-moderation-records`
(`30 3 * * *`), `prune-mux-cleanup-jobs` (`40 3 * * *`), `purge-deleted-accounts` (`15 3 * * *`),
`send-push` (`* * * * *`), `tonight-prompt` (`*/10 * * * *`). `health` on hosted may carry
`schedule_never_ran` warnings for daily jobs that have not fired yet; `failed`, `stuck` or
`due` above 0 is a stop.

## 7. The founder's response, V and T1 are as recorded

```sql
begin read only;
select md5(row_to_json(r)::text) as founder_response_md5, r.status
  from public.responses r where r.id = '5b321c24-1e1e-4393-9ae1-e6503903430d';
select md5(u::text) as founder_ledger_md5, u.status
  from public.video_uploads u
 where u.response_id = '5b321c24-1e1e-4393-9ae1-e6503903430d'
    or u.upload_id = (select r.mux_upload_id from public.responses r where r.id = '5b321c24-1e1e-4393-9ae1-e6503903430d');
select r.status, r.mux_playback_id, r.mux_asset_id, r.author_id
  from public.responses r where r.id = '52bbaabb-6faa-4bd2-94f9-015e43be791d';
select a.id, a.deleted_at is null as active, a.moderation_status
  from public.accounts a where a.id = 'b0c14e38-4e89-4dbd-a9a3-8a8c01872a78';
select (select count(*) from public.accounts where deleted_at is not null) as deleted_accounts,
       (select count(*) from public.responses where status in ('removed', 'deleted')) as removed_or_deleted_videos;
rollback;
```

Expected: founder response `c9918f8241a2c45eefb106b5d0ec0a8f`, `live`; founder ledger
`9726bb8fdf8d9eb0cb759d13ce59c8b6`, `claimed`; V
`live` with playback `tu8ooWH201axyHzgonRLCnDhETAgeWw014kaZMAHMrdmo` (P2) on asset
`01IyQdSiLvAbHXb01Xg1ZQISiMz9UvMxLMgfZDpscKMBw`, author T1
`b0c14e38-4e89-4dbd-a9a3-8a8c01872a78`; T1 active with `moderation_status` `active` (the column's default; BETA-READINESS records it so); 0 deleted
accounts and exactly 1 deleted video: the stage 3 step 4B canary, video reply
`6f600f9e-3559-4911-9ebf-13d9d3df509d`, deleted by its author 12 Oct 16:53:19 UTC (its asset was the
first real Mux deletion). The clean-up queue shows `done=3`, `skipped=1`: the canary's deletion, A1's
playback revocation of V, A1's retention deletion of V's asset (skipped by the restore) and B1's
restoration. A different founder hash means the row changed since
13 Oct (for example a new response or a caption edit): paste the row's `updated_at` and status
and it is explained, not necessarily a stop.

## 8. Functions and secrets (Supabase CLI, read-only)

From a clean checkout of the integration branch, with the CLI logged in to the account that owns
the project. `supabase link` writes only local files.

```bash
supabase link --project-ref picvoavfxnajfjkqawju
supabase functions list --project-ref picvoavfxnajfjkqawju
supabase secrets list --project-ref picvoavfxnajfjkqawju
supabase migration list --linked
```

Expected: functions `auth-signin-method`, `mux-create-upload`, `mux-upload-status`,
`mux-webhook`, `mux-cleanup`, all `ACTIVE`, `verify_jwt` false for the Mux ones and
`auth-signin-method`; **no** `abandon-submission`, `web`, `avatar-cleanup`, `admin` or
`send-push` yet (if `web` or `send-push` is listed, say so: it changes H5 and H8 from deploy to
redeploy). Secrets: 11 names, among them `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`,
`MUX_WEBHOOK_SECRET`, `MUX_CLEANUP_KEY`, and **no** `MUX_CLEANUP_MODE`, `PUSH_SENDER_KEY` or
`AVATAR_CLEANUP_KEY`. Paste the names only, never values. `migration list` shows 17 applied on
remote and the 9 newer files local-only (`20261013000200`, `20261013000300` and the seven `20261016…` files) (the list must agree with block 1).

## 9. Does the default domain serve a function's HTML as a page? (H5b, can be answered now)

Only if block 8 shows a function that returns HTML already deployed; otherwise skip until H5.

```bash
curl -sI https://picvoavfxnajfjkqawju.supabase.co/functions/v1/web/i/CHECK | grep -i '^content-type'
```

Expected: `text/html`. `text/plain` means shared links and the admin need a custom domain first
(RELEASE-CHECKLIST H5b).

## 10. Client address header (for the rate limits; can wait until H9)

Not part of H1. After H4 and H5: one invite preview from a known phone, then
`select rule, hits from public.rate_limit_counters` must show one bucket for two calls from that
phone (`SECURITY.md` section 6 step 7).

## What to paste back

The output of blocks 1 to 8 (names only for secrets). Block 9 if applicable. I will compare
each against the expected values, write the result into `docs/BETA-READINESS.md`, and say whether
H2 can start.
