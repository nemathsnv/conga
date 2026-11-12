# Failed-post UI (P1 to P9) on the iOS simulator (17 Oct 2026)

One screenshot review of the approved failed-post boards (`design/proposals/failed-post-ux.html`,
`design/proposals/FAILED-POST-UX.md`), as built in the integration tip `3908825`. Simulator only.
No phone was used, and no real recording, upload or Mux call was made.

## Setup

| | |
| --- | --- |
| App | Integration tip `3908825`, Debug development build for the iPhone 18 Pro simulator (iOS 27.0, Xcode 27.1), fresh Metro bundle. No native change since the last build, so it wasn't rebuilt. |
| Backend | Isolated local stack `shortcut-b` (scratch copy of `supabase/`, ports 55400–55409, studio, analytics and realtime off, all migrations and `seed.sql`). Edge Functions were served against a **fake Mux** on loopback (`MUX_API_BASE=http://host.docker.internal:55498`, fake token values). It's a 100-line scratch script (not committed) that mints upload URLs pointing at either a closed port (the upload fails) or a socket that accepts and never answers (the upload stays in progress), and answers upload status `waiting` or `asset_created`. Stopped at the end (`supabase stop --no-backup`). |
| Member | Signed up with an email code from the stack's Mailpit and the seed invite through `shortcut://i/TEST-OK1`. Onboarded as "Walker". The first-video disclosure was marked acknowledged in the local database (otherwise every post is refused with `disclosure_required`; the real flow asks on Post Review). |
| Recordings | The simulator has no camera, so no take can be recorded. Each waiting recording was **planted**: a pending post written into the app's own storage (AsyncStorage, key `shortcut.pendingPost.<member id>`, the exact shape `video/pendingPost.ts` stores) plus a real H.264 file in `Documents/recordings/`, with the app not running. On launch the app reads it as the member's waiting recording, as it would after a failed post. From there the states were driven through the app's own buttons wherever the server could take part (Retry, Discard). |

Copy check: every line on the screenshots was compared with the text of `failed-post-ux.html` by a
script (not committed), and all of them are in it word for word. The repo's
`failedPost.test.ts` makes the same check on the code's strings.

## The states

| Board | How it was produced | Copy match | Screenshot | Notes |
| --- | --- | --- | --- | --- |
| **P1** Upload failed, Discard beside Retry | Planted post, state `failed`, reason `upload_http_500` (a failed transfer). Also seen as the real result of Retry when the fake Mux's upload URL refused the connection. | yes | [P1](screenshots/failed-post/P1.png) | Layout as drawn. **Thumbnail missing** (M1). |
| **P1-R** video reply | The same, kind `reply` | yes | [P1-R](screenshots/failed-post/P1-R.png) | "Your video reply didn't post". |
| **P2** cannot be posted | **Real**: the member already had a live response on the prompt (a fixture row), and Retry made `post_response` refuse it with `already_responded`. The screenshot is a re-take with that same stored reason. | yes | [P2](screenshots/failed-post/P2.png) | Discard only, no Retry. |
| **P3** file gone | **Real**: planted with no file; Retry found the file missing (`recording_missing`). Re-taken with that stored reason. | yes | [P3](screenshots/failed-post/P3.png) | Until Retry is tapped, a post whose file has gone shows P1, not P3 (N2). |
| **P4** Discard confirmation | Discard on P1 | yes | [P4](screenshots/failed-post/P4.png) | Discard (red), Cancel. Cancel kept the recording. |
| **P5** Discarding | Planted as already sent (row and upload id set), with `discardRequested`, and the Edge Functions stopped, so `abandon-submission` could not answer (503). That is the same as offline for this step. At launch the app asks again, gets no answer and keeps it. | yes | [P5](screenshots/failed-post/P5.png) | No buttons. With the functions running, the server confirmed the discard at once (nothing of that submission existed) and the recording went, which is also correct. |
| **P5-R** | The same, kind `reply` | yes | [P5-R](screenshots/failed-post/P5-R.png) | |
| **P6** already reached Shortcut | **Real**: a video reply was posted for real through Retry (row created by `post_reply`, upload in progress at the fake Mux), the app was ended (interrupted, so P1-R), the fake Mux was set to `asset_created`, then Discard → P4 → Discard. `abandon-submission` answered `kept, at_mux` and the app showed P6 and carried on as processing. | yes | [P6](screenshots/failed-post/P6.png) | Behind the sheet the banner shows "Posting your video reply 100%", as designed (it keeps processing). |
| **P7** camera blocked, waiting | Respond on Home with P1 showing | yes | [P7](screenshots/failed-post/P7.png) | OK only. |
| P7 during P5 (build decision 2) | Respond with P5 showing | yes | [P7-during-P5](screenshots/failed-post/P7-during-P5.png) | "Retry or discard it first." while no Retry or Discard is on screen, as the build notes predicted. Needs Nemat's call (N3). |
| **P8** camera blocked, posting | **Real**: Retry on a planted video reply with the fake Mux holding the upload open, then Respond | yes | [P8](screenshots/failed-post/P8.png) | |
| **P8-R** posting a video reply | The same moment (top of the P8 screen) | yes | [P8-R](screenshots/failed-post/P8-R.png) | "Posting your video reply · 0%", "Keep Shortcut open until it's done." |
| **P9** Settings | Settings → Sign out with P1 waiting | yes | [P9-settings](screenshots/failed-post/P9-settings.png) | Cancel kept the member signed in. |
| **P9** LV-Suspended | Member suspended on the local stack (`mod_suspend`, the function `scripts/moderate.sh suspend` calls), relaunch → LV-Suspended → Sign out | yes | [P9-lv-suspended](screenshots/failed-post/P9-lv-suspended.png) | |
| **P9** Delete account (email path, confirm email) | Settings → Delete account → Delete account → "Confirm it's you" → code from Mailpit → P9 | yes | [P9-delete-account-confirm-email](screenshots/failed-post/P9-delete-account-confirm-email.png) | Asked after the code is accepted and **before** anything is deleted (build decision 1). Cancel left the account untouched (`accounts.deleted_at` still null). The code could only be submitted with a hardware Return (M2). |

## Mismatches and findings (none fixed: not my files)

| | Where | What |
| --- | --- | --- |
| **M1** | `ui/HomeStates.tsx` `PostingBanner` (Agent E) | The banner's thumbnail is an empty dark square on every state. The boards show a still of the recording. The code passes the recording's `.mp4` file to `expo-image`, which shows images, not video frames. A still needs to be made from the video (expo-video's thumbnail generation, or a frame saved at Post Review). |
| **M2** | `app/settings/confirm-email.tsx` (Agent E) | On "Confirm it's you" the number pad covers the red **Delete account** button, and a number pad has no Return key. There was no way to submit by touch on the simulator: the code went through only with a hardware Return. The screen has a `KeyboardAvoidingView` but the footer did not move. This is likely the same on a phone, which would block deleting an account on the email path. It needs checking on a device and fixing first. |
| N2 | `video/memberPosting.ts` `resumeOnLaunch` (Agent A) | A waiting recording whose file has gone shows P1 (with Retry) at launch. Only a Retry turns it into P3. The board implies P3 as soon as the file is gone. Small: one wasted tap. |
| N3 | P7 while P5 shows (decision 2 in `FAILED-POST-UI-HOLD.md`) | Confirmed on screen: the sheet says "Retry or discard it first." while the banner offers neither. Nemat's call: accept it, or draw a variant. |
| N4 | `ui/failedPost.ts` `CANNOT_POST` | A refusal of `disclosure_required` falls back to P1 ("Check your connection"), and Retry can never fix it. It's only reachable when the disclosure step was skipped, as in this walk's planted posts (the real flow shows A-Disclosure before Post), so it's low risk. Noted, not a board change. |

## Could not be produced on the simulator

- **P8 on Post Review** (`post_pending` after a second take). It needs a recorded take; the simulator has no camera.
- **P9 at the end of Delete account on the Apple and Google path.** It needs Sign in with Apple or Google, which isn't configured on a local stack or a simulator build. The email path was walked.
- **A-Offline for a video reply** ("Your video reply stays saved on this phone. …"). It needs the simulator offline while the Mac stays online, which the simulator can't do. The copy is checked by `failedPost.test.ts`.
- **P2-R, P3-R** were not captured separately. They use P1-R's title (seen) with P2's and P3's lines (seen).
- **The draft variants** ("Your draft didn't save", "Saving your draft", "Discarding your draft"). Not driven; there's no draft on this stack.
- **Anything on a phone**: timing, the real Mux, background behaviour during a real upload.

## Checks

Typecheck and lint clean; Jest 347/347 on `3908825`. No app code was changed for this review.

## Re-check of M1 and M2 after Agent E's fix (17 Oct 2026)

Code at `6383b0f`. Same simulator build (no native change), fresh Metro bundle, stack `shortcut-b`
brought up fresh with the loopback fake Mux and stopped afterwards. A waiting recording was planted as
above, with the same H.264 file the review used (a moving blue-and-white checkerboard).

| | Seen | Result | Screenshot |
| --- | --- | --- | --- |
| **M1** banner still (`ui/RecordingStill.tsx`) | X-Upload-Failed (P1): the thumbnail shows the clip's first frame (the checkerboard), with no play call. PR-Posting after Retry (upload held open by the fake Mux): the same frame. | **fixed** | [still-P1](screenshots/failed-post/still-P1.png), [still-PR-Posting](screenshots/failed-post/still-PR-Posting.png) |
| **M2** confirm-email footer | With the number pad up, **Delete account** and Cancel sit above it. Tapping Delete account by touch submitted the code; P9 opened. Cancel deleted nothing (`accounts.deleted_at` still null). | **fixed** | [confirm-email-keyboard](screenshots/failed-post/confirm-email-keyboard.png) |
