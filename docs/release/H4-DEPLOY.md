# H4: batch B on the hosted project

**Status: done 16 Oct 12:07 UTC with Nemat's approval; every verification check passed, fingerprint
equal to the 24-migration stack (BETA-READINESS section 24, evidence `h4-results-20261016T120919Z.txt`).
H5 onwards wait for their own go-ahead.**

Step H4 of `RELEASE-CHECKLIST.md` Part 1B: Agent C's five migrations, `20261016000200` to
`20261016000204` (`docs/release/SECURITY.md` sections 1 to 6). Same shape as H2: a dry run that must
list exactly these five files, one push, read-only verification against a local stack built from
the same 24 migrations. Each numbered step needs Nemat's go-ahead at the time. Preconditions: H1
passed (in particular `postgres` can SELECT and DELETE `auth.sessions`, checked 16 Oct 11:44 UTC),
H2 and H3 done (19 applied), both clean-up switches non-live.

## What batch B changes

| File | md5 | Effect |
|---|---|---|
| `20261016000200_direct_read_privacy.sql` | `7feca30ca9f8fc2b6aac536957b62da2` | direct table reads of `profiles`, `follows`, `comments` limited to own rows; column grants hide `prompts.suggested_by` and the moderator, note, decided-by and reviewed-by columns from members; TRUNCATE, REFERENCES, TRIGGER revoked from API roles |
| `20261016000201_viewer_visibility.sql` | `559d06cfc983f2bd24903805daa16543` | `prompt_card` faces, `activity_row`, `activity_unread_count`, `get_profile` follower counts respect blocks, deletion and removal |
| `20261016000202_session_lifecycle.sql` | `4818681b366d6039624cd6c609e77468` | `delete_account` needs a sign-in (amr) within 10 minutes and deletes the account's `auth.sessions`; `get_onboarding_state` restores only for a session begun after the deletion; `pre_request` refuses tokens whose session is gone (`session_revoked`, 403; falls back to the old behaviour with a warning if `auth.sessions` is unreadable); the two avatar write policies need a current session and an active account |
| `20261016000203_avatar_cleanup.sql` | `facb8467db5869728a2c5595c51feaa8` | `avatar_removals` queue (old photo on replacement, the whole folder on account deletion), filled by triggers; drained later by the `avatar-cleanup` function (H6), nothing until then |
| `20261016000204_rate_limits.sql` | `e4c3e7bb8c5cbc2cab2ef7b767b798b9` | `rate_limit_rules` and hashed fixed-window counters; `invite_lookup` renamed to `invite_lookup_unlimited` and a limited `invite_lookup` in front of it (`invite_preview`, `check_invite`, `redeem_invite` unchanged for the app; over the limit they answer `not_found`, which the app shows as W-Invalid); `signin_providers_limited` for `auth-signin-method`; `web_event_allowed` for the web beacon; a daily `prune-rate-limit-counters` cron job |

Each has `supabase/rollback/<name>.down.sql`; applied in reverse (204 first) they give a catalog
identical to a 19-migration build (checked locally 16 Oct). Rollback style: a new forward migration
with the `.down.sql` body, newest first.

## Compatibility with what is deployed and installed

- The deployed `auth-signin-method` (v10) calls `signin_providers_for_email`, which 204 keeps
  (`signin_providers_limited` wraps it). It keeps working after H4; H5 redeploys it with the limit.
- `web` is not deployed yet, so nothing calls `web_event_allowed` until H5.
- The installed founder build (`ede68ed`): its sessions carry `session_id`, so `pre_request` passes;
  its delete-account flow signs in again before deleting (the 10-minute rule holds); after a
  deletion the phone is signed out, which is the intended behaviour. A new build is needed only
  for the client-side fixes (startup config guard, push token removal at sign-out).
- No data is rewritten. `avatar_removals` and the rate-limit tables start empty.

## 1. Dry run (read-only on hosted)

```bash
A="$(mktemp -d)" && git archive --format=tar HEAD supabase/config.toml supabase/migrations supabase/templates | tar -x -C "$A" && cd "$A"
rm supabase/migrations/20261016000300*.sql supabase/migrations/20261016000301*.sql   # batch C stays out (2 files)
ls supabase/migrations | wc -l                                                        # 24
md5 -q supabase/migrations/20261016000200*.sql supabase/migrations/20261016000201*.sql supabase/migrations/20261016000202*.sql supabase/migrations/20261016000203*.sql supabase/migrations/20261016000204*.sql
supabase link --project-ref picvoavfxnajfjkqawju
supabase db push --linked --dry-run
```

Expected: the five md5s above; "Would push" exactly `20261016000200_direct_read_privacy.sql`,
`…201_viewer_visibility.sql`, `…202_session_lifecycle.sql`, `…203_avatar_cleanup.sql`,
`…204_rate_limits.sql`, in that order, nothing else; seeds `[]`, roles `[]`. If anything else is
listed, stop.

## 2. Push (needs Nemat's go-ahead at the time)

```bash
supabase db push --linked --yes
```

Expected: five "Applying migration …" lines, "Finished supabase db push", exit 0. A request during
the DDL may fail once.

## 3. Verify (read-only, right after the push)

Run with the same helper as H2 (`supabase db query --linked`, single SELECTs):

```sql
select count(*) || '|' || max(version) as v from supabase_migrations.schema_migrations;                  -- 24|20261016000204
select (to_regprocedure('public.session_is_current()') is not null) || '|' || (to_regprocedure('public.signin_providers_limited(text, text)') is not null or to_regprocedure('public.signin_providers_limited(text)') is not null) || '|' || (to_regprocedure('public.invite_lookup_unlimited(text)') is not null) || '|' || (to_regclass('public.avatar_removals') is not null) || '|' || (to_regclass('public.rate_limit_rules') is not null) as v;   -- true|true|true|true|true
select string_agg(policyname, ';' order by policyname) as v from pg_policies where schemaname = 'public' and tablename in ('profiles', 'follows', 'comments');   -- no "signed-in users can read" policies; own-row policies instead
select (not has_column_privilege('authenticated', 'public.prompts', 'suggested_by', 'select')) || '|' || (not has_column_privilege('authenticated', 'public.moderation_actions', 'note', 'select')) || '|' || (not has_column_privilege('authenticated', 'public.moderation_actions', 'moderator', 'select')) as v;   -- true|true|true
select string_agg(policyname, ';' order by policyname) as v from pg_policies where schemaname = 'storage' and policyname like 'avatars:%';   -- the 4 names, two of them recreated
select count(*) as v from cron.job;                                                                     -- 9 (prune-rate-limit-counters added)
select (select count(*) from public.rate_limit_rules) || '|' || (select count(*) from public.avatar_removals) as v;   -- rules present (the defaults in SECURITY.md 1b), 0 removals
select public.session_is_current() as v;                                                                 -- true for the service connection (no session claim)
```

Then the schema fingerprint (`scripts/schema-fingerprint.sql` wrapped as in `H1-PREFLIGHT.md`
block 2) must equal `docs/release/h4-expected-24-migrations.fp`: 847 objects, listing md5
`8bddf2614e7c2d55acfcd10d951dddc5` (local stack built from the same 24 migrations, 16 Oct). Founder response and ledger
hashes, V and the clean-up switches unchanged (the H2 verification lines).

**Hosted auth smoke, after the push (Nemat, own address; this makes one real sign-in):**
`SESSION_GATE=1 node scripts/hosted-auth-smoke.mjs` checks sign-in, refresh, a product call, and
that a signed-out token is refused (`session_revoked`). Its own go-ahead.

## 4. What follows (each its own step)

- H5: deploy `web` (first deployment; XSS fix, beacon limit, pinned hls.js, app links), then H5b.
- H5 also redeploys `auth-signin-method` (the limited lookup) and `send-push` can go at any time.
- H6: `avatar-cleanup` with `AVATAR_CLEANUP_KEY` and the two Vault secrets; until then names queue.
- H9 checks: the rate-limit client header (`SECURITY.md` section 6 step 7).

## Rollback (its own go-ahead)

New forward migrations carrying `supabase/rollback/20261016000204_….down.sql`, then `203`, `202`,
`201`, `200`, in that order; dry run must list only those; push. Sessions already ended stay
ended. If `web` or `auth-signin-method` were redeployed in between, redeploy their previous
versions first (`SECURITY.md` section 6 step 9).
