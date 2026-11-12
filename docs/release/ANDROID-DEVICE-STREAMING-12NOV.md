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

1. **The 2.5 Mbps target is not held at 1080p on this phone, and the cause is Android itself** (confirmed in a second session, below).
   - The 29 s back-camera clip came out at 4.7 Mbps and 18 MB, about twice the size planned (`RECORDING_SETTINGS`: about 9 MB for 30 s).
   - Over the 1.5–2.1 Mbps measured on Bali 4G, that is roughly 70–95 s of upload instead of about 40 s.
   - The cause is not the stitcher. Android's MediaCodec raises a 1080p variable-bitrate encode to its minimum-quality floor; CameraX's own recording on the A15 logged:
     `VQApply: raise bitrate: configured 2500000 to floor 3939840` … `target bitrate raised from 2500000 to 4727808 bps`.
   - The same happens to every recording (one segment, unstitched: 4.78 Mbps) and to the stitch.
   - The floor applies only in variable-bitrate mode, but the A15's encoder (`c2.mtk.avc.encoder`) does not offer constant bitrate, so that route cannot help it. See "Second session" below.
   - **Options (a product decision for Nemat):**
     - (a) accept about 4.7 Mbps at 1080p on Android, doubling upload size and time;
     - (b) record at 720p on Android: **measured 3.0 Mbps** on the A15, 36 % smaller (see "Third session");
     - (c) the platform's hidden opt-out key: not public API, so not recommended.
2. **Stitching takes about 0.7× real time** on this mid-range phone: 20 s for a 30 s take.
   - Post Review starts it on open, and Post waits for it. A person who records with a pause and posts at once waits up to about 20 s before the upload even starts.
   - Is that acceptable for the beta, or does Post Review need to show it? There is no approved board for a stitching state, so it would need design first.
3. **About 0.5 s is lost at the start of every segment.** CameraX writes from the first keyframe. A 30 s take with one pause gave 29.2 s; take 1 lost 1.7 s over three segments. More pauses or flips lose more. A product question: is "30 s of recorded time" satisfied?
4. **The torch "re-apply" blink is not needed on Android.**
   - The iOS workaround turns the torch off and on 0.7 s into each segment. CameraX on the A15 never dropped the torch, so on Android the blink only makes a short (about 110 ms) flicker early in each segment.
   - Whether the flicker is visible needs a phone in hand. If it is, the fix is to skip the blink on Android (`record/[promptId].tsx`, `blinkTorchIfBack`).

## Second session: constant bitrate tried and reverted (12 Nov, 11:34 to 11:41 WITA)

**The tried fix:** ask the stitcher's encoder for constant bitrate, which skips the floor.

- **Asking unconditionally breaks stitching** where no encoder offers CBR. On the emulator, Media3 refused with `ERROR_CODE_ENCODING_FORMAT_UNSUPPORTED`, so a take with a pause or flip could not be posted. That is worse than a large file.
- **The guarded version** asked for CBR only when a hardware H.264 encoder offers it:
  - the emulator chose variable mode and stitched normally (14.0 s clip, 2.45 Mbps);
  - **the A15 also chose variable mode**: its MediaTek encoder does not offer CBR. The stitched 28.9 s take was again 4.73 Mbps, and stitching took 17.3 s.
- **CameraX's own recording** of a single 10 s back-camera take, not stitched, was **4.78 Mbps** (AAC 48 kHz stereo at 256 kbps). That locates the overshoot in the recorder, before any stitching, and the log names the floor (finding 1).
- **Reverted:** the change does not fix the measured problem, and on phones where it would switch on (hardware encoders that offer CBR) it is untested. The stitcher is as before.
- **Minutes:** 7 more, about 18 of the 30 free minutes this month. Billing stays disabled.

## Third session: 720p measured (12 Nov, 11:51 to 11:57 WITA)

**Setup:** a temporary, uncommitted 720p setting on Android only (`videoQuality`), served by Metro. It is reverted; the app still records at 1080p. The same back-camera, Light-on takes as before.

| Galaxy A15, back camera, Light on | 1080p (as built) | 720p (test) |
| --- | --- | --- |
| What Android did to the 2.5 Mbps asked for | raised to the floor 3.94 Mbps, then +20 % ("requested QP unsupported"): **4.73 Mbps** | no floor; +20 % only: **3.0 Mbps** |
| One segment, not stitched (10 s) | 4.78 Mbps | **3.00 Mbps**, 4.5 MB |
| 29 s with a pause, stitched | 4.73 Mbps, 18.0 MB | **3.00 Mbps, 11.6 MB** (−36 %) |
| Stitch time | 17.3–20.1 s | **14.6 s** |
| Upload at 1.5–2.1 Mbps (Bali 4G, iPhone spike) | about 70–95 s | **about 45–60 s** |

- **Audio** at 720p is unchanged: 48 kHz stereo, no gap across the pause.
- **Picture quality** at 720p versus 1080p **cannot be judged** here (the lab camera faces a grey surface). It needs a phone in hand, or Nemat's eye on clips from one.
- **About the +20 %:** on this phone Android always adds it. Asking for about 2.08 Mbps would land at 2.5 Mbps, but on a phone without the boost it would stay at 2.08. Not recommended without testing more phones.
- **Not changed.** Recording at 720p on Android would change the phase 1 recording condition (`spike/REPORT.md` section 9, `RECORDING_SETTINGS`): Nemat's decision. If approved, it is one setting (`videoQuality` on Android), and Android's lower resolution needs noting next to the iPhone's 1080p.
- **Minutes:** about 6 more, **about 25 of the 30 free minutes** this month. Billing stays disabled.

## Still needs a phone in hand

- **Picture:** the front camera is covered and the back camera sees a surface.
- **Sound you can judge:** the lab gives rack noise. Speech across the pause and flip joins needs a person.
- **Mobile data in Bali,** upload over 4G, and a kill at about 30 % then Retry.
- **A successful upload on Android:** a real phone does not trust the fake Mux's certificate. A real Mux upload needs Nemat's approval.
- **Pinch zoom** (multi-touch cannot be sent through `adb`), and thermal behaviour over longer use.
- **Other chipsets** (Qualcomm, Exynos, Unisoc). About 5 free minutes are left this month; the quota renews next month. A Galaxy A16 (Exynos) or a moto g (Qualcomm) would show whether the floor behaves the same.

## Gate 1 on Android

**Not closed.** Real hardware confirms that recording, pause/resume, flip, stitching on the hardware encoder, torch, the 30 s limit, playback and a real 48 kHz microphone path all work. Open items:
- the bitrate decision (finding 1: 1080p at about 4.7 Mbps, or 720p at a measured 3.0 Mbps);
- picture and heard sound on a phone in hand;
- Bali mobile data;
- a real Mux round trip.

Only Nemat closes the gate.
