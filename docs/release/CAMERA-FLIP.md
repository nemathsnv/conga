# Camera flip during a take (B-1)

Status: **built, not verified on a phone.** `docs/BLOCKERS.md` B-1 stays open until the device
check below has been run on a real iPhone and a real mid-range Android phone.

Requirement: `R-Record` has a camera flip control, and it must work while recording (SPEC.md
Section 6; Nemat, 6 Oct 2026, `docs/DECISIONS.md`). The result is one continuous clip.

## Design

expo-camera ends a recording when the camera changes (spike run 21), so a take is recorded as
**segments**, one per camera, and the segments are **stitched** into one file on Post Review.

### Recording (`app/src/video/recorder.ts`, `app/src/app/record/[promptId].tsx`)

- `createTake` is the take's state machine (`idle → recording ⇄ flipping → done`). It is pure: the
  camera calls and file moves are injected, so every edge is unit-tested.
- **Flip during a take**: the segment is stopped (`stopRecording`), its file is moved out of the
  camera cache into `Documents/recordings/take/`, the camera switches, and the next segment starts
  once the other camera reports ready.
  - iOS: expo-camera only fires `onCameraReady` when its view mounts, so the flip mounts a fresh
    `CameraView` (a `key` change). Each segment therefore starts under the same conditions as the
    first one, which the founder iPhone build has already exercised.
  - Android: changing `facing` rebinds CameraX and `onCameraReady` fires again on the new camera.
    Remounting is avoided there because the old view's `unbindAll()` can race the new binding.
  - If the other camera is not ready within 4 s, the take ends with what it has.
- **Timer and ring** show the total across segments. They hold still from the flip tap until the
  next segment starts (nothing is being recorded then).
- **30-second limit** applies to the total. Each segment gets the camera's own `maxDuration` for the
  time left (iOS: fractional seconds; Android: whole seconds rounded down, because expo-camera reads
  an integer there and treats 0 as "no limit"), and the screen stops the take when the total reaches
  30 s.
- **PR-Short** applies to the total: under 2 s in total shows "Keep going: responses are at least
  2 seconds" and deletes every segment. Two segments of 1.5 s make a 3 s response.
- **Guards** (engineering limits, not product rules):
  - A flip in the first 0.5 s of a segment is ignored (a segment that short may hold no frame).
  - A flip with less than 1 s of the 30 left is ignored: nothing happens and the take runs on to
    its limit on the same camera (no segment under a second is started; Android could not limit it).
  - A flip while a flip is under way is ignored.
- **Stop during the switch** ends the take with the segments so far. **Stop while the flip is
  ending the segment** wins: no next segment.
- **Interruptions**: the app going to the background (home, lock, an incoming call screen) stops
  the take with what it has, and it goes to Post Review (or PR-Short) as a normal stop would. If
  the camera ends a segment by itself (session interrupted, its limit), the same happens.
- **Cancel**, or the screen closing any other way, deletes every segment, including the one being
  finished when the camera hands it back.
- **Leftovers**: if the app is killed mid-take or on Post Review, the take folder is swept when the
  next take starts (files the current recording still uses are kept).
- **Permissions**: unchanged. Camera off → `A-Camera`, microphone off → `A-Mic` (recording is
  unavailable). Both are decided before a take starts.
- **The flip control** is enabled while recording, labelled "Flip camera" as on the board. The
  dimmed "unavailable while recording" state is gone.

### Stitching (`app/modules/video-stitcher`, `app/src/video/stitch.ts`)

An Expo local module, autolinked from `app/modules` (expo-modules-autolinking 57.0.13 searches
`./modules` by default; no npm dependency, no config plugin). One function:

```ts
stitch(uris: string[]): Promise<string> // URI of a new MP4 in the app's cache
```

It rejects with `ERR_STITCH_INPUT` (a segment missing or unreadable), `ERR_STITCH_EXPORT` (joining or
encoding failed) or `ERR_STITCH_UNAVAILABLE` (a build without the module). It never resolves with a
partial file and deletes its output when it fails. `stitch.ts` maps these to `StitchError` codes
`stitch_input`, `stitch_failed`, `stitch_unavailable` (and `stitch_cancelled` after Discard).

- **iOS** (`ios/VideoStitcher.swift`): `AVMutableComposition` with the segments' video and audio end
  to end, in order. Each segment's span is its video track's time range; its audio is kept inside
  that span at the same offset, so sound stays in sync across joins. An `AVMutableVideoComposition`
  draws each segment with its own `preferredTransform`, scaled to fit and centred in the **first
  segment's upright frame**, so the first segment's orientation and size are kept and a front-camera
  segment stays mirrored exactly as recorded. `AVAssetReader` + `AVAssetWriter` re-encode as H.264
  High at 2.5 Mbps average (the recording setting), keyframe every 2 s, and AAC 128 kbps at the
  source's sample rate and channel count. `shouldOptimizeForNetworkUse` puts the moov box first.
  AVAssetWriter is used instead of `AVAssetExportSession` because export presets cannot set a
  bitrate: a preset would multiply the upload several times over for Bali mobile data.
- **Android** (`android/.../VideoStitcherModule.kt`): Media3 Transformer 1.9.0 (the version
  expo-video 57.0.5 already ships; declared in the module's `build.gradle`, keep the two equal) with
  one `EditedMediaItemSequence` of the segments in order. Each item gets a `Presentation` to the
  first segment's upright size (scale to fit). H.264 at 2.5 Mbps (`VideoEncoderSettings`, encoder
  fallback on), AAC, `InAppMp4Muxer` (reserves room for moov at the start). A segment without sound
  gets silence (`experimentalSetForceAudioTrack`). CameraX writes front-camera mirroring into the
  pixels, so it stays as recorded. Re-encoding is required: segments from different cameras do not
  share codec parameters, and `MediaMuxer` cannot join them.

### Review and Post (`app/src/app/record/review.tsx`)

- Post Review starts the stitch as soon as it opens. Until it is done there is no clip to play
  (the video area is black and the progress line stays at the start).
- When it is done, the recording in memory is replaced by the stitched one: same recording id and
  submission id, **one segment** (the stitched file, in `Documents/recordings/`, facing of the first
  segment, total duration). Only then are the segment files deleted.
- Post waits for the same stitch (never a second one) and posts the one-file recording, so the
  upload pipeline, the pending post kept on the phone, Retry, `recordingOnPhone` and the Upload
  failed thumbnail all work exactly as for an unflipped take. The pipeline deletes the file after
  the response is live, as before.
- `uploadableFile` stays synchronous and refuses anything but one file (`stitching_required`), so a
  partial take can never be uploaded. It does not stitch by itself: stitching is asynchronous and
  the function's synchronous contract is what `putRecording` and the pipeline rely on.
- **Stitch fails**: Post Review stays as it is, Post is enabled again (the existing handling of a
  failed Post on that screen: logged, nothing shown), and a second tap on Post tries again. Re-record
  and Discard work. The segments stay on the phone until then.
- **Discard / Re-record during a stitch**: the segments are deleted and the running stitch deletes
  its output when it ends.

## What is verified, and how

Nothing here has run on a phone. No camera recording has been made with this code.

| Check | How | Result |
| --- | --- | --- |
| Take logic: segments, totals, 30 s across segments, per-segment camera limit (iOS/Android), PR-Short on the total, flip guards, stop/cancel/interruption during a flip, lost segment, camera not coming back, files deleted on cancel and short | Jest, `src/__tests__/take.test.ts` (23 tests, camera and files faked) | pass |
| Stitch once and cache, Post reusing the running stitch, segments deleted only after the stitched file is kept, typed error mapping, retry after failure, Discard during a stitch, upload refusing an unstitched take | Jest, `src/__tests__/stitch.test.ts` (8 tests, native module mocked) | pass |
| Whole suite, types, lint | `npm test` (312 tests on the integration tip), `npm run typecheck`, `npm run lint` | clean |
| iOS native module compiles and links, and is registered | `expo prebuild -p ios`, `pod install`, `xcodebuild … -sdk iphonesimulator build` (Xcode 27.1); `VideoStitcherModule` is in the generated `ExpoModulesProvider.swift` | BUILD SUCCEEDED |
| The iOS AVFoundation core on real files | `app/modules/video-stitcher/harness/run.sh` on the Mac (macOS AVFoundation, not iOS): generated segments shaped like camera files (back camera 1920×1080 rotated 90°, front camera rotated and mirrored, an upright one, a 720p one; H.264 + AAC in QuickTime) | 27 checks pass: one H.264 and one AAC track; 1080×1920 upright, identity transform; duration 7.500 s of 7.5; audio spans the whole clip; 225 frames at 30 fps; timestamps increase; `ftyp moov mdat`; every segment's top, bottom-left and bottom-right colours as in its source (so rotation and mirroring are kept); 2.9 Mbps on moving detail (target 2.5; about 11 MB for 30 s); a QuickTime file named `.mp4` reads; a missing and an unreadable segment are input errors; about 1 s to stitch 7.5 s on an M-series Mac |
| The module loads in the app on the iOS simulator | Debug build installed on an iPhone 18 Pro simulator (iOS 27.0), Metro, a temporary log (not committed) of `isAvailable()` from the record route | the app launches to the welcome screen; log: `VideoStitcher native module available: true` |
| Android module compiles, and the app resolves one Media3 | `expo prebuild -p android`, `./gradlew :video-stitcher:compileDebugKotlin` (BUILD SUCCESSFUL, no warnings); `:app:dependencies --configuration debugRuntimeClasspath`: every `androidx.media3` artifact at 1.9.0 | pass (the full Android app was not assembled) |

## Not verified

- **Anything on a phone**: recording, flipping, the switch time, sound across joins, stitching on
  device hardware, playback in review, upload and Mux playback. The simulator has no camera, so a
  take cannot be recorded there either.
- **The record screen on the simulator.** It was not reached: the route needs a signed-in,
  onboarded account, and typing into the simulator dropped and repeated characters. Even there the
  simulator has no camera, so recording and flipping cannot be exercised on it.
- **Android at runtime**: the module compiled; nothing has run on an Android device or emulator
  (none is installed), and the full app was not assembled.
- **The iOS stitcher on iOS itself** (the harness runs the same Swift on macOS AVFoundation).
- **Real iPhone camera files**: their exact transforms and mirroring as written by
  `AVCaptureMovieFileOutput` with `isVideoMirrored`, and Android CameraX files.

## Known limits

- **A short gap at each join.** Nothing records while the camera switches (about 0.5 to 1 s on the
  spike's iPhone for a flip before recording; unmeasured mid-take). The clip jumps from the last
  frame of one camera to the first of the other, and whatever was said during the switch is not
  in it. There is no audio fade or crossfade at the join.
- **Exposure, focus and white balance restart** on the new camera: the first frames after a join
  can be dark or soft while the camera settles.
- **The timer counts slightly more than the clip.** Segment times are measured from the app's call
  to the camera to the camera's answer, which includes start-up and finishing latency. With several
  flips, a take the timer shows as 0:30 can be about a second shorter. It can never be longer than
  30 s.
- **Turning the phone sideways mid-take**: the app is portrait, but expo-camera sets each segment's
  orientation from the phone's physical orientation when the segment starts. A landscape segment in
  a portrait take is shown whole, scaled into the portrait frame with black bars above and below.
- **Stitching takes time on Post Review** (re-encoding; estimate a few seconds for 30 s on a recent
  phone, unmeasured). Post waits for it. No board shows a "preparing" state, so the review shows a
  black video area until it is ready.
- **Quality**: one extra H.264 generation for flipped takes only (a take without a flip is uploaded
  as recorded, untouched).
- **A take is not resumable** after the app is killed mid-take; its segments are deleted at the
  next take. This matches a take without a flip today.

## Needs a board or a decision (flagged, not built)

- A visible state while Post Review stitches (today: black video area, Post waits).
- A visible message when stitching fails (today: Post is enabled again, nothing is shown).

## Physical-device test procedure

Run it on an iPhone (iOS 17 or later) and on a mid-range Android phone (for example a Samsung
Galaxy A-series or a Redmi Note, Android 13 or later), each with a development build made from this
branch (`npm run ios` / `npm run android` with the phone attached, or an EAS development build).
Sign in with a test account on the local stack or a test project, never real users' data. Keep the
Metro log open: every failure in this flow logs (`stitch failed`, `post failed`,
`recordAsync failed`, `camera switch failed during a take`).

For each case, write down: phone, OS, what you did, what the timer showed at Stop, what Review
played, the file's facts (below), and pass or fail.

### Recording and flipping

1. **One flip.** Open a prompt, Record on the front camera, talk, at about 0:05 tap Flip, keep
   talking on the back camera, Stop at about 0:12. Expect: the timer holds while the camera
   switches and then carries on from where it was; the ring follows the timer; Review shows the
   black video area briefly, then plays one clip: front, then back, with sound in both parts.
2. **Several flips.** Record, flip at about 0:03, 0:07, 0:11 and 0:15, Stop at 0:20. Expect: four
   joins, each part on the right camera, sound throughout, the parts in order.
3. **Fast flips.** Tap Flip twice quickly, then again within half a second of a new segment
   starting. Expect: the extra taps do nothing; no crash; the take continues.
4. **Flip near the limit.** Record to 0:29.2 or later and tap Flip. Expect: nothing happens; the
   camera does not switch, the timer runs on to 0:30 and Review opens with one camera for the last
   part. Then record and flip at 0:27: the camera switches, the timer stops at 0:30 and Review
   opens; the clip is no longer than 30 s.
5. **30 s with flips.** Record with two flips and let it run out. Expect: it stops by itself at
   0:30; the clip's duration is 30 s or a little under.
6. **2 s total.** Record 1 s, flip, record about 0.6 s, Stop. Expect: "Keep going: responses are at
   least 2 seconds", no Review. Then record about 1.5 s, flip, about 1.5 s, Stop. Expect: Review
   opens with a 3 s clip.
7. **Stop during the switch.** Flip and tap Stop at once. Expect: Review opens with the first part
   only; no crash; no recording continues.
8. **Light.** On the back camera with Light on, record, flip to front and back again. Expect: the
   torch comes back on the back camera after each join; the front shows the screen fill.

### Interruptions and permissions

9. **Cancel mid-take** (after a flip). Expect: the screen closes; nothing reaches Review. Check the
   app's `Documents/recordings/take/` is empty after the next take starts (Xcode: Devices and
   Simulators → the app → Download Container; Android: `adb shell run-as app.shortcut ls
   files/recordings/take` on a debug build).
10. **Backgrounding.** During a take with a flip, press Home (or swipe up). Come back. Expect: the
    take stopped when the app left; Review opens with what was recorded (or PR-Short if under 2 s).
11. **Incoming call.** Have someone call during a take (after a flip). Expect: as 10. Repeat with
    the call arriving during the switch itself (flip, then the call immediately).
12. **Lock the phone** during the switch. Expect: as 10; no crash on return.
13. **Permissions.** Turn camera access off in Settings, open the record screen: `A-Camera`. Turn
    the microphone off: `A-Mic`, Record unavailable. Turn both on again and record a flipped take.
14. **Orientation.** Start a take in portrait, flip, turn the phone to landscape, flip again, Stop.
    Expect: Review plays all parts in order; the landscape part is whole, scaled into the portrait
    frame (known limit). Note what you see.

### Stitching, Review and Post

15. **Re-record and Discard during the stitch.** Right after Stop on a flipped take, tap Re-record
    (and, on another take, Discard). Expect: no crash; the next take works; no leftover files.
16. **Failed stitching.** Not reproducible on purpose without a debug hook. If it happens in any
    case above, record the Metro log line (`stitch failed` with the error code) and whether Post
    then retried successfully.
17. **Post a flipped take** on a good connection. Expect: the Posting banner, then live; the live
    response plays the same clip as Review.
18. **Post a flipped take offline**, then go online and Retry from the Upload failed banner (and
    after killing and reopening the app). Expect: it posts the stitched clip; nothing is stitched
    twice.
19. **A take without a flip** (regression): record, Stop, Post. Expect: exactly as before.

### File integrity

Get the stitched file before it posts: on iOS, Download Container and look in
`AppData/Documents/recordings/` (the newest `.mp4`); on Android,
`adb exec-out run-as app.shortcut cat files/recordings/<name>.mp4 > stitched.mp4` on a debug build.
Then, on a Mac:

```sh
# With ffprobe (brew install ffmpeg; not installed on this Mac today):
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,bit_rate,sample_rate,channels:stream_side_data=rotation -of default=nw=1 stitched.mp4
ffprobe -v error -select_streams v -count_frames -show_entries stream=nb_read_frames -of csv=p=0 stitched.mp4

# Without ffprobe, with macOS tools only:
mdls -name kMDItemDurationSeconds -name kMDItemCodecs -name kMDItemPixelWidth -name kMDItemPixelHeight stitched.mp4
python3 -c "import struct,sys;d=open(sys.argv[1],'rb').read();o=0;b=[]
while o+8<=len(d):
  s,t=struct.unpack('>I4s',d[o:o+8]);s=struct.unpack('>Q',d[o+8:o+16])[0] if s==1 else (len(d)-o if s==0 else s);b.append(t.decode('latin1'));o+=s
print(' '.join(b))" stitched.mp4
```

Expect: `h264` and `aac`; 1080×1920 (portrait, no rotation tag on iOS; Android may store
1920×1080 with a 90° rotation tag, which players apply); duration equal to the parts' total
(within a frame); about 30 frames per second of duration; video bitrate around 2.5 Mbps (higher
for very busy scenes); `moov` before `mdat`. Play the file in QuickTime or VLC and check the joins
and the sound.

### Mux (read-only)

After case 17, look up the asset in the Mux dashboard (Video → Assets, search by the upload id from
the Metro log or the response's `playback_id`) or with a read-only API call:

```sh
curl -s -u "$MUX_TOKEN_ID:$MUX_TOKEN_SECRET" https://api.mux.com/video/v1/assets/<asset_id> | python3 -m json.tool
```

Check `status: ready`, `duration` equal to the clip's, `max_stored_resolution` and
`aspect_ratio` (9:16), one video and one audio track (`tracks[]`), and no `errors`. Do not change or
delete anything there. Then play the response in the app and on its shared web link.

### Pass

B-1 can be closed (by Nemat, in `docs/BLOCKERS.md`) when cases 1, 2, 5, 6, 10, 11, 17 and 19 pass
on both phones and the file checks match, with any failure in the other cases understood and
recorded.
