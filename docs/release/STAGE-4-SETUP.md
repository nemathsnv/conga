# Stage 4 setup: everything still needed outside the repository

**Updated 17 Oct 2026 for Agent G's `WEB-HOSTING.md`**: the shared-link pages and the admin go on **Cloudflare Pages** (prepared in `web/`, not deployed), not behind the Supabase custom-domain add-on, and Nemat said not to buy the add-on yet. So the **Supabase Pro plan is no longer required for the domain** (it stays an optional plan decision for backups and no pausing), the **domain stays required**, and a **free Cloudflare account** is added. `CUSTOM-DOMAIN.md` is the superseded comparison.

One consolidated checklist, written 17 Oct 2026 from `RELEASE-CHECKLIST.md` stage 4, `IOS.md`, `ANDROID.md`,
`NOTIFICATIONS.md`, `SECURITY.md` section 5, `CUSTOM-DOMAIN.md`, `BUILD.md`, `PROVIDER-TESTS.md` and
`BETA-READINESS.md` sections 21 to 28. **Nothing here has been done.** No account was created, nothing was bought,
registered, enrolled or pushed, and no value was ever asked for: every item says where a value will go, never what it is.

**Rules that apply to every item**

- Nemat (or whoever he names) creates every account and every credential. Agents prepare and document; they do not
  enrol, buy, sign in to Apple, Google, Expo or Resend, or paste a key anywhere.
- A secret is never written in chat, a commit, a doc or a log. It goes only to the place named in "where it goes".
  Files that hold secrets are git-ignored (`.env`, `.env.*` except `.env.example`, `*.p8`, `*.p12`, `*.key`, `*.pem`,
  `*.mobileprovision`, `google-services.json`).
- The app bundle gets public values only (`EXPO_PUBLIC_*`, the project id, client ids). A service-role key, a
  provider secret, an APNs key or a Mux token never goes in the app.
- Details of third-party consoles change. Steps below are the sequence and the intent; where a console label is a
  guess it says **(verify)**.

**Legend.** *Beta*: **REQUIRED** = the closed beta cannot open without it (Gates 2, 5, 7); **OPTIONAL** = can wait.
*iPhone-only*: whether it is needed if the first outside beta is **iPhone-only** (Android never built or run, so
that is a real option; SPEC.md says iOS and Android, so choosing it is Nemat's decision). *Kind*: credential, paid
account, provider setting, device, decision.

---

## 0. Dependency map

```
Decisions: name + bundle id/package + seller type ──┐
                                                     ▼
Expo account (free) ─► eas init ─► project id ──────────────────────────────────────┐
Apple Developer Program (paid) ─► App ID capabilities ─┬─► APNs key ─► uploaded to Expo ─► push (iOS)
                                   │                   ├─► EAS-managed signing (cert + profile) ─► preview / production builds
                                   │                   └─► App Store Connect record ─► eas submit ─► TestFlight
                                   ├─► Sign in with Apple, native (bundle id only) ─► Supabase Apple provider
                                   └─► [Android web flow only] Services ID ─► key ─► client-secret JWT ─► supabase/.env
Domain (bought) ─► Cloudflare account (free) + the domain's DNS on Cloudflare ─► Pages project `shortcut-web` ─► Pages secrets
   (SUPABASE_ANON_KEY, WEB_PROXY_KEY) ──┐                                    └─► custom domains `<domain>` and `admin.<domain>` ─► EXPO_PUBLIC_WEB_BASE_URL
   Supabase: same WEB_PROXY_KEY as a function secret ─► redeploy `web` ◄─┘
   Auth stays on `picvoavfxnajfjkqawju.supabase.co`, so the Services ID return URL and Google redirect URI do NOT wait for the domain
   Apple Team ID (from the Developer Program) ─► `.well-known/apple-app-site-association`;  signing SHA-256s ─► `.well-known/assetlinks.json`
Supabase Pro (optional, Nemat decides): backups, no pausing. Not needed for the domain any more.
Google Cloud project ─► consent screen ─► web client ─► iOS client (+ URL scheme) ─► Supabase Google provider
   └─► [Android only] Android clients with SHA-1s (need the EAS keystore, which needs the first Android build)
Firebase ─► google-services.json + FCM service account ─► Expo (Android push only)
Resend domain (done 9 Oct) ─► deliverability checks ─► Apple relay-domain registration (needs the Apple team)
Mux paid plan ─► (nothing else waits on it, but the free plan caps at 10 assets and 9 may already be used)
```

## 1. All items at a glance

| ID | Item | Kind | Beta | iPhone-only | Who | Where it goes | Depends on | Unblocks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Accounts and payments** | | | | | | | | |
| S1 | Expo account (free) | account | REQUIRED | yes | Nemat | Expo dashboard | none | P1, builds |
| S2 | Apple Developer Program | paid account | REQUIRED | yes | Nemat | developer.apple.com | D1 (seller), name | all of Apple, TestFlight, push |
| S3 | Google Play Console account | paid account | OPTIONAL | no | Nemat | play.google.com/console | D1 | Android internal/closed tracks |
| S4 | Google Cloud project | account | REQUIRED if Google sign-in ships | yes (iOS client) | Nemat | console.cloud.google.com | none | G1 to G3 |
| S5 | Firebase project | account | OPTIONAL | no | Nemat | console.firebase.google.com | S4 optional | Android push |
| S6 | Supabase Pro plan | paid plan | **OPTIONAL: Nemat decides.** Reasons: backups (none at the 9 Oct check), no project pausing, support. No longer needed for the domain | yes | Nemat | Supabase dashboard billing | none | backups for the policies (B2) |
| S7 | Mux paid plan (card on file) | paid plan | REQUIRED | yes | Nemat | Mux dashboard billing | none | more than 10 assets |
| S8 | Domain name (apex or a subdomain) | paid account | REQUIRED (web pages, admin) | yes | Nemat | a registrar; DNS on Cloudflare (needed for the apex; a subdomain can be a CNAME) | D2 name | W1 to W9 |
| S9 | Resend plan | account | already exists; upgrade OPTIONAL | yes | Nemat | Resend dashboard | none | email volume |
| S10 | Cloudflare account (free plan) | account | REQUIRED (web pages, admin) | yes | Nemat | dash.cloudflare.com; `npx wrangler login` on the Mac | none | W2 to W7 |
| **Decisions** | | | | | | | | |
| D1 | Seller: individual or company | decision | REQUIRED | yes | Nemat | Apple/Google enrolment; policies `[Company legal name]` | none | S2, S3 |
| D2 | Product name, bundle id `app.shortcut`, package `app.shortcut` | decision | REQUIRED | yes | Nemat | `app.config.ts`, Apple, Google, App Store Connect | none | A2, A9, G3 |
| D3 | Reviewer access plan for Apple/Google review | decision | REQUIRED before external TestFlight | yes | Nemat | App Review notes | A9 | external TestFlight |
| D4 | `STORE_URL`, `WAITLIST_URL` | decision | REQUIRED before the web pages go public | yes | Nemat | Supabase function secrets | A9 (store URL) | W6 |
| D5 | Retention periods, backups plan, moderators, scanner yes/no | decisions | REQUIRED for the policies | yes | Nemat | `docs/policies`, `DECISIONS.md` | none | policy publication |
| D6 | Whether the first beta is iPhone-only | decision | REQUIRED | n/a | Nemat | `DECISIONS.md` | none | scope of this file |
| **Apple** | | | | | | | | |
| A1 | Enrol in the Developer Program | paid account | REQUIRED | yes | Nemat | developer.apple.com | S2, D1 | A2 onward |
| A2 | App ID `app.shortcut` with Sign in with Apple and Push | provider setting | REQUIRED | yes | EAS or Nemat | Apple Developer, Identifiers | A1, D2 | A3 to A5 |
| A3 | Register the iPhone (UDID) for ad hoc builds | device | REQUIRED for `preview` | yes | Nemat | EAS (`eas device:create`) | A1, S1 | V1 install |
| A4 | APNs key (`.p8`) uploaded to Expo | credential | REQUIRED for push | yes | Nemat | Expo credentials (`*.p8` never in git) | A1, S1, P1 | P4 push |
| A5 | EAS-managed distribution certificate and profile | credential | REQUIRED | yes | EAS on Nemat's Apple login | Expo credentials | A1, S1 | builds |
| A6 | Sign in with Apple, native: Supabase Apple provider | provider setting | REQUIRED | yes | Nemat | `supabase/.env` then `config push` | A2 | Gate 2 (iOS) |
| A7 | Services ID, key and client-secret JWT | credential | OPTIONAL | **no** (Android web flow only) | Nemat | `supabase/.env` then `config push` | A1, A6 (no wait for the domain: Auth stays on `supabase.co`) | Apple sign-in on Android |
| A8 | Hide My Email relay: register the sending domain | provider setting | REQUIRED if Apple users get waitlist emails | yes | Nemat | Apple Developer, "Sign in with Apple for Email Communication" (verify) | A1, E1 | admission emails reach relay addresses |
| A9 | App Store Connect app record | provider setting | REQUIRED for TestFlight | yes | Nemat | appstoreconnect.apple.com | A1, D2 | A10, A12 |
| A10 | `ascAppId` in `eas.json` submit block | repo edit after A9 | REQUIRED for `eas submit` | yes | Agent F on request | `app/eas.json` | A9 | A12 |
| A11 | Age rating and privacy labels | provider setting | REQUIRED for store, not internal TestFlight | yes | Nemat | App Store Connect | A9, policies | external TestFlight |
| A12 | TestFlight internal, then external (Beta App Review) | provider setting | REQUIRED for outside testers | yes | Nemat | App Store Connect | A9, A10, D3, policy URLs | first outside tester |
| A13 | **Input for W8:** the Apple Team ID (10 characters, shown in the membership page; not a secret) | value to hand over | OPTIONAL (universal links) | optional | Nemat | `web/public/.well-known/apple-app-site-association` | A1 | universal links |
| **Google** | | | | | | | | |
| G1 | OAuth consent screen | provider setting | REQUIRED if Google sign-in ships | yes | Nemat | Google Cloud | S4 | G2 |
| G2 | Web OAuth client (id and secret) | credential | REQUIRED if Google ships | yes | Nemat | id: EAS variable; secret: `supabase/.env`; redirect URI: the Supabase Auth callback on `picvoavfxnajfjkqawju.supabase.co` | G1 | G5 |
| G3 | iOS OAuth client (id and reversed scheme) | credential | REQUIRED if Google ships | yes | Nemat | ids: EAS variables; scheme: `GOOGLE_IOS_URL_SCHEME` | G1, D2 | G5 |
| G4 | Android OAuth clients, one per signing SHA-1 | credential | OPTIONAL | **no** | Nemat | Google Cloud | S3, first Android build, Play App Signing | Google on Android |
| G5 | Supabase Google provider | provider setting | REQUIRED if Google ships | yes | Nemat, Lead | `supabase/.env` then `config push` | G2, G3 | Gate 2 (Google) |
| G6 | **Input for W8:** SHA-256 fingerprint(s) of the signing certificate(s): the EAS upload key and, once on Play, the Play App Signing key (not secrets) | value to hand over | OPTIONAL | **no** | Nemat | `web/public/.well-known/assetlinks.json` | first Android build, S3 | Android app links |
| **Push** | | | | | | | | |
| P1 | Expo project id (`eas init`) | credential | REQUIRED | yes | Nemat | `app/.env` and EAS variable `EAS_PROJECT_ID` | S1 | A4, builds |
| P2 | `send-push` sender secrets | credential | REQUIRED for push | yes | Nemat, Lead | function secret and Vault | P1, A4 | push |
| P3 | `EXPO_ACCESS_TOKEN` | credential | OPTIONAL | yes | Nemat | function secret | P1 | enhanced push security |
| P4 | FCM: `google-services.json` and service account | credential | OPTIONAL | **no** | Nemat | EAS file variable; Expo credentials | S5 | Android push |
| P5 | Push device test with two accounts | device | REQUIRED (B-2) | yes | Nemat | n/a | P1, P2, A4, a signed paid-team build | B-2 |
| **Email** | | | | | | | | |
| E1 | Resend sending domain `auth.churntech.com` | provider setting | **done 9 Oct** | yes | Nemat | Resend, Supabase SMTP | none | codes |
| E2 | Deliverability: Outlook, iCloud, a Bali address; waitlist email | device/provider | REQUIRED | yes | Nemat | n/a | E1 | Gate 2 |
| E3 | DMARC record | provider setting | REQUIRED before outside testers | yes | Nemat | DNS of the sending domain | E1 | deliverability |
| E4 | Email rate limit before declaring SMTP in `config.toml` | provider setting | REQUIRED if SMTP is ever declared | yes | Lead | `config.toml` `email_sent`, then `config diff` | E1 | safe config push |
| **Domain and web** | | | | | | | | |
| W1 | Buy the domain | paid account | REQUIRED | yes | Nemat | registrar | D2 | W2 |
| W2 | DNS on Cloudflare: bought through Cloudflare Registrar, or nameservers moved (up to a day), or a CNAME for a subdomain only | provider setting | REQUIRED | yes | Nemat | Cloudflare dashboard | W1, S10 | W6 |
| W3 | Pages project `shortcut-web` (`wrangler pages project create`) | provider setting | REQUIRED | yes | Nemat, Lead | Cloudflare Pages | S10 | W4 |
| W4 | Pages configuration: secrets `SUPABASE_ANON_KEY` (the publishable key, set as a Pages environment variable/secret binding, never in git) and `WEB_PROXY_KEY` (32+ random characters); variables `ADMIN_HOST=admin.<domain>`, `WEB_BASE_URL=https://<domain>` in `web/wrangler.toml` `[env.production.vars]` (committed, not secret), optional `STORE_URL`/`WAITLIST_URL` | credential, config | REQUIRED | yes | Nemat sets the secrets; Lead commits the vars | Cloudflare Pages secrets (`wrangler pages secret put`); `web/wrangler.toml` | W3, D2 (domain), D4 | W6 |
| W5 | Supabase side: the **same** `WEB_PROXY_KEY` as a function secret (`supabase secrets set`), then **redeploy the `web` function** (it now carries `render.ts`); needs Nemat's approval | credential, deploy | REQUIRED | yes | Nemat sets the value; Lead deploys | Supabase function secret; hosted `web` | W4 (the value is generated once and used in both places) | per-visitor rate limits; `web_link_opened` events |
| W6 | Deploy the Pages project and add custom domains `<domain>` and `admin.<domain>`; run the four checks in `web/README.md` (`text/html` on `/r/<id>`, JSON `.well-known`, `/admin` with a nonce CSP on the admin host, 404 for pages on the admin host) | provider setting | REQUIRED | yes | Nemat, Lead | Cloudflare Pages | W2, W4, W5 | `web` pages, `admin` (H7) |
| W7 | `EXPO_PUBLIC_WEB_BASE_URL=https://<domain>` in the EAS `preview` and `production` environments and `app/.env` (after W6 passes). `ADMIN_AUTH_BASE` is not needed on this path: Auth stays on `supabase.co` | config | REQUIRED | yes | Lead | EAS variable | W6 | share links in the app |
| W8 | The two `.well-known` files: Apple Team ID into `web/public/.well-known/apple-app-site-association` (input A13), Android signing SHA-256(s) into `assetlinks.json` (input G6) | provider setting | OPTIONAL | AASA optional, assetlinks **no** | Nemat gives the values (neither is a secret); Lead edits and redeploys Pages | `web/public/.well-known/` | W6, A1 / Android signing | universal and app links |
| W9 | `associatedDomains` and `intentFilters` | repo edit after W8 | OPTIONAL | optional | Agent F on request | `app.config.ts` | W8 | links open the app |
| **Mux** | | | | | | | | |
| M1 | Paid plan with a card | paid plan | REQUIRED | yes | Nemat | Mux billing | none | beyond 10 assets |
| M2 | Revoke the spike token pair and the extra token | credential | REQUIRED before outside testers | yes | Nemat | Mux dashboard | none | closes BETA-READINESS section 8 |
| M3 | Local-stack dev token | credential | OPTIONAL | yes | Nemat | `supabase/functions/.env` (git-ignored) | none | local tests stop using spike credentials |
| M4 | Decision to switch clean-up live | decision | REQUIRED before Gate 5 | yes | Nemat | `VIDEO-RELIABILITY.md` section 8 | provider tests | deletion statements become true |
| **Devices** | | | | | | | | |
| V1 | An iPhone for the founder build and the paid-team build | device | REQUIRED | yes | Nemat | UDID to A3 | none | all iOS checks |
| V2 | A second iPhone or second tester for two-account checks | device | REQUIRED (replies, push, block) | yes | Nemat | n/a | none | B-2 and phase 4/5 checks |
| V3 | A mobile-data SIM for Bali tests | device | REQUIRED (Gate 1 evidence) | yes | Nemat | n/a | none | upload/playback over 4G |
| V4 | A mid-range Android phone | device | OPTIONAL | **no** | Nemat | n/a | none | Gate 1 Android run, B-1 on Android |
| V5 | The Mac with Xcode and a UTF-8 shell | device | REQUIRED for local builds | yes | Nemat | n/a | none | founder build |
| **Supabase plan** | | | | | | | | |
| B1 | Pro plan (same as S6) | paid plan | **OPTIONAL: Nemat decides** | yes | Nemat | billing | none | backups, no pausing |
| B2 | Backups or point-in-time recovery decision | decision | REQUIRED for the policies | yes | Nemat | dashboard | B1 | `RETENTION-AND-RECOVERY.md` |
| B3 | Config pushes (Apple, Google) | provider setting | REQUIRED | yes | Lead | `supabase config push` | A6, G5 | sign-in |

(B1 and S6 are the same plan; B3 is the push mechanism used by A6, A7, G5.)

## 2. Accounts and payments (S1 to S9, D1 to D6)

### D1 and D2 first: they are permanent

1. Decide the seller (individual or company). A company account needs a legal entity (and for Apple a D-U-N-S number),
   which can take days to weeks: start it first (LONG-LEAD).
2. Approve the product name. Then confirm or change `app.shortcut` (iOS bundle id and Android package). They cannot be
   changed after the first App Store Connect or Play Console app is created (`IOS.md` section 2). Changing means
   editing `app.config.ts`, `supabase/.env` (Apple client id) and the Google and Apple consoles.
3. Decide D6, iPhone-only or both. It removes every item marked "no" in the iPhone-only column from the beta path.

### S1 Expo (free)

Create the account at expo.dev; sign in on the Mac with `npx eas-cli login`. Then P1.

### S2 Apple Developer Program

Enrol (A1). Needs an Apple ID with two-factor authentication and, for a company, the entity details. Do not enter a
card number anywhere except Apple's own page.

### S3 and S5 (Android, optional for an iPhone-only beta)

Play Console registration with identity verification; Firebase project for FCM. See G4, P4 and `ANDROID.md` section 7.

### S6 and B1 Supabase Pro (optional); S7 and M1 Mux paid plan; S8 domain; S10 Cloudflare

Billing pages of each provider, entered by Nemat. Reasons, each from the docs:

- **Supabase Pro is Nemat's decision, not a requirement.** It was required only for the custom-domain add-on
  (`CUSTOM-DOMAIN.md`), which `WEB-HOSTING.md` replaces with Cloudflare Pages ("No Supabase plan change is needed for B") and
  which Nemat said not to buy yet. What remains is the hosted project's **lack of backups and point-in-time recovery** at the
  9 Oct check (the policies cannot say deleted data is gone without knowing, `RETENTION-AND-RECOVERY.md`) and project pausing
  on the free plan. Decide with B2.
- Mux's free plan caps at 10 assets and the Beta environment has 2 plus the spike's 7 (BETA-READINESS sections 12 and 27,
  `PROVIDER-TESTS.md`).
- The domain is needed for the web pages, link previews and the admin (W1); the Cloudflare account on the **free** plan covers
  the Pages project (`WEB-HOSTING.md` section 3: 100,000 Function requests a day, static files free).

### S4 Google Cloud, S9 Resend

Covered under Google and Email.

## 3. Apple (A1 to A12)

Order, each step depends on the one before it:

1. **A1** Enrol (S2). Wait for approval.
2. **A2** App ID. developer.apple.com, Certificates, Identifiers & Profiles, Identifiers, `+`, App IDs, App, explicit
   Bundle ID `app.shortcut`; enable **Sign In with Apple** (as the primary App ID) and **Push Notifications**. (EAS can
   create and update this during the first build with Apple access; doing it by hand first is safe. **verify**.)
   Associated Domains is added later with W8/W9.
3. **A3** Register the iPhone: `npx eas-cli device:create` prints a link; open it on the iPhone and install the profile.
   Needed only for the ad hoc `preview` profile (`IOS.md` section 4).
4. **A5** Signing: the first `eas build --platform ios` (BUILD.md "Release build dry run") asks for Apple access (Apple ID
   with two-factor, or an App Store Connect API key). EAS then creates and stores the distribution certificate and
   provisioning profile. Inspect with `npx eas-cli credentials`.
5. **A4** APNs key: Keys, `+`, enable Apple Push Notifications service, download the `.p8` **once**; note the Key ID and
   Team ID. Upload it to the Expo project in `npx eas-cli credentials` (iOS, Push Notifications). Keep the file offline.
6. **A6** Sign in with Apple, native iOS (no Services ID needed because the identity token's audience is the bundle
   id): in `supabase/.env` set `SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID=app.shortcut`. The secret is only needed for the
   web flow; for a native-only start leave `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` empty (an empty env secret is not
   pushed; **verify** that Supabase accepts an Apple provider without a secret for ID-token sign-in). Flip
   `[remotes.hosted.auth.external.apple] enabled = true` in `config.toml`, then `supabase config diff --project-ref
   picvoavfxnajfjkqawju` (must show only the Apple change), `supabase config push < /dev/null` (preview), then the
   interactive push, never `--yes` (`SECURITY.md` section 5; BETA-READINESS section 10).
7. **A8** After E1 and A1: register the Resend sending domain for relay mail (Services, "Sign in with Apple for Email
   Communication", **verify**) so waitlist-admission emails reach Hide My Email addresses (`IOS.md` section 5).
8. **A9** App Store Connect: New App with name, primary language, bundle id `app.shortcut`, SKU. Needs D2.
9. **A10** Tell Agent F the app's numeric id; it goes in `eas.json` `submit.production` (`ascAppId`). Not a secret.
10. **A11** Age rating (18+, user-generated video, no ads) and privacy labels: the draft answers are `IOS.md` section 8.
11. **A12** `npx eas-cli build --platform ios --profile production`, then `npx eas-cli submit --platform ios --profile
    production`; internal TestFlight first (no review); external needs Beta App Review, a privacy policy URL and D3.

**A7, Android only (OPTIONAL for an iPhone-only beta).** The Auth callback stays on the project URL (Option B keeps Auth on
`supabase.co`), so this does not wait for the domain. Services ID (for example `app.shortcut.signin`) with the domain
`picvoavfxnajfjkqawju.supabase.co` and return URL `https://picvoavfxnajfjkqawju.supabase.co/auth/v1/callback`; a Key with Sign in
with Apple enabled; generate the client-secret JWT (ES256; `iss` Team ID, `sub` Services ID, `aud` `https://appleid.apple.com`,
expiry at most six months). Put `app.shortcut,<services id>` and the JWT in `supabase/.env`. **Put a calendar reminder about
five months out: when the JWT expires, Apple sign-in fails** (`SECURITY.md` section 5).

**A13 (OPTIONAL, for universal links).** Give Agent F the Apple Team ID (not a secret) so it can replace the placeholder in
`web/public/.well-known/apple-app-site-association`; `associatedDomains` in `app.config.ts` follows (`IOS.md` section 3).

**D3 reviewer access.** The app is invite-only and codes arrive by email, so a reviewer cannot sign in. Options are in
`IOS.md` section 7 (a long-lived single-use invite in the review notes with Sign in with Apple; a reviewer account with a
monitored mailbox). `scripts/create-invite.sh <CODE> canggu <days>` accepts a validity in days. Invites are single use and
expire, so each resubmission needs a fresh one.

## 4. Google (S4, G1 to G5)

Required for a spec-complete beta (SPEC.md section 13 offers Google on Welcome). If Nemat chooses to defer it, the Google
button still appears and fails with a configuration error (`app/src/lib/auth.ts`, `SignInNotConfigured`); hiding it is a
code and design change, not proposed here.

1. **S4/G1** Google Cloud console, new project, APIs & Services, OAuth consent screen: user type External; app name,
   support email, developer contact; scopes `openid`, `email`, `profile` only; add the privacy policy URL when it exists
   (`ANDROID.md` section 3). Testing mode limits sign-in to listed test users (**verify** the limit); publish before outside
   testers.
2. **G2** Credentials, Create OAuth client ID, **Web application**. Its **id** becomes `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
   (EAS variable, plain text is fine, it is public) and its **secret** goes only into `supabase/.env` as
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`. Authorised redirect URI: the Supabase Auth callback on the project URL (unchanged by
   the web hosting choice).
3. **G3** **iOS** client for bundle id `app.shortcut`. Its id becomes `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and its reversed
   form `GOOGLE_IOS_URL_SCHEME` (both EAS variables; the scheme is needed at prebuild time or the plugin is left out).
4. **G5** `supabase/.env`: `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<web id>,<ios id>`. Flip
   `[remotes.hosted.auth.external.google] enabled = true`; `config diff`, preview push, interactive push (as in A6).
   `skip_nonce_check = true` stays (native tokens carry no checkable nonce).
5. **G6, Android app links (OPTIONAL).** The signing certificates' SHA-256 fingerprints (EAS upload key; Play App Signing key once on
   Play) go to Agent F for `web/public/.well-known/assetlinks.json` (`ANDROID.md` section 6).
6. **G4, Android, OPTIONAL for iPhone-only.** One Android client per signing certificate SHA-1: the EAS keystore (after the
   first Android build), the local debug keystore, and the Play App Signing certificate (after the first Play upload). Missing
   the Play one is the "works from the APK, fails from Play" failure (`ANDROID.md` section 3).

## 5. Push (P1 to P5)

1. **P1** `cd app && npx eas-cli init`. Add the printed id to `app/.env` (local builds, git-ignored) and as EAS variable
   `EAS_PROJECT_ID` for `preview` and `production`. (`app.config.ts` turns it into `extra.eas.projectId`.)
2. **A4** APNs key to Expo (above).
3. **P2** Choose a long random string `S` on the Mac (not shared). Set it as function secret `PUSH_SENDER_KEY`
   (`supabase secrets set`), and as Vault secret `push_function_key`; Vault `push_function_url` is
   `https://picvoavfxnajfjkqawju.supabase.co/functions/v1/send-push`. The function `send-push` is already deployed
   (BETA-READINESS 25); until the secrets exist it does nothing and outbox rows wait. Method: `NOTIFICATIONS.md` section 4
   step 4 and checklist step H8.
4. **P3** Optional `EXPO_ACCESS_TOKEN` function secret if "enhanced push security" is turned on for the Expo project.
5. **P4** FCM, only for Android: Firebase project, an Android app `app.shortcut`, download `google-services.json` and keep it
   out of git; supply it to EAS as a **file** variable named `GOOGLE_SERVICES_JSON`; generate a service-account key (FCM HTTP v1)
   and upload it in `npx eas-cli credentials` (Android).
6. **P5** On a build signed by the paid team (the founder build has no push entitlement): two accounts on two phones as in
   `NOTIFICATIONS.md` section 4 step 6. Record outcomes in BETA-READINESS.

## 6. Email (E1 to E4)

- **E1** is done (domain `auth.churntech.com` verified in Resend, SMTP saved in the hosted dashboard, 9 Oct).
- **E2** Request codes to Outlook, iCloud and a Bali address, and receive one waitlist-admission email. Gmail passed on 9 Oct.
- **E3** Add a DMARC record to the sending domain's DNS (SPF and DKIM are already part of Resend's records; DMARC is the
  pending one per `SECURITY.md` section 5).
- **E4** Hosted SMTP is not declared in `config.toml`; if it ever is, first change `[auth.rate_limit] email_sent` from 2 to
  the intended value (30 an hour is what the hosted dashboard shows) or a push sets the hosted limit to 2.
- Resend's free plan is 100 emails a day, 3,000 a month; Supabase's hosted limit is 30 an hour for the whole project, so a
  flood of code requests can delay real ones. Upgrading either is **OPTIONAL** until volume shows a need.
- Decision for later: who admits people from the waitlist and how the email goes out (`team_admit_from_waitlist` exists; the
  workflow does not).

## 7. Domain and web (S8, S10, W1 to W8)

Why this is required: on the default `supabase.co` functions domain the platform serves HTML as `text/plain`
(BETA-READINESS 25, H5b). The shared-link pages show source, link previews cannot read the page, and the moderation admin
(required before the first outside tester) cannot render. `WEB-HOSTING.md` (Agent G, 17 Oct) recommends **option B, Cloudflare
Pages with Pages Functions**, prepared and tested locally in `web/`, not deployed; it matches SPEC.md Section 4's links on the
apex, serves the `.well-known` files, isolates the admin on its own host, and needs no Supabase plan change. Option A (the Supabase
add-on, `CUSTOM-DOMAIN.md`) is not being bought. Each step below is on Nemat's go-ahead; the exact commands are in `web/README.md`.

1. **W1** Buy the domain (D2). Not a domain of the provisional brand if it will also send email (DECISIONS 9 Oct).
2. **S10** Create the Cloudflare account (free plan); on the Mac `cd web && npx wrangler login`.
3. **W2** Put the domain's DNS on Cloudflare (Registrar purchase is immediate; a nameserver move from another registrar can take
   up to a day). A subdomain-only setup can use a CNAME, but the apex (`https://<domain>/r/{id}`) needs Cloudflare DNS.
4. **W3** `npx wrangler pages project create shortcut-web --production-branch main`.
5. **W4** Generate `WEB_PROXY_KEY` (`openssl rand -hex 32`, kept in a shell variable, never printed). Then
   `npx wrangler pages secret put SUPABASE_ANON_KEY --project-name shortcut-web` (the publishable key, from the dashboard; it is
   public but kept out of git) and `... put WEB_PROXY_KEY ...`. In `web/wrangler.toml` `[env.production.vars]` fill `ADMIN_HOST`
   (`admin.<domain>`) and `WEB_BASE_URL` (`https://<domain>`) and commit; optional `STORE_URL`, `WAITLIST_URL` (D4).
6. **W5** Supabase side, with approval: `supabase secrets set WEB_PROXY_KEY=<the same value> --project-ref picvoavfxnajfjkqawju`,
   then `supabase functions deploy web --no-verify-jwt --project-ref picvoavfxnajfjkqawju` (redeploy; it now carries `render.ts`).
   Without the key the function behaves as before. The key lives in two places and must be rotated together (`WEB-HOSTING.md`
   section 3).
7. **W6** `npx wrangler pages deploy public --project-name shortcut-web --branch main`; Cloudflare dashboard, Pages,
   `shortcut-web`, Custom domains: add `<domain>` and `admin.<domain>`. Check with `curl -sI`: `/r/<live id>` is 200
   `text/html` with `x-robots-tag: noindex`; `/.well-known/apple-app-site-association` is 200 `application/json`; `admin.<domain>/admin`
   is 200 with a nonce CSP; `admin.<domain>/r/<id>` is 404. Then open a `/r/<id>` link in a phone browser and check a link
   preview shows thumbnail and prompt. Only then deploy the admin function (H7).
8. **W7** `EXPO_PUBLIC_WEB_BASE_URL=https://<domain>` in the EAS `preview` and `production` environments and `app/.env`.
9. **W8, OPTIONAL for a first beta.** Replace the placeholders in `web/public/.well-known/` with the Apple Team ID (A13) and the
   Android SHA-256 (G6), redeploy Pages, then `associatedDomains` and `intentFilters` in `app.config.ts` (`IOS.md` section 3,
   `ANDROID.md` section 6). Without them the page's "Open in the app" button still opens the app through the `shortcut://`
   scheme. `assetlinks.json` is Android only.

Secrets that appear in this flow and where they live: `SUPABASE_ANON_KEY` (public key, Pages secret), `WEB_PROXY_KEY` (Pages secret
and Supabase function secret), nothing else. This Pages project holds no service-role key.

## 8. Mux (M1 to M4)

- **M1** Billing: card on file for the account (Beta environment shares the account's asset cap if the cap is account-wide,
  `PROVIDER-TESTS.md`).
- **M2** Revoke the spike token pair and the extra token created in the spike environment (BETA-READINESS section 12); decide the
  spike's 7 assets. Dashboard step by Nemat.
- **M3** Give the local stack its own development token in `supabase/functions/.env` (git-ignored) instead of the spike pair.
- **M4** Clean-up live is a decision, not a setup: preconditions are `VIDEO-RELIABILITY.md` section 8 (provider tests, a
  3 to 7 day dry run, a named daily owner of `mux_cleanup_health()`). C1 passed on 16 Oct; C2 is stopped with its job pending
  (BETA-READINESS 27, 28).
- Hosted Mux credentials and the webhook already exist (Shortcut Beta environment, 10 Oct); nothing to create.

## 9. Devices (V1 to V5)

| ID | What | Requirement and source |
| --- | --- | --- |
| V1 | An iPhone | Nemat's iPhone 17 Pro on iOS 27 is the one verified device. The app's deployment target is iOS 16.4 (`IOS.md` section 1), so if a phone running an older iOS is available it is worth one pass; not required. Its UDID goes to A3 (`xcrun devicectl list devices`). |
| V2 | A second iPhone, or a second person | Two accounts are needed to test replies, comments, blocking, reports and push (`ANDROID.md` section 8 part B; `NOTIFICATIONS.md` step 6). |
| V3 | A SIM with mobile data | Gate 1 is about Bali mobile data: record, upload and play with Wi-Fi off. Note the carrier and signal for each run (`spike/REPORT.md`; BETA-READINESS section 3). The 11 Oct run did not confirm the network. |
| V4 | A real mid-range Android phone (OPTIONAL for iPhone-only) | Android 12 to 14, 4 to 6 GB RAM, a mid-range chipset, an OEM common in Indonesia; exact model, OS, skin and RAM written down per run; real phone, not an emulator (`ANDROID.md` section 8). Minimum supported is Android 7.0 (`minSdk 24`). |
| V5 | The Mac | Xcode signed in to the Apple ID of whichever team signs the build, CocoaPods with a UTF-8 shell (`export LANG=en_US.UTF-8`), Node 24 or 22 (`BUILD.md`). For the Android build, JDK 17 and the Android SDK. |

## 10. Supabase plan (B1 to B3)

- **B1** Pro plan: **optional, Nemat decides**. It is no longer needed for the domain (`WEB-HOSTING.md`); remaining reasons are backups, no pausing and support.
- **B2** Decide the backup posture and write it into the policies; the hosted project had no backups or PITR at 9 Oct.
- **B3** Config pushes always: `supabase config diff --project-ref picvoavfxnajfjkqawju`, a preview push with
  `< /dev/null`, then the interactive push, never `--yes`; only Auth properties should change (A6, A7, G5).

## 11. The shortest path for a first iPhone-only beta

Required and in this order: D1, D2, D6 -> S1 -> S2/A1 -> A2 -> P1 -> A5 and A3 -> first `preview` build to the founder's iPhone
(BUILD.md) -> A4 and P2 (push) -> A6 (Apple native) -> S4 and G1, G2, G3, G5 (Google, unless deferred) -> E2, E3 ->
S8/W1, S10, W2 to W7 (domain, Cloudflare Pages, web function redeploy, admin: H7) -> M1, M2 -> A9, A10, A11 -> `production` build, internal TestFlight ->
D3, policy URLs, D4/W6 -> external TestFlight (A12) -> Gate 5 decision.

Optional for that beta: S3, S5, S6/B1 (Supabase Pro; Nemat decides), A7, A13, G4, G6, P3, P4, V4, W8, M3, an upgrade of Resend.

## 12. What each item unblocks, by gate

- **Gate 2** (Nemat can sign up on iOS and Android): A2, A5, A6, G1 to G5, E2, P1, a signed build; Android needs S3, G4, V4 and a
  built Android app.
- **Gate 5** (safety complete): the admin (S8, S10, W1 to W7, H7), M2, M4, P2/A4/P5 (B-2), policies (D5, S2 for seller name).
- **Gate 7**: everything above plus Nemat's decision.
- **B-2** push: P1, A4, P2, P5 (iOS); P4 adds Android.
- **B-3** links: W1 to W7; W8 (with A13/G6) for universal links.
- **B-4** store builds: S1, S2, A5, A9 to A12, policy URLs, icon and listing material (outside this file).
