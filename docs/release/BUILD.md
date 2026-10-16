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
