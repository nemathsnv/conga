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
`pre_member_allowed_path` and to test 0037's expected list, or onboarding will get a 403.

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

## 7. Deployment plan (needs Nemat's approval; not done)

**Order: after the revocation migration.** The revocation runbook's D1 requires
`db push --dry-run` to list exactly `20261101000100`. If this branch were merged first, D1 would list
two files and be NO-GO. So:

- **Keep this branch separate** until the revocation deploy (D0 to D5 in
  `REVOCATION-FIX-PREFLIGHT.md`) is done and verified. That is planned for after the 3 Nov 04:45 UTC
  sweep answers 200.
- **Then merge** this branch onto the revocation branch's tip.

**G0. Preflight (read only):**
- 30 migrations, latest `20261101000100`, the fingerprint equal to `rv-expected-30-migrations.fp`.
- `pre_request` md5 `68e72efa…`.
- 0 accounts without a profile, or list them as aggregates and decide first.

**G1. Migration:**
- `git archive` `supabase/` into a scratch workdir.
- `supabase db push --linked --project-ref <ref> --workdir <scratch> --dry-run` must list exactly
  `20261102000100_member_gate.sql`.
- Run it without `--dry-run`. The migration is one transaction of `create or replace` and `revoke`,
  with no row change and no lock beyond the function catalog.

**G2. Checks (select):**
- 31 migrations.
- The fingerprint equal to `docs/release/mg-expected-31-migrations.fp`.
- `pre_member_allowed_path` not executable by anon or authenticated.

**G3. Live smoke:**
- **On the founder iPhone (member):** Home, a profile, comments, search. Nothing should change.
- **With a throwaway email (needs Nemat's OK to create one account):** sign in, then
  `get_onboarding_state` gives 200, `home_feed` gives 403 `profile_required`, `web_video` gives 200.
  Then delete the account (`delete_account` gives 204).
- **Logged out:** a shared web link still plays.

**G4. Rollback, if anything in G3 fails:**
- Run `20261102000100_member_gate.down.sql` in one transaction.
- Delete the `schema_migrations` row.
- Recheck that the `pre_request` md5 is `68e72efa…`.

**What does not interfere with the Mux migration:**
- the change touches no Mux table, function, job, schedule, secret or Edge function;
- it runs only after the revocation deploy.
