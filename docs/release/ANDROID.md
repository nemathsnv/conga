# Android readiness

What it takes to get Shortcut onto a real Android phone and then to Google Play testing. Prepared, not done:
**Android has never been built or run for this app or for the spike** (BETA-READINESS section 3), no Play or
Google Cloud setup exists, and nothing here was purchased or registered. Written 16 Oct 2026. Facts about the app
come from `app/app.config.ts` and a throwaway `expo prebuild --platform android --no-install` (no Gradle run).
Statements about Google's, Firebase's and Expo's services are general knowledge, marked **(verify)** where they
drift.

## 1. Current state

| Item | State |
| --- | --- |
| Package name | `app.shortcut` (permanent once published; same name-approval caveat as the iOS bundle id, `IOS.md` section 2) |
| Version | `versionName 0.1.0`, `versionCode 1` in the project; `eas.json` keeps the code on EAS (`appVersionSource: remote`, `autoIncrement`) |
| SDK levels | React Native 0.86 defaults: `minSdk 24` (Android 7.0), `targetSdk 36` (`node_modules/react-native/gradle/libs.versions.toml`). Confirm in the generated `android/build.gradle` at the first build. |
| Orientation, back gesture | portrait; `predictiveBackGestureEnabled: false` |
| Icon | adaptive icon files exist (`assets/android-icon-*.png`) but are the Expo template; development only until the brand is approved |
| Sign-in on Android | Google native, email code, Apple through the browser (Supabase web flow) |
| Push | expo-notifications is installed; no `google-services.json`, no FCM credentials, no channel |
| App links | none yet (B-3) |

## 2. Permissions

Declared in the prebuilt `AndroidManifest.xml` of the app:

`CAMERA`, `INTERNET`, `RECORD_AUDIO`, `VIBRATE`, `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` (max SDK 32),
`WRITE_EXTERNAL_STORAGE` (max SDK 32).

Added at build time by library manifests (read from `node_modules`, not from a built APK):

| Permission | From | Used for |
| --- | --- | --- |
| `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` | expo-notifications | showing pushes (runtime prompt on Android 13+); rescheduling after reboot |
| `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` | expo-network | the offline banner and Post-waits-for-connection |
| `INTERNET` | expo-video, expo-file-system | streaming, uploads |
| `CAMERA`, plus legacy storage (max SDK 32) | expo-image-picker | the profile photo |

What the app needs, and what is extra:

- Needed: `CAMERA`, `RECORD_AUDIO` (recording without sound is not allowed, SPEC.md Section 6), `INTERNET`,
  `POST_NOTIFICATIONS`, network state. The camera and microphone are asked at the recorder (`A-Camera`,
  `A-Mic` states).
- **Extra and worth removing before Play:** `SYSTEM_ALERT_WINDOW` comes from the Expo template (dev menu
  overlay), `WRITE_EXTERNAL_STORAGE` and `READ_EXTERNAL_STORAGE` come from libraries for pre-Android-13 media
  access the app does not need (the photo library is only used through the system picker). Each one is a line in
  the Play Data safety and permissions review. Proposed addition to `app.config.ts`, **not applied** because no
  Android build exists to confirm it does not break the dev client or the picker:

  ```ts
  android: { /* existing keys */ blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.WRITE_EXTERNAL_STORAGE'] },
  ```

  Debug builds add `SYSTEM_ALERT_WINDOW` from the debug manifest, so blocking it in the main manifest does not
  affect development. Verify on the first release build with `aapt dump permissions app-release.apk`.
- **Notification prompt on Android 13+ (verify):** Expo's documentation says the system permission dialog may not
  appear until at least one notification channel exists. The app never calls `setNotificationChannelAsync`
  (`NOTIFICATIONS.md` gap 4). If N-Prime's "Turn on notifications" shows no system dialog on an Android 13+
  phone, that is the cause; the fix is app code (create a default channel before `requestPermissionsAsync`).

## 3. Google Sign-In

How the app signs in: `@react-native-google-signin/google-signin` obtains a Google ID token on the phone;
`supabase.auth.signInWithIdToken({ provider: 'google', token })` exchanges it (`src/lib/auth.ts`). It needs
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` on Android (and the iOS client id on iOS).

Set up (nothing created yet; needs a Google Cloud project owned by Nemat):

1. Google Cloud console -> APIs & Services -> OAuth consent screen: user type External; app name, support
   email, developer contact; scopes `openid`, `email`, `profile` only. While in "Testing" mode only listed test
   users can sign in (up to 100 **(verify)**); publish ("In production") before outside testers, which for these
   basic scopes needs no Google verification **(verify)** but needs the privacy policy URL on the consent screen.
2. Credentials -> Create OAuth client ID:
   - **Web application**: gives the **web client ID** (goes in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`) and the client
     **secret** (goes in `supabase/.env` as `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`). The web client ID is what the ID
     token's audience is for Android.
   - **Android**: package name `app.shortcut` and the **SHA-1** of the certificate that signs the build. One Android
     client entry per certificate:
     - the **EAS-managed upload keystore** SHA-1 for `preview`/`production` builds: `npx eas-cli credentials` ->
       Android -> shows the fingerprint (after the first build creates the keystore);
     - the **debug keystore** SHA-1 for local `npm run android` builds: `keytool -list -v -keystore
       android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android` once prebuild has run;
     - the **Play App Signing** certificate SHA-1 once the app is uploaded to Play (Play Console -> Setup -> App
       integrity): installs from Play are signed by Google's key, not the upload key. Missing this one is the classic
       "works from the APK, fails from Play" failure (`DEVELOPER_ERROR`, code 10).
   - **iOS** (for completeness, `IOS.md`): bundle id `app.shortcut`; gives the iOS client ID and the reversed
     scheme for `GOOGLE_IOS_URL_SCHEME`.
3. Supabase (hosted), `supabase/.env`:
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<web client id>,<ios client id>` and the web client secret.
   `config.toml` already has `skip_nonce_check = true` for Google (native tokens carry no checkable nonce).
   Prepared diff, **not applied** (the hosted block keeps Google off):

   ```diff
    [remotes.hosted.auth.external.google]
   -enabled = false
   +enabled = true
   ```

   Then `supabase config diff --project-ref picvoavfxnajfjkqawju` (must show only this), preview push with
   `< /dev/null`, interactive push, as in BETA-READINESS section 10. Needs Nemat's approval.
4. Test: Google sign-in completes on a debug build, a preview APK and a Play internal-track install (three
   different signing certificates: all three SHA-1s must be registered); E-Linked appears when the same email
   already has a code or Apple account.

Sign in with Apple on Android uses the web flow: a Services ID, return URL and client secret exactly as in
`IOS.md` section 5; the browser returns to `shortcut://auth/callback`, which the manifest's `shortcut` scheme
intent filter handles. SPEC.md Section 22 still lists "Confirm Sign in with Apple on Android" as open.

## 4. Media compatibility (H.264/AAC MP4 recording, HLS playback)

**Recording.** `RECORDING_SETTINGS` (`src/video/types.ts`): H.264 (`avc1`), 2.5 Mbps, `1080p`, zoom 0, up to 30 s.
Phase 1 chose H.264 at about 2 to 3 Mbps for exactly this reason (`spike/REPORT.md` section 9), because HEVC
(the iPhone default) is a poor choice for Android and the web player.

- On Android expo-camera records through CameraX. The `codec` option of `recordAsync` is documented as iOS
  only; on Android the output is the device's default encoder, normally H.264 with AAC audio in an MP4 container
  **(verify on device)**. Check each test phone: `ffprobe` the file for video codec, profile, resolution, bitrate
  and frame rate, and audio codec. A phone that records HEVC or a variable frame rate would still upload (Mux
  transcodes everything) but would make B-1 stitching and the thumbnail path differ.
- `videoBitrate` is honoured on iPhone within 5 %; whether a mid-range Android hardware encoder honours 2.5 Mbps
  is one of the questions `spike/REPORT.md` section 8 names as unanswered.
- B-1 camera flip during a take needs a stitcher on Android (Media3 `Transformer`, re-encode,
  `docs/BLOCKERS.md`); a segment join across a front and a back camera is where mid-range devices are most likely
  to differ (different encoder profiles, rotation flags).
- Torch: on Android the front camera has no torch either; the spec's front "light" is a screen fill. Whether
  the back torch survives the start of recording on Android is unknown (iOS needs a re-apply 0.7 s after start).

**Playback.** `expo-video` plays Mux HLS (`https://stream.mux.com/<playback id>.m3u8`, `src/video/playback.ts`)
with ExoPlayer/Media3 on Android. Mux's renditions are H.264/AAC, which every supported Android level decodes in
hardware. Points to measure on a mid-range phone:

- Cold first frame. On iPhone the median cold first view was 4.5 s and the app pre-warms assets after `ready`; the
  1 s forward buffer setting (`applyPlaybackSettings`) is **iOS only**, so Android runs with ExoPlayer defaults.
- Two players at once. Home and the response player preload the next clip; mid-range devices usually allow two
  hardware video decoders but a third (a frozen frame, or a "decoder init failed") is the failure to look for
  when the player and a preloaded clip and the camera preview coexist.
- Looping with sound, auto-advance, and the face-strip jump (the sequence player uses `replaceAsync`).
- Throughput: Bali 4G measured 1.5 to 2.1 Mbps on the iPhone; a 30 s clip at 2.5 Mbps is about 9 MB (about 40 s at
  2 Mbps). Foreground upload only (DECISIONS 13 Oct): an Android app moved to the background can have its
  network throttled or its process killed, which the "stays on the phone, Retry" path (SPEC.md Section 19) must
  cover; test it deliberately.

## 5. Push (FCM)

Exact steps are in `NOTIFICATIONS.md` section 4. Android-specific points: Firebase project with an Android app
`app.shortcut`; `google-services.json` supplied to EAS as the file variable `GOOGLE_SERVICES_JSON` (the file is
git-ignored; `app.config.ts` reads the variable); an FCM HTTP v1 service-account key uploaded to the Expo project;
the runtime prompt on Android 13+ (section 2); a notification small icon and colour that need the brand and a
monochrome glyph. Without `google-services.json` in the build, `getExpoPushTokenAsync` fails on Android.

## 6. App links (assetlinks.json)

Prerequisites (B-3, nothing exists): the domain; a route for every shared path in the app (only `/i/<code>`
exists; `/r/<id>`, `/p/<id>`, `/u/<name>` do not); then in `app.config.ts`

```ts
android: { intentFilters: [{ action: 'VIEW', autoVerify: true,
  data: [{ scheme: 'https', host: '<domain>', pathPrefix: '/r' }, { scheme: 'https', host: '<domain>', pathPrefix: '/p' }, { scheme: 'https', host: '<domain>', pathPrefix: '/i' }],
  category: ['BROWSABLE', 'DEFAULT'] }] }
```

and `https://<domain>/.well-known/assetlinks.json` (served as JSON, no redirects) with
`relation: ["delegate_permission/common.handle_all_urls"]`, `package_name: "app.shortcut"` and
`sha256_cert_fingerprints` for **every** certificate that signs an installed build: the EAS upload key (sideloaded
preview APKs) and the Play App Signing key (Play installs). Verify with `adb shell pm get-app-links app.shortcut`
and by tapping a link in a messaging app. Not applied: the domain is not bought, and adding `autoVerify` for a
host that does not serve the file makes verification fail.

## 7. Play Console prerequisites (verify each against current Play policy)

| Item | Note |
| --- | --- |
| Google Play developer account | one-time registration fee, identity verification; personal or organisation, which decides the seller name |
| Closed testing before production | new personal developer accounts have been required to run a closed test with a minimum number of testers for a minimum period before applying for production access; check the current numbers for the account type chosen |
| App content declarations | privacy policy URL (`PRIVACY-POLICY.md` hosted), Data safety form (use the data table in `IOS.md` section 8), content rating questionnaire (18+ self-declaration, user-generated video, no ads), target audience (adults), ads declaration (no) |
| User-generated content policy | in-app report and block (exist), a way to contact the developer (`HELP-AND-CONTACT.md` destination), terms |
| Account deletion | in-app deletion exists; Play also asks for a web-accessible way to request deletion, entered in the Data safety form. **No such page exists.** `ACCOUNT-DELETION.md` describes the process; a hosted URL that explains it and the contact route is needed |
| App access | the app is invite-only; reviewers need working access (same open question as `IOS.md` section 7) |
| Signing | opt into Play App Signing; EAS generates and stores the upload keystore (back it up: `eas credentials`) |
| Release tracks | internal testing (no review, up to 100 testers) first; closed testing next |

## 8. Mid-range Android test plan

**Devices.** At least one real phone matching the beta audience, not an emulator: Android 12 to 14, 4 to 6 GB RAM,
a mid-range chipset (Snapdragon 4/6/7-series or MediaTek Helio/Dimensity G), a Samsung A-series or a
Xiaomi/Redmi/Realme/Oppo model common in Indonesia; a second, older low-RAM phone if one is available. Record the
exact model, Android version, OEM skin, chipset and RAM for every run. Emulators cannot answer the camera,
encoder, decoder or thermal questions.

**Network.** The spike rules apply: mobile data with Wi-Fi off for upload and playback, in Bali. Note carrier and
signal. Record the iPhone comparison from `spike/REPORT.md` for the same clips.

**Part A: the spike checklist on the real app** (the spike app was iPhone-only; run these questions against the
product's recorder and player, `spike/REPORT.md` section 8): output codec, resolution, bitrate and fps of a 10 s
and a 30 s clip; whether 2.5 Mbps is honoured; torch on the back camera during recording; zoom 0 equals the phone's
1x camera; flip before recording; **flip during recording** (B-1: record, flip twice, stop, review plays one clip
with sound across the joins); upload time and failure rate on 4G (21 uploads on iPhone, 0 mid-transfer failures);
interrupted upload (kill the app at about 30 %, reopen, Retry); offline Post then reconnect; cold first frame and
warm first frame for 5 fresh responses; Home loop and response-player auto-advance with the next clip preloaded;
30 s ceiling stops by itself; under 2 s is refused (`PR-Short`).

**Part B: core flows** (each against the hosted project with two accounts):

| Area | Check |
| --- | --- |
| Sign-in | email code; Google (debug, preview APK, Play internal install); Apple through the browser sheet; E-Linked for a mismatched method; 18+ No signs out; invite redeemed from a link and from a code; waitlist; profile name and username availability; photo from the system picker and from the camera |
| Permissions | camera denied and mic denied states (`A-Camera`, `A-Mic`), "don't ask again", return from settings; notification prompt on Android 13+ |
| Core loop | Home, response player, record, review, caption, disclosure, Post, Processing, live; delete a response; pin |
| Conversation | video reply, reply to a reply, comments, likes, Activity, N-Prime timing (first ask after the first public video, second ask after Not now), Settings -> Notifications |
| Push | after FCM is set up: reply, comment grouping, follow, Pause all, tonight 18:30, moderation notice; tap from background and from a killed app |
| Safety | report, block, unblock, removed notice, restricted, suspended, request a review, account deletion with re-authentication and restore by signing in |
| Places | follow a place, suggestion, first-response draft, search, Discover |
| Failure | airplane mode during record, post and playback; background the app while uploading; low storage; low battery saver; a phone call during recording; rotate; split-screen |
| Display | gesture and 3-button navigation bars, notch/cut-out, dark mode (the app is light only: `userInterfaceStyle: light` has no effect on Android without `expo-system-ui`, which the doctor flagged), font scale 130 %, display size large, edge-to-edge on Android 15 and later |
| Links | `shortcut://i/<code>` from a message; later https app links (section 6) |
| Performance | thermal throttling after 10 minutes of recording and playback, memory (watch for OOM kills during stitching), battery drain over a 30 minute session |

Each run records: build id, device, Android version, network, what passed, what failed, a screen recording or
logcat for failures (`adb logcat` through USB). Results go into `docs/BETA-READINESS.md` section 3 so the Android rows stop being "never run".

## 9. Build commands (for whoever owns native builds; not run for this document)

```bash
cd app
npm ci
npx expo prebuild --platform android --clean
npm run android              # debug build to a connected device or emulator (JDK 17 and the Android SDK)
npm run android:release      # release variant, signed with the debug keystore unless configured
npx eas-cli build --platform android --profile preview     # APK for testers; needs the Expo project and env values
npx eas-cli build --platform android --profile production  # app bundle (.aab) for Play
```
