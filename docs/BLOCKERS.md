# Tracked blockers

The consolidated, grouped view of everything still open before the beta is `docs/BETA-READINESS.md`.

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

## B-2 · Push delivery credentials (phase 4, open)

**Requirement.** Push notifications for replies, comments, follows and prompts, with the ask timing
and settings (SPEC.md Section 15).

**Why it is open.** The app asks, registers tokens and the server queues and composes every
notification (`push_outbox`, `send-push`), but nothing can be delivered until three things exist
outside this repository: an EAS project id in `app.config.ts` (`extra.eas.projectId`, from
`eas init`, so the app can mint Expo push tokens), an APNs key on that project (needs the paid Apple
team, the same blocker as signing) and an FCM service account for Android. Until then
`registerTokenIfAllowed` logs once and registers nothing, and the outbox rows wait.

**Where in the code.** `app/src/lib/notifications.ts`, `supabase/functions/send-push`,
`public.run_push_sender` (needs the two Vault secrets from `supabase/README.md`).

**What closes it.** Nemat runs `eas init` and adds the credentials in the Expo dashboard; the
Vault secrets and `PUSH_SENDER_KEY` are set per environment.

**Check.** On a real iPhone and a real Android phone: after N-Prime, a video reply from another
account arrives as a notification with the spec's text, tapping it opens the reply; Pause all
stops it; comments within 10 minutes arrive as one notification.

## B-3 · Web domain and app links (phase 5, open)

**Requirement.** Shared links on one domain (SPEC.md Section 4: `conga.churntech.com/r/{id}`, `/p/{id}`,
`/i/{code}`), universal links and Android app links opening the app, link previews.

**17 Oct.** The domain is chosen: `conga.churntech.com`, admin on `admin.conga.churntech.com`, both
subdomains of `churntech.com`, which is already on Cloudflare (no purchase). The Pages package and the
dashboard steps are ready, nothing deployed: `docs/release/CLOUDFLARE-DASHBOARD.md`. The paragraphs
below describe the state before that.

**Why it is open.** The domain is not bought or pointed anywhere (SPEC.md Section 22). The web
player is built as the `web` Edge Function and works on the Supabase function URL; the app's links
point there until `EXPO_PUBLIC_WEB_BASE_URL` names the domain. Universal links also need the
`apple-app-site-association` and `assetlinks.json` files served from the domain and the
associated-domains entitlement, which needs the paid Apple team.

**What closes it.** Nemat chooses and buys the domain; DNS (or a CNAME through a small proxy) to the
function; the two association files; `associatedDomains` and `intentFilters` in `app.config.ts`.

**Check.** A shared link opens the app on a phone with it installed, the web page otherwise; the
preview shows the thumbnail, prompt and name in a messaging app.

## B-4 · Store builds and listings (phase 7, open)

**Requirement.** Store builds for iOS and Android with the listings, age ratings, privacy policy,
terms and community guidelines in place (SPEC.md Section 23, item 7; Section 24).

**Why it is open.** The build profiles exist (`app/eas.json`: development, preview, production;
build numbers kept on EAS) but every build needs things outside this repository: an Expo account
and `eas init` for the project id (`EAS_PROJECT_ID` in `.env`, also B-2), the paid Apple team and
a Google Play developer account (signing), the app icon (no board draws one; the Expo template
icon is still in `app/assets`), store listing text and screenshots, the age-rating answers, and
the privacy policy, terms and community guidelines documents or URLs. The Settings rows and the
`A-Removed` guideline link stay inactive until the URLs exist.

**What closes it.** Nemat provides the accounts, the icon and the documents; `eas build --profile
preview` succeeds for both platforms and installs on a phone; the listing fields are filled.

**Check.** A preview build installs from an internal link on an iPhone and an Android phone and
signs in against the hosted Supabase project.

## Gate 5 and pre-beta items (open)

Tracked here so they cannot disappear; none is closed by code alone.

- **Community guidelines** (and privacy policy, terms): no document or URL yet. `S-Settings` and
  `A-Removed` ("Read the Community Guidelines") stay inactive until then.
- **Help and feedback**: no destination (address or form) yet.
- **Moderation web admin**: required before the first outside tester (Nemat, 8 Oct 2026); the CLI
  is for development only.
- **Real-device verification** of phases 2 to 5 on iPhone and Android.
- **B-2** push credentials, **B-3** domain and app links and **B-4** store builds, above.
