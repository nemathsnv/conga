# Phase 3 report: core loop

Branch `phase-3-core-loop`. Date 6 Oct 2026. Gate 2 is still open and is not marked passed.

## 1. What Phase 3 required (SPEC.md Section 23)

Team-created prompts, recording, post review, the public disclosure, posting with local save and
Retry. Home, the response player and end card, profiles, follows, Following feed.

## 2. What was implemented

- **Prompts** are team-created with `scripts/create-prompt.sh` (global or tied to a place, optionally
  "Tonight's prompt" for a day). Members cannot create prompts.
- **Recording** (`R-Record`): expo-camera, front camera first, H.264 at 2.5 Mbps and 1080p, native
  1x, 30 s ceiling, 2 s floor with the `PR-Short` toast, red timer and progress ring, torch for the
  back camera re-applied after start, screen-fill light for the front camera, `A-Camera` and `A-Mic`
  states. Flip works before a take; during a take it is inactive because a mid-recording flip needs
  segment stitching (the recording model is already a list of segments; stitching is deferred as
  instructed).
- **Post review** (`PR-Review`, `PR-Caption`, `PR-Discard`): local playback with sound, caption up to
  150 with a counter, Re-record, Discard confirmation, Post. The Mux upload URL is minted while the
  person reviews.
- **Disclosure** (`A-Disclosure`): shown once before the first public video; the server refuses a post
  until it is acknowledged.
- **Posting** (`PR-Posting`, `X-Upload-Failed`): the response row is created on Post, the file uploads
  in the foreground with progress, the app polls Mux until the asset is ready (a webhook does the same
  server-side), the asset is pre-warmed, and the recording stays on the phone until it is live. A
  failed or interrupted upload shows the Upload failed banner with Retry; a stale upload URL is
  re-minted on Retry.
- **Home** (`Main`, `X-Loading`, `Z-Empty`, `Z-First`, `X-Following-Empty`): one conversation per
  prompt, swipe up for the next prompt, the featured prompt first, the shown response from someone
  you follow when there is one; Following shows responses from people you follow, newest first,
  with suggestions when empty. Video loops with sound; the next video's thumbnail is loaded ahead.
- **Response player** (`R-Player-2`, `R-Player-3`, `R-Player-End`, `X-Unavailable`): order = the
  entry response, then unseen responses from people you follow, then newer; face strip with jump,
  "2 of 23", auto-advance at the end of a video, end card, unavailable state.
- **Profiles and follows** (`R-Profile`, `LV-MyProfile`, `X-Me-Empty`, `LV-EditProfile`,
  `LV-Followers`): counts, bio, "Followed by …", Follow / Following, the responses grid with the
  pinned marker and the Processing tile, Edit profile with the bio counter, Followers / Following
  lists with Follow back.
- **The + sheet** (`C-Plus`): Respond to tonight's prompt or any open global prompt. The
  "Suggest a prompt" rows wait for phase 6.

## 3. Migrations and schema

`supabase/migrations/20261006000500_core_loop.sql`:

| Object | Purpose |
|---|---|
| `places`, `topics` | Reference data (Canggu). Place pages and following are phase 6. |
| `prompts` | text ≤120, scope (global or one place), topic, source, attribution, status, `featured_on` (one global prompt per day). |
| `responses` | one per person per prompt while processing or live (partial unique index); caption ≤150, duration 1.5–31 s, status processing/live/removed/deleted, Mux upload/asset/playback ids. Status is never settable from the app. |
| `follows` | one-way, public, no self-follow. |
| `accounts.public_disclosure_ack_at`, `profiles.pinned_response_id` | disclosure and pin. |
| Functions | `home_feed`, `following_feed`, `prompt_responses`, `get_response`, `open_prompts`, `get_prompt`, `acknowledge_disclosure`, `post_response`, `retry_response_upload`, `abandon_response`, `get_profile`, `profile_responses`, `follow_user`, `unfollow_user`, `follow_list`, `follow_suggestions`, `update_profile`, `set_pinned_response` (signed-in); `mark_response_live`, `team_create_prompt` (service role). All derive the user from `auth.uid()`. Function privileges are now closed explicitly for every function and opened per function, because default privileges were not reliable across migration runners. |

Edge Functions: `mux-create-upload` (signed-in, profile required), `mux-upload-status` (signed-in,
own uploads only; marks live and pre-warms), `mux-webhook` (Mux signature; marks live and pre-warms).
Mux credentials live in Edge Function secrets only.

## 4. Approved boards implemented

`C-Plus` (Respond list), `R-Record`, `A-Camera`, `A-Mic`, `PR-Short`, `PR-Review`, `PR-Caption`,
`PR-Discard`, `A-Disclosure`, `PR-Posting`, `X-Upload-Failed`, `Main`, `X-Loading`, `Z-Empty`,
`Z-First`, `X-Following-Empty`, `R-Player-2`, `R-Player-3`, `R-Player-End`, `X-Unavailable`,
`R-Profile`, `LV-MyProfile`, `X-Me-Empty`, `LV-EditProfile`, `LV-Followers`.

Drawn but inactive until their phase: like, comment, video-reply and share rail actions and
"Reply to …" (phase 4), Share profile, the … menu, "Ask someone" (phase 5), Settings gear (later),
Search (phase 6). Not drawn: the "Suggest a prompt" rows of `C-Plus` (phase 6), the "Next conversation"
card on `R-Player-End` (the player closes back to Home, where swiping continues).

## 5. Checks

| Check | Result |
|---|---|
| `supabase test db` | 81 of 81 (phase 2: 50, phase 3: 31): RLS for prompts/responses/follows, members cannot create prompts or mark responses live, feed order (featured first, followed person preferred, seen conversations excluded), Following feed, player order, disclosure required, duration limits, one response per prompt, Processing tile on own profile, live responses visible to others |
| `npm run typecheck`, `npm run lint` | clean |
| `npm test` | 33 of 33 (labels, recorder limits, pending-post resume, plus phase 2 suites) |
| iOS simulator build (`expo run:ios`, iPhone 17 / iOS 27) | builds and runs |
| Android | not rebuilt in this phase; the phase 2 Gradle build included none of the video modules yet |

## 6. Verified on the iOS simulator (local Supabase, the spike's Mux assets as seeded responses)

Home with live Mux HLS video, prompt label, rail, author block, face strip and Respond; the player
with "1 of 4", face strip, progress, "Next · …", auto-advance and swipe; the end card; `R-Record`
with the camera and microphone prompts (the simulator has no camera, so no take); the + sheet;
`X-Me-Empty`; `LV-EditProfile`; `R-Profile` with Follow; `LV-Followers`; the Following feed after
following; `Z-Empty`. Storage and posting functions were exercised by pgTAP and scripts.

Not verified anywhere yet: an actual take, Post Review playback of a local file, the disclosure
sheet, the upload and the Posting / Upload failed banners end to end, `Z-First`, `X-Unavailable`,
`A-Mic`, `X-Following-Empty` on screen. These need a camera, so they wait for the iPhone build
(blocked on the Apple team, see the phase 2 report) or a physical Android.

## 7. Verified on a real device

Nothing. Same blockers as phase 2 (paid Apple team for signing; no Android device).

## 8. Deviations and open questions

1. **Mid-recording flip** is a tracked blocker, `docs/BLOCKERS.md` B-1: the segment model and the
   upload guard are in place, the stitcher is not. While recording the flip control is disabled, dimmed
   and announced as unavailable. The requirement stays active and the blocker names what closes it.
2. **Front-camera light** is a white screen-fill overlay at 88 % opacity; the preview stays faintly
   visible underneath. Treatment choice, not on a board.
3. **End card** (completion pass, 7 Oct): the last watched response is drawn blurred behind the card
   as on the board, the "Next conversation" card shows the next Home conversation (`home_feed`
   excluding the current prompt) with its count and thumbnail, and a tap on the card or a swipe up on
   the end card opens that conversation's player in place of this one (a chain of end cards never
   loops back to a prompt it passed). A prompt with no live responses shows `Z-Empty` in the player
   instead of an end card.
4. **Camera and microphone usage strings** (completion pass, 7 Oct) now say that Shortcut uses the
   camera to record video responses and video replies (and the profile photo) and the microphone for
   their sound. Confirmed in the prebuilt `Info.plist`.
5. **Caption, rail counts** draw as on the boards with counts hidden while zero (likes, comments
   and replies arrive in phase 4).
6. **Processing responses** are only visible to their author (Processing tile); nobody else sees the
   video until Mux reports it ready.
7. **Phase 2 fix found on the way**: the 6-digit code field accepted only one digit with the
   software keyboard; the invisible input now covers the boxes.

## 9. Remaining blockers

The phase 2 list stands: hosted project deploy (`supabase db push`, `functions deploy` for all four
functions, `config push`, `secrets set` with the Mux token and webhook secret), the paid Apple team,
Google credentials, an Android device. For Mux on the hosted project: a webhook pointing at
`<project>/functions/v1/mux-webhook` with its signing secret in `supabase/.env`.

## 10. Git

Branch `phase-3-core-loop` from `phase-2-foundations` (`2e56641`). See `git log --oneline 2e56641..HEAD`.
