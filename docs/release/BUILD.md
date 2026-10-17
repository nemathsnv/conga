# Building the Shortcut app

How to get from a clean checkout to a working JavaScript toolchain, and what each kind of native build
needs. Written 16 Oct 2026 for the multi-agent effort; everything here was run on the dates and versions
stated, or is marked "not run".

Scope: the Expo app in `app/`. Backend deployment is `supabase/README.md`. Store and tester builds are
`docs/release/IOS.md`, `docs/release/ANDROID.md` and the order of work is `docs/release/RELEASE-CHECKLIST.md`.

## 1. Tool versions

| Tool | Version used | Notes |
| --- | --- | --- |
| Node | 24.19.0 (installed with fnm) | React Native 0.86 accepts `^20.19.4 \|\| ^22.13.0 \|\| ^24.3.0 \|\| >=25`. No `.nvmrc` is committed; use Node 24 LTS or 22. |
| npm | 11.17.0 (ships with Node 24.19) | npm 11 prints an `allow-scripts` warning for `fsevents` and `unrs-resolver`. It is a warning only: nothing fails and nothing in the app needs those install scripts. |
| Expo SDK | 57 (`expo` 57.0.26 installed) | `npx expo-doctor`: 20 of 21 checks pass; the failing one is ten patch-level mismatches (for example `expo-router` 57.0.24 installed, 57.0.28 expected) inside the `~57.0.x` ranges. Not upgraded: no unrelated upgrades in this effort. |
| React Native / React | 0.86.3 / 19.2.3 | Pinned in `app/package.json`. |
| Xcode, CocoaPods | whatever the founder's Mac has | iOS builds only; see section 5. Not run in this effort. |
| JDK 17, Android SDK | not installed on this machine | Android has never been built (BETA-READINESS section 3). |

## 2. Clean install, and why `app/.npmrc` exists

```bash
cd app
rm -rf node_modules
npm ci
npm run typecheck     # tsc --noEmit
npm run lint          # expo lint
npm test              # jest
```

Result on 16 Oct 2026 (macOS, Node 24.19.0, npm 11.17.0, branch of `claude/shortcut-multi-agent-execution-93fee4`
plus this effort's commits): `npm ci` succeeds (677 top-level entries in `node_modules`), typecheck exit 0,
lint exit 0, Jest **17 suites, 246 of 246 tests passed**.

### What was wrong

Before this change `npm ci` failed with `Missing: react-native-gesture-handler@3.3.0 from lock file` and 17
more (reanimated 4.7.1, worklets 0.13.0, `@react-native/metro-config`, `flow-parser`, `react-dom` and others).

- `package.json` is not at fault. Neither `package.json` nor `package-lock.json` changed after 7 Oct
  (`git log -- app/package.json app/package-lock.json`), and no direct dependency was added or moved.
- Cause: `expo-router` 57 depends on `react-native-drawer-layout`, whose peer dependencies are mandatory:
  `react-native-gesture-handler >= 2.0.0` and `react-native-reanimated >= 2.0.0` (reanimated needs
  `react-native-worklets` and `react-native-is-edge-to-edge`). Since npm 7, npm installs peer dependencies
  automatically, and `npm ci` refuses a lockfile that does not contain them.
- The committed lockfile was resolved with peer dependencies **not** installed: it has no `"peer": true`
  entry at all. The installed tree behind the founder iPhone builds agrees: the main checkout's
  `node_modules` has no `react-native-reanimated`, `react-native-gesture-handler`, `react-native-worklets`
  or `react-dom`, and the generated iOS `Podfile.lock` has no pods for them. `npm install --package-lock-only
  --legacy-peer-deps` on the committed lockfile produces **no diff**, so the lockfile is exactly the
  legacy-peer-deps tree.
- The app never uses a drawer, reanimated or gesture-handler (`grep` of `app/src` finds none).

### The choice that was made, and the one that was not

`app/.npmrc` contains `legacy-peer-deps=true`. With it, `npm ci` and `npm install` reproduce the tree that
every verified build and every test run so far used. `package.json` and `package-lock.json` are untouched.

The alternative is a lockfile that adds the peers. Measured: `npm install` without the flag adds 18
packages and changes no existing version and removes none:

- native modules: `react-native-reanimated` 4.7.1, `react-native-worklets` 0.13.0,
  `react-native-gesture-handler` 3.3.0 (plus `react-native-is-edge-to-edge` 1.3.1 and `react-dom` 19.3.1 with
  its `scheduler`);
- build tooling: `@react-native/metro-config` and `@react-native/babel-preset` and
  `@react-native/metro-babel-transformer` (0.86.3), six `@babel/plugin-transform-*` plugins,
  `@types/react-test-renderer`;
- and it changes the metadata of 78 existing entries (mostly `dev` to `devOptional`).

It was rejected because three of those are native code that Expo autolinking would compile into every
iOS and Android binary, none is pinned by Expo SDK 57, and the app uses none of them. If Nemat prefers the
default npm behaviour, delete `app/.npmrc`, run `npm install`, commit the new lockfile, and run the first
native build as a fresh verification.

Consequences to know:

- Anyone who runs `npm install <package>` in `app/` also gets legacy peer resolution; npm will not warn
  about missing peers. That is the state the repo has always been in.
- EAS Build runs `npm ci` in `app/`, so it reads `app/.npmrc` too. Nothing else is needed for that.
- If a future dependency adds a hard peer that is genuinely needed at runtime, `npm ci` will not install it
  for you; add it to `package.json` explicitly.

## 3. Environment values

`app/.env` (git-ignored) holds public client values only. `app/.env.example` lists every name.

| Name | Read by | Needed for |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/env.ts` at bundle time | every build. Hosted: `https://<ref>.supabase.co` and the **publishable** key (`sb_publishable_...`). Local stack: LAN URL and the local anon key. |
| `EXPO_PUBLIC_WEB_BASE_URL` | `src/lib/links.ts` | share links; empty means `<SUPABASE_URL>/functions/v1/web` |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | `src/lib/env.ts` | Google sign-in |
| `GOOGLE_IOS_URL_SCHEME` | `app.config.ts` at prebuild | iOS Google plugin; without it the plugin is left out |
| `APPLE_TEAM_ID` | `app.config.ts` | iOS signing team for local builds |
| `EAS_PROJECT_ID` | `app.config.ts` (`extra.eas.projectId`) | push tokens and EAS builds; from `eas init` (not run) |
| `GOOGLE_SERVICES_JSON` | `app.config.ts` (`android.googleServicesFile`) | Android push (FCM) |
| `EXPO_PUBLIC_DEV_TOOLS` | `src/lib/env.ts` | `1` shows the Me tab dev controls and phase labels. Must be unset or `0` for any build a tester sees. |
| `EXPO_PUBLIC_FOUNDER_BUILD` | `app.config.ts`, `src/lib/env.ts` | set only by `app/scripts/founder-ios.sh` |

Rules the repository enforces today:

- A key that starts with `sb_secret_`, a service-role JWT or any provider secret must never appear in these
  names. `git grep` for `service_role`, `sb_secret_`, JWT-shaped strings, `-----BEGIN` and `client_secret`
  over `app/` (excluding the lockfile and tests) finds nothing (16 Oct 2026).
- `.env`, `.env.*` (except `.env.example`), `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`, `*.pem`,
  `google-services.json` and `GoogleService-Info.plist` are git-ignored at the repository root.
- EAS uploads tracked files only, so **`.env` never reaches an EAS build**. `eas.json` therefore pins the
  hosted URL for `preview` and `production`, and the key, Google ids and other values must be EAS
  environment variables (visibility "plain text" is fine for the publishable key and client ids; they are
  public by design) in the matching environment. See `docs/release/RELEASE-CHECKLIST.md`.
- On EAS build servers only, `app.config.ts` refuses a `preview` or `production` build whose URL is not
  `https://<ref>.supabase.co`, whose key is not `sb_publishable_...`, or which has dev tools or the founder
  switch on. Checked locally by simulating `EAS_BUILD=true EAS_BUILD_PROFILE=...` with empty, localhost and
  valid values (empty and localhost: refused with the reasons; valid: accepted; `development` and a plain
  local run: unaffected). The EAS run itself is not tested.

### If the Supabase values are missing at runtime (open item for Agent C)

`src/lib/env.ts` has `missingConfig()` but nothing calls it. `src/lib/supabase.ts` builds the client with
`createClient(SUPABASE_URL || 'http://localhost', SUPABASE_ANON_KEY || 'anon', ...)`. A build with an empty
`EXPO_PUBLIC_SUPABASE_URL` therefore starts normally and every request fails later against `http://localhost`.
The exact change (not made; `app/src` is not this role's) is in `docs/release/RELEASE-CHECKLIST.md`, item
"Fail clearly on missing Supabase config".

## 4. JavaScript-only checks

```bash
cd app
npm run typecheck && npm run lint && npm test
EXPO_NO_DOTENV=1 npx expo config --type public     # the resolved public config
EXPO_NO_DOTENV=1 npx expo-doctor
```

`EXPO_NO_DOTENV=1` stops Expo loading `app/.env`, which on the founder's machine points at the local stack.

## 5. Native projects (prebuild)

`ios/` and `android/` are generated by `npx expo prebuild`, are git-ignored, and are not committed. Only
`app.config.ts`, `plugins/` and the dependencies define them.

```bash
cd app
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8     # CocoaPods fails with an encoding error otherwise
npx expo prebuild --clean                       # regenerate both projects from app.config.ts
npx expo prebuild --no-install --platform ios   # generate only, no pod install: safe on a throwaway copy
```

- A prebuild into a throwaway copy was run on 16 Oct 2026 for both platforms (`--no-install`, no pod
  install, no Gradle). Results used in `IOS.md` and `ANDROID.md`: iOS bundle id `app.shortcut`, entitlements
  `aps-environment=development` and `com.apple.developer.applesignin=Default`, deployment target 16.4,
  camera, microphone and photo strings from `app.config.ts`; Android package `app.shortcut`, `versionCode 1`.
  The copy was deleted.
- The founder iPhone build regenerates `ios/` with its own bundle id and entitlements
  (`app/scripts/founder-ios.sh`). Run `npx expo prebuild --clean` with the normal `app/.env` to return to the
  regular project.
- Local plugins: `plugins/withSceneLifecycle.js` (iOS scene lifecycle, needed on iOS 27) and, founder build
  only, `plugins/withoutPersonalTeamCapabilities.js`.
- Native builds on a Mac (`npm run ios`, `npm run android`) are owned by the build agent in this effort and
  were not run for this document.

## 6. EAS builds (not run; nothing here may be run without Nemat)

`eas.json` profiles: `development` (dev client, iOS simulator, dev tools on), `preview` (internal
distribution, Android APK, dev tools off) and `production` (store distribution). Build numbers are kept by EAS
(`appVersionSource: remote`, `autoIncrement: true`). Prerequisites in order: an Expo account, `eas init` in
`app/` (creates the project id), EAS environment variables, signing credentials per `IOS.md` and
`ANDROID.md`. The repository root also holds `design/` and `spike/`; they upload with the project archive
unless an ignore file is added (the project archive honours `.gitignore`; adding a root `.easignore` replaces
those rules, so copy them into it first).

## 7. Release build dry run (17 Oct 2026; no EAS call, no native build)

What was checked on the merged tip (`3908825`: Agents A to E, the failed-post UI and the camera flip are in), with no
account and nothing built:

| Check | Command | Result |
| --- | --- | --- |
| Clean install | `rm -rf node_modules && npm ci` in `app/` | succeeded (1045 packages added; 677 top-level entries) |
| Types, lint, tests | `npm run typecheck`, `npm run lint`, `npm test` | exit 0, exit 0, **25 suites, 347 of 347** |
| Native projects generate for both platforms | `EXPO_NO_DOTENV=1 LANG=en_US.UTF-8 npx expo prebuild --no-install --platform all` in a throwaway copy of `app/` (deleted afterwards) | **succeeded**. Android app manifest: `CAMERA`, `INTERNET`, `RECORD_AUDIO`, `VIBRATE`, and `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` as `tools:node="remove"`. iOS entitlements `aps-environment` (`development` locally) and `com.apple.developer.applesignin`. The `video-stitcher` module needs no config plugin: its `expo-module.config.json` is autolinked from `app/modules`; its registration in `ExpoModulesProvider.swift` and Gradle only appears at `pod install` and Gradle time, which were not run |
| EAS-only guard | `EAS_BUILD=true EAS_BUILD_PROFILE=<p> npx expo config --type public` | empty values for `preview`: refused; `production` with `http://localhost:54321` and dev tools on: refused; valid hosted values: accepted. Unchanged since 16 Oct |
| `eas.json` against the new code | read | **nothing to change.** The merged routes (`r`, `p`, `u`, `a`) and the failed-post UI read no new environment variable; the only `process.env` names in `app/src` and `app.config.ts` are the ones already in `.env.example` and the profiles (`EXPO_PUBLIC_SUPABASE_URL`, `_ANON_KEY`, `_GOOGLE_WEB_CLIENT_ID`, `_GOOGLE_IOS_CLIENT_ID`, `_DEV_TOOLS`, `_FOUNDER_BUILD`, `_WEB_BASE_URL`, `GOOGLE_IOS_URL_SCHEME`, `APPLE_TEAM_ID`, `EAS_PROJECT_ID`, `GOOGLE_SERVICES_JSON`). `app.config.ts` changed only by the Android `blockedPermissions` block since the first release-configuration commit |
| Founder script against the config | `EXPO_PUBLIC_FOUNDER_BUILD=1` with dummy hosted values, `npx expo config` | bundle id `app.shortcut.founder`, `usesAppleSignIn: false`, `withoutPersonalTeamCapabilities` plugin present, team id read from `APPLE_TEAM_ID`; `founder-ios.sh` still names workspace `ios/Shortcut.xcworkspace`, scheme `Shortcut` and launches `app.shortcut.founder`. The script's checks (hosted URL pattern, `sb_publishable_` key, device UDID, team id) match `app.config.ts` and `src/lib/env.ts` |

Not done: a native build, `pod install`, Gradle, any `eas` command, and the install of the stitcher module on a
phone (`CAMERA-FLIP.md`).

### The commands, per profile (run only when `STAGE-4-SETUP.md` says its items exist; each is Nemat's call)

All from `app/`. `npx eas-cli login` first (item S1). Never pass a secret on the command line; values come from the EAS
environment of the profile or from the credential prompts.

| Profile | Command | Output | What it needs from `STAGE-4-SETUP.md` |
| --- | --- | --- | --- |
| `development` (dev client, iOS simulator) | `npx eas-cli build --platform ios --profile development` | simulator `.app` | S1, P1. No Apple account needed for a simulator build. EAS `development` environment values are optional (the profile sets only `EXPO_PUBLIC_DEV_TOOLS=1`); point it at a hosted or LAN project through EAS variables |
| `development`, Android | `npx eas-cli build --platform android --profile development` | APK with the dev client | S1, P1. EAS generates an Android keystore (no Google account needed) |
| `preview`, iPhone | `npx eas-cli device:create` once, then `npx eas-cli build --platform ios --profile preview` | **ad hoc** build installed from an EAS link on registered devices | S1, P1, S2/A1, A2, A3, A5, V1; EAS `preview` environment: `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the `sb_publishable_` key), `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `GOOGLE_IOS_URL_SCHEME` (G2, G3, or leave unset to leave Google out), `APPLE_TEAM_ID`, `EAS_PROJECT_ID`; later `EXPO_PUBLIC_WEB_BASE_URL` (W7). The URL, dev tools and founder switch come from `eas.json` |
| `preview`, Android | `npx eas-cli build --platform android --profile preview` | APK | S1, P1; the same environment values (without the Apple and iOS Google ones); `GOOGLE_SERVICES_JSON` as a file variable only for push (P4); the keystore's SHA-1 then goes to G4 |
| `production`, iPhone | `npx eas-cli build --platform ios --profile production` then `npx eas-cli submit --platform ios --profile production` | store build, TestFlight | everything for `preview` except A3 (no UDIDs), plus A9, A10 (`ascAppId` in `eas.json` `submit.production`), App Store Connect access |
| `production`, Android | `npx eas-cli build --platform android --profile production` | app bundle (`.aab`) | S3 and the preview Android items; a Play service-account key for `eas submit` is a further credential (**verify**; the first upload to a new Play app is normally done by hand in the console) |

Reading what a build will do before it runs: `npx eas-cli build:inspect` and `npx eas-cli config --profile <p> --platform <os>`
show the resolved profile and environment **(verify availability in the installed eas-cli version)**. The build server
re-runs `npm ci` in `app/` (so `app/.npmrc` applies), evaluates `app.config.ts` with `EAS_BUILD=true` (so the guard runs:
a wrong URL, key, dev-tools or founder value stops the build before it compiles), and uploads tracked files only (so `.env`
never reaches it; section 3). The repository root also holds `design/` and `spike/`; they upload with the archive.

