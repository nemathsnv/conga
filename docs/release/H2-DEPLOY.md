# H2 and H3: batch A on the hosted project

**Status: H2 (steps 1 to 3) done 16 Oct 11:59 to 12:01 UTC with Nemat's approval; every verification
check passed (BETA-READINESS section 22, evidence `h2-results-20261016T120044Z.txt`). H3 (step 4)
is NOT done and waits for its own go-ahead.**

Steps H2 and H3 of `RELEASE-CHECKLIST.md` Part 1B, written out so that each needs one decision and
one command. Preconditions: H1 passed (`docs/release/h1-results-*.txt` whose first line says `mode linked`,
with every compared block PASS and block 8 read by a person), the integration branch reviewed at the commit named below, both clean-up switches
non-live, and Nemat's go-ahead for each numbered step separately. Nothing here runs by itself.

Reviewed commit for the archive: the integration tip at the time of the go-ahead (record its hash
in `BETA-READINESS.md` when you run step 2). The two migration files were last changed in
`ddd8e0f` (14 Oct) and are byte-identical on the integration branch:
`20261013000200_post_idempotency.sql` md5 `331fdb6da1bd5b0d49f660cc6b42200b`,
`20261013000300_safe_submission_abandon.sql` md5 `bb4bf0284c7a7d79ea06a64abead89a3`. Step 1 prints
both so they can be checked before the push.

## What batch A changes

- `20261013000200_post_idempotency.sql`: a `post_submissions` ledger; `post_response`, `post_reply`,
  `post_draft` and `retry_response_upload` gain a fifth argument `p_submission uuid` with a
  default, so the installed founder build (`ede68ed`, four arguments) keeps posting and builds
  since `b7a02ad` (five arguments) get idempotent posting. No data is rewritten.
- `20261013000300_safe_submission_abandon.sql`: `begin_submission_abandon` and
  `finish_submission_abandon` (service role only) and the tombstone rules the
  `abandon-submission` function uses. It drops the `abandon_submission` SQL function 0200 creates
  (nothing calls it), which is why both go in one push.
- `abandon-submission` Edge Function (new): the member's Discard asks Mux before anything is
  retired; `errored` or undocumented upload states are kept unverified until 10 minutes after the
  URL's expiry (`VIDEO-RELIABILITY.md` section 2). Deployed `--no-verify-jwt`: it verifies the
  member's token itself (`auth.getUser`) and answers 401 without one.

Older clients: unaffected (defaults). Rollback: `VIDEO-RELIABILITY.md` section 6 (new forward
migrations carrying the `.down.sql` bodies, newest first; rehearsed locally 25 of 25 times).

## 1. Dry run (read-only on hosted; local files only)

From a clean archive of the reviewed commit, linked to the project:

```bash
A="$(mktemp -d)" && git archive --format=tar HEAD supabase/config.toml supabase/migrations supabase/templates | tar -x -C "$A" && cd "$A"
rm supabase/migrations/20261016*.sql          # batches B and C stay out of this push (7 files)
ls supabase/migrations | tail -3               # must end with 20261013000200 and 20261013000300
md5 -q supabase/migrations/20261013000200_post_idempotency.sql supabase/migrations/20261013000300_safe_submission_abandon.sql
supabase link --project-ref picvoavfxnajfjkqawju
supabase db push --linked --dry-run
```

Expected: the two md5s above; the dry run lists exactly, in this order,
`20261013000200_post_idempotency.sql` and `20261013000300_safe_submission_abandon.sql` and nothing
else (the integration branch holds 26 migration files; a plain archive carries the seven
`20261016…` files of batches B and C, which is why the `rm` comes first). Seeds `[]`, roles `[]`.
If anything else is listed, stop.

## 2. Push (the one change; needs Nemat's go-ahead at the time)

```bash
supabase db push --linked --yes
```

Expected output: "Applying migration 20261013000200_post_idempotency.sql", then
"Applying migration 20261013000300_safe_submission_abandon.sql", "Finished supabase db push",
exit 0. A Post in flight during the DDL may fail once; the app's Retry recovers it.

## 3. Verify (read-only, right after the push)

```sql
begin read only;
select count(*) as applied, max(version) as latest from supabase_migrations.schema_migrations;   -- 19, 20261013000300
select to_regprocedure('public.post_response(uuid, text, text, integer)') is null as four_arg_gone,
       to_regprocedure('public.post_response(uuid, text, text, integer, uuid)') is not null as five_arg_post_response,
       to_regprocedure('public.post_reply(uuid, text, text, integer, uuid)') is not null as five_arg_post_reply,
       to_regprocedure('public.post_draft(uuid, text, text, integer, uuid)') is not null as five_arg_post_draft,
       to_regclass('public.post_submissions') is not null as post_submissions,
       to_regprocedure('public.abandon_submission(uuid)') is null as abandon_submission_sql_absent;
select p.proname, p.prosecdef as definer, p.proconfig as search_path,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_can,
       has_function_privilege('anon', p.oid, 'execute') as anon_can,
       has_function_privilege('service_role', p.oid, 'execute') as service_can
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('post_response', 'post_reply', 'post_draft', 'retry_response_upload', 'begin_submission_abandon', 'finish_submission_abandon')
 order by 1;
select c.relrowsecurity as rls_on, (select count(*) from pg_policies where tablename = 'post_submissions') as policies
  from pg_class c where c.oid = 'public.post_submissions'::regclass;
rollback;
```

Expected: 19 applied, latest `20261013000300`; all six booleans true; the posting functions are
`SECURITY DEFINER` with a pinned `search_path`, executable by `authenticated` and `service_role`
(the default grant, which the migration keeps), not by `anon` or PUBLIC; the two abandon helpers
by `service_role` only; `post_submissions` RLS on with 0 policies. Then the schema
fingerprint (`scripts/schema-fingerprint.sql` wrapped as in `H1-PREFLIGHT.md` block 2) must equal
`docs/release/h2-expected-19-migrations.fp` (a local stack built from the same 19 migrations,
16 Oct: 788 objects, listing md5 `13d25b7796fee9876ce41826f5decce5` by the H1 block 2 method;
compare count and md5 first, then the listing). PostgREST: `GET /rest/v1/` with the anon key lists `post_response` with a `p_submission`
parameter (the schema cache reloads on DDL; if not, `NOTIFY pgrst, 'reload schema'` is the only
write involved and needs its own nod).

## 4. H3: deploy the function (needs Nemat's go-ahead at the time)

```bash
supabase functions deploy abandon-submission --project-ref picvoavfxnajfjkqawju --no-verify-jwt
supabase functions list --project-ref picvoavfxnajfjkqawju
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://picvoavfxnajfjkqawju.supabase.co/functions/v1/abandon-submission" -H 'content-type: application/json' -d '{}'
```

Expected: `abandon-submission` `ACTIVE` with `verify_jwt` false; every other function's version
and bundle unchanged; the unauthenticated `POST` answers 401. No secret is needed beyond the
existing `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` (the function reads Mux; it never deletes).

## 5. After H2 and H3

- Record each step in `docs/BETA-READINESS.md` (a new section 21) with the UTC times, the dry-run
  output, the push output and the verification values.
- The provider tests: C2a (`PROVIDER-TESTS.md`) now becomes possible; C1 and C2w never needed
  this batch.
- Batch B (`H4`: migrations `20261016000200` to `204`) has its own package once Nemat has read
  `SECURITY.md` sections 5 and 6; its preflight is already in H1 block 4.

## Rollback of batch A (only if something is wrong; its own go-ahead)

Create two new forward migrations in a scratch copy, newest first, with these bodies:
`supabase/rollback/20261013000300_safe_submission_abandon.down.sql` then
`supabase/rollback/20261013000200_post_idempotency.down.sql`; `supabase db push --linked --dry-run`
must list only those two; push. Rows posted with a submission stay as ordinary rows, the
four-argument functions return, the five-argument versions stay (no default) so new builds keep
posting, and `abandon-submission` then answers `kept`/`unverified` and deletes nothing. Delete or
redeploy the function only if its handler is at fault (`VIDEO-RELIABILITY.md` section 6).
