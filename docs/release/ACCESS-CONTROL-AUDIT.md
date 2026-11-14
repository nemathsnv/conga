# Closed-beta access control audit (2 Nov 2026)

Branch `claude/conga-access-control-audit-fbafec` from `f5aea9c` (the revocation preflight tip).
**Nothing hosted was changed. Production was read only, with aggregate selects and the public Auth
settings endpoint. No account was created on production. No Mux call, no app or device change.**

The question (BETA-READINESS section 50, "Decision for Nemat"): `pre_request` checks the session,
not a profile or beta access, so can a signed-in account that never finished onboarding read
member-only data?

**Answer: yes, all of it, and it is an authorization defect, not intended public access.** One
migration (`20261102000100_member_gate.sql`) closes it without changing onboarding, invites, the
waitlist or public video links. It is not deployed. It must go out **after** the revocation migration
`20261101000100` (section 6).

## 1. How the gap is reached

1. Email sign-up is open on production: `GET /auth/v1/settings` answers `disable_signup: false`,
   email on. This is by design: SPEC.md Section 13 creates the sign-in identity at sign-in, before the
   invite step.
2. Anyone with an inbox therefore gets an `authenticated` session with no invite, no 18+ answer and
   no profile. Apple and Google are off.
3. Every read function is `SECURITY DEFINER`, granted to `authenticated`, and checks only
   `auth.uid()`. `pre_request` checks password sessions, revoked sessions and suspension, nothing
   else. So that session can call every member function.
4. The app never makes these calls before Home: `resolveStep` (`app/src/lib/onboarding.ts`) keeps a
   non-member in onboarding, and the member screens sit behind `Stack.Protected guard={inApp}`. Only
   a hand-made request reaches them, with the public anon key and the person's own access token.

## 2. What was exposed

Reproduced on an isolated local stack (`shortcut-acl`, 30 migrations). Real OTP sessions went
through Auth, PostgREST and the access token hook in four pre-member states:

- signed in only;
- 18+ answered;
- waitlisted;
- invite redeemed, no profile yet.

All four got **exactly what a member gets**. The only difference was the member's cohort places.

| Surface | What a non-member read |
| --- | --- |
| `home_feed`, `following_feed`, `open_prompts`, `get_prompt`, `prompt_responses` | Every live prompt and response: Mux playback ids, names, usernames, photos, captions, counts |
| `get_response`, `get_video`, `reply_room` | Any video and its whole reply room, playback ids included |
| `comments_list` | Comment text and authors. The web never shows comments (SPEC.md Section 16) |
| `get_profile` (by id or username), `profile_responses`, `profile_replies` | Name, username, bio, photo, counts, every video on a profile |
| `follow_list`, `follow_suggestions` | The follow graph (followers and following of anyone) |
| `search` | People, places and prompts by text: enumerates the member list |
| `discover`, `places_screen`, `place_page` | Topics, busy prompts, places and their prompts |
| Direct `GET /rest/v1/places`, `topics`, `app_config` | Whole tables (`prompts` was already 403; profiles, responses, comments and follows were already own rows only) |

Writes that went through as a non-member:

- `follow_place`, `block_user` and `register_push_token` wrote rows.
- With a token and a timezone (`set_timezone` was allowed), `queue_tonight_prompt` would push the
  nightly featured prompt to a non-member.
- `follow_user`, `like_video` and `like_comment` failed only by accident, on a foreign key to
  `profiles`.
- `post_comment`, `suggest_prompt`, `my_invites`, posting and uploads already refused
  (`profile_required` or `no_profile`).

**Not exposed:**

- **Tables:** direct reads have been own rows only since `20261016000200`.
- **`invites`, `waitlist`, `accounts`:** own rows only.
- **Storage:** writes need a profile (`avatar_write_allowed`).
- **Edge functions:** `mux-create-upload`, `mux-upload-status` and `abandon-submission` act only on
  the caller's own rows. `admin`, `mux-cleanup`, `send-push`, `mux-webhook` and `avatar-cleanup` use
  their own keys.
- **Web player:** the `web` function and `web_video`/`web_prompt` are public by design.

### Intended or not

**Not intended.** SPEC.md Sections 13 and 14 make the profile, and with it membership, depend on the
18+ answer and beta access. Section 16 makes public only watching a shared video, the prompt's other
responses and video replies, by link. Profiles, comment text, search, the feeds, the follow graph
and places are member features. They were open only because no server check existed. It was
flagged as an open policy call, not a decision.

### Separate, lower-severity finding (not fixed here)

**F3, the avatars bucket can be listed anonymously.** The policy `avatars: anyone can read` (role
`public`, `bucket_id = 'avatars'`) also allows Storage's `list`. With only the anon key,
`POST /storage/v1/object/list/avatars` returns every account id that has a photo, then every file.
Reproduced locally; the hosted policy is identical.

Fetching a photo by its URL needs no policy, because the bucket is public. So dropping the `SELECT`
policy would probably keep photos working, but that needs its own check, so it is not in this
change:

- the app's uploads may rely on it if they upsert;
- `avatar-cleanup` runs on the service role.

## 3. Production state (read only, 2 Nov)

Four single-statement aggregate selects through `scripts/provider-sql.sh hosted`. They read no
emails, ids or tokens. Each was rehearsed on the local stack first.

- **Migrations:** 29 applied, latest `20261021000200`. The revocation migration is not deployed, as
  expected.
- **Hooks:** `pgrst.db_pre_request = public.pre_request`. The function's md5 (`68e72efa…`) is equal
  to the local one.
- **Policies:** 24 on public and storage, md5 equal to local.
- **Grants:** the 79 functions granted to `authenticated`, with their anon flags, are identical to
  local (sorted diff).
- **Read functions:** the bodies of the 22 functions above are equal to local (md5). The local
  reproduction therefore stands for production.
- **Closed-beta switch:** `invite_required = true`. The `avatars` bucket is public.
- **Accounts:** 2, both members (profile and beta access). 0 accounts without a profile, 0
  waitlisted, 0 in the deletion window.
- **Exposure:** no non-member account exists today, so no data has been read this way through an
  account that still exists. The API logs were not read, and an account that existed and was later
  deleted would not show here. The gap stays open for anyone who signs up.

## 4. The fix: `20261102000100_member_gate.sql`

The fix denies by default in the one place every API request already passes. `pre_request` raises
`profile_required` (SQLSTATE 42501, HTTP 403) for a signed-in account that is not a member, unless
the request path is one of these:

- **Onboarding:** `get_onboarding_state`, `confirm_age`, `check_invite`, `invite_preview`,
  `redeem_invite`, `join_waitlist`, `username_status`, `username_suggestions`, `create_profile`.
- **Analytics:** `track_events`, for the onboarding events.
- **Anyone signed in:** `delete_account` and `remove_push_token`.
- **Public anyway:** `web_video` and `web_prompt`. A signed-in non-member should not see less than a
  logged-out visitor.
- **Already allowed:** `request_review` and `set_timezone` return earlier, through the existing
  suspended allowlist, unchanged.

**A member is an account with a profile** (`has_profile`, the existing helper).

- `create_profile` is where the closed beta is enforced: it refuses without the 18+ answer and,
  while `invite_required` is on, without an invite or waitlist admission. So a profile implies both.
- At public launch (`invite_required` off) nothing changes.
- **Tried first and dropped:** also requiring `has_beta_access` at request time, which mirrors the
  app's `resolveStep`. The repo's own integration suites create profiles through the service role
  without an invite, and that variant locked them out (403). A team-made or migrated profile would
  hit the same lockout. A cancelled invite would also cut off a member mid-session. It adds no
  protection the profile gate does not already give: production has 0 profiles without beta access.

### Why this shape

- **One choke point:** `pre_request` already runs on every PostgREST request, including GraphQL and
  direct table reads. Hosted has run it since `20261008000200`, and section 30 of BETA-READINESS
  verified it.
- **New functions are covered:** a function added later is member-only until someone adds it to the
  allowlist. Per-function checks would mean editing about 60 bodies and remembering every new one.
- **Small:** no function body, grant, policy or row changes. The suspension, password and session
  checks keep their order and answers.
- **Compatible message:** `profile_required` is the message `mux-create-upload` already maps to 403,
  so that function's answer to a non-member is unchanged.
- **Cheap for members:** one primary-key lookup on `profiles` per request, only on paths outside
  the allowlist.

**Rollback:** `supabase/rollback/20261102000100_member_gate.down.sql` restores `pre_request` exactly
(rehearsed: md5 back to `68e72efa…`, production's) and drops `pre_member_allowed_path`.

## 5. What could break, checked

| Flow | Result |
| --- | --- |
| O-Welcome, O-Email | No PostgREST call (`auth-signin-method` is an Edge function on the anon key) |
| A-Age | `confirm_age` allowed; tested |
| O-Invite, W-Invalid | `check_invite`, `redeem_invite` allowed; redeem tested end to end |
| W-Link (`i/[code]`) | `invite_preview` allowed signed in, and anon as before |
| W-Waitlist | `join_waitlist` allowed; Sign out removes no token (none was registered before Home) |
| O-Profile | `username_status`, `username_suggestions`, `create_profile` allowed; tested |
| O-Photo, Home | After `create_profile` the account is a member at once (tested: `home_feed` allowed in the same session, no new token needed); `set_profile_photo` allowed |
| Suspended screen | Unchanged: `suspended` still wins over `profile_required` (tested) |
| Public links (web player) | Unchanged: the `web` function uses the service role; anon `web_*` unaffected; signed-in `web_*` allowed |
| Account deletion, sign-out | `delete_account`, `remove_push_token` allowed for anyone signed in |
| Posting, uploads | Members unchanged; non-members were already refused, now earlier with the same message |
| Members | The HTTP probe gave identical results before and after for every call |

**Known edge, unchanged:** a member whose redeemed invite is later cancelled (a rare team action)
keeps server access, because they have a profile. The app still sends them to O-Invite, as before.

**Maintenance rule:** any new call the app makes before Home must be added to
`pre_member_allowed_path` and to test 0037's expected list, or onboarding will get a 403. Since
12 Nov the Jest test `app/src/__tests__/memberGate.test.ts` enforces this in GitHub CI (section 8).

**Not verified:** the installed founder binary (19 Oct build plus OTA). Its onboarding calls were
read from the current app source only, not observed on the phone. The only account on it is a
member, so the gate does not touch it.

## 6. Regression tests

- **pgTAP `supabase/tests/0037_member_gate.sql` (41 tests):**
  - **Deny by default:** for each of the four pre-member states, the set of RPC paths `pre_request`
    lets through equals the expected allowlist exactly. A member gets every path.
  - Each exposed function and table above is refused one by one, and so are GraphQL and an empty
    path.
  - Full onboarding works through the gate: age, invite, profile, photo, then Home in the same
    session.
  - `invite_required` on and off, the cancelled-invite edge, the anon web player, the
    password/session/suspended order, and the allowlist not callable from the API.
- **Existing test changed, `0007_auth_hardening.sql`:** its "an email-code session passes" check
  used an account with no profile on `/rpc/home_feed`. It now uses `/rpc/get_onboarding_state`; the
  password checks around it are unchanged.
  - Fails on the unfixed schema (every deny-by-default and refusal check) and passes with the fix.
    Rehearsed: rollback makes it fail again, and re-applying makes it pass.
- **HTTP probe:** the scratch script `probe.mjs` makes real OTP sessions and calls every read
  function and table, and the writes, over PostgREST. Before and after results are in sections 2
  and 4.
- **Full local verification** (`scripts/full-local-verification.sh acv 567`, with the migration,
  2 Nov):
  - 27 of 29 steps passed on the first full run. That covers every Deno unit and integration suite
    (abandon, admin, alert, avatar clean-up, clean-up 38, idempotency, integration, sign-in method,
    uploads, web beacon, admin HTTP), scheduler 13, C1 rehearsal 52 of 52, provider rehearsal 15,
    auth integration, and app typecheck, lint and jest (42 suites, 528 tests).
  - pgTAP and the idempotency rollback check failed on one assertion: 0037 test 41 found the new
    allowlist function executable by `authenticated`. Default privileges did not cover it, which
    the repo already warns about. The migration now revokes it explicitly.
  - Rerun on a clean stack with that fix: pgTAP 1972 of 1972 (27 files), and the idempotency
    rollback check PASS (its older suite 1089, the re-apply fingerprint equal).
- **Rollback rehearsal on the final migration:** the down file brings `pre_request` back to
  `68e72efa…` and 30 migrations, and 0037 fails. Re-applying gives 31 migrations and pgTAP PASS.
- **Fingerprint:** `docs/release/mg-expected-31-migrations.fp` (907 lines). It differs from
  `rv-expected-30-migrations.fp` in exactly two lines: `pre_request` changed, and
  `pre_member_allowed_path` added.
- **Not run:** a real device or simulator. No app code changed, and the app reaches member calls
  only from Home.

## 7. Deployment runbook (conditionally approved by Nemat, 2 Nov; run 12 Nov)

Conditions, from `docs/DECISIONS.md` (2 Nov):
- only after `20261101000100` is deployed **and verified**, and as a separate deployment;
- a fresh preflight; a verified backup; exactly this one migration;
- no production test account;
- **no automatic rollback.**

**Status at 2 Nov 10:35 UTC:** hosted has 29 migrations (latest `20261021000200`), so the
precondition is not met and nothing was run.

**Run on 12 Nov 2026:** deployed at 14:03 UTC after every gate passed. See section 9.

**G0. Precondition (read only):**
- 30 migrations, latest `20261101000100`.
- The revocation runbook's D2 to D5 recorded as PASS in BETA-READINESS.
- The fingerprint equal to `rv-expected-30-migrations.fp`.
- If any of these fails, stop.

**G1. Fresh preflight (read only):**
- `pre_request` md5 `68e72efa…`.
- `pgrst.db_pre_request = public.pre_request`; `invite_required` true.
- Accounts without a profile: 0, from the section 3 aggregates. If not 0, stop and report the
  count, because those accounts lose member reads.
- No open, failed or retrying Mux clean-up job, so the Mux deployment is not mid-flight.

**G2. Verified backup** (hosted has no PITR and no backup list; see section 52):
- **Schema dump:** a schema-only dump of `public` (`supabase db dump --linked`) into
  `~/.conga-provider/backups/`, mode 600.
- **Function definitions:** `pg_get_functiondef` of `pre_request`, saved alongside with its md5.
- **Fingerprint:** the hosted fingerprint before the deploy.
- **Verified means:** the dump restores into an isolated local stack, and that stack's
  `pre_request` md5 and fingerprint lines equal the hosted ones.
- **Rows:** the migration changes no row, so a full data dump adds nothing. The table row counts
  and hashes are taken anyway, to prove that afterwards.

**G3. Migration:**
- `git archive` this branch's `supabase/` (rebased on the revocation tip) into a scratch workdir.
- `supabase db push --linked --project-ref <ref> --workdir <scratch> --dry-run` must list exactly
  `20261102000100_member_gate.sql`. Anything else means stop.
- Then run it without `--dry-run`.

**G4. Verification, with no test account:**
- **Schema:** 31 migrations; the fingerprint equal to `mg-expected-31-migrations.fp`;
  `pre_member_allowed_path` not executable by anon or authenticated; table counts and hashes equal
  to G2's.
- **Gate, server-side:**
  - The test runs inside a `READ ONLY` transaction that is rolled back, impersonating each existing
    account by its claims, with no session id and so no session lookup.
  - Every existing account: `/rpc/home_feed` and `/rpc/get_profile` give `allowed`.
  - A random uuid with no account (the state of a brand-new sign-in): `/rpc/get_onboarding_state`,
    `/rpc/confirm_age`, `/rpc/redeem_invite`, `/rpc/create_profile` and `/rpc/web_video` give
    `allowed`; `/rpc/home_feed` and `/places` give `profile_required`.
  - The output is pass/fail per check only, with no ids printed.
- **Member access:**
  - Nemat on the founder iPhone: Home, a profile, comments, search and a video reply room load.
  - Unauthenticated `POST /rest/v1/rpc/get_onboarding_state` gives 401, as before.
- **Public links:** a known shared link on `conga.churntech.com` plays logged out, and anon
  `web_video` gives 200.
- **Onboarding end to end on production** needs a new account, so it is **not run** without
  separate approval. The pgTAP 0037 and HTTP probe coverage stands in for it.

**G5. If any G4 check fails:** **no automatic rollback**, because
`20261102000100_member_gate.down.sql` reopens the authorization gap. Stop, record the failing check
and the state, and report for Nemat's recovery decision. The options to put to him are:
- a forward fix, for example adding a missing path to `pre_member_allowed_path`;
- the rollback file, run only on his explicit instruction.

**Separation from the Mux deployment:** the migration touches no Mux table, function, job,
schedule, secret or Edge function. It is deployed in its own step after the revocation's D5. A
problem in either one is reported on its own.

## 8. Integration into main (12 Nov 2026): re-verified on an isolated stack; nothing hosted

Branch `claude/conga-member-gate-integration` from `origin/main` `bbf2101` (PRs 1 to 3), with this
branch merged in unchanged (merge commit; its three commits keep their ids). **No hosted read or
write, no Mux call, no account outside the local stack, no app build.**

- **What changed on main since the gate was written (`f5aea9c`):**
  - Nothing in `supabase/`: no migration, function, test or config. The gate's `pre_request` is
    still built on the newest definition (`20261016000202_session_lifecycle.sql`), and the revocation
    migration `20261101000100` touches neither `pre_request` nor any path the gate reads.
  - In `app/`: the Android, 720p and status-bar work (PR 2). It adds no API call: the set of RPCs,
    table reads and Edge functions the app uses is the same. Every call the app makes before Home
    is still on the allowlist, and `syncTimezone` and the push registration still wait for Home.
  - Conflicts: documentation only (this audit is now BETA-READINESS section 54; the DECISIONS row
    points there).
- **New regression test, `app/src/__tests__/memberGate.test.ts` (6 tests, runs in GitHub CI):**
  - The allowlist parsed from the newest migration equals the reviewed list, and member functions
    (feeds, profiles, comments, search, follows, places, push registration, GraphQL) are not on it.
  - Every RPC in the onboarding screens, the invite link screen and the modules they use is on
    `pre_member_allowed_path` or `suspended_allowed_path` (except `set_profile_photo`, which runs
    after `create_profile`); none of them reads a table directly; they import from `content` and
    `notifications` only `requestReview` and `setSuspendedHandler`; sign-out, the suspended screen
    and the invite link reach only open paths.
  - Mutation-checked: removing `confirm_age` from the migration fails 2 tests; importing `homeFeed`
    into an onboarding screen fails 1.
  - pgTAP 0037 needs a local stack, which CI does not run, so this is CI's only gate check.
- **Full local verification** (`scripts/full-local-verification.sh mgi 571`, stack `shortcut-mgi`,
  31 migrations): 28 of 29 steps passed on the first run.
  - Passed: pgTAP 1972 of 1972 (27 files, 0037 included); every Deno unit and integration suite;
    the idempotency rollback check (older suite 1089, re-apply fingerprint equal); scheduler; C1
    rehearsal 52 of 52; provider rehearsal; auth integration; lint; Jest.
  - Failed: the app typecheck, on the new test's Node imports. Fixed with the typed `require`
    pattern of `androidLayout.test.ts`. Typecheck, lint (0 warnings) and Jest (44 suites, 545
    tests) then passed.
- **HTTP bypass probe** (scratch script, real email-code sessions through Kong, PostgREST, Auth,
  Storage and the Edge runtime with fake Mux): **50 of 50.**
  - **Sweep:** every one of the 63 member functions granted to `authenticated` gives 403
    `profile_required` in three non-member states (signed in only, invite redeemed without a
    profile, mid-onboarding). The member is never refused by the gate.
  - **Onboarding over HTTP:** age, invite check and redeem, username status and suggestions, and
    `create_profile` pass; the same session reads `home_feed` straight after.
  - **Tables and counts:** direct `GET` on 10 tables, and `HEAD /places` with `count=exact`, give 403
    with no count header.
  - **GraphQL:** refused, both `/graphql/v1` and `/rpc/graphql` with `Content-Profile:
    graphql_public`.
  - **Path tricks:** trailing or double slash, percent-encoding, upper case, `..` segments from an
    allowed path (plain and encoded), a name with an allowed prefix, the `GET` form, and an allowed
    name in another schema. Each gives 403 or 404, never data. No allowlisted function returns a
    table row type, so none can embed other tables.
  - **Storage and Edge:** a non-member cannot upload an avatar; `mux-create-upload` answers 403
    `profile_required`. `abandon-submission` does not refuse a signed-in non-member: with an
    unknown submission id it answers 200 `abandoned`/`no_row` and writes one own-account
    `post_submissions` tombstone (measured, 13 Nov). A foreign id gets `not_found`, so no other
    account's data is read or changed; repeated fresh ids grow the caller's own tombstones
    (low, pre-existing, not limited here). A revoked token gets 401.
  - **Unchanged:** anon `home_feed` 401, anon and signed-in `web_video` 200.
  - **Order with the November security work:** a suspended non-member gets `suspended`, not
    `profile_required`, and `set_timezone` stays open to them. After a global sign-out, a non-member
    gets `session_revoked` even on an allowed path, and so does a member.
- **Rollback rehearsal on the integrated branch:** the down file returns `pre_request` to md5
  `68e72efa…` (production's recorded value) at 30 migrations, and drops the allowlist function.
  - The same probe then fails 20 checks, reproducing section 2's exposure: `home_feed` 200 without a
    profile, whole tables, the `HEAD` count `0-3/4`, and the path tricks.
  - `supabase migration up` re-applies it: md5 `9281c320…`, 31 migrations, the allowlist not
    executable by anon or authenticated, the probe 50 of 50.
  - After a reset (the probe's leftover rows break pgTAP 0002's fixtures, unrelated to the gate),
    pgTAP passed 1972 of 1972 again.
- **Fingerprint:** the integrated stack's 907 lines equal `mg-expected-31-migrations.fp`. That file
  differs from `rv-expected-30-migrations.fp` only in `pre_request` and the new
  `pre_member_allowed_path`.
- **Realtime:** the `supabase_realtime` publication has 0 tables and the app opens no channel, so
  Realtime gives no path to member rows. Not run on the stack (Realtime is off there).
- **Still not verified:**
  - The hosted state since 3 Nov: not read in this pass (G0 and G1 do that, with approval).
  - A device or simulator: no app behaviour changed.
  - The avatars listing finding (F3): still open, separate.

## 9. Hosted deployment (12 Nov 2026)

Nemat approved G0 and G1 (read only), then G2 to G5, in chat on 12 Nov. The migration was deployed
alone at 14:03 UTC. Summary in `docs/BETA-READINESS.md` section 56.

| Gate | Result |
| --- | --- |
| G0, 13:45 UTC | PASS. 30 migrations, latest `20261101000100`; the version list equal to `main`'s first 30 (md5 `7967f37a…`); fingerprint equal to `rv-expected-30-migrations.fp` (0 lines differ); the revocation's D2 to D5 recorded PASS (BETA-READINESS 53); the `revoke` check 18/18. |
| G1, 13:45 UTC | PASS. `pre_request` md5 `68e72efad2fd8695ff04e83fb3667386`, owner postgres, security definer; `pgrst.db_pre_request=public.pre_request`; `invite_required` true; accounts 2, profiles 2, 0 sign-ins and 0 accounts without a profile, 0 profiles without beta access; `20261102000100` not applied, no `pre_member_allowed_path` in any schema; clean-up jobs 8 done and 1 skipped, 0 open, health `ok`. |
| G2, 13:58 UTC | PASS. Backup `~/.conga-provider/backups/mg-before-20261102000100-20261112T135814Z/` (700/600, SHA-256 sums): schema dump, data dump (71 tables with rows), `pre_request` definition, hosted fingerprint, 39 table hashes; unchanged during the dumps. Restored into the isolated stack `shortcut-mgb` (30 migrations): sums match, one-transaction restore, 39/39 table hashes equal, stack fingerprint equal to `rv-expected-30`, the dump holds `pre_request` and no allowlist function. Stack stopped. |
| G3, 14:00 UTC | PASS. G0/G1 repeated, every value unchanged; fingerprint and table hashes equal to the backup's. `git archive e37e5b1` (31 migrations; `20261102000100_member_gate.sql` md5 `e39d5986…`, unchanged since `6fc9619`). Dry run: only `20261102000100_member_gate.sql`, no seeds, no roles. |
| G4, 14:03:30 to 14:03:33 UTC | Applied `20261102000100_member_gate.sql` only. No Edge Function, secret, config, auth, Mux or app change. |
| G5 | PASS. See below. No rollback needed. |

**G5 evidence:**
- **Schema:** 31 migrations, latest `20261102000100` (version list md5 `9e65f079…`, equal to `main`).
  The fingerprint equals `mg-expected-31-migrations.fp`. Against the pre-deploy backup exactly two
  lines differ, `pre_request()` (`1e469928…` to `fa1c544a…`) and the new
  `pre_member_allowed_path(text)`; every policy (24 on public and storage), grant, table, trigger,
  cron job and other function is unchanged, `mux_forget_video` included.
- **Functions:** `pre_request` md5 `9281c3208e93ff0273528cb44cfa736f`, equal to the local rehearsal.
  `pre_member_allowed_path` is owned by postgres, immutable, not security definer, executable by
  postgres and service_role only (not anon, not authenticated).
- **Data:** the 39 table hashes (every public table and `auth.users`) equal to the backup's before
  and after the gate check: no row changed. Accounts 2, profiles 2, 0 without a profile.
- **Gate behaviour, 34/34**, in one `do` block that sets the transaction `READ ONLY` and ends by
  raising its result, so it always rolls back. Pass/fail only, no ids printed:
  - each of the 2 accounts on `/rpc/home_feed`, `/rpc/get_profile`, `/rpc/comments_list`,
    `/rpc/search`, `/places`, `/rpc/graphql`, `/rpc/get_onboarding_state`: `allowed`;
  - a random uuid with no account (a brand-new sign-in): `allowed` on `get_onboarding_state`,
    `confirm_age`, `check_invite`, `redeem_invite`, `create_profile`, `web_video`, `delete_account`,
    `track_events`, `request_review`; `profile_required` on `home_feed`, `/places`, `get_profile`,
    `graphql`, `search`, `comments_list`, `/profiles` and an empty path;
  - a password session: `password_session`, first, as before;
  - no claims (anon): `allowed` by `pre_request`, as before (grants decide).
- **HTTP, unauthenticated, anon key:** `get_onboarding_state` 401 and `home_feed` 401, as before;
  `web_video` 200 `live` for a visible video and 200 `unavailable` for an unknown id.
- **Background jobs and Mux:** the clean-up is live, cap 2, not paused; 0 open jobs (8 done, 1
  skipped, as before); health `ok` with no problems; 12/12 schedules active, 0 failures in 24 hours;
  `mux-cleanup` v23; Edge Function versions and the 14 secret names unchanged.
- **Watch, 14:03 to 14:34 UTC:** a second full reading at 14:34 UTC gave the same: fingerprint
  equal to `mg-expected-31`, the 39 table hashes equal to the backup's, health `ok`, 0 open jobs, 77
  cron runs since the push with 0 failed, 0 clean-up alerts, Edge Function versions unchanged. (The
  `revoke` phase of `cleanup-unattended-hosted-check.sh` now reports its two 30-migration checks as
  FAIL by design; the fingerprint is compared with `mg-expected-31` instead.)
- **Follow-up, 13 Nov:** the script now has a `gate` phase that expects this baseline: 31
  migrations, latest `20261102000100`, fingerprint `mg-expected-31-migrations.fp`, otherwise the same
  checks as `revoke`. Use `scripts/cleanup-unattended-hosted-check.sh gate <outdir>` for routine
  read-only checks; `revoke` stays as the historical 30-migration phase. Checked with `bash -n` and a
  fake `supabase` on PATH only; not yet run against hosted.

**Not verified:**
- Member access on the founder iPhone (Home, a profile, comments, search, a video reply room).
- A shared link playing logged out on `conga.churntech.com` in a browser.
- Onboarding end to end on production, which needs a new account and separate approval.
- The avatars listing finding (F3): still open, separate.

## 10. F3 fixed: `20261113000100_avatars_no_listing.sql` (13 Nov 2026; local only, nothing hosted)

**Finding (section 2):** `avatars: anyone can read` (role `public`) let anyone with the anon key
list the bucket: `POST /storage/v1/object/list/avatars` returned every account id with a photo, and
each folder every file in it, replaced photos included. Signed-in sessions, members or not, could
list every folder too. Severity: low to medium (privacy). It enumerates which accounts have a
photo and lets anyone collect every member's face during the closed beta. No write, no
authentication bypass, nothing beyond what a known photo URL already shows.

**Reproduced** on an isolated stack (`shortcut-art-sec`, 31 migrations from `5d362eb`; its
fingerprint equals `mg-expected-31-migrations.fp` line for line). Anon, a non-owner member and a
signed-in non-member each listed the root (all account ids) and another person's folder.

**Why the policy is narrowed, not dropped.** Measured with the policy dropped completely:
- Still working: public URLs, the app's upload (`upsert: false`, `app/src/lib/photo.ts`), the
  service role's list and remove (`avatar-cleanup`).
- Broken for the owner: listing their own folder returned nothing, an `x-upsert` re-upload was
  refused, and a Storage delete answered 200 but removed nothing.

The app uses none of these three today, but a silent no-op delete is a trap.

**The fix:** drop `avatars: anyone can read`; create `avatars: read your own folder` (SELECT, `to
authenticated`, `bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text`).
That is the same folder rule as the write policies. No function, grant, bucket setting or row
changes. The bucket stays public, so `/storage/v1/object/public/avatars/<path>` (the app's
`avatarUrl()`, the web player's `render.ts`) serves photos without RLS, as SPEC.md Section 9 wants.
Rollback: `supabase/rollback/20261113000100_avatars_no_listing.down.sql` recreates the old policy
exactly.

**Still possible after the fix, by design:** anyone who knows a photo's exact path can fetch it,
or its metadata through `/object/info` and `/object/authenticated` (a public bucket serves those
without RLS; measured). Photo paths are also intentionally returned by public and onboarding
endpoints, including `invite_preview` for a valid invite, and appear on shared web links. This
change prevents foreign-folder listing; it does not make photo paths or known-path reads private.

**Tests** (isolated stack, local only):
- **pgTAP `0038_avatars_listing.sql`, 31 tests:**
  - Negative: anon, a non-owner member and a signed-in non-member read no other person's rows.
    `storage.search` and `list_objects_with_delimiter` return no foreign folder, and the old
    policy is gone.
  - Positive: the owner reads and lists their own folder, inserts with `RETURNING` and upserts;
    the service role sees everything; deleting an account still queues its folder for
    `avatar-cleanup`.
  - On main it fails 17/31, which are the negative and structure cases.
- **Full pgTAP suite:** 28 files, 2003 tests, PASS.
- **Deno `avatar_cleanup_integration_test.ts`:** 3/3.
- **HTTP probe, 33 cases** (team evidence `T03`): 33/33 "before" on main, 33/33 "after" on the fix.
- **Rollback rehearsal:**
  - The down file gives back a fingerprint equal to `mg-expected-31`, and the probe matches
    "before" again.
  - Re-applying gives `av-expected-32-migrations.fp`, and the probe matches "after" again.

**Fingerprint:** the new baseline is `av-expected-32-migrations.fp`, 907 lines. It differs from
`mg-expected-31-migrations.fp` in exactly one line: the `anyone can read` policy is replaced by
`read your own folder`. After this deploy, `scripts/cleanup-unattended-hosted-check.sh gate` fails
its migration-count and fingerprint checks by design, as `revoke` did after the member gate. A
32-migration phase for that script is a separate tooling change.

### Deployment runbook (not run; needs Nemat's approval)

Run this as its own deployment. It touches no Mux table, job, secret or Edge Function, and no
`public` object.

**F0. Precondition (read only):**
- Hosted has 31 migrations, latest `20261102000100`.
- Its fingerprint equals `mg-expected-31-migrations.fp`, using
  `scripts/cleanup-unattended-hosted-check.sh gate <outdir>`.
- If either fails, stop.

**F1. Fresh preflight (read only, counts only, no ids):**
- `storage.objects` has exactly the four `avatars:%` policies. `anyone can read` is `{public}`,
  SELECT, `(bucket_id = 'avatars'::text)`.
- No other storage policy or bucket exists that this change ignores.
- Bucket `avatars` is public.
- `storage.search` and `storage.list_objects_with_delimiter` are not SECURITY DEFINER on hosted.
  The local stack runs storage-api v1.79.28, and hosted may differ.
- The number of `avatars` objects and of profiles with a `photo_path`.

**F2. Backup:**
- The migration changes one policy and no row.
- Save the `pg_policies` rows for `storage.objects` (name, roles, cmd, qual, with_check) and the
  hosted fingerprint before the deploy. These are enough to restore the policy. The rollback file
  reproduces it exactly (shown locally by the fingerprint).

**F3. Migration:**
- `git archive` the merged `main`'s `supabase/` into a scratch workdir.
- `supabase db push --linked --project-ref picvoavfxnajfjkqawju --workdir <scratch> --dry-run`
  must list exactly `20261113000100_avatars_no_listing.sql`. Anything else means stop.
- Then run it without `--dry-run`.

**F4. Verification, with no test account:**
- 32 migrations, and the fingerprint equals `av-expected-32-migrations.fp`.
- The F1 counts are unchanged.
- With the anon key, `POST /storage/v1/object/list/avatars {"prefix": ""}` gives 200 with 0
  entries. Print the count only.
- `GET /storage/v1/object/public/avatars/<an existing photo_path>` gives 200. Print the status
  only.
- Nemat on the founder iPhone: his profile photo shows on his profile and in the feed. Changing
  the photo is optional: it is his own write as a normal user, so only if he chooses.

**F5. If an F4 check fails:**
- Unlike G5, rolling back only reopens F3 (low to medium), and it restores the previous policy
  exactly.
- So Nemat may pre-approve: if photos stop loading or an upload fails, run the rollback file and
  delete the `20261113000100` row in `supabase_migrations.schema_migrations`, in one transaction.
- Otherwise, stop and report.
