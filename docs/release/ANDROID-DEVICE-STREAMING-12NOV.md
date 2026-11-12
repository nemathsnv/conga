# Conga on a real Android phone through Android Device Streaming (12 Nov 2026)

The first run of Conga on real Android hardware: a Samsung Galaxy A15, streamed from Google's device lab. It follows the
emulator pass (`ANDROID-EMULATOR-2NOV.md`) and uses the tooling in `scripts/android-device/`.

**Nothing hosted was used:**
- the phone ran the debug build against the **isolated local stack** `shortcut-and` and the fake Mux on the Mac, reached through `adb reverse`;
- no production account, upload, Mux asset or data was created;
- nothing was pushed, merged or deployed;
- the iPhone and the security-migration sessions were not touched.

Evidence is in [`screenshots/android-device-streaming-12nov/`](screenshots/android-device-streaming-12nov/). The clips, the full
logcat (209,000 lines) and the screen recordings stay on the Mac in `~/Library/Caches/conga-android/device-localhost_59348/`.

## Session

| | |
| --- | --- |
| Service | Android Device Streaming, via the Android CLI (`android device remote`) |
| Project | Firebase `conga-cf7aa`: Spark, **billing disabled**. Nemat enabled the Device Streaming API. No charge is possible without a billing account. |
| Reservation | `2uu2auaax4ln4`, 10:53:22 to 11:04:40 WITA. **About 11 of the 30 free monthly minutes** were used; the phone was returned early. |
| Phone | Samsung Galaxy A15, SM-A155M, Android 14 (API 34) |
| Chipset and memory | MediaTek Helio G99 (MT6789), 6 GB RAM |
| Screen | 1080 × 2340, 450 dpi, 3-button navigation |
| Hardware encoders | `c2.mtk.avc.encoder` (H.264), `c2.mtk.hevc.encoder` |
| Lab conditions | The **front camera is covered** (black). The **back camera faces a grey surface**. The **microphone picks up the room** (racks, fans). Network is the lab's, not mobile data. |

## Results

**Passed on the real phone**

| Check | Result |
| --- | --- |
| `adb reverse` over the streamed connection | **Works.** The phone reached Metro (200) and the stack's API. |
| Install and launch | The 93 MB debug APK installed in 16 s; the app was ready 44 s after launch, including the 8.7 MB development bundle over the tunnel. |
| Sign-in | Email code sign-in against the local stack. |
| Home feed | HLS from Mux plays through ExoPlayer. The tab bar sits correctly above Samsung's 3-button navigation bar. |
| Recorder | Record, Pause, Resume, flip front to back during a take, Stop, then Post Review. |
| Stitching on the hardware encoder | Media3 Transformer used `c2.mtk.avc.encoder` (H.264) and AAC. |
| 30 s limit | Take 2 (12 s, a pause, then recording again) **stopped by itself** at the 30 s total. |
| Torch | Light on, back camera: CameraX turned the torch on and **kept it on when recording started**. |
| Real microphone | **48 kHz stereo AAC, 131 kbps**, real sound at a high level (peaks about 17,000–24,000 of 32,767). **No gap between audio buffers across the pause and flip joins.** |
| Resolution | **1920 × 1080 at about 30 fps**, rotation 90: the 1080p setting is honoured. |
| Post Review | Plays the stitched clip; Discard through Back works. |
| Stability | No crash, no ANR. The only JavaScript warning was the expected push-token failure (no `google-services.json`, B-2). |

**Measured** (from CameraX and Media3 logs on the phone)

| | Take 1: front, pause, flip | Take 2: back, Light on, 30 s |
| --- | --- | --- |
| Segments (recorder time) | 5.5 s, 4.4 s, 4.3 s | 12.5 s, 17.2 s |
| Stitched clip | 13.5 s, 3.2 MB | 29.2 s, 18.1 MB |
| Video bitrate (stitched) | **1.5 Mbps** (a black picture) | **4.7 Mbps** |
| Stitch time | **9.8 s** | **20.1 s** |
| Mid-take flip gap | **1.2 s** (segment 2 stop to segment 3 start) | n/a |
| Lost at each segment start (first keyframe) | 0.66 s, 0.44 s, 0.57 s | 0.58 s, 0.47 s |

## Findings for Nemat (not changed; each needs a decision or another device run)

1. **The 2.5 Mbps target is not held after stitching on this MediaTek encoder.**
   - The 29 s back-camera clip came out at 4.7 Mbps and 18 MB, about twice the size planned (`RECORDING_SETTINGS`: about 9 MB for 30 s).
   - Over the 1.5–2.1 Mbps measured on Bali 4G, that is roughly 70–95 s of upload instead of about 40 s.
   - The stitcher asks Media3 for 2.5 Mbps, but the encoder runs variable-rate.
   - Possible fix: ask for constant bitrate (`VideoEncoderSettings.setBitrateMode(BITRATE_MODE_CBR)`) in `VideoStitcherModule.kt`. It is a native change, so it needs a new build and **another device run to prove it**. Not done.
   - Only multi-segment takes (pause or flip) are stitched. What CameraX writes for a single-segment take was not measured, because the segments were deleted after stitching. Next run: pull a one-segment take.
2. **Stitching takes about 0.7× real time** on this mid-range phone: 20 s for a 30 s take.
   - Post Review starts it on open, and Post waits for it. A person who records with a pause and posts at once waits up to about 20 s before the upload even starts.
   - Is that acceptable for the beta, or does Post Review need to show it? There is no approved board for a stitching state, so it would need design first.
3. **About 0.5 s is lost at the start of every segment.** CameraX writes from the first keyframe. A 30 s take with one pause gave 29.2 s; take 1 lost 1.7 s over three segments. More pauses or flips lose more. A product question: is "30 s of recorded time" satisfied?
4. **The torch "re-apply" blink is not needed on Android.**
   - The iOS workaround turns the torch off and on 0.7 s into each segment. CameraX on the A15 never dropped the torch, so on Android the blink only makes a short (about 110 ms) flicker early in each segment.
   - Whether the flicker is visible needs a phone in hand. If it is, the fix is to skip the blink on Android (`record/[promptId].tsx`, `blinkTorchIfBack`).

## Still needs a phone in hand

- **Picture:** the front camera is covered and the back camera sees a surface.
- **Sound you can judge:** the lab gives rack noise. Speech across the pause and flip joins needs a person.
- **Mobile data in Bali,** upload over 4G, and a kill at about 30 % then Retry.
- **A successful upload on Android:** a real phone does not trust the fake Mux's certificate. A real Mux upload needs Nemat's approval.
- **Pinch zoom** (multi-touch cannot be sent through `adb`), and thermal behaviour over longer use.
- **Other chipsets** (Qualcomm, Exynos, Unisoc). The free minutes left this month (about 19) cover one more phone, for example a Galaxy A16 or a moto g.

## Gate 1 on Android

**Not closed.** Real hardware confirms that recording, pause/resume, flip, stitching on the hardware encoder, torch, the 30 s limit, playback and a real 48 kHz microphone path all work. Open items:
- the bitrate overshoot (finding 1);
- picture and heard sound on a phone in hand;
- Bali mobile data;
- a real Mux round trip.

Only Nemat closes the gate.
