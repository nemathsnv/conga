# Beta distribution: what is ready, what free signing allows, what needs the paid Apple team

Written 17 Oct 2026. The goal: send someone a link, they install Conga and keep getting fixes without
touching a Mac. Detail lives in `IOS.md`, `ANDROID.md`, `STAGE-4-SETUP.md` and `OTA-UPDATES.md`; this page
is the map. **Nothing here has been run against Expo, Apple or Google.** Facts about those services are
general knowledge as of this date and are marked **(verify)** where they drift.

## 1. The pieces

| Piece | State in the repository |
| --- | --- |
| Build profiles | `app/eas.json`: `development` (dev client, simulator), `preview` (internal: ad hoc iPhone, Android APK), `production` (TestFlight and stores; Android app bundle). Each has its own update channel |
| Environment | `preview` and `production` pin the hosted Supabase URL, `EXPO_PUBLIC_WEB_BASE_URL=https://conga.churntech.com`, dev tools off, founder switch off. The publishable key and the other public ids go in the EAS environment of the same name. On the EAS servers `app.config.ts` refuses a build with a wrong URL or key, dev tools on, the founder switch on or no links domain (tested in `releaseConfig.test.ts`) |
| Versions | `version` `0.1.0` in `app.config.ts` (what testers see); build numbers (iOS `CFBundleVersion`, Android `versionCode`) kept on EAS and raised on every build (`appVersionSource: remote`, `autoIncrement`) |
| Updates | EAS Update with fingerprint runtime versions and channels `founder`, `preview`, `production` (`OTA-UPDATES.md`); project and channels exist on EAS, nothing published |
| Founder build | `app/scripts/founder-ios.sh release`: free Personal Team, bundle id `app.shortcut.founder`, no Sign in with Apple, no push |

## 2. What can be done now, without paying Apple

| Step | Who | Needs |
| --- | --- | --- |
| Expo account, `npx eas-cli login`, `npx eas-cli init` in `app/` (the project id) | **done 17 Oct**: @nemathsnv/conga, id in `app.config.ts`; channels `founder`, `preview`, `production` created | Expo account (free) |
| EAS environment variables for `preview` and `production` (`EXPO_PUBLIC_SUPABASE_ANON_KEY`, Google client ids if Google ships) | Nemat in the EAS dashboard, or the lead with `eas env:create` once logged in | the values (public) |
| OTA updates to the founder iPhone | lead, each on Nemat's go-ahead | the project id in `app/.env.founder` and one founder build made with it |
| **Android tester builds with an install link** | lead (`npx eas-cli build -p android --profile preview`) | the Expo project; EAS generates and keeps the Android signing key. No Google account needed for an APK |
| iOS simulator builds on EAS (`development` profile) | lead | the Expo project |

## 3. What free signing allows (iPhone)

- One build on Nemat's own iPhone, from this Mac, signed by the Personal Team: `founder-ios.sh`.
- **It expires 7 days after it is built**: iOS then refuses to open it. Rebuilding and reinstalling keeps
  the data (same bundle id and team). Over-the-air updates do **not** extend this.
- No Sign in with Apple, no push, no associated domains (universal links), no TestFlight, no ad hoc
  installs on anyone else's phone, at most three free-team apps on one device and ten App IDs a week
  **(verify)**.
- Install over Wi-Fi works once the iPhone is paired for network connection in Xcode (`OTA-UPDATES.md`
  section 8), so the weekly re-sign does not need a cable.

Nobody but Nemat can be given an iPhone build until the paid membership exists.

## 4. What needs the paid Apple Developer Program

| Capability | Why |
| --- | --- |
| TestFlight (internal and external testers) | store-signed builds and App Store Connect |
| `preview` ad hoc builds on registered iPhones | ad hoc provisioning |
| Sign in with Apple in the app | the entitlement; the regular build (`app.shortcut`) declares it |
| Push on iPhone (B-2) | an APNs key |
| Universal links from `conga.churntech.com` (B-3) | associated domains; the served `apple-app-site-association` still says `APPLE_TEAM_ID.app.shortcut` |
| An iPhone build that does not expire weekly | distribution or development profiles under the paid team last a year **(verify)** |

## 5. Immediately before the first TestFlight build (in this order)

1. **Bundle id, decided once.** The App Store Connect record ties the app to its bundle id for good.
   It is `app.shortcut` today, kept on purpose for the rename (`CONGA-RENAME.md`). Decide it before step 3:
   keeping it is free; changing it later means a new store app and every tester reinstalls.
2. Enrol in the Apple Developer Program; note the team id.
3. Create the App Store Connect app record (name Conga, bundle id, SKU); put its id in `eas.json`
   `submit.production.ascAppId`.
4. The app icon (the Expo template icon must not go to testers; BETA-READINESS section 5).
5. EAS `production` environment: the publishable key, Google ids (or leave Google out), `APPLE_TEAM_ID`,
   `EAS_PROJECT_ID`.
6. `npx eas-cli build -p ios --profile production`; EAS asks for the Apple login and creates the
   certificate and profile with Sign in with Apple and push.
7. `npx eas-cli submit -p ios --profile production`; wait for processing; add internal testers (App Store
   Connect users, up to 100, no review **(verify)**).
8. External testers: test information, feedback email, **privacy policy URL**, and **a way for the
   reviewer to sign in** (IOS.md section 7 lists the options; none chosen). The first external build goes
   through Beta App Review. Then a **public TestFlight link** can be sent to anyone (up to 10,000 testers
   **(verify)**).
9. Update the `.well-known` association file with the team id; add `associatedDomains` to
   `app.config.ts` (a native change: new build).

## 6. How testers get changes

| Platform | JavaScript change | Native change |
| --- | --- | --- |
| iPhone, TestFlight | `scripts/publish-update.sh production` → next two cold starts | new `production` build, submitted; TestFlight offers it (automatic updates if the tester left them on) |
| Android, APK link | `scripts/publish-update.sh preview` → next two cold starts | new `preview` APK; the tester opens the new link and installs over the old app. It installs over only because EAS signs it with the same key and a higher `versionCode` (both automatic); data is kept |
| Founder iPhone | `scripts/publish-update.sh founder` | `founder-ios.sh release` (also weekly, for the free profile) |

## 7. Android install link, step by step

1. `npx eas-cli build -p android --profile preview` (from `app/`, logged in). The first build asks to
   generate a keystore: yes (EAS keeps it; losing it means testers must uninstall to update).
2. The build page on expo.dev has an install link and a QR code. Send the link.
3. On the phone: open the link, download the APK, allow "Install unknown apps" for the browser when
   Android asks, install, open, sign in with an email code.
4. Next build: same link pattern, new page; install over the old one.

Before sending it to anyone: Android has never been run (BETA-READINESS section 3; the mid-range Android
test plan in ANDROID.md section 8 is still to do, and the stitcher's Android path has only compiled).
Google sign-in on Android also needs the keystore's SHA-1 registered (ANDROID.md section 3); email codes
work without it. No push on Android until FCM is set up (B-2).

## 8. Remaining for testers, regardless of platform

Gate 5 (safety complete) is open: the moderation admin (H7) is not deployed, the community guidelines,
privacy policy and terms have no URLs, and help and feedback has no destination (BETA-READINESS sections
4 and 7). These are needed before the first outside tester, whatever the install route.
