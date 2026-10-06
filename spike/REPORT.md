# Phase 1 video spike: report

**Status, 6 Oct 2026.** iPhone testing complete: 4 rounds, 22 recordings, 21 uploads, 31 playbacks, all on a real iPhone 17 Pro (iOS 27.0) over mobile data unless noted. **Android real-device validation is pending**: no Android phone was available. The phase 1 cross-platform gate is **not** passed until a real mid-range Android has been tested over Bali 4G. The app is Android-buildable but has never been built or run on Android, and no emulator was used because it would not give real camera, encoder or network numbers.

**Question:** can `expo-camera` + Mux direct upload + Mux HLS playback satisfy Shortcut's recording, upload and playback requirements (SPEC.md Sections 2, 6, 19) on a real iPhone and a mid-range Android over normal mobile data?

**Short answer for iPhone:** yes for upload, processing and playback, with three product-side conditions (encoder bitrate, pre-warming, a small playback buffer). Recording meets the spec as written. It does not meet the mid-recording camera flip that Nemat added on 6 Oct, and neither camera library does that on both platforms without segment stitching. Details and the recommendation at the end.

## 1. What was built

Throwaway Expo SDK 57 app in `spike/` (React Native 0.86, new architecture, release-configuration build with the JS bundle embedded so the phone runs standalone with Wi-Fi off). Source of truth for every number below: `logs/*.jsonl`, summarised with `npm run summarize -- logs/<file>.jsonl`. Later log files contain the earlier ones.

| Requirement | Implementation | Where |
|---|---|---|
| Record front/back vertical video | `expo-camera` `CameraView`, `mode="video"`, portrait only, lens pinned to the wide camera | `src/screens/RecordScreen.tsx` |
| 2–30 s | `recordAsync({ maxDuration: 30 })`; clips under 2 s are discarded with the message | same |
| Light, zoom | `enableTorch`, re-applied 0.7 s after record start; `zoom` 0 / 0.1 / 0.25 | same |
| Preview, discard, re-record | Local `expo-video` loop with sound; Re-record deletes the file and the run | `src/screens/PreviewScreen.tsx` |
| Server-minted upload URL | Supabase Edge Function `mux-create-upload` calls Mux with a token held in Edge Function secrets; the app only has the public anon key | `supabase/functions/` |
| Foreground upload with real progress | `expo-file-system` `File.createUploadTask` PUT to the Mux direct-upload URL with byte progress | `src/upload.ts` |
| Keep the recording if posting fails | File moved to the document directory at record time; run index persisted; SPEC 19 banner with Retry; 3 automatic retries with 2/4/8 s backoff | `src/upload.ts`, `src/screens/HomeScreen.tsx` |
| Detect playable | Poll `mux-upload-status` every 1.5 s until the asset is `ready` with a public playback id | `src/mux.ts` |
| Vertical playback with sound, loop | `expo-video` HLS `stream.mux.com/<id>.m3u8`, `contentFit="cover"`, `loop`, unmuted | `src/screens/PlayerScreen.tsx` |
| Sequential clips | One player, `replaceAsync` on `playToEnd`, Next/Prev | `src/screens/SequenceScreen.tsx` |
| Measurements | JSON lines, exported with the share sheet; first frame, stalls, loops, rendition switches, upload bytes and times, Mux processing, device and network | `src/log.ts`, `src/playback.ts` |

Extras added during testing: an encoder bitrate toggle (`videoBitrate` + `avc1`), three playback start modes, a `mux-delete-assets` function to stay under the Mux free plan's 10-asset cap, and a local config plugin that adopts the iOS 27 scene lifecycle (without it every iOS 27 build crashes at launch; Expo's SDK 57 template does not do this yet).

Not built, by the escalation rules: `react-native-vision-camera`, Cloudflare Stream, Supabase Storage + own transcoding.

## 2. Results: iPhone 17 Pro, iOS 27.0

Mobile data, Wi-Fi off, iOS reported 4G or 5G per run (it switched during the session). Carrier as reported by iOS is in the log. Upload throughput = file bits / upload wall time, single connection, including the Edge Function call that mints the URL.

### 2.1 Recording and upload, all runs

| # | Camera | Quality | Encoder | Dur s | File MB | Recorded kbps | Net | Upload s | Upload Mbps | Attempts | Mux ready s |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | front | 1080p | default | 4.1 | 3.67 | 7213 | 5G | 16.0 | 1.8 | 1 | 1.6 |
| 2 | front | 1080p | default | 3.7 | 3.40 | 7362 | 5G | 9.5 | 2.9 | 1 | 1.6 |
| 3 | front | 1080p | default | 29.9 | 29.14 | 7796 | 5G | 30.6 | 7.6 | 1 | 1.6 |
| 4 | front | 1080p | default | 5.0 | 4.65 | 7482 | 5G | 9.9 | 3.7 | 1 | 1.7 |
| 5 | front | 1080p | default | 3.2 | 3.03 | 7658 | 5G | 6.0 | 4.1 | 1 | 1.7 |
| 6 | front | 1080p | default | 7.1 | 6.88 | 7753 | 4G | 26.5 | 2.1 | 1 | 1.6 |
| 7 | front, zoom 0.1 | 1080p | default | 6.0 | 6.02 | 8027 | 4G/5G | 13.8 | 3.5 | 2 concurrent (spike bug) | 1.7 |
| 8 | front | 1080p | default | 3.4 | 3.38 | 8035 | 5G | 6.5 | 4.1 | 1 | 1.6 |
| 9 | back | 1080p | default | 8.9 | 8.52 | 7631 | 5G | 8.0 | 8.5 | 1 | 1.6 |
| 10 | back | 1080p | default | 20.5 | 19.84 | 7742 | 5G | 16.7 | 9.5 | 1 after 3 refusals (Mux asset cap) | 1.6 |
| 11 | front | 1080p | default | 2.7 | 2.64 | 7729 | – | re-recorded, never posted | – | – | – |
| 12 | front | 1080p | default | 1.5 | 1.52 | 7918 | 4G | 7.9 | 1.5 | 1 | 1.7 |
| 13 | back, zoom 0.1 | 1080p | default | 29.9 | 28.53 | 7634 | 5G | 17.3 | 13.2 | 1 | 4.8 |
| 14 | front | 1080p | 4 Mbps | 30.0 | 15.52 | 4137 | 5G | 14.2 | 8.8 | 1 | 4.8 |
| 15 | front | 1080p | 2 Mbps | 30.0 | 8.01 | 2135 | 5G | 22.6 | 2.8 | 1 | 1.6 |
| 16 | back, torch | 1080p | default | 5.0 | 4.98 | 8021 | 5G | 5.0 | 8.0 | 1 | 1.6 |
| 17 | back, zoom 0.25 | 1080p | default | 6.1 | 6.12 | 8070 | 5G | 13.0 | 3.8 | 1 | 1.7 |
| 18 | front | 720p | 2 Mbps | 16.1 | 3.99 | 1988 | 5G | 9.6 | 3.3 | 1 | 1.7 |
| 19 | front | 1080p | 2 Mbps | 5.5 | 1.39 | 2031 | airplane → Wi-Fi | 4.5 | 2.5 | 1 after 3 offline failures | 1.6 |
| 20 | front | 1080p | 2 Mbps | 5.0 | 1.29 | 2078 | Wi-Fi | 4.1 | 2.5 | 1 | 1.6 |
| 21 | front, flipped mid-record | 1080p | default | 4.2 | 4.09 | 7725 | 5G | 6.5 | 5.0 | 1 | 4.8 |
| 22 | back, torch | 1080p | default | 3.5 | 3.23 | 7308 | 5G | 5.6 | 4.6 | 1 | 1.7 |

Also: three clips under 2 s were rejected with the message, one clip was discarded with Re-record, and two clips were re-recorded.

Medians over the 19 mobile-data uploads: upload 9.9 s, throughput 4.1 Mbps (range 1.5 to 13.2), Mux upload-finished-to-playable 1.6 s (4.8 s for three of the 30 s clips). Upload failures caused by the network: 3, all in airplane mode, all immediate. Upload failures mid-transfer: 0 in 21 uploads.

### 2.2 Playback, all 31 playbacks

First frame = player created to first timed frame with a non-zero position. "Cold" = first ever play of that asset. "Warm" = any later play.

| Condition | n | First frame ms, median | Range |
|---|---|---|---|
| Cold, default player | 18 | 4,500 | 2,789 to 5,827 |
| Warm, default player | 3 | 1,365 | 1,365 to 3,642 |
| Warm, `nowait` (waitsToMinimizeStalling off, play on ready) | 3 | 1,799 | 1,436 to 3,199 |
| Warm, `smallbuffer` (preferredForwardBufferDuration 1 s) | 4 | 1,594 | 1,205 to 1,705 |

Stalls of 250 ms or longer: 1 in 31 playbacks (19 s, run 1, at the first loop boundary of a just-ready asset, right after the player switched up to the 1080p rendition). Loop-boundary status flickers of 3 to 10 ms: 15, none visible. Playback errors: 0. Cold plays always started on the 270x480 rendition and stepped up; warm plays started at 480p or 720p.

## 3. Findings

**Recording with expo-camera**

- Output is true vertical 1080x1920 at 30 fps with sound. The back camera encodes 1920x1080 with a rotation flag; Mux normalises both to a 1080x1920 asset.
- The library default on this iPhone is **HEVC (`hvc1`) at about 7.5 Mbps**. Setting `videoBitrate` requires a codec and the spike used `avc1`; 4 Mbps and 2 Mbps were honoured within 5 %. H.264 is the safer choice for Android and the web player anyway.
- The 30 s ceiling stops the recording itself at 29.9 s; the 2 s floor is enforced in the app.
- **Light:** back torch works, but expo-camera drops it when recording starts; re-applying it 0.7 s after start keeps it on (confirmed by Nemat, run 22). The front camera has no torch on any iPhone, so the spec's front "light" has to be a screen fill in the product. That is UI, not a camera-library matter.
- **Zoom:** `zoom` is exponential (`videoZoomFactor = maxZoom ^ zoom`) on the selected device. With the lens pinned to the wide camera, zoom 0 is the native 1×. Nemat's "zoom 0 looks like 4×" was the spike's button showing the next value while the camera sat at 0.25; the screenshot confirms it. For the spec's fixed 1×, use `zoom={0}` and `selectedLens` on the wide camera.
- **Camera flip during recording** (added by Nemat on 6 Oct, `docs/DECISIONS.md`): changing `facing` ends the recording. In run 21 the flip at 4.9 s resolved `recordAsync` 0.5 s later with a 4.2 s front-only clip. expo-camera fails this requirement.
- Flip before recording works after the spike's own ready-state bug was fixed; the camera switches in under a second.

**Upload to Mux**

- Direct-upload URLs always pointed at a US endpoint (`direct-uploads-oci-us-phoenix-1` or `us-ashburn-1`); Mux has no regional ingest. Single-connection throughput from Bali was 1.5 to 13 Mbps, 4G runs at 1.5 to 2.1 Mbps.
- **Encoder bitrate is the lever.** At the default 7.5 Mbps a 30 s response is 29 MB (30 s on good 5G, about 2 minutes at 2 Mbps). At 2 Mbps it is 8 MB; Nemat saw no visible loss in the preview, and Mux's own top rendition for these clips is about 3 Mbps, so nothing survives transcoding anyway.
- Minting the URL costs 1.2 to 2.4 s per upload (Edge Function in Singapore calling Mux in the US), 7.7 s on the first cold start. The product should mint the URL while the person is still on the post-review screen.
- No mid-transfer failure in 21 uploads. All failure paths exercised worked as SPEC 19 describes: airplane mode (3 immediate failures, banner, Retry succeeded), app killed at 30 % (reopened, banner, Retry re-uploaded the whole file), Mux refusing uploads (3 retries with backoff, banner, later Retry succeeded). A killed upload restarts from zero; resumable upload was not needed on this evidence.
- **Mux processing** is 1.6 s to playable for clips up to 20 s and 4.8 s for three of the 30 s clips, with the free `basic` quality level.

**Playback with expo-video**

- The slow start is the **first view of each asset**, median 4.5 s, starting on the lowest rendition. Later views are 1.2 to 1.8 s whatever the settings. Mux marks the asset ready before its renditions are fully prepared and cached, so the author's own first play after posting and the first viewer of any fresh response pay for it. Mitigation is product-side: fetch the manifest and first segment server-side right after `ready`, or accept that only the first viewer waits.
- A 1 s forward buffer (`smallbuffer`) was the fastest start in every direct comparison, by 200 to 400 ms. Turning off `waitsToMinimizeStalling` only works if `play()` waits for `readyToPlay`; calling play immediately shows nothing.
- Looping with sound works; the sequence player with `replaceAsync` works. The spike does not preload the next clip; the product will, which hides most of the warm-start 1.5 s.
- Manifests and segments are served from Fastly, so views after the first are edge-cached.

## 4. Cost per 1,000 minutes (Mux)

Source: https://www.mux.com/pricing and https://www.mux.com/docs/guides/use-video-quality-levels, read 6 Oct 2026. First-tier pay-as-you-go rates; the page says rates can change and that committed pricing applies above about $3,000 a month. No Cloudflare or Supabase pricing was gathered because those escalations did not fire.

| Item | Published rate | Per 1,000 minutes |
|---|---|---|
| Encoding, `basic` quality (what the spike used) | free | $0 |
| Encoding, `plus` quality | $0.03125 / min | $31.25 |
| Storage | $0.00300 / min / month | $3.00 a month |
| Delivery (watched) | $0.00100 / min after 100,000 free minutes a month | $1.00, and $0 while under the free allowance |

- Mux bills by minutes, not file size or renditions, and stores one encoded version per asset.
- The free plan is capped at 10 assets, which the spike hit twice. Pay-as-you-go lifts the cap and includes a $20 monthly usage credit.
- **Estimate for the beta** (flagged as an estimate): 500 members × 3 responses a week × 20 s ≈ 500 stored minutes a week, about 2,000 minutes a month, so storage grows by about $6 a month per month of content, and delivery stays inside the free allowance until watched minutes exceed 100,000 a month (about 300,000 views of 20 s). On these numbers Mux is not a cost concern for the beta.

## 5. Front-camera quality notes

- 1080x1920, 30 fps, HEVC by default, H.264 when a bitrate is set. The TrueDepth and ultra-wide front lenses are reported and selectable.
- Nemat saw no visible difference between the default and 2 Mbps H.264 in the preview; 720p at 2 Mbps was not judged separately.
- Mux `basic` top rendition came out at 2.9 to 3.5 Mbps for 1080p; cold views start at 270p and step up within a few seconds, which is visible on the first play of a fresh clip.
- Not measured: low-light front-camera quality, and front-camera quality on Android.

## 6. Upload behaviour on bad networks

- 4G throughput was 1.5 to 2.1 Mbps on this phone in this location; real Bali 4G on a mid-range Android may be worse. At 2 Mbps a 2 Mbps-encoded 30 s clip takes about 30 s to upload; the default encoder takes about 2 minutes.
- Offline: fails immediately, recording kept, banner shown, Retry works after reconnecting. Turning airplane mode off re-enables Wi-Fi, so two late runs uploaded over Wi-Fi; they are marked in the table.
- Killed mid-upload: recording kept, re-uploaded from zero on Retry. No partial resume. If Android shows frequent mid-transfer failures, Mux's resumable upload (`UpChunk`-style chunked PUT to the same URL) is the next step; it was not needed on iPhone.
- No mid-transfer failures in 21 uploads.

## 7. Escalation rules

| Rule | Fired? | Evidence and recommendation |
|---|---|---|
| VisionCamera if expo-camera fails a documented requirement | **Yes, for one requirement:** camera flip during recording (Nemat, 6 Oct). expo-camera ends the recording on flip (run 21). | VisionCamera flips mid-recording on iOS but not on Android, where the recording fails (VisionCamera issues 1805 and 1296). So a VisionCamera round would not change the product design: a cross-platform mid-recording flip needs the app to record segments and stitch them (AVFoundation on iOS, MediaMuxer on Android) with either library. Recommendation: do not spend a spike round on VisionCamera for this; decide the stitching approach in phase 3 instead. Nemat's call. Every other recording requirement in the spec passed. |
| Cloudflare Stream if Mux fails a requirement or cost is unsuitable | No | Mux met upload, processing and playback requirements. Cost is in section 4. |
| Supabase Storage + own transcoding if managed hosting is economically unacceptable | No | Managed hosting is a few dollars a month at beta scale. |

## 8. Android: pending

Not tested on any Android device. The app targets Android (package, permissions, adaptive icon, `expo-camera` and `expo-video` support both platforms) but has not been built for it. When a mid-range Android is available: build with `npm run android:release`, run the same checklist on Bali 4G, and add the results here. The questions that most need Android answers: encoder output and bitrate control on that phone's hardware encoder, torch behaviour, upload throughput and failure rate on 4G, and ExoPlayer first-frame timing. Until then this report supports a provider decision for iPhone only.

## 9. Recommendation

**Provider: Mux.** On iPhone it met every upload, processing and playback requirement with no failures, processing is near-instant, pricing is immaterial at beta scale, and the one weak number (4.5 s cold first view) is a known property of just-in-time rendition preparation that the product can hide by pre-warming assets after `ready`. The honest trade-offs: ingest is US-only, so upload time is bounded by the Bali-to-US path; the author's first play after posting will be slow unless pre-warmed; and the free plan is unusable beyond 10 assets, so the beta needs a card on file.

**Camera library: expo-camera, on the evidence so far.** It records to spec (vertical 1080p with sound, 30 s limit, back torch with a re-apply, native 1× zoom), has bitrate control, and is maintained by Expo. It fails the mid-recording flip, but so would VisionCamera on Android, and the fix (segment stitching) is the same for both. If Nemat wants the VisionCamera round anyway, it is a day's work.

**Conditions the product must carry into phase 3, regardless of the final choice:**

1. Record H.264 at about 2 to 3 Mbps, 1080p. Not the library default.
2. Mint the Mux upload URL while the person is on the post-review screen, not when they tap Post.
3. Pre-warm each asset once it is `ready`, and preload the next clip in Home and the response player.
4. Use a 1 s forward buffer on iOS.
5. Front "light" is a screen fill; back light is the torch, re-applied after recording starts.
6. Camera flip during recording means segment recording plus stitching; design it in phase 3.

**Gate 1 status:** the iPhone evidence supports Mux + expo-camera. The gate is not passed until a real mid-range Android has run the same checklist over Bali 4G. Nemat makes the call and records it in `docs/DECISIONS.md`.
