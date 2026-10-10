# Beta readiness: everything still open before the closed beta

Consolidated from `docs/BLOCKERS.md` (B-1 to B-4 and the Gate 5 list), the phase reports and
`docs/DECISIONS.md`, as of 9 Oct 2026. Phase 1 (the video spike) ran on a real iPhone 17 Pro; its
Android run is outstanding, and Mux and expo-camera are the provisional stack. Every phase from 2 to 7
is **implemented, awaiting real-device verification**. No gate has been passed: Gate 1, Gate 2,
Gate 5 ("safety complete; required before any outside tester") and Gate 7 ("the closed beta opens
in Canggu") are all open and are Nemat's decisions. Nothing below is marked done unless its check has actually been run; "seen on the
simulator" is not "verified on a device".

Status words: **open** (nothing done), **built, unverified** (code exists, the check has not been
run on a device), **needs input** (waits on something outside the repository).

## 1. Code remaining

| Item | Status | What is left | Check that closes it |
| --- | --- | --- | --- |
| B-1 Camera flip during a take (SPEC.md Section 6; Nemat, 6 Oct) | open | The recorder records one segment per camera and a local module stitches them (iOS `AVMutableComposition`, Android Media3 `Transformer`); upload stitches before sending; review plays the stitched file. The flip control is disabled while recording today and nothing pretends otherwise. | Real iPhone and Android: record, flip twice mid-take, stop; review and the live response play one continuous clip with sound across the joins. |
| B-3 app-link wiring in the app | needs input, then code | `associatedDomains` and `intentFilters` in `app.config.ts`, `EXPO_PUBLIC_WEB_BASE_URL` set to the domain, the two association files served (see section 6). | Part of the B-3 check in section 6. |
| Settings rows with no destination | needs input, then code | Community guidelines, Privacy policy, Terms, Help and feedback rows and the `A-Removed` guideline link are drawn and inactive; they are wired once the URLs or address exist (section 4). | Each row opens its document; `A-Removed` opens the guidelines. |
| Moderation web admin | open | A small internal web admin over the `mod_*` functions (queues, actions, the log, suggestion review). The CLI `scripts/moderate.sh` is development-only. See section 7. | A moderator handles a report, a review request and a suggestion from the admin without the CLI. |
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
| Hosted Supabase project (`picvoavfxnajfjkqawju`) | needs input (13 migrations applied 9 Oct) | Done 9 Oct (section 9): the 12 migrations `20261006000100` to `20261010000200` applied with `supabase db push`, schema verified equal to the local stack. Done 9 Oct (section 10, hosted steps 1 and 2): the auth hardening migration `20261010000300`, and the Auth configuration with the access token hook on, 6-digit codes and the code-only emails. Still open: Edge Functions deployed with their env (Mux functions only after dedicated product Mux credentials), the `send-push` Vault secrets (`auth-signin-method` deployed 10 Oct, section 10), reference data that today only exists in `seed.sql` (topics, the other places, place neighbours), the app's `.env` pointed at it. | pgTAP is local-only; the check is the device run in section 3 against the hosted project. |
| Mux credentials for the hosted project | needs input | Token and webhook secret in the function env; uploads minted server-side only. On 9 Oct the hosted `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` were the same pair as the spike's and the product's local `.env` (digest comparison), so the product needs its own Mux credentials; not rotated yet (section 8). | A posted response goes live through the hosted stack. |
| Email provider for sign-in codes and waitlist emails | needs input (provider decided: Resend, Nemat 9 Oct) | A sending domain that is not a Conga domain; the Resend account, its DNS records (SPF, DKIM, bounce MX, then DMARC) and a send-only API key; the SMTP settings on the hosted project (section 10). Free plan: 100 emails a day, 3,000 a month. 9 Oct: domain `auth.churntech.com` verified in Resend and SMTP saved in the hosted dashboard by Nemat (sender `no-reply@auth.churntech.com`, name Shortcut); no email delivered or checked yet. | A code arrives within a minute on Gmail, Outlook, iCloud and a Bali address; a waitlist admission email arrives. |

## 3. Real-device verification

No phase 2 to 7 build has run on a physical phone. The only real-device runs are the phase 1 spike's
(a throwaway app in `spike/`) on an iPhone 17 Pro, `spike/REPORT.md`. Android has never been run at
all (no device, no emulator), for the spike or the app.
Each phase report lists what was seen on the iPhone 17 simulator and what was not.

| Phase | Status | Not yet run anywhere |
| --- | --- | --- |
| 1 Video spike (`spike/REPORT.md`) | iPhone run on a device; Android open | The spike checklist (`spike/CHECKLIST.md`) on a real mid-range Android over Bali mobile data, needed for Gate 1. |
| 2 Foundations (`docs/PHASE-2-REPORT.md`) | built, unverified | Google sign-in; Apple sign-in on a device; the invite link redeemed after sign-in; the image picker; keyboard behaviour; Android entirely. |
| 3 Core loop (`docs/PHASE-3-REPORT.md`) | built, unverified | Recording, posting and playback on a phone over mobile data; B-1. |
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
only be in Logs Explorer). Mux tokens not rotated yet. The spike app's clean-up, upload and status
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
  sign-in (no credentials), push, posting video (no Mux on the hosted project), the invite step
  (no invite exists). The free profile expires after 7 days; rebuild with the script.
- **Going back to the regular project:** `ios/` now holds the founder project; run
  `npx expo prebuild --clean` with the normal `app/.env`.

## Gates

- **Gate 1** (video provider and camera library picked): open. Mux and expo-camera are the
  provisional stack on the iPhone spike evidence (`docs/DECISIONS.md`, 6 Oct). Closes only when Nemat
  approves it; the Android spike run (section 3) has not happened.
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
