# Android device sessions

Run the debug app on an Android emulator or a streamed remote phone (Android Device Streaming) against an
**isolated local backend**. Nothing here reaches the hosted project, real Mux or the founder stack `shortcut`.
Results of the first run: `docs/release/ANDROID-EMULATOR-2NOV.md`.

| File | What it does |
| --- | --- |
| `backend.sh up\|down\|status` | Starts the local stack `shortcut-and` (ports 558xx, a copy of `supabase/`, seeded), the Edge functions with fake-only Mux settings, the fake Mux and Metro, and warms the Android bundle. State lives in `~/Library/Caches/conga-android` (`CONGA_ANDROID_WORK`). |
| `fake-mux.mjs` | Mux API subset (http 55699) and an HTTPS upload target (55698). A finished upload plays an existing spike asset; no Mux asset is created. `<work>/fakemux/mode`: `ok`, `fail500` or `hang`. |
| `session.sh <step>` | Drives one device by accessibility labels: `info`, `setup`, `reverse-check`, `launch`, `signin`, `respond`, `take`, `stitchwait`, `pull`, `probe`, `discard`. Run it with no step to list them. |
| `probe.swift` | Reads a pulled clip with AVFoundation: codecs, bitrate, frame rate, rotation, audio rate, gaps between audio buffers, frames. |

## Before a session

- `app/.env` points at `http://127.0.0.1:55801` with the stack's **JWT** anon key. Not the `sb_publishable_` key: the Edge functions compare against the JWT one.
- The debug APK has been built from `app/` (`app/android/app/build/outputs/apk/debug/app-debug.apk`; `expo prebuild` and Gradle `assembleDebug`).
- The phone reaches the Mac only through `adb reverse` (8081 Metro, 55801 API, 55698 fake upload). Run `reverse-check` first. If it fails, stop: do not point a build at the hosted project without Nemat's approval.

## Order of a session

```bash
scripts/android-device/backend.sh up
export SERIAL=<adb serial>
scripts/android-device/session.sh info
scripts/android-device/session.sh setup
scripts/android-device/session.sh reverse-check
scripts/android-device/session.sh launch
scripts/android-device/session.sh signin
scripts/android-device/session.sh respond
scripts/android-device/session.sh take t1 r5,p2,r4,f,r5    # record 5 s, pause 2, resume 4, flip, 5 s, Stop
scripts/android-device/session.sh stitchwait
scripts/android-device/session.sh pull t1
scripts/android-device/session.sh discard
scripts/android-device/session.sh respond
scripts/android-device/session.sh tap "Flip camera" exact
scripts/android-device/session.sh tap "Light, off" exact
scripts/android-device/session.sh take t2 r12,p2,r22       # back camera, light on, stops by itself at 30 s
scripts/android-device/session.sh stitchwait
scripts/android-device/session.sh pull t2
scripts/android-device/session.sh probe t1 1 4 8           # after the device is returned
```

About 3 minutes of device time on the emulator.

## Limits

- A real phone does not trust the fake Mux's certificate, so uploads fail there. That exercises the failure path only.
- `uiautomator` cannot read the screen while a video plays. That is why `respond` uses the `+` position cached at sign-in, and `discard` uses Back.
- Pinch zoom cannot be sent with `adb input`.
