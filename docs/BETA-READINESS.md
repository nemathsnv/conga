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
| B-1 Camera flip during a take (SPEC.md Section 6; Nemat, 6 Oct) | partly verified (built 16 Oct; hardened 17 Oct, section 30; Nemat reported flip, zoom and torch working on the founder iPhone, 1 Nov, section 50) | The recorder records one segment per camera and a local module stitches them (iOS `AVMutableComposition`, Android Media3 `Transformer`); upload stitches before sending; review plays the stitched file. The flip works during a take. Left: the mid-take check below with sound across the joins recorded on the iPhone, and all of it on Android (only compiled). | Real iPhone and Android: record, flip twice mid-take, stop; review and the live response play one continuous clip with sound across the joins. |
| B-3 app-link wiring in the app | needs input, then code | `associatedDomains` and `intentFilters` in `app.config.ts`, `EXPO_PUBLIC_WEB_BASE_URL` set to the domain, the two association files served (see section 6). | Part of the B-3 check in section 6. |
| Settings rows with no destination | needs input, then code | Community guidelines, Privacy policy, Terms, Help and feedback rows and the `A-Removed` guideline link are drawn and inactive; they are wired once the URLs or address exist (section 4). | Each row opens its document; `A-Removed` opens the guidelines. |
| Moderation web admin | open | A small internal web admin over the `mod_*` functions (queues, actions, the log, suggestion review). The CLI `scripts/moderate.sh` is development-only. See section 7. | A moderator handles a report, a review request and a suggestion from the admin without the CLI. |
| Post refused while creating the row (security stage 2 follow-up) | partly open (17 Oct: a dropped connection now shows Upload failed; refusals and a failed stitch are still silent and need a board) | When the server refuses the post itself for a reason other than a restriction or a stale upload URL (for example `already_responded`, `prompt_not_found`, `video_not_found`), or the connection drops at that step, Post Review still only logs it: Post does nothing visible. Pre-existing; left out of stage 2 by decision (Nemat, 12 Oct). Needs a decided state or copy. | Each refusal shows something on Post Review or Home; nothing is silent. |
| Restricted on Retry (security stage 2 follow-up) | open | A post that never got a row (an upload limit at Post) and is retried after the member has been restricted or suspended shows the Upload failed banner's generic line, not A-Restricted or LV-Suspended. Rare; left out of stage 2 by decision (Nemat, 12 Oct). | Retry by a restricted member opens A-Restricted; by a suspended one, LV-Suspended. |
| Deleted reply stays in Me → Replies (seen 12 Oct, stage 3 step 4A) | fixed (eee10a7, 16 Oct; regression test bdfb749, 17 Oct), not re-checked on a device | After Nemat deleted a test video reply on the iPhone (founder build `ede68ed`), its card stayed in Me → Replies; opening it showed "This video is not available."; it was gone only after the app restarted. The server is right (`profile_replies` no longer returns it, `get_video` answers `unavailable`); the app does not refresh the profile's lists after `delete_video` (only Home is marked dirty). Not fixed during the security verification (Nemat, 12 Oct). | Delete your own reply (and response): it leaves Me → Replies (and Responses) at once, without a restart. |
| Duplicate upload URLs (seen 12 Oct step 4A and 13 Oct CP0) | fixed locally 13 Oct, not built | Post Review's URL request raced Post's; double taps and the disclosure sheet's Post could submit twice; Retry minted on each attempt. App-only fix in section 16 (one URL per member at a time, single-flight Post, once per recording). Needs review, a founder build and the device checks in section 16. | On the iPhone: Post at once, double-tap, the disclosure Post and two re-records each leave exactly one `video_uploads` row per post. |
| iOS uploads run in a background `URLSession` (SPEC.md Sections 2 and 19) | needs decision | `putRecording` uses expo-file-system's default `sessionType` (`background`), so an upload can continue after the app closes, against the spec's non-goal; Retry after reopening can PUT again or leave an orphan asset. Proposed: `sessionType: 'foreground'` (section 16). Not changed. | Decided by Nemat; if changed, a device test of going to the Home screen and force-quitting mid-upload shows Retry and one upload, no orphan. |
| D-C: response counts include what the viewer can't see (server side; seen on the simulator 17 Oct, SIMULATOR-WALK-17OCT) | open, needs Nemat's approval (migration and hosted deployment) | After a report or a block the hidden responses still count: R-Player "1 of 4" with fewer faces, R-Player-End "You've seen all 4 responses", Home "3 more responses". Cause: `public.response_count(prompt)` (`20261008000100_safety.sql`, used by `prompt_card` in `20261016000201_viewer_visibility.sql`) calls `can_see(null, author)`, so it ignores the viewer's blocks and reports, unlike `reply_count`, which takes the viewer. Proposed: a new migration giving `response_count` the viewer (`auth.uid()`, `can_see` both ways and `video_visible`), its rollback file and a pgTAP test, on an isolated stack first; then the hosted migration as its own approved step. No app change needed. Not started; nothing changed in Supabase. | After blocking someone, every count on Home and the player equals the number of responses the viewer can open. |
| End card with one response (copy question, 17 Oct) | needs a copy decision | R-Player-End reads "You've seen all {N} responses."; with N = 1 that is "You've seen all 1 responses." No board has a singular form, so it was left as it is (the profile stats were fixed, M2). | The board or Nemat gives the one-response wording. |
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
- **Proposed correction** (made locally 13 Oct in `46cce26`, with the review of this fix: section 17):
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
5. **The background-session decision** (above) is separate: a later change and build. Built locally
   13 Oct (section 17.2); Test C1 revised to need no app (section 17.4).

## 17. Upload reliability review and foreground uploads (13 Oct; built and tested locally, not deployed)

Asked for by Nemat after section 16: review `fee64ec`, move iOS uploads to the foreground session,
design server-side idempotency for a lost answer, and revise Test C1.

Authorised: local work only.
- No hosted query, deployment, Mux call, minted URL, upload, device build, push, or UI change.
- Server changes are proposed below, not written to `supabase/migrations`.

Commits (on `claude/upload-reliability-foreground-1593d2`, on top of `fee64ec`; not pushed):
- `b1132af` App: review of fee64ec; a URL's real age, and posts kept to their member.
- `46cce26` App: foreground uploads on iOS; ask Mux before sending a recording again.
- This section (docs only).

### 17.1 Review of `fee64ec`

| Check | Verdict | Evidence or fix |
|---|---|---|
| Two recordings cannot share one upload URL | **Holds** | The server claims an upload once (`claim_video_upload`, row lock). The store can hand a URL already sent with recording 1 (answer lost) to recording 2's Post. The server refuses it (`upload_already_used`), and it is not replaced silently. New test: lost answer, re-record, Post. |
| Re-recording reuses a URL only if nothing was sent with it | **Holds, with a caveat** | A sent URL is handed out again but never *replaced* automatically (`replaceable: false`). "Sent" means sent with a post (the row claim). No bytes are ever PUT before a row exists, so no transfer can have started on a URL that is reused. |
| Sign-out and account switching isolate pending uploads | **Did not hold. Fixed in `b1132af`.** | The ticket store was scoped to the member, but the stored post was not. Signing out by any route except Sign out anyway (suspended, delete account, waitlist, age, invite, confirm email) left the post on the phone. The banner stayed in memory even after Sign out anyway. A run still uploading wrote the post back after Sign out anyway had cleared it. Another member signed in on the phone saw the banner. Their Retry could post the first member's recording **as their own** (row-less post), or send it to the first member's URL. Fix: posts carry `ownerId`; only that member sees or retries them; a post with no owner (stored by an older build) belongs to nobody. A member change aborts the run (upload task and polling), resets the ticket store, and stores and shows nothing more. Sign out anyway stops the upload before deleting the file. |
| The 50-minute expiry matches Mux validity and Retry | **Did not hold. Fixed in `b1132af`.** | The store dated a URL from the *answer*; a slow or suspended answer made it look younger. Worse, Post stored `uploadUrlExpiresAt = Post time + 55 min`. Post Review can hold a URL for up to 50 minutes, so a post could store an expiry up to 50 minutes past the real one. Retry then kept PUTting to a dead URL until that time. Fix: dated from the request. The lease carries `mintedAt`, and the post stores `mintedAt + 55 min`. The timeline: handed out to 50 min, used by Retry to 54 min (`uploadUrlUsable` keeps 60 s back), claimable on the server to 60 min from the reservation, and Mux's URL a moment later. |
| Rapid taps, unmounts and failed requests cannot duplicate | **Holds in the app.** The server gap (lost answer) is in 17.3. | Gate (per mount), once per recording (provider), shared request (store), and one run per member (`createGate`, replacing the `running` ref). An unmounted Post Review leaves its request in the store. |

Found in passing, **not fixed (needs Nemat):**
- **A second post while one is pending replaces it.** Nothing stops recording while a post uploads or
  sits failed. Posting a second recording overwrites the stored post. Its run is skipped while the
  first runs (one run at a time), and the first one's success then clears the store. So the second
  recording is lost from the app (its files stay on disk, its row stays `processing`). Before this
  work it was the same, and SPEC.md says one pending post at a time but not what happens on a
  second Post. Options: block Post while one is pending (needs a board), or queue it. Not decided
  here.
- A post with no owner, stored by the installed build `ede68ed`, is no longer shown after this
  build (whose it is cannot be known). Its recording is deleted when the member's next post
  replaces it. On the founder iPhone, check for an Upload failed banner before installing.
- Signing out by the routes other than Settings (suspended, delete account, and so on) still has no
  warning (no board for one). The post is now hidden from other members and deleted only when it is
  replaced. SPEC.md Section 19 says unposted recordings are deleted on sign-out "after a warning".
  That holds only for Settings. **Spec/board mismatch to flag.**

### 17.2 Foreground uploads (`46cce26`)

- `putRecording` passes `sessionType: 'foreground'` to expo-file-system 57.0.7's
  `createUploadTask`. The native side (`NetworkTaskSessionManager`) then uses a
  `URLSessionConfiguration.default` session in the app's process instead of the
  `.background(withIdentifier:)` one with `sessionSendsLaunchEvents`. `UIBackgroundModes` is empty,
  so iOS suspends the app a few seconds after it leaves the screen. The transfer then stalls and
  fails, or dies with the app. Android is unchanged (in-process OkHttp; the option is ignored).
- **The setting alone does not prevent a second transfer.** Two paths were still open:
  1. *Bytes delivered, answer lost* (suspended or closed at the end). Retry PUT the file again.
  2. *Closed while processing.* On launch a `processing` post went back through `run`, which
     always PUT again. If the URL was over 55 minutes old, it minted a new one and re-sent, and
     `retry_response_upload` then had the first asset deleted. This bug predates `fee64ec`.
- **`planResend`** (`app/src/video/uploadRun.ts`) runs before any PUT:
  - `processing` (the PUT answered 2xx): only wait for processing.
  - First send (`attempts === 0`): send, no question asked.
  - Otherwise ask `mux-upload-status` (existing function), then:

    | Answer | Action |
    |---|---|
    | live | wait |
    | removed or deleted | fail (`response_removed`, `response_deleted`), send nothing |
    | asset errored, or upload `timed_out`, `cancelled` or `errored` | one fresh URL (`retry_response_upload`), send |
    | `asset_created` | wait |
    | `waiting` | send to the same URL (or a fresh one if it is past 54 minutes) |
    | 404 (the row has moved to a newer upload: a Retry's answer was lost) | one fresh URL |
    | no answer | Upload failed again, nothing sent blind |

**Tested (Jest, mocks only; 24 new):** a transfer cut part-way, then Retry (same URL, no mint).
Bytes delivered with the answer lost (no resend). Force-quit while uploading, then reopen (Upload
failed, Mux asked before the PUT). Closed while processing and reopened hours later (no PUT, no
mint). An expired URL whose bytes had arrived (no mint, no second asset). Timed out, cancelled or
errored uploads, and an errored asset (exactly one mint, one PUT). A moved upload (404). Removed or
deleted rows. No answer. A video already live. Two concurrent Retries (one transfer). A post that
waited offline. The foreground option and abort signal on the task. Mutation checks: switching the
session back to `background`, dropping the processing rule, never asking Mux, or storing after
sign-out each fail tests.

**Not tested, and still unsafe or unknown:**
- **What Mux and Google Cloud Storage do with a second full PUT to a direct-upload URL** that already
  has some or all of the bytes. The `waiting` case relies on it (Retry after a partial transfer
  sends the whole file again to the same URL). Unverified; ask Mux, or check in a device test.
- **A transfer that ends between Mux's status answer and the PUT.** With the foreground session
  this can only happen within one app process, and one run at a time per member prevents it. A
  background transfer left by the old build (`ede68ed`) at the moment of upgrading is not covered.
- **The exact iOS behaviour on suspension** (fails at once, at resume, or after the 60 s request
  timeout). The tests cover each as "the PUT rejects". Needs the device test.
- **The extra status request.** Retry now needs `mux-upload-status` (and Mux's API) to answer. While
  either is down, Retry of a once-sent post fails instead of sending.
- **A Retry for a deleted row with a moved upload (404)** mints a URL that `retry_response_upload`
  then refuses (`response_not_found`): one unused URL per Retry (retired by stage 2). Rare.
- **A Mux URL expiring mid-transfer:** a Retry starting at minute 53 to 54 has 6 to 7 minutes
  left for the whole file.
- **Sign out anyway, before the abort lands:** it now stops the upload first. If bytes already
  finished, the response still goes live: the row is not abandoned on sign-out (unchanged).

### 17.3 Server-side idempotency for a lost answer (proposal; implemented locally 13 Oct, section 18.2)

**The case.** `post_response`, `post_reply` or `post_draft` commits (claim plus row), and the answer
is lost. The app keeps the URL (section 16), and the next Post sends it again:

| Function | What happens today |
|---|---|
| `post_reply` | `upload_already_used`. The Post after that mints and creates a **second** reply. |
| `post_draft` | Same, but the second draft replaces the first (acceptable). |
| `post_response` | `already_responded`, checked **before** the claim, on every Post. The member **can never respond to that prompt again**: the first row is `processing` with no bytes, invisible, and nothing abandons it (`abandon_response` needs the row id the app never got). |
| `retry_response_upload` | A Retry of it gets `upload_already_used`. The app now recovers via the 404 rule above, at the cost of one more URL. |

**Stable identifier.** A `submissionId` UUID, made once per recording when the take is saved
(`expo-crypto`, already a dependency) and kept on the `Recording`. It therefore survives repeated
Post taps, Retry, app restarts (pending post) and the disclosure sheet. A re-record is a new
recording, so it gets a new submission. Not the upload id: one URL can be offered to two recordings
(17.1, row 1), so replaying by upload id could attach recording 2's bytes to recording 1's caption.
Not the recording id either: it is `Date.now()` plus 6 random characters, not a UUID.

**Migration** (proposed name `20261014000100_post_idempotency.sql`; sketch):

```sql
alter table public.responses add column submission_id uuid;
create unique index responses_author_submission on public.responses (author_id, submission_id)
  where submission_id is not null;

-- post_response, post_reply, post_draft: drop the 4-argument versions, create 5-argument ones
-- with p_submission uuid default null (builds before this one keep working, without replay).
-- Inside each, in this order:
--   1. not_signed_in, then lock the member: perform 1 from public.accounts where id = v_uid
--      for no key update  (same lock as reserve_video_upload; concurrent replays queue).
--   2. profile_required, assert_can_post, disclosure_required (unchanged; a paused member
--      gets no replay either).
--   3. Replay: if p_submission is not null, the member's row with that submission_id:
--        - kind, target (prompt_id / reply_to_id / suggestion_id) or mux_upload_id differ
--          -> raise 'submission_conflict' (a client bug; never answered silently);
--        - status not in (processing, live, draft) -> raise 'submission_closed';
--        - else return what the first call returned, plus {"replayed": true}.
--      This comes before prompt_not_found, already_responded and the claim, so a replay
--      never meets them (and post_draft never replaces its own draft).
--   4. Everything else unchanged; the insert sets submission_id = p_submission.

-- retry_response_upload: if the row already has p_upload_id, return (a lost answer).

-- New: abandon_submission(p_submission uuid): the member's processing row for that submission
-- becomes deleted (mux_forget_video, 'abandoned'); no row or another state: nothing, no error.
-- For Re-record or Discard after a Post whose outcome is unknown, so the prompt is free again.
```

Rollback: restore the 4-argument functions from `20261012000100` and `20261012000200`, drop
`abandon_submission`, the index and the column. `notify pgrst, 'reload schema'` both ways.

**App changes that would follow** (each its own commit, after the migration is approved):
- `Recording.submissionId`, set by the recorder. `createRow` passes `p_submission`.
- Post again after an unknown outcome now just works: the same recording, submission and URL replay
  the row.
- Post Review records an unknown outcome, then calls `abandon_submission` (best effort) on
  Re-record or Discard.
- `submission_conflict` and `submission_closed` become a failed post with the reason.

**Regression tests proposed:**
- *pgTAP* (`0012_post_idempotency.sql`):
  - A replay of each function returns the same id, makes one row and one claim, and changes no
    upload counts.
  - `post_response` replay: no `already_responded`; still answered after the prompt closes;
    refused (`posting_paused`) for a member paused since.
  - `post_draft` replay: does not delete its own draft.
  - `submission_conflict` for a different upload, target or kind.
  - `submission_closed` after `abandon_response`.
  - The same submission id from another member is that member's own, with no lookup across
    accounts.
  - A 4-argument call behaves exactly as today.
  - `retry_response_upload` replay is a no-op; another member's row is still `response_not_found`.
  - `abandon_submission`: frees the prompt; no-op for an unknown submission or a live row; leaves
    other members untouched.
  - Grants on the new and changed functions.
- *Deno integration:*
  - Six simultaneous `post_response` calls with one submission give one row and the same id.
  - A replay racing `abandon_submission`.
  - The end to end path: post, a replay, Mux ready, live.
- *Jest:*
  - A network failure, then Post again: two `create` calls with the same submission and URL, one
    row, one PUT.
  - Re-record after an unknown outcome calls `abandon_submission` once.

Deploy order (each step its own approval): migration and pgTAP locally → hosted migration
(backward compatible) → app build. Optional, not proposed now: a sweep for `processing` rows
whose upload expired without an asset (needs a Mux check first, like C2's worker).

### 17.4 Test C1, revised (proposal; script and local rehearsal 13 Oct, section 18.5; not run on hosted)

C1 needs the hosted evidence of one thing: `mux-create-upload` retires the oldest unclaimed URL when
a member holds 3. That is `begin_upload_cancellation`, Mux `GET`, `PUT /cancel`,
`finish_upload_cancellation`, then the fourth URL. With `fee64ec`, reopening Post Review reuses the
held URL, so the app can no longer reach it that way.

**Method: call the function directly as T1, not through the app.**
- A script, `scripts/c1-retire.mjs` (to be written after approval), takes T1's session (as in CP0)
  and calls `POST /functions/v1/mux-create-upload` four times, about 20 s apart. It never PUTs to a
  URL, so Mux creates no asset. It records the HTTP status and `uploadId` of each call, and
  **discards the URL** (a bearer credential; never logged).
- It refuses any host except the given hosted project ref and localhost.
- It is independent of the installed build (`ede68ed` or the new one): no recording, no Review
  screen, no device.

**Preconditions (read-only):**
- T1 holds no slot (no unclaimed unexpired URL, no reservation, nothing `cancelling`).
- T1 has minted at most 6 in the last hour and at most 26 in 24 hours.
- Shortcut Beta asset count recorded.
- V's response and ledger hashes recorded.
- `mux-create-upload` version and the worker switch (off) unchanged.

**Expected:**
- Calls 1 to 3: 200, U1 to U3 `active`.
- Call 4: 200 with U4, and in the ledger: U1 `cancelled` with `cancelled_at`; U2 to U4 `active`.
- Mux `GET`s: U1 `cancelled` with no `asset_id`; U2 to U4 `waiting`.
- Asset count unchanged; V untouched (hashes).
- Mux operations that change something: 4 upload creates and 1 cancel. No asset.

**Stop:** any non-200, any URL other than U1 cancelled, an asset, or any other ledger change.

**Afterwards:** U2 to U4 time out at Mux after an hour with no asset. Their ledger rows stop holding
slots then. Nothing to clean up. They use 4 of T1's 10 an hour.

**Rehearsal first, locally:** the same script against the local stack with
`supabase functions serve` and a fake Mux (`MUX_API_BASE`, as the scheduler test does).
`uploads_integration_test` already covers the logic ("each re-record retires the oldest unused URL
at Mux").

### 17.5 Verification (13 Oct)

| What | Where | Result |
|---|---|---|
| Jest | local | **163/163** (123 at `fee64ec`; 16 new in `b1132af`, 24 in `46cce26`). `b1132af` alone: 139/139. |
| `tsc --noEmit`, `eslint src` | local | clean |
| Deno unit (`mux_test`, `cleanup_unit_test`) | local | 21/21, 11/11 |
| `uploads_integration_test` | local stack `shortcut-s3r`, Mux stubbed | 32/32 |
| `integration_test` | same | 20/20 |
| `cleanup_integration_test` | same | 28/28 |
| pgTAP (`supabase test db`) | same | 11 files, 1089/1089 |

The stack's migrations, tests and functions are identical to this branch (no server change here).

Run on: none of it on a device or simulator. No Mux, no hosted project.

**Environment failures (not caused by this change; no auth or scheduler code touched):**
- `scheduler_integration_test`: not run. It needs a local Edge runtime (`supabase functions serve`)
  and `DB_CONTAINER` and `EDGE_CONTAINER`, and this stack serves no functions.
- `scripts/auth-integration.mjs`: 11 to 12 of 19.
  - The first run used the default `DB_CONTAINER` (`supabase_db_shortcut`, another local stack).
    It only read there; its one update was keyed to a user that exists only on `s3r`, so it
    matched nothing.
  - Neither run delivered email. The local stack's Auth email limit (`email_sent = 2`) was used
    up, and the second run got HTTP 429. Mailpit shows nothing after 11:04 UTC.
  - `auth-signin-method` answers 503 (no Edge runtime), as in section 16.
  - Re-run after the hour with `DB_CONTAINER=supabase_db_shortcut-s3r`.
- Jest's "Cannot log after tests are done" (expo's lazy `fetch` global) also appears at `fee64ec`.

### 17.6 Next approvals needed (in order; each separate)

1. **Review** `b1132af` and `46cce26` (app only), and decide the second-post question (17.1).
2. **Decide 17.3**: approve writing the migration, pgTAP and integration tests locally (no hosted
   change).
3. **Decide 17.4**: approve writing `scripts/c1-retire.mjs` and rehearsing it locally. Running it on
   the hosted project is a later, separate approval (4 upload creates and 1 cancel at Mux, 0
   assets).
4. Then, as in section 16's plan: a founder iPhone build from the reviewed commit and the device
   checks (interruption with Network Link Conditioner, Home screen mid-upload, force-quit and
   reopen, Retry). Each real post mints one URL and makes one asset; check the founder phone for an
   ownerless Upload failed post before installing.

## 18. Upload reliability hardening, completed locally (13 Oct; not deployed)

Asked for by Nemat after section 17.

Approved: local implementation and testing only.
- No push, hosted Supabase change, real Mux call, iPhone build or install, or cleanup switch change.
- Product rule (`docs/DECISIONS.md`, 13 Oct): a second recording never silently replaces one that
  is waiting; the first stays until it posts or is explicitly discarded.

Commits (local, after `47be07e`):

| Commit | What |
|---|---|
| `70f2a3b` | Server: forward migration `20261013000200_post_idempotency.sql`, its rollback file, pgTAP `0012`, `idempotency_integration_test.ts`, `scripts/idempotency-rollback-check.sh` |
| `6506ab4` | App tests: Jest setup resolves expo's lazy `fetch` (random exit 1) |
| `17830b1` | App: submission ids, lost-answer recovery, one waiting recording per member |
| `56dde6f` | Scripts: Test C1 and its local rehearsal |
| this one | Docs |

### 18.1 Review of `b1132af` and `46cce26` (before the new work)

| Check | Verdict |
|---|---|
| **Re-recording never reuses a URL after a transfer started** | **Confirmed.** No byte is sent before the app has the row's id, and the URL leaves the ticket store when the row answers (`consume`), before `run` starts. A URL can therefore never have carried a transfer while still in the store. One weaker spot, fixed in `17830b1`: a URL sent with an unanswered request stayed in the store, and only the server's single claim stopped the next recording using it. It now leaves the store with that post. New test: "re-recording never gets a URL a transfer could have started on, nor one sent with a lost answer". |
| Account switching | **Held, one regression risk fixed.** `b1132af` kept one storage slot. A new member's Post deleted the recording a previous member had left (signed out without Sign out anyway). That conflicts with the 13 Oct rule. Now each member has their own slot (`shortcut.pendingPost.<member>`), and nothing is ever replaced across members. |
| Recording ownership | Held (`ownerId`, now also the storage key). |
| Upload expiration | Held (`mintedAt`). New: on Retry of a post with a submission, an expired URL is sent again *on purpose*. The server returns the row before it looks at the URL; if it then refuses the URL, a fresh one is minted at once. |
| Foreground transfer | Held in code; device behaviour still unverified (17.2). |
| Retry | **Held, one gap fixed.** "Bytes only after the row id is on the phone" was not guaranteed, because storage writes were best effort. The run's writes before sending now must succeed (`savePendingPostOrThrow`). `abandon_submission` relies on this. |

**Other regression risks found:**
- *Jest exited 1 at random* (1 of 3 runs at `46cce26`; every run once more suites existed).
  Jest's teardown loaded expo's lazy `fetch` global and logged after the tests ended. Fixed in
  `6506ab4`; 3 in-band and 3 parallel runs give exit 0.
- *Flow change, for review:* a Post whose answer never arrives used to leave Post Review open
  with no message. It now goes to the existing X-Upload-Failed banner (or A-Offline when offline),
  with the post kept, like a post that got no URL. These are existing states; nothing new is drawn.

### 18.2 Server: idempotent posting (`70f2a3b`)

**`public.post_submissions`** (deny-all RLS): one row per submission id. It records the request as
first made (member, kind, target, upload, trimmed caption, duration) and the row it created. The
id, the upload and the row are each unique.

**`post_response`, `post_reply`, `post_draft`** gain `p_submission uuid default null`; the
four-argument versions are dropped. The order inside each:
1. signed in;
2. the member's own lock (the one `reserve_video_upload` takes);
3. the account checks (profile, suspended, posting paused, deleted, disclosure);
4. the submission;
5. everything as before, with the submission recorded in the same transaction.

How the brief's safeguards are met:

| Safeguard | How |
|---|---|
| One stable UUID per recording, persisted | `Recording.submissionId` (expo-crypto) is stored with the pending post before the request. |
| Unique for the author | The id is unique across all members, which is stronger. |
| A retried request returns what was made | Same id and same request: the first answer, with `replayed: true`. This happens before `already_responded`, `upload_already_used`, `prompt_not_found`, and before a draft would replace itself. |
| Reuse for another recording, prompt, owner or payload refused | Any difference in kind, target, upload, caption or duration, or another member's id, gives `submission_conflict`. It is one answer for all of these, so nothing about other members is revealed. A video abandoned, deleted, removed or replaced gives `submission_closed`. |
| Auth and ownership first | Steps 1 to 3 run before the lookup, and the lookup checks ownership. A paused member gets `posting_paused`, not their row. |
| Old clients during deployment | Four named arguments resolve to the new functions with `p_submission` null: exactly the old behaviour. pgTAP files 0001 to 0011 pass unchanged; the REST test covers it too. A new app on a database without the migration gets PGRST202 (nothing ran) and calls again without the id (`lib/content.ts`). |
| No duplicate upload associations, replies or public posts | The ledger claims an upload once (as before), and `post_submissions` holds one row per upload and per row. A concurrent second attempt waits on the member lock and gets the first row (tested with the first held open). |
| A lost answer recovered after a restart | The post is stored with its URL and submission before the request. Retry sends the same request and gets the row back. Tested in Jest (restart simulated) and on the database. |

**`retry_response_upload`:** the upload already on the row is a no-op (a lost answer).

**`abandon_submission(p_submission)`:** returns `abandoned`, `kept` or `not_found` (also for
another member's id). It retires a row only when all of these hold:
- the row is still `processing`, so not live, a draft, removed or deleted;
- it has no asset (Mux has not reported a video);
- it is still on the upload the submission claimed (no Retry has replaced it; a Retry means the
  app knew the row and may have sent bytes);
- the ledger shows that upload claimed by this row.

Anything else is `kept`, untouched. It does not call Mux and does not change the ledger: the
claimed URL, which only that phone had, times out unused. The app calls it only for a post whose
row id it never received, and it never sends a byte without that id saved (18.1). So a row it
abandons is one nothing was sent to.

**Rollback:** `supabase/rollback/20261013000200_post_idempotency.down.sql` restores the
four-argument functions verbatim and drops the rest. Rows posted while it was on stay as ordinary
rows. New app builds fall back automatically (PGRST202).

### 18.3 App (`17830b1`)

`submitPost` (pure, `uploadRun.ts`), used by the posting provider:
- **`post_pending`:** Post is refused while the member has another recording waiting (uploading,
  processing, offline or Upload failed), and that recording stays as it was. Storage that cannot be
  read is not treated as empty.
- **Stored first:** the post, with its URL and submission, is stored before the row is asked for.
  If that write fails, nothing is sent.
- **No answer:** an Upload failed post (waiting, if offline). The URL goes with it and leaves the
  ticket store.
- **A refusal:** that attempt's record is removed and the refusal thrown, as before.
- **One Post at a time per member** (`createQueue`).

Supporting changes:
- **`ServerError.refused`** tells a server refusal (an error code: it rolled back) from no answer.
- **Retry without a row (`ensureUploadRow`):**
  - with a submission, the URL already sent is sent again, even if old;
  - a URL refused as expired, cancelled or unknown made no row, so a fresh one is used at once;
  - `upload_already_used` for a URL already sent keeps the URL and mints nothing (a server without
    submissions);
  - without a submission (older build), the old rules apply, minus the auto-replacement.
- **Discard and Sign out anyway:** `abandon_submission` for a post that never got an answer;
  `abandon_response`, as before, when the row is known. Sign out anyway now also abandons the
  member's row, as Discard always did. It is best effort: offline, the row stays (invisible).

### 18.4 Waiting recordings: what is built, and the boards still needed

Built (no UI change): a second Post while a recording waits is refused, and the first is kept until
it posts, or until Discard or Sign out anyway removes it.

**Not designed, needed before the beta (no UI was added without a board):**
1. **Discard for a failed upload, with confirmation. Blocking.**
   - X-Upload-Failed has only Retry, and nothing calls `discardFailed`. A post that can never
     succeed stays forever and now blocks every later Post for that member. Examples: the recording
     file is gone (`recording_missing`); the video was removed or deleted on the server
     (`response_removed`, `response_deleted`); `submission_closed`.
   - Today the only way out is Sign out anyway in Settings.
   - Needs a board: a Discard action on X-Upload-Failed and a confirmation (PR-Discard's "Discard
     this recording? It won't be saved anywhere." looks reusable, but that is a design decision).
2. **Post refused because another recording waits.**
   - Post Review stays open with no message (`post_pending` is logged only).
   - Needs a board: what the person is told, and whether they may keep the new take, discard it,
     or go to the waiting one.
   - Optionally block earlier, at Record (R-Record), so nobody records a take they cannot post.
3. **Sign-out warning on the other routes.**
   - LV-SignOut (the warning before Sign out deletes an unposted recording) appears only in
     Settings. LV-Suspended's Sign out, account deletion, and the onboarding sign-outs have none.
   - With per-member storage, the recording now stays on the phone (hidden) after those sign-outs,
     until the member signs back in.
   - SPEC.md Section 19 says unposted recordings are deleted on sign-out "after a warning".
     **Spec/board mismatch to decide:** keep them across these sign-outs, or add the warning (a
     board) and delete.
4. The ownerless post an older build may have stored (the single key `shortcut.pendingPost`) is
   ignored and never deleted. Check the founder iPhone for an Upload failed banner before
   installing a new build.

### 18.5 Test C1 (`56dde6f`; rehearsed locally, not run on hosted)

`scripts/c1-retire.mjs` calls `mux-create-upload` as one member:

| Calls | When | Expected |
|---|---|---|
| 1 to 3 | back to back | 200 each |
| 4 | at once, all three under 15 s old | 429 `upload_limit_active`, no Mux call |
| 5 | once U1 is at least 16 s old (default 20) | 200 with U4; U1 retired |

- It stops at the first different answer.
- It never sends a byte to an upload URL.
- It prints only ids, statuses and timings: no URL, token or key.
- It refuses any host but localhost unless `C1_HOSTED_REF` matches and `C1_APPROVED_BY_NEMAT=yes`.

**Rehearsal** (`scripts/c1-rehearsal.sh`: fake-only Edge runtime, fake Mux on the host), three
provider answers for the oldest URL:

| Mux reports | Result |
|---|---|
| `waiting` | U1 `cancelled` with `cancelled_at`, U2 to U4 `active`; Mux read U1 once, cancelled it once, created 4 uploads, nothing else |
| `timed_out` | U1 freed without a cancel call |
| `asset_created` | nothing cancelled, U1 back to `active`, the script stops with exit 1 |

All three: no asset, no byte to an upload URL, at most 3 unused URLs held, and no secret in the
output. A hosted URL, and a wait under 16 s, are refused before any request.

**Hosted run (needs its own approval; not done):**
- **Before:** read-only checks.
  - T1 holds no slot (no unclaimed unexpired URL, reservation or cancellation).
  - T1 has used at most 6 this hour and 26 in 24 h.
  - Shortcut Beta asset count; V's hashes.
  - `mux-create-upload` version; the clean-up switch off.
- **Run:** with T1's session, `C1_HOSTED_REF=picvoavfxnajfjkqawju C1_APPROVED_BY_NEMAT=yes`.
- **After:** read-only checks.
  - The ledger: U1 `cancelled`, U2 to U4 `active`.
  - Mux `GET`s: U1 `cancelled` with no `asset_id`; U2 to U4 `waiting`.
  - Asset count unchanged; V untouched.
- **Cost at Mux:** 4 upload creates and 1 cancel; 0 assets.

### 18.6 Verification (13 Oct, all local)

Ran on an isolated local stack, `shortcut-idem` (ports 548xx, in the session scratchpad), started
from the 17 earlier migrations with `20261013000200` applied as a forward step. The stacks other
sessions use were not touched.

| What | Result |
|---|---|
| Jest | **192/192**, exit 0 (163 before; 29 new) |
| `tsc --noEmit`, `eslint src` | clean |
| pgTAP (all 12 files) | **1180/1180** (0012: 91) |
| Deno unit (`mux_test`, `cleanup_unit_test`) | 21/21, 11/11 |
| `uploads_integration_test` | 32/32 |
| `integration_test` | 20/20 |
| `cleanup_integration_test` | 28/28 |
| `idempotency_integration_test` | **12/12** (`DB_CONTAINER` set; none ignored) |
| `scripts/idempotency-rollback-check.sh` | passed: down, old shape and 0001-0011 (1089), forward again, all 1180 |
| `scripts/scheduler-integration.sh` (Edge runtime) | **13/13** (not run before) |
| `scripts/auth-integration.mjs` (Edge runtime) | **37/37** |
| `scripts/c1-rehearsal.sh` | all checks pass (3 scenarios and 2 guards) |

**Mutation check:** removing the member lock from `post_response` makes the held-open race test
fail with `upload_already_used`. (Section 17's app mutation checks were not re-run.)

Not run: any device, simulator, hosted or real-Mux step.

**Environment failures, now explained (not regressions):**
- **Auth, 11 to 12 of 19 in section 17.5:** `auth-integration.mjs` takes its API from
  `supabase status` in the *current folder*. Run from the worktree, it used the main `shortcut`
  local stack (port 54321), while Mailpit and `DB_CONTAINER` pointed elsewhere. It created and
  removed its 4 throwaway local accounts there. Run from the stack's own folder with the functions
  served: 37/37.
- **Scheduler:** needs a local Edge runtime; `scripts/scheduler-integration.sh` serves one. 13/13.
- The isolated stack is still running. Stop it with `supabase stop` in its folder.

### 18.7 Remaining risks

- **The Discard board (18.4, item 1) is a beta blocker** under the new rule.
- Unverified (17.2): what Mux and GCS do with a second full PUT to the same URL after a partial
  transfer; iOS suspension timing; Retry depending on `mux-upload-status`.
- **Discard or Sign out anyway while offline:** the row is not abandoned. For a response, its
  prompt stays blocked for that member (`already_responded`) until a server sweep exists. None
  exists; it would need a Mux check first, as C2's worker does.
- **`abandon_submission` leaves the claimed URL valid at Mux until it expires.** Only that phone
  had it, and the app never sends to it. If bytes did arrive (an app fault), the asset is an orphan
  for the daily sweep.
- **The member lock now also covers posting:** a member's posts and mints queue behind one another.
  They are short transactions, but load was not tested.
- **Server answers with no code:** a 5xx from PostgREST after the database committed would be read
  as "no answer". That is safe: Retry replays the submission.
- **Old app builds** (`ede68ed`) get no replay: the lost-answer duplicate (section 16) remains for
  them until the new build is installed.

### 18.8 Deployment sequence (each step its own approval; STOP here)

1. **Review** `70f2a3b`, `6506ab4`, `17830b1` and `56dde6f`.
   - Decide 18.4 items 1 to 3; item 1 at least before beta testers.
   - Decide the flow change in 18.1 (unanswered Post goes to X-Upload-Failed).
2. **Hosted preflight (read-only):**
   - schema fingerprint;
   - `20261013000100` is the last applied migration;
   - `post_response(uuid, text, text, integer)` exists and `post_submissions` does not;
   - functions and secrets unchanged.
3. **Migration:**
   - `supabase db push --linked --dry-run`, expecting exactly `20261013000200_post_idempotency.sql`;
     then `supabase db push --linked --yes`.
   - Backward compatible: the installed `ede68ed` keeps working.
   - No Edge Function, secret or switch changes.
4. **Hosted verification (read-only):**
   - the five-argument signatures, grants and SECURITY DEFINER settings;
   - `post_submissions` RLS on with no policies;
   - the four-argument signatures gone;
   - the PostgREST schema reloaded (the migration sends `notify pgrst`): `GET /rest/v1/` with the
     service key lists `post_response` with `p_submission`.
5. **Founder iPhone build** from the reviewed commit, after step 3. If 18.4 item 1 is not built,
   accept that a permanently failed post can only be cleared by Sign out anyway.
6. **Device checks** (each real post mints one URL and makes one asset):
   - Post while offline, then online;
   - airplane mode during Post, then Retry, after force-quitting in between (the same row
     replayed);
   - a second take while one waits (refused, the first kept);
   - Home screen mid-upload, force-quit and reopen, Retry (section 17).
   - After each, a read-only ledger and `post_submissions` check: one row per recording, one claim
     per upload.
7. **Test C1 on hosted** with T1 (18.5): 4 upload creates and 1 cancel at Mux, 0 assets.
8. **If rollback is needed:** copy the rollback file into a new forward migration and push it.
   New builds fall back on their own.

## 19. Idempotency review blockers resolved locally (14 Oct; not deployed)

Asked for by Nemat after the independent review of section 18. Approved: local corrections to B2,
B3 and I1 to I7, and design proposals.

Not done:
- no hosted Supabase change, real Mux call, device build, push or cleanup activation;
- no UI, and no approved board changed.

The moderation repost loophole (a removed response does not block a new one to the same prompt)
is a separate task and was not touched.

| Commit | What |
|---|---|
| `ddd8e0f` | Server: Mux-checked abandonment (B3), NULL-safe fingerprint (I1), rollback keeps new builds posting (I4) |
| `b7a02ad` | App: Retry and Discard exclusive, server-first discard with reconciliation (B2, I2, I4 to I7) |
| `bc1e765` | Server tests: the idempotency integration test discards through abandon-submission (missed in `ddd8e0f`) |
| this one | Design proposals (`design/proposals/`) and this section |

### 19.1 Changes

- **B3, abandonment only after Mux confirms.**
  - The unreleased `20261013000200` revokes `abandon_submission` from every API role.
  - The new forward migration `20261013000300` drops it and adds `begin_submission_abandon` and
    `finish_submission_abandon` (service role), used by the **`abandon-submission` Edge Function**
    (owner-authenticated, `verify_jwt = false` like the other functions, checking the caller
    itself).
  - Mux's upload decides:
    - **waiting:** cancelled at Mux first, then the row retired once Mux confirms;
    - **timed out, cancelled or errored, no asset:** retired;
    - **asset created, or an asset id:** kept (`at_mux`);
    - **unreadable, unknown, or a cancel refused or unconfirmed:** kept (`unverified`).
  - While Mux is asked, the row is held for 2 minutes with a token: replays and Retries are
    `submission_busy`.
  - The finish re-checks under the row lock (a webhook may have made it live).
  - An id that never made a row gets a tombstone, so a late copy of the request cannot make one.
  - Live, removed and settled rows are never touched; the clean-up worker is not involved.
- **I1:** `IS DISTINCT FROM` for every fingerprint field. The NULL-target bypass is reproduced by
  the new pgTAP tests, which fail with `<>`.
- **I4:** the app's PGRST202 fallback is removed; the submission id is always sent.
  - The `20261013000200` rollback keeps five-argument versions (no default, ignoring the id), so
    builds that send it keep posting after a rollback.
  - Deployment is migration first.
- **B2, the race:**
  - Retry and Discard are mutually exclusive per member (`createExclusive`): Discard stops a
    running upload and waits for it to end.
  - The run shows PR-Posting at once.
  - **The local recording is never deleted first when the outcome is uncertain** (`discardPost`).
    The discard is stored with the post, the server asked, and the file deleted only on
    `abandoned`, or when the server video is settled (live, removed).
- **I7, reconciliation:** an unconfirmed discard stays on the phone in the member's own slot (still
  blocking a new recording), and is asked again at launch and when the connection returns.
  `at_mux`: it carries on as processing and posts. Never deletes a published or processing video.
- **I2:** no row, URL or Mux question for a recording whose file is gone. A row already sent to
  asks Mux only, so a video Mux has is waited on.
- **I5:** after a repeated request whose answer was lost, Mux is asked before anything is sent,
  even with attempts at 0. (Read as: before re-sending bytes for a replayed submission. The replay
  request itself carries no bytes, and the server refuses it during a hold.)
- **I6:** Retry while offline enters the waiting/offline flow (A-Offline).

### 19.2 Design proposals (not approved boards)

- `design/proposals/failed-post-ux.html`: P1 to P9, built from X-Upload-Failed, PR-Discard,
  LV-SignOut and PR-Posting, with new copy highlighted.
- `design/proposals/FAILED-POST-UX.md`: states, copy (existing or new), behaviour, five decisions,
  and the proposed **SPEC.md §19 revision** (Discard; one waiting recording at a time; discard on
  the same terms on every sign-out route; an unconfirmed discard stays hidden until the next
  sign-in).

### 19.3 Verification (14 Oct, isolated local stack `shortcut-idem`; nothing on a device, simulator, hosted project or real Mux)

| What | Result |
|---|---|
| Jest | **229/229**, exit 0 (37 new) |
| `tsc --noEmit`, `eslint src` | clean |
| pgTAP, 13 files | **1219/1219** (0012: 77, 0013: 53) |
| Deno unit (`mux_test`, `cleanup_unit_test`) | 21/21, 11/11 |
| `uploads_integration_test` | 32/32 |
| `integration_test` | 20/20 |
| `cleanup_integration_test` | 28/28 |
| `idempotency_integration_test` | 12/12 (none ignored) |
| `abandon_integration_test` | **12/12** |
| `scripts/idempotency-rollback-check.sh` | passed: both rollbacks, the old suite (1089), a new and an old build posting after the rollback, both migrations again, all 1219 |
| `scripts/scheduler-integration.sh` | 13/13 |
| `scripts/auth-integration.mjs` (run from the stack's folder, functions served) | 37/37 |
| `scripts/c1-rehearsal.sh` | passed |

**Race, replay, offline, switching and failure tests:**
- Discard during Retry: no byte is sent after the discard is asked. Mutation: without the stop,
  the test fails.
- A replay during the Mux check is `submission_busy`.
- Two discards at once: one Mux cancel.
- A lost answer, then a restart, then the replay.
- Offline discard: kept and asked again.
- Account switching: per-member slots, and the parent signal aborting the upload.
- Mux unreadable, unknown, or refusing the cancel: kept.
- A webhook making the video live mid-check: kept.

**Environment:** Docker Desktop was not running after the restart; it was started locally. Every
earlier environment failure is resolved: auth needs running from the stack's folder, the scheduler
needs its script's Edge runtime.

### 19.4 Outstanding

- **Not built, needs board approval:** Discard (P1 to P4), the explanations (P5 to P8) and the
  sign-out warnings (P9). Until then, Discard is reachable only through Sign out anyway, and a post
  that can never succeed blocks the member's next recording. **Blocker for beta testers.**
- **An unconfirmed discard keeps blocking new recordings** until the server confirms. A long Mux
  outage holds the member that long (decision 3 in the proposal).
- **A recording without a submission id** (no shipped build made one) is never deleted
  automatically.
- **Not tested as wiring:** the provider (`posting.tsx`), because no React Native testing library
  is a dependency. Its parts are tested pure.
- **Unverified against real Mux:** cancelling a waiting upload that has partial bytes, and how soon
  `asset_created` shows after the last byte.
- **A function stopping mid-check** holds the row for up to 2 minutes (replays `submission_busy`
  meanwhile).
- **Sign out anyway with an unconfirmable discard** keeps the recording on the phone, hidden. The
  current LV-SignOut copy says it is deleted; this needs the SPEC.md §19 revision.
- **Hosted function deployment** is new: `abandon-submission` uses the existing Mux secrets and
  can cancel an upload at Mux (only one Mux reports still waiting, only for its owner).

### 19.5 Proposed rollout (each step its own approval; STOP here)

1. **Review** `ddd8e0f`, `b7a02ad` and `bc1e765`, and the proposals: decisions 1 to 5 and the
   SPEC.md §19 revision.
2. **Hosted preflight (read-only):**
   - schema fingerprint;
   - `20261013000100` last applied;
   - no `post_submissions`;
   - functions and secrets unchanged.
3. **Migrations:** `supabase db push --linked --dry-run`, expecting exactly `20261013000200` and
   `20261013000300`, then the push.
   - The installed `ede68ed` keeps posting (four named arguments resolve to the new functions).
   - Old clients' calls may fail for the moment the DDL runs.
4. **Deploy `abandon-submission`** (no other function changes).
5. **Read-only checks:**
   - signatures, grants and RLS;
   - `abandon_submission` absent;
   - PostgREST reloaded;
   - the function answers 401 without a session.
6. **Build the approved boards** (P1 to P9 as decided), with tests.
7. **Founder iPhone build** after steps 3 to 6. This build needs the migration, since posts fail
   visibly without it.
8. **Device checks:**
   - lost answer, restart, then Retry;
   - Discard while uploading, online and offline;
   - a second take while one waits;
   - a sign-out on each route.
   - After each: read-only ledger and submission checks.
9. **Test C1 on hosted** (separate approval).
10. **Rollback, if needed:** the `20261013000300` rollback, then the `20261013000200` rollback, as
    forward migrations. The app keeps posting through the five-argument versions;
    `abandon-submission` without its functions answers "kept, unverified" and deletes nothing.

## 20. C1 to C3 fixed, failed-post boards revised, SPEC.md §19 revised (14 Oct; local, not deployed)

Asked for by Nemat after the final review (section 19's review). Approved:
- local client corrections, with regression tests;
- design-board proposals;
- SPEC.md edits.

Not done:
- no UI built, and no approved board changed;
- no push, deployment, device build, hosted or account change, real Mux call, or cleanup-switch
  change.

| Commit | What |
|---|---|
| `654c03c` | App: C1 to C3 (code) |
| `f1dd2c6` | Design: boards P1 to P9 revised, SPEC.md §19, DECISIONS.md |
| this one | This section |

### 20.1 Code (`654c03c`)

The per-member posting logic moved into `app/src/video/memberPosting.ts` (pure, effects injected).
`posting.tsx` holds one per signed-in member and stops it when the account changes.

- **C1, Post/Discard race:** Discard stops a Post in flight, waits on the member's posting queue
  for it to settle, then stops and waits for any upload.
  - The Post's request is aborted (`postRpc` takes a signal), and a late answer or refusal writes
    nothing.
  - A Post completing late cannot bring a discarded recording back, or leave a pending post with
    no file.
  - Retry stays exclusive with Discard.
- **C2, sign-out:** Sign out anyway never throws, so a storage error cannot stop the sign-out.
  - An unresolved recording stays in its own account's slot and is asked about at that account's
    next sign-in; another account never reads it.
  - Offline: `supabase-js` 2.117.2 removes the local session even when the server cannot be
    reached, so signing out completes on the phone. The server session stays valid until it
    expires (unchanged behaviour).
- **C3, reconciliation:** an unconfirmed discard is asked again:
  - at launch, on returning to the foreground (AppState) and when the connection returns;
  - by timer at 30 s, 2 min and 10 min, then on those events only;
  - never sooner than 125 s after a "busy" answer (the server's 2-minute hold), and events at most
    every 15 s;
  - one request at a time (a second call joins it);
  - everything stops when the account changes.

### 20.2 Mux's documented cancellation guarantee (docs read 14 Oct; no Mux call made)

- **Cancel a direct upload**
  ([API reference](https://www.mux.com/docs/api-reference/video/direct-uploads/cancel-direct-upload)):
  - It marks the upload cancelled.
  - It succeeds only while the upload is still `waiting`.
  - "If a pending upload finishes after this request, no asset will be created."
- **Create a direct upload**
  ([API reference](https://www.mux.com/docs/api-reference/video/direct-uploads/create-direct-upload)):
  `timeout` is how long the signed URL is valid (default 3600 s). An upload with no successful
  transfer before then is marked `timed_out`.

What this means for abandon-submission:
- **A confirmed cancel leaves no asset, even if the last bytes land afterwards.** This closes the
  race raised in section 19's review: retiring the row after a confirmed cancel cannot strand a
  video.
- A cancel Mux refuses means the upload was no longer waiting; the function already keeps that.
- `timed_out` means no successful transfer, so no asset.
- **Not covered by the documentation:**
  - `errored`, which the function treats like `timed_out` when no asset id is present;
  - the exact error a cancel returns when the upload is not waiting.

  Treating `errored` as unverified would be the stricter choice. That is a server change for a later
  approval.

### 20.3 Design (`f1dd2c6`)

- **Boards:** `design/proposals/failed-post-ux.html` (rendered for final visual review) and
  `FAILED-POST-UX.md`: P1 to P9, plus P1-R and P8-R for video replies, applying the five decisions.
- **Drafted wording**, marked orange and dashed (not supplied; confirm or replace):
  - P4: "It will be deleted from this phone. If it already reached Shortcut, it may finish
    processing."
  - P6: "It may finish processing. If it appears on your profile, you can delete it there."
  - P9: "Signing out discards it from this phone. If it already reached Shortcut, it may finish
    processing."
- **SPEC.md §19** is revised to match, with the drafted strings marked (draft).
  - The SPEC.md header notes the online master spec (a Claude Doc) does not have this change yet.
  - A re-export from the master would drop it until the master is updated.

### 20.4 Verification (14 Oct, isolated local stack; nothing on a device, simulator, hosted project or real Mux)

| What | Result |
|---|---|
| Jest | **246/246**, exit 0 (17 new: memberPosting) |
| `tsc --noEmit`, `eslint src` | clean |
| pgTAP, 13 files | 1219/1219 |
| Deno unit (`mux_test`, `cleanup_unit_test`) | 21/21, 11/11 |
| `uploads_integration_test` | 32/32 |
| `integration_test` | 20/20 |
| `cleanup_integration_test` | 28/28 |
| `idempotency_integration_test` | 12/12 (none ignored) |
| `abandon_integration_test` | 12/12 |
| `scripts/idempotency-rollback-check.sh` | passed (both rollbacks, old suite 1089, then all 1219) |
| `scripts/scheduler-integration.sh` | 13/13 |
| `scripts/auth-integration.mjs` | 37/37 |
| `scripts/c1-rehearsal.sh` | passed (29 checks) |

**Mutation checks:** each of these fails a test:
- Discard not waiting on the Post queue;
- the server hold ignored;
- the sign-out cleanup throwing.

### 20.5 Differences between the revised designs and the app

None of P1 to P9 is built:
- Discard has no button.
- P2's and P3's lines are not mapped.
- Video replies still say "response".
- The camera is not blocked at entry (Post refuses with no message).
- LV-SignOut shows only in Settings, with the old body.

The behaviour these boards describe is built and tested.

### 20.6 Remaining risks

- **Beta blocker:** until P1 to P9 are approved and built, Discard is reachable only through Sign
  out anyway, and a post that can never succeed blocks the member's next recording.
- **An unconfirmed discard keeps blocking new recordings** until the server confirms. Bounded
  retries and the foreground and connection events limit this, but a long Mux outage still holds
  the member.
- **`errored` with no asset id is retired:** not documented by Mux (20.2).
- **The online master spec lacks the §19 revision** (20.3).
- **The provider wiring** (`posting.tsx`) is thin but not unit-tested. AppState and connectivity
  subscriptions are exercised only through `memberPosting`.
- **Unverified on a device or against real Mux:** foreground suspension timing, a second full PUT
  to the same URL, and the abandon path end to end.

### 20.7 Next

1. Final visual approval of P1 to P9, including the three drafted strings.
2. Update the online master spec with §19.
3. Then, each separately: build the boards; the rollout in section 19.5 (migrations, the
   abandon-submission function, the founder build, device checks, C1 on hosted).

## 21. H1 read-only hosted preflight passed (16 Oct 11:44 UTC; nothing deployed)

The 16 Oct multi-agent integration (`docs/release/FINAL-REPORT.md`) ends in one ordered hosted
sequence, H0 to H13 (`docs/release/RELEASE-CHECKLIST.md` Part 1B). H1, the read-only preflight,
was run by the lead with `scripts/h1-preflight.sh` under a permission rule Nemat added for the
read-only CLI commands (`supabase db query --linked`, `functions list`, `secrets list`,
`migration list`); the package had been reviewed independently the same day. Result:
`docs/release/H1-REPORT.md`; evidence `docs/release/h1-results-20261016T114442Z.txt`.

- 17 migrations, latest `20261013000100`; fingerprint 759 objects with the same listing md5 as a
  local stack built from the same 17 migrations (equal hashes, so equal listings; the 13 Oct
  `10acc19f…` is the same listing hashed with a trailing newline).
- `postgres` can SELECT and DELETE `auth.sessions` (needed by `20261016000202`); no `pg_graphql`;
  the 4 avatar policies.
- No member with two primary responses on one prompt (needed by `20261016000300`).
- Clean-up `off`, health `ok`, no open job, 0 purge failures, the 8 cron jobs; finished jobs
  `done=3`, `skipped=1` as Tests 4B, A1 and B1 left them.
- Founder response and ledger hashes unchanged since stage 2; V `live` on P2 with asset a, author
  T1; T1 active; 0 deleted accounts; 1 deleted video, the 12 Oct canary video reply.
- Functions: the same five at the versions recorded after Test B2 (`auth-signin-method` v10,
  `mux-cleanup` v8, `mux-create-upload` v10, `mux-upload-status` v11, `mux-webhook` v12), all
  `ACTIVE`, none of the new ones; 11 secrets by name, no
  `MUX_CLEANUP_MODE`, `PUSH_SENDER_KEY` or `AVATAR_CLEANUP_KEY`; 9 migrations local-only.
- One package expectation was wrong on the first run (it expected 0 deleted videos, from the 12 Oct
  preflight taken before the canary); corrected, re-run, all PASS. The first run's file was not
  kept (its failing line read `0|1`); the hosted project was not changed between the runs.

*Next:* H2 (batch A: `20261013000200`, `20261013000300`, then `abandon-submission`), each step on
Nemat's go-ahead; package `docs/release/H2-DEPLOY.md`.

## 22. H2 deployed: batch A, posting idempotency and safe abandonment (16 Oct 11:59 UTC; Nemat approved; function not yet deployed)

Approved by Nemat on 16 Oct ("run H2 step 1 (dry run), and if it lists exactly the two batch A
migrations, step 2 (push), then the read-only verification; stop before H3"). Run by the lead from
a `git archive` of `b79dd77` (config.toml, migrations, templates) with the seven `20261016…` files
removed, linked to `picvoavfxnajfjkqawju`. Package: `docs/release/H2-DEPLOY.md`.

- **Files:** `20261013000200_post_idempotency.sql` md5 `331fdb6da1bd5b0d49f660cc6b42200b`,
  `20261013000300_safe_submission_abandon.sql` md5 `bb4bf0284c7a7d79ea06a64abead89a3` (unchanged
  since `ddd8e0f`).
- **Dry run (11:59:45 UTC):** "Would push these migrations: 20261013000200_post_idempotency.sql,
  20261013000300_safe_submission_abandon.sql"; seeds `[]`, roles `[]`.
- **Push (11:59:54 to 11:59:56 UTC):** `supabase db push --linked --yes`: "Applying migration
  20261013000200…", "Applying migration 20261013000300…", "Finished supabase db push", exit 0.
- **Verification (12:00:43 UTC, read-only; evidence `docs/release/h2-results-20261016T120044Z.txt`):**
  19 migrations, latest `20261013000300`; the four-argument `post_response` gone; five-argument
  `post_response`, `post_reply`, `post_draft` and `retry_response_upload` present, `SECURITY
  DEFINER`, `search_path` pinned, executable by `authenticated` and `service_role`, not `anon`;
  `begin_submission_abandon` and `finish_submission_abandon` by `service_role` only; the
  `abandon_submission` SQL function absent; `post_submissions` RLS on, no policy, no API read, 0
  rows; **schema fingerprint 788 objects, listing md5 `13d25b7796fee9876ce41826f5decce5`, equal to a
  local stack built from the same 19 migrations** (`docs/release/h2-expected-19-migrations.fp`);
  founder response and ledger hashes unchanged, V `live` on P2, responses `deleted=1`, `live=2`;
  clean-up `off`, health `ok`, 0 open jobs, 8 cron jobs; 7 migrations local-only (batches B and C).
- **Not done:** H3 (`abandon-submission` deployment) waits for its own go-ahead; until it is
  deployed, a member's Discard gets no server answer and the recording stays on the phone (the
  behaviour before this batch). No function, secret, Vault entry or switch changed. The PostgREST
  schema listing was not fetched (the founder build exercises it at H12).
- **Compatibility:** the installed founder build (`ede68ed`, four-argument calls) keeps posting
  through the defaults; builds since `b7a02ad` now post idempotently.

*Next:* H3 on Nemat's go-ahead (`docs/release/H2-DEPLOY.md` step 4), then H4.

## 23. H3 deployed: `abandon-submission` (16 Oct 12:04 UTC; Nemat approved)

Approved by Nemat on 16 Oct ("run H3 … deploy abandon-submission --no-verify-jwt from the
integration tip, verify the function list and the 401 on an unauthenticated POST, record it, and
stop before H4"). Deployed by the lead from the integration worktree at `f95eb24` (function tree
`2110c453…`, `_shared` tree `c8c36b3a…`; the handler is Agent A's `be99363` with the conservative
`errored` rule, `docs/release/VIDEO-RELIABILITY.md` section 2).

- **Deploy (12:04:00 to 12:04:07 UTC):** `supabase functions deploy abandon-submission
  --project-ref picvoavfxnajfjkqawju --no-verify-jwt`: "Bundling Function", "Deploying Function
  (script size: 715 kB)", "Deployed Functions", exit 0.
- **Verification (12:04:19 UTC):** `functions list`: `abandon-submission` v1 `ACTIVE`,
  `verify_jwt` false; `auth-signin-method` v10, `mux-cleanup` v8, `mux-create-upload` v10,
  `mux-upload-status` v11, `mux-webhook` v12 unchanged, with their earlier update times. A `POST`
  with no session answers **401**; a `GET` answers 405. No secret, Vault entry, switch or other
  function changed; the function needs only the existing `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET`
  and makes Mux `GET`s and, for a `waiting` upload the member discards, one documented cancel.
- **Effect:** builds since `b7a02ad` can now discard: the server asks Mux before anything is
  retired; a confirmed cancel or a documented terminal state retires the row and the phone
  deletes the recording; `errored` or undocumented states are kept unverified until 10 minutes
  after the URL expiry. The installed founder build (`ede68ed`) has no Discard and is unaffected.
- **Not done:** H4 onwards. The abandon path has not been exercised against real Mux (that is
  provider test C2a, `docs/release/PROVIDER-TESTS.md`, its own approval).

*Next:* H4 (batch B, migrations `20261016000200` to `204`) on Nemat's go-ahead; its preflight
(`auth.sessions` privileges) passed in H1.

## 24. H4 deployed: batch B, privacy, sessions, avatars and rate limits (16 Oct 12:07 UTC; Nemat approved; functions not yet redeployed)

Approved by Nemat on 16 Oct ("run H4 … dry run, and if it lists exactly the five batch B
migrations, push, then the read-only verification against the 24-migration fingerprint; record it
and stop before H5"). Run by the lead from a `git archive` of `3622288` with the two batch C files
removed, linked to `picvoavfxnajfjkqawju`. Package: `docs/release/H4-DEPLOY.md`; what the
migrations do: `docs/release/SECURITY.md`.

- **Files:** `20261016000200_direct_read_privacy.sql` `7feca30c…`, `…201_viewer_visibility.sql`
  `559d06cf…`, `…202_session_lifecycle.sql` `4818681b…`, `…203_avatar_cleanup.sql` `facb8467…`,
  `…204_rate_limits.sql` `e4c3e7bb…` (full md5s in the package).
- **Dry run (12:07:10 UTC):** exactly the five files, in order; seeds `[]`, roles `[]`.
- **Push (12:07:21 to 12:07:24 UTC):** five "Applying migration …" lines, "Finished supabase db
  push", exit 0.
- **Verification (12:09:19 UTC, read-only; evidence `docs/release/h4-results-20261016T120919Z.txt`):**
  24 migrations, latest `20261016000204`; `session_is_current`, `session_started_at`,
  `invite_lookup_unlimited`, `signin_providers_limited(p_email, p_client)`, `web_event_allowed`,
  `request_client_ip`, the tables `avatar_removals`, `rate_limit_rules` and `rate_limit_counters`
  present; the broad read policies on `profiles`, `follows` and `comments` replaced by own-row
  policies; `prompts.suggested_by` and the moderator and note columns hidden from `authenticated`,
  prompt text still readable; TRUNCATE and TRIGGER revoked from the API roles; the 4 avatar
  policies (two recreated); 10 cron jobs (`avatar-cleanup` every 10 min, inert until its Vault
  secrets exist, and `prune-rate-limit-counters` daily, added); the 5 rate-limit rules at the
  documented defaults (invite client 10/15 min, invite stem 100/h, sign-in address 5/15 min,
  sign-in client 30/15 min, web event 60/h); counters and removals empty;
  `session_is_current()` true for the service connection; **schema fingerprint 847 objects,
  listing md5 `8bddf2614e7c2d55acfcd10d951dddc5`, equal to a local stack built from the same 24
  migrations** (`docs/release/h4-expected-24-migrations.fp`); founder response and ledger hashes
  unchanged, V `live` on P2, responses `deleted=1`, `live=2`, 2 accounts, 0 deleted; clean-up
  `off`, health `ok`, 0 open jobs; 2 migrations local-only (batch C). One `auth.sessions` row
  exists (count only), so the session gate now applies to that phone's token.
- **First verification run** (12:08 UTC) showed three FAIL lines that were the script's own
  expectations (a pattern that matched the new policy names, a cron count that forgot 203's job,
  guessed column names); each was checked against the migration text and the hosted rows, the
  expectations corrected, and the run repeated. The hosted project was not changed between the
  runs; the fingerprint matched on both.
- **Not done:** H5 (`web` first deployment, `auth-signin-method` redeploy with the limited
  lookup, `send-push`), H5b, H6 (`avatar-cleanup` function and secrets), the hosted auth smoke
  (`SESSION_GATE=1 node scripts/hosted-auth-smoke.mjs`, Nemat's own address), the client-address
  header check. The deployed `auth-signin-method` v10 keeps working (it calls
  `signin_providers_for_email`, which 204 keeps), without the new limit until H5.

*Next:* H5 on Nemat's go-ahead.

## 25. H5 deployed: `web`, `auth-signin-method`, `send-push` (16 Oct 12:18 UTC; Nemat approved). H5b: the default domain serves HTML as text/plain

Approved by Nemat on 16 Oct ("deploy web --no-verify-jwt (leave STORE_URL and WAITLIST_URL unset
for now), redeploy auth-signin-method, deploy send-push --no-verify-jwt; verify the function list,
the 401/405 answers and the H5b content-type check; record it and stop before H6"). Deployed by
the lead from the integration worktree at `18c1b20` (trees `web` `8b7ffed0…`,
`auth-signin-method` `bbf282c4…`, `send-push` `39822830…`, `_shared` `c8c36b3a…`), 12:18:05 to
12:18:23 UTC, each by name, exit 0.

- **Function list (12:18:47 UTC):** `web` v1, `send-push` v1 (new), `auth-signin-method` v11
  (was v10), all `ACTIVE`, `verify_jwt` false; `abandon-submission` v1, `mux-cleanup` v8,
  `mux-create-upload` v10, `mux-upload-status` v11, `mux-webhook` v12 unchanged. No secret, Vault
  entry or switch changed; `STORE_URL` and `WAITLIST_URL` unset (the function falls back to its
  built-in placeholders).
- **Answers:** `auth-signin-method` POST with an empty body 401, GET 405; `send-push` POST without
  the sender key 401, GET 405 (the key is not set, so the push sender does nothing; outbox rows
  wait, as before). `web`: `/r/<unknown id>` 404; `/r/<V>` 200 with the full page: the pinned
  `hls.js@1.7.3` tag with its integrity hash and `href="shortcut://r/<V>"` as the app link;
  `x-robots-tag: noindex`.
- **H5b, failed as feared:** on `picvoavfxnajfjkqawju.supabase.co` the function's HTML is served
  with `content-type: text/plain` and `content-security-policy: default-src 'none'; sandbox`,
  for `/i/CHECK` and for `/r/<V>` alike. The platform rewrites HTML responses on the default
  functions domain (Agent D's open question in `MODERATION.md` section 6, now confirmed). So a
  browser shows the page source, not the page; link previews cannot read the Open Graph tags
  either. **Consequence:** shared-link pages (B-3) and the moderation admin (H7) need a custom
  domain in front of the functions (the Supabase custom-domain add-on, or the product domain with
  a proxy) before either is usable; the app's links keep pointing at the function URL until
  `EXPO_PUBLIC_WEB_BASE_URL` names the domain. The deployment itself is correct and stays: the
  function is reachable, read-only and `noindex`; nothing links to it from outside yet.
- **Not done:** H6 (`avatar-cleanup` function and its secrets: names are queueing in
  `avatar_removals` since H4 but nothing deletes them yet), H7 (admin, which also needs the custom
  domain), H8 (push sender secrets), the hosted auth smoke with `SESSION_GATE=1`, the
  client-address header check for the rate limits (`SECURITY.md` section 6 step 7).

*Next:* H6 on Nemat's go-ahead; a decision on the custom domain (H5b) before H7 and B-3.

## 26. H6 deployed: `avatar-cleanup`, its secret and Vault entries (16 Oct 12:20 UTC; Nemat approved)

Approved by Nemat on 16 Oct ("deploy avatar-cleanup --no-verify-jwt, generate a random
AVATAR_CLEANUP_KEY and set it with supabase secrets set, create the two Vault secrets
(avatar_cleanup_url, avatar_cleanup_key) with db query, verify the function answers 401 without the
key and that the cron job can reach it", then record and stop before H7). Done by the lead from
the integration worktree at `4602169`, 12:20:41 to 12:20:53 UTC. The key is 64 hex characters from
`openssl rand`, written to a temporary file with mode 600, passed to `supabase secrets set
--env-file` and to `vault.create_secret` through a SQL file, and never printed; the temporary files
were removed. It exists only in the function's secrets and in Vault.

- **Function:** `avatar-cleanup` deployed (`verify_jwt` false, per `config.toml`). The
  `secrets set` that followed moved every function up one version (as on 13 Oct): now
  `abandon-submission` v2, `auth-signin-method` v12, `avatar-cleanup` v2, `mux-cleanup` v9,
  `mux-create-upload` v11, `mux-upload-status` v12, `mux-webhook` v13, `send-push` v2, `web` v2,
  all `ACTIVE`; bundles unchanged by a secret change.
- **Secrets:** 12 names, `AVATAR_CLEANUP_KEY` added; still no `MUX_CLEANUP_MODE` or
  `PUSH_SENDER_KEY`. **Vault:** `avatar_cleanup_url` (12:20:51 UTC) =
  `https://picvoavfxnajfjkqawju.supabase.co/functions/v1/avatar-cleanup`, `avatar_cleanup_key`
  (12:20:53 UTC). Vault was empty before; these are its first two entries.
- **Verification (12:21:16 UTC):** POST without a key 401, POST with a wrong key 401, GET 405.
  The `avatar-cleanup` cron job (`*/10 * * * *`, `select public.run_avatar_cleanup()`) ran at
  12:10 and 12:20 UTC, both `succeeded`; `avatar_removals` has 0 rows; pg_net has 0 queued
  requests and no response from this function.
- **What "the cron job can reach it" means today:** `run_avatar_cleanup()` reads both Vault
  entries and posts only when `avatar_cleanup_due(1)` is non-empty. The queue is empty (no photo
  has been replaced and no account deleted since H4), so the job returns before any HTTP call.
  The pieces are in place and each was checked (URL, key names, function authorisation, cron
  success); the first end-to-end call happens at the first photo replacement or account deletion
  and shows up as a 2xx row in `net._http_response` and a drained `avatar_removals` row. Not
  exercised yet.
- **Not done:** H7 (admin; blocked by H5b, the custom domain), H8 (push sender secrets; useless
  without the EAS project and APNs/FCM credentials, B-2), H9 (hosted auth smoke with
  `SESSION_GATE=1`, Nemat's own address; the client-address header check), H10 (provider tests
  C1, C2w, C2a, E1 to E3, each its own approval), H12 (founder build and device checks).

*Next:* Nemat's decisions on the custom domain (H5b) and on H9 and H10.

## 27. Provider test C1 passed on the hosted project and real Mux (16 Oct 12:43 UTC; Nemat approved)

Approved by Nemat on 16 Oct ("run provider test C1 … against hosted and real Mux with account T1,
exactly as written, read-only at Mux except the documented cancel"). Procedure:
`docs/release/PROVIDER-TESTS.md` section 4 (unchanged from section 18.5). Evidence:
`docs/release/c1-results-20261016.md`.

- **T1's session:** T1's address was read from `auth.users` (read-only, kept in a mode-600 file,
  never printed; the records do not store it); one sign-in code was sent at 12:34:22 UTC with
  `scripts/provider-member.mjs otp`; Nemat typed the code into a private terminal prompt
  (`scripts/provider-t1-verify.sh`, no echo), which saved the token to a mode-600 file. No token,
  code or address appears in any log or commit.
- **Before (S1 12:25:57, S3 12:26:00 UTC):** T1 held no slot (its one unclaimed URL from 13 Oct
  expired that day), 0 minted in 24 h, switch `off`, health `ok`, no open job; Mux: 2 assets,
  inventory `ccb8b093…`.
- **Run (12:43:44 to 12:44:06 UTC, `scripts/c1-retire.mjs`, hosted guard flags set):** calls 1 to
  3 `200` (U1 `OK6YRmec…`, U2 `3eRAk2ZJ…`, U3 `B02LbkiY…`); call 4 at once `429 upload_limit_active`,
  `Retry-After` 3595 (all three under 15 s old, so nothing retired and Mux not asked); after 20 s,
  call 5 `200` with U4 `r01Ax4Te…`. `ok: true`.
- **After (S1 12:44:40, S3 12:44:43 UTC):** ledger U1 `cancelled`, `cancelled_at` 12:44:06.16
  (the retiring call), U2 to U4 `active`; `t1_minted_1h` 4, `t1_minted_24h` 4 (within 10 and 30);
  Mux: U1 `cancelled`, U2 to U4 `waiting`, each with passthrough T1 and **no `asset_id`**; assets
  still **2**, inventory `ccb8b093…` unchanged, so **no asset was created**. Founder response
  `c9918f82…` `live` with its asset and playback id unchanged; V `live` on P2; responses
  `deleted=1`, `live=2`, no new T1 row; no submission; clean-up `off`, health `ok`, no open job;
  functions (9) and secret names (12, no `MUX_CLEANUP_MODE`) unchanged.
- **What this proves on the real provider:** the stage 2 retirement works end to end: at the
  3-URL cap the server asks Mux for the oldest unclaimed URL's status, cancels it only because Mux
  reported it `waiting`, frees the slot only after Mux confirmed, and mints the next URL. Mux's
  documented cancel guarantee held: a cancelled upload has no asset.
- **Rollback:** nothing to undo. U2 to U4 time out at Mux at about 13:44 UTC and their slots free
  themselves; they count towards T1's hour and day until then.

*Next:* C2w and C2a (`PROVIDER-TESTS.md` section 5), E1 to E3 (section 6), each its own approval.

## 28. Provider test C2w: C2w-a and C2w-b passed; C2w-c not run, U5 timed out at Mux first (16 Oct; Nemat approved C2w)

Approved by Nemat on 16 Oct ("continue with C2w, followed by C2a"), after a read-only preflight
(the purpose and Mux operations of both halves, 2 assets in the Beta environment plus the 7 spike
assets on record, 0 assets needed, the disposable rows and URLs involved, and the one expected side
effect: the first mint retiring U2, since T1's three C1 URLs still held its slots).

- **C2w-a (12:50:06 to 12:50:11 UTC, `scripts/provider-member.mjs c2 --submission no --bytes partial
  --discard abandon-response`):** mint `200` U5 `eg7Pj500…` (the server first retired U2
  `3eRAk2ZJ…` at Mux, the C1 mechanism, as predicted); `post_reply` `200`, row `56816df5…`, a video
  reply to T1's own V; PUT of 262,144 of a declared 8,388,608 bytes, cut; `abandon_response` `204`.
  After: the row `deleted` (12:50:10.99); ledger U5 `claimed`; exactly one new job `e48cdb45…`
  (`cancel_upload`, `abandoned`, upload U5, no asset, due at once); Mux: U5 `waiting`, passthrough
  T1, no `asset_id`; U2 `cancelled`; assets 2, inventory `ccb8b093…`; founder hash unchanged, 0
  activity rows for the founder.
- **C2w-b (12:51:05 UTC, `scripts/provider-drain.sh hosted dry_run`, step `C2w-b`):** worker `200`,
  `mode dry_run`, `claimed 1, release 1`; the job `pending` with `result.dry_run true`, `would
  {act cancel, owner_verified true, upload_status waiting}`; switch `off` after (its release set
  `not_before` 13:51:08, the release's hour; `mux_cleanup_set_mode('live')` would have made it due
  at once).
- **C2w-c, prepared and reviewed, not run:** the lead's shell may not write the function's
  secret store (`supabase secrets set MUX_CLEANUP_MODE=live` is refused by the permission
  classifier), so the step was packaged as one command for Nemat, `scripts/provider-c2w-c.sh
  <job>`, and reviewed independently (no blocker; the drain's exit status and a Ctrl-C trap added,
  `738b05e`). Before Nemat ran it, the recheck he asked for (18:55 UTC) found **U5 `timed_out` at
  Mux**: its URL expired at 13:50 UTC (ledger `expires_at` 13:50:09; Mux `timeout` 3600). The job
  is still `pending` and due, both switches are off (database `off`, no `MUX_CLEANUP_MODE`),
  assets 2, inventory unchanged.
- **What this means:** C2w-c's proof, the worker cancelling a *waiting* upload with partial
  bytes, can no longer be given with U5. A live drain of the existing job now exercises the other
  documented branch: Mux reports the upload ended, the worker records the job `done` with no Mux
  change (a timed-out upload holds nothing and makes no asset). That is harmless and still
  evidence, but not the cancel. A fresh C2w-a (a new URL and partial transfer, a new T1 sign-in
  code since the session expired at 13:43 UTC) followed by C2w-c within the hour would give the
  cancel proof. Nothing was created automatically; Nemat decides.
- **Nothing changed at Mux except the documented cancel of U2 and the four creates and one cancel
  of C1; no asset exists beyond the two; the founder's content is untouched.**

- **Decision (Nemat, 16 Oct 19:00 UTC): C2 stopped for the day; the job is left pending.** Where
  things stand: job `e48cdb45…` (`cancel_upload`, U5) stays `pending` and due; with the database
  switch `off` the scheduled worker never acts on it, and whenever a live or dry-run drain next
  runs it resolves as `done` with outcome `timed_out` and no Mux call. T1's C1 URLs U3 and U4
  have timed out at Mux the same way (their ledger rows stay `active` until the next mint
  retires or expires them; they hold nothing). T1's session has expired; the private token and
  address files were removed from the lead's machine. Nothing is live, nothing is scheduled to
  change, and Mux holds the same two assets as before C1.

*Next, when C2 resumes:* a new sign-in code for T1; either drain the old job first
(`scripts/provider-c2w-c.sh e48cdb45-…`, expected `done`/`timed_out`) or list it alongside the
new job as expected in the drain; a fresh C2w-a, then C2w-c within the hour, then C2a.

## 29. Conga Pages proxy: Cloudflare `conga-web` configured, `web` v4 deployed (17 Oct 07:26 UTC; Nemat approved)

PAGES-ROLLOUT approvals 1 to 4. Nemat did the Cloudflare and Supabase dashboard steps; the lead ran
the preflight, the one deploy and the checks. No other function, secret, migration, DNS record or Mux
object was touched.

- *Cloudflare (Nemat, dashboard):* Pages project `conga-web` by Direct Upload of
  `conga-web-dashboard.zip` (SHA-256 `0260dfae…4d41`); production variables `SUPABASE_URL`,
  `ADMIN_HOST`, `WEB_BASE_URL` and encrypted `SUPABASE_ANON_KEY`, `WEB_PROXY_KEY`; redeployed.
  Before configuration it served 503 everywhere except the two association files (read 17 Oct).
- *Supabase secret (Nemat):* `WEB_PROXY_KEY` added (13 secrets). Its digest equals the SHA-256 of
  `~/.conga-provider/web-proxy.key` (64 hex, no newline, mode 600); no value printed.
- *Preflight (lead):* `web` v3 downloaded and byte-identical to 4602169. New bundle `web/index.ts`,
  `links.ts`, `render.ts`, `_shared/client.ts`, `mux.ts`, `supabase.ts` from a79ef08; `deno check`
  clean. Local spoof test of the exact `web/index.ts` against a fake PostgREST, 17/17: forged
  `x-conga-client-ip` with no key, a wrong key, a key prefix, the key plus one character, the old
  `x-shortcut-*` names, a duplicated key header, a malformed address, and an unset, empty or
  31-character `WEB_PROXY_KEY` are all ignored; link-opened events are logged only with the key.
  Pages side (vitest, throwaway): visitor-supplied `x-conga-*`, `x-forwarded-for`, `Authorization`
  and cookies are never forwarded.
- *Deploy:* `supabase functions deploy web --no-verify-jwt --project-ref picvoavfxnajfjkqawju` from the
  integration worktree at a79ef08, clean tree. `web` v3 to **v4** ACTIVE, `verify_jwt` false; the
  other eight functions unchanged (version, bundle hash, time); 13 secrets, names and digests
  unchanged. v4 downloaded: all six files byte-identical to a79ef08.
- *End to end (read-only SQL counts of `analytics_events` and hashed `rate_limit_counters`; every
  request over IPv4 from the lead's Mac):* a page via Pages logged `web_link_opened`, so the
  Cloudflare key equals the Supabase key. A direct beacon to the function and one via Pages landed
  in the **same** bucket: Pages passes the visitor's real address, not Cloudflare's. Direct
  link-opened with a forged address and a wrong key: 204, not logged. Forged `x-conga-client-ip`,
  `x-forwarded-for`, `x-real-ip`, `true-client-ip`, direct and via Pages: counted in the real
  bucket, no new bucket. A client-supplied `cf-connecting-ip` is refused with 403 by Cloudflare at
  both `supabase.co` and `pages.dev`, so the header the function trusts first cannot be forged from
  outside (H9, from the outside). 19 test events in all (invite 6, video 7, prompt 1, profile 1,
  sign-in sheet 4), all in one bucket (19 of 60 for 07:00 to 08:00 UTC); the limit itself was not
  exhausted on hosted (covered by `web_beacon_integration_test`, PASS 17 Oct).
- *Routes via `conga-web.pages.dev`:* `/r/<live>` 200 `text/html` with `x-robots-tag: noindex`,
  `og:title` "… on Conga", app link `shortcut://r/<id>`, no old name; unknown `/r` and `/p` 404;
  `/i/TEST`, `/u/someone` 200; unknown path 404; `/admin` and `/admin/me` 404 (not the admin host);
  both association files 200 `application/json`. Forged header values are not echoed. The function
  URL still answers (text/plain, the platform rewrite) with the Conga wording. `admin` is not
  deployed (`/functions/v1/admin/me` 404).
- *Finding (minor, unchanged behaviour):* `/r/not-a-uuid` answers 500 with the unavailable page, as
  v3 did: the RPC rejects a malformed id. Harmless; a 404 would be cleaner.
- *Rollback:* redeploy `web` from 4602169 (a copy of that source is staged); remove the Supabase
  secret to stop trusting the proxy.
- *Next:* approval 5, the custom domains `conga.churntech.com` and `admin.conga.churntech.com`
  (`CLOUDFLARE-DASHBOARD.md` part 5); the hosted sign-in email still says Shortcut
  (`CONGA-RENAME.md` section 5).


## 30. Mobile beta pass: fixes, founder Release build, EAS Update (17 Oct; local only, nothing installed or published)

Base `4b2fe3f`; 23 commits to `c12724e`. Nothing pushed, deployed, installed on a phone or published.

- *Audit.* Four read-only audits (camera and stitching, posting, playback and social, auth and branding)
  of the integrated app; confirmed defects fixed with regression tests, speculative ones listed below.
- *Fixed (with tests):* pending recordings found again after an app update moves the iOS container
  (`06cf961`; matters for installing over the founder build); Re-record and Discard locked while Post runs
  (`c114e65`); the first state load retried, so the app no longer hangs on the splash when it starts
  offline or the first call fails; sign-out works offline with an expired token; a failed reload never
  sends a signed-in person to Welcome (`8d6a3e3`); code fields accept a pasted "123 456" (`6a30b91`);
  a take stopped under 2 s with no data is PR-Short, a second Stop re-sends it (`9c188bb`); camera and mic
  asked once then A-Camera/A-Mic, re-read after Settings (`58d4477`); Android Back on Post Review asks
  PR-Discard (`44be241`); players stop when another screen covers them, sheets kept as a stack
  (`8ec3c51`, `5bff5e7`); closing SF-Reported any way leaves the reported item (`8c20a93`); Home tab
  switches never drop a load (`d60eee1`); no auto-opened sheet over an unavailable entry (`591c02d`);
  a restricted commenter sees the notice (`f8c4739`); the response loops under Comments (`c12724e`).
  Stitcher hardening (`af36abe`): one failed copy ends all, so a failed writer cannot leave Post busy
  (not reproduced on macOS; harness ALL PASS).
- *EAS Update (`cc1cea1`; `OTA-UPDATES.md`):* `expo-updates` 57.0.26, runtime version policy
  `fingerprint`, channels `founder`, `preview`, `production`; updates stay off until `EAS_PROJECT_ID`
  exists; `scripts/publish-update.sh` with a publish guard in `app.config.ts`. `eas.json`: channels,
  `EXPO_PUBLIC_WEB_BASE_URL=https://conga.churntech.com`, Android production app bundle (validated with
  `@expo/eas-json`). Founder release builds: dev tools off and the links domain whatever `.env.founder`
  says. Distribution map: `BETA-DISTRIBUTION.md`.
- *Verified locally:* typecheck, lint, Jest 36 suites 444/444 (350 at the base); stitcher harness ALL PASS;
  iOS **simulator Release** build of the founder config: BUILD SUCCEEDED, Welcome renders with Conga
  branding and no dev controls, an unreachable update server neither blocks nor slows launch (A/B with
  updates off, 4 to 5 s both ways), the embedded fingerprint equals the publish-time one; **device
  Release** compile (arm64, unsigned): BUILD SUCCEEDED, bundle id `app.shortcut.founder`, display name
  Conga, JavaScript embedded; founder update dry run: bundle holds the hosted URL, the links domain and the
  publishable key, no local address, no function-URL links, no secret. Debug **simulator walk** against
  an isolated stack (`SIMULATOR-WALK-17OCT.md`): every fix above that the simulator can show held, no
  crash; found D-A (fixed in `c12724e`, not re-walked), D-B, D-C, D-D (open, below).
- *Installed on the iPhone (read 17 Oct, read-only):* `app.shortcut.founder` 0.1.0 (1), named
  "Shortcut" (built before the rename). The new build has the same bundle id and team, so installing it is
  an upgrade: the app's data (sign-in, waiting recordings) is kept. The auth storage key is now pinned to
  the supabase-js default, so the session survives.
- *Re-walk (same day):* D-A, D-B (Replies from Comments drew the header over the author line) and D-D (an
  unknown link from a pushed screen stayed put) fixed (`c12724e`, `dbc149e`, `45b44ab`) and seen fixed on
  the simulator (SIMULATOR-WALK-17OCT, Re-walk).
- *EAS and the founder build (17 Oct, later):* `eas init` created **@nemathsnv/conga** (id in `app.config.ts`);
  channels `founder`, `preview`, `production` created, nothing published; EAS environments empty. The
  founder Release build compiles for the iPhone (unsigned check: BUILD SUCCEEDED; `app.shortcut.founder`,
  Conga 0.1.0 (1), updates from the `founder` channel, embedded fingerprint
  `edf83d3d73556f1c00acd0a131ff609ebb31e158` equal to the publish-time one). The **signed** build stopped
  at signing: Xcode has no Apple ID signed in ("No Accounts"), so the free profile for
  `app.shortcut.founder` cannot be created; Nemat signs in to Xcode (Settings > Accounts), then
  `INSTALL=0 DEVICE=<udid> app/scripts/founder-ios.sh release`.
- *Founder build installed (17 Oct, Nemat approved):* after Nemat signed in to Xcode, the signed build:
  `codesign --verify` valid, team `BP7TM32HCQ`, `app.shortcut.founder`, entitlements only
  `application-identifier`, `team-identifier`, `get-task-allow`; the free profile lists the iPhone and
  expires 24 Oct 2026 16:19 UTC; fingerprint `edf83d3d…`. Installed over the existing app with `devicectl`
  (the home-screen name is now Conga). The app's data container is intact (AsyncStorage files from 13 Oct,
  preferences from 10 Oct; `Documents/recordings` empty, so no waiting recording). The first launch was
  refused by iOS until the new development certificate is trusted on the phone (Settings > General > VPN &
  Device Management). 18 Oct: after Nemat trusted and verified the developer entry, `devicectl` launched
  Conga; the process was still running about 40 s later with no crash log. Nemat: it opened on Home,
  still signed in as before, so the session and app data survived installing over the old build (seen on
  the device). The device pass itself (recording, flip, posting, CAMERA-FLIP.md and the not-walked list)
  has not run yet.
- *Still open from this pass:* D-C (hidden responses still counted; server side, section 1), the end card's one-response copy (section 1); M2 fixed (`7c6276c`); failed
  recording start shows nothing (no board); "Send a new code" failures silent (no board); unreferenced
  files in `Documents/recordings/` never swept; sign-out scope global vs local (Nemat). Android still never
  run.

## 31. iPhone bugs and mobile UX from Nemat's device test (19 Oct; nothing published; founder build installed, Nemat approved)

Base `22a8f7a`; branch `claude/conga-iphone-bugs-ux-6cf82a`. Full report: `release/IPHONE-BUGS-19OCT.md`.

- *P0, Respond → Post did nothing:* `post_response` refuses `already_responded` (one response per prompt;
  Nemat already has a live response on the hosted prompt), and Post Review only logged refusals. A refusal is now
  an Upload failed post (P2 / P1 banner on Home, Discard), never silent; regression tests for responses and video
  replies (`817ce93`). Closes the "Post refused while creating the row" row of section 1 for refusals; a failed
  stitch or storage error shows an unapproved system alert (Nemat to decide).
- *P1, zoom:* pinch and a 1×/2× button during a take, through a new local native module (`camera-zoom`); flip moved
  beside Record (`a471142`). **Native change: needs a new founder build.**
- *P2:* horizontal swipe on Home, profiles and Followers (`00df105`); Home and player bottom overlay 34 to 72 pt lower
  (Home had the tab bar counted twice) (`3bd9a1d`).
- *Verified:* typecheck, lint, Jest 39 suites 481/481; simulator Debug build and walk (layout, swipes, back swipe,
  record controls); the refusal on an isolated stack. **Not run:** anything with a camera (zoom, flip with zoom,
  recording, stitching) and the P2 banner after a real Post. Decisions for Nemat are listed in the report.
- *Founder build installed (19 Oct, Nemat approved):* fingerprint `a64bc144…`, over the existing app with `devicectl`
  ("App installed" on the second attempt). The first launch was refused (phone locked); after unlocking, launched 05:59:08 UTC and still running a minute later (pid 20045, new install path), no crash log. Signed-in state to be confirmed by Nemat on the phone.

## 32. iPhone stability and interactions from Nemat's second device test (19 Oct; EAS Update to `founder` published, Nemat approved; nothing deployed or installed)

Base `c757dfd`; branch `claude/conga-iphone-stability-3988b9`. Full report: `release/IPHONE-STABILITY-19OCT.md`.

- *Taps that did nothing, Discard only after a restart:* a React Native `<Modal>` refused by iOS (while a native sheet
  was up or closing) left an invisible full-screen layer over the screen; reproduced on the simulator. Every sheet is
  now an overlay in the view tree, P7/P8 a sheet route; a stray second navigation after Post removed (`56c7001`).
- *Lag:* player progress re-rendered whole screens 4x/s and re-subscribed native listeners; Home kept both lists'
  streams open since the swipe change; upload progress, analytics writes and the take timer re-rendered too much.
  Render work about 5x lower on Home and 9x in the player (simulator, Debug) (`8f0735a`, `b5453dd`, `89e06cc`).
- *Profiles:* swipe between Responses and Replies anywhere on the profile (`e943d2f`).
- *Respond:* answered prompts show "Responded" in the + sheet and Respond explains instead of opening the camera; the
  P2 line says why (`4b67636`). **Proposed copy, not on a board.** Server field `viewer_responded` prepared in
  `supabase/proposed/` (pgTAP 14/14), **not deployed**.
- *Verified:* typecheck, lint, Jest 41 suites 507/507; simulator walks on an isolated stack with a fake Mux. Founder
  update dry run: fingerprint `a64bc144…`, the installed build's, so an EAS Update can carry it (needs Nemat's approval).
  **Not run:** the iPhone, anything with a camera, a real Mux upload.
- *Published (Nemat approved):* EAS Update group `95dfedbb-c7b8-4939-849b-e03920eaafd6` (iOS update
  `01a1531a-3d96-7d71-a3d8-19bf9bf1d597`) to `founder` only, runtime `a64bc144…`, from `c5e326b`. It is the channel's first
  update, so rollback is to the embedded bundle (command in the report, section 9). Loading on the phone not yet confirmed.

## 33. Several responses per prompt, and Pause/Resume recording (19 Oct; migrations deployed and founder build installed with Nemat's approval; nothing published or pushed)

Report: `docs/release/MULTI-RESPONSE-PAUSE-19OCT.md`.

- *Decisions (Nemat, 19 Oct):* a member may respond to one prompt any number of times; recording
  supports Pause and Resume, counting only recorded footage (`docs/DECISIONS.md`; SPEC.md sections 2,
  6, 7 and 24 revised locally).
- *Database:* `20261019000200_multiple_responses.sql` drops the one-response unique index and the
  `already_responded` checks, and fixes the face strip so each responder appears once.
  - Idempotency, upload limits, account enforcement and moderation records are unchanged.
  - The hosted project is at 24 migrations. Batch C (`…0300`, `…0301`) goes in the same push.
  - Rehearsed from the 24-migration state: fingerprint 866 objects
    (`docs/release/mr-expected-27-migrations.fp`).
- *App:*
  - "Respond again" in the + sheet; Respond always opens the camera.
  - Pause and Resume: centre button, Stop on the left, Light top right, a grey "Paused" pill.
  - Backgrounding and camera interruptions pause the take and keep what was recorded.
  - Cancel during a take asks first.
- *Native fix:* the iOS stitcher crashed when a stitch failed (two concurrent `cancelReading` calls).
  Fixed; the harness passes 10 of 10 runs (base: crashed 2 of 3). This changes the runtime to
  `593205d5…`, so it needs a new build.
- *Verified:*
  - typecheck and lint; Jest 41 suites 527/527; pgTAP 1,701/1,701; every Deno suite.
  - the take state machine, 46 cases.
  - stitcher harness 34/34, with A/V joins within 8 ms.
  - rollback both ways.
  - a simulator walk with a camera stand-in, the real stitcher and the isolated stack: Respond
    again, Pause, Resume, flip while paused, Cancel's question, one stitched clip, a second response
    accepted by the server, Retry with no duplicate, backgrounding pauses.
  - iOS simulator build; **founder Release build signed, not installed** (profile expires 24 Oct).
- *Not run:* the iPhone (camera, torch, zoom, real audio across joins, the camera remount after
  backgrounding, a call), a real Mux upload, Android.
- *Deployed (Nemat approved, 19 Oct 14:19 UTC):* `20261016000300`, `…0301` and `20261019000200`.
  - The hosted project is now at 27 migrations, fingerprint `866|f702387b…`, data unchanged.
  - A pre-push logical dump was verified restorable; the project still has no managed backups.
- *Installed:* the founder build (runtime `593205d5…`) on the iPhone, launched and running.
- *Waiting on Nemat:*
  - the iPhone test (report section 6);
  - the camera controls and the "Respond again" and "Paused" copy, which are not on a board;
  - a Git push.
- *20 Oct, profile swipe fix (`09fa4f6`; Nemat approved publishing):* on Me and other profiles the header and tabs stay still and only the grid slides between Responses and Replies.
  - Checked on the simulator only.
  - Published as EAS Update group `c4d2ecb2-5395-4e04-adca-0a1dd69309cb` (iOS update `01a15879-b603-7bc1-bd66-017d5d840074`), to `founder` only, runtime `593205d5…`.
  - Dashboard: https://expo.dev/accounts/nemathsnv/projects/conga/updates/c4d2ecb2-5395-4e04-adca-0a1dd69309cb
  - Rollback: republish the build's embedded bundle with `eas update:roll-back-to-embedded --branch founder --runtime-version 593205d5b48fd2ed8dd7456ff16a60faecf84634 --platform ios`.

## 34. Mux media security and clean-up: hosted state, reconciliation tool, provider plan refreshed (20 Oct; read-only on hosted and Mux; nothing deployed, created, deleted or switched)

- *Read-only hosted and Mux check (10:22 to 10:27 UTC):* one plain select through
  `scripts/provider-sql.sh hosted` and Mux `GET`s only.
  - **Mux (Shortcut Beta): 5 assets**, `inventory_md5` `2fee7234…` (was 2, `ccb8b093…`, on 16 Oct).
  - Every asset belongs to its own `live` row, and each asset's passthrough is that row's author.
    There are no orphans, nothing is missing at Mux, and no deleted or removed video is still
    playable.
  - The three new assets are T1's: reply `cef19888…` (19 Oct) and responses `bcf65f4d…` and
    `1eb1ce41…` (20 Oct). T1 now has three responses on prompt `ddd5a383…`, so the founder iPhone
    build has been signed in as T1.
  - Hosted database: 27 migrations; clean-up `off`; health `warn`, from `waiting_while_not_live`
    (e48) only. Exactly one open job, e48 (`pending`, due). All six clean-up schedules are active,
    with 0 failures in 24 h. 2 accounts, none deleted. No unexpired T1 URL.
- *Capacity:* 5 Beta assets. The record had 7 spike assets on 16 Oct. If the free plan's 10-asset
  cap were account-wide, Mux would have refused at least one of the three new assets, and it did
  not. So the cap is not account-wide, or the spike assets are gone, or the plan is not the free
  one. The spike environment was not read today (its token was not used).
- *Built (`scripts/mux-reconcile.mjs`, `scripts/lib/mux-reconcile-core.mjs`):* the daily check and
  the reconciliation from `VIDEO-RELIABILITY.md` section 8, preconditions 4 and 5. It is
  read-only: Mux `GET`s and one plain select under `provider-sql.sh`'s guards.
  - It classifies every asset by the sweep's rules and flags problems: owner or asset mismatch, a
    live row whose asset or playback id Mux lacks, a deleted, removed or account-deleted video
    still playable, an orphan, and the count against `--cap`.
  - Exit status: 0 ok, 1 warn, 2 alert, 3 could not run. It takes the worse of its own result and
    `mux_cleanup_health()`.
  - 17 unit tests (`node --test scripts/tests/*.test.mjs`); each of 4 deliberate mutations of the
    classifier fails a test.
  - Hosted run: `status warn` (e48 only), `reconciliation ok`, capacity 5 of 10.
  - Not done: a schedule and a delivery path for the check. Both need Nemat's approval.
- *Test added:* pgTAP `0030` section 9 covers T1's shape on hosted: three responses on one prompt
  plus a video reply.
  - `delete_account` queues exactly one `sync_playback` per video (4), and asking again adds none.
  - The purge queues exactly one `delete_asset` per asset (4), all owned by the purged account,
    and touches no other member.
- *Local verification (isolated stack `shortcut-mux`, fake Mux; nothing on a device or real Mux):*
  `scripts/full-local-verification.sh` on the 27 migrations. Everything passed except the rollback
  check, which is stale (below):
  - pgTAP 1,701/1,701, then 1,713/1,713 with the new section;
  - every Deno unit and integration suite; scheduler 13/13;
  - auth integration; app typecheck, lint and Jest.
  - After a clean reset: C1 rehearsal passed, and the provider rehearsal passed 8/8 (C2w, C2a,
    C2e as assumed, E1, E2, E3, guards).
- *Found: `scripts/idempotency-rollback-check.sh` was stale since `20261019000200`, and is now fixed (below).*
  - It rolled back `20261013000200` and `0300` while the eight later migrations stayed applied, so
    the restored four-argument `post_response` brought back `already_responded`. pgTAP `0002` #27
    and `0009` #88 then failed.
  - Its failure recovery re-applied only the 0200 body, which left the stack with the one-response
    rule back. This only affected isolated stacks.
  - The function-only rollback of `abandon-submission` is unaffected.
- *Fixed (20 Oct, isolated stack `shortcut-rb27`; nothing hosted, no real Mux, no migration or rollback file changed):*
  `scripts/idempotency-rollback-check.sh` now works on all 27 migrations (`VIDEO-RELIABILITY.md`
  sections 6 and 11).
  - It rolls back every migration from `20261013000200` on, newest first, with its rollback file.
    Then it runs `0001`-`0011` as they were before batch A (1,089/1,089). The later test edits are
    reversed on a throwaway copy by `scripts/rollback-check/*.patch`. It then re-applies every
    migration, oldest first, and runs the whole suite (1,713/1,713).
  - Before that, it gives a throwaway member two responses on one prompt. It checks that the
    `20261019000200` rollback refuses with `multiple_responses_exist` naming them, and that the
    migration set and schema fingerprint are unchanged.
  - On any failure, it re-applies what it had rolled back, removes its throwaway rows, and checks the
    fingerprint against the start. This was tested with five injected failures in a scratch copy, and
    each one restored the stack exactly.
  - `scripts/full-local-verification.sh` passed twice in a row on 27 migrations (28/28 steps each
    time, including pgTAP 1,713, scheduler, C1 and provider rehearsals, auth integration, typecheck,
    lint and Jest 528/528).
- *On hosted, rolling back batch A is now blocked by data. That is a product decision, not a script
  problem.* Section 18's "roll back batch A" is no longer a standalone option: every later
  migration must be undone first, newest first. The first of those, `20261019000200`'s rollback,
  refuses while anyone has two responses on one prompt, and T1 has three. It changes nothing when it
  refuses. Going back to one response per prompt would mean Nemat deciding which response stands.
  No script can do that.
- *Provider plan:* `PROVIDER-SESSION.md` section 0 now carries this baseline.
  - P0 expects 5 assets and `2fee7234…`.
  - E1 and E2 each make 4 jobs, not 1, and E1 revokes all four of T1's videos until E2.
  - E3 would permanently delete the three device-test videos as well.
  - Nobody may use the phone as T1 during the session.
  - The U5 reassessment is unchanged: e48 closes as `done`/`timed_out` with no Mux change in the
    first dry run and live drain that list it. It only keeps the health check at `warn`.

## 35. A0 read-only preflight passed (20 Oct 14:56 UTC; Nemat approved A0 only; nothing changed)

Nemat's decision of 20 Oct (`docs/DECISIONS.md`): no E test on T1; E1 to E3 move to a disposable
account; C2w and C2a are separate operations; only A0 approved. Plan: `PROVIDER-SESSION.md` section 0.

- **S2, schema:** the hosted listing has 866 objects. It is identical, line for line, to
  `docs/release/mr-expected-27-migrations.fp` (md5 of the listing `146a1976…` on both).
- **S1, state:**
  - Migrations: 27.
  - Clean-up: `off`. Health: `warn`, from `waiting_while_not_live` (e48) only.
  - Open jobs: exactly e48 (`cancel_upload`, U5, `pending`, attempts 0).
  - T1: active, not deleted, 2 `auth.sessions` (counted, not read), so the phone stays signed in.
  - T1's 4 live videos are unchanged, with the same assets and playback ids.
  - T1's URLs: no unexpired slot; 0 minted in the last hour, 2 in 24 h. 3 submissions.
  - Founder: response `5b321c24…` on `L7KxG29…` unchanged. 2 accounts.
- **S3, Mux:**
  - U5 is `timed_out`, with no asset and passthrough T1.
  - All 5 playback ids answer HLS 200 and thumbnail 200.
  - `mux-reconcile.mjs hosted --cap 10`: reconciliation `ok`, 5 of 5 in use, `2fee7234…`
    unchanged, exit 1 (the e48 warning only).
- **Functions and secrets:**
  - 9 functions, all `ACTIVE`. `mux-create-upload` is still bundle `bd0a6937…` (R0).
  - 13 secret names (digests only). **No `MUX_CLEANUP_MODE`.**
- **A0 verdict: pass.** C2w would start from exactly the state its plan expects.
- **Not done in A0:** no T1 code was sent, and nothing was minted, drained or switched.
- **Mux quota scope: not confirmed.**
  - Mux's free-plan note says only "upload and store up to 10 video assets". It does not say
    whether that is per account or per environment, or what happens at the limit.
  - Evidence from hosted: the Beta environment has gone from 2 to 5 assets since 16 Oct with no
    refusal, while the record says the spike environment held 7. That rules out "account-wide 10
    with 7 spike assets present". It does not tell per-environment from "spike assets gone" or
    "not the free plan".
  - What would settle it: Nemat reads the plan and asset usage in the Mux dashboard (Settings,
    Billing), or approves one read-only `GET /video/v1/assets` count with the spike environment's
    token.

## 36. Provider test C2a passed on the hosted project and real Mux (20 Oct 15:56 UTC; Nemat approved C2a only)

Approved by Nemat on 20 Oct: the single C2a, after a fresh read-only preflight. No C2w, E test,
worker drain, switch, secret, deployment or push.

- **Preflight (15:55 UTC, read-only):** everything matched section 35.
  - Mux: 5 assets, `2fee7234…`. Reconciliation `ok`; all 5 playback ids HLS 200 and thumbnail 200.
  - Clean-up `off`; only e48 open; 13 secret names, no `MUX_CLEANUP_MODE`.
  - T1: active; 4 live videos; 2 sessions; no unexpired slot; 0 minted in the last hour.
- **Sign-in:** one code was sent at 15:55:43 UTC. Nemat entered it privately
  (`provider-t1-verify.sh`), which added a third T1 session. The phone's two sessions were not
  touched. Re-check just before the run: unchanged, with 3 sessions.
- **Run (15:56:54 to 15:57:02 UTC):** `provider-member.mjs c2 --reply-to V --submission yes --bytes partial --discard abandon-submission`.
  1. Mint `200`, U7 `bEKSH5G1…`.
  2. `post_reply` `200`: row R7 `f889eaeb…`, a `processing` reply to T1's own V; submission
     `bdd19a3c…`.
  3. PUT cut after 262,144 of 8,388,608 bytes.
  4. `abandon-submission` `200` **`{"outcome": "abandoned", "reason": "cancelled"}`**.
- **Postflight (15:57 UTC):**
  - Mux: U7 is **`cancelled`, `asset_id` null**, passthrough T1. **Assets still 5, `inventory_md5`
    `2fee7234…` unchanged**; reconciliation `ok`, 5 of 5 in use. All 5 playback ids still answer
    HLS 200 and thumbnail 200.
  - Database:
    - R7 `deleted`, no asset.
    - Ledger U7 `claimed`, `cancelled_at` 15:57:02.55.
    - Submission `abandoned_at` 15:57:02.55, `abandoning_until` null.
    - **No new clean-up job** (still only e48; 5 jobs in total).
    - 0 activity rows.
  - T1's 4 videos are unchanged (rows, assets, playback ids), and the founder video too.
  - T1: 3 sessions; no unexpired slot. 1 minted in the hour, 3 in 24 h (limits 10 and 30).
  - Clean-up `off`; health `warn` from e48 only; 13 secret names, no `MUX_CLEANUP_MODE`.
- **What this proves on the real provider:** the app's discard path (`abandon-submission`, the
  discard in every build since `b7a02ad`) cancels a waiting upload that has received part of a
  file. It cancels at Mux first and retires the row only after Mux confirmed. It queues no worker
  job, and Mux makes no asset.
- **Residual state; nothing needs cleanup:**
  - R7 stays as a `deleted` tombstone, invisible everywhere. U7 stays a `claimed`, cancelled
    ledger row, and the submission stays abandoned. These are the designed records, kept with the
    account.
  - The test session (T1's third) cannot be refreshed: the script keeps only the access token,
    which expires at about 16:56 UTC. The token and address files were deleted from the Mac at the
    end.
  - e48 is still pending, as before; it closes in C2w's drains.

*Next:* C2w, its own approval (`PROVIDER-SESSION.md` section 0, "Operation C2w").

## 37. Provider test C2w passed on the hosted project and real Mux; U5's job closed (21 Oct 03:05 to 03:16 UTC; Nemat approved C2w only)

Approved by Nemat on 20 Oct: the single C2w with one live window, Nemat present throughout. No E
test, no continuous clean-up, no schedule, no deployment, no push.

- **Preflight (20 Oct 16:22 UTC, read-only):** everything matched section 36.
  - Mux: 5 assets, `2fee7234…`; all 5 playback ids HLS 200 and thumbnail 200.
  - Jobs: only e48 open and due. U5 `timed_out` at Mux, no asset.
  - Switches: database `off`, no `MUX_CLEANUP_MODE`.
- **First token expired (stopped safely):**
  - Nemat's "ready" came at 17:57, after the 16:23 token had lapsed. The mint answered `401` and
    nothing was created (0 URLs, 0 rows; state unchanged).
  - A new code was sent at 03:04:55 on 21 Oct and entered by Nemat; the token was 11 s old at the
    mint.
- **C2w-a′ (03:05:44 to 03:05:49):**
  - Mint `200`, U6 `S3boBnAB…`, expiring 04:05:46.
  - `post_reply` `200`: row R6 `a35a78ea…`, a reply to T1's own V.
  - PUT cut after 262,144 of 8,388,608 bytes; `abandon_response` `204`.
  - After: R6 `deleted`; exactly one new job J6 `230e5da4…` (`cancel_upload`, `abandoned`, U6, owner
    T1, due). Mux: U6 `waiting`, no asset.
- **C2w-b′ dry run (03:06:14, run 9):** worker `200`, `dry_run`, claimed 2, released 2. e48 would
  close as `timed_out`; J6 would `cancel` the `waiting` upload, owner verified. Switch `off` after.
- **First window refused before any action (03:07:27 to 03:07:35):**
  - Nemat ran `scripts/provider-c2w-c.sh` with both ids. It set `MUX_CLEANUP_MODE=live`.
  - The drain's first check, run from Nemat's shell, did not read the database switch as `off` and
    refused ("precondition: the switch is not off"). The trap then unset the variable.
  - The switch really was `off`; the same check passed from the lead's shell straight afterwards.
    The likely cause is an unreadable database answer, which the check treats as not off (fail
    closed); the refusal printed nothing else, so it is not confirmed.
  - Nothing ran: no worker request (run 9 was still the only one), no Mux call, both jobs pending
    with 0 attempts.
- **Second window, with Nemat's go (03:11 to about 03:15):**
  - Nemat set the variable; the lead confirmed it present.
  - One guarded live drain of exactly e48 and J6 at 03:12:09 (run 10): worker `200`, `live`,
    claimed 2, done 2, found_asset 0, failed 0, skipped 0, stale 0. Database switch `off` after.
  - Nemat unset the variable; confirmed absent at 03:16:52.
  - Total time the function switch was set: about 8 s in the first window plus about 4 minutes in
    the second. The database switch was `off` throughout, except inside each guarded drain.
- **Postflight (03:12 to 03:16):**
  - **J6 `done` `{"outcome": "cancelled"}`; U6 at Mux `cancelled`, `asset_id` null.**
  - **e48 `done` `{"outcome": "timed_out"}`** (U5 still `timed_out`, no asset). U5 was never
    recreated.
  - 0 open jobs; 6 in total; no other job created or changed.
  - **Health `ok`, no problems** (the `waiting_while_not_live` warning is gone).
  - Mux: still 5 assets, `2fee7234…` unchanged; reconciliation `ok`, exit 0. All 5 playback ids
    still HLS 200 and thumbnail 200.
  - T1's 4 videos are unchanged (rows, assets, playback ids); the founder video too. 0 activity
    rows.
  - Ledger U6 stays `claimed` with no `cancelled_at`, as designed: the worker never frees slots,
    and the URL has expired anyway.
  - Secrets: 13 names, no `MUX_CLEANUP_MODE`; database switch `off`.
- **What this proves on the real provider:** a `cancel_upload` job from the legacy discard
  (`abandon_response`) is cancelled at Mux by the worker for a waiting upload holding part of a
  file, and Mux makes no asset. A job for an upload Mux reports `timed_out` closes with no Mux
  change.
- **Residual state; nothing needs cleanup:**
  - R6 is a `deleted` tombstone; U6 is a `claimed` ledger row.
  - T1 has 5 `auth.sessions`: the phone's 2 plus 3 test sign-ins (C2a and tonight's two codes).
    Each test session holds only an access token that has expired or expires within the hour, and
    no refresh token was kept, so they cannot be used again. They are not revoked (that would be a
    change to T1); the phone's sessions were not touched.
  - T1 minted 4 URLs in 24 h (limit 30). The token and address files were deleted from the Mac.
  - Mux run 10's answer is collected by the 10-minute monitor as usual.
- **Follow-up:** before `provider-c2w-c.sh` is used again, its drain check should print the raw
  database answer when it cannot read the switch, so a refusal like the first window's can be
  diagnosed.

*Done with C2w and C2a:* the cancellation paths are proven on real Mux. *Not done:* E1 to E3 (a
disposable account, after the quota scope is confirmed), continuous clean-up, scheduled
reconciliation.

## 38. Mux capacity, E preflight, T2 tooling rehearsed locally; invite defect found (21 Oct; read-only on hosted and Mux; nothing created, sent, switched, deployed or pushed)

Branch `claude/provider-t2-tooling` on `3340b08`.

- **Mux capacity (read-only, 21 Oct about 03:50 UTC; GETs only):**
  - **Live counts:** Beta (`948jfr`) 5 assets, `2fee7234…`; spike ("short", `arc32j`) 7 assets,
    `315652b2…`; all `ready`. Both environments are development environments in one organization,
    "Churn" (`qa5gin`).
  - **The 10-asset cap is not refused across the organization at upload time.** Mux holds 12, and
    accepted the 11th and 12th on 20 Oct.
  - Whether the cap counts per environment, or across the organization but softly, is not documented.
  - One disposable asset fits either way.
  - Both tokens hold `video:write`; they were used for GETs only.
- **E preflight (read-only, 04:10 to 04:15 UTC):**
  - **Mux:** 12 assets, and all 12 playback ids answer HLS and thumbnail 200.
  - **Cleanup:** switch `off`; no `MUX_CLEANUP_MODE` (13 secret names); 9 functions `ACTIVE`; health
    `ok`; 0 open jobs.
  - **Accounts:** 27 migrations; 2 accounts; 2 invites, none unused.
  - **T1 and the founder:** T1's 4 live videos and the founder's are unchanged.
  - **T1's sessions:** 5. One is the iPhone's (13 Oct, refreshed 03:40); four are from test sign-ins.
  - **T1's upload `zxdf…`** was minted by the phone at 03:43. Read again at 05:33: `timed_out` at Mux
    with no asset; the ledger still `active` and expired, with no row and no job. Not changed.
- **Tooling** (`PROVIDER-SESSION.md` section 0, `PROVIDER-TESTS.md` section 2):
  - **Changed:** `provider-member.mjs` (T2 commands; guards that refuse T1 and the founder
    unconditionally) and `provider-env.sh` (T2's own files; T1 refused).
  - **New:** `provider-check.mjs` (S1 for T2, protected baseline), `provider-t2-invite.sh`,
    `provider-member-verify.sh`, and `make-test-clip.swift`. The clip: 6.000 s, 720x1280, 404 KB,
    sha256 `11d12a97…`, a colour sweep.
  - **`provider-drain.sh` fix:** `supabase db query` prints a bare array in a plain shell and a
    `{rows}` wrapper in an agent's. The drain read only the wrapper, so from Nemat's terminal every
    drain would have stopped at "switch is not off". It now reads both.
- **Rehearsal** (isolated stack `shortcut-t2r`, fake Mux; `scripts/provider-rehearsal.sh`):
  - **The existing C2, E1 to E3 suite:** 8 of 8.
  - **The new `provider_t2_rehearsal_test.ts`:** 15 of 15. The stack stand-ins for T1 and the founder
    have the real ids, so the built-in guards are what is tested. It covers:
    - the guards: every acting command, three `PT_EXPECT_USER` values each;
    - T2 creation and its refusals: an address with an account, an id already recorded, an old
      account, an onboarded account, another account;
    - onboarding;
    - the upload cases: a cut transfer resumed on the same URL; a lost PUT answer with the asset
      already made; Mux making an upload but answering an error; a lost `post_response` answer
      replayed to the same row; cancelled and errored uploads refused, and `--new-upload` only after
      Mux proves the old upload empty;
    - E1 and E2;
    - both E3 outcomes;
    - the protected baseline before and after every operation.
  - **Not covered:** real Mux, the hosted project, Resend email, the app on a device.
  - **A real-Mux request:** after a video goes live, `mux-upload-status` sends one unauthenticated
    prewarm GET to the real `stream.mux.com`. In the rehearsal the playback id is made up, so the
    request gets a 404 and creates nothing. Left as it is (product code).
- **Defect found, blocking E3 (not fixed; Nemat's decision needed):** an account that redeemed an
  invite cannot be removed. `invites.redeemed_by` is `on delete set null` and `redeemed_at` stays,
  so `invites_redeemed_pair` refuses the row and the deletion rolls back.
  - **Seen locally:** `purge_deleted_accounts()` returned 0 and recorded the constraint in
    `account_purge_failures`, with nothing queued. The Auth admin deletion answered 500.
  - **Who it affects:** every closed-beta member. No account is deleted on hosted yet.
  - **The rehearsal's handling:** it asserts the defect, then clears that one account's redemption by
    hand, locally, as a labelled stand-in, to rehearse the rest of E3.
  - Logged in `docs/BLOCKERS.md`.
- **Plan revised (Nemat, 21 Oct), in three places:**
  - **T1's iPhone:** not frozen. Use is restricted only inside an operation and W1, with a fresh
    baseline before each operation.
  - **E3:** (i) the automatic purge and (ii) the manual Auth deletion are recorded as distinct
    outcomes; only (i) verifies the purge.
  - **Uploads:** an uncertain upload is inspected at Mux before any retry.
- **Waiting on Nemat:**
  - CP0′-a (exact writes in `PROVIDER-SESSION.md` section 0);
  - a decision on the invite defect before E3.

## 39. Invite-linked account deletion fixed locally (21 Oct; nothing hosted, no Mux, no real deletion, no push)

Branch `claude/invite-account-deletion-fix-693183` on `c0d0ba8`. The full record is in
`docs/release/INVITE-DELETION-FIX-21OCT.md`.

- **Decision (Nemat, 21 Oct):** an invite keeps its redemption history after its member is
  permanently deleted, loses the link to the person, and can never be redeemed again.
- **Migration `20261021000100_invite_member_deletion.sql`:** `invites_redeemed_pair` is replaced by
  `invites_redeemer_has_time` (`redeemed_by is null or redeemed_at is not null`), plus two column
  comments. No function, grant, index or row changes. Its rollback is in `supabase/rollback/`; it
  refuses once a deleted member's invite exists.
- **Eligibility checked:** every lookup answers `used` on `redeemed_at`. Only
  `scripts/provider-t2-invite.sh` treated `redeemed_by is null` as unused; it now uses `redeemed_at`.
- **Mux leak in rehearsals fixed:** `prewarm()` no longer reaches `stream.mux.com` when `MUX_API_BASE`
  names a fake. `MUX_STREAM_BASE` can point it at the fake, and `provider-rehearsal.sh` does so. Hosted
  behaviour is unchanged.
- **Runner fix:** `full-local-verification.sh` no longer runs `provider_t2_rehearsal_test.ts` as a unit
  test (it needs the stack; `provider-rehearsal.sh` runs it).
- **Results on the isolated stack `shortcut-inv`** (28 migrations from a reset, fake Mux; stopped
  afterwards):
  - **pgTAP:** 23 files, 1775 tests, all pass. The new `0033` has 62.
  - **Deno unit:** all pass. `mux_test` is 22, including the new prewarm isolation test.
  - **Deno integration:** all 10 suites pass. Scheduler 13/13, C1 rehearsal and auth integration pass.
  - **Provider rehearsal, after a clean reset:** 8/8.
  - **T2 rehearsal, after a clean reset:** 15/15. E3(i) and E3(ii) now assert the fix; the stand-in is
    gone. The prewarm GET reached the fake.
  - **In the uninterrupted full run, T2's E1 failed its health check.** The earlier suites' leftovers
    (the scheduler's unproven "stranger" orphan and worker errors) put health at `alert`. It passed
    after the reset; section 34 also ran the rehearsals after a reset.
  - **Rollback and fingerprint rehearsal:** 15/15.
    - Under the old check, the defect reproduces: the Auth deletion fails on `invites_redeemed_pair`,
      the purge removes nobody and records the failure.
    - The forward migration on top fixes both, and both invites stay used.
    - The rollback refuses once a deleted member's invite exists and changes nothing.
    - The fingerprint diff is exactly `invites.invites_redeemed_pair` →
      `invites.invites_redeemer_has_time`.
- **Known failures, not from this change:**
  - `idempotency-rollback-check.sh` fails 0002 #27 and 0009 #88: stale since `20261019000200`,
    section 34.
  - App typecheck and lint did not run: this worktree has no `app/node_modules`. No app code changed.
- **Not run:** hosted, real Mux, a device.
- **Waiting on Nemat:**
  - approval of the hosted migration (preflight, backup and postflight in the release note);
  - whether the inviter gets the slot back once the invitee is purged (what the code does today);
  - a retention period for invite rows.

## 40. Invite deletion migration deployed to hosted (21 Oct 07:03 to 07:08 UTC; Nemat approved this one migration only)

From `096fe7a` (clean tree). The migration was pushed from a `git archive` of `supabase/migrations`,
`config.toml` and `templates` in a scratch folder. Every read used `supabase db query --linked
--project-ref` (Management API) and was select-only. The checks are in
`scripts/invite-migration-hosted-check.sh pre|post <outdir>`; they print counts, hashes and verdicts,
never a code, email or secret. Nothing else was done: no row, grant, function or index change, no
Edge Function, secret, switch, Mux call, Auth user, T2, EAS update or git push.

- **Preflight (07:03:50), all PASS:**
  - **Migrations and schema:**
    - 27 migrations, the latest `20261019000200`.
    - Fingerprint 866 lines, line for line `docs/release/mr-expected-27-migrations.fp`.
    - `invites_redeemed_pair` `CHECK (((redeemed_by IS NULL) = (redeemed_at IS NULL)))`.
    - The code check unchanged.
    - Foreign keys: cohort no action; `inviter_id` and `redeemed_by` set null.
  - **Invites:** 2, none unused, none inconsistent, none orphaned. Both answer `used`.
  - **Accounts:** 2, none deleted, so no purge is pending. 2 Auth users. 0 purge failures.
  - **Clean-up:**
    - Switch `off`, health `ok`, 0 open jobs (6 in all, 2 `delete_asset`, all closed).
    - 0 avatar removals pending.
    - Cron: 10 jobs active, 0 failures since 20 Oct, the 03:15 purge succeeded today.
  - **Secrets:** 13 names; no `MUX_CLEANUP_MODE`, `MUX_API_BASE` or `MUX_STREAM_BASE`.
  - **Table hashes:** row count and content md5 recorded for each of the 36 public tables and
    `auth.users`.
- **Dry run:** `supabase db push --linked --project-ref picvoavfxnajfjkqawju --workdir <scratch>
  --dry-run` listed exactly `20261021000100_invite_member_deletion.sql` (md5
  `97478520288ae63497c1c560c49a2a2a`), with seeds and roles both `[]`.
- **Backup (07:05:16):** `public.invites`, data only, all 9 columns, 2 rows, as JSON.
  - **File:** `~/.conga-provider/backups/invites-before-20261021000100-20261021T070516Z.json`, mode
    600, in a mode-700 folder outside git; sha256 `9faa4d18…`. Not displayed.
  - **Restore, if ever needed:** `insert … select * from json_populate_recordset(null::public.invites,
    <rows>)`.
- **Push, first attempt (07:05:32):** the CLI failed before connecting:
  `DbConfigLoginRoleNetworkError … TransportError`.
  - A read-only check confirmed nothing had applied: still 27 migrations, the old check.
  - A repeated dry run listed the same single migration, so the same push was run again.
- **Push (07:06:48 to 07:06:52):** "Applying migration 20261021000100_invite_member_deletion.sql",
  "Finished supabase db push".
- **Postflight (07:07:07), all PASS:**
  - **Schema:**
    - 28 migrations, the latest `20261021000100`.
    - Fingerprint 866 lines, line for line `docs/release/inv-expected-28-migrations.fp` (the
      rehearsed listing).
    - Against the hosted preflight, exactly one line differs:
      `constraint|invites.invites_redeemed_pair|75b9cec6…` became
      `constraint|invites.invites_redeemer_has_time|33d7d7b0…`.
    - The new check is `CHECK (((redeemed_by IS NULL) OR (redeemed_at IS NOT NULL)))`. The code check
      and the foreign keys are unchanged.
    - Both column comments are present.
  - **Data:**
    - Every one of the 36 public tables and `auth.users` has the same row count and content hash as
      before, `invites` and `mux_cleanup_jobs` included.
    - Both invites still answer `used`. `invite_lookup_unlimited` still tests `redeemed_at`.
  - **Clean-up:** switch `off`, health `ok`, 0 open jobs, the job totals unchanged. 0 purge failures,
    0 deleted accounts, 0 cron failures. Secret names unchanged.
- **Not verified on hosted:** an actual removal of an invited member. The rehearsal on the isolated
  stack covered it (section 39); on hosted the first will be E3, which needs its own approval.
- **Next (each its own approval):** creating and onboarding T2 (CP0′-a, CP0′-b), then E1 to E3.
- **Decided with the approval:**
  - an inviter gets the slot back once the invitee is purged (existing behaviour);
  - a provisional 90-day retention target for anonymised redeemed-invite records, subject to legal
    review. It is not implemented.

## 41. CP0′-a: disposable account T2 created and onboarded on hosted (21 Oct 07:28 to 08:36 UTC; Nemat approved CP0′-a only)

From `c94043a`, as `PROVIDER-SESSION.md` section 0 describes. No video, upload or Mux asset; no Mux
write (GETs only); no E test, deletion, switch, deployment or push. Nothing printed an address,
code, invite code or token.

- **Preflight (07:28 to 07:30), all as expected:**
  - **Schema:** 28 migrations, fingerprint equal to `inv-expected-28-migrations.fp`.
  - **Accounts and invites:** 2 accounts (T1 `test_t1`, founder `nemathsnv`), none deleted. 2 invites,
    both redeemed, none unused or inconsistent. No purge failures.
  - **Clean-up:** `off`, health `ok`, 0 open jobs, no cron failures.
  - **Since the deployment postflight:** every table's row count and content hash unchanged.
  - **Baseline `~/.conga-provider/baseline-cp0a.json` (600):**
    - T1: 7 rows, 4 live, 5 sessions.
    - Founder: 2 rows, 1 live.
    - Mux Beta 5 `2fee7234…`, spike 7 `315652b2…` (GETs).
- **Address:** Nemat wrote `~/.conga-provider/t2.email` (600, a `+` alias). It was checked for shape
  only and never displayed.
- **Write 1, the invite (08:28:52):** `provider-t2-invite.sh hosted 2`, guarded.
  - Invite `eaf264e9-4715-421c-8f10-b085e296fae1`: team, Canggu, expires 28 Oct 08:29 UTC.
  - Code only in `~/.conga-provider/t2.invite` (600).
  - Then: 3 invites, exactly 1 unused (the new one).
- **Write 2, one code (08:29:28):** `provider-member.mjs otp --create`. The address check found no
  account, then `/auth/v1/otp` answered 200.
  - One new Auth user for the address: unconfirmed, 1 email identity.
  - Its `accounts` row was made at once by the `on_auth_user_created` trigger, not by the first
    sign-in as the plan said; the plan is corrected.
- **Nemat, `provider-member-verify.sh --new`:**
  - 200, user `4fd43a83-1ade-4025-9695-4d6137532b36`, new account, id recorded. `t2.id` and
    `t2.token` are 600.
  - Checked from the server: the only user with the address, confirmed, one email identity, one
    session, not T1 or the founder, no age, profile, cohort or invite yet.
- **Write 3, onboarding (08:35:03):** `provider-member.mjs onboard --name "test two" --username
  test_t2`: `confirm_age` 204, `redeem_invite` 200 `valid`, `create_profile` 200,
  `acknowledge_disclosure` 204. `ok: true`.
- **Postflight (08:35 to 08:36):**
  - **Totals:** 3 accounts, 3 Auth users, 3 invites, 0 unused, 0 inconsistent.
  - **T2's invite:** redeemed by T2, `redeemed_at` 08:35:04, not cancelled; `invite_lookup` now
    answers `used`, so it cannot be reused.
  - **T2's account:** Canggu cohort, follows Canggu (1 place follow), profile `test_t2`, 1 session.
    Nothing else: 0 rows, 0 ledger, 0 submissions.
  - **Protected:** `provider-check compare` unchanged. T1's and the founder's accounts, rows,
    ledgers and session ids are as at the baseline; Mux Beta 5 and spike 7, the same inventories, 0
    T2 assets.
  - **Clean-up:** `off`, health `ok`, no open job, job totals unchanged (6). 0 purge failures, 0
    cron failures. Fingerprint unchanged.
  - **Tables changed, all expected:** `accounts`, `auth.users`, `invites`, `place_follows` and
    `profiles` +1 each.
  - **`rate_limit_counters` +2:** `signin_address` and `signin_client`, one hit each, from the app's
    address check before the code. Both expire after 15 minutes.
- **Next:** CP0′-b (T2's one video, one new Beta asset) needs its own approval.

## 42. CP0′-b: T2's one disposable video V2 is live on hosted and Mux Beta (21 Oct 08:52 to 08:55 UTC; Nemat approved CP0′-b only)

From `d780563`, as `PROVIDER-SESSION.md` section 0 describes, with T2's existing token. That token
was issued 08:31:29 and expires 09:31:29, so it was valid throughout; no new sign-in. Writes: one
upload URL, one row, one transfer. Mux reads were GETs only. No E test, deletion, switch, secret,
deployment, update or push. IDs are kept privately in `~/.conga-provider/t2.v2.json` (600) for E1
to E3.

- **Preflight (08:53:12 to 08:53:31), all as expected:**
  - **Hosted:** 28 migrations, 3 accounts.
  - **T2:** 0 rows, 0 uploads, 0 submissions, 1 session, no journal.
  - **Clean-up:** `off`, health `ok`, no open jobs.
  - **Protected:** `provider-check compare` against the CP0′-a baseline unchanged. Mux Beta 5
    `2fee7234…`, spike 7 `315652b2…`. Fresh baseline `~/.conga-provider/baseline-cp0b.json` (600).
  - **Prompt:** `ddd5a383-be11-475f-9576-0a6db79cabe3`, `live`.
  - **Clip:** `~/.conga-provider/t2-clip.mp4`, 403,933 bytes, sha256 `11d12a97…`.
- **Write, `provider-member.mjs respond` (08:53:42 to 08:53:49), one pass:**
  - **Mint:** 200, upload `cZN6ajHr…`.
  - **`post_response`:** 200, not replayed. Response V2 `cec0cef7-1566-431b-b5fc-aaaf7be46f60`,
    submission `1b8312e8-d676-4383-ba51-1ee0c041e390`.
  - **Transfer:** one complete PUT, 403,933 of 403,933 bytes, 200.
  - **Result:** upload `asset_created`, asset `ready`, row `live`, playback `VpzPAAYF…`.
  - No retry, no resume, no second URL.
- **Postflight (08:54 to 08:55):**
  - **T2:** exactly 1 row, a `live` response with asset `xMQeMrW0…` and playback `VpzPAAYF…`. Its
    ledger has 1 upload, `claimed` by V2. 1 submission, for V2.
  - **The asset at Mux:** `ready`, 6.07 s, passthrough T2's id, `upload_id` the minted upload, one
    public playback id.
  - **Mux Beta:** 6 assets (`6bbd4333…`): the original 5 unchanged (protected hash equal) plus V2.
  - **Mux spike:** 7, `315652b2…` unchanged.
  - **Playback:** every playback id in both environments, the 5 originals, the 7 spike and V2's,
    answers HLS 200 and thumbnail 200.
  - **Protected:** `provider-check compare` unchanged. T1's and the founder's accounts, rows,
    playback ids, ledgers and session ids are as at the baseline.
  - **Clean-up:** `off`, health `ok`, no problems, no open jobs, total jobs still 6 (the newest from
    03:05).
  - **A slip in my read-only loop:** Mux lists each playback id as "<id> public", and the shell split
    it, so 13 extra GETs asked `stream.mux.com` for the playback id "public" (404). No credential was
    sent and nothing was changed.
- **Next:** E1 needs its own approval. T2's token expires 09:31:29 UTC; E1 starts with a new code
  (`provider-member-verify.sh`), as the plan says.

## 43. E1 Stage A: T2 soft-deleted and the revocation dry-run on hosted (21 Oct 09:00 to 09:07 UTC; Nemat approved Stage A only)

From `3a29e4e` plus the playback-check fix below. Writes: one sign-in code, T2's `delete_account`, one
guarded dry-run drain (the switch to `dry_run` and back to `off`). No live window, no Mux change
(GETs only), no E2 or E3, no deployment or push. Nothing printed an address, code or token.

- **Playback-check fix (local tool):** `scripts/provider-mux-read.mjs playbacks`.
  - It lists every asset and checks HLS and thumbnail for each id taken from Mux's structured
    `playback_ids[].id`.
  - Section 42's ad hoc loop split "<id> public" and also asked for the id "public".
  - Tested against a local fake first: several ids per asset, an asset without ids, a 404 reported
    as not all 200, and no request containing "public".
- **Preflight (09:00:39 to 09:01:46), all as expected:**
  - **Hosted:** 28 migrations, 3 accounts, none deleted.
  - **T2:** exactly one row, V2 `live`, with asset `xMQeMrW0…` and playback `VpzPAAYF…`. 1 session,
    0 push tokens.
  - **V2 visible before:** `video_visible` true for anonymous viewers, T1 and the founder;
    `web_video` `live`.
  - **Clean-up:** `off`, health `ok`, 0 open jobs.
  - **Protected:** `provider-check compare` against the CP0′-b baseline unchanged. Fresh baseline
    `~/.conga-provider/baseline-e1.json` (600).
  - **Mux:** Beta 6 (`6bbd4333…`), spike 7 (`315652b2…`); `playbacks`: 6 and 7 ids, all HLS 200 and
    thumbnail 200.
  - **Guards:** `delete-account` with `PT_EXPECT_USER` set to T1, then the founder, was refused
    before any request.
- **Sign-in:**
  - `otp` without `--create` at 09:01:57, 200. Still 3 Auth users, 1 for the address.
  - Nemat ran `provider-member-verify.sh` (no `--new`): token saved.
  - Checked locally before use: subject T2, a new session (not session 1), issued 09:02:39 by `otp`.
- **Deletion (09:02:54):** `provider-member.mjs delete-account`: 204, as T2, 15 s after the sign-in.
- **Results:**
  - **T2:** `deleted_at` 09:02:55.544. Auth sessions 0, live refresh tokens 0.
  - **Tokens:** `sign-in-state` with the deletion's token, and with the earlier session-1 token
    (still unexpired, a private copy since removed), both answered 403 `session_revoked`.
    `deleted_at` stayed set: nothing was restored.
  - **Exactly one new job:** `d7e245e3-5913-4116-acdc-34f41d6e8d71`, `sync_playback` /
    `account_deleted`, asset `xMQeMrW0…`, response V2, owner T2, `pending`, due 09:02:55. Total jobs
    7.
- **Dry run (09:04:40 to 09:05:36):**
  - `PROVIDER_WRITE_STEP=E1-dry scripts/provider-drain.sh hosted dry_run … d7e245e3-…`.
  - Worker answer 200: `mode dry_run, claimed 1, release 1`, nothing done or failed. Switch after:
    `off`.
  - **The job's plan:** `direction revoke`, `owner_verified true`, `asset_status ready`,
    `public_playback_ids` and `would_revoke` exactly [`VpzPAAYF…`]. No other asset.
  - **Released, by design:** the job is `pending` with `not_before` 10:05:13 (release adds an hour).
    `mux_cleanup_set_mode('live')`, which the live drain calls, makes dry-run-released jobs due at
    once, so Stage B need not wait.
- **Postflight (09:05:56 to 09:06:48):**
  - **V2 hidden:** `video_visible` false for anonymous viewers, T1 and the founder; `web_video`
    `unavailable`. The row is still `live` with its asset and playback id, as designed until the
    revocation.
  - **V2 at Mux, unchanged:** asset `ready` with exactly [`VpzPAAYF…` public]; HLS 200, thumbnail
    200.
  - **All 13 assets exist:** Beta 6 `6bbd4333…`, spike 7 `315652b2…`, both hashes unchanged. All 13
    playback ids answer 200.
  - **Protected:** `provider-check compare` against `baseline-e1` unchanged. T1's and the founder's
    accounts, rows, playback ids, ledgers and session ids are as before.
  - **Clean-up:** `off`, health `ok` with no problems. The only open job is `d7e245e3…`. 0 cron
    failures. Accounts: 3, 1 deleted (T2).
- **Two transient read failures, each retried once, read-only:**
  - `provider-check state` at 09:03 (empty error from the CLI);
  - Beta `playbacks` at 09:06 (connect timeout to Mux).
- **Next:** E1 Stage B, the live revocation, needs its own approval. It needs W1
  (`MUX_CLEANUP_MODE=live`), then `PROVIDER_WRITE_STEP=E1-live scripts/provider-drain.sh hosted live
  … d7e245e3-…`, then closing W1. Until then V2 plays at Mux for anyone who has its playback id; in
  the app and on the web it is hidden. No sign-in as T2 may happen before the live drain: it would
  turn the pending job into a restore.

## 44. E1 Stage B: V2's playback revoked through one guarded live window on hosted and real Mux (21 Oct 09:20 to 09:38 UTC; Nemat approved Stage B only)

From `6d64704`. One live window (W1), one guarded live drain of job `d7e245e3…`, one Mux change (V2's
playback id deleted). No sign-in, no E2 or E3, no other asset change, no deployment, migration or
push.

- **Job selection:**
  - **The worker cannot take a job id.** `mux_cleanup_claim` takes every due `pending` job, up to 10.
  - **What restricted it to one:**
    - `provider-drain.sh` sets the switch live, and in the same transaction refuses unless the due
      set is exactly {`d7e245e3…`}, then makes one drain request.
    - `mux_cleanup_set_mode('live')` re-dues only dry-run-released jobs, and this was the only one.
    - Every other job was `done` or `skipped`, so none could be claimed.
    - The every-minute `mux-cleanup` cron does nothing while the switch is `off`, and the drain
      starts just after a tick and turns the switch `off` before the next.
    - The daily sweep runs at 04:45.
  - **The remaining gap:** seconds between that check and the worker's claim. Nemat kept off the
    apps, so no new job could appear in it.
- **Preflight (09:20:58 to 09:23:02), all as expected:**
  - **T2:** deleted 09:02:55, 0 sessions, 0 live refresh tokens.
  - **The job:** the only open job is `d7e245e3…`. `sync_playback` / `account_deleted`, owner T2, V2's
    asset and response, 0 attempts, plan `revoke` [`VpzPAAYF…`].
  - **V2's row:** unchanged.
  - **Mux:** Beta 6, spike 7. All 13 playback ids 200/200, V2's included. V2's asset `ready` with
    [`VpzPAAYF…` public].
  - **Protected:** unchanged against `baseline-e1`. Fresh `baseline-e1b.json` (600).
  - **Clean-up:** `off`, health `ok`. Last worker run #11; `mux-cleanup` v14; 13 secrets, no
    `MUX_CLEANUP_MODE`.
- **W1 open:** Nemat ran `supabase secrets set MUX_CLEANUP_MODE=live`. The lead confirmed it at
  09:25: 14 secrets, `MUX_CLEANUP_MODE` present, `mux-cleanup` v15.
- **Live drain (09:25:20 to 09:26:21):** `PROVIDER_WRITE_STEP=E1-live scripts/provider-drain.sh
  hosted live "Nemat: E1 Stage B revocation" d7e245e3-…`.
  - Sent 09:26:08 (run #12).
  - Worker answer 200: `mode live, claimed 1, done 1`, with found_asset, retry, release, skipped,
    failed, stale and unrecorded all 0.
  - Database switch `off` again at 09:26:17.
- **Reconciled (09:29:39 to 09:29:46):**
  - **Job:** `d7e245e3…` `done`, `{"outcome": "revoked"}`, 1 attempt, finished 09:26:12.
  - **V2's row:** `mux_playback_id` null, asset kept.
  - **Mux API:** asset `xMQeMrW0…` `ready`, `playback_ids` `[]`.
  - **The old URL:** `VpzPAAYF…` HLS 404, thumbnail 404. This is backed by Mux's own record, not
    only a CDN answer.
- **W1 closed:** Nemat ran `supabase secrets unset MUX_CLEANUP_MODE`. The lead confirmed it at
  09:36: 13 secrets, no `MUX_CLEANUP_MODE` (nor `MUX_API_BASE` or `MUX_STREAM_BASE`), `mux-cleanup`
  v16 (each secret change bumps the version; the bundle is unchanged). The function's switch was
  set for about 11 minutes; the database switch was live only inside the drain, about 10 s.
- **Postflight (09:36:42 to 09:37:45):**
  - **Clean-up:** switch `off`, last changed by "Nemat: E1 Stage B revocation (finished)" at
    09:26:17. Health `ok`, no problems. 0 open jobs, 7 in all. No worker run after #12. 0 cron
    failures.
  - **Only V2's playback was revoked:**
    - Beta 6 assets, 5 playback ids, all 200/200: the 5 original assets each keep their one id.
    - V2's asset is `ready` with none.
    - Spike 7 assets, 7 ids, all 200/200.
    - So all 12 original playback ids work.
  - **Inventories:** Beta's hash is now `5f053d03…` (only V2's playback list changed); the protected
    hash of the other 5 is unchanged. Spike `315652b2…` unchanged. All 13 assets exist.
  - **Protected:** `provider-check compare` against `baseline-e1b` unchanged. T1's and the founder's
    accounts, rows, playback ids, ledgers and session ids are as before.
  - **T2:** still deleted (09:02:55), 0 sessions. 3 accounts.
- **Next:** E2 (T2 signs back in within 30 days; a new playback id for V2) needs its own approval. E2
  restores through a new sign-in only: `get_onboarding_state` on a session that began after
  09:02:55. E2 has its own dry run and live window.

## 45. E2: T2 restored and V2 given a new playback id on hosted and real Mux (21 Oct 09:51 to 10:07 UTC; Nemat's master instruction for E2 to E3b)

From `0030fd3`, on branch `claude/conga-mux-lifecycle-verify-9706a3`. Nemat authorised E2, E3a and E3b in
one instruction, scoped to T2 (`4fd43a83…`), V2 (`cec0cef7…`) and V2's asset (`xMQeMrW0…`), with the
stop conditions unchanged (`docs/DECISIONS.md`, 21 Oct). Writes: one sign-in code, the app's launch
call, one guarded dry run, one guarded live drain, one Mux change (a playback id created). No new
video, upload or asset. Nothing printed an address, code or token.

- **Preflight (09:51:23 to 09:52:40), all as at the end of section 44:**
  - **Hosted:** 28 migrations (`20261021000100`), 3 accounts and 3 Auth users, T2 deleted (09:02:55),
    3 invites, none unused. Switch `off`, health `ok`, 0 open jobs, 7 jobs in all, last worker run #12.
    0 purge failures, 0 cron failures in 24 h, 10 cron jobs active.
  - **T2:** 0 sessions; V2 `live`, asset `xMQeMrW0…`, no playback id.
  - **Mux:** Beta 6 (`5f053d03…`), spike 7 (`315652b2…`). V2's asset `ready` with `playback_ids` `[]`.
    The 12 original playback ids all HLS 200 and thumbnail 200.
  - **Secrets and functions:** 13 secrets, no `MUX_CLEANUP_MODE`, `MUX_API_BASE` or `MUX_STREAM_BASE`;
    9 functions `ACTIVE`, `mux-cleanup` v16.
  - **Protected:** unchanged against `baseline-e1b`. Fresh `baseline-e2.json` (600).
- **Sign-in:** `otp` (no `--create`) at 09:52:52, 200. Nemat ran `provider-member-verify.sh`. Checked
  locally: subject T2, issued 09:53:39 by `otp`, after the deletion.
- **Restore (09:54:14):** `provider-member.mjs sign-in-state` (`get_onboarding_state`, the app's launch
  call): 200.
  - T2 `deleted_at` null, 1 session (the new one).
  - Exactly one new job: `84a46233-4cbd-4a13-8636-1d87522fa70b`, `sync_playback` / `account_restored`,
    V2's asset and response, owner T2, due 09:54:14.
- **Dry run (09:55:06, run #13):** `PROVIDER_WRITE_STEP=E2-dry scripts/provider-drain.sh hosted dry_run
  "Nemat: E2 dry run" 84a46233-…`. Worker 200, `claimed 1, release 1`. Plan: `direction restore`,
  `owner_verified true`, `asset_status ready`, `public_playback_ids` `[]`, `would_create public`. Mux
  unchanged. Switch `off`.
- **Before live:** protected unchanged against `baseline-e2`; the only open job `84a46233…`.
- **Window:** Nemat set `MUX_CLEANUP_MODE=live`; confirmed 09:56:30 (14 secrets, `mux-cleanup` v17).
- **Live drain (09:57:06, run #14):** `PROVIDER_WRITE_STEP=E2-live … live "Nemat: E2 restoration"
  84a46233-…`. Worker 200, `claimed 1, done 1`, everything else 0. Switch `off` again.
- **Window closed:** Nemat unset it; confirmed 10:05:44 (13 secrets, no `MUX_CLEANUP_MODE`, v18).
- **Reconciled (not from the HTTP answer alone):**
  - **Job:** `done`, `{"outcome": "restored"}`, 1 attempt, finished 09:57:10.
  - **V2's row:** `live`, `mux_playback_id` `S8LOYjnM2OWKuwvkYSvIeS6i6X00O01md5at00TPzBI01mE`.
  - **Mux API:** asset `xMQeMrW0…` `ready`, the same `created_at` (`1792572826`), `playback_ids`
    exactly [`S8LOYjnM…` public]. One new id, no new asset.
  - **Playback:** `S8LOYjnM…` HLS 200, thumbnail 200. The old `VpzPAAYF…` still 404 and 404.
  - **Visibility:** `video_visible` true for anonymous viewers, T1 and the founder; `web_video` `live`.
- **Postflight (10:06):** protected unchanged against `baseline-e2`. Beta 6 assets, 6 ids, all 200/200
  (inventory `b33a8139…`); spike 7, `315652b2…`. 0 open jobs, 8 in all, last run #14, 0 deleted
  accounts, health `ok`, switch `off`.

## 46. E3a: T2 deleted a second time and the new playback id revoked (21 Oct 10:07 to 12:03 UTC; same instruction)

Writes: one sign-in code, T2's `delete_account`, one guarded dry run, one guarded live drain, one Mux
change (V2's playback id deleted). V2's asset kept.

- **Preflight:** section 45's postflight. Fresh `baseline-e3a.json` (600). A private copy of the E2
  token was kept to test its revocation, then deleted.
- **Sign-in:** `otp` at 10:09:04, 200; Nemat entered the code. Token: T2, a new session, issued 10:09:31.
- **Deletion (10:10:05):** `delete-account`, 204, 34 s after the sign-in. 0 open jobs and 0 push tokens
  before it.
- **Results:**
  - **T2:** `deleted_at` 10:10:06.623. Auth sessions 0, live refresh tokens 0.
  - **Tokens:** `sign-in-state` with the deletion's token and with the E2 token: both 403
    `session_revoked`. `deleted_at` stayed set.
  - **Hidden:** `video_visible` false for anonymous viewers, T1 and the founder; `web_video`
    `unavailable`.
  - **Exactly one new job:** `2fff1d4d-910c-40cb-8ebe-706e72a84342`, `sync_playback` /
    `account_deleted`, V2's asset and response, owner T2. 9 jobs in all.
- **Dry run (10:11:06, run #15):** `claimed 1, release 1`. Plan: `direction revoke`, `owner_verified
  true`, `would_revoke` exactly [`S8LOYjnM…`]. No other asset.
- **Gap:** the window opened about 90 minutes after the dry run. The job's one-hour release ended at
  11:11, so it was simply due. A fresh check at 11:44 showed nothing had moved: the only open job
  `2fff1d4d…`, last worker run still #15, T2 deleted with 0 sessions, protected unchanged against
  `baseline-e3a`.
- **Window:** confirmed open 11:43:59 (14 secrets, v19).
- **Live drain (11:46:06, run #16):** `PROVIDER_WRITE_STEP=E3a-live … "Nemat: E3a revocation"
  2fff1d4d-…`. Worker 200, `claimed 1, done 1`. Switch `off`.
- **Window closed:** confirmed 12:00:38 (13 secrets, no `MUX_CLEANUP_MODE`, v20).
- **Reconciled:**
  - **Job:** `done`, `{"outcome": "revoked"}`, 1 attempt, finished 11:46:10.
  - **V2's row:** `mux_playback_id` null, asset kept.
  - **Mux API:** asset `xMQeMrW0…` still `ready`, same `created_at`, `playback_ids` `[]`.
  - **Playback:** `S8LOYjnM…` HLS 404, thumbnail 404.
- **Postflight (12:03):** protected unchanged against `baseline-e3a`. Beta 6 assets, 5 ids, all
  200/200; the only asset without an id is V2's. Spike 7/7, all 200/200. 0 open jobs, 9 in all, 1
  deleted account (T2).

## 47. E3b: T2 permanently deleted by hand and V2's asset deleted at Mux (21 Oct 12:03 to 12:28 UTC; same instruction)

Outcome **E3(ii)** (`PROVIDER-SESSION.md` section 0, rule 2): the same-day manual Auth-user deletion
(`account_removed`). **It does not verify the scheduled purge** (E3(i), `account_purged` at 03:15 on
day 31), which has still not run against a deleted account on hosted.

- **Ownership, just before (12:03):**
  - **Database:** Auth user T2 (confirmed, 1 email identity), soft-deleted 10:10:06. V2 is the only row
    on asset `xMQeMrW0…` and the only row of T2. Its author is T2, with 0 replies and 0 comments. Upload
    `cZN6ajHr…` is `claimed` by T2.
  - **Mux:** passthrough T2, `upload_id` `cZN6ajHr…`.
  - **Baseline:** `baseline-e3b.json` (600), equal to `baseline-e3a`.
  - **Expected:** by `accounts_before_delete` → `prepare_account_removal(…, 'account_removed')`,
    exactly one `delete_asset` for V2's asset and no `cancel_upload` (the upload is claimed).
- **Deletion:** Nemat deleted user `4fd43a83…` in the Dashboard (Authentication, Users), after
  checking the address was T2's alias. No error. Its job was created at 12:11:33.
- **Verified (12:15):**
  - **T2 gone:** 0 Auth users, identities, sessions, accounts, profiles, place follows, ledger rows and
    submissions for T2. V2's row deleted (not kept: nobody else replied to it). 0 purge failures.
  - **Totals:** 2 accounts, 2 Auth users.
  - **The invite fix on hosted:** the deletion succeeded where it failed before `20261021000100`.
    T2's invite `eaf264e9…` keeps `redeemed_at` 08:35:04, `redeemed_by` null, not cancelled. 3 invites,
    0 unused, so it stays consumed.
  - **Exactly one new job:** `d0023eed-d912-478a-9d95-4780d8379945`, `delete_asset` / `account_removed`,
    asset `xMQeMrW0…`, upload `cZN6ajHr…`, response V2, owner T2, due at once. 10 jobs in all.
- **A slip (read-only intent, small write):** the check called the rate-limited `invite_lookup`, which
  counts a `used` answer as a failed attempt. It added two `rate_limit_counters` rows at 1 hit each:
  `invite_client` (1 of 10, 15 minutes; the Management API's address) and `invite_stem` (1 of 100,
  one hour; T2's code stem). They expire on their own and touch no member; left as they are. Later
  checks use `invite_lookup_unlimited` or `redeemed_at`.
- **Dry run (12:18:06, run #17):** `claimed 1, release 1`. Plan: `act delete`, `asset_id xMQeMrW0…`,
  `upload_id cZN6ajHr…`, `owner_verified true`. Then V2's asset still `ready`, and protected unchanged
  against `baseline-e3b`.
- **Window:** confirmed open 12:22:07 (14 secrets, v21). The only open job was `d0023eed…`, with no run
  after #17.
- **Live drain (12:23:21, run #18):** `PROVIDER_WRITE_STEP=E3b-live … "Nemat: E3b asset deletion"
  d0023eed-…`. Worker 200, `claimed 1, done 1`. Switch `off`.
- **Window closed:** confirmed 12:26:12 (13 secrets, no `MUX_CLEANUP_MODE`, `MUX_API_BASE` or
  `MUX_STREAM_BASE`). Every function is 6 versions up since 09:51, one per secret change; no bundle
  changed (`mux-cleanup` v22).
- **Reconciled:**
  - **Job:** `done`, `{"outcome": "deleted"}`, 1 attempt, finished 12:23:24.
  - **Mux API:** `GET` asset `xMQeMrW0…` 404, "Asset not found". Beta lists 5 assets, V2's not among them.
  - **Playback:** `VpzPAAYF…` and `S8LOYjnM…` both HLS 404 and thumbnail 404.
- **Final postflight (12:27):**
  - **Protected:** unchanged against `baseline-e3b`, `baseline-e2` and `baseline-cp0a` (taken before T2
    existed). T1: 7 rows (4 live), 5 sessions, same session ids. Founder: 2 rows (1 live).
  - **Mux:** Beta 5 assets, `2fee7234…`, the same inventory hash as before CP0′-b; 5 ids, all 200/200.
    Spike 7, `315652b2…`; 7 ids, all 200/200. 0 assets with T2's passthrough.
  - **Hosted:** 28 migrations. 2 accounts, 2 Auth users, 0 deleted. 3 invites, 0 unused. Switch `off`,
    health `ok`, 0 open jobs; jobs 10 (9 `done`, 1 `skipped`); last run #18. 0 purge failures, 0 cron
    failures. No row references T2.
  - **Scheduled purge:** `purge-deleted-accounts` (`15 3 * * *`) active; last run 21 Oct 03:15,
    `succeeded`, with no deleted account to purge.
  - **Local:** `t2.token` deleted. Left in `~/.conga-provider` (600): the address, id, used invite
    code, `respond` journal (an upload URL for an upload already used), `t2.v2.json` and the baselines.
- **Transient read failures, each retried once, read-only:** at about 12:04, `provider-check save`
  (an empty error from the CLI, then a spike Mux read); at 12:18, a Mux `GET` (connect timeout).
- **Not verified:**
  - **E3(i), the automatic purge on hosted.** It needs a deleted account left for 30 days and the 03:15
    run on day 31. It was rehearsed locally (section 39). The manual path proves the asset deletion
    and the trigger, not the timer or `purge_deleted_accounts()` itself on hosted.
  - The app on a device: every step went through the app's endpoints from scripts.
  - The web player for V2 over HTTP (only `web_video` in SQL).
- **Time:** 09:51:23 to about 12:28 UTC, about 2 h 37 min of wall-clock time. About 1 h 30 min of it
  (10:11 to 11:43) was waiting for the E3a window. The rest included waits for codes and secret
  changes. Active working time was not measured separately.
- **E1 to E3 status:** E1, E2 and E3a passed; E3(ii) passed; E3(i) is open.

## 48. Mux clean-up left on unattended: built and tested locally, rollout plan ready (21 Oct; nothing hosted, no Mux, no push)

Branch `claude/conga-mux-production-ready-2aad5b`, based on `2832e8a` (lifecycle-verify, which
already contains `provider-t2-tooling` and `invite-account-deletion-fix`). Commits `21b5892`,
`813edb8` and `90c3e8d`. Design, operations and the rollout are in
`docs/release/MUX-CLEANUP-UNATTENDED.md`.

- **Reconciliation:**
  - The worker, its schedules (drain every minute, sweep at 04:45, monitor every 10 minutes) and
    the health check were already built and deployed (`mux-cleanup` v22, 28 migrations). They were
    switched off, and ran only in supervised windows.
  - No hosted migration is missing from source: the 28 match `inv-expected-28-migrations.fp`, and
    the local 28-migration schema equals that listing.
  - `rollback-check-27` holds 2 docs and tooling commits about the migration rollback check. They
    have nothing to do with clean-up and are left out.
  - Hosted was not re-read this session (a read with the approval flag set by the lead was refused
    by the permission classifier). The figures above are section 47's; U0 re-reads them.
- **Missing for unattended use, now built:** migration `20261021000200_cleanup_unattended.sql`
  (md5 `710ac9518ecc255062e4cf3615014db9`). The worker's code is unchanged.
  - **U1, a deletion cap with a latch.** At most N asset deletions in 24 hours; then deletions pause
    until a person resumes them. Revocations, restores and cancellations continue.
  - **U2, new health checks:**
    - `worker_not_live`: the switch live while `MUX_CLEANUP_MODE` is not, which no check saw
      before;
    - `deletions_paused`, `retrying_jobs`, `no_deletion_cap`, `alerts_not_configured` and
      `alert_not_delivered`;
    - the two new schedules.
  - **U3, email alerts** through Resend:
    - sent on a change, with a reminder every 24 hours and a recovery message;
    - a weekly status as a dead-man signal;
    - check names, counts and times only.
  - **An audit log** of every change to the settings.
- **Also fixed:** `scripts/provider-sql.sh` classified `mux_cleanup_alert()`, the cap and the resume
  as reads.
- **Tests:** isolated stack `shortcut-mxp`, with fake Mux and fake Resend only.
  - pgTAP 1885/1885 (110 new).
  - Cleanup integration 37/37, 9 of them new: lost answers after Mux acted, for each of the four
    writes; the switch off mid-call; the cap; a worker not live; forged deletions of the founder's
    asset.
  - Alert end to end (pg_cron, pg_net, fake Resend) 4/4.
  - Scheduler 13/13. Provider rehearsal 8/8 and 15/15. Unit 11/11 and 22/22.
  - Rollback rehearsed: the schema afterwards equals the 28-migration fingerprint.
  - One run of the T2 rehearsal failed on state left by earlier suites on the same stack. On a reset
    stack it passed.
- **Independent review** (a second agent, reading only): no bypass of the cap and no stuck work.
  Six low-impact bugs were found (a false alert right after going live, an unlocked settings read
  in the claim, lost-answer deletions not counted, in-flight retries pausing deletions, a flapping
  warning, a rollback that could refuse). All were fixed in `90c3e8d`.
- **Not run:** anything on hosted, real Mux or real Resend; a device.
- **Scheduled purge E3(i): still not passed.** What would verify it, and why it should not block the
  closed beta, is in section 7 of the runbook. That is Nemat's decision.
- **Next:** one approval for rollout U0 to U5 (runbook section 4).

## 49. Mux clean-up left on unattended on hosted: rollout U0 to U5 (21 Oct 14:36 to 16:25 UTC; Nemat approved U0 to U5 with cap 2)

From `a17d89c` on `claude/conga-mux-production-ready-2aad5b` (local commits only, not pushed). Every read
went through `scripts/cleanup-unattended-hosted-check.sh` or plain selects through
`scripts/provider-sql.sh`. Every write was a guarded step through `provider-sql.sh` with
`PROVIDER_WRITE_STEP=U<n>`.

The access restriction that had stopped the hosted read on 21 Oct (section 48) is resolved: with
Nemat's approval in the session, the reads ran.

**No account, invite, video, upload or Mux asset was created. Nothing was deleted at Mux.** No Edge
Function was deployed. T1, the founder and the spike were not touched.

- **U0, preflight (14:36, all PASS, the actual hosted state):**
  - **Schema:** 28 migrations, the fingerprint equal to `inv-expected-28-migrations.fp`.
  - **Clean-up:** switch `off`, health `ok`, 0 open jobs (10 in all: 9 `done`, 1 `skipped`).
  - **Accounts:** 2 accounts and 2 Auth users, 0 deleted, 0 purge failures.
  - **Schedules:** 10, all active; 0 cron failures in 24 hours.
  - **Worker:** `mux-cleanup` v22.
  - **Secrets:** 13. No `MUX_CLEANUP_MODE`, `MUX_API_BASE` or `MUX_STREAM_BASE`. The worker's Mux
    token is Shortcut Beta's by digest, not the spike's.
  - **Protected baseline:** `baseline-u0.json` (mode 600), with Beta 5 `2fee7234…` and spike 7
    `315652b2…`. All 12 playback ids returned 200 for HLS and thumbnail.
  - **Reconciliation:** `mux-reconcile.mjs` returned `ok`: 5 in use, no candidates.
  - **Backup:** the settings row and the 10 jobs, sha256 `3581bc2d…`, saved to
    `~/.conga-provider/backups/cleanup-before-20261021000200-20261021T144040Z.json` (mode 600).
- **U1, the migration:**
  - The dry run listed exactly `20261021000200_cleanup_unattended.sql` (md5 `710ac951…`).
  - Applied 14:41:52 to 14:41:55.
  - `check post`, all PASS:
    - 29 migrations, the fingerprint equal to `cu-expected-29-migrations.fp`;
    - 12 schedules; switch `off`, no cap, health `ok`;
    - the only table that changed is `mux_cleanup_settings` (three new null columns), and the new
      tables are empty;
    - functions unchanged.
- **U2, alerts:**
  - **Secrets:** Nemat created a Resend sending-only key (`auth.churntech.com`) and put the key,
    the recipient (one address) and the sender `Conga ops <alerts@auth.churntech.com>` into Vault.
  - **A placeholder slip:** Nemat's first run stored the placeholder text. Nothing was sent with it
    (0 messages; health `ok`). The three secrets were deleted and recreated at 15:02:35.
  - **Checked without reading the values:** non-empty, the key `re_…`, the recipient a single
    address, the sender as above.
  - **Messages, all answered 200 by Resend with a message id; Nemat confirmed all three arrived:**

    | Time (UTC) | Message | Sent by |
    |---|---|---|
    | 15:03:52 | the test | the lead |
    | 15:05:00 | `warn (alert_not_delivered)` | the schedule |
    | 15:35:00 | `recovered, status ok` | the schedule, after its 30-minute wait |

  - **The delivery failure was synthetic.** A labelled `mux_cleanup_alerts` row recorded a 401.
    Health then showed `warn alert_not_delivered`. The row was removed after the alert was sent. This
    checks the health check and the alert path, not a real Resend refusal.
- **U3, going live:**
  - **a.** Cap 2 at 15:08. It counts 1 already: the E3b deletion at 12:23 today. Until about 12:23
    UTC on 22 Oct, one more deletion can run before deletions pause.
  - **b.** `MUX_CLEANUP_MODE=live` at 15:45 (the lead's shell could write it). 14 secrets, the
    digest of `live`. Every function went up one version with identical bundles (`mux-cleanup` v23,
    `5adecf46…`).
  - **c.** Guarded dry-run sweep at 15:49 (request 22): 200, `mode dry_run`, `listed 5`,
    `complete`, `in_use 5`, `queued 0`, `review 0`, nothing it would queue or review.
  - **d.** Guarded `live` at 15:49:50.
  - **e.** Live sweep (request 23): 200, `mode live`, `listed 5`, `in_use 5`, `queued 0`,
    `review 0`. This verifies the function's switch and the configuration. **It proves no provider
    write**; that evidence remains the earlier real lifecycle tests (12 Oct, A2, B2, C2a, C2w, E1 to
    E3b).
- **U4, emergency stop and observation:**
  - **Drill, with no job queued:**
    - The switch was `off` from 15:50:46 to 15:52:09.
    - The drain schedule ran twice, both succeeded, and neither it nor an explicit sweep request
      reached the worker (0 requests).
    - Back to `live`.
    - All five switch changes are in `mux_cleanup_settings_log` with who made them.
    - Not run on hosted: unsetting `MUX_CLEANUP_MODE` (the second layer) and a stop during a live
      call. Both are tested locally.
  - **Observed 15:52 to 16:25 (33 minutes):**
    - `mux-cleanup` 32/32 succeeded, one per minute. No worker call, since nothing was due.
    - `mux-cleanup-monitor` 3/3 and `mux-cleanup-alert` 3/3, with no message while `ok`.
    - Health `ok` throughout.
    - Jobs: 0 created, 0 pending, running, failed, for review or retrying.
  - **`check live`, all PASS:** switch `live`, cap 2, not paused, 3 alert secrets, no URL override.
  - **Data:** every product table hash equal to U1's.
  - **`provider-check compare`:** `unchanged`, 0 differences (T1, the founder, Beta 5, spike 7).
  - **Playback:** all 12 ids 200/200.
- **U5, left on:**
  - database switch `live`, `MUX_CLEANUP_MODE=live`;
  - cap 2 per 24 hours (1 counted), alerts to Nemat;
  - 12 schedules, `mux-cleanup` v23.
- **Not yet observed on hosted:**
  - the first scheduled 04:45 sweep while live;
  - the first weekly status (Monday 27 Oct, 02:00 UTC);
  - a real deletion, revocation or restore by the unattended worker (no job has existed since
    going live);
  - the cap pausing a real deletion;
  - a real Resend refusal.
- **Still not passed:** E3(i), the scheduled day-31 purge (runbook section 7). No account was
  created for it.
- **Time, wall clock:**
  - Local build and tests: about 1 h 05 min.
  - Rollout: 14:36 to 16:25 UTC, about 1 h 49 min. About 20 minutes of it waited for the Resend
    secrets, about 30 minutes for the recovery email's throttle, and 33 minutes were the
    observation.
  - Active working time was not measured separately.

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
