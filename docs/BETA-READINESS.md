# Beta readiness: everything still open before the closed beta

Consolidated from `docs/BLOCKERS.md` (B-1 to B-4 and the Gate 5 list), the phase reports and
`docs/DECISIONS.md`, as of 9 Oct 2026. Phase 1 (the video spike) ran on a real iPhone 17 Pro; its
Android run is outstanding, and Mux and expo-camera are the provisional stack. Every phase from 2 to 7
is **implemented, awaiting real-device verification**. No gate has been passed: Gate 1, Gate 2,
Gate 5 ("safety complete; required before any outside tester") and Gate 7 ("the closed beta opens
in Canggu") are all open and are Nemat's decisions. Nothing below is marked done unless its check has actually been run; "seen on the
simulator" is not "verified on a device".

Status words: **open** (nothing done), **built, unverified** (code exists, the check has not been
run on a device), **partly verified** (some of the check has run on a device; the rest is listed),
**needs input** (waits on something outside the repository).

## 1. Code remaining

| Item | Status | What is left | Check that closes it |
| --- | --- | --- | --- |
| B-1 Camera flip during a take (SPEC.md Section 6; Nemat, 6 Oct) | open | The recorder records one segment per camera and a local module stitches them (iOS `AVMutableComposition`, Android Media3 `Transformer`); upload stitches before sending; review plays the stitched file. The flip control is disabled while recording today and nothing pretends otherwise. | Real iPhone and Android: record, flip twice mid-take, stop; review and the live response play one continuous clip with sound across the joins. |
| B-3 app-link wiring in the app | needs input, then code | `associatedDomains` and `intentFilters` in `app.config.ts`, `EXPO_PUBLIC_WEB_BASE_URL` set to the domain, the two association files served (see section 6). | Part of the B-3 check in section 6. |
| Settings rows with no destination | needs input, then code | Community guidelines, Privacy policy, Terms, Help and feedback rows and the `A-Removed` guideline link are drawn and inactive; they are wired once the URLs or address exist (section 4). | Each row opens its document; `A-Removed` opens the guidelines. |
| Moderation web admin | open | A small internal web admin over the `mod_*` functions (queues, actions, the log, suggestion review). The CLI `scripts/moderate.sh` is development-only. See section 7. | A moderator handles a report, a review request and a suggestion from the admin without the CLI. |
| Post refused while creating the row (security stage 2 follow-up) | open | When the server refuses the post itself for a reason other than a restriction or a stale upload URL (for example `already_responded`, `prompt_not_found`, `video_not_found`), or the connection drops at that step, Post Review still only logs it: Post does nothing visible. Pre-existing; left out of stage 2 by decision (Nemat, 12 Oct). Needs a decided state or copy. | Each refusal shows something on Post Review or Home; nothing is silent. |
| Restricted on Retry (security stage 2 follow-up) | open | A post that never got a row (an upload limit at Post) and is retried after the member has been restricted or suspended shows the Upload failed banner's generic line, not A-Restricted or LV-Suspended. Rare; left out of stage 2 by decision (Nemat, 12 Oct). | Retry by a restricted member opens A-Restricted; by a suspended one, LV-Suspended. |
| Deleted reply stays in Me → Replies (seen 12 Oct, stage 3 step 4A) | open | After Nemat deleted a test video reply on the iPhone (founder build `ede68ed`), its card stayed in Me → Replies; opening it showed "This video is not available."; it was gone only after the app restarted. The server is right (`profile_replies` no longer returns it, `get_video` answers `unavailable`); the app does not refresh the profile's lists after `delete_video` (only Home is marked dirty). Not fixed during the security verification (Nemat, 12 Oct). | Delete your own reply (and response): it leaves Me → Replies (and Responses) at once, without a restart. |
| App icon | needs input (branding) | The Expo template icon is development-only and must not go to outside testers or the stores (Nemat, 9 Oct). Replaced once the name and brand are approved (section 5). | The icon in `app/assets` is the approved one before any outside build. |

Everything else in SPEC.md Sections 3 to 21 is built. No feature phase remains; Nemat asked for no
new feature work after phase 7.

## 2. External credentials and accounts

| Item | Status | What is needed | Check |
| --- | --- | --- | --- |
| Expo account and project id (B-2, B-4) | needs input | `eas init` on Nemat's Expo account; `EAS_PROJECT_ID` in `.env`. Without it the app mints no push tokens and no EAS build runs. | `eas build --profile preview` starts; `registerTokenIfAllowed` registers a token. |
| Paid Apple developer team (B-1, B-2, B-3, B-4) | needs input | Signing, APNs key, associated domains, Sign in with Apple on a real device, TestFlight. | A preview build installs on an iPhone from TestFlight or an internal link. |
| Google Play developer account (B-4) | needs input | Signing and internal testing track. | A preview build installs on an Android phone from the internal track. |
| APNs key and FCM service account (B-2) | needs input | Added to the EAS project; the `send-push` secrets (`PUSH_SENDER_KEY`, the two Vault secrets from `supabase/README.md`) set per environment. | A video reply from another account arrives as a push with the spec's text on both platforms; Pause all stops it; comments within 10 minutes arrive as one notification. |
| Google Sign-In credentials | needs input | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `GOOGLE_IOS_URL_SCHEME` for the hosted project; without them the plugin is left out and the Google button fails with a configuration error. | Google sign-in completes on both platforms, including the E-Linked case. |
| Hosted Supabase project (`picvoavfxnajfjkqawju`) | needs input (15 migrations applied; the 14th, `20261011000100`, on 12 Oct, section 13; the 15th, `20261012000100`, on 12 Oct, section 14) | Done 9 Oct (section 9): the 12 migrations `20261006000100` to `20261010000200` applied with `supabase db push`, schema verified equal to the local stack. Done 9 Oct (section 10, hosted steps 1 and 2): the auth hardening migration `20261010000300`, and the Auth configuration with the access token hook on, 6-digit codes and the code-only emails. Still open: `send-push` and `web` and the `send-push` Vault secrets (deployed: `auth-signin-method` 10 Oct, section 10; `mux-webhook`, `mux-create-upload`, `mux-upload-status` 10 and 11 Oct, section 12, redeployed 12 Oct, sections 13 and 14), reference data that today only exists in `seed.sql` (topics, the other places, place neighbours), the app's `.env` pointed at it. | pgTAP is local-only; the check is the device run in section 3 against the hosted project. |
| Mux credentials for the hosted project | done 10 Oct; check passed 11 Oct on the founder iPhone (section 12); spike tokens not yet revoked | Token and webhook secret in the function env; uploads minted server-side only. Since 10 Oct the hosted project uses its own "Shortcut Beta" Mux environment and token (section 12); the spike pair is no longer on the hosted project but is still valid in Mux and still in the local `supabase/functions/.env`. | A posted response goes live through the hosted stack. |
| Email provider for sign-in codes and waitlist emails | needs input (provider decided: Resend, Nemat 9 Oct) | A sending domain that is not a Conga domain; the Resend account, its DNS records (SPF, DKIM, bounce MX, then DMARC) and a send-only API key; the SMTP settings on the hosted project (section 10). Free plan: 100 emails a day, 3,000 a month. 9 Oct: domain `auth.churntech.com` verified in Resend and SMTP saved in the hosted dashboard by Nemat (sender `no-reply@auth.churntech.com`, name Shortcut); no email delivered or checked yet. | A code arrives within a minute on Gmail, Outlook, iCloud and a Bali address; a waitlist admission email arrives. |

## 3. Real-device verification

The real-device runs so far, all on Nemat's iPhone 17 Pro: the phase 1 spike (a throwaway app in
`spike/`), `spike/REPORT.md`; the founder build against the hosted project, onboarding on 10 Oct
(section 11) and the first video recorded, uploaded, published and played on 11 Oct (section 12).
Android has never been run at all (no device, no emulator), for the spike or the app.
Each phase report lists what was seen on the iPhone 17 simulator and what was not.

| Phase | Status | Not yet run anywhere |
| --- | --- | --- |
| 1 Video spike (`spike/REPORT.md`) | iPhone run on a device; Android open | The spike checklist (`spike/CHECKLIST.md`) on a real mid-range Android over Bali mobile data, needed for Gate 1. |
| 2 Foundations (`docs/PHASE-2-REPORT.md`) | built, unverified | Google sign-in; Apple sign-in on a device; the invite link redeemed after sign-in; the image picker; keyboard behaviour; Android entirely. |
| 3 Core loop (`docs/PHASE-3-REPORT.md`) | partly verified (founder iPhone, 11 Oct, section 12) | Done: record, upload, publish and play one response on the founder iPhone build against the hosted project. Still to run: the same over Bali mobile data (the network was not confirmed); a second account seeing and playing it; Android; B-1. |
| 4 Conversation (`docs/PHASE-4-REPORT.md`) | built, unverified | Pushes end to end (B-2); the second notification ask on a device. |
| 5 Safety (`docs/PHASE-5-REPORT.md`) | built, unverified | Report, block and delete end to end; re-authentication with Apple and Google; account deletion with the email code; enforcement notices by push; link previews and opening the app from a link (B-3). |
| 6 Places and suggestions (`docs/PHASE-6-REPORT.md`) | built, unverified | Recording and uploading a first-response draft; the header Next buttons on C-Write and C-Scope (covered by the dev-menu button on the simulator); the pin label on Home and in the player; P-Unfollow; SR-None's suggest link; pushes for the new kinds. |
| 7 Beta readiness (`docs/PHASE-7-REPORT.md`) | built, unverified | A-Offline (the simulator's connection cannot be cut cleanly); Post tapped offline then the connection returning; the invite link opened from a message; events' client timestamps across a timezone change; a real store build. |

**Check.** One pass of every board on an iPhone and an Android phone against the hosted project,
over Bali mobile data for recording and playback, by two accounts that reply, comment, follow,
report and block each other. Each phase's "Not verified" list is the checklist.

## 4. Policy and legal

| Item | Status | What is needed | Where it lands |
| --- | --- | --- | --- |
| Community guidelines | needs input (SPEC.md Section 24) | The document and a URL. | `S-Settings` row; `A-Removed` "Read the Community Guidelines". |
| Privacy policy | needs input | The document and a URL; must describe the first-party analytics (pseudonymous per-account id, no SDK, nothing leaves Supabase: Nemat, 9 Oct), the 30-day deletion window and the moderation log. | `S-Settings` row; the store listings. |
| Terms | needs input | The document and a URL. | `S-Settings` row; the store listings. |
| Data rules | needs input | Retention for `analytics_events`, `moderation_actions`, reports and the push outbox; who on the team may read the events table. | `supabase/README.md` and the privacy policy. |
| Store age ratings | needs input | The questionnaire answers for App Store Connect and Play Console (18+ beta, user-generated video, no ads). | The store listings. |
| Help and feedback destination | needs input | An address or a form. | `S-Settings` row. |

## 5. Branding and store assets

| Item | Status | What is needed |
| --- | --- | --- |
| Product name and brand | needs input (Nemat, 9 Oct) | Approved before the icon, the listings or any outside build. |
| App icon | needs input | The approved icon in every required size; replaces the Expo template icon in `app/assets` (development-only today). |
| Splash screen | built, unverified | Plain black with no image, because no board exists; confirm or design one. |
| Welcome collage and placeholder faces | needs input | `app/assets/dev-placeholders/` holds the boards' placeholder photos (development-only, `src/ui/devPlaceholders.ts`); the production source is Nemat's decision. |
| Store listing text and screenshots | needs input | Name, subtitle, description, keywords, screenshots per device size, support URL. |

## 6. Web and domain

| Item | Status | What is needed | Check |
| --- | --- | --- | --- |
| Domain (B-3) | needs input | Choose and buy the domain (`shortcut.app` in the spec); DNS or a CNAME through a small proxy to the `web` Edge Function. | The web player opens on the domain. |
| Universal links and app links (B-3) | needs input, then code | `apple-app-site-association` and `assetlinks.json` served from the domain; `associatedDomains` and `intentFilters` in `app.config.ts` (needs the paid Apple team). | A shared link opens the app on a phone with it installed, the web page otherwise. |
| Link previews (B-3) | built, unverified | Open Graph tags are rendered by the function. | The preview shows the thumbnail, prompt and name in a messaging app. |
| `EXPO_PUBLIC_WEB_BASE_URL` | needs input | Set to the domain so share links and the invite link stop pointing at the Supabase function URL. | S-Invites shows `<domain>/i/<code>`. |
| Web player on the hosted project | built, unverified | Deploy `web` with `STORE_URL` and `WAITLIST_URL`. | `/r`, `/p`, `/i`, `/u` render on the hosted URL; `noindex` present. |

## 7. Moderation operations

| Item | Status | What is needed |
| --- | --- | --- |
| Moderation web admin | open (Nemat, 8 Oct: required before the first outside tester) | A small internal web page over `mod_reports_queue`, `mod_reviews_queue`, `mod_suggestions_queue`, the `mod_*` actions and `mod_log`, behind team sign-in. |
| Moderators and rota | needs input | Who moderates during the beta (the founder and team, per the spec), with no public response-time promise. |
| Enforcement texts and the guidelines | needs input | The notices refer to the Community Guidelines (section 4). |
| Automated checks on uploads | open decision (SPEC.md Section 22) | None today; human review is the default. Decide whether a nudity and violence scanner is wanted before the beta. |
| Waitlist admission and team invites | built, unverified | `team_admit_from_waitlist` and `team_create_invite` exist for the service role only; a team workflow (who admits, how the email goes out) is not defined. |

## 8. Hosted project security

**Spike Mux functions removed from `picvoavfxnajfjkqawju` (9 Oct, Nemat approved).** The exposure
was deployed, not only in the old source. `mux-create-upload`, `mux-upload-status` (both deployed
6 Oct 07:13 WITA) and `mux-delete-assets` (6 Oct 14:35 WITA) were ACTIVE with `verify_jwt = false`, no
check in the code, CORS `*` and the shared Mux credentials set; the deployed source was byte-identical
to `spike/supabase/functions/`. An empty POST to `mux-delete-assets` would have listed and deleted up
to 100 Mux assets; `mux-create-upload` minted public-playback upload URLs for anyone. All three were
deleted with `supabase functions delete`; afterwards the function list was empty, each URL returned
`404 NOT_FOUND`, the Mux asset list was unchanged (the same 7 spike assets, same ids, status and
playback ids) and the project secrets were unchanged. Not checked: the function invocation logs for
calls between 6 and 9 Oct (dashboard, Edge Functions, Logs; the functions are gone, so the logs may
only be in Logs Explorer). The hosted Mux secrets were replaced with a separate product environment's
token on 10 Oct (section 12); the spike token itself is not revoked yet. The spike app's clean-up, upload and status
calls no longer work against the hosted project; `spike/` is unchanged.

## 9. Hosted database (9 Oct, Nemat approved)

**Migrations applied to `picvoavfxnajfjkqawju`** (ap-southeast-1, Postgres 17.11) with
`supabase db push --linked --yes`; all 12 recorded as applied, in order, no seed and no roles.

- **Before.** Hosted database empty: no objects in `public`, 0 auth users, 0 buckets, no migration
  table. `authenticator` settings were `session_preload_libraries=supautils, safeupdate`,
  `statement_timeout=8s`, `lock_timeout=8s`. No backups and no point-in-time recovery on the project.
- **After, compared with the local stack built from the same 12 files** (one read-only catalog
  query on both): identical tables and RLS flags, functions (including body hashes, owner,
  `search_path` and execute grants), policies, triggers, bucket, extensions, cron jobs, table and
  schema grants, default privileges and the `authenticator` setting.
  - 25 tables, all with RLS; 20 policies on `public` tables and 4 on `storage.objects`; no views.
  - 154 functions, 150 `SECURITY DEFINER`, all owned by `postgres`, every definer one with a fixed
    `search_path`; none executable by `PUBLIC`; `anon` can execute only `invite_preview`,
    `pre_request`, `web_prompt`, `web_video`; 77 executable by `authenticated`; 77 service role only.
  - 14 triggers in `public`; `on_auth_user_created` on `auth.users` and
    `refuse_second_signin_method` on `auth.identities`, both enabled.
  - Bucket `avatars` (public, 5 MB, JPEG, PNG, WebP). `pg_cron` (`pg_catalog`), `pg_net` (`public`).
  - Cron: `send-push` every minute, `tonight-prompt` every 10 minutes, `purge-deleted-accounts`
    daily 03:15 UTC (11:15 WITA); all active. `send-push` does nothing until the Vault secrets exist.
  - `authenticator` now also has `pgrst.db_pre_request=public.pre_request`.
  - Data: 1 `app_config` row, cohort `canggu`, place `canggu`; 0 invites, 0 prompts, 0 topics,
    0 place neighbours, 0 accounts.
- **Security advisor (hosted), 89 findings, no errors, nothing changed.** 77 `authenticated` and 4
  `anon` `SECURITY DEFINER` functions executable (the app's RPC API by design; the four `anon` ones
  return only an invite preview or live, visible videos); 5 tables with RLS and no policy
  (deny-all by design, written only by definer functions); 2 `search_path` warnings on
  `suspended_allowed_path` and `decline_reason_text` (immutable lookups, no table access); `pg_net`
  registered in `public` (its functions live in schema `net`, which the API does not expose).
- **Not done:** Edge Functions, secrets, Vault, Auth configuration, Mux. `spike/supabase/.temp`
  was removed on 9 Oct so the spike is no longer linked to this project.

## 10. Email sign-in (9 Oct; hosted: migration applied, Auth configuration pushed)

**Reproduced on the local stack** with `scripts/auth-integration.mjs` (`PHASE=before`, 29 of 29
observations as described):

- **Password pre-registration.** Auth's email provider accepts password sign-up on the public API.
  Someone signs up another person's address with their own password; when that person later signs
  up with an email code, the first person's password signs into their account.
- **Passwords added later.** A signed-in session (or a stolen one) can set a password through the
  Auth API and use it from then on. SPEC.md Section 13: no passwords.
- **One sign-in method per account (SPEC.md Section 18).** An email code signs into an account that
  uses Google: Auth adds no identity, so the `refuse_second_signin_method` trigger never runs. Only
  the app's own E-Linked check stood in the way.

**Fixed locally**: migration `20261010000300_auth_hardening.sql` and `supabase/config.toml`.

- No password is ever stored (`discard_auth_password` trigger on `auth.users`).
- The custom access token hook (`custom_access_token_hook`, run by Auth for every access token,
  refreshes included) issues no token when the session used a password, and none when an email
  code (or recovery) is used on an account whose sign-in method is Apple or Google
  (`signin_method_conflict:<provider>`).
- `pre_request` refuses any API token whose session used a password, which also covers access
  tokens issued before the hook was on.
- Auth settings: six-digit codes, one-hour expiry, 60 s between emails to one address, Confirm
  email on. New accounts get the confirmation email, returning ones the magic link email, and a
  recovery request gets the same email: all three use `templates/sign_in_code.html` (code, no link).

**Local checks.** pgTAP 400 of 400 (29 new in `0007_auth_hardening.sql`). Integration 41 of 41:
new account by code (confirmation template), returning account (magic link template), recovery
email, wrong code refused, second code within 60 s refused, refresh keeps the session, product
API call, password sign-up stores no password and cannot sign in before or after the owner
confirms, a password set later is not stored, an email code is refused on a Google account and
adds no identity, `auth-signin-method` still reports `google` for E-Linked. A password account and
session made with the hook off (as one could exist before the fix): the refresh is refused by the
hook, the old access token by `pre_request`, a new password sign-in by the hook; the stored
password itself is blocked, not erased. Jest 54 of 54, typecheck and lint clean; no app code changed.

**Not tested.** Real Apple and Google sign-in (no credentials locally; the hook's `oauth` path is
covered in pgTAP only). Delivery through Resend. The app's screens on a simulator or phone against
these settings (the integration test calls the same Auth endpoints the app calls).

**Still open.**

- `auth-signin-method` tells anyone holding the public key whether an address has an account and
  with which provider, with no rate limit. E-Linked needs the answer; a limit needs a decision and
  has no approved state on O-Email.
- Email budget: anyone with the public key can request codes for any address. Once custom SMTP is
  on, Auth sends at most 30 emails an hour for the whole project (adjustable) and Resend Free 100 a
  day, so a flood can delay real sign-in codes. CAPTCHA would need a board.
- Accounts started and never confirmed (code requested, or a password sign-up) stay in
  `auth.users` with an `accounts` row; nothing removes them.
- `auth-signin-method` accepts only the key its runtime gets as `SUPABASE_ANON_KEY`. On the local
  stack that is the legacy anon key; on the hosted project it is the publishable key
  (`sb_publishable_...`, found 10 Oct). So the app has to send the publishable key to the hosted
  project, or the function has to change (decision pending, below).
- The hook is in every sign-in: if it errors, nobody can sign in. It is small and tested; the order
  below matters.
- The email copy below was approved by Nemat on 9 Oct, as it stands in
  `templates/sign_in_code.html`.

**Proposed email** (all three templates; sender name and address come with Resend):

> Subject: Your Shortcut sign-in code
>
> **Your Shortcut sign-in code**
> Enter this code in the app to sign in:
> **123456**
> The code expires in one hour.
> If you didn't ask for this code, you can ignore this email.

**Hosted steps, in order, each waiting for Nemat's approval** (steps 1 and 2 done 9 Oct; step 4: SMTP
saved by Nemat, delivery to Gmail checked; step 3 deployed 10 Oct):

1. **Done 9 Oct (Nemat approved).** `supabase db push --dry-run`, then `supabase db push`: only
   `20261010000300_auth_hardening.sql`. Result below.
2. **Done 9 Oct (Nemat approved), second attempt.** `supabase config diff --project-ref
   picvoavfxnajfjkqawju`, then `supabase config push`. The diff
   (through `[remotes.hosted]`) shows only: OTP length 8 to 6; confirmation, magic link and
   recovery subjects (and their content); the access token hook on; TOTP MFA off; site URL
   `http://localhost:3000` to `shortcut://`; redirect URL `shortcut://auth/callback`. Confirm
   email (on), 60 s and the expiry already match; Apple and Google stay off; pooler and storage
   unchanged. `auth.password_requirements` is no longer declared in `config.toml` (9 Oct), so it
   is not pushed. Preparation, rollback and checks: "Stage 2 preparation" below.
3. **Done 10 Oct (Nemat approved).** `supabase functions deploy auth-signin-method --project-ref
   picvoavfxnajfjkqawju` (no secrets of
   its own; `verify_jwt = false` from `config.toml`). Always name the function: without a name the
   CLI deploys every function, the Mux ones included. Never `--prune`. Review: "auth-signin-method
   review" below.
4. Resend SMTP on the hosted project (Nemat), then the email rate limit, then the delivery check.

**Hosted step 1, 9 Oct** (`supabase db push --linked --yes`, exit 0; one migration, no seed, no
roles). All checks are read-only catalog queries and `supabase config diff` against
`picvoavfxnajfjkqawju`, before and after.

- **Before.** Branch `phase-7-beta` at `f1f74c6`, clean. Hosted history had exactly the 12
  migrations of section 9; the dry run listed only `20261010000300`. 0 auth users, 0 identities;
  the only trigger on `auth.users` was `on_auth_user_created`; neither new function existed; the
  hosted `pre_request` body was identical to `20261008000200_safety_fixes.sql` (no drift);
  `auth.users.encrypted_password` is nullable.
- **After.**
  - 13 migrations recorded, the last `20261010000300`; local and remote lists match.
  - `discard_auth_password` trigger on `auth.users`: `BEFORE INSERT OR UPDATE OF
    encrypted_password`, only when the password is not empty, enabled. `on_auth_user_created`
    unchanged.
  - `custom_access_token_hook(jsonb)`: owner `postgres`, `SECURITY INVOKER`, stable,
    `search_path=""`. Executable by `supabase_auth_admin` and `service_role`; not by `PUBLIC`,
    `anon` or `authenticated`.
  - `discard_auth_password()`: owner `postgres`, `SECURITY INVOKER`, `search_path=""`.
    Executable by `service_role` only; not by `PUBLIC`, `anon`, `authenticated` or
    `supabase_auth_admin`. Postgres checks execute on a trigger function when the trigger is
    created, not when it fires, as on the local stack where the integration test passed.
  - `pre_request()`: body now the migration's (adds the `amr = password` refusal); owner,
    `SECURITY DEFINER`, `search_path` and grants (`anon`, `authenticated`, `service_role`)
    unchanged. `authenticator` still has `pgrst.db_pre_request=public.pre_request`.
  - `supabase_auth_admin` has `USAGE` on `public`.
  - Nothing else changed: 156 functions (154 plus the two new ones). Hashes taken before and after
    are identical for every other `public` function (body, grants, owner), all policies, every
    trigger outside `auth.users`, and the columns of `public`, `storage` and `auth`. 25 tables,
    0 auth users.
- **Auth configuration unchanged.** `supabase config diff` after the push is byte-for-byte the
  same as before it: the hosted `custom_access_token` hook is `enabled = false` with no URI, and
  the other differences are the ones listed in step 2.
- **Security advisor (hosted), 89 findings, no errors:** the same counts and kinds as section 9
  (77 `authenticated` and 4 `anon` `SECURITY DEFINER`, 5 RLS without policy, 2 `search_path`,
  `pg_net` in `public`). None names the two new functions; the `pre_request` ones were already
  there.
- **Not tested on the hosted project.** No sign-up, sign-in or token refresh ran against it: there
  are no users, no SMTP, and the hook is off, so neither the trigger nor the hook has yet run there.
  That check belongs after step 2 (and step 4 for delivery).

**Stage 2 preparation, 9 Oct** (read-only against the hosted project; nothing pushed).

- **Hook readiness.** The hosted `custom_access_token_hook` body is byte-identical to the
  migration (md5). It is `plpgsql`, `SECURITY INVOKER`, stable, `search_path=""`, and depends only
  on its language and schema. `supabase_auth_admin` can execute it, has `USAGE` on `public` and
  `auth`, and owns `auth.identities`. The URI to enable is
  `pg-functions://postgres/public/custom_access_token_hook`. Called directly on the hosted database
  with synthetic events (stable function, no writes): an email code sign-in and its refresh return
  the claims unchanged (`{"claims": ...}`, the shape Auth expects); a password sign-in, a refresh
  of a password session, and `amr` given as plain strings all return
  `{"error": {"http_code": 403, "message": "password_sign_in_disabled"}}`; a malformed `user_id`
  raises an SQL error, which Auth treats as a failed hook (no token). An email code on an Apple or
  Google account needs identity rows, which the hosted project has none of; it is covered locally.
  Local and hosted Auth are both `v2.197.0`. Local re-run: pgTAP 400 of 400; integration 37 of 37
  (the four pre-fix session checks need the hook off and a restart; not re-run).
- **`password_requirements`.** It was declared only because it is in the `supabase init`
  template. The hosted API reports no value, so the diff called it local-only and the push would
  have sent it. Commenting it out removes it from the diff; locally `""` is already the default.
- **Template bodies are not in the diff.** `config diff` compares subjects only (changing the body
  file leaves the diff unchanged). `config push` (CLI 2.119.0) does send each declared
  `content_path` file as `mailer_templates_<name>_content` when it differs from the hosted body,
  and lists it as `content` in its confirmation. Properties the diff calls unmanaged (provider
  client ids, `rate_limit.email_sent`, network restrictions) are not pushed; empty env secrets are
  not pushed. Invite, email change and reauthentication templates stay at the hosted defaults.
- **Push in two runs.** First `supabase config push --project-ref picvoavfxnajfjkqawju < /dev/null`
  (no affirmative answer, so the CLI shows each change and writes nothing). Then the same command
  interactively, answering yes only if the confirmation lists the ten changes above plus the three
  template bodies, and nothing reported as "forced" (undeclared properties written at defaults).
  Never `--yes`. Same CLI version as the diff.
- **Rollback (hook only; the migration stays).** Dashboard: Authentication, Auth Hooks, Customize
  Access Token, off. Takes effect for the next token. Fallback: add
  `[remotes.hosted.auth.hook.custom_access_token]` with `enabled = false`, `config diff` (only
  the hook changes), `config push`. Afterwards `config diff` shows the hook `remote=false`. The
  trigger and `pre_request` affect only password sessions and stay. While the hook is broken,
  no one can sign in or refresh; the hosted project has 0 users today.
- **Checks after step 2** (direct Auth API calls; the app is not pointed at the hosted project and
  needs step 3). Built-in email reaches only project team addresses, about two an hour, so the
  checks span more than an hour, or use admin `generate_link` codes (no email). Each creates a
  hosted test account, so each needs Nemat's go-ahead.
  1. New address: request a code (`/auth/v1/otp`); the confirmation email has a 6-digit code and
     no link; `/auth/v1/verify` returns a session whose `amr` is `otp`.
  2. Same address after 60 s: magic link email, same checks.
  3. Refresh (`/auth/v1/token?grant_type=refresh_token`): 200, `amr` still `otp`; one product RPC
     with the new token: 200.
  4. Passwords: password sign-up stores no password (`encrypted_password` empty) and password
     sign-in returns 400; a password set through `PUT /auth/v1/user` is not stored.
  5. Wrong method: needs Apple or Google enabled on the hosted project (after their credentials),
     or a database test inside a transaction that is rolled back.
  6. Auth logs show no hook errors.
- **Email copy decided (Nemat, 9 Oct):** the existing template stays as it is (heading, code,
  one-hour expiry, "If you didn't ask for this code, you can ignore this email.") for the
  confirmation, magic link and recovery emails.
- **Open.** The default email change template (a link) is reachable by any signed-in session
  through `PUT /auth/v1/user`; the app has no email change.

**Stage 2 push attempt, 9 Oct (Nemat approved): refused by the API, nothing changed.**

- Before: branch `phase-7-beta` at `1de364a`, clean; CLI 2.119.0; hosted diff identical to the
  reviewed ten changes; the template file has the approved copy, one `{{ .Token }}`, no link.
- Preview (`config push ... < /dev/null`): only Auth had changes, the ten settings plus the
  confirmation, magic link and recovery bodies; nothing forced, unsupported or unencodable; no
  secrets sent (Apple, Google, Twilio secrets gated); API, DB and storage up to date. Nothing
  written.
- Push, Auth confirmed with `y`: HTTP 400 from the Management API, "Email template modification is
  not available for free tier projects using the default email provider. Please upgrade your plan
  or configure a custom SMTP provider." The CLI sends Auth as one update, so the whole update was
  refused.
- After: `config diff` is identical to before the push. The hook is still off; OTP length 8, site
  URL, redirect, TOTP and subjects all unchanged.
- Consequence: the email subjects and bodies can only be set on this project once custom SMTP
  (step 4, Resend) is configured, or on a paid plan. The hook and the other settings do not depend
  on templates; splitting them out needs Nemat's decision.

**Hosted step 2, 9 Oct (Nemat approved): Auth configuration pushed.**

- **Prerequisite.** Nemat verified `auth.churntech.com` in Resend and saved custom SMTP in the
  hosted dashboard. Read-only check (`config diff` against a scratch copy of `config.toml` that
  declares SMTP; the password is masked by the API and was not read): SMTP on, sender
  `no-reply@auth.churntech.com`, name Shortcut, host `smtp.resend.com`, port 465. The hosted email
  rate limit is now 30 an hour.
- **Before.** Branch `phase-7-beta` at `1de364a`; CLI 2.119.0. Hosted diff: the ten reviewed
  changes, plus six SMTP properties set in the dashboard that `config.toml` does not declare
  (left alone by `config push`). Template file unchanged (approved copy, one `{{ .Token }}`, no
  link). Preview: only Auth, the ten settings and the three template bodies; nothing forced,
  unsupported or unencodable; no secrets sent; "6 remote properties ... left unchanged".
- **Push.** The confirmation block was compared with the preview's by script and confirmed only
  because it was identical. Result: Auth updated, 13 properties; nothing forced; no secrets sent;
  API, DB and storage up to date; SMTP left unchanged.
- **After.**
  - `config diff`: no differences in any declared property (the only entries are the six
    undeclared SMTP ones, unchanged). That covers the hook on with
    `pg-functions://postgres/public/custom_access_token_hook`, 6-digit codes, one-hour expiry,
    60 s between emails, Confirm email on, site URL `shortcut://`, redirect
    `shortcut://auth/callback`, TOTP off, Apple and Google off, and the three subjects.
  - A second preview reports Auth "up to date", which includes the three template bodies (the
    push compares bodies; the diff does not).
  - SMTP check repeated: unchanged, rate limit still 30 an hour (`config.toml` says 2; it is only
    pushed if SMTP is ever declared there, so change it first if that happens).
  - Database unchanged: 13 migrations, 0 users, both `auth.users` triggers enabled, `pre_request`
    and the hook bodies as deployed, `supabase_auth_admin` privileges as before. Synthetic hook
    calls give the same results as in the preparation above.
- **Not verified.** No sign-in, refresh, password attempt or email has run against the hosted
  Auth with the hook on (no test accounts, by instruction). Until then it is not known that Auth
  calls the hook successfully: if it fails, every sign-in and refresh fails, and the rollback is
  the dashboard switch in "Stage 2 preparation". Next checks: the list there, once Nemat approves
  test accounts; delivery by Resend to Gmail, Outlook, iCloud and a Bali address. (Done for one
  account and Gmail on 9 Oct: next block.)

**Hosted email sign-in smoke test, 9 Oct (Nemat approved and ran it).**
`scripts/hosted-auth-smoke.mjs`, run by Nemat in a terminal with Nemat's own address; the code was
typed without echo, and no code, token, key or password was printed. Direct Auth API calls with
the public anon key only. 13 of 13 checks passed:

- New-account code requested (HTTP 200).
- Resend delivered it to Gmail; Nemat confirmed sender `no-reply@auth.churntech.com` (Shortcut),
  subject "Your Shortcut sign-in code", the approved wording, a 6-digit code and no link.
- The code signed in (HTTP 200), so the access token hook ran and accepted the session: method
  `otp`, role `authenticated`, `aal1`. User id `70046556-4209-4471-b5bb-a770aee12466`.
- Refresh issued a new token (HTTP 200) still with method `otp`.
- Product API: `get_onboarding_state` HTTP 200 through `pre_request` (age not confirmed, no beta
  access, not waitlisted, no profile, not suspended).
- Password sign-in refused (HTTP 400 `invalid_credentials`). A password set through
  `PUT /auth/v1/user` (HTTP 200) was not stored and could not sign in (HTTP 400).
- Signed out of every session (HTTP 204).

**Database afterwards** (read-only; no email, hash or token printed): 1 auth user, Nemat's
address; `encrypted_password` NULL; email confirmed; not anonymous, not SSO, no phone;
`app_metadata` provider `email`. 1 identity in the project, `email`, for this user. 0 sessions and
0 unrevoked refresh tokens; 0 MFA factors; no pending one-time tokens. 1 `accounts` row for this
id: `active`, no cohort (set when an invite is redeemed), age and disclosure not yet confirmed,
analytics id set. 0 profiles, 0 waitlist rows, 0 invites.

**The test account stays** (Nemat's own address, id above). Deleting it needs Nemat's approval.

**Not tested on the hosted project:** the returning-account (magic link) and recovery emails,
the 60 s resend limit and a wrong code (all covered locally); delivery to Outlook, iCloud and a
Bali address; Apple and Google sign-in, and an email code on an Apple or Google account (no
provider credentials yet); the app itself against the hosted project.

**auth-signin-method review, 9 Oct (not deployed).**

- **Code.** `supabase/functions/auth-signin-method/index.ts`, unchanged since 6 Oct. One
  dependency, `jsr:@supabase/supabase-js@2` (major version only, so the deploy bundles the newest
  2.x; the other functions do the same). No `_shared` imports, no secrets of its own: it uses the
  hosted defaults `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Not
  deployed on the hosted project (no functions there).
- **Before sign-in.** `verify_jwt = false` (`config.toml`), so no user token is needed; instead the
  `apikey` header must equal the project's legacy anon key, otherwise 401. POST only; email
  checked by pattern and length; any database error is a generic 500.
- **Legacy anon key.** The hosted project still has the legacy `anon` and `service_role` keys
  next to the new publishable and secret keys, and the app sends the legacy anon key. (Wrong
  assumption, corrected by the deployment below: the hosted runtime's `SUPABASE_ANON_KEY` is the
  publishable key.)
- **Service role.** Used only server-side, for one RPC, `signin_providers_for_email`: on the
  hosted project owned by `postgres`, `SECURITY DEFINER`, `search_path=""`, executable only by
  `service_role`; it returns the distinct identity providers for an address and nothing else.
- **Enumeration.** Anyone with the anon key (it ships in the app) can ask whether any address has
  an account and with which provider. Email sign-up itself does not reveal this (the code request
  answers the same either way), so this function is the leak. E-Linked needs the answer.
- **Abuse.** No rate limit in the function or in front of it; each call is one indexed query.
  Floods cost Edge Function invocations (plan quota) and database time, and allow bulk
  enumeration. A limit (per IP or per address) needs a decision; a CAPTCHA would need a board.
- **Founder-only testing: safe to deploy.** The hosted project has one account (Nemat's), the
  anon key has not shipped in any build, and the answer only covers addresses that exist. Before
  outside testers (Gate 5): decide on a rate limit for this function.

**auth-signin-method deployed, 10 Oct (Nemat approved).**

- **Before.** Branch `phase-7-beta` at `49e4d03`, clean; linked to `picvoavfxnajfjkqawju`;
  `index.ts` unchanged since 6 Oct (the reviewed file); `verify_jwt = false` in `config.toml`; no
  functions on the hosted project.
- **Deploy.** `supabase functions deploy auth-signin-method --project-ref picvoavfxnajfjkqawju`:
  one function bundled and deployed (703 kB). Hosted functions afterwards: only
  `auth-signin-method`, `ACTIVE`, version 1, `verify_jwt` false. No Mux or other function deployed.
- **Refused as intended:** no `apikey` (401), a wrong `apikey` (401), the key only as a bearer
  token (401), `GET` (405).
- **Found: the legacy anon key is refused too (401).** Compared by digest (no values printed):
  the hosted runtime's `SUPABASE_ANON_KEY` equals the project's publishable key, not the legacy
  anon JWT the app sends. The app's E-Linked check would therefore fail against the hosted
  project with its current key.
- **With the publishable key** (equally public): a malformed address 400 `bad_request`; an unknown
  address 200 `{"providers": []}`; Nemat's address 200 `{"providers": ["email"]}`, also upper-cased
  with spaces. The response has no other field. So the service role lookup works.
- **Logs.** The function writes no logs of its own; the request body (the address) goes only to
  the database lookup. The platform's request logs were not inspected. No key, token or address
  is in this record or the report.
- **Decision needed (Nemat) before the app points at the hosted project:** (a) the app's hosted
  `.env` uses the publishable key as `EXPO_PUBLIC_SUPABASE_ANON_KEY` (no code change; supabase-js
  2.117 accepts it; Auth, PostgREST, Storage and signed-in function calls with the publishable
  key are not yet tested), or (b) change the function to accept the legacy anon key too (code
  and a function secret, then redeploy). Recommended: (a), checked with a rerun of the smoke test
  using the publishable key.

## 11. Founder iPhone build (10 Oct, Nemat approved; free Personal Team, hosted project)

A build for Nemat's own iPhone only, before Apple Developer enrollment. Not for anyone else.

- **Decisions (Nemat, 10 Oct).** The app uses the hosted project's publishable key (the hosted
  `auth-signin-method` only accepts it, section 10). A founder-only build signed by Nemat's free
  Personal Team, without Sign in with Apple and push, which a Personal Team cannot sign; the
  production app keeps both.
- **Switch.** `EXPO_PUBLIC_FOUNDER_BUILD=1`, set only by `app/scripts/founder-ios.sh` from the
  git-ignored `app/.env.founder` (hosted URL, `sb_publishable_` key, Personal Team
  `BP7TM32HCQ`, `EXPO_PUBLIC_DEV_TOOLS=1` for the Me tab's Sign out). The script loads only that
  file (`EXPO_NO_DOTENV=1`). With the switch on: bundle id `app.shortcut.founder`; the
  `withoutPersonalTeamCapabilities` plugin removes `aps-environment` and
  `com.apple.developer.applesignin` (Expo applies the expo-notifications and
  expo-apple-authentication plugins whenever they are installed); Welcome shows Google and email
  only; `signInWithApple` throws "not configured"; no push token is registered; the build
  (`app.config.ts`) and the app start (`supabase.ts`) refuse anything but a hosted
  `*.supabase.co` URL with a publishable key, so it cannot fall back to localhost.
- **Production unchanged.** With the switch unset, the introspected Expo config is identical to
  the commit before (bundle id `app.shortcut`, both entitlements, all plugins). Typecheck, lint,
  Jest 54 of 54.
- **Publishable key, checked before the build** with the app's supabase-js (no sign-in, no
  email): Auth settings (email on, Apple and Google off), `auth-signin-method`
  (`{"providers": []}` for an unknown address), `invite_preview` through PostgREST and
  `pre_request`, RLS (anon sees no `accounts` rows), the public avatars URL.
- **Signing.** `expo run:ios` cannot create a Personal Team profile (it does not pass
  `-allowProvisioningUpdates`), so the script builds with `xcodebuild -allowProvisioningUpdates`
  and installs and launches with `devicectl`. Xcode had to be signed in to the Apple ID first
  (it was not: "No Accounts"). CocoaPods needs a UTF-8 locale; the script sets one.
- **Debug build (dev client).** Installed on Nemat's iPhone 17 Pro and launched against a founder
  Metro on port 8082 (port 8081 was held by a Metro from 7 Oct serving the local-stack `app/.env`;
  it was left running, and the founder build must not be opened against it). Metro served
  `EXPO_PUBLIC_FOUNDER_BUILD=1` and the hosted URL. Nemat saw Welcome, tapped Google (logged
  "google sign-in is not configured for this build", as expected without Google credentials),
  then signed in by email code: 18+ passed, the app stopped at the invite step. Hosted database
  afterwards (read-only): the same single user and identity, last sign-in 05:43 UTC, one session
  with method `otp` (the hook accepted it), password still NULL, `age_confirmed_at` set through
  the product API, 0 invites.
- **Release build (standalone).** Installed over the Debug build and launched; JS bundled in, no
  Metro. Signed `Apple Development`, team `BP7TM32HCQ`, `app.shortcut.founder`; entitlements only
  `application-identifier`, `team-identifier` and `get-task-allow`. `main.jsbundle`: the hosted
  URL and one publishable key; no JWT (so no legacy anon or service role key), no secret key, no
  `service_role`, no LAN or local-stack address (the `sb_secret_`, `localhost` and `127.0.0.1`
  strings are supabase-js and React Native library text).
- **Seen on the device log:** supabase-js warns "WebCrypto API is not supported. Code challenge
  method will default to use plain instead of sha256" when a code is requested (the client is
  set to PKCE; React Native has no WebCrypto). Not founder-specific; email codes still work.
  Worth a look before outside testers.
- **Not working in this build, by design or setup:** Apple sign-in (no entitlement), Google
  sign-in (no credentials), push. (The invite step and video were missing on 10 Oct; an invite was
  redeemed the same day, and Mux is on the hosted project since 11 Oct, section 12.) The free profile expires after 7 days; rebuild with the script.
- **Going back to the regular project:** `ios/` now holds the founder project; run
  `npx expo prebuild --clean` with the normal `app/.env`.
- **Founder onboarding and first suggestion, verified 10 Oct** (read-only queries on the hosted
  project, after Nemat finished onboarding in the Release build; nothing changed):
  - 1 auth user, 1 identity (`email`), 1 `accounts` row, 1 profile, all Nemat's: username
    `nemathsnv`, no photo, profile created 05:53 UTC. Account `active`, cohort `canggu`, not
    deleted; `has_beta_access` true. 1 session, method `otp`; password still NULL.
  - 18+ recorded at 05:43 UTC.
  - Invite: the project's only invite, team-created (no inviter), cohort `canggu`, created 05:52
    and redeemed by Nemat 05:53 UTC, not cancelled, valid to 17 Oct. No unused invites.
  - Suggestion: 1 in total, Nemat's, created 05:54 UTC, status `in_review` (not reviewed, no
    decline reason, no prompt), attribution on, no place (global). Text "hey" (3 characters, a
    test). No duplicates. 0 prompts, 0 responses, 0 follows.
  - **Found:** Nemat's waitlist row (joined 05:43 UTC, before the invite existed) is still there
    and not admitted. `redeem_invite` does not touch the waitlist, so a member who joined the
    waitlist first and then redeemed an invite stays in the team's waitlist queue. The app is not
    affected (`has_beta_access` comes first in `resolveStep`). Whether redeeming should close the
    waitlist entry is a decision for Nemat; nothing changed.
- **Suggestion review (team).** `scripts/moderate.sh` (with `LINKED=1` for the hosted project,
  through the Supabase CLI; the moderator name defaults to git `user.name`):
  `suggestions` lists the queue (read-only); `approve <id> [keep-name] [note]` publishes it at
  once as a live prompt (global, as this one has no place), notifies the author and logs the
  action; `decline <id> <reason> [note]` sets `not_published` with one of the fixed reasons and
  notifies the author. The three `mod_*` functions run only as `postgres` or `service_role` on
  the hosted project. Nemat's suggestion id: `e789f8cd-0435-4ee3-a77c-f67c11dc18fc`; not
  reviewed (approving "hey" would make it the first live prompt).

## 12. Video on the hosted project (Mux, 10 and 11 Oct, Nemat approved each step)

- **Separate Mux environment.** Nemat created a "Shortcut Beta" environment and a Mux Video
  Read + Write token in it. Checked read-only with the Mux API, no values printed: the first token
  turned out to be in the spike environment (it saw the spike's 7 assets) and was not used; the
  replacement sees 0 assets, shares none with the spike token, and the spike environment still
  has its 7 assets. Both credentials sit in git-ignored, mode-600 files
  (`supabase/.env.mux-hosted`, `supabase/.env.mux-webhook`).
- **Hosted secrets.** `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` replaced (10 Oct, done by Nemat):
  they match the new token by digest and not the spike pair; the other 7 secrets unchanged, 9 in
  total. `MUX_WEBHOOK_SECRET` added from its file (10 Oct): 10 secrets, the original 9 unchanged,
  the new one matches by digest.
- **`verify_jwt = false`** for `mux-create-upload` and `mux-upload-status` (`efc3b65`): the hosted
  project signs user tokens with ES256, which the gateway's check does not support; both functions
  check the caller themselves (`auth.getUser()`, then a profile or the response's author under
  RLS).
- **`mux-webhook`** deployed 10 Oct (`verify_jwt` false). Before: run locally in Deno, 11 of 11
  (no or malformed or wrong signature 401; timestamps over 300 s old or ahead 401; body changed
  after signing 401; the raw body is what is verified; no secret fails closed; only non-publishing
  event types were signed). On the hosted project, with and without the secret: unsigned, malformed,
  forged and stale requests 401, `GET` 405. The Shortcut Beta webhook points at
  `/functions/v1/mux-webhook`. The Mux dashboard shows no test-event option; the first genuine
  deliveries arrived with the first upload on 11 Oct (below).
- **`mux-create-upload` and `mux-upload-status`** deployed 11 Oct. Before: `deno check` and
  `deno lint` clean; run locally against hosted Auth with invalid tokens only, 12 of 12 (no token,
  garbage, the publishable key, a forged ES256 token: 401, before any Mux call). After: the four
  functions `auth-signin-method`, `mux-create-upload`, `mux-upload-status`, `mux-webhook`, all
  `ACTIVE`, `verify_jwt` false; both new ones 401 without a valid token; the 10 secrets, the
  database and the other two functions' bundles unchanged; Shortcut Beta 0 assets, spike 7.
- **Function versions** move up by one on every secret change, with unchanged bundle hashes and
  timestamps (platform behaviour; no code redeployed).
- **First live prompt** (11 Oct 07:54 UTC, `scripts/create-prompt.sh` with `LINKED=1`):
  `ddd5a383-be11-475f-9576-0a6db79cabe3`, "What's one underrated place in Canggu everyone should
  know about?" (exact text checked), `live`, global (no place, so no place notification), not
  featured, team-created. The only database change was `prompts` 0 to 1; `prompt_in_feed` is true
  for Nemat; the suggestion "hey" is untouched (`in_review`). A Canggu pin needs the prompt tied to
  the `canggu` place, which the script does with a second argument; this one is global.
- **Founder iPhone video upload and playback: verified 11 Oct.** Nemat ran it on the iPhone 17 Pro
  with the founder Release build (no rebuild): recorded, uploaded, published and played the
  response, and played it again after reopening the app. The backend was then checked read-only
  (SQL `select`s, Mux API `GET`s, the Supabase function and gateway logs; nothing written, no
  credential or address printed):
  - **Response** `5b321c24-1e1e-4393-9ae1-e6503903430d`: `live`, kind `response`, Nemat's account
    (the project's only one), prompt `ddd5a383-be11-475f-9576-0a6db79cabe3`, 9,911 ms, no caption,
    not deleted. Times (UTC): Post tapped 08:02:21.4, Mux asset created 08:02:25, `live_at`
    08:02:29.8 (about 8.4 s). The prompt has exactly this one response.
  - **Mux, Shortcut Beta:** exactly 1 upload (`ka5YEhFH6gsMlReKkWOrfWN2xPkSKxceKqvzAqZxIs00`,
    `asset_created`) and 1 asset (`L7KxG29AtA7rEZ2JXF02QWw3GcR12F00NK3A1eTsu02UVc`, `ready`,
    9.91 s, 1080×1920 at 30 fps, 9:16, `basic`, no errors). One public playback id
    (`8UqSCXiojU36lJn802TM00UF6ehuCB5Q5NF8kZh502J6JU`); its HLS manifest returns HTTP 200.
    The asset, upload and playback ids match the response row; `passthrough` is Nemat's id.
  - **Spike environment untouched:** the same 7 assets, all `ready`, all created 6 Oct, ids
    matching the spike's own 6 Oct logs.
  - **Webhook:** 4 signed deliveries from Mux (us-east-1), all HTTP 200, so all passed the
    signature check (anything else is a 401): upload created, upload asset created, asset
    created, and `video.asset.ready`. Only the ready delivery did work (4.1 s): its
    `mark_response_live` call returned 200. No failed deliveries, so no retries.
  - **Which caller set `live` is undetermined.** Both paths reached the database successfully:
    the webhook's `mark_response_live` call reached the gateway at 08:02:28.750 (Virginia, 1,202 ms
    round trip to the Singapore database), and the app's single `mux-upload-status` check called it
    at 08:02:29.633 (Singapore, 245 ms). The function only updates a row that is still
    `processing`, both calls return the same result, and nothing records which one made the change.
    The timing leans towards the app's check (`live_at` is 170 ms after its call), which is not
    proof. The webhook path alone setting a response `live` is therefore still unverified.
  - **No duplicates and no unexpected database changes.** Every table matches the 10 Oct baseline
    (section 11) plus what this test adds: 1 response, 14 analytics events in the flow's order
    (record, disclosure, publish, notification ask, view), the disclosure acknowledgement, and the
    notification ask `accepted` (0 push tokens, as the founder build registers none). Suggestion,
    invite and waitlist rows unchanged since 10 Oct.
  - **No errors.** From 07:55 UTC every function and gateway call returned 200 or 204, with no
    error-level function logs. The 401s at 07:50 were the no-token checks from the deployment. The
    only Postgres error in the window is a mistyped column in one of the verification queries
    (08:08, a failed `select`). Functions and bundles unchanged: the same 4, no deployment.
  - **Seen while checking:** `mux-upload-status` took 5 s because it pre-warms the video before
    answering, and the webhook pre-warmed the same video again, so the app waited about 3 s longer
    than it needed to. The app made no API calls after 08:03:11, so the server logs neither show
    nor rule out a cold relaunch before the replay; the replay after reopening is Nemat's
    observation on the device.
  - **Not verified by this test:** the webhook alone setting a response `live`; an asset that
    errors at Mux; a second account seeing and playing the response, and replies; Bali mobile
    data; Android; B-1; the items below. No gate changes.
- **Open before outside testers:** the upload id is not checked or encoded before it goes into
  the Mux API path in `mux-upload-status` (fixed 12 Oct, section 13); uploads are not bound to their author (the
  `passthrough` user id is set but never compared); deleted or removed videos stay playable at
  Mux (nothing deletes assets, including the 30-day purge); no limit on upload URLs per member;
  an asset that errors at Mux leaves its response `processing`; the webhook's signature
  comparison is not constant-time (fixed 12 Oct, section 13).
- **Still to do in Mux (Nemat):** revoke the extra token created in the spike environment and the
  spike token; decide about the spike's 7 assets; give the local stack its own development token
  instead of the spike pair in `supabase/functions/.env`.

## 13. Security stage 1 (built 11 Oct; deployed 12 Oct, Nemat approved)

Four audit findings, branch `claude/shortcut-stage-1-security-c02c82` (`phase-7-beta` plus four
commits). Deployed to `picvoavfxnajfjkqawju` on 12 Oct: one migration and three functions. No
secret, configuration, Auth setting, Mux asset or other function changed; no upload, prompt or
account created.

- **F1, direct reads of `responses`:** migration `20261011000100_responses_direct_read.sql`. Any
  member could `GET /rest/v1/responses` and read every live row, including blocked members' and
  their Mux upload and asset ids. Members now read only their own rows directly. The read functions
  (feeds, players, profiles, web) are SECURITY DEFINER owned by `postgres` and unaffected; the app
  never reads the table.
- **F3, upload ids and Mux URLs:** `_shared/mux.ts` accepts only 1 to 128 letters and digits as a
  Mux id (`isMuxId`, `muxSegment`), `mux()` refuses any URL that is not `https://api.mux.com`, and
  `prewarm` skips invalid playback ids. `mux-upload-status` answers 400 `invalid_upload_id` before
  the database or Mux; a malformed asset id from Mux is never put in a path.
- **F13, ownership in `mux-upload-status`:** the lookup filters on `author_id` as well as RLS.
- **F12, webhook signature:** `verifyMuxSignature` compares HMAC bytes in constant time over the
  raw body, within 300 s either way, and (like Mux's own SDK) accepts the request when any one
  `v1` value matches; a `v1` must be exactly 64 lowercase hex characters and there must be exactly
  one numeric `t`. One secret only; no rotation support (Nemat, 12 Oct).
- **Structure:** `mux-upload-status` and `mux-webhook` moved their code to `handler.ts` so tests can
  import it; `index.ts` only serves it. The responses and status codes the app sees are unchanged.
- **Local checks (isolated stack, separate project id and ports; 12 Oct, final code):** pgTAP
  436/436 (36 new in `0008_security_stage1.sql`, 12 of them fail on the old policy); Deno unit
  21/21 (4 of the multi-signature tests fail on the previous verifier) and integration 20/20
  (`supabase/functions/_tests/`; Mux stubbed); `deno check` and `deno lint` clean; app typecheck,
  lint and Jest 54/54; `scripts/auth-integration.mjs` 37/37 (11 Oct).
- **Preflight (read-only, 12 Oct):** hosted schema fingerprint (every public function definition,
  policy, table grant, RLS flag and trigger) equal to the local stack built from the same 13
  migrations; deployed source of the three Mux functions byte-identical to `d91bea8`.
- **Deployment, 12 Oct (UTC):**
  - 08:59:30 `supabase db push --linked --yes`, after a dry run listing exactly
    `20261011000100_responses_direct_read.sql` (no seeds, no roles); exit 0. 14 of 14 migrations
    applied, none pending.
  - Then, each by name with `--no-verify-jwt`, never `--prune`: `mux-upload-status` 09:00:06
    (v1 to v2), `mux-webhook` 09:00:47 (v2 to v3), `mux-create-upload` 09:01:01 (v1 to v2).
- **Hosted checks after deployment (12 Oct):**
  - `responses` has one policy, "responses: signed-in users read only their own directly",
    `authenticated`, `author_id = auth.uid()`. Hosted fingerprint equal to the tested local stack;
    against before, only that policy differs. All 20 read and write functions on `responses` still
    SECURITY DEFINER, owned by `postgres`, with unchanged execute grants (`web_video` and
    `web_prompt` for `anon`); `pre_request` gate unchanged.
  - Functions: `auth-signin-method` v3 (unchanged bundle), `mux-create-upload` v2,
    `mux-upload-status` v2, `mux-webhook` v3, all `ACTIVE`, `verify_jwt` false. Downloaded source
    byte-identical to the branch; the `_tests` folder was not deployed.
  - `mux-upload-status` and `mux-create-upload`: 401 with no token, a garbage token, the anon key,
    the publishable key and a forged ES256 token. Malformed upload ids without a member session:
    401 (authentication is checked first).
  - `mux-webhook`: `GET` 405; unsigned, malformed, no `v1`, forged, two forged `v1`, stale and
    uppercase signatures all 401.
  - `GET /rest/v1/responses` as anon: `[]`; with a forged token: rejected by PostgREST (PGRST301).
  - The founder response through `web_video` (anon): `live`, same id and playback id; its HLS
    manifest HTTP 200.
  - Secrets: 10 before and after, same names and digests. The founder response row identical in
    every column; account, profile, prompt, response, comment, like and analytics counts unchanged.
    Mux Shortcut Beta (read-only `GET`s): the same 1 upload and 1 asset.
- **Not verified on hosted:** a malformed upload id with a valid member session answering 400 (needs
  a signed-in member token; the same code answers 400 through the local gateway); the founder video
  in the signed-in app (feed and player functions are unchanged in definition and grants, but no
  signed-in call was made); a genuine signed `video.asset.ready` delivery through the new webhook
  (no upload was made, by decision); function logs. These wait for the device regression test.
- **Rollback:** functions, redeploy the three from a checkout of `d91bea8` (byte-identical to what
  was deployed before). Migration, a new forward migration restoring the old policy; this reopens
  F1, so roll forward instead unless the app is shown to depend on it.
- **Still open from section 12:** uploads not bound to their author (`passthrough`); deleted videos
  still playable at Mux; no limit on upload URLs; errored assets stay `processing`; the database
  accepts any upload id string. (Binding, limits and upload ids: built locally in stage 2, section 14;
  not deployed.) Same shape as F1 on other tables: `profiles` and `follows` are
  readable directly by any member (`true`), and `comments` wherever `deleted_at` is null.

## 14. Security stage 2: upload ownership and limits (built 12 Oct; deployed 12 Oct, Nemat approved)

Branch `claude/shortcut-stage-2-upload-ownership-a8bab3`, on top of the deployed stage 1 head
(`a50b71a`). Architecture approved in principle by Nemat (12 Oct); the refinements from the same
day (abandoned URLs, no silent Post, the scope of the limits) are below. Deployed to the hosted
project on 12 Oct from `d5780b6` (one migration, three functions; "Deployment, 12 Oct" below). No
Mux upload was created and no asset deleted; the app was not rebuilt.

- **Ledger.** Migration `20261012000100_video_uploads.sql` adds `video_uploads`: every Mux upload
  URL, the account it was minted for, and what became of it: `reserved` (slot taken before Mux is
  called), `active` (URL handed out), `claimed` (a response, video reply or draft took it),
  `cancelling` / `cancelled` (an abandoned URL being, or confirmed, cancelled at Mux), `failed`
  (Mux refused, so no upload exists). Expiry is a time (`expires_at`, one hour from the
  reservation, before Mux's own), not a status. RLS on, no policies, no table grants to `anon` or
  `authenticated`. Existing responses are backfilled as `claimed` by their authors (on the hosted
  project, the founder's one response).
- **Limits (Nemat, 12 Oct).** Anti-abuse limits on *newly minted upload URLs* per account, for
  responses, video replies and drafts alike: 10 in any rolling hour, 30 in any rolling 24 hours,
  and at most 3 unused URLs at a time. They are not limits on how many videos or replies a person
  has. Publishing an existing draft mints nothing and costs nothing (tested). Every URL minted
  counts towards the hour and the day, including ones later cancelled as abandoned.
- **Minting** (`mux-create-upload`, now `handler.ts` plus `index.ts` like the other two). The
  member's own session calls `reserve_video_upload`, which locks the account row (so concurrent
  requests count one another) and refuses: no profile (403 `profile_required`), suspended (403
  `suspended`, also refused by `pre_request`), posting paused (403 `posting_paused`), deleted (403
  `account_deleted`), and the limits (429 `upload_limit_hour`, `upload_limit_day`,
  `upload_limit_active`, with `Retry-After` and `retryAfter` in seconds). Then Mux is called with a
  15 s timeout, then the service role records the upload id (`activate_video_upload`, letters and
  digits only). The answer the app sees is unchanged: `{ uploadId, uploadUrl }`.
- **Abandoned URLs (re-recording).** Post Review mints as it opens, so each re-record leaves the
  previous URL unused. When a member is refused for holding 3 unused URLs, `mux-create-upload`
  retires the oldest *abandoned* one and tries once more:
  1. `begin_upload_cancellation` (same account lock as minting) picks the oldest upload that is
     unclaimed, unexpired and minted more than 15 s ago, and marks it `cancelling`. From then on it
     cannot be claimed (`upload_cancelled`), and it still holds its slot. A row being claimed at
     that moment is skipped; a simultaneous second request picks a different one.
  2. Mux is asked for the upload. Only if it is `waiting` is it cancelled (`PUT .../cancel`, which
     Mux itself allows only while waiting). Mux already reporting `cancelled` or `timed_out` counts
     as confirmed, with no cancel call.
  3. `finish_upload_cancellation` frees the slot (`cancelled`) only on that confirmation. If Mux
     could not be read, reported anything else (`asset_created`, `errored`), refused the cancel or
     answered without cancelling, the upload goes back to `active`, unfreed, and the mint is 429.
     If the cancel's outcome is unknown (timeout), it stays `cancelling`: unclaimable and holding
     its slot until its hour is up.
  Claimed, processing and expired uploads are never candidates.
  **Mux's `waiting` status alone does not guarantee that zero bytes have been transferred.** Mux
  reports `waiting` until an upload completes, so it cannot tell an untouched URL from one that is
  receiving bytes, and its cancel succeeds on both. What protects real uploads is the
  claim-before-upload contract: every app version creates the row (claims the upload) before it
  sends any bytes, and a claimed upload is never a candidate. So the only uploads that can be
  receiving bytes when cancelled are ones a client sends to without posting, which the app never
  does. The 15 s rule also keeps a URL just handed to an opening screen out of reach.
  Delaying URL creation until Post was considered and not chosen: it would add a mint round trip
  to every Post (the spike's reason for minting on review), and the installed founder build would
  still mint on review, so the server would need this handling anyway.
- **Partial failures while minting.** Mux answers with an error: the slot is given back
  (`fail_video_upload`). Timeout, network error or a malformed answer: the slot stays `reserved`
  and keeps counting, so retries cannot get round the limits. Mux created the upload but the
  ledger cannot record it: the upload is cancelled at Mux and not handed out (503
  `ledger_unavailable`). A reservation that outlived its 60 s cannot be activated later.
- **Claiming.** `post_response`, `post_reply`, `post_draft` and `retry_response_upload` claim the
  upload with one conditional `update` (owner, `active`, not expired): another member's or an
  unknown id is `upload_not_found` (the same answer, so nothing reveals that someone else's exists),
  a used one `upload_already_used`, an expired one `upload_expired`, a retired one
  `upload_cancelled`. A post refused for another reason does not use the upload up.
  `claim_video_upload` is executable by no API role, and a catalog test fails if any function
  writes `responses.mux_upload_id` without claiming.
- **Going live.** `mark_response_live` takes the asset's Mux `passthrough` as a fifth argument
  (default null, so the deployed stage 1 functions keep working until redeployed). If it is not
  the author, or the ledger owner is not the author, nothing changes and it answers
  `owner_mismatch` (the webhook acknowledges it with 200 so Mux does not retry; the status check
  keeps answering `processing`).
- **App: no silent Post.** No new screen; the X-Upload-Failed banner is reused.
  - `mintUpload` throws the server's refusal reason instead of always `mint_failed`.
  - At Post (`postingFlow.prepareUpload`): restrictions still go to Post Review, which shows
    A-Restricted or LV-Suspended as before. A URL that cannot be had (an upload limit, or no
    connection) no longer leaves Post doing nothing: the recording is kept on the phone as a failed
    post with no row yet, Post Review closes, and Home shows the banner with Retry. Offline, it
    waits for the connection instead (A-Offline; the 9 Oct decision). A URL Post Review minted
    earlier that the server refuses (expired, retired as abandoned, used) is replaced once.
  - Retry on a post with no row mints, creates the row, then uploads; a failure keeps any row or
    URL obtained on the way, so Retry never creates a second row.
  - The banner's second line, by reason (wording approved by Nemat, 12 Oct): hourly limit "You've
    reached the limit of 10 uploads per hour. Try again later."; daily limit "You've reached the
    limit of 30 uploads in 24 hours. Try again later."; no free upload slot "Uploading isn't
    available right now. Try again later." These make no claim that the recording is saved. Every
    other failure keeps the board's line, "It's saved on this phone. Check your connection." The
    title and Retry are the board's. One function holds the lines (`uploadFailedDetail`).
  - Persistence of a failed post: the recording file is not deleted and the post is stored with
    AsyncStorage, as for every failed post since phase 3. For the new "no row yet" failure this is
    covered by Jest only (stored and reloaded); it has not been checked on a device across an app
    restart.

**Local checks** (isolated stack `shortcut-s2` on ports 554xx, so the default `shortcut` stack was
not touched; Mux stubbed in every test; 12 Oct, final code):

- pgTAP **623/623**: the 436 existing (0001 to 0008) plus 187 in `0009_video_uploads.sql`
  (privileges, account states, the three limits and their windows, `Retry-After` values, activation,
  claims on all four posting paths, cross-account refusal, reuse, expiry, the passthrough and ledger
  owner checks, account purge, constraints; abandoned-URL cancellation: oldest first, never claimed,
  expired, recent (15 s) or other members' uploads, a claim refused while cancelling, the slot
  freed only on confirmation, cancelled URLs still counted, an unconfirmed cancellation holding its
  slot until expiry; publishing a draft at both limits takes no URL and no quota; section 12, the
  final safety review: with the uploads claimed by a response, a video reply and a draft being the
  oldest, the oldest *unused* one is picked; recording a cancelled or an active outcome against
  each claimed upload changes nothing; a pending and a failed cancellation free no slot, and only
  Mux's confirmation does). The new suite
  found one real bug while being written (an ambiguous name in the `Retry-After` query for the
  3-URL refusal), fixed. **Disclosed change to existing tests:** 0002, 0003 and 0005 posted with
  upload ids the server never minted, which stage 2 refuses, so those three files abort without the
  10 added fixture lines that register the ids. No assertion, plan count or expected value changed.
- Deno: unit **21/21**; stage 1 integration **20/20** (**disclosed change:** the stubbed Mux assets in
  three tests now carry `passthrough`, as every real asset does); `uploads_integration_test.ts`
  **32/32** over real HTTP sessions and transactions, three consecutive runs:
  - repeated recording: five re-records give five URLs, the 4th and 5th each cancel exactly the
    oldest abandoned one after reading it from Mux; the latest URL posts, a cancelled one is
    `upload_cancelled`;
  - quota: ten re-records in an hour all succeed (7 cancellations), the eleventh is 429
    `upload_limit_hour`;
  - three URLs minted moments ago: the fourth is 429 with no Mux read or cancel;
  - six cancellation failures (Mux unreachable, `asset_created`, `errored`, cancel refused, cancel
    not done, cancel timed out): 429, nothing freed, nothing cancelled that was not waiting; the
    timed-out one stays unclaimable and the next mint retires the next one; Mux already reporting
    `cancelled` or `timed_out` frees without a cancel call;
  - concurrency: six simultaneous mints at the cap cancel each abandoned URL exactly once and hand
    out exactly three; a post arriving while its upload is being cancelled is refused and the
    cancel completes; a post and a mint at the same moment never both claim and cancel one upload
    (in 20 rounds that test only saw the post land first, hence the deterministic test above);
    ten simultaneous fresh mints give exactly 3; with 8 used this hour six give exactly 2; six
    simultaneous posts of one upload give exactly one row;
  - plus cross-account, reuse, expiry, the day limit, every minting partial failure and the
    end-to-end iPhone path (mint, post, Mux ready, live, claimed). `deno check`, `deno lint` clean.
- App: typecheck and lint clean, Jest **96/96** (54 existing, 42 new: `mintUpload`, `prepareUpload`
  for normal posting, refusals, restrictions and stale-URL replacement, the approved banner line for
  each reason and that none claims the recording is saved, and a failed post with no row surviving
  a restart). The jest-expo preset prints "Cannot
  log after tests are done" (ExpoModulesCoreJSLogger); it already does with only the 54 existing
  tests.
- `scripts/auth-integration.mjs` **37/37** against the isolated stack.
- **Migration rehearsal** (rerun on the final migration): the isolated stack built with exactly the
  14 hosted migrations, the founder's response recreated with its real prompt, response, upload,
  asset and playback ids and times, then only `20261012000100` applied with `supabase migration up`:
  the founder row identical in every column (md5 of the row), the only table count change
  `video_uploads` 0 to 1 (`claimed`, the founder's account, the response id, outside the 24-hour
  window). Through the local gateway and edge runtime: `mux-upload-status` for the founder's upload
  200 `live` from the database (that stack has no Mux credentials), 404 for another member;
  `web_video` and `get_response` serve it; minting 401 with no token, 403 suspended, 429 with three
  fresh unused URLs; a forged and a re-used upload id refused; a member reading `video_uploads`
  42501.
- **Rollback rehearsal** (rerun): `supabase/rollback/20261012000100_video_uploads.down.sql` (not a
  migration; nothing applies it) applied on top of the new migration: the original pgTAP files,
  byte-identical to `a50b71a`, pass 436/436, and no ledger function is left.

**Mux capacity (read-only, 12 Oct; three `GET`s with the hosted Shortcut Beta token, no values
printed):** 1 asset (the founder's, `ready`, `basic`, passthrough set), 1 upload (`asset_created`,
timeout 3600), 0 live streams. The plan is not readable through the Video API with this token. The
spike environment hit the free plan's 10-asset cap twice (`spike/REPORT.md`), Mux's pricing page
still lists the free plan at 10 stored assets, and section 12 records 7 spike assets plus this 1.
**Unknown and decisive: whether a card is on the account.** If it is still on the free plan, the
project can hold at most 10 videos in total, possibly only 2 more if the cap is shared with the
spike environment. Nemat to check Mux, Billing. Cancelled uploads create no asset, so retiring
abandoned URLs does not use storage.
- **Project-wide limit: not built, by decision (Nemat, 12 Oct),** until the plan and the
  account-wide storage allowance are verified. The proposal stands: on the free plan, add a card
  before the second tester; on pay-as-you-go, a project-wide daily cap on minted URLs (one more
  count in `reserve_video_upload` under a project-wide advisory lock, answered with 503) sized from
  the cohort and Mux's prices, plus a Mux billing alert.

**Final safety review (12 Oct).**

- *Claimed uploads cannot be cancelled.* `begin_upload_cancellation` only moves a row from
  `active` to `cancelling` (selected and updated on `status = 'active'`, skipping rows another
  transaction holds); claiming moves a row from `active` to `claimed` under the same row lock, so
  whichever is first wins and the other finds nothing. `finish_upload_cancellation` only changes
  rows that are `cancelling`. A claimed upload (response, video reply or draft) therefore never
  becomes `cancelling` or `cancelled`, and is never sent to Mux's cancel. Tested in pgTAP (section
  12) and Deno (a post and a mint at the same moment; a post arriving mid-cancellation).
- *Failed cancellations never free slots.* `cancelling` holds a slot exactly like `active`; only
  `finish_upload_cancellation(..., 'cancelled')` frees it, and the function calls it only when Mux
  answers the cancel with `cancelled`, or a read shows the upload already `cancelled` or
  `timed_out`. Every failure puts the upload back (`active`) or leaves it `cancelling` until it
  expires. Tested for six failure modes (Deno) and in pgTAP.
- *Contracts kept.* Claim-before-upload is unchanged in the app (the row is created, then
  `putRecording`). The per-account lock, the atomic claim, the one-use upload id and the
  passthrough check are unchanged. Cancelled URLs still count towards the hour and the day.
- *Scope.* Against `a50b71a` the branch changes only stage 2 files: one migration, the three Mux
  functions and `_shared/mux.ts`, their tests, the posting files in the app, the docs, and the
  rollback script; existing tests change only by the disclosed fixture lines.

**Hosted deployment preflight (12 Oct, read-only; nothing deployed or written).** Every SQL query
ran through the Management API inside a `READ ONLY` transaction that was rolled back
(`transaction_read_only` confirmed `on`); Mux was read with `GET`s only. The CLI's standard
temporary login role (`cli_login_postgres`) had its short expiry refreshed by each CLI connection,
as with every earlier linked command; no schema, data, secret or function changed (all re-checked
afterwards).

- **Pending migrations:** the hosted project has the 14 migrations `20261006000100` to
  `20261011000100`. `supabase db push --linked --dry-run` with this branch: exactly one to push,
  `20261012000100_video_uploads.sql`; no seeds, no roles.
- **Schema identical to the tested base:** a fingerprint of 555 objects (every public function
  definition with its owner and grants, policies on `public` and `storage`, tables with RLS flags
  and grants, columns, constraints, triggers including `auth.users` and `auth.identities`, cron
  jobs) is equal on the hosted project and on the local stack built from the same 14 migrations.
- **What the migration changes** (the same fingerprint on the local stack before and after it):
  550 of 555 objects untouched; no policy, trigger, cron job, existing table or column changes.
  Added: the `video_uploads` table (11 columns, 7 constraints, RLS on, no policy) and the functions
  `reserve_video_upload`, `activate_video_upload`, `fail_video_upload`, `claim_video_upload`,
  `begin_upload_cancellation`, `finish_upload_cancellation`, `video_upload_holds_slot`. Changed
  (bodies only; grants, SECURITY DEFINER and `search_path` identical to the hosted ones):
  `post_response`, `post_reply`, `post_draft`, `retry_response_upload`. Replaced:
  `mark_response_live(text, text, text, integer)` by the same name with a fifth argument
  defaulting to null; on the hosted project the old one is executable only by `postgres` and
  `service_role` and no SQL function calls it, and the deployed functions call it with named
  arguments, which the new signature accepts (tested). None of the new names exists on the hosted
  project yet.
- **Founder response preserved:** the one hosted response `5b321c24-1e1e-4393-9ae1-e6503903430d`
  (`live`, the founder prompt, upload `ka5YEhFH6gsMlReKkWOrfWN2xPkSKxceKqvzAqZxIs00`, asset
  `L7KxG29AtA7rEZ2JXF02QWw3GcR12F00NK3A1eTsu02UVc`, playback
  `8UqSCXiojU36lJn802TM00UF6ehuCB5Q5NF8kZh502J6JU`, 9,911 ms); row md5
  `c9918f8241a2c45eefb106b5d0ec0a8f`, to compare after deployment. The migration does not write
  `responses`; the rehearsal on the same schema with the same ids kept the row identical.
- **Founder upload backfill:** the migration's backfill `SELECT`, run read-only on the hosted
  project, yields exactly one row: that upload, `claimed`, owned by the response's author, linked
  to the response, created 11 Oct 08:02:21 UTC (outside any 24-hour window, so no quota used).
  The Mux asset's passthrough equals that author (compared by md5; no id printed).
- **Edge Functions:** deployed `auth-signin-method` v3, `mux-create-upload` v2, `mux-upload-status`
  v2, `mux-webhook` v3, all `ACTIVE`, `verify_jwt` false. The deployed source of the three Mux
  functions (downloaded into a scratch folder) is byte-identical to `a50b71a`. On this branch each
  bundle's local module graph is: `mux-create-upload` `index.ts` (changed), `handler.ts` (new),
  `_shared/mux.ts` (changed), `_shared/supabase.ts` (unchanged); `mux-upload-status` and
  `mux-webhook` `handler.ts` (changed), `index.ts`, `_shared/mux.ts` (changed),
  `_shared/supabase.ts` (unchanged). No test file is in any bundle. `auth-signin-method`, `web` and
  `send-push` are not redeployed. The remote import `jsr:@supabase/supabase-js@2` resolves at
  deployment time, as in stage 1.
- **Hosted data at preflight:** 1 account, profile, prompt, response, suggestion, invite, waitlist
  entry and place follow; 26 analytics events. Mux Shortcut Beta: 1 asset, 1 upload, 0 live
  streams.

**Hosted migration plan (approved by Nemat and carried out 12 Oct; see "Deployment, 12 Oct"):**

1. Preflight, read-only: done 12 Oct (above). Repeat its checks immediately before deploying:
   hosted fingerprint still equal to `hosted.fp` of that run, one pending migration, deployed Mux
   function source byte-identical to `a50b71a`, the founder row md5, Mux asset and upload counts.
   Nemat not posting during the window.
2. `supabase db push --linked --dry-run`, expecting exactly `20261012000100_video_uploads.sql`; then
   `supabase db push --linked --yes`.
3. Immediately, by name with `--no-verify-jwt`, never `--prune`: `mux-create-upload` first (until it
   is deployed, the stage 1 function mints URLs the database will not accept), then
   `mux-upload-status`, then `mux-webhook`.
4. Checks: one `video_uploads` row (the founder's, `claimed`); founder response unchanged; the
   unauthenticated and forged-token checks from section 13; with a signed-in member token,
   `mux-upload-status` for the founder's upload answers `live`; `GET /rest/v1/video_uploads` as a
   member 42501. A real mint, post and play on the iPhone is the regression test, and creates one
   Mux upload and asset: needs Nemat's separate go-ahead. Re-recording on the device also cancels
   real (unused, assetless) uploads at Mux.
5. Rollback: copy the rollback file to a new forward migration and push it, and redeploy the three
   functions from `a50b71a`. Both halves together; either alone breaks posting.

The app changes need a new build to reach a phone; the server is compatible with the installed
founder build without them.

**Deployment, 12 Oct (UTC; approved by Nemat).** Followed the plan above from `d5780b6` (clean
tree). Read-only checks used the same method as the preflight (SQL through the Management API in a
`READ ONLY` transaction, rolled back; Mux `GET`s; function downloads into a scratch folder).

- **Before (10:36 to 10:37):** project `shortcut` (`picvoavfxnajfjkqawju`, `ACTIVE_HEALTHY`); 14
  migrations; schema fingerprint unchanged since the preflight (555 objects); deployed Mux function
  source byte-identical to `a50b71a`; founder row md5 `c9918f8241a2c45eefb106b5d0ec0a8f`; nothing in
  progress (0 `processing` or `draft` rows; Mux's only upload `asset_created`, its only asset
  `ready`); 10 secrets; functions `auth-signin-method` v3, `mux-create-upload` v2,
  `mux-upload-status` v2, `mux-webhook` v3. Dry run: exactly `20261012000100_video_uploads.sql`, no
  seeds, no roles.
- **Migration, 10:37:27 to 10:37:29:** `supabase db push --linked --yes` (from a scratch folder
  linked to the project, holding exactly the branch's migrations); exit 0, "Finished supabase db
  push". Then: 15 migrations, latest `20261012000100`; the hosted fingerprint (581 objects) equal to
  the local stack's tested post-migration schema, so exactly the intended changes and nothing else;
  `video_uploads` has one row, the founder's upload `ka5YEhFH6gsMlReKkWOrfWN2xPkSKxceKqvzAqZxIs00`,
  `claimed`, owned by the response's author, linked to response
  `5b321c24-1e1e-4393-9ae1-e6503903430d`, `claimed_at` 11 Oct 08:02:21 UTC; founder row md5
  unchanged; RLS on, no policy, no `select` for `anon` or `authenticated`; members can execute only
  `reserve_video_upload` among the new functions.
- **`mark_response_live` compatibility, without calling it:** the new signature is `(p_upload_id
  text, p_asset_id text, p_playback_id text, p_duration_ms integer, p_passthrough text DEFAULT
  NULL)`, executable only by `postgres` and `service_role`; PostgREST's schema-reload triggers
  (`pgrst_ddl_watch`, `pgrst_drop_watch`) are enabled; a `POST /rest/v1/rpc/mark_response_live` as
  `anon` with the four named arguments the stage 1 functions send answered 42501 "permission
  denied for function mark_response_live" (resolved to the new function, nothing executed), where
  a nonexistent function answers 404 PGRST202. The same probe: `reserve_video_upload` and
  `activate_video_upload` 42501 for `anon`; `GET /rest/v1/video_uploads` as `anon` 42501.
- **Functions, each by name with `--no-verify-jwt`, never `--prune`:** `mux-create-upload`
  10:40:40 to 10:40:47 (v2 to v3), `mux-upload-status` 10:41:44 to 10:41:50 (v2 to v3),
  `mux-webhook` 10:42:13 to 10:42:21 (v3 to v4). After each: `ACTIVE`, `verify_jwt` false, the
  downloaded source byte-identical to the branch's files for that function, then its checks:
  - `mux-create-upload`: 401 `unauthorized` with no token, a garbage token, the anon key and a
    forged ES256 token (well-formed, signed with a key generated for the test); `GET` 405. The
    ledger still 1 row afterwards.
  - `mux-upload-status` (for the founder's upload id): 401 with no token, garbage, the anon key and
    the forged ES256 token; a malformed upload id without a session 401 (authentication first).
  - `mux-webhook`: `GET` 405; unsigned, malformed, forged, 400 s stale and uppercase `v1`
    signatures all 401 `bad_signature`. No correctly signed request was sent.
- **After (10:42 to 10:44):** secrets the same 10 names and digests; `auth-signin-method` still v3
  with the same bundle hash; table counts identical except `video_uploads` 0 to 1; schema still
  equal to the tested post-migration schema; founder row md5 unchanged; Mux the same 1 upload and
  1 asset (ids, status, duration, playback id); `web_video` (anon) serves the founder response
  `live` with playback id `8UqSCXiojU36lJn802TM00UF6ehuCB5Q5NF8kZh502J6JU`; its HLS manifest HTTP 200.
- **No errors** in any deployment or check command. No rollback was needed or performed.
- **Logs not checked:** the CLI has no logs command and no CLI access token is stored in a file, so
  the function, gateway and Postgres logs for 10:36 to 10:45 UTC were not read. Nemat to check
  Dashboard, Logs (Edge Functions and Postgres) for that window: expected are only the 401 and 405
  answers above, the 42501 probes, and the migration.
- **Side effects of the method:** each CLI connection refreshed the CLI's temporary login role
  (`cli_login_postgres`), as for every linked command; nothing else was written. An earlier probe
  aimed by mistake at the development URL in `app/.env` (a LAN address) never connected.
- **Not verified on hosted:** a signed-in member minting, posting and playing a video through the
  new code (needs a device run and creates a Mux upload: Nemat's separate go-ahead); abandoned-URL
  cancellation against real Mux; a genuine signed `video.asset.ready` through the new webhook; the
  app changes (they need a new build; the installed founder build is compatible but keeps the
  silent-Post cases listed under the risks).

**Deployment risks** (as assessed before deployment; the window between migration and functions
was 3 min 18 s and no upload was in progress):

- **The window between steps 2 and 3:** a URL minted by the stage 1 function (for example on Post
  Review just before the push) is unknown to the ledger, so Post fails with `upload_not_found`. On
  a new build the app replaces it and posts; on the installed build Post does nothing, and leaving
  review and recording again mints a new one. Seconds to minutes; the founder only.
- **Installed founder build (no app change):** the normal path is compatible, and re-recording no
  longer exhausts the slots (the server retires abandoned URLs). Still silent on that build: Post
  when an upload limit is reached, Post for a restricted member (A-Restricted does not open), and
  Post with a review-time URL that has expired or was retired (only if Post Review stayed open over
  an hour, or 3 more URLs were minted elsewhere meanwhile). All fixed in the next build.
- **Draft failures surface on Home:** a draft that could not get a URL closes Post Review onto
  Your suggestions (as a successful save does); the banner is on Home, as it always has been for
  drafts.
- **Pre-beta follow-ups (section 1):** Post refused while creating the row, and restricted on
  Retry. Not part of stage 2.
- **Hourly limit and fast re-recording:** ten re-records in an hour now reach the hourly limit, with
  the accurate banner. That is the approved limit working as intended.
- **Drafts while posting is paused:** `post_draft` still does not check the restriction (unchanged
  from phase 6); minting does, so only a URL minted before the restriction, within its hour, can
  still save a private draft. The spec lists respond, reply, comment and suggest, not drafts.
- **Concurrency cost:** minting holds the member's `accounts` row lock for one short transaction;
  a retirement adds a Mux read and cancel (each with a 15 s timeout) before the mint, only at the
  3-URL cap.

**Not verified:** on the hosted project, what "Deployment, 12 Oct" lists; a real Mux upload or
cancellation through the new code (by decision, none was made; Mux's cancel was stubbed from its
documented behaviour); the app changes on a device or simulator (Jest only); an Android run. Still open after stage 2: deleted
videos stay playable at Mux; errored assets stay `processing`; direct reads of `profiles`,
`follows` and `comments` (section 13). (Deleted videos at Mux: built locally in stage 3, section
15; not deployed.)

## 15. Security stage 3: video deletion and the account purge (built 12 Oct; database migration deployed, worker configured, a first dry run and a canary dry run against real Mux 12 Oct, Nemat approved each; clean-up off)

Branch `claude/video-deletion-account-purge-d2b8ee`, on top of the deployed stage 2 head
(`5fabfaf`). Architecture accepted for continued local development (Nemat, 12 Oct); **hosted
deployment not approved.** Nothing was deployed, no hosted query was run, no real Mux asset or
upload was created or deleted, no secret changed, nothing pushed, no production schedule enabled.

**Retention, finalised** (Nemat, 12 Oct; `docs/DECISIONS.md`):

- A moderation case closes at the removal when no review is requested; at the decision when one is.
- A review requested before the asset is permanently deleted suspends clean-up until the decision.
- Private assets are kept for up to 30 days after the case closes, then deleted.
- After permanent deletion a restore is refused: `mod_restore_video` and a reversing
  `mod_decide_review` raise `asset_deleted` (`asset_being_deleted` while the worker is deleting it);
  the review stays pending for the moderator to decide; `mod_review_queue` shows
  `video_restorable` before they decide. The member can still request the review (the notice is
  unchanged); there is no copy for "reversed, but the video is gone" (see risks).
- After a purge, anonymised moderation records keep only what was done, to what kind of thing and
  when, for 90 days from the purge: no free-text reason, note, moderator, account, target, reporter
  or closer. Reports the purged account made against others keep their target (the case may still
  be open) but not the reporter.
- An author's deletion is effective even with open reports (the reports stay open).
- Anonymised tombstones of responses, video replies and comments stay while other people's replies
  need them.
- Successful clean-up jobs are kept, minimal (action, reason, Mux ids, times, outcome; no owner, no
  video), for 30 days; failed jobs and unproven orphans (`review`) are never discarded automatically.

**What was built** (migration `20261012000200_video_deletion_cleanup.sql`, the `mux-cleanup`
function, `MUX_API_BASE` in `_shared/mux.ts`, the pre-warm change in `mux-webhook` and
`mux-upload-status`; the app is unchanged):

- **Queue.** The state changes enqueue `delete_asset`, `sync_playback` and `cancel_upload` jobs in
  the same transaction (one open job per target; enqueueing again merges; a deletion keeps the later
  time). Leases of 120 s, one claimer at a time, never two jobs for one asset; dead workers' leases
  expire; only the lease holder records an outcome; backoff 1, 2, 4 ... minutes to 6 hours, 10
  attempts, then `failed`; `mux_cleanup_retry` re-queues. `mux_cleanup_overview` shows the switch,
  counts, due, stuck, dry-run plans, failures, review items and purge failures.
- **Two switches, both required for any change at Mux.** `mux_cleanup_settings.mode` in the
  database (`off` after the migration; `mux_cleanup_set_mode(mode, who)`), and the function's
  `MUX_CLEANUP_MODE` (unset means `dry_run`). The stricter applies. Off: `run_mux_cleanup` calls
  nothing and no job is leased. Dry run: the worker reads Mux (GET only), records on each job what
  it would do and releases it for an hour without using an attempt; the sweep queues and records
  nothing and answers what it would. Every POST, PUT and DELETE to Mux goes through a per-job guard
  that refuses outside live mode. Plus: no Vault secrets, no call; `MUX_API_BASE` (the fake-Mux
  hook for tests) accepts only `http` to 127.0.0.1, localhost or host.docker.internal, so on a
  hosted project it can only make Mux calls fail, never redirect them.
- **Ownership before any change.** The worker reads the object first; an asset's `passthrough` must
  be the recorded owner and its `upload_id` the recorded upload, an upload's passthrough likewise.
  A mismatch fails the job for a person, with nothing changed.
- **The database decides at the last moment** (`mux_cleanup_check`, called immediately before every
  change, extending the lease): for a deletion, the hold (in use by any live, processing or draft
  video; a removal's retention; an open review; an unexpired upload URL); for playback, whether the
  video should play now; for a cancellation, whether a video that can still go live uses the
  upload; and the switch. A restore checks again after Mux creates the playback id and deletes it at
  once if the video was deleted, removed or its account deleted meanwhile; the database records a
  restored id only if the video should still play (re-checked under its row lock). A moderator's
  restore is refused while a deletion runs. So a stale job can delay a change but never hand out a
  removed or deleted video: `video_visible` needs a playback id, and no path writes one for a video
  that must not play.
- **F5 to F8** as built on 12 Oct (author deletion deletes the asset; removal revokes playback and
  keeps the asset; account deletion revokes, recovery restores; per-account purge with tombstones
  and failure isolation; assets queued before rows go; ready events for untaken or deleted uploads;
  a daily sweep that queues ledger-proven orphans and only reports the rest).
- **However an account is deleted** (the scheduled purge; an Auth user deleted in the Supabase
  Dashboard, through the Admin API or in SQL, which cascades to `accounts`; or the `accounts` row
  deleted directly), a `BEFORE DELETE` trigger on `accounts` (`accounts_before_delete`) runs
  `prepare_account_removal` first: the account's assets, unfinished uploads and still-open upload
  URLs are queued with its id as owner (the jobs outlive its rows and its upload ledger); the
  tombstones other people's replies need are kept; its moderation records are anonymised by the
  approved policy (no free text, moderator, account, target or reporter); reports it made against
  others stay open, without the reporter; reports about it close. The purge only deletes the Auth
  user (jobs and closures marked `account_purged`); other deletions are marked `account_removed`.
  A failure in the trigger stops the deletion, so nothing is half removed.
- **Schedules:** `mux-cleanup` every minute (drain, only when something is due), `mux-sweep` 04:45
  UTC, `prune-moderation-records` 03:30, `prune-mux-cleanup-jobs` 03:40, `purge-deleted-accounts`
  03:15 (unchanged). All exist after the migration, and do nothing at Mux while the switch is off.

**Ordering, tested** (pgTAP 0010 section 8b, `cleanup_integration_test.ts`):

| Sequence | Outcome |
|---|---|
| Delete, then account deletion and recovery | Recovery queues nothing for the deleted video; its deletion goes ahead. |
| Account deletion, recovery and the video's deletion before the worker runs | The playback job reads "must not play"; a worker that restored anyway on the old state is not recorded; the deletion then removes the asset. |
| Removal, review, reversal | Playback restored with a new id; the retention's deletion, when due, finds the video live and is skipped. |
| Removal, restoration, removal | One playback job, which revokes (the last state); the retention runs from the second removal; no playback id is ever created. |
| Review after permanent deletion | Queue shows `video_restorable: false`; reversal refused (`asset_deleted`); review stays pending. |
| Late ready event after deletion | Asset recorded on the deleted video and queued; never pre-warmed; a second deletion finds it already gone. |
| Clean-up and recovery at the same time | A restore queued during a running revoke waits for it (one job per asset), then runs; a restore running when the account is deleted again removes the id it created and records nothing. |
| Duplicate and out-of-order jobs | Same target merges into one job; three workers at once act once per asset; a late answer from an expired lease is ignored. |

**Local checks** (isolated stack `shortcut-s3`, ports 556xx; the default `shortcut` stack untouched;
fake Mux everywhere; 12 Oct, final code including the account-deletion safeguard):

- pgTAP **986/986**: 0001 to 0009 unmodified (623), `0010_video_deletion.sql` **363** (section 7b:
  an Auth user deleted outside the purge, and an `accounts` row deleted directly: anonymised
  actions with no free text, the pending review closed, a report the account made on someone
  else's video still open, reports about it closed and anonymised, video and comment tombstones
  with other members' replies kept, every asset and the still-open upload URL queued with the
  owner's id, an expired URL not queued, the worker leasing with that id, and the scheduled purge
  keeping `account_purged`).
- Deno unit **21/21** (`mux_test.ts`, unmodified) and **8/8** (`cleanup_unit_test.ts`: the
  `MUX_API_BASE` allow-list, the switches, the change guard, dry runs, every answer of the
  last-moment check, ownership).
- Integration: stage 1 **20/20** and stage 2 **32/32** (both unmodified); stage 3
  `cleanup_integration_test.ts` **24/24** on three consecutive runs (in-process worker, real
  sessions, stateful fake Mux: the scenarios above, off, dry runs by either switch, retries, dead
  letter, ownership, purge, sweep, founder-like video untouched; and a member deleted through the
  Admin API, i.e. by Supabase Auth itself as the Dashboard does: anonymised, tombstoned, his report
  on another member's video still open, his assets deleted at the fake Mux after the ownership
  check, the removed one kept for its 30 days, his open upload URL cancelled, the other member's
  videos untouched).
- **Scheduler path, end to end** (`scripts/scheduler-integration.sh`,
  `scheduler_integration_test.ts`) **12/12** on six runs: pg_cron → `run_mux_cleanup` → pg_net →
  the real `mux-cleanup` in the local Edge runtime (through the gateway, as on hosted) → fake Mux
  over HTTP. Schedules present; missing secrets and switch off: no HTTP call; wrong key: 401,
  nothing done; unreachable worker: pg_net error, nothing changed, next run works; pg_cron firing on
  its own deletes an asset (seen in `cron.job_run_details`); a 503 retried with backoff; three
  concurrent calls delete each of five assets once; the Edge runtime killed mid-DELETE, the job
  leased again after its lease ran out and done once; dry run through the whole path reads only;
  the daily sweep queues a proven orphan, reports an unknown one, and the drain deletes only the
  orphan.
- `deno check` and `deno lint` clean (20 files). `scripts/auth-integration.mjs` **37/37**.
- App (unchanged on this branch): `tsc` clean, `expo lint` clean, Jest **96/96**. Run with the main
  checkout's `node_modules` (same `package.json` and lockfile as `5fabfaf`), because `npm ci` refuses
  here: **`app/package-lock.json` is out of sync with `app/package.json` on the deployed branch**
  (missing `react-native-gesture-handler` 3.3.0, `react-native-reanimated` 4.7.1 and others).
  Pre-existing; not changed; needs fixing before the next app build.
- **F6 reproduction** (stage 2 schema): a purge with another member's reply fails on
  `responses_root_response_id_fkey` and blocks a second due account; stage 3 purges both.
- **Migration rehearsal:** the 15 hosted migrations, no seed, the founder's response and ledger row
  recreated with their real ids and times, then only `20261012000200`: both rows' md5 unchanged;
  switch `off`; 0 jobs; `web_video` live with playback `8UqSC…6JU`; hold `infinity`; claim
  `{"jobs": [], "mode": "off"}`; with Vault secrets present `run_mux_cleanup` queued no HTTP call; a
  dry-run sweep listing its asset counts it `in_use`, would queue nothing.
- **Rollback rehearsal:** `supabase/rollback/20261012000200_video_deletion_cleanup.down.sql` on the
  stage 3 schema: `public` schema dump identical to stage 2's, the new cron jobs gone, 0001 to 0009
  pass 623/623. It refuses, changing nothing, once a tombstone or anonymised record exists (tested).

**First hosted preflight (12 Oct, 14:47 to 14:55 UTC; read-only; nothing deployed or written).** SQL ran
through the Management API (`supabase db query --linked --project-ref`) inside `READ ONLY`
transactions that were rolled back (`transaction_read_only` = `on` confirmed); Mux was read with
`GET`s only, with the hosted "Shortcut Beta" token (no value printed; the spike environment not
used); function sources downloaded into a scratch folder. Side effect, as for every linked CLI
command: the CLI's temporary login role (`cli_login_postgres`) was refreshed. The scratch folders'
link files were deleted afterwards; this worktree was never linked.

- *Scope.* Branch clean, `5fabfaf` an ancestor (9 stage 3 commits). `supabase db push --dry-run`
  from a clean copy of the branch's migrations: exactly `20261012000200_video_deletion_cleanup.sql`,
  no seeds, no roles. Hosted has the 15 migrations to `20261012000100`.
- *Schema.* A fingerprint of 657 objects (every `public` function with definition, owner,
  `SECURITY DEFINER`, `search_path` and grants; policies on `public` and `storage`; tables with RLS
  and grants; columns; constraints; indexes; triggers including `auth.users` and
  `auth.identities`; cron jobs; extensions; schema and default privileges; the `authenticator`
  setting): hosted equal to the local stack built from the same 15 migrations (md5
  `e7d34c921efad8726e47605abd4e64b4`). After the migration (as it was then) locally: 738 objects
  (md5 `b050f2f8413f8e3b5a048dcd467d87c2`): 630 unchanged (first reported as 626: the comparison
  keyed objects by kind and name, which folded the six default-privilege lines, three object types
  for each of `postgres` and `supabase_admin`, into two; the fingerprints hashed every line and were
  right), 27 changed (9 columns become nullable:
  `responses.author_id`, `comments.author_id` and `body`, `moderation_actions.account_id`,
  `moderator` and `reason`, `reports.reporter_id` and `target_id`, `review_requests.account_id`; 4
  constraints: `comments_body_check` and three foreign keys to `on delete set null`; 14 function
  bodies, each with owner, definer, `search_path` and grants unchanged), 81 added (tables
  `mux_cleanup_jobs`, `mux_cleanup_settings`, `account_purge_failures`, RLS on, no grants to `anon`
  or `authenticated`; 19 functions, none executable by `anon` or `authenticated`; 30 columns, 17
  constraints, 7 indexes, 1 trigger, 4 cron jobs), nothing removed.
- *Functions.* Deployed `auth-signin-method` v3, `mux-create-upload` v3, `mux-upload-status` v3,
  `mux-webhook` v4; the three Mux functions' source byte-identical to `5fabfaf`. No `mux-cleanup`.
  Secrets: the same 10 names as after stage 2; no `MUX_CLEANUP_*`. Vault: no secrets at all.
- *Data.* 1 auth user, account and profile (the founder: active, not deleted); 1 response (live);
  0 comments, likes, reports, moderation actions, review requests; 1 suggestion; ledger 1
  (`claimed`); push outbox 0 unsent; pg_net queue 0; 30 analytics events. Cron: `send-push`,
  `tonight-prompt`, `purge-deleted-accounts`, active, 0 failed runs in 24 h.
- *Founder.* Response `5b321c24-…`: `live`, author = ledger owner, ledger `claimed` and linked;
  `md5(row_to_json(r)::text)` = `c9918f8241a2c45eefb106b5d0ec0a8f`, identical to stage 2's record
  (`md5(r::text)` = `b34c6351f772039177c9c5dab03cc82d`); ledger `md5(u::text)` =
  `9726bb8fdf8d9eb0cb759d13ce59c8b6`. Mux: 1 asset (the founder's, `ready`, one public playback id
  `8UqSC…6JU`, passthrough = the founder, upload id matching), 1 upload (`asset_created`), 0 live
  streams; HLS manifest 200.
- *Automatic changes once the migration is in (switch off).* The migration itself writes one
  settings row (`off`), four cron rows, and a backfill that queues nothing on this data (0 deleted
  or removed videos with assets, 0 deleted accounts). Afterwards, on schedule:
  `mux-cleanup` (every minute) and `mux-sweep` (04:45) return at once while the switch is off (no
  HTTP call; without Vault secrets they would not call either); `prune-mux-cleanup-jobs` (03:40)
  can only delete finished jobs, of which there are none; `prune-moderation-records` (03:30) can
  only delete moderation records with no account (impossible today: the column is NOT NULL until
  the migration) and anonymised reports (the column is new); `purge-deleted-accounts` (03:15, an
  existing job) runs the **new purge at its next run**, which acts only on accounts deleted more than
  30 days ago: none today, and none can be due within 30 days of deployment. Rehearsed on the local
  stack with the same data: running all five commands changed no row in any table and queued no
  HTTP request.
- *Edge case found (not automatic; fixed since, see the account-deletion safeguard).* Deleting an Auth user outside the purge (dashboard, admin API,
  SQL) now sets moderation records' account, review requests' account and reports' reporter to null
  instead of cascading their deletion. The records keep their free-text reason and note
  (not anonymised); `prune_moderation_records` deletes such actions 90 days after they were
  *created* (at once if older); such reports are never pruned; and the rollback is refused
  afterwards. Reproduced locally. No such records exist on the hosted project.
- *When the rollback becomes unavailable.* It refuses once any of these exist: a tombstone (a video
  or comment with no author), a moderation action with no account, moderator or reason, a review
  request with no account, a report with no reporter or target. They arise only from (1) the 03:15
  purge removing an account (needs one deleted 30 or more days earlier), (2) an account deleted
  outside the purge (Dashboard, Admin API, SQL) that has videos others replied to, comments others
  replied to, moderation records or reports (since the safeguard these are anonymised, not
  orphaned), or (3) manual SQL. Rolling back also discards `mux_cleanup_jobs`; and once live, Mux
  deletions themselves cannot be undone.

**Second hosted preflight, after the safeguard (12 Oct, 15:12 to 15:16 UTC; read-only, same method;
nothing deployed or written).**

- *Unchanged since the first:* hosted fingerprint 657 objects, `e7d34c921efad8726e47605abd4e64b4`,
  equal to the tested stage 2 baseline; 15 migrations; 1 account (active, not deleted), 1 live
  response, 0 comments, reports, moderation actions, review requests; ledger 1 `claimed`; outbox,
  pg_net queue and Vault empty; cron `purge-deleted-accounts`, `send-push`, `tonight-prompt`, 0
  failures in 24 h; functions `auth-signin-method` v3, `mux-create-upload` v3, `mux-upload-status`
  v3, `mux-webhook` v4 (same bundle hashes); the same 10 secrets. Founder response
  `md5(row_to_json)` `c9918f8241a2c45eefb106b5d0ec0a8f` (`md5(r::text)` `b34c6351…`), ledger
  `md5(u::text)` `9726bb8fdf8d9eb0cb759d13ce59c8b6` (`md5(row_to_json)` `b3a49afe665431ac80aa1fac14aaddaa`).
  Mux: the founder's asset alone (ready, one public playback id, passthrough the founder), its
  upload, 0 live streams; HLS manifest 200.
- *Pending:* `supabase db push --dry-run` from a clean copy of the committed branch (`e66e866`):
  exactly `20261012000200_video_deletion_cleanup.sql`, byte-identical to the tested file; no seeds,
  no roles.
- *Expected after the push* (the local stack built from the same 15 migrations plus the revised
  one): **741 objects, md5 `8d15eb8ec1900b44deaa7c5e6ff7be9e`**: 630 unchanged, 27 changed (9
  columns made nullable, 4 constraints, 14 function bodies with grants unchanged), 84 added (3
  tables, 21 functions, 30 columns, 17 constraints, 7 indexes, 2 triggers including
  `accounts_before_delete`, 4 cron jobs), nothing removed; against the version reviewed in the
  first preflight: + `accounts_before_delete()`, `prepare_account_removal(uuid, text)` and the
  trigger, `purge_account` and the job-reason constraint changed. Cron afterwards:
  `mux-cleanup`, `mux-sweep`, `prune-moderation-records`, `prune-mux-cleanup-jobs`,
  `purge-deleted-accounts`, `send-push`, `tonight-prompt`. Rehearsed with the founder's rows: both
  unchanged, switch `off`, 0 jobs, video live, and all five scheduled commands changed nothing.

**Database-only deployment, 12 Oct (UTC; approved by Nemat).** Followed step 1 of the plan below
from `440056f` (clean tree; `supabase/` identical to the previewed `e66e866`). Read-only checks used
the preflight method (Management API, `READ ONLY` transactions rolled back; Mux `GET`s only).

- *Before (15:30 to 15:31):* `5fabfaf` an ancestor; hosted fingerprint 657 objects
  `e7d34c921efad8726e47605abd4e64b4`, line for line the tested stage 2 baseline; 15 migrations;
  founder response `md5(row_to_json)` `c9918f8241a2c45eefb106b5d0ec0a8f`, ledger `md5(u::text)`
  `9726bb8fdf8d9eb0cb759d13ce59c8b6`, `live`; 0 deleted accounts, 0 deleted or removed videos, 0
  moderation records or reports (nothing eligible for the purge or a prune); Vault empty; pg_net
  queue and responses 0; functions `auth-signin-method` v3, `mux-create-upload` v3,
  `mux-upload-status` v3, `mux-webhook` v4 (no `mux-cleanup`); 10 secrets, no `MUX_CLEANUP_*`;
  Mux 1 asset (the founder's) and 1 upload. Dry run from a fresh copy of the committed branch:
  exactly `20261012000200_video_deletion_cleanup.sql` (md5 `cafe15c06cb4d0990e411a7125121b98`,
  byte-identical to the tested file), no seeds, no roles.
- *Migration, 15:31:39 to 15:31:44:* `supabase db push --linked --project-ref picvoavfxnajfjkqawju
  --workdir <scratch> --yes`; "Applying migration 20261012000200_video_deletion_cleanup.sql",
  "Finished supabase db push", no error. Settings row written 15:31:43 (`off`, `migration`). No
  function, secret, Vault or setting changed.
- *After (15:32 to 15:37):* 16 migrations, latest `20261012000200`; fingerprint **741 objects,
  `8d15eb8ec1900b44deaa7c5e6ff7be9e`**, line for line the tested stage 3 schema; switch `off`; 0
  jobs, 0 purge failures; `accounts_before_delete` enabled; cron: `mux-cleanup` (* * * * *),
  `mux-sweep` (45 4), `prune-moderation-records` (30 3), `prune-mux-cleanup-jobs` (40 3), and
  `purge-deleted-accounts`, `send-push`, `tonight-prompt` with schedules and commands unchanged; all
  active. Data identical to before in every compared table (accounts, auth users, profiles,
  prompts, responses, video uploads and suggestions by row hash; comments, likes, follows,
  reports, moderation actions, review requests, activity, push outbox, analytics events by count);
  founder hashes as before, `live`; HLS manifest 200. Functions (versions and bundle hashes),
  secrets (names and digests) and Vault (empty) unchanged; Mux the same 1 asset and 1 upload.
- *Observed:* five scheduled `mux-cleanup` runs (15:32 to 15:36) and five `send-push` runs, all
  succeeded; no pg_net request queued or answered; no job created; no Mux call (no worker exists).
  The daily jobs (03:15 purge, 03:30 and 03:40 prunes, 04:45 sweep) have not run yet; on this data
  they have nothing to act on (rehearsed).
- *Rollback* remains available (no tombstone or anonymised record exists): the rollback file as a
  forward migration; nothing else to undo at this stage.

**Worker configuration, 12 Oct (UTC; approved by Nemat: step 2 only, the database switch to stay
`off`).** Followed step 2 of the plan below from `9c7250b` (clean tree; this worktree's branch
fast-forwarded to it). Deployment from a `git archive` of that commit's `supabase/` folder, never
linked; every command named the project (`--project-ref picvoavfxnajfjkqawju`); no `--prune`; Mux
credentials not touched. Read-only checks used the preflight method (Management API, `READ ONLY`
transactions rolled back; Mux `GET`s with the Shortcut Beta token, which matches the hosted
`MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` by digest). No secret value was printed or committed.

- *Before (15:45 to 15:47):* 16 migrations; fingerprint 741 objects `8d15eb8ec1900b44deaa7c5e6ff7be9e`,
  line for line the step 1 record; switch `off` (`migration`, 15:31:43); 0 jobs, 0 purge failures,
  0 deleted accounts, 0 deleted or removed videos, 0 `processing` or `draft` rows, 0 open upload
  URLs; Vault empty; pg_net queue and responses 0; cron the same 7 jobs, 14 `mux-cleanup` runs since
  step 1, all succeeded. Every table hash identical to the step 1 record; founder response
  `md5(row_to_json)` `c9918f8241a2c45eefb106b5d0ec0a8f`, ledger `md5(u::text)`
  `9726bb8fdf8d9eb0cb759d13ce59c8b6`, `live`. Functions `auth-signin-method` v3, `mux-create-upload`
  v3, `mux-upload-status` v3, `mux-webhook` v4 (bundle hashes as at step 1), deployed `mux-webhook`
  and `mux-upload-status` source byte-identical to `5fabfaf`; the same 10 secrets and digests. Mux:
  the founder's asset alone (`ready`, one public playback id, passthrough the founder) and its
  upload, 0 live streams; HLS 200. Locally on `9c7250b`: `deno check` and `deno lint` clean, Deno
  unit 29/29 (`mux_test.ts`, `cleanup_unit_test.ts`).
- *`MUX_CLEANUP_KEY`, 15:47:15 to 15:47:19:* 64 random hex characters (`openssl rand -hex 32`),
  written to the git-ignored, mode-600 `supabase/.env.mux-cleanup` in the main checkout (next to
  `.env.mux-hosted`) and set with `supabase secrets set --env-file`, so the value was never on a
  command line. Then 11 secrets: the 10 earlier ones with unchanged digests, the new one matching
  the file by digest. **`MUX_CLEANUP_MODE` not set** (the function's mode is `dry_run`).
- *`mux-cleanup`, 15:47:47 to 15:47:56:* `supabase functions deploy mux-cleanup --no-verify-jwt`:
  v1, `ACTIVE`, `verify_jwt` false. The secret change moved every other function up one version with
  unchanged bundle hashes (platform behaviour, section 12).
- *Vault, 15:49:18:* `mux_cleanup_url` (`https://picvoavfxnajfjkqawju.supabase.co/functions/v1/mux-cleanup`)
  and `mux_cleanup_key` (the same value as the function secret), from a mode-600 SQL file deleted
  straight after. Both match by digest; no other Vault secret.
- *`mux-webhook`, 15:49:53 to 15:50:00 (v5 to v6) and `mux-upload-status`, 15:50:00 to 15:50:07 (v4
  to v5):* by name with `--no-verify-jwt`, nobody posting (0 `processing` or `draft` rows, 0 open
  upload URLs). Downloaded afterwards, all three functions' sources are byte-identical to `9c7250b`,
  four files each (`index.ts`, `handler.ts`, `_shared/mux.ts`, `_shared/supabase.ts`), no test file.

Checks (15:48 to 15:53):

- *`mux-cleanup`:* `GET`, `PUT`, `DELETE` 405 (`GET` with the correct key too). `POST` 401
  `unauthorized` with no `Authorization`, `Bearer garbage`, a wrong 64-hex key, the right key
  without `Bearer`, the right key in an `apikey` header only, the legacy anon key, the legacy
  service-role key and the publishable key; the new-style secret key is refused by the gateway
  (401 "Invalid API key") before the function. With the right key, immediately after confirming
  the switch `off`: `drain` (and an empty body) 200 `{"ok":true,"mode":"off","claimed":0, ...}`, all
  counts 0; `sweep` 200 `{"ok":true,"mode":"off","skipped":"off"}`, which returns before any Mux
  call; an unknown mode 400 `invalid_mode`. No job was claimed, created or changed.
- *Existing functions:* `mux-webhook` `GET` 405; unsigned, malformed, `t` without `v1`, forged
  `v1` with a current `t`, two forged `v1`, a 400 s stale `t` and an uppercase `v1` all 401
  `bad_signature` (no correctly signed request sent). `mux-upload-status` (founder's upload id) 401
  with no token, garbage, the anon key and the publishable key; a malformed upload id without a
  session 401. `mux-create-upload` `GET` 405; 401 with no token, garbage, the anon key and the
  publishable key. `auth-signin-method` not redeployed (bundle hash unchanged).
- *Scheduler, with both Vault secrets present:* every `mux-cleanup` run from 15:50:00 to
  15:53:00 (four runs; 22 since step 1) succeeded in 2 to 4 ms (no HTTP call: `run_mux_cleanup` returns while the switch is
  `off`, before reading Vault); pg_net queue 0 and `net._http_response` empty (no request ever
  made by pg_net on this project); 0 jobs; no `mux-sweep` run yet (04:45). `send-push` and
  `tonight-prompt` succeeded throughout.
- *After (15:52 to 15:53):* fingerprint 741 / `8d15eb8e…`, line for line unchanged (functions,
  grants, policies, RLS, triggers, cron, default privileges, the `authenticator` setting); switch
  `off` (`migration`, 15:31:43); every table hash and both founder hashes identical, the only
  difference in the snapshot the two Vault names; Mux the same 1 asset and 1 upload (ids, status,
  playback id, passthrough), 0 live streams; HLS 200. Functions now `auth-signin-method` v4,
  `mux-create-upload` v4 (bundle hashes unchanged), `mux-upload-status` v5, `mux-webhook` v6,
  `mux-cleanup` v1, all `ACTIVE`, `verify_jwt` false. Secrets 11 (the 10 unchanged plus
  `MUX_CLEANUP_KEY`); no `MUX_CLEANUP_MODE`.
- *No Mux traffic from clean-up:* the switch was `off` throughout, so `mux_cleanup_claim` leased
  nothing, `sweep` stopped before listing, and the scheduler made no HTTP call; the Mux inventory is
  unchanged. The only Mux requests were this check's own `GET`s.
- *Not checked:* the Edge Function, gateway and Postgres logs (the CLI has no logs command and the
  Dashboard needs a sign-in; Nemat to look at 15:45 to 15:55 UTC: expected only the 401, 405 and
  400 answers and three 200s from `mux-cleanup` above, and the deployments); the Auth configuration
  was not read back (no Auth command was run); `mux-create-upload` still runs the stage 2
  `_shared/mux.ts` (not redeployed, by the plan; the stage 3 change there only adds the
  local-only `MUX_API_BASE` hook).
- *Side effects of the method:* the CLI's temporary login role refreshed on each linked command;
  the scratch folders' link files deleted afterwards.
- *Undoing step 2, not reviewed and not done:* redeploy `mux-webhook` and `mux-upload-status` from
  `5fabfaf`; delete the `mux-cleanup` function, the `MUX_CLEANUP_KEY` secret and the two Vault
  secrets. None of it is needed to keep clean-up inert: the database switch alone does that.

**Controlled dry run, 12 Oct (UTC; approved by Nemat: step 3 as one read-only verification, the
switch back to `off` afterwards).** From `dc8c495` (clean tree); same read-only method. Only the
database switch changed; no function, secret, Vault entry or bundle was touched; `MUX_CLEANUP_MODE`
stayed unset (the function's mode `dry_run`), so neither switch ever allowed a change at Mux.

- *Preflight (15:58:40 to 15:59:11):* 16 migrations; fingerprint 741 /
  `8d15eb8ec1900b44deaa7c5e6ff7be9e`, line for line the step 1 record; switch `off` (`migration`,
  15:31:43); 0 jobs, 0 purge failures, empty overview (no due, stuck, failed, review or dry-run
  items); pg_net queue and responses 0; every table hash as at the end of step 2; founder response
  `md5(row_to_json)` `c9918f8241a2c45eefb106b5d0ec0a8f`, ledger `md5(u::text)`
  `9726bb8fdf8d9eb0cb759d13ce59c8b6`, `live`, 0 deleted accounts, 0 deleted or removed videos;
  functions and the 11 secrets as at the end of step 2, no `MUX_CLEANUP_MODE`; Mux the founder's
  asset and upload only, 0 live streams; HLS 200.
- *Dry run on, 15:59:24:* `select public.mux_cleanup_set_mode('dry_run', 'Nemat: stage 3 step 3 dry
  run (Claude Code)')`; 0 jobs.
- *One manual sweep, 15:59:38:* `select public.run_mux_cleanup('sweep')`, so pg_cron's own path:
  pg_net to the hosted gateway with the Vault key, then the worker. pg_net response 1: HTTP 200,
  not timed out, no error, body `{"ok":true,"mode":"dry_run","listed":1,"complete":true,
  "listError":null,"seen":1,"young":0,"in_use":1,"queued":0,"review":0,"dry_run":true,
  "would_queue":[],"would_review":[]}`. The worker's Mux requests: one `GET
  /video/v1/assets?limit=100&page=1` (one page, as fewer than 100 came back), answered without
  error; the sweep has no other Mux call, and its database call ran with `p_dry_run` true, which
  queues and records nothing. **Classification:** the one asset listed, the founder's
  (`L7KxG29…UVc`, created 11 Oct 08:02:25 UTC, older than the 24-hour minimum, so judged and not
  counted `young`), `in_use` because its response is `live`. Nothing would be queued for deletion,
  cancellation or a playback change, nothing would go for review, no ownership mismatch, no
  unexpected asset or provider answer.
- *Overview and queue during the dry run (16:00:07, 16:02:15):* `mode` `dry_run`; 0 jobs; due,
  stuck 0; `dry_run_planned`, `failed`, `review`, `purge_failures` empty.
- *Scheduler in `dry_run`:* `mux-cleanup` at 16:00:00, 16:01:00 and 16:02:00 succeeded (11, 6 and
  4 ms); with no job due, `run_mux_cleanup('drain')` returns before calling, so no pg_net request
  (still the one response). `send-push` and `tonight-prompt` succeeded throughout; the daily jobs
  did not run.
- *Mux, read by this check (`GET` only, the Shortcut Beta token):* asset, upload and live-stream
  lists before, during (16:00:20) and after, and the founder's asset by id: `ready`, 9.91 s, one
  public playback id `8UqSC…6JU`, no errors; identical each time.
- *Dry run off, 16:02:25:* `select public.mux_cleanup_set_mode('off', 'Nemat: stage 3 step 3 dry run
  finished (Claude Code)')`. The switch was `dry_run` for 3 min 1 s. The 16:03:00 run succeeded
  (2 ms) with no request.
- *After (16:02:44 to 16:03:15):* switch `off`; fingerprint 741 / `8d15eb8e…`, line for line
  unchanged; every table hash and both founder hashes unchanged, `live` (the only snapshot change:
  pg_net's one stored response); 0 jobs, 0 purge failures, empty overview; Vault the same two
  secrets, digests and timestamps (15:49:18); functions unchanged (versions, bundle hashes,
  `verify_jwt`, update times); secrets the same 11, no `MUX_CLEANUP_MODE`; Mux the same asset,
  upload and playback id, 0 live streams; HLS 200.
- *No destructive operation:* no job existed, so the worker never read or planned a single asset
  or upload and never reached its change guard; no Mux object changed. Mux's own request log is not
  available through the API, so "no `POST`, `PUT` or `DELETE`" rests on the code path, the response
  body and the unchanged inventory.
- *Errors:* none in any command, pg_net response or cron run. Edge Function, gateway and Postgres
  logs not read (Dashboard sign-in needed; Nemat to look at 15:59 to 16:04 UTC: expected one 200
  `POST` to `mux-cleanup` at 15:59:38, its sweep log line, and the switch updates).

**Still to verify before real deletion (step 4):** a dry run with real jobs. Every per-job read
(`GET` of one asset or upload), the ownership check on real `passthrough` and `upload_id` values,
and the plans for a deletion, a playback revocation or restore and an upload cancellation have
run only against the fake Mux, because the hosted queue has never held a job. The safest way to
get one is the step 4 test video (Nemat records and deletes it) watched first in `dry_run`: its
`dry_run_planned` entry should read `delete` with the right asset and owner before `live` is set.
Also: Mux listing past one page; a sweep finding an orphan or unknown asset; the daily jobs on
hosted; the function logs; the playback-id `POST` and `DELETE` and asset `DELETE` endpoints, which
first run for real in step 4 and cannot be undone.

**Canary dry run against real Mux (step 4A), 12 Oct (UTC; approved by Nemat: one disposable video,
a dry run of its clean-up job, no change at Mux by the clean-up).** Same read-only method; Nemat
recorded, posted and deleted on the iPhone (founder Release build from `ede68ed`).

- *Preflight (16:10 to 16:11):* as at the end of step 3 (fingerprint 741 / `8d15eb8e…` line for
  line; switch `off`; no `MUX_CLEANUP_MODE`; 0 jobs, 0 purge failures; no cron failure in 24 h;
  founder hashes, functions, 11 secrets, Mux inventory unchanged; HLS 200).
- *Capacity:* Mux is on the free plan, "up to 10 videos" (Nemat, Billing, 12 Oct; confirmed after
  the upload, not before it). Assets: Shortcut Beta 1 before the test, 2 after; the spike
  environment 7 (read with the spike token, `GET` only). If the cap is account-wide that is 9 of 10
  now, 8 after step 4B.
- *Flow chosen:* a video reply to the founder's own response (no new prompt): the app offers
  "Reply to {name}" on your own videos; `post_reply` allows it; the reply count is computed, so the
  root row does not change; a self-reply creates no activity row.
- *The test video* (all ids recorded apart from the founder's): reply
  `6f600f9e-3559-4911-9ebf-13d9d3df509d` (kind `reply`, `reply_to_id` and `root_response_id` the
  founder's response, same prompt, no caption, 6,012 ms); ledger `78de8408-d6d9-476b-a080-2e326907cd39`
  (`claimed`, the founder's account, linked to the reply); Mux upload
  `iEkMuSYobsEnQJgDlmR02PA4mct02AczR7ZADZ3hbAp9s` (`asset_created`, passthrough the founder); asset
  `M00202rDaKgn4p02DcDE1hFmBzl00Ru2T00evvf00W02mJt2RA` (`ready`, 6.01 s, upload id and passthrough
  matching the ledger, no errors); public playback id `wHPWZuGF51kjQ1AVT9VlaEukVdwYuzEAGre02dfsjqKM`
  (HLS 200). Times: URL minted 16:39:01, `post_reply` 16:39:21, asset created 16:39:25, `live`
  16:39:27, `video_published` on the phone 16:39:29; played on the iPhone (Nemat).
- *Webhook:* `mux-webhook` booted five times (16:38:30, 16:39:03, 16:39:25, 16:39:26, 16:39:26), and
  Supabase's invocation log shows all five `POST`s answered **200** (Nemat, Dashboard), so all were
  signed correctly and accepted. Which path set the reply `live` (the ready event or the app's
  `mux-upload-status` check) is still not recorded anywhere.
- *Deviation: a second upload URL.* Ledger `72561473-6f33-40f5-ba03-0b4f7409015f`, Mux upload
  `Tm01xbKSZYEWRnHW61E97FLJxhRk00PjFtdYsTz8EY02UM`, minted 16:38:28, never claimed: the app's own
  events show two recordings (`record_started` 16:38:19, `record_completed` 16:38:27, 8 s; again
  16:38:53 and 16:39:00, 7 s), so Post Review opened twice and minted twice (as designed: it mints
  on opening). Nemat did not notice a re-record. It holds no asset (Mux `waiting`, then `timed_out`
  after 17:38:28) and is not a clean-up target; the ledger row stays `active` with an expired URL.
- *Deletion (16:53:19, Nemat, Me → Replies → More → Delete reply):* the reply `deleted`, author the
  founder, asset, upload and playback id still recorded. Read paths, each in a rolled-back `READ
  ONLY` transaction as the founder (`authenticated`) or `anon`: `get_video(reply)` and
  `web_video(reply)` `{"status": "unavailable"}`; `reply_room(root)` and `profile_replies(founder)`
  without it; the founder's response still served with its playback id. The app kept the card in
  Me → Replies until restarted (section 1). **At Mux the deleted reply is still public** (HLS 200
  for its playback id): that is what step 4B removes.
- *The job, queued by the deletion (switch `off`):* exactly one job in the queue, `45c34fbc-ef5c-46aa-9efa-d999bf1a3984`:
  `delete_asset`, `author_deleted`, `pending`, 0 attempts, asset `M00202rD…RA`, upload
  `iEkMuSYo…9s`, response the reply, owner the founder; hold none (due at once). Nothing references
  the founder's asset or upload.
- *Dry run on, 16:59:21* (`mux_cleanup_set_mode('dry_run', 'Nemat: stage 3 step 4A canary dry run
  (Claude Code)')`), immediately after confirming exactly that one job; then
  `select public.run_mux_cleanup('drain')` at 16:59:27. pg_net response 2: HTTP 200, body
  `{"ok":true,"mode":"dry_run","claimed":1,"done":0,"found_asset":0,"retry":0,"release":1,
  "skipped":0,"failed":0,"stale":0,"unrecorded":0}`. The worker leased the job, read the asset with
  one `GET /video/v1/assets/M00202rD…RA`, found its id, passthrough (the owner) and upload id (the
  job's) matching (a mismatch would have failed the job `not_verified`), and released it with the
  plan. The deletion plan reads the asset only; the upload was read by this check's own `GET`s
  (`asset_created`, that asset, passthrough the founder).
- *Recorded plan:* `result` `{"dry_run": true, "would": {"act": "delete"}}`, status `pending`,
  attempts back to 0, `not_before` 17:59:29 (an hour), no error; `mux_cleanup_overview()` lists it
  under `dry_run_planned` with that asset and upload. **Planned action: delete asset
  `M00202rDaKgn4p02DcDE1hFmBzl00Ru2T00evvf00W02mJt2RA`.** No other asset was selected.
- *Scheduler:* the 17:00:00 run succeeded (7 ms) with no request (the job not due until 17:59).
- *Dry run off, 17:00:12* (`mux_cleanup_set_mode('off', 'Nemat: stage 3 step 4A canary dry run
  finished (Claude Code)')`); on for 51 s.
- *No change at Mux by the clean-up:* the change guard is reached only in live mode, and the
  response shows no `done`; Mux assets, uploads and playback ids identical before and after (the
  test asset and its public playback id still there). Mux's own request log is not available
  through the API.
- *After (17:00:33 to 17:00:58):* switch `off`; fingerprint unchanged; founder hashes unchanged,
  `live`, HLS 200; the only data changes are the test's (responses 2, the reply `deleted`; ledger 3;
  analytics 47; pg_net responses 2); the job kept, `pending` with its plan, for step 4B; Vault,
  functions (versions and bundles) and the 11 secrets unchanged, no `MUX_CLEANUP_MODE`.
- *For step 4B:* `MUX_CLEANUP_MODE=live` on the function (a secret change moves every function up
  one version), then `mux_cleanup_set_mode('live', …)`, which makes this dry-run job due at once:
  the next scheduled run deletes the asset within a minute. The job is the only one in the queue;
  check again first, as anything queued meanwhile would run too.

**Staged deployment plan** (each stage needs Nemat's separate go-ahead; steps 1 and 2 done 12 Oct, step 3's first verification done 12 Oct with the switch back to `off`, step 4A (canary dry run) done 12 Oct with the switch back to `off`, real deletion not approved):

0. *Preflight, read-only.* Hosted fingerprint equal to the tested stage 2 schema; dry run lists
   exactly `20261012000200`; deployed `mux-webhook` and `mux-upload-status` byte-identical to
   `5fabfaf`; founder row md5; Mux asset and upload counts (`GET` only); 0 `deleted`, `removed` or
   `draft` rows and 0 deleted accounts (so the backfill queues nothing).
1. *Database only (safe).* From a fresh scratch folder holding exactly the branch's migrations,
   `config.toml` and templates: `supabase db push --linked --project-ref picvoavfxnajfjkqawju
   --workdir <scratch> --dry-run` (exactly the one file), then the same with `--yes`. No seed, no
   roles, no function, no secret, no Vault change. The switch is `off`, no secrets exist, no
   worker is deployed: nothing can reach Mux. Deletions hide videos in the app and web as today,
   and jobs accumulate. Checks: fingerprint 741 / `8d15eb8e…`; switch `off` (`changed_by`
   `migration`); 0 jobs and 0 purge failures; the 7 cron jobs; founder hashes as above and playing;
   Mux inventory unchanged; after a few minutes `mux-cleanup` runs succeed with no `pg_net`
   request. Stop at once if any of these differs, the push errors, or an account becomes deleted
   before the rollback window is decided. Rollback: the rollback file as a forward migration, while
   no tombstone or anonymised record exists (no function to redeploy at this stage).
2. *Worker configuration, still inert.* Deploy `mux-cleanup` (`--no-verify-jwt`) with
   `MUX_CLEANUP_KEY` and **`MUX_CLEANUP_MODE` unset (dry run)**; create the two Vault secrets
   (README). Redeploy `mux-webhook` and `mux-upload-status`. Checks: 401 without the key and with
   the service key, 405 to GET. The switch is still off: still nothing is called.
3. *Dry run.* `select public.mux_cleanup_set_mode('dry_run', '<who>')`. The worker now reads Mux
   (GET only) and records plans; one manual `select public.run_mux_cleanup('sweep')`. Review
   `mux_cleanup_overview()` (`dry_run_planned`, `failed`, `review`) and the function logs for a few
   days: expected plans only for videos deliberately deleted or removed; the founder's asset
   `in_use`. Any `not_verified` failure is a stop.
4. *Real deletion, authorised separately.* Set `MUX_CLEANUP_MODE=live` on the function, then
   `select public.mux_cleanup_set_mode('live', '<who>')`. Suggested first: one test video Nemat
   records and deletes on purpose, the overview and logs watched; then the backlog. To stop at once
   at any time: `mux_cleanup_set_mode('off', '<who>')` (or unset the function's variable).

**Remaining risks:**

- **Mux deletions cannot be undone**, and stage 4 is the first contact with real Mux; the playback-id
  endpoints, the asset listing and its `upload_id`, `passthrough` and `created_at` fields are
  implemented from Mux's documented API and exercised only against the fake. Stage 3 (dry run)
  exists to check the reads first.
- **Windows of milliseconds remain** between the last check and Mux acting: a review requested in
  that instant, after a deletion's final check, does not stop it. A restore's new id is removed if
  the state changes meanwhile, but exists at Mux for that instant (it is never handed out).
- **CDN caching:** after revocation or deletion, segments already cached may play briefly.
- **Latency:** about a minute (the cron) for revocation and restore; a restored video is hidden
  until its new id exists.
- **No copy for a reversed review whose video is gone**: the moderator must uphold or handle it by
  hand; if "reversed, video not restored" should exist, it needs wording (and maybe a board).
- **Mux rate limits** on a large purge: 429s are retried with backoff.
- **The scheduler test replaces the local stack's Edge runtime** while it runs (documented in the
  script).
- **`app/package-lock.json` out of sync** (above): a fresh `npm ci` fails on the deployed branch.

**Verified on the hosted project** (12 Oct; steps 1 to 4A above): the migration and the schema it
produces; the worker deployed, its key and the Vault secrets; the worker's 401 and 405 answers;
the scheduler with the switch `off` (no HTTP call) and in `dry_run` with no job due (no HTTP call);
the hosted gateway passing pg_net's call to the worker with the Vault key (200); one dry-run sweep
reading the real Shortcut Beta asset list and classifying the founder's asset `in_use`; the switch
back to `off`; the founder's rows, asset, playback id and HLS unchanged throughout. Step 4A: a
video reply posted on the iPhone through the stage 2 ledger (owner, upload, passthrough matching),
five signed webhook deliveries answered 200, the author's deletion hiding it from every app read
path and queuing exactly one `delete_asset` job with the right asset, upload and owner, and that
job's dry run against real Mux (one `GET` of the asset, the ownership check on real `passthrough`
and `upload_id` values passing, plan `delete`, recorded and kept for step 4B).

**Not verified:** any change at Mux (deleting an asset, creating or deleting a playback id,
cancelling an upload: the first is the step 4B test); dry runs of a playback revocation or restore
and of an upload cancellation against real Mux (no such job has existed on hosted); a sweep that finds an orphan or an unknown asset; Mux listing beyond one
page; the daily jobs (03:15 purge, 03:30 and 03:40 prunes, 04:45 sweep) on hosted, which have
nothing to act on yet; the Edge Function, gateway and Postgres logs beyond the webhook invocations
Nemat read for step 4A; which path set the reply `live`; Android. Still open:
errored assets stay `processing`; direct reads of `profiles`, `follows` and `comments`
(section 13).

## Gates

- **Gate 1** (video provider and camera library picked): open. Mux and expo-camera are the
  provisional stack on the iPhone spike evidence (`docs/DECISIONS.md`, 6 Oct). Closes only when Nemat
  approves it; the Android spike run (section 3) has not happened. 11 Oct: the founder iPhone build
  took the first response through expo-camera and Mux on the hosted project (section 12); that
  is iPhone evidence only and does not close the gate.
- **Gate 2** (Nemat can sign up on iOS and Android): open. Depends on phase 2 on a real iPhone and a
  real Android against the hosted project (sections 2 and 3). Done 9 Oct: hosted email sign-in
  works through the Auth API (section 10); `auth-signin-method` deployed 10 Oct; on 10 Oct the
  founder iPhone build (section 11) signed Nemat in by email code in the app, through 18+, up to
  the invite step. Still needed: an invite code on the hosted project (`invite_required` is on,
  0 invites; `LINKED=1 scripts/create-invite.sh`); a build signed by the paid Apple team with
  Sign in with Apple (B-1 to B-4) and a real Android phone; Apple and Google credentials for the
  hosted project; then Nemat signs up in the app with email, Apple and Google on both.
- **Gate 5** (safety complete, before any outside tester): open. Depends on sections 3 (phase 5 on
  a device), 4 (guidelines), 7 (the web admin) and B-2.
- **Gate 7** (the closed beta opens in Canggu): open. Depends on everything above.
