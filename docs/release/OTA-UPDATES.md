# Over-the-air updates (EAS Update)

How a change reaches an installed Conga build without a cable, which changes cannot, and how an update
is published, checked and rolled back. Written 17 Oct 2026. **Nothing has been published:** the EAS
project does not exist yet (`eas init` needs Nemat's Expo account), so every build made so far runs only
the JavaScript it was built with.

## 1. The rule

| Change | How it reaches a phone |
| --- | --- |
| JavaScript or TypeScript in `app/src/` (screens, copy, logic, fixes) | **update** (`scripts/publish-update.sh`) |
| Images and fonts the JavaScript imports | update |
| Anything native: a dependency added, removed or upgraded that has native code; `app.config.ts` (plugins, permissions, bundle id, icon, splash, scheme, `runtimeVersion`); `app/plugins/`; `app/modules/` (the video stitcher); `eas.json`; `app/.gitignore`; an Expo SDK upgrade | **new build** (`scripts/founder-ios.sh release`, `eas build`) |
| Server: migrations, Edge Functions, Supabase or Mux settings | neither: deployed on its own (`supabase/README.md`) |

You do not have to classify a change by hand. The **runtime version is a fingerprint** of the native
project (`runtimeVersion: { policy: 'fingerprint' }` in `app.config.ts`): the hash of the dependencies'
native code, the config plugins and the resolved app config. It is computed when a build is made and
written into it (`Conga.app/EXUpdates.bundle/fingerprint`), and computed again on the Mac when an update
is published. A phone only takes an update whose runtime version equals its own. So:

- an update made after a native change carries a new fingerprint and **reaches nobody**. That is the
  safe failure: the phones keep running what they have. Make a new build.
- JavaScript cannot be sent to a binary whose native code it was not written for.

Check before publishing, without uploading anything: `DRY_RUN=1 app/scripts/publish-update.sh founder "…"`
prints the runtime version; compare it with the one `founder-ios.sh` printed for the installed build (or
`npx eas-cli fingerprint:compare` once the EAS project exists).

Verified on this Mac (17 Oct): the simulator Release build made with the founder values embeds
`487ee37731524ee35f07ac5fcf34c2443614f5f5`; `npx expo-updates runtimeversion:resolve --platform ios` with
the same values, with and without `CONGA_UPDATE_CHANNEL=founder`, gives the same hash; with the tester
values (no founder switch) it gives `0ebe911609eb9c4851c97a677908979adf7f3e60`. The founder build and
tester builds therefore never take each other's updates even if a channel were mixed up. (These two hashes
belong to that checkout; any later native change moves them.)

## 2. Channels

| Channel | Builds that ask for it | Who | Environment of the bundle |
| --- | --- | --- | --- |
| `founder` | the founder iPhone build (`founder-ios.sh release`, bundle id `app.shortcut.founder`, free Personal Team) | Nemat only | `app/.env.founder` with dev tools off and `EXPO_PUBLIC_WEB_BASE_URL=https://conga.churntech.com` |
| `preview` | EAS `preview` builds (ad hoc iPhone, Android APK), `eas.json` `channel` | internal testers | `eas.json` `build.preview.env` plus the EAS `preview` environment (the publishable key) |
| `production` | EAS `production` builds (TestFlight, later the stores) | TestFlight and store testers | `eas.json` `build.production.env` plus the EAS `production` environment |
| `development` | EAS `development` builds (dev client) | developers | not used: a dev client loads JavaScript from Metro |

An EAS build gets its channel from `eas.json`; the founder build, made on this Mac, sends the
`expo-channel-name: founder` header (`app.config.ts`). Until `EAS_PROJECT_ID` exists a build has
`updates.enabled: false` and never asks.

## 3. How an update reaches a phone

1. `scripts/publish-update.sh <channel> "<message>"` exports the JavaScript bundle and uploads it to EAS,
   tagged with the runtime version and the channel.
2. On each **cold start** the app asks EAS for the newest update for its channel and runtime version
   (`checkAutomatically: ON_LOAD`). It does **not** wait for the answer (`fallbackToCacheTimeout: 0`):
   the app opens at once with what it has, and the download continues in the background.
3. The **next** cold start runs the downloaded update.

So after publishing: open Conga, wait a few seconds on a connection, swipe it away in the app switcher,
open it again. Sending the app to the background and back is not a cold start.

If the check fails (offline, EAS unreachable, no update) the app runs what it has; measured on the
simulator 17 Oct with an EAS project id that does not exist: the check fails with HTTP 400 in the
background and Welcome appears as fast as with updates switched off (about 4 to 5 s from launch on the
simulator, both ways).

If a downloaded update crashes before its first screen, expo-updates marks it bad and the next launch goes
back to the previous update or to the one built in (its error recovery). That is a safety net, not a test
plan: try every update on the founder channel first.

## 4. Publishing

Never run a bare `eas update` in `app/`: it would export the bundle with `app/.env`, which points at the
local stack, and that address would be inlined into the code phones run. The script:

- loads only that channel's values (`EXPO_NO_DOTENV=1`); founder: `.env.founder` with dev tools forced
  off and the links domain; preview and production: `eas.json` plus the EAS environment through
  `eas env:exec`;
- sets `CONGA_UPDATE_CHANNEL`, so `app.config.ts` refuses the export (before any upload) unless the
  Supabase URL is the hosted one, the key is a `sb_publishable_` key, dev tools are off, the links domain
  is set, the founder switch matches the channel and the EAS project id is present
  (`releaseProblems`, tested in `releaseConfig.test.ts`);
- refuses uncommitted changes in `app/` and appends the commit to the message, so every update maps to a
  commit;
- passes `--environment` (required by eas-cli for SDK 55 and later); the founder channel uses the EAS
  `development` environment, which must hold no `EXPO_PUBLIC_` variable.

```bash
cd app
DRY_RUN=1 scripts/publish-update.sh founder "Fix the comment count"
scripts/publish-update.sh founder "Fix the comment count"
```

For `production`, consider a staged rollout: `--rollout-percentage 10` on `eas update` (not wired into the
script; add it when there are enough testers for it to mean something).

## 5. Verifying an update

- `npx eas-cli update:list --branch <channel>`: the update group id, message (with the commit), runtime
  version and platforms.
- On the phone: the change is visible after the second cold start (section 3).
- No screen shows the running update's id: that would be a new UI element without a board. With the
  phone on the Mac, Console.app filtered on the process `Conga` and `expo-updates` shows the update it
  launched.
- The EAS dashboard (expo.dev, the project, Updates) shows the update group and, once phones have asked,
  how many launched it.

## 6. Rolling back

| Situation | Command |
| --- | --- |
| The latest update is bad; an earlier one was good | `npx eas-cli update:republish --group <good group id> --destination-channel <channel>` |
| Go back to the JavaScript built into the binaries | `npx eas-cli update:roll-back-to-embedded --channel <channel> --platform ios` |
| A staged rollout is going badly | `npx eas-cli update:revert-update-rollout` (verify the name in the installed eas-cli) |

A rollback is itself an update: phones take it on their next two cold starts, like any other. Run these
from `app/` with the same values as the script (a republish copies an existing bundle, so the environment
does not matter for it; the roll-back-to-embedded publishes no JavaScript).

## 7. What EAS Update does not do

- **It does not extend a free provisioning profile.** The founder build is signed by a free Personal Team;
  its profile expires 7 days after the build, and then iOS will not open the app at all, whatever updates
  it has. Rebuild and reinstall with `founder-ios.sh release` at least weekly (section 8). Data is kept.
- It cannot change native code, permissions, entitlements, the icon or the bundle id (section 1).
- It cannot reach a build made before EAS Update was configured: the first build with `EAS_PROJECT_ID`
  set is the first one that can be updated.

## 8. The founder iPhone, end to end

Once:

1. `npx eas-cli login` (Nemat's Expo account; free).
2. In `app/`: `npx eas-cli init` creates the project `conga` and prints its id. Put it in
   `app/.env.founder` as `EAS_PROJECT_ID=<id>` (and in `app/.env` for other local builds). Because the
   config is `app.config.ts`, eas-cli cannot write the id itself; that is expected.
3. In the EAS dashboard, leave the `development` environment without `EXPO_PUBLIC_` variables.
4. `DEVICE=<udid> app/scripts/founder-ios.sh release` with the iPhone connected (or paired over the
   network, below). It prints the build's runtime version and installs over the existing app, keeping its
   data.

Then, for a JavaScript change: commit, `DRY_RUN=1 …` once, `scripts/publish-update.sh founder "…"`,
cold-start twice on the phone. For a native change, or every 7 days for the profile: step 4 again.

**No cable for step 4.** Xcode can install over the local network: with the iPhone connected once, Xcode >
Window > Devices and Simulators > the iPhone > "Connect via network". After that `xcrun devicectl list
devices` shows it while it is on the same Wi-Fi, and `founder-ios.sh` installs the same way (not tried on
this iPhone yet).
