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
| Hosted Supabase project (`picvoavfxnajfjkqawju`) | needs input (migrations applied 9 Oct) | Done 9 Oct (section 9): the 12 migrations `20261006000100` to `20261010000200` applied with `supabase db push`, schema verified equal to the local stack. Still open: Edge Functions deployed with their env (Mux functions only after dedicated product Mux credentials), the `send-push` Vault secrets, Auth configuration and the auth hardening migration (section 10; nothing pushed), reference data that today only exists in `seed.sql` (topics, the other places, place neighbours), the app's `.env` pointed at it. | pgTAP is local-only; the check is the device run in section 3 against the hosted project. |
| Mux credentials for the hosted project | needs input | Token and webhook secret in the function env; uploads minted server-side only. On 9 Oct the hosted `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` were the same pair as the spike's and the product's local `.env` (digest comparison), so the product needs its own Mux credentials; not rotated yet (section 8). | A posted response goes live through the hosted stack. |
| Email provider for sign-in codes and waitlist emails | needs input (provider decided: Resend, Nemat 9 Oct) | A sending domain that is not a Conga domain; the Resend account, its DNS records (SPF, DKIM, bounce MX, then DMARC) and a send-only API key; the SMTP settings on the hosted project (section 10). Free plan: 100 emails a day, 3,000 a month. | A code arrives within a minute on Gmail, Outlook, iCloud and a Bali address; a waitlist admission email arrives. |

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

## 10. Email sign-in (local only, 9 Oct; nothing applied to the hosted project)

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
- `auth-signin-method` accepts only the legacy anon key, which the hosted project still issues and
  the app uses. Moving the app to a publishable key needs this function changed and tested first.
- The hook is in every sign-in: if it errors, nobody can sign in. It is small and tested; the order
  below matters.
- The email copy below awaits Nemat's approval.

**Proposed email** (all three templates; sender name and address come with Resend):

> Subject: Your Shortcut sign-in code
>
> **Your Shortcut sign-in code**
> Enter this code in the app to sign in:
> **123456**
> The code expires in one hour.
> If you didn't ask for this code, you can ignore this email.

**Hosted steps, in order, each waiting for Nemat's approval** (none run):

1. `supabase db push --dry-run`, then `supabase db push`: only `20261010000300_auth_hardening.sql`.
2. `supabase config diff --project-ref picvoavfxnajfjkqawju`, then `supabase config push`. The diff
   (through `[remotes.hosted]`) shows only: OTP length 8 to 6; confirmation, magic link and
   recovery subjects (and their content); the access token hook on; TOTP MFA off; site URL
   `http://localhost:3000` to `shortcut://`; redirect URL `shortcut://auth/callback`. Confirm
   email (on), 60 s and the expiry already match; Apple and Google stay off; pooler and storage
   unchanged.
3. `supabase functions deploy auth-signin-method` (no secrets of its own; `verify_jwt = false` from
   `config.toml`).
4. Resend SMTP on the hosted project (Nemat), then the email rate limit, then the delivery check.

## Gates

- **Gate 1** (video provider and camera library picked): open. Mux and expo-camera are the
  provisional stack on the iPhone spike evidence (`docs/DECISIONS.md`, 6 Oct). Closes only when Nemat
  approves it; the Android spike run (section 3) has not happened.
- **Gate 2** (Nemat can sign up on iOS and Android): open. Depends on phase 2 on a real iPhone and a
  real Android against the hosted project (sections 2 and 3).
- **Gate 5** (safety complete, before any outside tester): open. Depends on sections 3 (phase 5 on
  a device), 4 (guidelines), 7 (the web admin) and B-2.
- **Gate 7** (the closed beta opens in Canggu): open. Depends on everything above.
