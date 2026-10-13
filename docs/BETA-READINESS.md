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
| Duplicate upload URLs (seen 12 Oct step 4A and 13 Oct CP0) | fixed locally 13 Oct, not built | Post Review's URL request raced Post's; double taps and the disclosure sheet's Post could submit twice; Retry minted on each attempt. App-only fix in section 16 (one URL per member at a time, single-flight Post, once per recording). Needs review, a founder build and the device checks in section 16. | On the iPhone: Post at once, double-tap, the disclosure Post and two re-records each leave exactly one `video_uploads` row per post. |
| iOS uploads run in a background `URLSession` (SPEC.md Sections 2 and 19) | needs decision | `putRecording` uses expo-file-system's default `sessionType` (`background`), so an upload can continue after the app closes, against the spec's non-goal; Retry after reopening can PUT again or leave an orphan asset. Proposed: `sessionType: 'foreground'` (section 16). Not changed. | Decided by Nemat; if changed, a device test of going to the Home screen and force-quitting mid-upload shows Retry and one upload, no orphan. |
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

## 15. Security stage 3: video deletion and the account purge (built 12 Oct; database migration deployed, worker configured, a first dry run, a canary dry run against real Mux and the first real Mux deletion (the canary) 12 Oct, Nemat approved each; clean-up off; remaining-operations test plan accepted 13 Oct; reliability fixes G1, G2, G5, G6 built locally 13 Oct; R0 read-only hosted preflight 13 Oct; R0 step A, the migration, deployed 13 Oct 02:12 UTC; R0 step B, the worker (`mux-cleanup` v4), deployed 13 Oct 02:30 UTC; CP0, test account T1 and its video V, 13 Oct; Test A1, V removed by a moderator and its playback revocation dry-run against real Mux, 13 Oct 09:12 to 09:21 UTC; Test A2, the first real playback revocation (P1), 13 Oct 09:38 UTC, Nemat approved; Test B1, V restored by a moderator and its playback restoration dry-run against real Mux, 13 Oct 09:59 to 10:11 UTC; Test B2, the first real playback restoration (P2), 13 Oct 10:33 UTC, Nemat approved; clean-up off)

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

**First real Mux deletion (step 4B), 12 Oct (UTC; approved by Nemat: one irreversible deletion,
job `45c34fbc-ef5c-46aa-9efa-d999bf1a3984`, asset `M00202rDaKgn4p02DcDE1hFmBzl00Ru2T00evvf00W02mJt2RA`,
reply `6f600f9e-3559-4911-9ebf-13d9d3df509d`; nothing else).** From `d7c99b5` (clean tree; this
worktree's branch moved to it). Same read-only method as before (Management API, `READ ONLY`
transactions rolled back; Mux `GET`s with the Shortcut Beta token, and the spike token for the
spike inventory). Only three writes were made: the function variable, the database switch with
one drain, and both back. No secret value was printed or committed.

- *Preflight (17:10:26 to 17:14:01):* 16 migrations, latest `20261012000200`; fingerprint 741 /
  `8d15eb8ec1900b44deaa7c5e6ff7be9e`, line for line the step 4A record; switch `off` (17:00:12,
  "step 4A canary dry run finished"); no `MUX_CLEANUP_MODE`. Queue: exactly one job, the canary,
  `pending`, `delete_asset`, `author_deleted`, 0 attempts, asset, upload (`iEkMuSYo…9s`), reply and
  owner (the founder) as approved, its dry-run plan `delete`; 0 executable others (no deletion,
  cancellation, playback or orphan job of any status), 0 failed, review or purge failures. Reply
  `deleted` (16:53:19), author the founder, its asset and upload the job's, no `removed_action_id`;
  the only row using that asset or upload; hold `null`; 0 reports, moderation actions, review
  requests; ledger `iEkMuSYo` `claimed` by the founder for the reply. Founder response `live`,
  `md5(row_to_json)` `c9918f8241a2c45eefb106b5d0ec0a8f`, ledger `md5(u::text)`
  `9726bb8fdf8d9eb0cb759d13ce59c8b6`, no job touching its asset, upload or row. Every table hash,
  Vault (2 secrets, 15:49:18), pg_net (queue 0, responses 2), the 7 cron jobs (0 failures since
  step 4A), the 11 secrets (names, digests and times) and the 5 functions (versions and bundles)
  identical to the end of step 4A; deployed `mux-cleanup` (with `_shared/mux.ts`,
  `_shared/supabase.ts`) byte-identical to the branch; `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` match
  `.env.mux-hosted` and `MUX_CLEANUP_KEY` matches `.env.mux-cleanup` by digest. Mux, Shortcut Beta:
  2 assets, the canary (`ready`, 6.01 s, upload id the job's, passthrough the founder, one public
  playback id `wHPWZ…KM`, HLS 200) and the founder's (`L7KxG29…UVc`, `ready`, 9.91 s, public
  playback `8UqSC…6JU`, HLS 200); 3 uploads (the canary's and the founder's `asset_created`, the
  unclaimed `Tm01xbKS…` `waiting`); 0 live streams. Spike environment: 7 assets, 25 uploads
  (inventory hash recorded). The webhook ignores every event except `video.asset.ready`, so Mux's
  deletion event cannot change the database.
- *Function variable, 17:14:04 to 17:14:07:* `supabase secrets set MUX_CLEANUP_MODE=live`. Checked at
  17:14:35: 12 secrets, `MUX_CLEANUP_MODE` digest = sha256(`live`) (17:14:05), the other 11
  unchanged (digests and times); every function up one version with an unchanged bundle
  (`auth-signin-method` v5, `mux-cleanup` v2, `mux-create-upload` v5, `mux-upload-status` v6,
  `mux-webhook` v7); `mux-cleanup` downloaded again, byte-identical; database switch still `off`,
  1 executable job, pg_net queue 0.
- *Activation, one drain (17:16:03 to 17:16:25):* timed to start just after the 17:16:00 cron tick.
  One transaction re-checked every precondition (switch `off`; exactly one `pending` or `running`
  job and it is the canary with the approved fields; reply `deleted`; hold `null`; founder `live`;
  no job touching the founder; pg_net queue empty; any difference would have raised and rolled
  back), then `mux_cleanup_set_mode('live', 'Nemat: stage 3 step 4B canary deletion (Claude Code)')`
  and one `select public.run_mux_cleanup('drain')`; committed at **17:16:06.016** (the job's
  `not_before` set to that moment, one pg_net request queued). No manual sweep; no other drain.
- *The worker's result:* pg_net response 3, **HTTP 200**, not timed out, no error, body
  `{"ok":true,"mode":"live","claimed":1,"done":1,"found_asset":0,"retry":0,"release":0,"skipped":0,
  "failed":0,"stale":0,"unrecorded":0}`. The worker leased the job (attempt 1), read the asset
  (`GET`), passed the ownership check, asked the database again (`mux_cleanup_check`: switch
  `live`, hold `null`) and sent `DELETE /video/v1/assets/M00202rD…RA`. **Mux answered with a 2xx**:
  the worker records `deleted` only when the response is ok (a 404 would have been
  `already_gone`, any other status a retry). The exact code (Mux documents 204) is not stored in
  the database; it is only in the function's invocation log. Job finished **17:16:10.996**:
  `done`, `{"outcome": "deleted"}`, 1 attempt, no error; owner and response cleared (the minimal
  record kept 30 days).
- *Switch off, 17:16:17.928* (`mux_cleanup_set_mode('off', 'Nemat: stage 3 step 4B canary deletion
  finished (Claude Code)')`), straight after the answer. **The database switch was `live` for 11.9 s.**
  That call's own `mode` column still read `live` (`mux_cleanup_mode()` is evaluated in the
  statement's snapshot), so the script sent the same call again at 17:16:21.374, which is the
  `changed_at` now recorded; harmless, the switch was already `off`.
- *Function variable unset, 17:16:43 to 17:16:46* (`supabase secrets unset MUX_CLEANUP_MODE`): 11
  secrets, identical to the preflight (names, digests, times); functions up one more version,
  bundles unchanged (`auth-signin-method` v6, `mux-cleanup` v3, `mux-create-upload` v6,
  `mux-upload-status` v7, `mux-webhook` v8, all `ACTIVE`, `verify_jwt` false). The variable was
  `live` for about 2 min 40 s, of which the database switch allowed changes for the 11.9 s above.
  **Both switches non-live from 17:16:46** (database `off` checked 17:16:52).
- *Scheduler:* `mux-cleanup` ran at 17:16:00 (before the activation) and 17:17:00 and 17:18:00 (after
  the switch went `off`), each 2 to 3 ms, succeeded, no request. The only drain was the controlled one.
- *Mux after (17:17:52, `GET`):* Shortcut Beta **1 asset** (from 2), the founder's: `ready`, 9.91 s,
  upload `ka5YEhFH…`, passthrough the founder, public playback `8UqSC…6JU`. `GET` of the canary
  asset **404**. Canary HLS (`wHPWZ…KM.m3u8`) **404** (`no-cache, no-store`, CDN `MISS`), so no
  cached copy was being served by then; founder HLS **200**. Uploads 3, unchanged: the canary's
  upload object remains at Mux (`asset_created`, pointing at the deleted asset; Mux keeps upload
  records), `Tm01xbKS…` `waiting` (times out 17:38:28; not a target), the founder's. 0 live streams.
  Spike environment: 7 assets and 25 uploads, inventory hash identical to the preflight.
- *Database after (17:17):* switch `off`; fingerprint 741 / `8d15eb8e…`, line for line unchanged;
  0 executable jobs, overview empty (no due, stuck, failed, review, dry-run or purge items). The
  only data changes: the job (above), pg_net response 3, and the reply's `mux_asset_id` and
  `mux_playback_id` cleared by `mux_cleanup_finish` (as designed for a deleted video; reply still
  `deleted`, upload id kept; row `md5(row_to_json)` `88422a5a…` → `ee0ba987…`, `responses` hash
  `edb1b2f6…` → `d0b2607e…`). Every other table hash identical (ledger 3 rows unchanged); founder
  hashes unchanged, `live`; Vault unchanged; 0 deleted accounts, purge failures, moderation records.
- *Capacity:* Shortcut Beta 1 asset, spike 7: 8 of the free plan's 10 if the cap is account-wide.
- *Logs:* read the database's own (cron runs, pg_net response, job row, settings). Edge Function
  invocation and console logs and the Postgres log not read (Dashboard sign-in needed). Nemat to look
  at 17:16:06 to 17:16:11 UTC: expected one `POST` 200 to `mux-cleanup` with the log line
  `{"job":"45c34fbc…","mode":"live","action":"delete_asset","reason":"author_deleted","attempt":1,
  …,"outcome":"done","detail":{"outcome":"deleted"}}`, and shortly after, Mux's `video.asset.deleted`
  webhook to `mux-webhook` answered 200 `ignored`. Mux's own request log is not available through the
  API; the Mux dashboard should show the asset deleted at 17:16:10.

**Staged deployment plan** (each stage needs Nemat's separate go-ahead; steps 1 and 2 done 12 Oct, step 3's first verification done 12 Oct with the switch back to `off`, step 4A (canary dry run) done 12 Oct with the switch back to `off`, step 4B (one real deletion, the canary) done 12 Oct with both switches back to non-live; the backlog and leaving clean-up on not approved):

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

- **Mux deletions cannot be undone.** Asset `DELETE`, the asset `GET` and its `upload_id` and
  `passthrough` fields have now run against real Mux (step 4B). The playback-id `POST` and `DELETE`,
  the upload `GET` and cancel `PUT`, and the listing past one page are still exercised only
  against the fake.
- **Clean-up is off, so deletions queue but do not reach Mux.** Until clean-up is left on, an
  author's deleted video stays public at Mux by its playback id (hidden everywhere in the app and
  web), and a removed video's playback is not revoked. Turning it on is a separate decision.
- **Anything queued just after the activation transaction would have run too:** the precondition
  check covers the queue up to the commit, not the second or so before the worker claims. Nothing
  was (the queue holds only the canary's job).
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

**Verified on the hosted project** (12 Oct; steps 1 to 4B above): the migration and the schema it
produces; the worker deployed, its key and the Vault secrets; the worker's 401 and 405 answers;
the scheduler with the switch `off` (no HTTP call) and in `dry_run` with no job due (no HTTP call);
the hosted gateway passing pg_net's call to the worker with the Vault key (200); one dry-run sweep
reading the real Shortcut Beta asset list and classifying the founder's asset `in_use`; the switch
back to `off`; the founder's rows, asset, playback id and HLS unchanged throughout. Step 4A: a
video reply posted on the iPhone through the stage 2 ledger (owner, upload, passthrough matching),
five signed webhook deliveries answered 200, the author's deletion hiding it from every app read
path and queuing exactly one `delete_asset` job with the right asset, upload and owner, and that
job's dry run against real Mux (one `GET` of the asset, the ownership check on real `passthrough`
and `upload_id` values passing, plan `delete`, recorded and kept for step 4B). Step 4B: both
switches `live`, one drain through pg_cron's path (pg_net, gateway, worker), the last-moment check,
one real asset `DELETE` answered 2xx, the job `done` exactly once, the deleted video forgetting its
asset and playback id, the canary's HLS 404 and asset 404, both switches back to non-live, and the
founder's asset, playback and HLS and the spike environment untouched.

**Not verified:** other changes at Mux (creating or deleting a playback id, cancelling an upload);
the exact HTTP status of the step 4B `DELETE` (2xx by the code path; only in the function log); dry runs of a playback revocation or restore
and of an upload cancellation against real Mux (no such job has existed on hosted); a sweep that finds an orphan or an unknown asset; Mux listing beyond one
page; the daily jobs (03:15 purge, 03:30 and 03:40 prunes, 04:45 sweep) on hosted, which have
nothing to act on yet; the Edge Function, gateway and Postgres logs beyond the webhook invocations
Nemat read for step 4A (step 4B's included); which path set the reply `live`; Android. Still open:
errored assets stay `processing`; direct reads of `profiles`, `follows` and `comments`
(section 13).

**Remaining Mux operations: audit and real-Mux test plan (13 Oct; planning only, nothing run).**
From `faf1a41` (this worktree fast-forwarded to it from `bcc9055`). Code read: `mux-cleanup`,
`_shared/mux.ts`, `mux-create-upload`, `mux-webhook`, `mux-upload-status`, both stage 2 and 3
migrations, the app's posting flow, `scripts/moderate.sh`, the stage 3 tests. **No hosted query, no
Mux call, no write of any kind**: the last hosted state is the step 4B record above (12 Oct
17:17 UTC), and every test below starts with a fresh read-only preflight. Mux docs were read on the
web (list assets, free plan). Nothing here is approved; each checkpoint needs Nemat's go-ahead.

*Audit findings (by reading; G2 and G5 not reproduced yet):*

- **G1, dry-run plans of playback jobs are too thin to approve from.** *(Fixed locally 13 Oct, below.)* A `sync_playback` dry run
  records only `{"would": {"act": "sync"}}`: the same for a revoke and a restore, and without the
  playback ids it would delete. `playback_wanted` is sent to the worker but not kept. Without a
  fix, the evidence has to be rebuilt by hand (`mux_playback_wanted` in SQL, plus a Mux `GET` of the
  asset's playback ids). Fix: record `playback_wanted`, `would_revoke: [ids]` or `would_create`,
  and the public ids seen. Worker only, a redeploy of `mux-cleanup`. **Recommended before Test A,
  not strictly required.**
- **G2, an author's deletion after a moderator's restore waits up to 30 days.** *(Reproduced and fixed locally 13 Oct, below.)* A removal queues a
  `delete_asset` (`moderation_removed`). With no review, the first claim reschedules it to the
  case's close + 30 days, and a restore leaves it pending. If the author then deletes the video,
  `mux_cleanup_enqueue` merges into that open job and keeps the *later* time. The asset and its
  public playback id then stay at Mux for up to 30 days, against the decision that an author's
  deletion is immediate. Account removal merges the same way. Safe, but late. The pgTAP restore
  case (0010, section 8b) forces that job due, so it does not cover this. Fix: `mod_restore_video`
  closes the pending retention deletion of the asset it restores. A migration, with tests. Not
  blocking A, B or E. **Before clean-up is left on.**
- **G3, dry runs write one thing.** In `dry_run`, `mux_cleanup_claim` still reschedules a held
  deletion to its hold, or marks an in-use one `skipped`. This is correct and harmless, but a dry
  run is "nothing at Mux", not "nothing in the database". Test A relies on it (below).
- **G4, the 10-asset question.** Mux's docs say the free plan stores "up to 10 video assets". They
  do not say whether that cap is per environment or per organisation, what happens at the cap
  (refused uploads or failed assets), or that any API call needs a paid plan. Nothing we use
  (public playback ids, asset `DELETE`, playback-id `POST`/`DELETE`, upload `POST`/`GET`/cancel
  `PUT`, list) is documented as paid. Asset `DELETE` and `GET` have worked on this plan (step 4B);
  the others will show at their first real call. Plan as if the cap is account-wide: Shortcut Beta
  1 plus spike 7 makes **8 of 10**. Uploads that never become assets (waiting, cancelled, timed
  out) are assumed not to count. Nemat to confirm both points on Billing or with Mux support. At
  the cap, the founder could not upload either.
- **G5, the sweep re-queues what it should leave alone.** *(Fixed locally 13 Oct, below.)* `mux_cleanup_sweep` skips an asset only
  if it has a `pending`, `running` or `review` job. An asset whose last job ended `failed` (for
  example `not_verified`) gets a new `sweep` deletion every day. The ownership check fails it again,
  and failed jobs are never pruned. A removed video whose case is still open gets a new deletion
  daily, which is `skipped` (kept) at claim. No Mux change either way, but the queue and the
  overview fill with duplicates. Fix: also skip assets with a `failed` job, and assets whose only
  user is a removed video in an open case. **Before clean-up is left on.**
- **G6, no monitoring.** *(Health check built locally 13 Oct, below; no alerts sent.)* Nobody is told about a failed job, a stuck lease, a `review` orphan, a purge
  failure, a failed cron run or a non-200 from pg_net. pg_net keeps responses only for hours.
  Needs at least a read-only health check (script or SQL) with thresholds, run daily.
  **Before clean-up is left on.**
- **G7, `scripts/moderate.sh` with `LINKED=1` needs a linked project.** Hosted work has never linked
  a worktree; it names `--project-ref` instead. The hosted moderation calls below are written as
  explicit SQL, sent by that method, inside a transaction that checks preconditions (as in 4B).
  The script is not used.
- **G8, local test gaps for the sweep:** *(Covered 13 Oct, below.)* more than 100 assets (pages of exactly 100, then a partial
  one); a list error on page 2 (`complete` false, only page 1 judged); an asset with no
  `upload_id` or `passthrough`; G5's cases. The fake Mux already pages. Mux still documents `page`,
  next to `cursor`/`next_cursor`. `created_at` is Unix seconds as text, which the SQL parses.

*Two different upload cancellations.* **Stage 2** (`mux-create-upload`, `retireAbandonedUpload`):
live today, with no clean-up switch involved. It runs only when a member asks for a fourth unused
URL within the hour. It takes their oldest unclaimed URL (more than 15 s old), `GET`s it, `PUT`s
`/cancel` only while it is `waiting`, and frees the ledger slot only when Mux confirms. **Stage 3**
(worker, `cancel_upload` jobs): switch-gated. Jobs come only from a video whose upload has no asset
yet when it is deleted, abandoned or discarded; from a retry that replaces an upload; or from account
removal, which also covers open URLs. A plain unused URL never gets a job; it times out at Mux after
an hour. The worker checks `passthrough` and `in_use`, and leaves the ledger alone. These are
different code paths with different triggers, so **both need their own real test**. Both cancel only
`waiting` uploads, and Mux times an upload out an hour after minting, so each test must reach Mux
within that hour. Otherwise it only exercises the `timed_out` branch.

*Mux budget.* **Minimum new assets: 1.** One disposable account (T1) and its one video reply V serve
Tests A, B and E. B reuses A's asset. Test C needs no asset. Test D stays local. Peak: Shortcut
Beta 2, account-wide 9 of 10. The other way, with A and B on a founder-owned video and a separate
account for E, needs 2 assets and peaks at 10 of 10, because G2 keeps a restored founder video's
asset for 30 days. It would also put moderation records and a removal notice on the founder's
account. **Recommended: T1 for everything.** The founder's account and video are then never a
target, and "untouched" is a hash comparison. Do not delete spike assets for headroom unless Nemat
decides to (not authorised here).

*Prioritised matrix* (risk is what a wrong action could do at Mux):

| # | Test | Mux calls that change something | New assets | Switches | Where |
|---|---|---|---|---|---|
| A | Moderator removes V | `DELETE /assets/{a}/playback-ids/{P1}` | 1 (V) | both, one drain | hosted |
| B | Moderator restores V | `POST /assets/{a}/playback-ids` | 0 | both, one drain | hosted |
| C1 | Stage 2 retire of an unused URL | `PUT /uploads/{u}/cancel` | 0 | none (live today) | hosted, in the app |
| C2 | Worker cancels an abandoned upload | `PUT /uploads/{u}/cancel` | 0 (1 if it goes wrong) | both, one drain | hosted |
| E1 | T1 deletes the account | playback-id `DELETE` | 0 | both, one drain | hosted |
| E2 | T1 signs back in | playback-id `POST` | 0 | both, one drain | hosted |
| E3 | T1 removed for good (purge) | asset `DELETE` | 0 (frees V) | both, one drain | hosted, day 31+ |
| D | Orphan sweep | asset `DELETE` (orphan) | 0 | n/a | **local only**; on hosted at most one dry-run sweep (`GET`s only) |

**Order:** local work (done 13 Oct: G1, G2, G5, G6, G8) → R0, deploying the fixes (below) → CP0 → A → B → C1 → C2 → E1 →
E2 → (30 days) → E3. A and B are first by priority and leave V live and restored for E. C1 is free
and independent. C2 goes after B so a mishap in C2 cannot touch V. E3 waits for the real 03:15 purge.

*Same for every hosted step* (as in 4A and 4B): the read-only method (Management API with
`--project-ref`, `READ ONLY` transactions rolled back; Mux `GET`s with the Shortcut Beta token, the
spike token for the spike count).

- **Preflight:** fingerprint 741 / `8d15eb8e…` line for line; switch `off`; no `MUX_CLEANUP_MODE`;
  the queue exactly as expected (listed per test); founder response and ledger hashes, `live`, HLS
  200; Vault, the 11 secrets and the 5 functions unchanged; Mux inventory, both environments.
- **Each dry run:** one transaction checks the preconditions and raises on any difference, then
  `mux_cleanup_set_mode('dry_run', …)` and one `run_mux_cleanup('drain')`; read pg_net's response;
  set `off`; check `off` with a *separate* select (4B lesson).
- **Each live step:** `supabase secrets set MUX_CLEANUP_MODE=live` (every function moves up one
  version); one transaction re-checks the preconditions, then `live` and one drain, just after a
  cron tick; then `off` at once, `secrets unset MUX_CLEANUP_MODE`; check both.
- **Afterwards:** full postflight: the fingerprint; every table hash, with only the expected rows
  changed; Mux inventory; HLS of every playback id involved; the founder untouched.
- **Stop at once** (switch `off`, variable unset, nothing more until Nemat decides) on any of these:
  a job not in the expected list; `claimed` above the expected count; any `failed` or `not_verified`;
  `retry` with a Mux 4xx other than 404 (a 403 or 402 may be the plan); a plan or change touching
  any other asset or upload; a job touching the founder; the founder's hashes or HLS changing; an
  unexplained change in Mux inventory; a third Shortcut Beta asset; a cron or pg_net error.
- **Back to non-live:** `select public.mux_cleanup_set_mode('off', '<who>')`, effective at the
  worker's next check: a job not yet past `mux_cleanup_check` is released, not done. Then
  `supabase secrets unset MUX_CLEANUP_MODE`. Last resort: `cron.unschedule('mux-cleanup')`.
- **A step that stops halfway** is safe to repeat. With the switch `off` nothing re-leases, so a job
  whose lease ran out stays `running` (overview `stuck`). The next controlled drain re-reads Mux and
  finishes it: a revoke finds no public id and records `revoked []`; a restore finds the id it
  created and records it (`kept`), so no second id. A Mux 5xx or timeout is a retry. An unrecorded
  finish ends the same way. Every halfway state is "Mux ahead of the database", fixed by one more
  controlled drain, done under its own approval as a live step.

**CP0, set-up (approval: hosted writes, 1 new asset).** One invite code (`create-invite.sh` by the
`--project-ref` method). Nemat signs out the founder on the iPhone and signs up T1 with a
disposable address (for example a `+test` alias), 18+, profile. T1 sends **one** video reply V
(about 6 s) to the founder's response, the flow proven in 4A (the founder gets the usual
`video_reply` activity). Record V's response, ledger, upload, asset (ready, passthrough T1,
`upload_id` = ledger) and public playback id P1 (HLS 200, plays). Expected: Shortcut Beta 2 assets,
queue empty. Stop if a second asset appears.

**Test A, removal.**

- *A1 (approval: one moderation action, a DB write, no Mux change).* Preconditions: switch `off`,
  0 executable jobs, V `live`, owner T1. Then `select public.mod_remove_video('<V>', '<reason shown
  to T1>', '<moderator>')`. Expected:
  - V `removed`, `removed_action_id` = action M, playback and asset ids kept.
  - An activity row `removed` for T1, and a push if T1 has a token.
  - Exactly 2 jobs, both `moderation_removed`, asset a, upload u, response V, owner T1, due now:
    `sync_playback` and `delete_asset`.
  - `get_video` and `web_video` give `unavailable`. **P1 still plays at Mux** (HLS 200); that is
    what A3 fixes.
- *A2 (dry run; may share A1's approval: `GET`s only).* Expected pg_net body: `claimed` 1, `release`
  1. The `delete_asset` job is not leased: it is moved to M's time + 30 days (G3), and
  `mux_asset_hold(a, u)` equals that time. The `sync_playback` plan has no `not_verified`.
  Evidence: the job's fields; `mux_playback_wanted(V, a)` false; a Mux `GET` of a showing
  passthrough T1, `upload_id` u and exactly one public id, P1. The recorded plan (G1) reads
  `direction` `revoke`, `asset_id` a, `public_playback_ids` and `would_revoke` [P1].
- *A3 (approval: delete one playback id, irreversible; the asset stays).* Preconditions: exactly 1
  due job, the `sync_playback` with its dry-run plan; the deletion not due until M + 30 days.
  Expected:
  - Worker: `claimed` 1, `done` 1, job `{"outcome": "revoked"}`.
  - V's `mux_playback_id` null, asset kept.
  - Mux: asset a `ready`, no public playback id, `GET` 200, so it can be restored; P1 HLS 404
    (re-check after a minute; record cache headers); `mux_video_restorable(V)` true.
  - Founder and spike untouched.

**Test B, restore (same asset).**

- *B1 (approval: DB write).* `mod_restore_video('<V>', '<reason>', '<moderator>')`. The reviewed
  path (`request_review` by T1 in the app, then `mod_decide_review … reversed`) ends in the same
  call. Use it only if Nemat wants the review notice seen too. Expected:
  - V `live`, `removed_action_id` null, playback id still null, so V is hidden until B3.
  - A `restore` action, and a new `sync_playback` (`moderation_restored`) due now.
  - The removal's retention deletion closed at once (`skipped`, "restored by a moderator: the
    removal's retention ended"; G2 fix), and `mux_asset_hold` now `infinity`. No stale job is left
    that could remove the restored video or delay a later deletion by its author.
- *B2 (dry run).* `claimed` 1. `mux_playback_wanted` true. Mux shows no public id on a; the plan
  reads `direction` `restore`, `would_create` `public` (G1).
- *B3 (approval: create one public playback id).* Expected:
  - `POST` gives a new P2; the worker's second check still wants it; job `restored`; V's
    `mux_playback_id` = P2.
  - Mux: the same asset id and `created_at`, playback ids exactly [P2], Shortcut Beta still 2
    assets, the upload's `asset_id` still a (no copy of the asset).
  - P2 HLS 200, P1 still 404. V plays in the app and in `web_video`.
  - No other pending playback job for V.

**Test C1, Stage 2 retire (approval: one cancellation at Mux; no switch; 0 assets).** As T1, within
one hour: record and open Post Review 4 times without sending (at least 15 s apart; each opening
mints a URL; 4 of T1's 10 per hour). The fourth mint finds 3 unused URLs: U1 (the oldest) becomes
`cancelling`, Mux `GET` shows `waiting`, `PUT /cancel`, ledger U1 `cancelled` with `cancelled_at`,
then U4 is minted. Expected: Mux U1 `cancelled`, no `asset_id`; U2 to U4 `active`; no asset;
V's claimed ledger row untouched. That a claimed upload is never chosen is by construction (only
`active` rows); the hosted evidence is the unchanged claimed rows. No destructive negative test.
Stop if anything other than U1 is cancelled, or an asset appears.

**Test C2, worker cancellation (0 assets if it goes to plan).**

- *C2a (approval: in-app, DB write).* T1 makes an upload abandoned before any asset exists. The app
  claims the upload, creating the row, before it sends bytes, so: turn on Network Link Conditioner
  (Very Bad Network), tap Post on a new video reply, force-quit while the progress bar runs, reopen
  (Retry state), Discard → `abandon_response`.
  - Expected: the row `deleted`; ledger U5 `claimed`; one `cancel_upload` job (`abandoned`, upload
    U5, owner T1, no asset).
  - Mux U5 still `waiting` (bytes incomplete). If Mux already shows `asset_created`, the dry run
    will plan `found_asset`: stop there. The worker would then *delete* that asset, a different
    test with its own approval.
  - Fallback if this cannot be done reliably: the open URL that account removal cancels (E3).
- *C2b (dry run, within the hour).* `claimed` 1; plan `{"act": "cancel"}`; Mux `GET` U5:
  `waiting`, `new_asset_settings.passthrough` T1.
- *C2c (approval: one cancellation).* `in_use` false, `PUT /uploads/U5/cancel`, job
  `{"outcome": "cancelled"}`. Mux U5 `cancelled`, no `asset_id`. Shortcut Beta still 2 assets. The
  ledger stays `claimed` (the worker never frees slots; a claimed row holds none).

**Test D, orphans: local only.** Add G8's tests and fix G5 locally. On hosted, nothing is created.
Optional: one dry-run sweep after B (`GET` list only). Expected `listed` 2, `in_use` 2, nothing
would be queued or reviewed.

**Test E, account deletion, recovery, purge (T1, reusing V).**

- *E1 (approval: T1 deletes the account in the app, then a playback-id `DELETE`).*
  - Expected: `deleted_at` set, push tokens gone, one `sync_playback` (`account_deleted`) for V.
  - Dry run: wanted false (G1: `would_revoke [P2]`).
  - Live: P2 deleted; V keeps its asset, playback id null; P2 HLS 404; asset `GET` 200.
- *E2 (approval: T1 signs back in, then a playback-id `POST`).*
  - Expected: `get_onboarding_state` clears `deleted_at` and queues `sync_playback`
    (`account_restored`).
  - Dry run: wanted true, no public id.
  - Live: new P3 recorded, HLS 200, V plays. Same asset, Shortcut Beta still 2.
- *E3 (approval: the asset `DELETE`, irreversible; **ends the rollback option**).* T1 deletes the
  account again, then nobody signs in as T1 for 30 days; the 03:15 `purge-deleted-accounts` removes
  it on day 31. This is the one purge path never run on hosted.
  - Expected: `prepare_account_removal` (`account_purged`) runs, the Auth user, account, profile
    and V's row go.
  - T1's two moderation records are **anonymised**, so the rollback file refuses from then on
    (Nemat to accept that first; prune deletes them 90 days later).
  - One `delete_asset` for a with owner T1, due at the purge (the retention job was closed at B1).
  - With clean-up still off, the job waits. Then a dry run (passthrough T1, plan `delete`) and one
    live drain: asset `DELETE`, a 404, HLS 404. Shortcut Beta back to the founder's asset alone.
  - Fallback if 30 days is too long: delete T1's Auth user in the Dashboard (`account_removed`, the
    same trigger). The deletion is then due at once (the retention job was closed at B1), but the
    03:15 purge stays unverified.

*Approval checkpoints, one per change:* R0 (the migration; then the worker); CP0 (invite, T1, V); A1 (+A2 dry run); **A3**; B1 (+B2);
**B3**; **C1**; C2a (+C2b); **C2c**; E1 (+dry run); **E1 live**; E2 (+dry run); **E2 live**;
E3 decision (rollback); **E3 live**. Bold: a change at Mux. A dry run never shares an approval with
a live step.

*Leaving clean-up on, staged rollout:*

1. **Fix locally first:** G1, G2, G5, G6, G8, done 13 Oct (below); deploy under their own approval
   (R0). The Mux asset count against the database is still a manual check (a Mux `GET`), not part of
   the health check.
2. **Tests A to E2** as above.
3. **Continuous dry run, 3 to 7 days:** database `dry_run`, variable unset. Every pending job is
   re-planned hourly (Mux `GET`s only), and the 04:45 sweep dry-runs daily. Health check daily.
   Expected: plans only for videos someone deliberately deleted, removed or abandoned.
4. **Live, watched:** variable `live`, database `live`, left on. Health check daily for 7 days,
   then weekly.
   - Stop on: any `failed`, `not_verified` or `review`; `stuck` over 10 minutes; `oldest_due` over
     15 minutes; any cron failure; a non-2xx from pg_net; an asset count Mux and the database
     cannot explain.
   - Emergency shutdown: as above (the database switch first).
5. **Mechanics to accept or tune:**
   - Retries: backoff 1 minute doubling to 6 hours, 10 attempts (about 14.5 h), then `failed`.
   - Stuck jobs: leases of 120 s are re-leased by the next claim, safely.
   - Concurrency: cron fires every minute, and a slow call can overlap the next; this is safe (one
     claimer, one job per asset; tested with three at once). pg_net gives up after 60 s, while the
     worker may run up to 5 batches of 10, so a large backlog shows pg_net timeouts that are only
     noise. Lower `BATCH` for a mass purge.
   - Rate limits: Mux's limits for these endpoints are not verified; a 429 is retried with backoff.
6. **Before any outside tester** (Gate 5), clean-up must be live, or left on in dry run with a
   decision recorded. Until then a deleted or removed video stays public at Mux by its playback id.

**Reliability fixes G1, G2, G5, G6 (built 13 Oct; local only, not deployed).** Approved for local
work by Nemat (13 Oct; `docs/DECISIONS.md`). Commits `11a6e8c` (migration, rollback, pgTAP),
`a20f917` (worker), `69be07d` (integration tests). Nothing was deployed, no hosted query was run, no
switch or secret changed, no account, invite, upload or Mux object created, nothing pushed.

- **G2, reproduced first.** pgTAP `0011` on the unchanged schema: after removal, the claim's
  rescheduling, restore and the author's deletion, the asset's deletion kept reason
  `moderation_removed` and a time 30 days out, and the worker could not lease it (tests 11 to 14
  failed). **Fix** (migration `20261013000100_cleanup_reliability.sql`): `mod_restore_video`, and
  so a reversing `mod_decide_review`, closes the pending deletion of the asset it restores
  (`skipped`, "restored by a moderator: the removal's retention ended"). `mux_forget_video` (author
  deletion, abandoning, discarding or replacing a draft) makes any deletion of the asset still
  waiting in the future due now, with the author's reason. The claim still works out every hold from
  the rows, so a video that stays removed, or under review, keeps its asset; and the explicit
  retention `prepare_account_removal` gives a purged account's removed videos is untouched (that
  path does not call `mux_forget_video`). No backfill: a hosted queue holding the old state (none
  does today) is resolved by the claim as before.
- **G5.** `mux_cleanup_sweep` now also leaves alone an asset with a `failed` job (counted
  `unresolved`; it stays in `mux_cleanup_overview().failed` and alerts in the health check until
  `mux_cleanup_retry`) and the asset of a removed video whose case is open (counted `held`; the
  review decision queues the deletion or restores the video). `held` and `unresolved` appear in the
  answer only when non-zero, so the existing answers are unchanged.
- **G1.** A dry run's recorded plan now reads, for playback, `{"act": "sync", "direction":
  "revoke" | "restore" | "keep", "asset_id", "asset_status", "owner_verified": true,
  "playback_wanted", "public_playback_ids", "would_revoke" | "would_create": "public" |
  "would_record"}`; for a deletion `{"act": "delete", "asset_id", "upload_id"}`; for a cancellation
  `{"act": "cancel", "upload_id", "upload_status"}`. A restore cannot name the new id before Mux
  makes it. The ownership check is unchanged and still comes first: a mismatch is the plan
  (`not_verified`) with nothing to act on. The function log shortens every playback id to its first
  four characters (`forLog`); the job's result in the database keeps them whole (service role only,
  as before). `act` is unchanged, so existing readers still work.
- **G6.** Detection only:
  - `run_mux_cleanup` records each request it makes (`mux_cleanup_runs`: pg_net's id, drain or
    sweep, when).
  - A new schedule, `mux-cleanup-monitor` (every 10 minutes, `mux_cleanup_collect_runs()`), copies
    pg_net's answer before pg_net discards it (6 hours): status, timeout, error, the worker's `ok`
    and its counts only. No Mux id or playback id is kept, even if a body held one (tested). A
    request with no answer after 15 minutes becomes `no_response`. Runs are kept 14 days.
  - `mux_cleanup_health()` (service role; `stable`; reads only) returns `ok`, `warn` or `alert`
    with each problem and the thresholds:

  | Check | Level | Threshold |
  |---|---|---|
  | Failed jobs | alert | any |
  | Purge failures | alert | any |
  | Stuck jobs | alert | a lease run out more than 10 min ago |
  | Backlog, live | alert | a job due for more than 15 min |
  | Backlog, live | warn | more than 100 due, or 50 more created than finished in 24 h |
  | Waiting, not live | warn | a job waiting more than 24 h (its video is still at Mux) |
  | Orphans for review | warn | any |
  | Schedules | alert | `mux-cleanup` inactive, failing or late by 5 min; a daily job (sweep, purge, prunes) inactive, failing or late by 26 h |
  | Schedules | warn | the monitor late by 30 min; a job that has never run (new) |
  | Worker | alert | unreachable, a non-2xx status, or `"ok": false` in 24 h |
  | Worker | warn | a timeout or no answer in 24 h; answers not collected for 30 min; no sweep requested in 26 h while not off |

- *Notification, proposed, not built or activated:* until clean-up is left on, run
  `select public.mux_cleanup_health()` by the read-only method in every step's preflight and
  postflight, and daily during the continuous dry run. Before leaving clean-up live, the proposal
  is an hourly pg_cron job that posts only `status` and the problem `check` names (no ids) through
  pg_net to one webhook URL kept in Vault (`mux_cleanup_alert_url`). It would post when the status
  becomes `alert` and once a day while it stays `alert`, and do nothing without the secret, like the
  worker. The channel (an email through Resend's API, or a Slack or Discord incoming webhook) is
  Nemat's choice. It needs its own approval; nothing is sent today.
- *Not covered by the health check:* the Mux asset count against the database (needs a Mux `GET`;
  stays a manual step); the function's own `MUX_CLEANUP_MODE` (not visible from the database); Edge
  Function logs.

*Tests* (isolated local stack `shortcut-s3r`, ports 557xx, fake Mux everywhere; the default
`shortcut` stack and the earlier `shortcut-s3` containers, which Docker restarted, were not
touched):

- pgTAP **1089/1089**: 0001 to 0010 unmodified (986), new `0011_cleanup_reliability.sql` **103**:
  - G2: no review; review and reversal, then an open report; a deletion during a running restore
    (one job per asset, the restore's last check refusing, then the deletion leased with no hold).
  - The retention kept for a video that stays removed.
  - G5: a failed asset unresolved and not queued again, an open case held, unproven owners for
    review, repeated sweeps, a retry with no duplicate.
  - G6: privileges, RLS, `stable`, the schedule; requests recorded only when the switch allows;
    answers collected with counts only; a lost request; the health check's alert and warn cases,
    including an inactive schedule.
  - The founder's row unchanged.

  Four full runs passed. One earlier full run failed `0003` tests 26 and 27, an unmodified phase-4
  file: the order of two video replies created in one transaction (equal `created_at`, so the
  order is not fixed). That flake predates these changes.
- Deno unit **32/32**: `mux_test.ts` 21 unmodified; `cleanup_unit_test.ts` 11, 3 new: revoke,
  restore and keep plans with their ids, a signed id ignored, a delete and a cancel plan,
  ownership first, log shortening.
- Integration: stage 1 **20/20** and stage 2 **32/32** (unmodified). Stage 3
  `cleanup_integration_test.ts` **28/28** on four runs, 4 new:
  - G1: removal and restore dry runs through the worker, with the log checked for the id.
  - G2: remove, restore, re-report, author deletion: asset `GET` then `DELETE` at once, the report
    still open.
  - G2: an author deletion while Mux creates the restored id.
  - G5: 230 assets over three pages (100, 100, 30); page 2 failing (`listed` 100, `complete`
    false, `mux_500`, nothing beyond page 1 judged); assets with no passthrough or no upload id
    for review; repeated sweeps; a `not_verified` failure left alone on two daily sweeps, then
    retried once and deleted; held and review assets never changed.
- Scheduler path (`scripts/scheduler-integration.sh`) **13/13** on two runs, 1 new. Through pg_cron,
  pg_net, the gateway and the real Edge runtime: a wrong key (401), an unreachable worker (pg_net
  error, no status) and a good call (200, `ok`, 1 claimed) each recorded, collected and reported
  `worker_errors` by the health check; no Mux id kept.
- `scripts/auth-integration.mjs` **37/37**. `deno check` and `deno lint` clean (20 files). The one
  lint finding, a `require-await` in an unmodified `scheduler_integration_test.ts` line under
  Deno 2.9.7, was fixed (the callback made synchronous).
- App (unchanged): `tsc` clean, `expo lint` clean, Jest **96/96**, run with the main checkout's
  `node_modules` (same `package.json` and lockfile).
- Concurrency, retries, retention and recovery: the existing integration and scheduler tests above
  cover concurrent workers, backoff retries, dead letters, worker restarts, retention after removal
  and review, and account deletion and recovery, all passing on the new schema.

*Migration rehearsal* (the stage 3 schema, `supabase db reset --version 20261012000200`, with hosted
data as after 4B):
- **Data:** the founder's live response and claimed ledger row; the deleted canary reply with its
  `done` job and the unused second URL; a member with one video removed and restored (the G2 state
  the old code leaves: deletion pending 30 days out) and one removed with a review pending; a report.
- **Then `20261013000100` alone:** every `public` table's row hash and `auth.users` unchanged; only
  `cron.job` changed (7 to 8, `mux-cleanup-monitor`); switch `off`.
- **The five scheduled commands and the collector:** no change at all; 0 requests, 0 runs.
- **Health:** `warn`, only "has not run yet" for the schedules (the database had just been reset).
- **The rollback file:** the `public` schema dump line for line identical to stage 3's; every hash,
  `cron.job` included, identical to before the migration.

*Hosted deployment (R0), when approved (each step separately):*
1. **Preflight**, read-only: fingerprint 741 / `8d15eb8e…` as at 4B; switch `off`; no
   `MUX_CLEANUP_MODE`; 0 executable jobs; the founder's hashes; `db push --dry-run` from a clean
   copy of the branch lists exactly `20261013000100_cleanup_reliability.sql`.
2. **Migration**, `supabase db push` by the step 1 method. It writes no data row: 4 functions
   replaced (grants unchanged), 3 added (no member or anon access), 1 table (RLS, no member grants),
   1 schedule (`*/10`). Expected after: switch `off`, 0 jobs changed, founder unchanged, a new
   fingerprint to compute with the preflight script before the push, `mux_cleanup_health()`
   answering. Within 10 minutes `mux-cleanup-monitor` has run (it reads pg_net and writes nothing
   while there are no requests).
3. **Worker**, `supabase functions deploy mux-cleanup --no-verify-jwt` from the branch (G1); no
   secret change, so the other functions keep their versions. The database accepts either worker
   version, so 2 and 3 may be done in either order; 2 first is recommended.

*Rollback and risks:*
- `supabase/rollback/20261013000100_cleanup_reliability.down.sql`, as a forward migration, restores
  the four previous functions and removes the run record, collector, health check and schedule. It
  never refuses. Jobs a restore closed stay closed, and deletions an author's deletion made due stay
  due: both are what the old claim would have done at the old due time, only earlier, so nothing
  needs undoing. The worker goes back by redeploying `mux-cleanup` from `faf1a41` (plans revert to
  `{"act": …}` only).
- **G2 makes some Mux deletions earlier than before:** only for an author's own deletion of a video
  that is live (a removed one cannot be deleted by its author). That is the approved retention
  rule; the change cannot reach a removed video or one under review (tested).
- **Unverified on hosted:** that `mux_cleanup_health()` (owner `postgres`) can read
  `cron.job_run_details` there, as the earlier read-only checks did; pg_net's answer retention there
  (default 6 hours, collected every 10 minutes).

*Revised real-Mux sequence:* R0 (preflight, migration, worker; no Mux call) → CP0 → A → B → C1 → C2
→ E1 → E2 → (30 days) → E3. Changes from the plan above:
- Each step's preflight and postflight include `mux_cleanup_health()`, expected `ok` or only known
  warnings.
- A2 and B2 approve from the recorded plan itself.
- B1 expects the retention deletion closed.
- E3 no longer waits on G2.
- The asset budget is unchanged: 1 new asset.

**R0 hosted preflight (13 Oct, 01:55 to 02:04 UTC; read-only; nothing deployed or written).**
Approved by Nemat as a read-only preflight only. From `6739b3c` plus the fingerprint script
(clean tree).

*Method:*
- SQL through the Management API (`supabase db query --linked --project-ref picvoavfxnajfjkqawju`,
  from a scratch folder), each query inside `begin transaction read only … rollback`
  (`transaction_read_only` = `on` confirmed).
- Edge Functions and secrets with `supabase functions list` / `secrets list` / `functions download`.
- `supabase db push --dry-run` from a `git archive` of `HEAD`.
- Mux `GET`s only, with the Shortcut Beta token, and the spike token for the spike count. No value
  was printed.

*Side effects:* the CLI's temporary login role was refreshed (as on every linked command); link
files were written in the scratch folders and deleted afterwards. Nothing else.

*Schema fingerprint, rebuilt.* The script used for the earlier fingerprints was not kept, so it was
rebuilt from their description and committed as `scripts/schema-fingerprint.sql`: functions,
tables, columns, constraints, indexes, triggers (public, `auth.users`, `auth.identities`),
policies, cron jobs, extensions, schema and default privileges, and the `authenticator` setting.
- It reproduces the recorded counts exactly: **657** objects on the stage 2 schema and **741** on
  stage 3, with the recorded differences (+3 tables, +21 functions, +30 columns, +17 constraints,
  +7 indexes, +2 triggers, +4 cron jobs).
- Its md5 values differ from the old script's (`e7d34c92…`, `8d15eb8e…`) and cannot be compared
  with them. The comparison that matters is line for line, against a local stack built from the
  same migrations.

*1. Hosted baseline, every item as expected:*
- **Migrations:** 16, latest `20261012000200`.
- **Schema:** fingerprint **741 objects, line for line identical to the local stage 3 schema**
  (md5 of the listing `ca21f2cd8c146f7f65205bdd6e08fe6a`).
- **Pending:** `db push --dry-run` from a clean copy of `HEAD` lists exactly
  `20261013000100_cleanup_reliability.sql` (md5 `7d91d842572978b0143580daf32b6195`,
  byte-identical to the tested file); seeds `[]`, roles `[]`.
- **Switches:** database `off` (17:16:21 12 Oct, "step 4B canary deletion finished"). 11 function
  secrets with **no `MUX_CLEANUP_MODE`**, so the worker's own switch is `dry_run`, never `live`.
  `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` match `.env.mux-hosted` by digest; `MUX_CLEANUP_KEY`
  matches `.env.mux-cleanup` and the Vault `mux_cleanup_key`.
- **Queue:** one job, the canary's (`done`, `{"outcome": "deleted"}`, 1 attempt, owner and response
  cleared). Overview: nothing due, stuck, failed, in review or in dry run. 0 purge failures.
- **Cron:** the 7 jobs, all active, 0 failed runs ever recorded. `mux-cleanup` 625 runs in 24 h.
  `mux-sweep`, `prune-moderation-records` and `prune-mux-cleanup-jobs` have **never run** (first
  runs due 13 Oct 03:30, 03:40 and 04:45 UTC). `purge-deleted-accounts` last ran 12 Oct 03:15.
- **pg_net:** queue 0; 3 stored answers, the three 200s of 12 Oct.
- **Vault:** the same two secrets, created 15:49:18 12 Oct, unchanged; the URL's digest is that of
  `https://picvoavfxnajfjkqawju.supabase.co/functions/v1/mux-cleanup`.
- **Edge Functions**, versions and last deploys exactly as at the end of 4B:

  | Function | Version | Last deployed (UTC) |
  |---|---|---|
  | `auth-signin-method` | v6 | 10 Oct 04:52 |
  | `mux-create-upload` | v6 | 12 Oct 10:40 |
  | `mux-cleanup` | v3 | 12 Oct 15:47 |
  | `mux-webhook` | v8 | 12 Oct 15:49 |
  | `mux-upload-status` | v7 | 12 Oct 15:50 |

  All `ACTIVE`, `verify_jwt` false. Bundle hashes recorded: `mux-cleanup` `2f53c7a7…`,
  `mux-webhook` `e4679407…`, `mux-upload-status` `aaa0aab6…`, `mux-create-upload` `bd0a6937…`,
  `auth-signin-method` `e4894bcb…`.
  **Not byte-compared this time:** CLI 2.119's `functions download` returns transpiled JavaScript
  (types, comments and blank lines removed), so sources can no longer be compared byte for byte.
  The deployed `mux-cleanup` was spot-checked: it has the change guard and the ownership checks,
  and not the G1 plan code, as expected.
- **Data:**
  - 1 auth user and account (not deleted); responses: 1 live, 1 deleted; ledger: 2 claimed,
    1 active (the expired second URL); 0 open upload URLs.
  - 0 comments, reports, moderation actions, review requests or tombstones; push outbox 0 unsent;
    analytics 47.
  - **Founder:** response `live`, `md5(row_to_json)` `c9918f8241a2c45eefb106b5d0ec0a8f`,
    `md5(r::text)` `b34c6351…`; ledger `claimed`, `md5(u::text)`
    `9726bb8fdf8d9eb0cb759d13ce59c8b6`; author = ledger owner. All identical to the recorded values.
    `web_video` gives `live` with playback `8UqSC…`.
  - **Canary:** reply still `deleted`, asset and playback id cleared, `md5(row_to_json)`
    `ee0ba987…` (as after 4B); `web_video` `unavailable`.
  - Per-table hashes recorded for the post-deployment comparison (scratch `tables_before.json`;
    for example `responses` 2 `b64c9c284818`, `video_uploads` 3 `4ddb9601382c`, `mux_cleanup_jobs`
    1 `e7c667618890`).
- **Mux (Shortcut Beta):**
  - 1 asset, the founder's: `ready`, 9.91 s, passthrough the founder, upload `ka5YEhF…`, one
    public playback id `8UqSC…6JU`; asset `GET` 200, HLS **200**.
  - Canary asset **404**, canary HLS **404** (`no-cache, no-store`).
  - 3 uploads: the canary's and the founder's `asset_created`; `Tm01xbK…` now `timed_out`, as
    expected. 0 live streams.
  - Spike environment: 7 assets, 25 uploads. 8 assets in all, if the free plan's cap is
    account-wide.

*2. The forward migration against hosted.* The hosted schema is the local stage 3 schema (above),
so the local result of applying `20261013000100` is the expected hosted result:
- **Expected fingerprint after: 759 objects** (md5 of the listing
  `10acc19ffaef4d3ebe549d37b2c2199c`, this script): 244 columns, 162 constraints, 8 cron jobs, 6
  default privileges, 7 extensions, 187 functions, 70 indexes, 24 policies, 1 role setting, 1
  schema, 30 tables, 19 triggers. Of these, **737 unchanged**.
- **4 changed** (functions, same signatures, owners, `SECURITY DEFINER`, `search_path` and grants):
  `mod_restore_video(uuid,text,text,text)`, `mux_forget_video(uuid,text,text,uuid,text)`,
  `mux_cleanup_sweep(jsonb,integer,boolean)`, `run_mux_cleanup(text)`.
- **18 added:**
  - Table `mux_cleanup_runs`: RLS on, no policy; `anon` and `authenticated` revoked;
    `service_role` keeps the default grant, like `mux_cleanup_jobs`.
  - Its 9 columns, 2 constraints (primary key, mode check) and 2 indexes.
  - Functions `mux_cleanup_health()` (`stable`, `SECURITY DEFINER`, executable by `service_role`
    only), `mux_cleanup_collect_runs()` and `mux_cleanup_try_jsonb(text)` (executable by no API
    role; the schedule runs as `postgres`).
  - Cron `mux-cleanup-monitor` (`*/10 * * * *`, `select public.mux_cleanup_collect_runs()`,
    user `postgres`).
- **Removed:** nothing. No trigger, policy, extension or privilege outside the new objects
  changes.
- **No user data is changed:** the migration has no `insert`, `update` or `delete` on existing
  tables (only `create`, `create or replace`, one `alter table … enable row level security` on the
  new table, `revoke` / `grant`, and `cron.schedule`). Rehearsed with hosted-like data: every
  `public` table and `auth.users` hash identical before and after, only `cron.job` 7 → 8.

*3. Monitoring.*
- **While clean-up is `off`, the monitor writes nothing to `public`.** `run_mux_cleanup` returns
  before any request, so `mux_cleanup_runs` stays empty, and the collector updates and deletes
  nothing.
- **Its only writes** are pg_cron's own run log: one `cron.job_run_details` row per run, 144 a day.
- **Permissions on hosted** (checked): `postgres` (not a superuser; owner of every function and of
  every cron job) can read `cron.job`, `cron.job_run_details` and `net._http_response`, and can
  call `net.http_post` and `cron.schedule`. pg_net 0.20.4 has the columns the collector reads
  (`id, status_code, content, timed_out, error_msg, created`). pg_cron 1.6.4 has `log_run` on.
- **Retention and growth:**
  - `mux_cleanup_runs` holds one row per worker request (only when jobs are due, plus one sweep a
    day), pruned at 14 days. At most about 20,000 rows if jobs were due every minute; tens in normal
    use.
  - **`cron.job_run_details` is never pruned on hosted:** 6,530 rows (1.1 MB) since 9 Oct, about
    2,200 a day before the monitor, 144 more with it. The health check needs 26 hours of history,
    so this is ample; but it grows by about 800,000 rows a year, and the health check's per-job
    lookups scan it (its only index is the run id).
  - Pruning cron history (for example older than 30 days) is a separate, small decision; not
    needed before R0.
- **pg_net retention:** `pg_net.ttl` is `6 hours`, and the three answers from 12 Oct are still
  there (expiry is lazy, so 6 hours is a minimum, not an exact time). Collection every 10 minutes
  and "no answer" after 15 minutes sit well inside it.
- **Failure handling:**
  - A collector error fails that cron run, which the health check reports (`schedule_failing`,
    alert); the next run retries, because nothing is marked collected until copied.
  - A body that is not JSON is stored with no counts; a request never answered becomes
    `no_response` (warn).
  - The health check itself only reads, so it cannot break anything.
- **Sensitive data:**
  - Kept from the worker's answer: its `ok` flag and a fixed list of scalar counts and short
    strings (`mode`, `claimed`, `done`, …, `listError`); never arrays, so no `would_queue` or
    `would_review` asset ids; no headers; no request body (so not the key).
  - pg_net's `error_msg` (at most 500 characters) is a transport error such as "couldn't
    connect", which can name the worker's URL (not secret).
  - The table is readable only by the service role.
  - The health check returns counts, times, schedule names and thresholds: no Mux, playback or
    member id.
- **Expected health check right after R0:** `warn`, not `alert`. The never-run schedules
  (`mux-sweep` and the two prunes, until 04:45 UTC on 13 Oct; the monitor, until its first tick
  within 10 minutes) show as "has not run yet". `purge-deleted-accounts` is within its 26 hours if
  the 03:15 run happens. With the switch `off` there is no backlog alert and no sweep warning.
  Deploying after 05:00 UTC leaves only the monitor's warning, for at most 10 minutes.

*4. Deployment compatibility* (tested locally on `shortcut-s3r`):
- **Interfaces unchanged:**
  - The worker's RPCs (`mux_cleanup_claim`, `mux_cleanup_check`, `mux_cleanup_finish`,
    `mux_cleanup_overview`, `mux_cleanup_sweep`) keep their signatures and grants.
  - `mux_cleanup_sweep`'s answer only gains `held` and `unresolved` when non-zero; the old worker
    passes the answer through, and no reader parses it.
  - `run_mux_cleanup` calls the worker with the same URL, body and Vault key, so authentication
    is unchanged.
  - The app's RPCs (`delete_video`, `abandon_response`, `discard_draft`, `post_draft`,
    `retry_response_upload`) and the moderation functions keep their signatures and grants.
  - `mark_response_live` (`mux-webhook`, `mux-upload-status`) and the stage 2 upload functions
    (`mux-create-upload`) are untouched.
- **Old worker (the deployed `faf1a41` code) on the new schema:** its own stage 3 integration
  tests **24/24**, and its scheduler test **12/12** through pg_cron → pg_net → the real Edge runtime
  serving the old worker. The new run record captured those calls (15 requests, 12 of them 2xx; the
  others are the tests' deliberate 401 and unreachable cases).
- **New worker on the old schema:** 25 of the 28 stage 3 tests pass (all 24 old ones and G1). The
  3 that fail are G2 and G5 behaviour, which lives in the migration, not the worker.
- **So neither order breaks anything.** There is no window in which either worker version
  misprocesses work: the worker only changes what a dry run records, and with the switch `off`
  nothing is leased or called anyway.
- **Recommended order: the migration first, then the worker.** The database fixes take effect as
  soon as they exist. The worker step is then small and independently reversible, and the order
  matches the rehearsals.

*5. Deployment plan for R0 (needs Nemat's approval; two steps, each stoppable):*

- **Pre-deployment checks** (read-only, immediately before):
  - Fingerprint 741, line for line the stage 3 listing.
  - `db push --dry-run` from a fresh `git archive` lists exactly `20261013000100` (md5
    `7d91d842…`), no seeds or roles.
  - Switch `off`; no `MUX_CLEANUP_MODE`.
  - Queue exactly the canary's `done` job; 0 failures; the 7 cron jobs, 0 failures.
  - Founder hashes as above, `web_video` `live`, HLS 200.
  - Functions, secrets (names and digests) and Vault as above.
  - Mux: the founder's asset alone; spike 7.
- **Step A, migration:** `supabase db push --linked --project-ref picvoavfxnajfjkqawju --workdir
  <scratch> --yes`. Immediately after:
  - Fingerprint **759**, line for line the local listing (`10acc19f…`); 17 migrations.
  - Switch still `off`; no `MUX_CLEANUP_MODE`; queue unchanged (1 `done` job).
  - Every table hash and `auth.users` as before; `mux_cleanup_runs` empty.
  - `cron.job` 8, the new one active; founder hashes, `web_video` `live`, HLS 200.
  - Then `select public.mux_cleanup_health()`: `warn` with only "has not run yet" lines.
  - After the next 10-minute tick: `mux-cleanup-monitor` succeeded and `mux_cleanup_runs` is
    still empty.
- **Step B, worker:** `supabase functions deploy mux-cleanup --no-verify-jwt --project-ref
  picvoavfxnajfjkqawju`, from a `git archive` of `HEAD`'s `supabase/` folder. No secret is changed,
  so only `mux-cleanup` moves (v3 → v4, new bundle hash); the other four keep their versions and
  bundles. Immediately after:
  - The 405 and 401 answers as in step 2 of the earlier rollout.
  - Optionally one keyed `drain` with the switch `off`: `{"ok": true, "mode": "off", "claimed":
    0}`, with no Mux call possible.
  - Founder HLS 200; Mux inventory unchanged; health as after step A.
- **Throughout:** the database switch stays `off`, `MUX_CLEANUP_MODE` stays unset, and no job is
  created. Neither step calls Mux, and the founder's video keeps playing (checked before, between
  and after).
- **Stop at once, and do not continue to the next step, if:**
  - the dry run lists anything else, or the push errors;
  - the post-migration fingerprint differs from the local listing in any line;
  - any existing table hash, the founder's row, its ledger row or its HLS changes;
  - the switch is anything but `off`, or `MUX_CLEANUP_MODE` appears;
  - a job appears;
  - `mux_cleanup_runs` gains rows while `off`;
  - the health check errors or reports `alert`;
  - a cron run fails;
  - the function deploy changes any function but `mux-cleanup`;
  - the Mux inventory changes.
- **Rollback limitations:**
  - **Step A:** `supabase/rollback/20261013000100_cleanup_reliability.down.sql` as a new forward
    migration. It never refuses, and was rehearsed to give a `public` schema and data identical to
    stage 3. It drops `mux_cleanup_runs` with whatever it recorded. It cannot reopen jobs a
    restore closed, or delay deletions an author's deletion made due; neither exists on hosted
    today.
  - **Step B:** redeploy `mux-cleanup` from `faf1a41`. The database accepts either version.
  - **Neither** rollback touches the stage 3 rollback's own preconditions: no tombstone or
    anonymised record exists, and R0 creates none.

*Not checked in this preflight:* the Edge Function, gateway and Postgres logs (Dashboard sign-in
needed); a byte-for-byte comparison of deployed function sources (see above); the Mux plan's
cap (still to confirm on Billing).

**R0 step A: cleanup reliability migration deployed (13 Oct, 02:12:31 to 02:12:38 UTC; approved by
Nemat: database only).** From `6f54277` (clean tree). The migration was pushed from a `git archive`
of `HEAD` in a scratch folder: `supabase/migrations`, `config.toml` and `templates`. Read-only
checks used the R0 preflight method (Management API, `READ ONLY` transactions rolled back,
`scripts/schema-fingerprint.sql`; Mux `GET`s only). No Edge Function, secret, Vault entry,
environment variable or switch was changed; no Mux call other than `GET`s; nothing pushed to git.

*Final preflight (02:11 to 02:12):*
- **Bytes:** migration md5 `7d91d842572978b0143580daf32b6195`, as reviewed.
- **Schema:** fingerprint **741**, line for line the tested stage 3 listing (`ca21f2cd…`).
- **State, tables, functions, secrets, Mux:** identical to the 01:56 preflight, apart from cron's
  run counters.
- **Switches:** `off`, no `MUX_CLEANUP_MODE`.
- **Queue:** only the canary's `done` job; 0 purge failures.
- **Cron:** 7 jobs, 0 failures.
- **pg_net:** queue 0, 3 old answers.
- **Founder:** hashes unchanged, `web_video` `live`, HLS 200.
- **Mux:** Shortcut Beta has the founder's asset alone; spike 7 assets, 25 uploads. Canary 404.
- **Dry run:** a fresh `db push --dry-run` listed exactly `20261013000100`, seeds `[]`, roles
  `[]`.

*Push:* `supabase db push --linked --project-ref picvoavfxnajfjkqawju --workdir <scratch> --yes`,
from 02:12:31 to 02:12:38 UTC. Output: "Applying migration 20261013000100_cleanup_reliability.sql",
"Finished supabase db push"; exit 0, no error.

*Post-deployment verification (02:12:50 to 02:13:34):*
- **Migrations:** 17, latest `20261013000100`.
- **Schema fingerprint: 759 objects, line for line identical to the tested post-migration listing**
  (md5 `10acc19ffaef4d3ebe549d37b2c2199c`). Against the pre-deployment listing:
  - **737 unchanged**, including the 7 earlier cron jobs: schedule, command, active and user.
  - **4 changed**: `mod_restore_video`, `mux_forget_video`, `mux_cleanup_sweep`,
    `run_mux_cleanup`.
  - **18 added**: table `mux_cleanup_runs` with 9 columns, 2 constraints and 2 indexes; functions
    `mux_cleanup_health`, `mux_cleanup_collect_runs` and `mux_cleanup_try_jsonb`; cron
    `mux-cleanup-monitor`.
  - **Nothing removed.**
- **Monitor schedule:** `mux-cleanup-monitor` is job 8, `*/10 * * * *`,
  `select public.mux_cleanup_collect_runs()`, user `postgres`, active.
- **Grants:**
  - `mux_cleanup_health()` is executable by `service_role` and by neither `authenticated` nor
    `anon`.
  - `mux_cleanup_collect_runs()` is executable by no API role.
  - `mux_cleanup_runs` has RLS on and is not readable by `authenticated` or `anon`.
- **Switches:** database `off`; secrets identical (the same 11 names and digests, still no
  `MUX_CLEANUP_MODE`), so the worker stays `dry_run`.
- **No outbound cleanup request:** pg_net queue 0, still the 3 answers of 12 Oct (max id 3);
  `mux_cleanup_runs` 0 rows.
- **Queue:** unchanged, only the canary's `done` job; 0 purge failures; no new failure. Cron since
  the push: `mux-cleanup` and `send-push` ran and succeeded, 0 failures.
- **Data:** every `public` table hash and `auth.users` identical to before; the only new table is
  `mux_cleanup_runs`, empty.
  - **Founder:** response `md5(row_to_json)` `c9918f82…`, ledger `md5(u::text)` `9726bb8f…`, both
    unchanged and `live`. `web_video` `live` with playback `8UqSC…`, **HLS 200**.
  - **Canary:** `web_video` `unavailable`; asset and HLS 404.
- **Unchanged since the preflight:** the Mux inventory (Shortcut Beta and spike, ids, statuses,
  playback ids); the Edge Functions (`mux-cleanup` v3 and the other four, same bundle hashes and
  deploy times); the secrets (names, digests, times); Vault (2 secrets, created 15:49:18 12 Oct).
- **`mux_cleanup_health()` (02:13:33): `warn`**, mode `off`. Its only problems are
  "has not run yet" for `mux-cleanup-monitor` (created a minute earlier), `mux-sweep`,
  `prune-mux-cleanup-jobs` and `prune-moderation-records`. Those three daily jobs have never run on
  hosted; first runs are due 13 Oct 03:30, 03:40 and 04:45 UTC. All of this is expected and none
  of it is a deployment failure. No alert: 0 failed or stuck jobs, nothing due, 0 purge failures,
  no worker request; `mux-cleanup` last ran 02:13:00; `purge-deleted-accounts` last ran 12 Oct
  03:15, within its 26 hours.
- **One scheduled monitoring interval observed:**
  - `mux-cleanup-monitor` ran at **02:20:00** and **succeeded** in 18 ms ("1 row": the function's
    return value, 0 answers copied).
  - It wrote nothing: `mux_cleanup_runs` still 0 rows, pg_net queue 0 and still 3 answers.
  - Health at 02:21:04: `warn`, now only the three daily jobs not yet run (`mux-sweep`,
    `prune-mux-cleanup-jobs`, `prune-moderation-records`).
  - Cron from the push to 02:21: `mux-cleanup` 9 runs, `send-push` 9, `tonight-prompt` 1,
    monitor 1; 0 failures.
  - A full snapshot at 02:21:48 was identical to the post-deployment one: fingerprint
    759 / `10acc19f…`, every table hash, functions, secrets, Vault, founder, canary, queue and Mux.
    Switch `off`, 17 migrations.
- **Side effects of the method:** the CLI's temporary login role was refreshed on each linked
  command; link files written in the scratch folders were deleted.
- **Not checked:** the Postgres log for the migration and the Edge Function logs (Dashboard sign-in
  needed). The daily jobs' first runs on hosted (03:15 purge, 03:30 and 03:40 prunes, 04:45 sweep)
  come after this record; with the switch `off` the sweep returns before any request, and the
  prunes have nothing to delete.
- **Rollback:** not needed; available as reviewed
  (`supabase/rollback/20261013000100_cleanup_reliability.down.sql` as a new forward migration).
- **Next:** step B (redeploy `mux-cleanup` with the G1 plans) needs Nemat's separate approval. The
  hosted worker is still the `faf1a41` code (v3), which the new schema was tested to accept.

**R0 step B: `mux-cleanup` worker redeployed, v3 → v4 (13 Oct, 02:30:06 to 02:30:15 UTC; approved
by Nemat: this one function only).** From `69da75f` (clean tree; this worktree's branch, cut from
`main`, was moved to it). Deployed from a `git archive` of `HEAD` in a scratch folder:
`supabase/config.toml`, `supabase/templates`, `supabase/functions/mux-cleanup` and
`supabase/functions/_shared`. Read-only checks used the R0 preflight method and the step A snapshot
scripts (Management API, `READ ONLY` transactions rolled back, `scripts/schema-fingerprint.sql`;
Mux `GET`s only). No other Edge Function, no secret, Vault entry, environment variable, switch or
alert was changed; no `--prune`; no Mux call other than `GET`s; nothing pushed to git.

*Reviewed change* (`faf1a41` → `69da75f`, deployed files): only `mux-cleanup/handler.ts`.
`describePlan` makes a dry run record the action, its target and, for playback, the direction and
playback ids (G1); `forLog` shortens playback ids in the function log. Request handling (`POST`
only, then the timing-safe `Bearer MUX_CLEANUP_KEY` check), both switches and the live path are
unchanged. `index.ts`, `_shared/mux.ts` and `_shared/supabase.ts` are byte-identical. Locally:
`deno check` clean, `deno lint` clean, Deno unit 32/32 (`mux_test.ts`, `cleanup_unit_test.ts`).

*Final preflight (02:26 to 02:28):*
- **Schema:** 17 migrations, latest `20261013000100`; fingerprint **759**, line for line the tested
  post-migration listing (`10acc19ffaef4d3ebe549d37b2c2199c`).
- **Switches:** database `off` (12 Oct 17:16:21, 4B); 11 secrets, **no `MUX_CLEANUP_MODE`**.
- **Queue:** only the canary's `done` job; 0 purge failures; overview nothing due, stuck, failed,
  in review or planned. `mux_cleanup_runs` 0 rows; pg_net queue 0, still the 3 answers of 12 Oct.
- **Founder:** response `md5(row_to_json)` `c9918f82…`, ledger `md5(u::text)` `9726bb8f…`, both
  `live` / `claimed`; `web_video` `live`; HLS 200.
- **Everything else identical to step A's 02:21 snapshot** (apart from cron run counters): every
  table hash and `auth.users`; functions (versions, bundle hashes, deploy times); secrets (names,
  digests, times); Vault (2 secrets, 12 Oct 15:49:18); Mux (Shortcut Beta: the founder's asset
  alone, 0 live streams; canary asset and HLS 404; spike 7 assets, 25 uploads).
- **Health (02:27:41):** `warn`, mode `off`; only "has not run yet" for `mux-sweep`,
  `prune-mux-cleanup-jobs` and `prune-moderation-records`. Monitor ran 02:20, succeeded.

*Deploy:* `supabase functions deploy mux-cleanup --no-verify-jwt --project-ref
picvoavfxnajfjkqawju --workdir <scratch>`.
- A first attempt at 02:29:46 stopped in the CLI's config check before bundling: the archive
  lacked `supabase/templates` (`config.toml` names the sign-in email template). Nothing was
  uploaded: `functions list` straight after still showed `mux-cleanup` v3 with the old bundle
  hash. The template was added from the same commit.
- The second attempt, 02:30:06 to 02:30:15: "Deployed Functions.", exit 0.

*Post-deployment verification (02:30 to 02:33):*
- **Functions:**

  | Function | Version | Bundle hash | Last deployed (UTC) |
  |---|---|---|---|
  | `mux-cleanup` | **v4** (was v3) | `5adecf46…` (was `2f53c7a7…`) | 13 Oct 02:30:10 |
  | `auth-signin-method` | v6 | `e4894bcb…` | 10 Oct 04:52 (unchanged) |
  | `mux-create-upload` | v6 | `bd0a6937…` | 12 Oct 10:40 (unchanged) |
  | `mux-upload-status` | v7 | `aaa0aab6…` | 12 Oct 15:50 (unchanged) |
  | `mux-webhook` | v8 | `e4679407…` | 12 Oct 15:49 (unchanged) |

  All `ACTIVE`, `verify_jwt` false.
- **Deployed bundle = the reviewed code.** `functions download` returns transpiled source, so the
  comparison was structural: both sides through the TypeScript transpiler (types and comments
  removed), then the syntax tree (node kinds, identifier and literal values; formatting, quote
  style, trailing commas and redundant parentheses ignored).
  - Method check first: the deployed v3 matched `faf1a41` in all four files, and differed from
    `69da75f` in `handler.ts` only.
  - v4 has exactly four files (`mux-cleanup/index.ts`, `mux-cleanup/handler.ts`, `_shared/mux.ts`,
    `_shared/supabase.ts`), no test file, and **all four match `69da75f`**; its `handler.ts`
    differs from `faf1a41`.
- **Method and authentication** (02:31:46 to 02:32:01):
  - `GET`, `PUT`, `DELETE` 405 `POST only`; `GET` with the correct key 405.
  - `POST` 401 `unauthorized` with: no `Authorization`, `Bearer garbage`, a random wrong 64-hex
    key, the right key without `Bearer`, the right key in an `apikey` header only, and the right
    key plus one character.
  - Not repeated this time: the legacy anon, legacy service-role, publishable and new secret keys
    (fetching the project's API keys was refused by the session's permission rules). The handler's
    authentication code is unchanged from v3, where all four were checked (12 Oct).
- **Keyed, switch `off`** (confirmed `off` at 02:31:29, immediately before):
  - `drain` and an empty body: 200 `{"ok":true,"mode":"off","claimed":0,…}`, every count 0.
  - `sweep`: 200 `{"ok":true,"mode":"off","skipped":"off"}`, which returns before listing assets.
  - An unknown mode: 400 `invalid_mode`.
  - With the database `off`, `mux_cleanup_claim` returns before selecting jobs; its only write
    (expired leases) touches `running` jobs, of which there are none. So no Mux call was possible
    and no row was written.
- **After (02:32:21 snapshot, against the 02:26 preflight):**
  - Fingerprint 759 / `10acc19f…`; 17 migrations.
  - Every table hash and `auth.users` identical; founder hashes unchanged, `web_video` `live`;
    canary `unavailable`.
  - Queue unchanged (the one `done` job); `mux_cleanup_runs` 0 rows; pg_net queue 0, max answer id
    still 3 (no outbound request by the scheduler).
  - Mux identical: the founder's asset `ready`, its `GET` 200, **HLS 200**; canary asset and HLS
    **404**; 0 live streams; spike 7 assets, 25 uploads.
  - Vault identical.
  - **Secrets:** the same 11 names and digests, still no `MUX_CLEANUP_MODE`; the four set by us
    (`MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET`, `MUX_CLEANUP_KEY`) have unchanged
    times. The seven platform-managed `SUPABASE_*` entries show `updated_at` 02:30:10, the deploy
    time, with identical digests. This is platform behaviour on any function deploy (on 12 Oct
    they took the `mux-upload-status` deploy time, 15:50:03), not a configuration change.
- **Scheduler, two monitoring intervals after the deploy observed (to 02:51):**
  - `mux-cleanup-monitor` ran at **02:40:00** and **02:50:00** and **succeeded** both times (12 ms,
    "1 row", 0 answers copied). `mux-cleanup` (every minute) ran 21 times since the deploy, all
    succeeded; `send-push` 21 and `tonight-prompt` 2, 0 failures. 0 failed runs on any schedule.
  - No new cleanup job (still the one `done` job); `mux_cleanup_runs` 0 rows; pg_net queue 0, max
    answer id 3, so no request to the worker or Mux from the database; health worker metrics all 0.
  - **Health (02:51:02): `warn`**, mode `off`, with only "has not run yet" for `mux-sweep`,
    `prune-mux-cleanup-jobs` and `prune-moderation-records`. Their first runs are due 13 Oct 04:45,
    03:40 and 03:30 UTC. That is the expected state, not a deployment failure.
  - A full snapshot at 02:51:13 was identical to the 02:32 one: fingerprint 759 / `10acc19f…`,
    every table hash, founder and canary, functions (versions, bundle hashes, times), secrets,
    Vault, queue and Mux (founder HLS 200, canary 404). Only the cron run counters moved.
- **Final cleanup modes:** database switch `off`; worker secret `MUX_CLEANUP_MODE` unset, so its own
  mode is `dry_run`; effective mode `off`. Nothing was switched to `dry_run` or `live`.
- **Side effects of the method:** the CLI's temporary login role was refreshed on each linked
  command; link files written in the scratch folders were deleted. The keyed and unkeyed test
  requests appear in the function's invocation log.
- **Not checked:** the Edge Function and gateway logs (Dashboard sign-in needed): expected are
  only the 405, 401, 200 and 400 answers above, between 02:31:46 and 02:32:01, and no error. The
  daily jobs' first runs (03:15 purge, 03:30 and 03:40 prunes, 04:45 sweep) come after this
  record.
- **Rollback:** not needed. Available as reviewed: redeploy `mux-cleanup` from `faf1a41` (the
  database accepts either version).
- **R0 is complete.** The next step in the revised sequence is CP0, which needs Nemat's separate
  approval.

**CP0: disposable test account T1 and one video V (13 Oct, 03:10 to 08:53 UTC; approved by Nemat:
one invite, one test account, one new Mux asset).** Nemat signed up T1 and recorded and posted V on
the iPhone (founder Release build from `ede68ed`); everything else was read-only, by the R0 method
(Management API, `READ ONLY` transactions rolled back; Mux `GET`s only). The only write made from
here was the invite. Cleanup switches, functions, secrets and Vault were not touched; no Mux call
other than `GET`s; nothing pushed to git.

*Preflight (03:10:32 to 03:11:07):*
- Identical to the end of R0 step B, apart from cron run counters: 17 migrations; fingerprint 759 /
  `10acc19f…`; `mux-cleanup` v4 `ACTIVE`; switch `off`; no `MUX_CLEANUP_MODE`; only the canary's
  `done` job; 0 purge failures; founder hashes unchanged; HLS 200.
- Health `warn`, only "has not run yet" for the three daily jobs.
- **Mux headroom:** Shortcut Beta 1 asset (the founder's), spike 7. That is 8 of the free plan's
  10 if the cap is account-wide (unconfirmed), so 9 after V.

*Invite (03:11:48):* `public.team_create_invite(null, 'canggu', null, null)`, the call
`scripts/create-invite.sh` makes, run with `supabase db query --linked --project-ref`. It ran in
one transaction that first required exactly one existing invite and no unused one.
- Invite `773dd3fc-95f0-4f18-b222-a4f20b1f05d3`: team-created (no inviter), cohort `canggu`,
  valid to 20 Oct 03:11:48. Single-use by schema (one `redeemed_by`).
- The call returned no rows (its last statement was the `commit`). A read-only check before
  anything else confirmed exactly one new invite.

*T1 sign-up (Nemat, iPhone, 08:30 to 08:32):*
- **The founder signed out first** (Me → Sign out, about 08:30:45): the founder's `auth.users`
  `updated_at` moved to 08:30:45, and its sessions and refresh tokens are gone. Every other
  founder auth field is as on 10 Oct; the founder's account, profile, invite and place-follow rows
  are byte-identical. The founder signs back in with an email code when needed.
- **T1 = `b0c14e38-4e89-4dbd-a9a3-8a8c01872a78`** (username `test_t1`, name "test one").
  - Auth: created 08:31:05; email confirmed 08:31:23 (a `+` alias of a Gmail address; the
    address is not recorded here); one `email` identity; one session, `aal1`, method `otp`;
    password null; not banned or deleted.
  - Account: 18+ at 08:31:25; cohort `canggu`; moderation `active`; not deleted.
  - Invite `773dd3fc…` redeemed by T1 at 08:31:33, once; T1 follows Canggu (`source` `cohort`),
    as redemption does. Not on the waitlist.
  - Profile at 08:31:47: no photo, no bio.
- **Check at 08:33 to 08:35:**
  - Fingerprint, functions, secrets, Mux and the queue all unchanged.
  - Only `auth.users`, `accounts`, `profiles`, `invites` and `place_follows` changed, each +1
    row (T1's); hashes over the other rows equal the preflight's.
  - `analytics_events` 47 → 57, the 47 earlier rows identical.
  - 0 responses, uploads or jobs added; 0 activity, follows or push tokens.
- **Health 08:34:51: `ok`.** The four daily jobs had their first hosted runs at 03:15
  (`purge-deleted-accounts`), 03:30, 03:40 (the prunes) and 04:45 (`mux-sweep`, which returned at
  once with the switch `off`); all succeeded. No cron failure on any schedule.
- *Seen:* `signup_started` was logged three times in one batch (08:31:28.789). Harmless for the
  test, but it would triple-count sign-ups in the metrics. Not changed.

*V, recorded and posted by T1 (08:42:34 to 08:43:10):*
- **Deviation 1: V is a response to the prompt, not a video reply.** The plan was a reply to the
  founder's response. `record_started` says `kind` `response`: T1 tapped Respond on Home (the
  prompt T1 had not answered yet), not "Reply to Nemat" in the player. So V is T1's response to the
  same prompt, with no activity row for the founder.
  - Tests A, B and E act on a member's own video whichever kind it is (`mod_remove_video`,
    `mod_restore_video`, account deletion and purge), so V serves them as planned.
  - T1 has now responded to this prompt; another response from T1 would be refused
    (`already_responded`). Nemat to accept V as is before Test A.
- **V's identifiers (for Tests A, B and E):**
  - Response `52bbaabb-6faa-4bd2-94f9-015e43be791d`: `kind` `response`, author T1, prompt
    `ddd5a383-be11-475f-9576-0a6db79cabe3` (the founder's prompt), no caption, 5,744 ms; created
    08:42:47, `live` 08:43:09.56.
  - Ledger `9b41ba53-ac7e-4bfc-a3eb-ed4020e76bde`: `claimed` 08:42:47 by T1, linked to V.
  - Mux upload `aoOFWQtNksIeQRlMpJYKdKa9O02EQG01OYFlHkjaxNMnE`: `asset_created`, passthrough T1,
    public playback policy.
  - Asset **a** = `01IyQdSiLvAbHXb01Xg1ZQISiMz9UvMxLMgfZDpscKMBw`: `ready`, 5.744 s, 1080p
    `basic`, no errors; `upload_id` = the ledger's upload; passthrough T1.
  - Public playback id **P1** = `fye4EdwnAEa3f5bPfhNDi9z9r8UA2lAbXk6al014PKI8`, the only one on
    a; HLS **200**.
  - `web_video(V)` `live` with P1 and author `test_t1`.
  - `mux_playback_wanted(V, a)` true; `mux_asset_hold(a, u)` `infinity` (in use).
- **Deviation 2: a second upload URL, minted by the app, not by a re-record.** Ledger
  `352be921-42d7-4e46-9771-0b9aa8ce666d`, Mux upload
  `QswMY9w2quyprnJqAGTY01UDCnJ4HE7pRsQP201ALMEAM`, owner T1: created 08:42:44.4 and `active` at
  08:42:45.9 (the Mux round trip took 1.5 s). Unclaimed; Mux `waiting`, no asset; times out at Mux
  about 09:42:44.
  - **Cause:** Post Review starts `mintUpload()` on opening but stores the ticket only when it
    resolves (`app/src/app/record/review.tsx`). T1 tapped Post on the disclosure sheet at 08:42:45.2
    (phone clock), before the first mint answered. So `prepareUpload` got `ticket: null` and
    minted the second URL (08:42:45.8), which V claimed.
  - The same race is in the current code, not only the installed build. Not a clean-up target (no
    asset, no job), and Test C1's count is unaffected (T1 is at 2 of 10 this hour).
  - Not cancelled (not authorised); it times out by itself. Fix to be decided (below).
- **Webhooks:** **not verified.** Nemat to read Dashboard → Edge Functions → `mux-webhook` →
  Invocations for 08:42 to 08:44 (expected: only `POST` 200s).
  - It is not recorded which path set V `live`: the `video.asset.ready` webhook or the app's
    `mux-upload-status` poll. `live_at` is 08:43:09.56, and the phone logged `video_published` at
    08:43:10.3.
- **After (08:51 to 08:53):**
  - **Mux:** Shortcut Beta has exactly **2 assets**, the founder's and a, so **+1**. Uploads 5:
    V's `asset_created`, the stray `waiting`, plus the three earlier. 0 live streams.
    - Founder: asset `GET` 200, HLS 200.
    - Canary: asset and HLS 404.
    - Spike: 7 assets, 25 uploads.
  - **Database:**
    - Fingerprint 759 / `10acc19f…`; 17 migrations; functions (versions, bundle hashes), secrets
      and Vault identical.
    - Only `responses` (+1, V), `video_uploads` (+2, both T1's), `accounts` (T1's row: the
      disclosure acknowledged at 08:42:45, the notification ask `declined_once`) and
      `analytics_events` (57 → 70) changed.
  - **Founder:** account, profile, `auth.users` row (as after the sign-out), responses and uploads
    hashes unchanged; response `c9918f82…` and ledger `9726bb8f…` `live` / `claimed`;
    `web_video` `live`.
  - **Cleanup:** switch `off` (12 Oct 17:16:21); no `MUX_CLEANUP_MODE`; queue only the canary's
    `done` job; `mux_cleanup_runs` 0; pg_net queue 0, max answer id 3. Health `ok`, no problem.
- *Script fix (scratch only):* the snapshot query picked "the founder's response" as the only
  live response; with V live it now names the founder's response id.

*Upload progress (investigated locally, no code changed).* Nemat saw no percentage, no bytes sent
and no time remaining while V posted.
- **What is approved:** board `PR-Posting` shows "Posting your response", a percentage, a bar and
  "Keep Shortcut open until it's done." **No bytes and no time remaining.** Adding them is a design
  change that needs a board first (design gate).
- **What the code does:** `PostingBanner` (`app/src/ui/HomeStates.tsx`) draws
  `round(progress × 100)%` and the bar. `putRecording` (`app/src/video/upload.ts`) feeds it from
  expo-file-system 57's `File.createUploadTask` `onProgress` (`bytesSent` / `totalBytes`, field
  names correct). The `processing` state sets the bar to 100%.
- **Likely causes (unconfirmed without a device recording):**
  - **The upload is too short to show:** 2.5 Mbit/s for 5.7 s is about 2 MB, which goes up in
    well under a second on Wi-Fi.
  - **Background `URLSession`:** the upload task uses expo-file-system's default `sessionType`,
    `background` (`ios/FileSystemUploadTask.swift`), where progress comes from an out-of-process
    daemon, throttled to 100 ms, and may arrive late or only at the end.
  - **The banner then sits at 100% for about 20 s** (row 08:42:47 → `live` 08:43:09) while Mux
    processes, with nothing saying it is processing. A jump from 0% to 100% and a long wait at
    100% look like "no progress".
- **Spec concern (SPEC.md Section 2 non-goals; line 552):** "There is no background upload that
  survives closing the app."
  - A background `URLSession` keeps uploading when the app is suspended or terminated by the
    system (not when force-quit). On relaunch the app shows Retry for that post, which would send
    the bytes a second time.
  - The likely fix is `sessionType: 'foreground'` in `putRecording`. Needs Nemat's decision and a
    new build.
- **To confirm:** a screen recording of the banner during the next real upload; Test C2a (Network
  Link Conditioner) slows the upload enough to see it. An `upload_progress` or upload-duration
  event would also show it in the metrics.

*Not checked:* the Edge Function logs (Dashboard sign-in needed): the `mux-webhook`,
`mux-create-upload` and `mux-upload-status` invocations for 08:42 to 08:44.

*Next:* Test A (A1 moderator removal, A2 dry run; then A3 playback revocation) needs Nemat's separate
approval. Before it, Nemat to decide:
- whether V, a response rather than a reply, is accepted as the test video;
- the `mux-webhook` invocation check;
- whether to fix the double mint and the session type now or after the Mux tests.

**Test A1: moderator removal of V and a dry run of its playback revocation (13 Oct, 09:08 to
09:21 UTC; approved by Nemat: Test A1 only).** Nemat's approval covered the plan's A1 (the removal)
and A2 (the dry run) together, as "Test A1". The plan's A3, the real playback revocation, is now
called **Test A2** and needs its own approval. From `6d764b5` (this worktree's branch, cut from
`main`, was fast-forwarded to it). Read-only checks used the R0/CP0 method (Management API, `READ
ONLY` transactions rolled back, `scripts/schema-fingerprint.sql`; Mux `GET`s only). Exactly three
writes were sent from here:
1. the removal;
2. the database switch to `dry_run`, with one drain;
3. the switch back to `off`.

The worker and the scheduler then wrote only their own records: J1's release with its plan, J2's
reschedule (G3), the run row and its collection by the monitor.

No Edge Function, secret, Vault entry, environment variable, alert or moderator privilege was
changed. No Mux call other than `GET`s was made; no upload, asset or account was deleted; nothing
was pushed to git.

*Before (decisions from CP0's "Next"):*
- Nemat accepted V (a response, not a video reply) as the test video by naming it in the approval.
- Nemat verified the `mux-webhook` invocations for CP0 in the Dashboard: all five were `POST` 200.
- The double mint and the upload session type are still undecided (not part of this test).

*Preflight (09:08 to 09:11), identical to the end of CP0 apart from cron run counters:*
- **Schema:** 17 migrations, latest `20261013000100`; fingerprint **759 / `10acc19f…`**, line for
  line.
- **Functions and secrets:** functions (versions, bundle hashes, times) identical; `mux-cleanup` v4
  `5adecf46…` `ACTIVE`. Secrets identical: 11 names, **no `MUX_CLEANUP_MODE`**. Vault identical:
  2 secrets, 12 Oct 15:49:18.
- **Data:** every `public` table hash and `auth.users` identical.
- **Switch:** `off` (12 Oct 17:16:21, 4B).
- **Queue:** only the canary's `done` job, so 0 due, 0 running, 0 failed; 0 purge failures.
  `mux_cleanup_runs` 0 rows. pg_net queue 0.
- **Cron:** 8 jobs active, 0 failures ever. The next daily job is 03:15 UTC, so none ran in the
  window.
- **Health:** `ok`, mode `off`, no problems.
- **V and T1:**
  - V: `live`, `kind` `response`, author T1, asset a, upload u, playback P1, not removed.
  - V's ledger row: `claimed`.
  - T1: `active`, not deleted, 0 push tokens, 0 activity.
  - 0 moderation actions, 0 review requests, 0 reports on V.
  - `mux_playback_wanted` true; `mux_asset_hold` `infinity`.
- **Read paths:** V was visible on every one:
  - `web_video` anonymously, in SQL and over HTTP (`/rest/v1/rpc/web_video` with the publishable
    key);
  - as the founder: `get_video`, `get_response`, `prompt_responses` (entry `live`, V listed) and
    `profile_responses(T1)`;
  - as T1: `get_video`, `prompt_responses` and `profile_responses`.

  Viewers were simulated with transaction-local JWT claims inside the read-only transaction.
- **Mux:**
  - Asset a: `GET` 200, `ready`, passthrough T1, `upload_id` u, playback ids exactly [P1 `public`];
    P1 HLS 200. Upload u: `asset_created`, asset a, passthrough T1.
  - Shortcut Beta: 2 assets (founder `L7KxG29…`, playback `8UqSC…`, HLS 200; and a), 5 uploads,
    0 live streams.
  - Canary: asset and HLS 404.
  - Spike: 7 assets, 25 uploads.
- **Removal and restore paths, by reading the deployed code** (part of the 759 fingerprint):
  - `mod_remove_video` takes any `live` or `processing` video, whatever its kind.
  - `mod_restore_video` (with the G2 fix) takes a `removed` video while `mux_video_restorable`
    holds: the asset is kept, and no deletion of it is running or done. It closes the removal's
    pending deletion and queues a `sync_playback` (`moderation_restored`).

  So this primary response can be removed now and restored in Test B. The restore was **not** run.

*Step 2, moderator removal (09:12:18 to 09:12:20).* This is the call `scripts/moderate.sh
remove-video` makes. It was sent as explicit SQL with `supabase db query --linked --project-ref`
(G7: the script needs a linked worktree). The moderator is the script's default, git `user.name`.
- **Guards:** one transaction first raised unless:
  - the switch was `off`;
  - the queue was only the canary's `done` job;
  - V was `live` with exactly the CP0 ids;
  - there were no moderation records;
  - T1 was active.

  After the call, it raised unless there was exactly one `remove` action on V, V was `removed` with
  its ids kept, there were exactly the two expected jobs, and there was exactly one `removed`
  activity for T1.
- **Call:**
  `select public.mod_remove_video('52bbaabb-6faa-4bd2-94f9-015e43be791d', 'Something else',
  'Nemat', '<note>')`.
  - The reason "Something else" is the spec's catch-all report reason (SPEC.md Section 17). It is
    what T1's A-Removed notice shows.
  - The internal note reads "Stage 3 Test A1: disposable test video V on test account T1;
    approved by Nemat 13 Oct; run by Claude Code".
  - The call returned action **M = `d69bf735-08ca-4c60-a94f-5269010295d2`**, created 09:12:19.46.
    A separate read-only select confirmed the commit.
- **Moderation state:**
  - V `removed`, `removed_action_id` = M; asset a, upload u and P1 kept on the row.
  - M: `remove`, `video`, account T1, moderator `Nemat`, no review request, so the case closed at
    M (`moderation_case_closed_at` = 09:12:19.46).
  - T1's pinned response was already null; no reports to close.
  - T1's account row is unchanged: `removed` is not a kind that marks the second notification ask.
- **Notice:**
  - One activity `removed` for T1 (`849f428e-47b4-40a3-9973-9012adaf1d27`, action M).
  - One `push_outbox` row (id 1, `removed`), still unsent. `send-push` is not deployed on hosted
    and its Vault secrets do not exist, so `run_push_sender` returns at once. T1 has no push token
    either. **No push was sent.**
- **Cleanup jobs**, exactly two, both `pending`, `moderation_removed`, asset a, upload u,
  response V, owner T1, 0 attempts, due 09:12:19.46:
  - **J1 `sync_playback` `bb01b807-a5a8-43b1-ae6c-91a2ab3965f1`**;
  - **J2 `delete_asset` `f2482f95-4c71-4344-94f7-8649840525f7`**.
- **Holds:** `mux_playback_wanted(V, a)` false; `mux_asset_hold(a, u)` = M + 30 days
  (12 Nov 09:12:19 UTC); `mux_video_restorable(V)` true.
- **Public read paths:** V is unavailable on all of them:
  - `web_video` anonymously (SQL and HTTP, status `unavailable`);
  - as the founder: `get_video` and `get_response` `unavailable`; `prompt_responses` entry
    `unavailable`, with only the founder's response listed; `profile_responses(T1)` empty; V gone
    from the founder's `web_video` "more";
  - as T1: `get_video` `unavailable`, `prompt_responses` entry `unavailable`,
    `profile_responses` empty.
- **Mux:** unchanged, as expected; P1 HLS still 200.

*Step 3, controlled dry run (09:15:03 to 09:15:15).* Started 3 s after a cron tick, so the
switch was back `off` before the next tick (09:16:00).
- **Guards:** one transaction first raised unless:
  - the switch was `off`;
  - the queue was exactly J1 and J2 (both due) plus the canary's `done` job, with nothing running;
  - V was removed by M, still with P1;
  - `mux_playback_wanted` was false;
  - there was no review request;
  - the pg_net queue was empty.

  It then ran `mux_cleanup_set_mode('dry_run', 'Nemat: stage 3 Test A1 dry run (Claude Code)')`
  and one `run_mux_cleanup('drain')`, and committed: request **4**, at 09:15:03.96.
- **Worker result** (pg_net id 4, 09:15:04.0, HTTP 200): `{"ok": true, "mode": "dry_run",
  "claimed": 1, "release": 1}`, and 0 `done`, `found_asset`, `retry`, `skipped`, `failed`,
  `stale` and `unrecorded`.
  - The worker's mode was `dry_run`: the database said `dry_run` and `MUX_CLEANUP_MODE` was unset.
  - `runJob` records the plan and releases before any change, and `changer()` refuses every
    `POST`, `PUT` and `DELETE` outside `live`.
- **Switch back off** at **09:15:11.73**, as `mux_cleanup_set_mode('off', 'Nemat: stage 3 Test A1
  dry run finished (Claude Code)')`. It ran from a `finally` block, so it would have run on any
  failure too. A separate select at 09:15:15 read `off`.
- **J1, the plan recorded in its result:**
  `{"dry_run": true, "would": {"act": "sync", "direction": "revoke", "asset_id":
  "01IyQdSiLvAbHXb01Xg1ZQISiMz9UvMxLMgfZDpscKMBw", "asset_status": "ready", "owner_verified":
  true, "playback_wanted": false, "public_playback_ids": ["fye4EdwnAEa3f5bPfhNDi9z9r8UA2lAbXk6al014PKI8"],
  "would_revoke": ["fye4EdwnAEa3f5bPfhNDi9z9r8UA2lAbXk6al014PKI8"]}}`.
  - J1 is back to `pending`, 0 attempts, `not_before` 10:15:06 (the release's hour).
  - `mux_cleanup_overview` lists it under `dry_run_planned`.
- **Checked against the approval:**
  - **Ownership checks passed:** `owner_verified` true, so `assetMismatch` found asset id = a,
    passthrough = T1 and `upload_id` = u. No `not_verified`, no `failed`.
  - **The asset is T1's video's:** `asset_id` a = V's `mux_asset_id`.
  - **It plans to revoke exactly P1:** `direction` `revoke`, `would_revoke` [P1].
  - **It does not plan to delete the asset:** J2 was never leased. The claim in the drain's second
    batch (J1 held the asset in the first) found the retention and moved J2 to 12 Nov 09:12:19,
    exactly `mux_asset_hold`, with 0 attempts and no result. This is G3, the one database write a
    dry run makes; there is no delete plan.
  - **It does not plan a restore:** the direction is `revoke`, with no `would_create` and no
    `would_record`.
  - **No other asset or playback id:** 1 job claimed for 1 asset; the plan names only a and P1. The
    founder's asset and the canary are not in any job.
- **No Mux change:** asset a at 09:15:55 and 09:20 was byte-for-byte the preflight's: `ready`,
  passthrough T1, `upload_id` u, playback ids exactly [P1]. The Shortcut Beta and spike inventories
  are identical.

*Step 4, configuration and postflight (09:20:40 to 09:21:03), after one monitoring interval:*
- **Cleanup configuration:** database switch **`off`** (09:15:11.73); worker secret
  **`MUX_CLEANUP_MODE` unset** (11 secrets, names and digests identical), so its own mode is
  `dry_run`. The effective mode is `off`. Nothing was ever `live`.
- **Monitor:** `mux-cleanup-monitor` ran at 09:20:00 and collected request 4: `ok` true, status 200,
  summary `claimed` 1, `release` 1, mode `dry_run`.
- **Requests:** exactly **one** worker request (id 4). No cron drain overlapped: `run_mux_cleanup`
  returns before any request while `off`.
- **Cron since 09:12:** 0 failures (`mux-cleanup` and `send-push` 10 runs each; monitor and
  `tonight-prompt` 1 each).
- **Health (09:21): `ok`**, mode `off`, no problems; worker `requests_24h` 1, 0 errors, timeouts or
  no-responses.
- **pg_net:** the three answers of 12 Oct are gone (`pg_net.ttl` 6 hours); only id 4 is left.
- **Queue retained for Test A2:**
  - J1 `pending`, holding its dry-run plan. `mux_cleanup_set_mode('live')` makes it due at once
    (it resets `not_before` for dry-run-planned pending jobs).
  - J2 `pending` until 12 Nov 09:12:19 (M + 30 days); not due for A2.
  - The canary's `done` job.
- **Schema:** fingerprint **759 / `10acc19f…`** line for line; 17 migrations.
- **Tables:** only the expected ones changed:
  - `responses` (V's row only; the founder's and the canary's hashes unchanged);
  - `moderation_actions` +1 (M); `activity` +1; `push_outbox` +1;
  - `mux_cleanup_jobs` +2 (J1, J2); `mux_cleanup_runs` +1 (request 4);
  - `mux_cleanup_settings` (mode `off`, `changed_at`/`changed_by` updated).

  Every other `public` table, `auth.users`, T1's account and V's ledger row are identical.
- **Functions, secrets and Vault:** identical (versions, bundle hashes, times, digests).
- **Founder untouched:** response `c9918f82…` `live`, ledger `9726bb8f…` `claimed`; `web_video`
  `live`; asset `L7KxG29…` `GET` 200; **HLS 200**.
- **Mux:**
  - Shortcut Beta still **2 assets** (founder and a, both `ready`) and 5 uploads (the stray
    `QswMY9w…` still `waiting`; it times out by itself about 09:42); 0 live streams.
  - Canary asset and HLS 404.
  - Spike 7 assets, 25 uploads.
- **P1 is still publicly streamable at Mux.** `stream.mux.com/<P1>.m3u8` answered 200
  (`#EXTM3U`, `Cache-Control: no-cache, no-store, must-revalidate`) at 09:12, 09:15 and 09:20.
  Shortcut's public read paths no longer hand out P1. The one path that still returns it is T1's
  own removal notice, `get_notice(M)`, which only the action's account can read; it was checked as
  T1. The notice uses P1 for a blurred thumbnail of the removed item
  (`app/src/app/notice/[actionId].tsx`), and draws no image once the playback id is null after
  Test A2. Anyone who already has P1 can still watch V until Test A2 revokes it. While clean-up is
  off, that is the state of every removed video.
- **Health after a day:** J1 waits while the switch is `off`. If Test A2 has not run by **14 Oct
  09:12:19 UTC** (24 hours after J1 was created), `mux_cleanup_health` turns **`warn`**
  (`waiting_while_not_live`). That is expected, not a failure.

*Side effects of the method:* the CLI's temporary login role was refreshed on each linked command;
link files written in the scratch folder were deleted.

*Not checked:*
- The Edge Function logs (Dashboard sign-in needed). Expected for `mux-cleanup`: one invocation
  at about 09:15:04, `POST` 200, logging J1 `release` with playback ids shortened (`fye4…`).
- The A-Removed notice in the app. In SQL as T1, `get_notice(M)` gives `remove`, "Something
  else", V, no review requested. The iPhone may still be signed in as T1 from CP0. Not needed for
  the clean-up test.

*Rollback:* not needed. If Nemat wanted V back before Test A2, the restore is `mod_restore_video`
(Test B1). Clean-up is `off`, so the restore's `sync_playback` would wait, and P1 is still at Mux.

*Next:* **Test A2** (the plan's A3), deleting P1 at Mux (irreversible; the asset stays), needs
Nemat's separate approval. The preconditions to re-check then:
- J1 is the only job that becomes due when `live` is set;
- J2 stays held until 12 Nov;
- asset a still has exactly [P1];
- the founder is untouched.

It needs `supabase secrets set MUX_CLEANUP_MODE=live` (a new version of every function), one
drain, then `off` and `secrets unset` at once.

**Test A2: the first real Mux playback revocation, P1 of V (13 Oct, 09:34 to 09:43 UTC; approved by
Nemat: one irreversible playback-id revocation, job `bb01b807-a5a8-43b1-ae6c-91a2ab3965f1` (J1),
asset a, P1; nothing else).** This is the plan's A3. Same branch and method as Test A1. The writes
were made in this order:
1. the function variable `MUX_CLEANUP_MODE=live`;
2. one guarded transaction: the database switch `live` and one drain;
3. the switch back `off`;
4. the variable unset.

The worker made exactly one change at Mux. No sweep, no second drain, no asset deletion, upload
cancellation, account deletion or new video. No secret value was printed or committed; nothing was
pushed to git.

*Final preflight (09:34:07 to 09:34:50; precondition block re-run read-only at 09:36):*
- **Identical to the end of Test A1**, apart from cron run counters:
  - fingerprint 759 / `10acc19f…`, 17 migrations;
  - functions (`mux-cleanup` v4 `5adecf46…`), 11 secrets (no `MUX_CLEANUP_MODE`), Vault;
  - every table hash and `auth.users`; Mux, both environments.
- **Switch and queue:**
  - Switch `off` (09:15:11).
  - Queue exactly three jobs: J1 `pending` (0 attempts, `not_before` 10:15:06, so not even due),
    J2 `pending` held to **12 Nov 09:12:19.462949**, and the canary's `done` job. 0 running,
    failed, review or stuck; 0 purge failures.
- **J1's dry-run plan, unchanged:** `revoke`, `owner_verified`, asset a,
  `public_playback_ids` = `would_revoke` = [P1].
- **V, T1 and the founder:**
  - V `removed` by M, still recording P1; `mux_playback_wanted` false; 0 review requests.
  - Founder response `c9918f82…` `live`, ledger `9726bb8f…`.
- **Mux:**
  - Asset a `ready`, passthrough T1, `upload_id` u, playback ids exactly [P1 `public`].
  - `GET /assets/a/playback-ids/P1` 200; P1 HLS 200.
  - Founder `L7KxG29…` with [`8UqSC…` public], HLS 200.
  - Spike 7 assets (inventory hash `a441d4c1…`), 25 uploads.
- **Health:** `ok`, `off`, no problems.

*Execution (`live.py`; one attempt, never retried; the off and unset steps in a `finally` block):*
- **09:36:56.0:** `supabase secrets set MUX_CLEANUP_MODE=live`, with the database still `off`.
  - Checked 09:37:02: 12 secrets; `MUX_CLEANUP_MODE` digest = sha256(`live`), `updated_at`
    09:36:56.411; the other 11 digests unchanged.
  - Every function moved up one version with an unchanged bundle hash, all `ACTIVE`
    (`mux-cleanup` v5).
- **09:37:03.8, Mux re-check (`GET`):** asset a `ready`, passthrough T1, upload u, playback ids
  exactly [P1]. The switch was still `off`.
- **09:38:03, just after the 09:38:00 cron tick:** one transaction.
  1. It re-checked every preflight condition: the switch `off`; exactly the three jobs; J1's fields
     and plan; J2's hold; V; `wanted` false; the founder's hashes; pg_net queue empty.
  2. It ran `mux_cleanup_set_mode('live', 'Nemat: stage 3 Test A2 playback revocation (Claude
     Code)')`, which made J1 due (it resets dry-run-planned jobs). It then checked that **exactly
     one job was due and that it was J1**, with J2's hold unchanged.
  3. It ran one `run_mux_cleanup('drain')` and checked that it queued exactly one request.

  Any difference would have raised and rolled back, leaving the switch `off`. The transaction
  committed at 09:38:03.91: request **5**, mode `live`.
- **Worker result:** pg_net id 5, created 09:38:03.94, **HTTP 200**, not timed out:
  `{"ok":true,"mode":"live","claimed":1,"done":1,"found_asset":0,"retry":0,"release":0,"skipped":0,
  "failed":0,"stale":0,"unrecorded":0}`.
- **What the worker did:** it leased J1 (attempt 1), `GET` the asset, and passed the ownership
  check. `mux_cleanup_check` answered `live`, `wanted` false. It sent `DELETE
  /video/v1/assets/a/playback-ids/P1` and finished J1 at **09:38:08.47**: `done`,
  `{"outcome": "revoked"}`.
- **09:38:11.40, switch `off`** (`'Nemat: stage 3 Test A2 playback revocation finished (Claude
  Code)'`). A separate select at 09:38:14.96 read `off`. **The database switch was `live` for about
  7.5 s** (09:38:03.9 to 09:38:11.4).
- **09:38:15 to 09:38:21, `supabase secrets unset MUX_CLEANUP_MODE`:**
  - 11 secrets, no `MUX_CLEANUP_MODE`.
  - Every function up one more version, bundles unchanged.
  - The variable was `live` for about 1 min 20 s, of which the database allowed changes for the
    7.5 s above. **Both switches have been non-live since 09:38:21.**
- **Scheduler during the window:** the 09:37:00 and 09:38:00 ticks fell while the database was
  `off`, so `run_mux_cleanup` returned with no request. Only requests 4 (Test A1) and 5 exist, so
  the controlled drain was the only one.

*Mux's actual responses after the revocation (`GET`s, 09:38:33):*
- **`GET /video/v1/assets/a`:** 200, `status` `ready`, the same passthrough (T1), `upload_id` u,
  `created_at` `1791880987`, 5.744 s, 1080p `basic`, no errors. **`playback_ids` `[]`, so no
  playback id is left and none was created.**
- **`GET /video/v1/assets/a/playback-ids/P1`:** **404**, body `{"error": {"type": "not_found",
  "messages": ["Playback ID not found"]}}` (it was 200 at 09:34).
- **`https://stream.mux.com/P1.m3u8`:** **404**, `{"error":{"messages":["Invalid Playback
  ID"],"type":"not_found"}}`, `Cache-Control: no-cache, no-store, must-revalidate`, `X-Cache:
  MISS` (varnish, BKK). Re-checked at 09:39:40, 09:41:00 and 09:42:30: 404 and `MISS` each time.
  `image.mux.com/P1/thumbnail.jpg` was 404 ("Invalid Playback ID") each time.
- **Not visible from here:** the `DELETE`'s own status. Mux documents 204, but the worker records
  only `revoked`, and its `revoke()` treats a 404 as already revoked too.
  - That this `DELETE` removed P1 follows from P1 being present at 09:37:03.8 (and at the worker's
    own `GET`, which passed the plan) and gone at 09:38:33, with nothing else able to call Mux in
    between.
  - The exact code is only in the `mux-cleanup` invocation log (Dashboard sign-in needed).
  - Not tested: whether HLS segments the CDN cached before 09:38 kept playing for a while (no
    player held P1 during the test).

*Database after (09:38:45 and full postflight 09:43):*
- **J1:** `done` exactly once (1 attempt), `{"outcome": "revoked"}`, finished 09:38:08.47. Owner
  and response cleared: the minimal record kept 30 days, as designed for a `done` job.
- **V:** still `removed` by M; `mux_playback_id` **null** (cleared by `mux_cleanup_finish`), asset
  a and upload u kept. `mux_video_restorable(V)` true, so Test B can still restore it.
- **J2, retention untouched:** `pending`, 0 attempts, no result, `not_before` 12 Nov 09:12:19.462949
  = `mux_asset_hold(a, u)`.
- **Queue:** 0 due, running, failed, review or stuck; `dry_run_planned` empty. The Test A1 note
  that health would turn `warn` on 14 Oct no longer applies: J1 is done, and a held deletion does
  not count as waiting.
- **Shortcut still hides V:**
  - `web_video` anonymously (SQL and HTTP) `unavailable`;
  - as the founder: `get_video`, `get_response` and the `prompt_responses` entry `unavailable`,
    only the founder's response listed, `profile_responses(T1)` empty;
  - as T1: `get_video` and the `prompt_responses` entry `unavailable`, `profile_responses` empty.

  T1's removal notice now carries no playback id, so the app draws no thumbnail.
- **Tables:** fingerprint 759 / `10acc19f…`, line for line. Only these changed:
  - `responses` (V's row only);
  - `mux_cleanup_jobs` (J1);
  - `mux_cleanup_runs` (+1, request 5);
  - `mux_cleanup_settings`.

  Every other table hash and `auth.users` are identical, including `video_uploads`. Founder
  response `c9918f82…` `live` and ledger `9726bb8f…` unchanged.
- **Monitor:** collected request 5 at 09:40:00: `ok` true, 200, summary `live`, `claimed` 1,
  `done` 1.
- **Cron:** since 09:12, 0 failures on any schedule.
- **Health (09:43): `ok`**, mode `off`, no problems; `requests_24h` 2, 0 errors, timeouts or
  no-responses.
- **pg_net:** answers 4 and 5, queue 0.

*Mux after (09:43, `GET`s):*
- **Shortcut Beta:** still **2 assets**. a is `ready` with no playback id; the founder's
  `L7KxG29…` is `ready` with [`8UqSC…` public], `GET` 200, **HLS 200**. 0 live streams.
- **Uploads:** 5, as before, except the CP0 stray `QswMY9w…`. It went from `waiting` to
  `timed_out` by Mux's own one-hour timeout (minted 08:42:44), as CP0 expected; not our call. Its
  ledger row is unchanged; `open_upload_urls` 1 → 0 only because its `expires_at` passed.
- **Canary:** asset and HLS 404.
- **Spike:** 7 assets, inventory hash `a441d4c1…` unchanged, 25 uploads.

*Version and timestamp changes (platform behaviour, not configuration):*
- Every function moved up two versions with identical bundle hashes and code: one for the set,
  one for the unset. Now `auth-signin-method` v8, `mux-cleanup` v6, `mux-create-upload` v8,
  `mux-upload-status` v9, `mux-webhook` v10, all `ACTIVE`, `verify_jwt` false.
- The secrets list is byte-identical to the preflight: names, digests and `updated_at`. Unlike
  4B, the platform `SUPABASE_*` entries kept their times.

*Real configuration changes:* none remaining. The database switch is **`off`** (09:38:11.40) and
**`MUX_CLEANUP_MODE` is unset**, so the worker's own mode is `dry_run` and the effective mode is
`off`.

*Not checked:* the Edge Function logs (Dashboard sign-in needed).
- Expected: one `mux-cleanup` invocation at about 09:38:04, `POST` 200, logging J1 `done` /
  `revoked` with `fye4…`.
- Possibly a Mux webhook to `mux-webhook` answered `ignored`: it acts only on `video.asset.ready`,
  and the database shows no change from it.

*Rollback:* a revoked playback id cannot come back; P1 is gone for good. V can be made playable
again only with a **new** id (Test B: `mod_restore_video`, then a `POST` of a public playback id),
which needs its own approval.

*Next:* **Test B** (restore V with a new playback id P2) needs Nemat's separate approval.

**Test B1: moderator restore of V and a dry run of its playback restoration (13 Oct, 09:56 to
10:11 UTC; approved by Nemat: Test B1 only).** Same branch and method as Tests A1 and A2. Three
writes were sent from here:
1. the restore;
2. the database switch to `dry_run`, with one drain;
3. the switch back to `off`.

The worker and the scheduler then wrote only their own records: J3's release with its plan, the
run row and its collection. No Edge Function, secret, Vault entry, environment variable or other
moderation record was changed. No Mux call other than `GET`s; nothing pushed to git. The real
playback restoration is **Test B2** and needs its own approval.

*Fresh preflight (09:57 to 09:58), identical to the end of Test A2* (09:43, apart from cron run
counters):
- **Schema and configuration:** fingerprint 759 / `10acc19f…`, 17 migrations; functions
  (`mux-cleanup` v6 `5adecf46…`, the others v8 to v10, same bundles); 11 secrets, **no
  `MUX_CLEANUP_MODE`**; Vault; every table hash and `auth.users`.
- **Switch and queue:**
  - Switch `off` (09:38:11).
  - Queue: J2 `pending`, held to **12 Nov 09:12:19.462949**, 0 attempts; J1 `done` / `revoked`;
    the canary's `done` job. Nothing due, running, failed or in review.
- **V and moderation records:**
  - V `removed` by M, asset a, upload u, playback id null; `mux_video_restorable(V)` true.
  - Moderation actions: only M; 0 review requests.
- **Mux (`GET`s, 09:57):**
  - Asset a `ready`, passthrough T1, `upload_id` u, **`playback_ids` `[]`**.
  - P1: `GET /assets/a/playback-ids/P1` 404, HLS 404.
  - Founder `L7KxG29…` [`8UqSC…`], HLS 200.
  - Shortcut Beta 2 assets; spike 7 (hash `a441d4c1…`), 25 uploads.
- **Health:** `ok`, `off`.
- **T1's own view (baseline):** `get_video` and `get_response` `unavailable`; the removal notice
  `get_notice(M)` has the video with no playback id.

*Step 2, moderator restore (09:59:09 to 09:59:10).* This is the call `scripts/moderate.sh
restore-video` makes, sent as explicit SQL by the `--project-ref` method (G7), with moderator
`Nemat` (git `user.name`).
- **Guards:** one transaction checked before the call that:
  - the switch was `off`;
  - the queue was exactly as after Test A2;
  - V was removed by M, with no playback id, and restorable;
  - M was the only moderation record and there was no review request.

  After the call, it checked:
  - exactly one new `restore` action, and M byte-identical;
  - V `live` with its asset and upload, no playback id, `live_at` unchanged;
  - J2 closed by the G2 fix;
  - exactly one new job, `sync_playback`, and no open deletion;
  - hold `infinity`, `wanted` true;
  - T1's activity and V's ledger row unchanged.
- **Call:**
  `select public.mod_restore_video('52bbaabb-6faa-4bd2-94f9-015e43be791d', 'Removal reversed',
  'Nemat', '<note>')`.
  - The internal note reads "Stage 3 Test B1: restore of disposable test video V on test account
    T1 (reverses d69bf735); approved by Nemat 13 Oct; run by Claude Code".
  - The reason is not shown to T1: a restore sends no notice.
  - It returned restore action **R = `0eba022b-ee0f-44b5-a91e-369d46c0374d`**, created
    09:59:09.90. A separate read-only select confirmed the commit.
- **How the removal is now resolved:** `moderation_actions` has no "reversed" field. The only
  `reversed` marker is a review decision (`review_requests.outcome`), and that needs T1 to request
  a review in the app first. So by the direct moderator path:
  - **M is kept unchanged**, as history: `remove`, "Something else", byte-identical.
  - **R** records the reversal: `restore`, video V, account T1, moderator `Nemat`, reason
    "Removal reversed".
  - V's `removed_action_id` is now **null**, so no removal applies to V.
  - `mod_account_log(T1)` (read at 10:12) lists both, newest first: R, then M, neither with a
    review.
  - No review request exists. The reviewed path (`request_review` by T1, then
    `mod_decide_review(M, 'reversed')`) would have set `outcome` `reversed` on the review request
    and notified T1. Nemat chose the direct path.
- **The old deletion J2** (`f2482f95…`), closed at once by the G2 fix: `skipped`, finished
  09:59:09.90, `{"outcome": "kept", "detail": "restored by a moderator: the removal's retention
  ended"}`, 0 attempts. It can never run. **No asset deletion is open** (none `pending`, `running`
  or `review`); `mux_asset_hold(a, u)` = `infinity` (in use).
- **New job J3 = `96ba6614-adf1-4604-861f-3e81974653f4`**, the only open job:
  - `sync_playback`, `moderation_restored`, `pending`, 0 attempts, due 09:59:09.90.
  - Asset a, upload u, response V, owner T1.
  - Exactly one new job; J1 (`done`) was not reopened.
- **V:**
  - `live`, `removed_action_id` null, asset a and upload u kept, `mux_playback_id` null, `live_at`
    08:43:09.56 unchanged.
  - `mux_playback_wanted` true; `mux_video_restorable` false (not removed).
  - The `responses_activity` trigger fires only on `processing` → `live`, so it made no activity.
- **Unchanged:**
  - T1's activity (still only M's `removed`) and its unsent `push_outbox` row;
  - V's ledger row;
  - review requests (0);
  - Mux (asset a `ready`, `[]`; P1 404; the founder's HLS 200).

*Visible before a new playback id exists? No, except to T1 by direct id.* Measured at 09:59 and
10:11:
- **Everyone else:** `video_visible` needs a playback id, so V stays hidden.
  - `web_video` anonymously (SQL and HTTP) `unavailable`.
  - As the founder: `get_video`, `get_response` and the `prompt_responses` entry `unavailable`;
    only the founder's response listed; `profile_responses(T1)` empty.
- **T1, the author:**
  - In lists V is hidden: the `prompt_responses` entry `unavailable`, not listed, and
    `profile_responses` empty (it shows the author's own videos only when `processing`).
  - **`get_video` and `get_response` return V's full card**, `status` `live`, `is_own` true,
    **`playback_id` null**. They let the author see their own `live` video.
- **In the app (from the code; not run on a device):** `VideoSurface` with a null `playbackId` has
  no source and no thumbnail. If T1 opened V by its id (for example from a link), the player would
  be an empty surface with no copy until B2.
- **The removal notice:** `get_notice(M)` still shows the removal ("Something else", no review),
  and T1's Activity still has the `removed` row. Nothing tells T1 that the video is back, and the
  spec defines no restore notice.
- **How long this lasts:** with clean-up live this window is about a minute (the cron); here it
  lasts until Test B2, because clean-up is `off`.
- Neither the empty player nor the lingering notice is a board-approved state. Both are recorded
  for Nemat; nothing was changed.

*Step 3, controlled dry run (10:01:03 to 10:01:16),* started 3 s after a cron tick. `MUX_CLEANUP_MODE`
was rechecked unset just before (11 secrets).
- **Guards:** one transaction checked that:
  - the switch was `off`;
  - there were exactly 4 jobs, with J3 the only open one and due, with its fields as created;
  - J2 was `skipped`;
  - V was `live` with no playback id, and `wanted` true;
  - the pg_net queue was empty and the runs were unchanged.

  It then ran `mux_cleanup_set_mode('dry_run', 'Nemat: stage 3 Test B1 dry run (Claude Code)')`
  and one `run_mux_cleanup('drain')`, checked that exactly one request was queued, and committed
  at 10:01:03.86: request **6**.
- **Worker result** (pg_net id 6, 10:01:03.91, **HTTP 200**): `{"ok":true,"mode":"dry_run",
  "claimed":1,"release":1}`, and 0 `done`, `found_asset`, `retry`, `skipped`, `failed`, `stale`
  and `unrecorded`.
- **Switch `off` at 10:01:13.04** (from the driver's `finally` block). A separate select at
  10:01:16 read `off`. The database was `dry_run` for about 9 s, with no cron tick in between.
- **J3's recorded plan:**
  `{"dry_run": true, "would": {"act": "sync", "direction": "restore", "asset_id":
  "01IyQdSiLvAbHXb01Xg1ZQISiMz9UvMxLMgfZDpscKMBw", "asset_status": "ready", "owner_verified":
  true, "playback_wanted": true, "public_playback_ids": [], "would_create": "public"}}`.
  - J3 is back to `pending`, 0 attempts, `not_before` 11:01:08.36 (the release's hour).
  - `mux_cleanup_overview` lists it under `dry_run_planned`.
- **Checked against the approval:**
  - **Mux `GET`s confirm the asset, owner and upload.** `owner_verified` means the worker's `GET`
    passed `assetMismatch`: id = a, passthrough = T1, `upload_id` = u. My own `GET` at 10:01:26
    agrees.
  - **The plan is a restore:** `direction` `restore`, `would_create` `public`. There is no
    `would_revoke` and no delete. J2 stayed `skipped` (`updated_at` 09:59:09.90) and J1 `done`.
  - **Only T1's existing asset:** 1 job claimed, for asset a.
  - **P1 is not reused:** Mux lists no playback id on a, and P1 is 404 at the API and the CDN. A
    restore `POST`s `/assets/a/playback-ids` for a new public id; nothing in the worker can bring
    back an old id.
  - **No Mux change:** `GET`s at 10:01:26 and 10:11 are identical to the preflight. Asset a is
    `ready`, same `created_at`, `playback_ids` `[]`, so **no playback id was created**. The worker
    in `dry_run` returns its plan before `execute`, and `changer()` refuses every `POST`, `PUT` and
    `DELETE` outside `live`.

*Step 4, configuration and postflight (10:10:40 to 10:11:30, after one monitoring interval):*
- **Cleanup configuration:** database switch **`off`** (10:01:13.04); **`MUX_CLEANUP_MODE`
  unset** (11 secrets, names, digests and times identical); effective mode `off`.
- **Queue retained for B2:**
  - J3 is the only open job (`pending`, its plan recorded, re-due 11:01:08).
    `mux_cleanup_set_mode('live')` makes it due at once.
  - Nothing else can run: J2 `skipped`, J1 and the canary `done`.
  - No deletion is open, and `mux_asset_hold` is `infinity`.
- **Monitor:** collected request 6 at 10:10:00: `ok`, 200, `dry_run`, `claimed` 1, `release` 1.
- **Cron:** since 09:12, 0 failures on any schedule.
- **Health (10:11): `ok`**, `off`, no problems; `requests_24h` 3, 0 errors, timeouts or
  no-responses.
- **Database:** fingerprint 759 / `10acc19f…`. Only these tables changed:
  - `moderation_actions` (+R);
  - `responses` (V only);
  - `mux_cleanup_jobs` (J2 closed, J3 added);
  - `mux_cleanup_runs` (+request 6);
  - `mux_cleanup_settings`.

  Every other table hash, `auth.users`, the founder's and the canary's rows, and Vault are
  unchanged.
- **Functions and secrets:** identical to the preflight; no version change in B1.
- **Founder untouched:** response `c9918f82…` `live`, ledger `9726bb8f…`; asset `L7KxG29…`
  [`8UqSC…`], **HLS 200**.
- **Mux inventory unchanged:**
  - Shortcut Beta 2 assets (a `ready` with `[]`, the founder's); uploads as at the end of A2;
    0 live streams.
  - Spike 7 assets (hash `a441d4c1…`), 25 uploads.
- **Health after a day:** J3 counts as waiting while not live. If Test B2 has not run by **14 Oct
  09:59:09 UTC**, `mux_cleanup_health` turns **`warn`** (`waiting_while_not_live`). That is
  expected, not a failure.

*Not checked:*
- The Edge Function logs (Dashboard sign-in needed). Expected: one `mux-cleanup` invocation at
  about 10:01:04, `POST` 200, J3 `release`.
- The app on a device: how T1 sees the restored video with no playback id, and the notice.

*Rollback:* if Nemat wanted V removed again before B2, that is a new `mod_remove_video` (a new
action; P1 is gone, so there is nothing to revoke).

*Next:* **Test B2**, creating one new public playback id P2 at Mux for asset a, needs Nemat's
separate approval. Before it, Nemat may want to decide whether the two observations above
(T1's empty player by direct id, and no restore notice) need a board or a spec note.

**Test B2: the first real Mux playback restoration, a new public playback id P2 for V (13 Oct,
10:30 to 10:41 UTC; approved by Nemat: one playback-id creation on asset a, job
`96ba6614-adf1-4604-861f-3e81974653f4` (J3); nothing else).** Same branch and method as before, and
the same guarded procedure as Test A2 (the `live.py` driver, adapted for J3). The writes were:
1. the function variable `MUX_CLEANUP_MODE=live`;
2. one guarded transaction: the database switch `live` and one drain;
3. the switch back `off`;
4. the variable unset.

The worker made exactly one change at Mux, the playback-id `POST`. No sweep, no second drain, no
revocation, asset deletion, upload cancellation or new video. No secret value was printed or
committed; nothing was pushed to git. The restore UI and the missing restore notice (Test B1) were
left as they are, as instructed.

*Final preflight (10:30:40 to 10:31:30), identical to the end of Test B1* (10:11, apart from cron
run counters):
- **Schema and configuration:**
  - 17 migrations, latest `20261013000100`; fingerprint **759 / `10acc19f…`** line for line.
  - Functions: `mux-cleanup` v6 `5adecf46…`; the others v8 to v10, bundles unchanged.
  - The same 11 secrets (names, digests, times), **no `MUX_CLEANUP_MODE`**; database switch `off`
    (10:01:13); Vault; every table hash and `auth.users`.
- **V:** restored (`live`, `removed_action_id` null, no playback id, asset a, upload u);
  `mux_playback_wanted` true; `mux_asset_hold` `infinity`.
- **Queue:**
  - J2 `skipped` (`kept`, "restored by a moderator: the removal's retention ended").
  - J3 the only open job, `pending`, 0 attempts, with its plan: `restore`, `owner_verified`,
    asset a, `public_playback_ids` `[]`, `would_create` `public`.
  - J1 and the canary `done`.
- **Mux (`GET`s):**
  - Asset a `ready`, passthrough T1, `upload_id` u, **`playback_ids` `[]`**.
  - P1: API 404, HLS 404, thumbnail 404.
  - Founder `L7KxG29…` [`8UqSC…`], HLS 200.
  - Shortcut Beta 2 assets; spike 7 (hash `a441d4c1…`), 25 uploads.
- **Health:** `ok`, `off`.
- **The transaction's precondition block,** run alone read-only at 10:31: passed.

*Execution (`live_b2.py`; one attempt, never retried; off and unset in a `finally` block):*
- **10:32:15.3:** `supabase secrets set MUX_CLEANUP_MODE=live`, with the database still `off`.
  - Checked 10:32:22: 12 secrets; `MUX_CLEANUP_MODE` digest = sha256(`live`), `updated_at`
    10:32:15.657; the other 11 digests unchanged.
  - Every function moved up one version with an unchanged bundle, all `ACTIVE` (`mux-cleanup` v7).
- **10:32:23.7, Mux re-check (`GET`):** asset a `ready`, passthrough T1, upload u, playback ids
  `[]`. The switch was still `off`.
- **10:33:03, just after the 10:33:00 cron tick:** one transaction.
  1. It re-checked everything:
     - the switch `off`;
     - exactly 4 jobs, with J3 the only open one, its fields and its restore plan;
     - J2 `skipped`; J1 and the canary `done`;
     - V restored with no playback id, and `wanted` true;
     - the founder's hashes;
     - pg_net queue empty; runs unchanged.
  2. It ran `mux_cleanup_set_mode('live', 'Nemat: stage 3 Test B2 playback restoration (Claude
     Code)')` and checked that **exactly one job was due and that it was J3**.
  3. It ran one `run_mux_cleanup('drain')` and checked that it queued exactly one request.

  The transaction committed at **10:33:04.11**: request **7**, mode `live`.
- **Worker result:** pg_net id 7, created 10:33:04.15, **HTTP 200**, not timed out:
  `{"ok":true,"mode":"live","claimed":1,"done":1,"found_asset":0,"retry":0,"release":0,"skipped":0,
  "failed":0,"stale":0,"unrecorded":0}`.
- **What the worker did:**
  1. It leased J3 (attempt 1) and `GET` the asset; ownership passed (id a, passthrough T1, upload u)
     and there were no public ids.
  2. `mux_cleanup_check` answered `live`, `wanted` true.
  3. It sent `POST /video/v1/assets/a/playback-ids` `{"policy": "public"}`.
  4. It asked the database again (still wanted) and finished J3 at **10:33:09.10**: `done`,
     `{"outcome": "restored"}`.
  5. `mux_cleanup_finish` re-checked `wanted` under V's row lock and recorded P2 on V.
- **10:33:11.61, switch `off`.** A separate select at 10:33:15 read `off`. **The database switch was
  `live` for about 7.5 s** (10:33:04.1 to 10:33:11.6).
- **10:33:17, read-only (after `off`):** J3 `done`, 1 attempt, `{"outcome": "restored"}`;
  V `mux_playback_id` = P2. Database and Mux agreed, so nothing was ambiguous.
- **10:33:17 to 10:33:24, `supabase secrets unset MUX_CLEANUP_MODE`:**
  - 11 secrets, no `MUX_CLEANUP_MODE`.
  - Every function up one more version, bundles unchanged.
  - The variable was `live` for about 1 min 5 s, of which the database allowed changes for the
    7.5 s above. **Both switches have been non-live since 10:33:24.**
- **Scheduler:** the 10:32:00 and 10:33:00 ticks fell while the database was `off`; only requests
  4 to 7 exist. The controlled drain was the only one.

**P2 = `tu8ooWH201axyHzgonRLCnDhETAgeWw014kaZMAHMrdmo`**, a new id, different from P1.

*Mux's actual responses (`GET`s, 10:33:46, and again at 10:41):*
- **`GET /video/v1/assets/a`:** 200, `ready`. The same id, `created_at` `1791880987`, 5.744 s,
  passthrough T1, `upload_id` u, no errors. **`playback_ids` exactly `[{"policy": "public", "id":
  "tu8ooWH201axyHzgonRLCnDhETAgeWw014kaZMAHMrdmo"}]`.**
- **`GET /video/v1/assets/a/playback-ids/P2`:** **200**, `{"data": {"policy": "public", "id":
  "tu8ooWH…dmo"}}`.
- **P2 plays:**
  - `stream.mux.com/P2.m3u8` **200** (`application/vnd.apple.mpegurl`, `#EXTM3U`, `no-store`,
    `MISS`).
  - At 10:40, its first rendition playlist 200 and that playlist's first segment 200 (`video/mp4`,
    1,170,411 bytes).
  - `image.mux.com/P2/thumbnail.jpg` **200** (`image/jpeg`).
- **P1 is still gone:** `GET …/playback-ids/P1` **404** ("Playback ID not found"); HLS **404**
  ("Invalid Playback ID", `MISS`); thumbnail **404**.
- **No new asset:**
  - Shortcut Beta still **2 assets**: a, with [P2], and the founder's `L7KxG29…` with
    [`8UqSC…`], `GET` 200, **HLS 200**.
  - Upload u still `asset_created` with `asset_id` a; uploads otherwise as at the end of B1.
  - 0 live streams.
- **Spike untouched:** 7 assets, inventory hash `a441d4c1…` unchanged, 25 uploads.
- **Not visible from here:** the `POST`'s raw response. The worker keeps only the id it returned
  (now on V, and listed by Mux). The invocation log has the line (Dashboard sign-in needed).

*Database after (10:33:17, and full postflight 10:40:40 to 10:41:10, after one monitoring
interval):*
- **J3:** `done` **exactly once**: 1 attempt, `{"outcome": "restored"}`, finished 10:33:09.10.
  Owner and response cleared (the minimal record kept 30 days). No `recorded: false`, so P2 was
  recorded.
- **V:** `live`, `removed_action_id` null; **`mux_playback_id` = P2**; asset a, upload u and
  `live_at` 08:43:09.56 unchanged. Its ledger row is unchanged.
- **The former deletion J2:** still `skipped` (`kept`), finished 09:59:09.90, untouched. J1 `done` /
  `revoked`, untouched.
- **Queue:**
  - `mux_asset_hold(a, u)` `infinity` (in use).
  - 0 due, running, failed, review or stuck; nothing in `dry_run_planned`.
  - No open job of any kind. The B1 note about a `warn` on 14 Oct no longer applies.
- **Shortcut shows V again:**
  - `web_video(V)` anonymously: **`live`** with P2, in SQL and over HTTP. V is back in the
    founder's `web_video` "more".
  - As the founder: `get_video` and `get_response` `live`; the `prompt_responses` entry `live`, V
    listed (with the founder's response); `profile_responses(T1)` lists V.
  - As T1: `get_video` and `get_response` `live` with P2; `prompt_responses` entry `live`;
    `profile_responses` lists V.
  - The empty-player window of Test B1 is over.
- **T1's records:**
  - T1's removal notice (`get_notice(M)`) now carries P2, so it would draw a blurred thumbnail of
    the restored video.
  - T1's Activity is unchanged: still only M's `removed`, and still no restore notice (recorded in
    B1, not changed).
- **Tables:** fingerprint **759 / `10acc19f…`** line for line. Only these changed:
  - `responses` (V's row only);
  - `mux_cleanup_jobs` (J3);
  - `mux_cleanup_runs` (+request 7);
  - `mux_cleanup_settings`.

  Every other table hash, `auth.users`, counts, the founder's and the canary's rows, and Vault are
  unchanged.
- **Founder untouched:** response `c9918f82…` `live`, ledger `9726bb8f…` `claimed`.
- **Monitor:** collected request 7 at 10:40:00: `ok`, 200, `live`, `claimed` 1, `done` 1.
- **Cron:** since 09:12, 0 failures on any schedule (`mux-cleanup` and `send-push` 90 runs each,
  monitor and `tonight-prompt` 9).
- **Health (10:41): `ok`**, mode `off`, no problems; `requests_24h` 4, 0 errors, timeouts or
  no-responses.
- **pg_net:** answers 4 to 7, queue 0.

*Version and timestamp changes (platform behaviour, not configuration):*
- Every function moved up two versions with identical bundle hashes: one for the set, one for the
  unset. Now `auth-signin-method` v10, `mux-cleanup` v8, `mux-create-upload` v10,
  `mux-upload-status` v11, `mux-webhook` v12, all `ACTIVE`, `verify_jwt` false.
- The secrets list is byte-identical to the preflight (names, digests, `updated_at`).

*Final cleanup modes:* database switch **`off`** (10:33:11.61, "stage 3 Test B2 playback
restoration finished"); **`MUX_CLEANUP_MODE` unset**, so the worker's own mode is `dry_run` and the
effective mode is `off`. No real configuration change remains.

*Not checked:* the Edge Function logs (Dashboard sign-in needed).
- Expected: one `mux-cleanup` invocation at about 10:33:04, `POST` 200, logging J3 `done` /
  `restored` with `tu8o…`.
- Possibly a Mux webhook answered `ignored`: `mux-webhook` acts only on `video.asset.ready`, and the
  database shows no change from it.

Also not checked: V in the app on a device.

*Tests A and B are complete.* V went live → removed → P1 revoked → restored → P2 created, on the
same asset. Each Mux change was approved separately, and both switches are now non-live. Mux:
Shortcut Beta 2 assets, spike 7, so 9 of the free plan's 10 if the cap is account-wide.

*Next* (each needs Nemat's separate approval): C1, C2, E1 to E3 in the plan above. Open from B1:
the restore notice and T1's empty player before a new id exists.

## 16. Duplicate upload URLs and background uploads (13 Oct; built and tested locally, not deployed)

Asked for by Nemat after Tests A and B: fix the upload-URL duplication seen in step 4A (12 Oct,
ledger `72561473…`) and in CP0 (13 Oct, ledger `352be921…`) before Tests C1 and C2. Investigate the
iOS background upload, without changing it.

Authorised: local implementation and testing only.
- No hosted query, deployment, Mux call, minted URL, video or switch change.
- App code only; no server or migration change.
- No board, copy or visual state changed.

**Reproduced first** (a scratch Jest test on the unchanged code, with mints answering only when the
test released them; not committed):
1. **The CP0 race.** Post Review mints on open and keeps the URL only when Mux answers. A Post
   tapped before then passes no URL, and `prepareUpload` mints a second one. Result: 2 mints, the
   first URL left unused (CP0's stray upload).
2. **Double tap.** `busy` is React state, so two taps from one render both submit.
   - The second sends the same URL and is refused as `upload_already_used`, which counts as a
     stale URL, so it mints a new one.
   - Result: 2 mints and 2 rows for one recording: a second video reply, or `already_responded`
     for a response.
   - The disclosure sheet's Post had no guard at all.
3. **Lost answer.** Post creates the row, but the answer is lost (the connection drops). Post again
   gets `upload_already_used` and silently mints a replacement and a second row. The first row
   stays `processing`, invisible, with no bytes.
4. **Retry with no row** (by reading `posting.tsx`): a post that never got a row minted a new URL
   on every Retry, because the URL was not saved before the row was created.

**Fix** (app only):
- **`app/src/video/ticketStore.ts` (new, pure):** one upload URL at a time for the signed-in member.
  - `prefetch` starts a request unless one is running or a usable URL is held.
  - `get` returns the held URL, joins the running request, or starts one. Concurrent callers share
    one request.
  - The URL is scoped to the member (another member never gets it) and is handed out for 50
    minutes (the server's slot and Mux's URL last 60).
  - It leaves the store when a row holds it (`consume`) or the server refuses it (`drop`).
  - A failed request is forgotten, so the next `get` asks again; a prefetch failure nobody waits
    for is not an unhandled rejection.
- **`app/src/video/uploadTickets.ts` (new):** the app's one store, minting through the existing
  `mintUpload`.
- **`prepareUpload` (`postingFlow.ts`)** takes the member's ticket source instead of a raw URL.
  - Post, and the disclosure sheet's Post, use the request Post Review started, even while it is
    still running.
  - A Post Review URL refused as stale is replaced once, as before. **A URL already sent with a
    post is never replaced automatically** (case 3): it may be held by a row whose answer was
    lost.
  - A network failure keeps the URL for the next Post, instead of minting.
  - Limits, refusals and restrictions behave as before (failed post with the reason; A-Restricted
    and LV-Suspended thrown).
- **`createGate` (`postingFlow.ts`), used by Post Review:** Post and the disclosure sheet's Post run
  one at a time, and taps before the re-render join the first run.
- **`createOncePerKey` (`postingFlow.ts`), used by the posting provider:** a recording is posted
  once. Posting the same recording again gets the first call's promise, unless that call threw.
- **`ensureUploadRow` (`postingFlow.ts`), used by Retry for a post with no row:** the URL is saved
  with the post before the row is created, so a failed attempt reuses it. One refused as stale is
  cleared, so the next attempt mints.
- **`review.tsx`:** Post Review prefetches through the store for `session.user.id`, instead of
  minting into a ref.
- **Re-record, Discard and leaving Post Review:** a URL nobody posted with stays for the member's
  next take, so re-recording no longer leaves an unused URL at Mux each time. The store is in
  memory, so an app restart starts afresh.

**Preserved:**
- **Server checks:** every URL is still minted by `mux-create-upload` (ownership, reservation,
  limits, the stage 2 retire of an abandoned URL) and claimed once by `post_response`,
  `post_reply` or `post_draft`.
- **Abandoned uploads:** `abandon_response`, Discard and the Upload failed banner are unchanged.

**Tests (all local):**
- **App, Jest: 123/123** (96 before):
  - `uploadRace.test.ts`, new, 24 tests: the CP0 race; the disclosure path; shared slow answers;
    StrictMode double prefetch; rapid taps (one `prepareUpload`, one mint, one row); the gate
    reopening after success and failure; once per recording; failed prefetch while Post waits (one
    request, failed post) and before Post (one more request); restrictions; re-record after and
    during the request; Post Review unmounted before the answer; a new URL after a post; the
    50-minute limit; member scoping; Retry's saved URL (reuse, stale clear, old URL, a row already
    there, refusal).
  - `postingFlow.test.ts`: the 11 old `prepareUpload` cases ported to the store, plus 3 new: the
    posted URL leaves the store; lost answer (no automatic replacement); a network failure keeps
    the URL.
- **Typecheck and lint:** `tsc --noEmit` clean; `eslint src` clean.
- **Server (unchanged code), against the local stack `shortcut-s3r`** (17 migrations, the same as
  this branch; Mux stubbed):
  - Deno unit 32/32;
  - `uploads_integration_test` 32/32;
  - `integration_test` 20/20;
  - `cleanup_integration_test` 28/28.
- **`scripts/auth-integration.mjs`: 36/37.** The one failure is "auth-signin-method reports google
  (E-Linked)", HTTP 503: that stack runs no Edge Functions runtime, so the function was not served.
  It is not related to this change and was not re-run with the function served.
- **Not run:** a component render of Post Review (no React Native testing library is a dependency;
  none was added). The screen's logic is in the pure helpers above. The UI behaviour needs a device
  check.

**Background upload on iOS (investigated; not changed).**
- **The setting:** `putRecording` (`app/src/video/upload.ts`) calls expo-file-system 57.0.7's
  `File.createUploadTask` without `sessionType`, so iOS uses the default, **`background`**: a
  `URLSessionConfiguration.background` session with `sessionSendsLaunchEvents` true and
  `isDiscretionary` false (`NetworkTaskSessionManager`). The transfer is run by the system's
  `nsurlsessiond`, outside the app. Android ignores the option: OkHttp in the app's process.
- **The conflict:** SPEC.md Section 2 lists "Background uploads that survive closing the app" as a
  non-goal, and Section 19 says "There is no background upload that survives closing the app."
- **What happens if the app is closed during a transfer (iOS; from Apple's documented
  background-session behaviour and the library code; not tried on a device):**
  - *Sent to the background, or suspended:* the upload continues. The app's JS promise and progress
    resume only if the app was not terminated.
  - *Terminated by the system while in the background:* the upload continues in `nsurlsessiond`.
    iOS may relaunch the app in the background when it ends. The new JS runtime has no task for it
    (the library says the JS task is not restored), so the app learns nothing.
  - *Force-quit by the person (swiped away):* iOS cancels the session's transfers. Nothing more is
    sent.
  - *Android, any close:* the upload stops with the process.
- **Duplicate transfers after reopening:** `resumeState` turns a post stored as `uploading` into
  Upload failed (`interrupted`), and Retry PUTs the file again. Two cases:
  - *The URL is under 55 minutes old:* Retry PUTs to the **same** URL, possibly while the first
    transfer is still running in `nsurlsessiond`, or after it finished. What Mux does with a second
    PUT to the same direct-upload URL (rejected, ignored, or replacing) is **not verified**. If the
    first transfer had finished, the video may already be live while the banner says Upload failed.
  - *The URL is older (`retry_response_upload` mints a new one):* a first transfer that finishes
    later still makes an asset at Mux for the old upload. The row now points at the new upload, so
    that asset is an **orphan**: one more asset against the free plan's 10, until the daily sweep
    queues it (a day old) and clean-up deletes it.
- **Proposed correction (not made; needs Nemat's review):**
  - Pass `sessionType: 'foreground'` in `putRecording`: a default `URLSession` in the app's process,
    so the upload stops when iOS suspends or ends the app, as on Android and as the spec says.
  - The existing rule stays: a post stored as `uploading` comes back as Upload failed with Retry,
    and the recording stays on the phone.
  - Cost: switching apps mid-upload interrupts it, and the person taps Retry. That is what PR-Posting
    asks for ("Keep Shortcut open until it's done.").
  - It would also make the progress bar report from the app's own session, which may explain CP0's
    missing percentage.
  - Needs: a new build, then a device test (start a slow upload with Network Link Conditioner, go
    to the Home screen, come back; force-quit mid-upload and reopen; check the hosted ledger and
    Mux for one upload and no orphan asset). Mux's answer to a repeated PUT on a direct-upload URL
    should be confirmed in that test or with Mux.

**Residual (not fixed here):**
- *A lost answer followed by a deliberate second Post:* the URL already sent is not replaced
  automatically (the person's next tap gets `upload_already_used`), and the next Post after that
  mints a new URL. One recording can still leave one invisible `processing` row with no bytes,
  which happens only if the connection drops after the server committed. The real fix is
  server-side: the server would hand back the member's own row for a URL it already claimed for
  them. That is a migration with its own review; not done.
- The server comment in `mux-create-upload` ("each re-record leaves an unused URL behind") is
  out of date for the new app build. Left unchanged so the deployed function's source matches.

**Recommended deployment plan** (each step needs Nemat's approval):
1. **Review** the diff (app only: `review.tsx`, `posting.tsx`, `postingFlow.ts`, `ticketStore.ts`,
   `uploadTickets.ts`, two test files). No Supabase deployment, migration, Edge Function or secret
   change is needed.
2. **Before installing the new build, decide Test C1.** C1 opened Post Review 4 times to reach the
   stage 2 retire. With this fix, reopening Post Review reuses the unused URL, so C1 no longer
   reaches it that way. Either:
   - run C1 on the build installed now (`ede68ed`) first; or
   - with the new build, reach it by killing and reopening the app between Post Review visits (the
     store is in memory, so each launch mints once).
3. **Build** the founder iPhone build (`app/scripts/founder-ios.sh`) from the reviewed commit and
   install it.
4. **Device checks, under their own approval** (each real post mints one URL and creates one Mux
   asset; Shortcut Beta is at 2, account-wide 9 of 10 if the cap is account-wide):
   - tap Post the instant Post Review opens;
   - double-tap Post, and Post on the disclosure sheet (needs an account that has not acknowledged
     it);
   - Re-record twice, then Post.

   Each must leave exactly one new `video_uploads` row for the post (read-only hosted query) and
   one asset. Also: with no connection at Post, then Retry, the same `upload_id` is kept across the
   failed attempts.
5. **The background-session decision** (above) is separate: a later change and build.

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
