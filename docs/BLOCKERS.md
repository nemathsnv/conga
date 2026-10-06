# Tracked blockers

Locked requirements that are not yet met in the app, so they cannot disappear between phases. Each one
names the requirement, where the gap is in the code, what closes it, and how it is checked. Remove an
entry only when the check has been run on a real device.

## B-1 · Camera flip during a take (phase 3, open)

**Requirement.** `R-Record` has a camera flip control and the flip must work while recording
(SPEC.md Section 6, "Controls: cancel, camera flip, light, 1× zoom …"; Nemat, 6 Oct 2026, recorded in
`spike/REPORT.md` Section 9). The result is one continuous clip.

**Why it is open.** expo-camera ends the recording when the camera flips (spike run 21), and
VisionCamera fails the same way on Android. Both need the app to record one segment per camera and
stitch the segments into one file before upload. Phase 3 was told to lay down the segment model and not
build the stitching yet, so the flip is disabled while recording: the control dims, its accessibility
label says "unavailable while recording", and nothing else on the screen pretends a flip happened.

**Where in the code.**

- `app/src/video/types.ts`: a `Recording` is already a list of `RecordingSegment`s, each with its
  camera facing and duration.
- `app/src/app/record/[promptId].tsx`: the flip control is `disabled={recording}`.
- `app/src/video/upload.ts` `uploadableFile`: throws `stitching_required` for more than one segment,
  so a multi-segment recording can never be uploaded unstitched.

**What closes it.**

1. Recorder: on flip during a take, stop the current segment, keep it with `keepSegment`, flip, start
   the next segment; the timer and the progress ring carry on from the total across segments; the
   30-second limit applies to the total; PR-Short applies to the total.
2. Stitcher: an Expo local module `app/modules/video-stitcher` with one function,
   `stitch(uris: string[]): Promise<string>`, that returns one H.264 MP4 at the recording settings.
   iOS: `AVMutableComposition` + `AVAssetExportSession` (video and audio tracks appended in order,
   the first segment's transform kept, front-camera mirroring preserved). Android: Media3
   `Transformer` with a `Composition` of the segments in order (re-encode, because segments from
   different cameras do not share codec parameters and `MediaMuxer` cannot join them).
3. Upload: `uploadableFile` stitches when there is more than one segment, uploads the stitched file,
   and deletes all files after the response is live.
4. Review: `PR-Review` plays the stitched file, not the first segment.

**Check.** On a real iPhone and a real Android phone: record, flip twice mid-take, stop, review plays
one continuous clip with sound across the joins, post, and the live response plays the same clip.
