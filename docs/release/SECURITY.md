# Security, authentication and privacy (release review, 16 Oct 2026)

Agent C's review for the beta release: authentication, privacy (what each read path returns to whom),
the account lifecycle, least privilege, and the hosted provider configuration.

**Everything here is local.** It was built and tested on an isolated local Supabase stack
(`shortcut-c`, CLI 2.119.0, Postgres 17, Auth as bundled). Mux is stubbed. Nothing was pushed or
deployed, and the hosted project (`picvoavfxnajfjkqawju`) was never queried. No provider, secret or
real device was used. No app build was made, and no simulator was run.

## 1. Fixes made

| ID | What was wrong (reproduced locally first) | Fix | Commit |
|---|---|---|---|
| P1 | Any member could `GET /rest/v1/profiles`, `/follows` and `/comments` and read every row. That included the profile and comments of someone who had blocked them, and accounts in their 30-day deletion window. The follow graph was readable in full. | Members read only their own rows directly. The read functions are unchanged. | `141c99c` |
| P2 | `prompts.suggested_by` could be read for every prompt. That de-anonymised suggesters who had switched "Show my name on this prompt" off, prompts whose attribution a moderator had removed, and prompts from deleted accounts. | Column grants: `suggested_by` can no longer be read directly. | `141c99c` |
| P3 | A member's own `moderation_actions`, `review_requests` and `suggestions` rows showed the moderator's name and the internal `note`. | Column grants hide `moderator`, `note`, `decided_by` and `reviewed_by`. | `141c99c` |
| - | `TRUNCATE`, `REFERENCES` and `TRIGGER` were granted to `anon` and `authenticated` on 24 tables. RLS does not cover TRUNCATE, though PostgREST cannot send it. | Revoked. SELECT, INSERT, UPDATE and DELETE stay because RLS already denies writes, and existing tests depend on that. | `141c99c` |
| P4 | `prompt_card` faces (the face strip on every prompt card) ignored blocks, so the name and photo of a blocked person appeared in both directions. | Faces come from `video_visible(r, viewer)`. | `a4c418e` |
| P5 | Activity rows showed someone else's deleted, removed or reported video (caption, playback id) and the text of a reported comment. | Your own items always show. Someone else's show only while you could open them; otherwise the row is `status: 'unavailable'` with no playback id, caption or body. | `a4c418e` |
| P6 | The Activity badge (`activity_unread_count`) counted rows from blocked people and from accounts in the deletion window. | It now counts what `activity_list` counts. | `a4c418e` |
| P7 | Profile follower and following counts included accounts in their deletion window. | Those accounts are excluded. | `a4c418e` |
| L1 | `delete_account` left every session alive. | It deletes all `auth.sessions` of the account (refresh tokens cascade). | `ec60cd9` |
| L2 | Any `get_onboarding_state` call in the window restored the account. The app makes that call at every launch, so another phone that was still signed in cancelled the deletion without anyone signing in. | It restores only for a session that began after `deleted_at` (`session_started_at`: microsecond `auth.sessions.created_at`). | `ec60cd9`, `7b25697` |
| L3 | `delete_account`'s "signed in within 10 minutes" check read `iat`, which every refresh renews. | It reads the sign-in time (`amr` timestamp, which a refresh keeps). | `ec60cd9` |
| L4 | An access token kept working on the API until it expired (up to 1 h) after its session was signed out or deleted. Storage accepted avatar uploads from suspended and deleted accounts, because Storage does not go through `pre_request`. | `pre_request` refuses a token whose session no longer exists (`session_revoked`, 403). Avatar insert and update need a current session and an account that is neither suspended nor deleted. | `ec60cd9` |
| L5 | Avatar files were never deleted. A replaced photo, and every photo of a purged account, stayed publicly readable. | A queue (`avatar_removals`) is filled in the same transaction: replaced photos, uploads over an hour old that never became the photo, and the whole folder when an account row is deleted (however that happens). The new `avatar-cleanup` function removes them through the Storage API, run by pg_cron every 10 minutes and inert without its Vault secrets. Nothing is queued during the 30-day window. | `378b920` |
| X1 | Reflected XSS in the web player: `/i/<code>` wrote the code into an inline `<script>` through `JSON.stringify`, which does not escape `</script>`. | `scriptString()` escapes `< > &` and U+2028/2029. | `755694a` |
| A1 | The app built its client from `SUPABASE_URL \|\| 'http://localhost'`, so a missing URL silently targeted localhost. | `configError()` throws at startup. Outside `__DEV__` only `https://<20-char ref>.supabase.co` is accepted. LAN http still works in development. | `04197bc` |
| A2 | Sign-out never called `remove_push_token`, so the phone kept getting the previous account's pushes. Queued analytics events were later sent under the next account. Recent searches stayed on the phone. | `session.signOut` (every sign-out route goes through it) first runs `beforeSignOut()`: it removes the push token and flushes events, best effort and bounded at 3 s. When an account leaves the phone, `afterSignOut()` clears the event queue and recent searches. A `session_revoked` answer signs out locally. | `bdc1cd2` |

Also: `e0f4ff8` (an exact rollback) and `f9c47b4` and `9cc9c5a` (tests and the hosted smoke check).

**Server side for A2.** `remove_push_token(p_token)` deletes only the caller's own row, and
`pre_request` allows it while suspended. Deletion drops the account's tokens (`delete_account`), and
the purge cascades them. A suspended account keeps its tokens on purpose: it must receive the
suspension and review-outcome notices. If a token is still registered when another account signs
in, `register_push_token` moves it to that account (`on conflict ... do update`). So no new server
gap was found.

## 1b. Abuse limits (R1 to R3; migration `20261016000204`, functions `auth-signin-method`, `web`, `send-push`)

There is one fixed-window counter (`rate_limit_counters`). Keys are the client address or account
id, or the email or code stem, hashed with HMAC-SHA-256 and a random per-database salt
(`rate_limit_salt`). No address, email or code is stored. Old windows are pruned daily at 03:50 UTC.
Over a limit, every path gives an answer it already gives, so the app shows no new state.

| Rule | Limit | What it counts | Over the limit |
|---|---|---|---|
| `invite_client` | 10 per 15 min | Failed invite lookups (`not_found`, `expired`, `used`), per client address. When signed in, also per account (`check_invite`, `redeem_invite`). | Every lookup answers `{"status":"not_found"}`, valid codes included. That is W-Invalid, the same inline error as an unknown code. Nothing about the inviter is returned. |
| `invite_stem` | 100 per hour | Failed lookups per code stem (the part before the dash: `SC` for team codes, the first name for personal codes), all clients together. Bounds what many addresses can try. | The same `not_found`, for that stem only. |
| `signin_address` | 5 per 15 min | `auth-signin-method` lookups per email address (normalised). Every lookup counts. | `{"providers": []}`, with status 200: exactly what an address with no account gets. The app then sends the email code as usual, and the access token hook still refuses it for an Apple or Google account, which shows E-Code. |
| `signin_client` | 30 per 15 min | `auth-signin-method` lookups per client address. | The same `{"providers": []}`. |
| `web_event` | 60 per hour | Web player analytics events (`web_link_opened`, `web_signin_sheet_shown`) per client address. | The event is dropped. The page and the beacon's 204 are unchanged. |

Successful invite lookups are never counted, so opening a valid link repeatedly is not limited.
`invite_preview` and `check_invite` changed from `STABLE` to `VOLATILE` because they now write a
counter; the app calls them with POST, which is unaffected. `invite_lookup`'s old body is now
`invite_lookup_unlimited`, unchanged. All callers go through the limited `invite_lookup`.

**Changing a threshold** (service role, SQL editor). It takes effect immediately and needs no
migration:
```sql
update public.rate_limit_rules set max_hits = 20, window_seconds = 900 where rule = 'invite_client';
delete from public.rate_limit_counters where rule = 'invite_client';   -- optional: forget the current windows now
```

**The client address** comes from `cf-connecting-ip`, then `x-real-ip`, then the first
`x-forwarded-for` entry. That is `public.request_client_ip()` in the database and
`clientIp()` in `_shared/client.ts`. See risk 2.

**`send-push`** now compares `Authorization` with `PUSH_SENDER_KEY` in constant time
(`bearerMatches` in `_shared/client.ts`, also used by `avatar-cleanup`). It still refuses everything
when no key is set.

## 2. Verified safe (no change needed)

| Area | Evidence |
|---|---|
| No password path | Trigger `discard_auth_password`, the custom access token hook and `pre_request` were all exercised against real Auth. Results are in `scripts/auth-integration.mjs`, 52/52 (see 4). |
| One sign-in method per account | The `refuse_second_signin_method` trigger blocks a second provider. The hook refuses an email code on a Google account (the check passes). `enable_manual_linking = false`. |
| Suspension on every API path | pgTAP 0021 runs `pre_request` over every RPC a member can call. Only `delete_account`, `get_onboarding_state`, `remove_push_token`, `request_review` and `set_timezone` pass (the 8 Oct decision), and direct table reads are refused too. Against real Auth, a suspended token is refused on `home_feed`, still reads its state, and can still refresh. |
| `signin_providers_for_email` | Executable only by `service_role` (pgTAP 0001). |
| RLS on every table | All 32 public tables have RLS. Every policy is SELECT; there is no write policy anywhere. |
| `SECURITY DEFINER` hygiene | 193 of 202 functions are definers. All are owned by `postgres` and none is executable by `PUBLIC`; 79 are executable by `authenticated` (78 before, plus `avatar_write_allowed`). `anon` can run only `invite_preview`, `pre_request`, `web_prompt` and `web_video`. Every definer pins `search_path=''`. The two invokers without a pinned `search_path` (`suspended_allowed_path`, `decline_reason_text`) are immutable and touch no tables. |
| The app's raw reads | `app/src` reads exactly one table directly, its own `accounts` row (`public_disclosure_ack_at`). Everything else goes through RPCs and the Edge Functions. |
| Every member read path (blocked either way, deleted, removed, reported) | pgTAP 0021 checks 30 read paths (feeds, player, rooms, comments, profiles, follows, suggestions, Discover, search, place pages, Activity, invites) for any hidden username, playback id or comment text. It also checks the reply and comment counts the viewer can open. |
| Web player | Blocks do not apply there, by spec (16). Deleted and removed videos are unavailable (0021). |
| Secrets in the app | `git ls-files app` holds no service-role key, `sb_secret_`, JWT, Mux token or private key. `EXPO_PUBLIC_*` carries only the URL, the anon or publishable key, Google client ids, `DEV_TOOLS`, `FOUNDER_BUILD` and `WEB_BASE_URL`. The only committed env files are the `.env.example` files. |
| Avatars bucket | Public read; size 5 MB; JPEG, PNG or WebP only. Writes only inside `<uid>/`, and now only for an active account (L4). |
| Session refresh | Refresh works and keeps `amr`. Rotation is on, with a reuse interval of 10 s. |

## 3. Remaining risks, ranked

1. **Invite codes and E-Linked lookups are now limited, not closed (R1, R2).** The limits slow
   enumeration but do not make it impossible: an attacker with many addresses gets 10 failed invite
   lookups per address per 15 minutes, and 100 per code stem per hour in total. Each limited
   address, and each limited stem during an attack, also turns away legitimate people for the rest
   of its window (they see W-Invalid, or E-Code). The thresholds are the trade-off between the two;
   see section 1b. Longer generated codes would be the stronger fix, but they are a product
   decision (the spec's example is `PUTU-7K2`).
2. **Which header carries the client address on the hosted project is unverified.** The order is
   `cf-connecting-ip`, then `x-real-ip`, then the first `x-forwarded-for` entry. Locally the client
   can set the first `x-forwarded-for` entry itself. If it can do the same on hosted, each spoofed
   value is a fresh per-client bucket, and only the per-stem and per-address limits still hold.
   Check this on hosted with one request before relying on the per-client numbers.
3. **Deploy dependency: `postgres` must read auth.sessions.** On the hosted project, `postgres` must
   be able to `SELECT` and `DELETE` on `auth.sessions`. If `SELECT` is missing, every signed-in API
   request fails (`pre_request`). If `DELETE` is missing, `delete_account` fails. This is a hard
   preflight (see 6).
4. **Old phones after deletion or sign-out elsewhere.** A phone holding an access token for a
   deleted session gets `session_revoked`. `session.tsx` signs out locally when that comes back from
   `get_onboarding_state`. Since `b0b7295` (lead), `content.ts` also routes `session_revoked` to the
   same handler, so the phone returns to Welcome at the next refused call. Not seen on a device.
5. **Suspended authors' content stays visible to others.** The spec says only that the suspended
   person "can't use the app"; it does not say whether their responses stay up. This is unchanged,
   with no rule invented. **Needs Nemat.**
6. **Response counts ignore the viewer's blocks.** `response_count` and Discover's `recent_count`
   are viewer-independent by documented design (20261008000100: they would reveal the block). The
   8 Oct decision says counts on place pages, Discover and search "continue to respect block and
   report visibility". That is a possible mismatch. **Needs Nemat.** Follower counts follow the
   same rule and are now only cleaned of accounts in the deletion window.
7. **Avatars during the window.** For 30 days a deleted account's photo stays readable by anyone who
   already has its URL (`<uuid>/avatar-<ms>.jpg`). Recovery needs the file, so it cannot be deleted
   yet. Low.
8. **Email-code brute force and email budget.** The `token_verifications` limit is 30 per 5 min per
   IP, against a 6-digit code valid for one hour (Nemat, 9 Oct). Hosted email sending is limited to
   30 an hour for the whole project, so a flood of code requests can delay real ones. Medium-low;
   CAPTCHA would need a board.
9. **A stale email account blocks Google or Apple sign-in.** Typing someone's address on O-Email
   creates an unconfirmed email user. If that person later uses Google or Apple with the same
   address, the trigger refuses it as `signin_method_conflict:email`, and E-Linked sends them to
   email (which works, because they own the inbox). This is a nuisance, not a takeover. It was not
   reproducible without real providers; check it on the hosted project when providers are enabled.
10. **The web player has small exposures.** It loads `hls.js@1` from jsDelivr with no pinned version
    and no SRI. It serves `Cache-Control: public, max-age=60`, so a deleted video's page can linger
    in shared caches for up to 60 s (spec: "disappears everywhere at once"). Low. (The event beacon
    is now limited: R3.)
11. **Further low items:**
    - `has_profile(uuid)` is callable by any member.
    - `net.*` and `cron.*` functions are executable by the API roles, but their schemas are not
      exposed by PostgREST. Confirm on the hosted project that `pg_graphql` is not installed.
    - Unconfirmed sign-ups are never cleaned up (open since 9 Oct).
    - No Auth session timebox.

## 4. Tests run (local stack `shortcut-c`, 16 Oct)

| Suite | Result |
|---|---|
| pgTAP, all files (`supabase test db` in the stack folder) | **1412/1412**. Baseline before my work: 1219/1219. New files: 0020 (47), 0021 (74), 0022 (46), 0023 (26). |
| pgTAP with the rollback files applied | 0020: 42 of 47 fail. 0021: 26 of 74 fail. 0022: cannot run (the functions do not exist). So the tests detect the old behaviour. |
| Rollback | The four rollback files, applied in reverse, give a catalog fingerprint (function bodies and grants, policies, table and column grants) identical to a build from the 19 earlier migrations. The migrations then apply again, and pgTAP passes 1412/1412. |
| `scripts/auth-integration.mjs` | **52/52** (37 before; 15 new lifecycle checks). The first run after the change found the same-second restore bug (51/52); fixed in `7b25697`. |
| Deno `mux_test` + `cleanup_unit_test` | 32/32 |
| Deno `integration_test` | 20/20 |
| Deno `uploads_integration_test` | 32/32 |
| Deno `idempotency_integration_test` (with `DB_CONTAINER`) | 12/12 |
| Deno `abandon_integration_test` | 12/12 |
| Deno `cleanup_integration_test` (Agent A's), unchanged | **24/28**. Four tests "sign back in" with the token that deleted the account, which L1/L2 now refuse by design. |
| Same file with the patch below | 28/28 |
| Deno `avatar_cleanup_integration_test` (new) | 3/3, with real Storage uploads, a replacement and a purge |
| App: `tsc --noEmit`, `eslint src`, Jest | Clean, clean, 258/258 (19 suites; new: `supabaseConfig` 6, `accountCleanup` 6) |
| `deno check` and `deno lint` on `web`, `avatar-cleanup` and the new test | Clean |

**Abuse limits (R1 to R3), on the integration branch at `00ad798` plus `20261016000204`:**

| Suite | Result |
|---|---|
| pgTAP, all 22 files | 1656/1662. New 0024 (40) passes. The 6 failures are all in Agent A's `0014_submission_account_lifecycle.sql`: its fixture deletes without an amr sign-in, which `20261016000202` requires. The lead is fixing that test. |
| Rollback of `20261016000204` | The catalog fingerprint is identical to a build without it (Agent D's `…0300` and `…0301` present in both). |
| Deno `client_test` (new) | 3/3 |
| Deno `signin_method_integration_test` (new, handler in-process) | 3/3 |
| Deno `web_beacon_integration_test` (new, through the served `web` function) | 1/1 |
| Deno `avatar_cleanup_integration_test` | 3/3 |
| Deno `mux_test`, `cleanup_unit_test`, `integration_test` and `cleanup_integration_test` (A's, now patched by the lead) | 80/80 |
| `scripts/auth-integration.mjs` | 52/52 (E-Linked goes through the limited lookup) |
| `deno check` and `deno lint` on `web`, `send-push`, `avatar-cleanup`, `auth-signin-method`, `_shared/client.ts` and the new tests | Clean |

**Not run:**
- `send-push` against Expo. Only the shared key check is unit-tested; the function itself has no test harness.
- `scripts/scheduler-integration.sh`, `c1-rehearsal.sh` and `idempotency-rollback-check.sh`.
- `PHASE=legacy-setup` of auth-integration (it needs the hook off and an Auth restart).
- Real Apple or Google sign-in.
- Anything on the hosted project.
- Any device or simulator.
- The app's screens with the new sign-out cleanup. The logic is unit-tested only.

**Patch for Agent A's `supabase/functions/_tests/cleanup_integration_test.ts`** (applied by the
lead in `b0b7295`):
- Add a `signInAgain(m)` helper: an Admin `generate_link` code, then `/verify`, which replaces
  `m.token`.
- Use `rpc(await signInAgain(x), "get_onboarding_state")` at the four "signs back in" calls (sam,
  dee, ama, bo).

## 5. Hosted provider configuration checklist (prepared, not applied)

**Apple (Sign in with Apple)**
- [ ] In the paid Apple Developer team: enable the App ID capability for `app.shortcut`. Create a
      **Services ID** for the web flow that Android uses. Set its return URL to
      `https://picvoavfxnajfjkqawju.supabase.co/auth/v1/callback`.
- [ ] Create a **Sign in with Apple key** (`.p8`) and note the Key ID and Team ID. Keep the `.p8`
      offline; never commit it.
- [ ] Generate the **client secret JWT** (ES256: `iss` = Team ID, `sub` = Services ID,
      `aud` = `https://appleid.apple.com`, `exp` at most 6 months). **Put a rotation reminder in the
      calendar about 5 months out**: when it expires, Android Apple sign-in fails.
- [ ] `supabase/.env`:
      - `SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID=app.shortcut,<services id>` (native first).
      - `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET=<jwt>`.
- [ ] Remove `[remotes.hosted.auth.external.apple] enabled = false`, or set it to `true`.

**Google**
- [ ] OAuth clients: an **iOS** client (bundle `app.shortcut`; its reversed id goes in
      `GOOGLE_IOS_URL_SCHEME`), a **Web** client (whose id Supabase verifies; used on Android), and
      an Android client (package and SHA-1 of the release and EAS keys).
- [ ] `supabase/.env`:
      - `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<web id>,<ios id>`.
      - `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=<web client secret>`.
- [ ] `skip_nonce_check = true` stays: native ID tokens have no nonce. The accepted risk is that a
      Google ID token issued for *our* client ids can be replayed within its lifetime.
- [ ] Remove the `[remotes.hosted.auth.external.google]` override, or set it to `true`.
- [ ] The app's `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` are public
      ids, never the secret.

**SMTP (Resend)**
- Already configured in the dashboard on 9 Oct: `smtp.resend.com:465`, sender
  `no-reply@auth.churntech.com`, rate limit 30 an hour.
- [ ] Before declaring `[auth.email.smtp]` in `config.toml`, change `[auth.rate_limit] email_sent`
      from 2 to the intended value (30, or higher on a paid Resend plan). Otherwise a push sets the
      hosted limit to 2 an hour.
- [ ] Add SPF, DKIM and DMARC for the sending domain (DMARC still pending, section 2 of
      BETA-READINESS).

**Rate limits and hooks**
- [ ] Keep `max_frequency = 60s`, `otp_length = 6`, `otp_expiry = 3600` and Confirm email on
      (Nemat, 9 Oct).
- [ ] The custom access token hook stays `pg-functions://postgres/public/custom_access_token_hook`.
      It must exist before it is enabled (it already does on the hosted project).
- [ ] Optional, needs Nemat: an Auth session timebox or inactivity timeout (none today).

**Expected `supabase config diff --project-ref picvoavfxnajfjkqawju`**
- My work changes **no Auth, API, DB or Storage setting**. The only `config.toml` edit adds
  `[functions.avatar-cleanup] verify_jwt = false`, which `config diff` does not compare; it takes
  effect at `functions deploy`.
- So the diff should be the same as it was after 9 Oct: no differences in declared properties, plus
  the six undeclared SMTP properties.
- After the Apple and Google steps above, the diff should show only
  `auth.external.apple.enabled/client_id/secret` and `auth.external.google.*`.
- Read it before any push. Never use `--yes`.

## 6. Deploying my migrations and functions (when Nemat approves; in order)

1. **Read-only preflight (SQL editor):**
   ```sql
   select has_table_privilege('postgres', 'auth.sessions', 'select') as s,
          has_table_privilege('postgres', 'auth.sessions', 'delete') as d;  -- both must be true
   select count(*) from pg_extension where extname = 'pg_graphql';         -- 0 expected; if 1, the same RLS applies through /graphql/v1
   select policyname from pg_policies where schemaname = 'storage' and policyname like 'avatars:%';  -- 4, as created on 9 Oct
   ```
   Stop if `s` or `d` is false.
2. **Conflicts with other agents' migrations.** Mine redefine:
   - `prompt_card`, `activity_row`, `activity_unread_count`, `get_profile`;
   - `pre_request`, `delete_account`, `get_onboarding_state`;
   - the two avatar write policies;
   - `invite_lookup` (204 renames the old body to `invite_lookup_unlimited`), and the volatility of
     `invite_preview` and `check_invite`.

   Any later migration (Agent D's `20261016000300`+) that redefines one of these must start from
   my version: for example, keep the `session_is_current()` check in `pre_request`. Agent A's block
   (`…0100`–`0199`) runs before mine; if it redefines any of them, mine overwrite it, so merge.
   The column grants on `moderation_actions`, `review_requests` and `suggestions` mean that a
   moderator UI reading those tables as `authenticated` would not see `moderator`, `note`,
   `decided_by` or `reviewed_by`. The admin should read them with the service role (Agent D, check).
3. `supabase db push --dry-run`: exactly `20261016000200` to `20261016000204` (with the other
   agents' files, if they are going too). Then `db push`.
4. Patch Agent A's `cleanup_integration_test.ts` (section 4) in the same change, or its four
   recovery tests fail.
5. **After** the migration, because they call its new RPCs:
   - `supabase functions deploy web` (the XSS fix and the beacon limit);
   - `supabase functions deploy auth-signin-method` (the limits);
   - `supabase functions deploy avatar-cleanup --no-verify-jwt`.

   `supabase functions deploy send-push --no-verify-jwt` (the constant-time key check) can go at any
   time. Deploy each by name, never `--prune`. A `web` or `auth-signin-method` deployed before 204
   answers without events, or with `lookup_failed`.
6. Avatar clean-up on (it can wait; names simply queue):
   - `supabase secrets set AVATAR_CLEANUP_KEY=<long random>`.
   - `select vault.create_secret('https://<ref>.supabase.co/functions/v1/avatar-cleanup', 'avatar_cleanup_url');`
   - `select vault.create_secret('<the same string>', 'avatar_cleanup_key');`
7. Check:
   - `SESSION_GATE=1 node scripts/hosted-auth-smoke.mjs` (Nemat, own address).
   - Read-only: the four policies, the `avatar-cleanup` and `prune-rate-limit-counters` cron jobs,
     `select count(*) from public.avatar_removals`, and `select * from public.rate_limit_rules`.
   - Which header carries the client address (risk 2): one invite preview from a known address,
     then `select rule, hits from public.rate_limit_counters`. Two calls from one phone should
     land in one bucket.
8. **App.** The server changes work with the installed founder build: its delete flow signs in again
   before deleting, and it signs out afterwards. A new build is needed only for the A1 and A2 fixes.
9. **Rollback.** The files in `supabase/rollback/2026101600020{4,3,2,1,0}_*.down.sql`, in that
   order, each in one transaction. Before 204's rollback, redeploy the previous `web` and
   `auth-signin-method`. Then delete the `schema_migrations` rows. Sessions already ended stay
   ended.

## 7. Files outside my ownership that I touched

- `supabase/tests/0001_onboarding.sql`, `0003_conversation.sql`, `0004_safety.sql` and
  `0010_video_deletion.sql`: fixture lookups and the modelling of "signs back in", to match P1 and
  L1-L3.
- `supabase/functions/web/index.ts`: the XSS fix.
- `supabase/config.toml`: `[functions.avatar-cleanup] verify_jwt = false`.
- `app/src/lib/notifications.ts`, `analytics.ts` and `recentSearches.ts`: the sign-out helpers
  `unregisterPushToken`, `clearQueue` and `clearRecent`.
- `supabase/functions/web/index.ts` (the beacon limit), `send-push/index.ts` (the constant-time key
  check) and the new `_shared/client.ts`.
