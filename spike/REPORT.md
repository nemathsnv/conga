# Phase 1 video spike: report

**Status: in progress.** iPhone runs pending. Android real-device validation pending (no Android phone available on 6 Oct 2026).

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

_Pending: fill from `logs/*.jsonl` with `npm run summarize -- logs/<file>.jsonl`._

### iPhone 17 Pro, iOS 27.0, mobile data

_Pending._

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
