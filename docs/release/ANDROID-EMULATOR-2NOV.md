# Android on the emulator (2 Nov 2026)

First run of Conga on Android, and what it takes to finish Android Gate 1 without buying a phone.
Branch `claude/conga-android-testing-70f78a`, based on `claude/conga-beta-readiness-0d8b16` at `3ee6d95`.
Local commits only.

**Nothing was pushed, merged, deployed or published:**
- no hosted Supabase project, Mux account, migration, secret or schedule was touched;
- no production account, upload or data was created;
- the iPhone and its app were not touched;
- the revocation and member-gate sessions' branches and worktrees were not touched.

Screenshots are in [`screenshots/android-emulator-2nov/`](screenshots/android-emulator-2nov/).

## 1. What ran where

**Everything below is emulator evidence.** None of it was run on a real Android phone.

| | |
| --- | --- |
| Emulator | Android Emulator 37.2.13, Apple Silicon (HVF), host GPU |
| Virtual device | AVD `Conga_Pixel7_API34`: Pixel 7 profile, 1080 × 2400, 420 dpi, 4 GB RAM, 8 GB data, 4 cores. Reusable. |
| System image | Android 14 (API 34), `google_apis` arm64-v8a. This image is rootable, which the test CA below needed. |
| Cameras | front `emulated` (a synthetic test pattern), back `virtualscene` (a 3-D room). The Mac's webcam was **not** used. |
| Microphone | the emulator's virtual mic, host audio off: an 8 kHz mono track of near silence |
| Backend | isolated local Supabase stack `shortcut-and` (ports 558xx) in a scratchpad copy of `supabase/`, seeded, reached through `adb reverse`. The founder stack `shortcut` was not used. |
| Mux | a local fake: HTTP API on 55699 and an HTTPS upload target on 55698, never api.mux.com. A finished upload is "ready" with an existing spike playback id, so playback streams an **existing** spike asset from stream.mux.com. **No Mux asset was created.** |
| TLS | the fake's test CA was bind-mounted into the emulator's system CA store, for successful uploads only. It is non-persistent and gone after the next cold boot. |
| Build | debug dev-client APK, arm64 only, loading JavaScript from Metro: `app/android/app/build/outputs/apk/debug/app-debug.apk` (93 MB, git-ignored) |

## 2. The existing release APK

`claude/conga-beta-readiness-0d8b16/app/android/app/build/outputs/apk/release/app-release.apk`:
- 132.8 MB, universal (arm64-v8a, armeabi-v7a, x86, x86_64);
- `minSdk 24`, `targetSdk 36`, versionName 0.1.0 (1);
- signed with the **debug** keystore (SHA-1 `5e8f16…f625`);
- permissions: camera, record audio, internet, notifications and network state. The three blocked permissions are gone, as `ANDROID.md` section 2 asked.

**It installs and its native code loads, but it crashes about 2 s after launch:**
`Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY`.

- **Cause:** it was bundled on 1 Nov with no `app/.env`. The embedded bundle has no Supabase URL or key, and `lib/supabase.ts` refuses to start without them, as designed.
- **Not an Android defect:** it's a build input.
- **Next APK:** must be built with the public hosted values, either through the EAS `preview` profile (`eas.json` sets the URL; the key comes from the EAS environment) or locally with them exported.
- **Release builds can't target a local stack:** `configError` refuses non-hosted URLs outside `__DEV__`, by design. That is why the tests used a debug build.

## 3. Results

### Passed on the emulator

**Launch and sign-in**
- Cold and warm launch, with no native crash in any run.
- Welcome with the Android button order (Google first, white), and the email code sign-in (local Mailpit code).
- Sign out, then sign in again.

**Home and navigation**
- Home For you plays HLS through ExoPlayer, with vertical paging over three prompts.
- Following, including its empty state with suggestions.
- Discover, Activity, Me, Responses/Replies, Followers/Following, Settings and Edit profile.
- Comments: a comment was posted to the local DB.
- The response player's end screen.

**Android-specific behaviour**
- System Back closes sheets and the PR-Discard sheet first, then screens.
- Back on Post Review asks "Discard this recording?".
- The app renders identically in system dark mode.
- The Android 13+ notification permission prompt **does** appear from N-Prime. `ANDROID.md` section 2 listed this as unverified.

**Camera and microphone permissions**
- Camera and microphone prompts appear.
- "Don't allow" shows A-Camera or A-Mic with the board copy.
- Open Settings, then turning access on and coming back, is read again with no restart: camera granted leads to the mic prompt.

**Recording**
- Record, Pause ("Paused · 0:04", "4 of 30 seconds recorded"), Resume.
- Flip during a take (front to back), then Stop, leads to Post Review.
- PR-Short: "Keep going: responses are at least 2 seconds".
- **30 s limit:** a take of 10 s, a pause, then more stopped by itself at the 30 s total.
- **Leaving the app mid-take:** Home button, then return, shows Paused with the time kept and Resume.

**Stitching** (Media3 Transformer; files pulled from the emulator and read with AVFoundation)
- One H.264 + AAC MP4 at 720p (the emulator camera's maximum; 1080p was asked for).
- Rotation 90 is correct.
- Video at 2,567 kbps for the textured back-camera scene, and 393 kbps for the static test pattern (the encoder is variable-rate).
- Frames show front then back in order.
- The audio track is continuous across the joins: no gap between buffers.

**Post Review**
- Plays the stitched clip.
- Discard deletes the file. Re-record and Post work.

**Upload**
- An untrusted TLS certificate gives X-Upload-Failed ("Your response didn't post. It's saved on this phone").
- The failed post survives an app restart.
- Retry uploads the **identical** stitched file (`cmp` equal), and the response goes live and shows on Me.
- A hung upload killed at 100 % shows Retry after relaunch; Retry then posts live with its caption.
- A 500 from the upload host fails; the banner's Discard leads to P4 and Discard: the row becomes `deleted` server-side (`abandon-submission`) and the file is removed.

**Offline**
- Airplane mode mid-session shows A-Offline while the loaded video keeps playing.
- An offline cold start shows A-Offline over the loading state, with no crash.
- The banner clears when the connection is back.

### Found and fixed (commits on this branch)

| # | Defect on Android | Cause | Fix | Commit |
| --- | --- | --- | --- | --- |
| 1 | **The keyboard covered the comment field and Video button, the email screen's Continue, the code screen's Continue and the Post Review caption.** Comments were typed blind; Continue could not be tapped. | The app draws edge to edge (`edgeToEdgeEnabled`), so `adjustResize` no longer shrinks the window, and every `KeyboardAvoidingView` was off on Android. The comment bar was `position: absolute`, which padding cannot move (the same cause as the iOS confirm-email footer, `23b0837`). | `KEYBOARD_BEHAVIOR = 'padding'` on both platforms (`ui/keyboard.ts`). The comment bar is in the flow (`marginTop: 'auto'`). | `d3d2855` |
| 2 | **A captioned response could not be posted.** After typing a caption, Back hid the keyboard but Post and Re-record never came back. The only ways out were X and Back, both to Discard. | Android's Back hides the keyboard but keeps the field focused; Post Review shows its buttons only when the caption is not focused. | `useBlurOnKeyboardHide`: when the keyboard hides, the field is left. iOS is unchanged. | `23da137` |
| 3 | **Home opened on Following** in 2 of 3 cold starts. This was also the source of the "Cannot set prop 'player' … shared object that was already released" errors. | Android ends a momentum scroll on the horizontal pager with no drag at launch, sometimes at offset 0, and `SwipePages` took it for a swipe. | Only a swipe changes the page; any other settle puts the pager back. Verified: in 5 cold starts, 4 captured on For you (the 5th was still loading at the screenshot) and **0** released-player errors in all 5 (before, they came with every switch); swipes and taps work on Home and Me. | `9f9063e` |
| 4 | **The status bar was unreadable:** white icons on Discover and Activity after Home, dark icons over Home's video after Me. It depended on the order tabs were first opened. **Likely the same on iOS (not checked).** | Each screen mounted a `<StatusBar>`, expo-status-bar applies the last one mounted, and tabs stay mounted. | One rule in the root layout from the focused route (`ui/statusBar.ts`); overlays keep the screen beneath. | `afbec50` |
| 5 | The hidden code field's digits showed as a grey speck beside the first box. | Android draws the 1 pt text despite `color: 'transparent'`. | `opacity: 0` on Android only (focus, typing and paste still work). | `789d370` |
| 6 | Every launch logged `Custom sound 'default' not found`, a red error toast in development builds. | expo-notifications reads `sound: 'default'` as a file name. | Omit `sound`; the channel is identical (system default sound). | `0760d82` |

**Tests**
- New regression tests: `src/__tests__/androidLayout.test.ts` (`41064a2`, plus the hook test in `23da137`) and `swipePagesPin.test.tsx` (`9f9063e`).
- The pager test fails on the old code.
- Typecheck and lint are clean. **Jest: 43 suites, 538 tests** (528 before).

### Seen, not fixed (for Nemat or a real phone)

- **Push token:** Android fails with "Default FirebaseApp is not initialized". This is expected (no `google-services.json`, BLOCKERS B-2); the app logs and carries on.
- **PKCE:** `supabase-js` warns "WebCrypto API is not supported … plain instead of sha256". The PKCE challenge is plain on Hermes. It matters for the Apple-on-Android web flow (`ANDROID.md` section 3). Security call for Nemat; not changed.
- **Lost seconds at each segment start:** CameraX starts writing at the first keyframe, 0.25–0.45 s after each segment starts on the emulator. A 30 s take with one pause produced a 28.7 s file. Measure on a real phone; more pauses or flips lose more.
- **Emulator timings, not to be quoted as phone performance:**
  - stitching took 8.5 s for a 21 s two-camera take and 25.8 s for a 29 s take (software encoder);
  - the mid-take flip took 2.7 s between segments.
- **Orphan recording:** killing the app on Post Review (before Post) leaves the recording file in `files/recordings` with nothing pointing at it. This is the known "orphan files never swept" gap; it is not Android-only.
- **Not testable here:**
  - pinch zoom (single-pointer input only; the 1× button exists);
  - torch (the emulator has none);
  - real camera picture and sound;
  - hardware encoder;
  - thermal and performance;
  - mobile data;
  - Google sign-in (no client ids);
  - real Mux upload and transcoding;
  - push delivery.

## 4. What only a real phone can close (Gate 1, `spike/CHECKLIST.md` on Android)

1. **Real capture:** the codec, profile, resolution, bitrate and frame rate the phone's encoder produces, and whether 2.5 Mbps holds.
2. **Real sound:** sample rate (the emulator gave 8 kHz), and sound across pause and flip joins **heard**, not just track continuity.
3. **Performance:**
   - stitch time on a mid-range hardware encoder;
   - the mid-take flip gap;
   - cold and warm first frame;
   - two players plus the camera at once (decoder limits).
4. **Network:** upload over Bali 4G; kill at about 30 % and Retry; offline Post, then reconnect.
5. **Torch, zoom and devices:** torch on the back camera during recording; zoom range (`ANDROID_ASSUMED_MAX`); front/back orientation on one OEM.
6. **One real Mux upload and playback** of an Android-recorded clip. This needs Nemat's approval (real Mux asset).

## 5. Real devices without buying one

Checked on 2 Nov against `firebase.google.com/docs/test-lab/usage-quotas-pricing` and
`developer.android.com/studio/run/android-device-streaming`; the rest is from a research pass and marked so.

- **Android Device Streaming (Firebase, in Android Studio): the best fit.**
  - **Cost:** 30 free minutes per project per month on the free Spark plan; on Blaze, the same 30 then $0.15 a minute.
  - **Devices:** real Pixels, plus partner labs from Samsung, Xiaomi, OPPO, OnePlus, vivo and Transsion. A partner lab is enabled per project in the Cloud console by an Editor or Owner. Standard pricing applies unless the catalog says otherwise.
  - **Access:** a full ADB-over-SSL session, so our own APK, logcat, screenshots and `screenrecord` all work.
  - **Camera and microphone are not documented.** Expect a lens facing the inside of a rack and room noise.
  - It still runs the real recorder, hardware encoder, stitcher, upload and ExoPlayer, which is most of Gate 1's technical risk.
- **Firebase Test Lab:** scripted tests only (Robo or instrumentation), not interactive. Spark gives 5 physical runs a day; Blaze gives 30 physical minutes a day, then $5 per device-hour. It doesn't help with manual recording.
- **Other services** (research pass, not verified by me):
  - BrowserStack, LambdaTest, Sauce Labs and Kobiton inject a still image or video into the camera, usually by re-signing the APK.
  - None documents that injection reaches a CameraX video recording, and Sauce Labs excludes React Native apps.
  - AWS Device Farm (1,000 one-time trial minutes, then $0.17 a minute) says the real cameras work but "may look dark and blurry".
  - Samsung Remote Test Lab is free, but users report an obstructed camera and static audio.
- **No cloud option gives a usable "point the phone at a face and talk" session.** Checks 1 and 2 above (picture and heard sound) need a phone in hand:
  - borrow one from a Canggu beta tester (free, and the target audience), or
  - buy a used Redmi Note 13 or Galaxy A15 locally, roughly Rp 1.4–2.4 M (research-pass prices, Oct 2026).

## 6. Next step

Use Android Device Streaming's free 30 minutes on one partner-lab mid-range phone (Samsung A-series or Redmi) for checks 3, 5 and the network-free parts of 1. It costs nothing on Spark.

**Nemat has to:**
1. sign in to Google in Android Studio (Device Manager, then Firebase);
2. pick or create a Spark Firebase project;
3. enable the partner lab if asked.

**Then this session can:**
1. install the APK;
2. run the record → pause → flip → stop → stitch → Post Review path;
3. pull the stitched file for analysis;
4. collect logcat.

**Still to try:** whether `adb reverse` works over the streamed connection. If it does, the debug build can use the isolated stack, so no hosted data at all. If it doesn't, a preview APK against the hosted project needs Nemat's approval.

**Still needs a phone in hand:** the picture and heard-sound checks (1 and 2).
