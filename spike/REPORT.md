# Phase 1 video spike: report

**Status: in progress.** iPhone round 1 done (7 runs, front camera only). Round 2 pending: back camera, light, zoom, encoder bitrate, fast-start playback, failure cases. Android real-device validation pending (no Android phone available on 6 Oct 2026).

**Question:** can `expo-camera` + Mux direct upload + Mux HLS playback satisfy Shortcut's recording, upload and playback requirements (SPEC.md Sections 2, 6, 19) on a real iPhone and a mid-range Android over normal mobile data?

## What was built

Throwaway Expo SDK 57 app in `spike/` (React Native 0.86, new architecture, release-configuration build with the JS bundle embedded, so the phone runs standalone on mobile data).

| Requirement | Implementation | Where |
|---|---|---|
| Record front/back vertical video | `expo-camera` `CameraView`, `mode="video"`, portrait only | `src/screens/RecordScreen.tsx` |
| 2–30 s | `recordAsync({ maxDuration: 30 })` native ceiling; clips under 2 s are discarded with a message | same |
| Light, zoom | `enableTorch` toggle; `zoom` 0 / 0.1 / 0.25; available lenses logged | same |
| Preview, discard, re-record | Local `expo-video` loop with sound; Re-record deletes the file and the run | `src/screens/PreviewScreen.tsx` |
| Server-minted upload URL | Supabase Edge Function `mux-create-upload` calls Mux with the token from Edge Function secrets. The app only holds the public anon key. | `supabase/functions/` |
| Foreground upload with real progress | `expo-file-system` `File.createUploadTask` PUT to the Mux direct-upload URL with `onProgress` byte counts | `src/upload.ts` |
| Keep the recording if posting fails | Recording moved to the document directory at record time; run index persisted; Home shows the SPEC 19 banner with Retry; 3 automatic retries with backoff | `src/upload.ts`, `src/screens/HomeScreen.tsx` |
| Detect playable | Poll `mux-upload-status` every 1.5 s until asset `ready` with a public playback id | `src/mux.ts` |
| Vertical playback with sound, loop | `expo-video` HLS `stream.mux.com/<id>.m3u8`, `contentFit="cover"`, `loop`, unmuted | `src/screens/PlayerScreen.tsx` |
| Sequential clips | One player, `replaceAsync` on `playToEnd`, Next/Prev | `src/screens/SequenceScreen.tsx` |
| Measurements | JSON lines in the document directory, exported with the share sheet; summarised by `scripts/summarize.mjs` | `src/log.ts`, `src/playback.ts` |

Not built, by the escalation rules: `react-native-vision-camera`, Cloudflare Stream, Supabase Storage + own transcoding.

## Measurements

Built from `logs/*.jsonl` with `npm run summarize -- logs/<file>.jsonl`. First frame is measured from player creation to the first `timeUpdate` with a non-zero position, so it includes manifest, playlist, init segment and first media segment fetches plus decoder start. Stalls under 250 ms at the loop boundary are AVPlayer status flickers, not visible rebuffering, and are counted separately.

### iPhone 17 Pro, iOS 27.0, mobile data (Bali, Telkomsel-class 4G/5G as reported by iOS)

**Round 1, 6 Oct 2026.** Front camera, 1080p, library default encoder, Wi-Fi off. Log: `logs/spike-export-2026-10-06T06-20-28-973Z.jsonl`.

| # | Camera | Dur s | Res | File MB | Recorded kbps | Net | Upload s | Upload Mbps | Attempts | Mux ready s | First frame ms | Stalls ≥250 ms | Loops |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | front | 4.1 | 1080x1920 | 3.67 | 7213 | 5G | 16.0 | 1.8 | 1 | 1.6 | 5441 | 1 (19.0 s) | 1 |
| 2 | front | 3.7 | 1080x1920 | 3.40 | 7362 | 5G | 9.5 | 2.9 | 1 | 1.6 | 2789 | 0 | 3 |
| 3 | front | 29.9 | 1080x1920 | 29.14 | 7796 | 5G | 30.6 | 7.6 | 1 | 1.6 | 3803 | 0 | 1 |
| 4 | front | 5.0 | 1080x1920 | 4.65 | 7482 | 5G | 9.9 | 3.7 | 1 | 1.7 | 3670 | 0 | 0 |
| 5 | front | 3.2 | 1080x1920 | 3.03 | 7658 | 5G | 6.0 | 4.1 | 1 | 1.7 | 2809 | 0 | 0 |
| 6 | front | 7.1 | 1080x1920 | 6.88 | 7753 | 4G | 26.5 | 2.1 | 1 | 1.6 | 4626 | 0 | 0 |
| 7 | front, zoom 0.1 | 6.0 | 1080x1920 | 6.02 | 8027 | 4G→5G | 13.8 | 3.5 | 3 (see note) | 1.7 | 3482, 3642 | 0 | 2 |

Medians: upload 13.8 s, upload throughput 3.7 Mbps, Mux upload-finished to playable 1.6 s, first frame 3.7 s. Upload failures: 0. Loop-boundary flickers: 6, none visible.

**What round 1 says**

- **Recording.** expo-camera records true vertical 1080x1920 at 30 fps, H.264, sound on. The 30 s ceiling (`maxDuration`) stops the recording itself at 29.9 s. The under-2 s floor worked: a 1.1 s clip was discarded with the message. The front lens list was reported (Front, TrueDepth, Ultra Wide). The back camera could not be tested in round 1 because of a spike bug: the Record button waited for a ready callback that expo-camera only fires on first mount. Fixed for round 2; the back lens list was logged, so the camera itself switched.
- **Encoder bitrate is the real upload problem.** The library default is about 7.5 Mbps at 1080p, so a full 30 s response is 29 MB. On this phone's 5G that took 30.6 s; on the 4G run the throughput was 2.1 Mbps, which puts a 30 s clip at about 2 minutes. Mux re-encodes everything anyway, and its own top rendition for these clips was 2.9 to 3.5 Mbps, so uploading 7.5 Mbps is wasted bytes. Round 2 tests `videoBitrate` at 4 and 2 Mbps and 720p.
- **Upload path goes to the USA.** Every direct-upload URL pointed at `direct-uploads-oci-us-phoenix-1` or `us-ashburn-1`. Mux does not offer a regional upload endpoint. Throughput of 1.8 to 7.6 Mbps from Bali is consistent with a single TCP connection over about 200 ms of latency. The first mint call took 7.7 s (Edge Function cold start plus Mux API); later mints took 1.3 to 1.9 s.
- **Mux processing is not a problem.** Upload-finished to playable was 1.6 to 1.7 s on every run with the free `basic` quality level.
- **Playback starts slowly.** First frame was 2.8 to 5.4 s on both 4G and 5G, and an immediate replay of run 7 (segments already at the CDN edge) was no faster (3.5 then 3.6 s). The player also always started on the lowest rendition (270x480) and stepped up. That points at AVPlayer's default start-up behaviour (`waitsToMinimizeStalling`) rather than the network. Round 2 compares the default against a fast-start buffer setting. Either way the product will preload the next clip, which this spike does not do.
- **One real stall.** Run 1 stalled for 19 s at its first loop boundary, right after the player switched up to the 1080p rendition. That was the first ever playback of a just-ready asset; the higher renditions may not have been fully available yet. No other run stalled.
- **Manifests are served from Fastly** (`manifest-oci-us-*.fastly.mux.com`), so repeat views by other people hit the CDN edge.
- **Run 7 note.** Three upload attempts appear for one file with no failure between them. The run was killed mid-upload (checklist step 15), reopened, and Retry was tapped while a previous attempt was still running in the background, so two uploads of the same file ran at once and both succeeded. That is a spike UI gap, now guarded, not a Mux or network failure.
- **Not yet exercised in round 1:** the airplane-mode failure path, Re-record from preview, light on either camera, 720p.

### Mid-range Android, Bali 4G

**Pending. No device available.** The build is Android-compatible (`app.json` has the Android package, permissions and adaptive icon; no iOS-only API is used) but has not been built or run on Android. An emulator would not give real camera, encoder or network numbers, so none was used.

## Cost per 1,000 minutes (Mux)

Source: https://www.mux.com/pricing and https://www.mux.com/docs/guides/use-video-quality-levels, read 6 Oct 2026. First-tier pay-as-you-go rates; the page says rates can change and that committed pricing applies above about $3,000/month.

| Item | Published rate | Per 1,000 minutes |
|---|---|---|
| Encoding, `basic` quality (what the spike uses) | free | $0 |
| Encoding, `plus` quality | $0.03125 / min | $31.25 |
| Storage | $0.00300 / min / month | $3.00 / month |
| Delivery (watched) | $0.00100 / min after 100,000 free minutes / month | $1.00, and $0 while under the free allowance |

Notes:
- Mux bills by minutes, not by file size or renditions, and stores one encoded version per asset.
- `basic` uses a reduced encoding ladder with a lower target quality; `plus` adds per-title encoding. The spike uploads with `basic`. Whether `basic` looks good enough on a phone is a judgement from the runs below.
- A pay-as-you-go account gets a $20 monthly usage credit and 100,000 free delivery minutes a month.
- Estimate for the beta (flagged as an estimate): 500 members × 3 responses a week × 20 s ≈ 500 stored minutes a week, ≈ 2,000 minutes a month, so storage ≈ $6 a month after the first month and delivery inside the free allowance until watched minutes exceed 100,000 a month.

## Front-camera quality notes

_Pending._

## Upload behaviour on bad networks

_Pending._

## Escalation rules

| Rule | Fired? | Evidence |
|---|---|---|
| VisionCamera if expo-camera fails a documented requirement | pending | |
| Cloudflare Stream if Mux fails a requirement or cost is unsuitable | pending | |
| Supabase Storage + own transcoding if managed hosting is economically unacceptable | pending | |

## Recommendation

_Pending until the iPhone runs are in. The cross-platform gate cannot be called passed until a real mid-range Android is tested._
