# iOS readiness

Everything needed to take Shortcut from the founder's free-team iPhone build to TestFlight and the App Store,
prepared but not started. **Nothing here was purchased, enrolled, registered or run.** Written 16 Oct 2026;
facts about the app come from `app/app.config.ts` and a throwaway `expo prebuild` on that date. Facts about
Apple's programme, App Store Connect and EAS are from general knowledge of those services and must be checked
against the current Apple documentation at the moment of each step; they are marked **(verify)** where drift is
likely.

## 1. Current state in one table

| Item | State |
| --- | --- |
| Bundle identifier | `app.shortcut` (regular build), `app.shortcut.founder` (founder build only) |
| Version / build | `0.1.0` / `1`; `eas.json` keeps build numbers on EAS (`appVersionSource: remote`, `autoIncrement`) |
| Deployment target | iOS 16.4 (Expo SDK 57 default; confirmed in the prebuilt project) |
| Devices | iPhone only (`supportsTablet: false`), portrait, light interface |
| Capabilities in the regular build | Sign in with Apple (`com.apple.developer.applesignin = Default`), Push (`aps-environment`; `development` in a local prebuild) |
| Capabilities not yet declared | Associated Domains (waits for the domain, B-3) |
| Export compliance | `ITSAppUsesNonExemptEncryption = false` already set |
| Background modes | none (`UIBackgroundModes` empty) |
| Usage strings | camera, microphone, photo library: from `app.config.ts` |
| URL schemes | `shortcut`, `app.shortcut`, `exp+shortcut` (the last is the dev client) |
| Signed builds that exist | Only the founder Release build on Nemat's iPhone 17 Pro, free Personal Team `BP7TM32HCQ`, expires after 7 days |
| App icon | Expo template icon, development only until the brand is approved (DECISIONS 9 Oct) |

## 2. Apple Developer requirements

1. **Apple Developer Program membership** (paid, annual; an individual or an organisation account) **(verify
   current price and enrolment steps)**. Required for: Sign in with Apple on a real device, push notifications,
   associated domains, TestFlight, App Store distribution, ad hoc internal builds, and APNs keys. A free
   Personal Team can sign none of these.
2. **Individual vs organisation.** The seller name on the App Store is the legal name of the account holder.
   An organisation account needs a legal entity and a D-U-N-S number **(verify)**. This is a company decision
   for Nemat; the policies in `docs/policies/` carry `[Company legal name]` placeholders until it is made.
3. **Why the founder build exists, and what `withoutPersonalTeamCapabilities` does.** The free Personal Team
   cannot create provisioning profiles that carry the Push or Sign in with Apple capability. Expo adds both
   entitlements whenever `expo-notifications` and `expo-apple-authentication` are installed, so a normal
   prebuild cannot be signed by a Personal Team. With `EXPO_PUBLIC_FOUNDER_BUILD=1` (only set by
   `app/scripts/founder-ios.sh`), `app.config.ts`: switches the bundle id to `app.shortcut.founder` (the App ID
   `app.shortcut` is reserved for the paid team), sets `usesAppleSignIn: false`, leaves out
   `expo-apple-authentication`, and runs `plugins/withoutPersonalTeamCapabilities.js`, which deletes
   `aps-environment` and `com.apple.developer.applesignin` from the entitlements. The code paths stay:
   Welcome hides the Apple button, `signInWithApple()` throws "not configured", no push token is registered.
   The founder build also refuses any Supabase URL that is not the hosted project. It must never go to anyone
   else, and it is not a path to TestFlight.
4. **Name.** The App Store listing name must be unique on the store. "Shortcut" is the implementation name only;
   the product name and brand are unapproved (CLAUDE.md, DECISIONS 9 Oct). The bundle id is permanent once an
   app is created in App Store Connect, so approve the name and bundle id **before** creating the app record.
   `app.shortcut` also implies the unbought domain `shortcut.app`; it does not need to be owned to register
   the identifier, but a mismatch with the final brand would be costly later.

## 3. Identifier, capabilities and entitlements

At developer.apple.com, Certificates, Identifiers & Profiles (done by EAS on the first build when it has
Apple access, or by hand):

- **App ID** `app.shortcut` (explicit), capabilities: Sign In with Apple (enable as primary App ID), Push
  Notifications. Later: Associated Domains.
- **Entitlements the app expects** (from the prebuilt project, 16 Oct):

  | Key | Value | Source |
  | --- | --- | --- |
  | `com.apple.developer.applesignin` | `Default` | `usesAppleSignIn: true` + `expo-apple-authentication` |
  | `aps-environment` | `development` locally; the distribution profile sets production | `expo-notifications`; see `NOTIFICATIONS.md` gap 5 |
  | `com.apple.developer.associated-domains` | `applinks:<domain>` | **not yet in `app.config.ts`**; B-3 |

- **Associated Domains, when the domain exists** (B-3): add to `app.config.ts`
  `ios.associatedDomains: ['applinks:<domain>']`, serve
  `https://<domain>/.well-known/apple-app-site-association` (JSON, no extension, `application/json`,
  no redirect) listing `<TEAMID>.<bundle id>` with paths `/r/*`, `/p/*`, `/i/*`. **Routes (updated 16 Oct):** the app now has
  `r/[id]`, `p/[id]`, `u/[username]` and `i/[code]` in `src/app` (Agent E, integration branch); they were missing when
  this was first written. Opening them from an https link is still unverified on a device and needs the domain.

## 4. Signing with EAS

Two distribution types matter, and `eas.json` names them confusingly:

| Goal | Profile | Result | Needs |
| --- | --- | --- | --- |
| Nemat's own phone, or a few registered devices | `preview` (`distribution: internal`) | **Ad hoc** build installed from an EAS link | paid team; every device's UDID registered (`eas device:create`) and in the provisioning profile; rebuilt when a device is added |
| TestFlight and the App Store | `production` (store distribution) then `eas submit` | processed by App Store Connect, installed through TestFlight | paid team; App Store Connect app record; no UDIDs |

For outside testers use **TestFlight**, so the `production` profile (or a new profile added later with
`distribution: store` and a different env) is the one to build. `preview` is for Nemat and the team.

What EAS needs, in the order it asks **(verify against current EAS docs)**:

1. Expo account; `npx eas-cli login`; `npx eas-cli init` in `app/` (project id; BLOCKERS B-2/B-4).
2. EAS environment variables for the `preview` and `production` environments (plain text is fine; all are
   public by design): `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the `sb_publishable_` key), `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
   `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `GOOGLE_IOS_URL_SCHEME`, `APPLE_TEAM_ID`, `EAS_PROJECT_ID`. `eas.json`
   already pins the Supabase URL, `EXPO_PUBLIC_DEV_TOOLS=0` and `EXPO_PUBLIC_FOUNDER_BUILD=0`; on the build
   server `app.config.ts` refuses the build if the URL or key are wrong or dev tools are on.
3. Apple access for credentials: either Nemat's Apple ID in the CLI (two-factor prompt) or an App Store
   Connect API key. EAS then creates and stores the distribution certificate and provisioning profile and
   enables the App ID capabilities from the entitlements. Inspect with `npx eas-cli credentials`.
4. `npx eas-cli build --platform ios --profile production`, then `npx eas-cli submit --platform ios --profile
   production` (needs the App Store Connect app record and API key or Apple ID). The `submit.production` block
   in `eas.json` is empty and needs `ascAppId` once the record exists.

### What `eas build --profile preview` needs on iOS, exactly

Paid Apple team (ad hoc needs it), Expo project id, the EAS environment values above in the **preview**
environment, at least one registered device (`npx eas-cli device:create` gives Nemat a link to open on the
iPhone), Apple credentials as in step 3. Without any one of them the build stops before compiling. Not tested.

## 5. Sign in with Apple, end to end

**At Apple.** Native iOS needs no Services ID: the app's identity token has `aud = app.shortcut`. The Android
web flow (SPEC.md Section 13 puts Apple second on Android; Section 22 still lists "confirm Sign in with Apple on
Android") needs more:

1. App ID `app.shortcut` with Sign In with Apple enabled.
2. A Services ID (for example `app.shortcut.signin`, a second identifier) with Sign In with Apple configured:
   primary App ID `app.shortcut`; domain `picvoavfxnajfjkqawju.supabase.co`; return URL
   `https://picvoavfxnajfjkqawju.supabase.co/auth/v1/callback`.
3. A Key with Sign in with Apple enabled (a `.p8`, download once; Key ID and Team ID noted).
4. A **client secret JWT** generated from Team ID, Services ID, Key ID and the `.p8`. It expires in at most six
   months, so the secret must be regenerated and pushed again before expiry or Apple sign-in breaks on both
   platforms **(verify limit)**. Put a recurring reminder in the checklist.
5. **Hide My Email.** SPEC.md Section 13 says relay addresses are ordinary emails. Apple only forwards mail to a
   relay address from senders registered under "Sign in with Apple for Email Communication" (Services,
   Certificates, Identifiers & Profiles). The waitlist-admission email would not reach a Hide My Email person
   unless the Resend sending domain (`auth.churntech.com` today, not final) is registered there **(verify)**.
   Sign-in codes are not affected: Apple users do not receive codes.

**In Supabase** (`supabase/.env`, never in the app; `config.toml` already reads them):

```
SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID=app.shortcut,<services id>
SUPABASE_AUTH_EXTERNAL_APPLE_SECRET=<generated client secret JWT>
```

**Prepared diff for `supabase/config.toml`, not applied** (the hosted block keeps Apple off on purpose):

```diff
 [remotes.hosted.auth.external.apple]
-enabled = false
+enabled = true
```

Then, only with Nemat's approval, in this order: `supabase config diff --project-ref picvoavfxnajfjkqawju`
(must show only the Apple change), `supabase config push < /dev/null` preview, then the interactive push; see
`docs/BETA-READINESS.md` section 10 for the procedure used on 9 Oct. After it, `signInWithIdToken` for Apple works
from a build that has the capability; the app already handles E-Linked (one method per account). Test: a new
Apple account signs in, passes 18+, and a second attempt with the same email by code shows E-Linked.

## 6. Push (APNs)

`NOTIFICATIONS.md` section 4 has the exact steps: Expo project id, APNs key (`.p8`, Push Notifications enabled,
uploaded to the Expo project), the Supabase Vault secrets and the `send-push` function. The App ID must carry
the Push capability, and the first TestFlight build's entitlements should be inspected for `aps-environment =
production`.

## 7. TestFlight prerequisites

| Item | Needed for | Status |
| --- | --- | --- |
| App Store Connect app record (name, primary language, bundle id `app.shortcut`, SKU) | any TestFlight build | not created; blocked on the name decision |
| Processed build | testers | none |
| Export compliance | every build | answered in the build: `ITSAppUsesNonExemptEncryption = false` (HTTPS and OS cryptography only; **confirm with Nemat that no proprietary or non-standard cryptography exists**: none was found) |
| Internal testing | up to the App Store Connect team members, no review | possible as soon as a build is processed |
| External testing | outside testers, needs **Beta App Review** the first time | needs test information, a feedback email, a **privacy policy URL**, review contact and **a way for the reviewer to sign in** |
| Reviewer access | App Review | **No plan exists.** The app is invite-only and sign-in is by emailed code, Apple or Google. Reviewers cannot read a code from a private mailbox. Options for Nemat to choose from: (a) a long-lived single-use invite code in the review notes (`scripts/create-invite.sh <CODE> canggu <days>` accepts a validity in days) with Sign in with Apple using the reviewer's own Apple ID; (b) a prepared reviewer account plus a mailbox the team monitors; (c) a documented review-only switch (this would be new product behaviour and needs a spec decision, so it is not proposed). An invite code expires (7 days by default) and is single-use, so a resubmission needs a fresh one. |
| App Review guideline checks that apply to this app | App Store release | in-app account deletion (exists, `SF-DeleteAccount`); report and block on user content (exists); published contact information (needs `HELP-AND-CONTACT.md` destination); terms that forbid objectionable content (`TERMS-OF-SERVICE.md`); Sign in with Apple offered next to Google (yes) **(verify guideline numbers: UGC, account deletion, login services)** |
| Age rating | store listing | 18+ self-declaration, user-generated video, no ads. Answer the questionnaire in App Store Connect when the record exists; answers must be consistent with SPEC.md Section 13 and the terms |
| Screenshots, description, keywords, support URL | App Store only (not TestFlight) | not made (BETA-READINESS section 5) |

## 8. Privacy nutrition labels (draft answers; Nemat and counsel to confirm)

Drawn from what the code and database actually collect (SPEC.md Sections 13 to 18, 21; DECISIONS 9 Oct on
analytics; migrations in `supabase/migrations`). Nothing is used for tracking (no ad or tracking SDKs, no data
shared with data brokers, SPEC.md Section 2), so **Data Used to Track You: none**.

| Apple data type | Collected | Linked to the person | Purpose | Source |
| --- | --- | --- | --- | --- |
| Contact info: email address | yes | yes | account and sign-in; waitlist email | Auth; `waitlist.email` |
| Contact info: name | yes (display name the person enters; Apple's name scope is requested) | yes | app functionality (profile) | `profiles.name` |
| User content: photos or videos | yes (responses, video replies, first-response drafts, profile photo) | yes | app functionality | Mux, avatars bucket |
| User content: other user content | yes (captions, comments, bio, prompt suggestions, reports) | yes | app functionality, safety | tables |
| Identifiers: user ID | yes | yes | app functionality | `auth.users.id` |
| Identifiers: device ID | **decide**: an Expo push token is stored per account and platform | yes | push notifications | `push_tokens` (Apple may classify it as Device ID; verify) |
| Usage data: product interaction | yes (first-party events, SPEC.md Section 21) | yes (pseudonymous per-account id, DECISIONS 9 Oct) | analytics | `analytics_events` |
| Usage data: other usage data | web link opens | no (random per-request id) | analytics | `web` function |
| Diagnostics | none (no crash or performance SDK) | n/a | | |
| Location | none collected. The phone's time zone name is sent (for the 18:30 prompt); it is not a location, but it is approximate region information, **flag for counsel** | | | `accounts.timezone` |
| Sensitive info, financial info, contacts, search history, browsing history, health | none | | | |

"Search history": the app keeps recent searches on the phone only (`src/lib/recentSearches.ts`); confirm no
server copy before answering. Camera and microphone: used to record, not collected unless the person posts.

## 9. iOS order of work

See `RELEASE-CHECKLIST.md` for the single ordered list. For iOS alone: decide the name and bundle id; enrol in
the Developer Program; create the Expo project; set EAS environment values; Apple provider configuration
(section 5); `eas build --profile preview` to Nemat's phone (device registered); test Apple sign-in and push on
that build; decide reviewer access; create the App Store Connect record; `production` build and `eas submit`;
internal TestFlight; policies live at their URLs; external TestFlight with Beta App Review.

## 10. Not verified

Nothing in this document was exercised against Apple, Expo or App Store Connect. The only iOS facts that were
run are the local prebuild (entitlements, Info.plist, bundle id, deployment target) and the founder Release
build on 10 and 11 Oct (BETA-READINESS sections 11 and 12).
