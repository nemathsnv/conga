# Phase 3 plan: core loop

Branch `phase-3-core-loop`, from `phase-2-foundations` at `2e56641`. Gate 2 stays open (Nemat's call).

## Scope (SPEC.md Section 23, item 3)

Team-created prompts, recording, post review, the public disclosure, posting with local save and
Retry. Home, the response player and end card, profiles, follows, Following feed.

Boards: `C-Plus` (the Respond list; "Suggest a prompt" waits for phase 6), `R-Record`, `A-Camera`,
`A-Mic`, `PR-Short`, `PR-Review`, `PR-Caption`, `PR-Discard`, `A-Disclosure`, `PR-Posting`,
`X-Upload-Failed`, `Main`, `X-Loading`, `Z-Empty`, `Z-First`, `X-Following-Empty`, `R-Player-2`,
`R-Player-3`, `R-Player-End`, `X-Unavailable`, `R-Profile`, `LV-MyProfile`, `X-Me-Empty`,
`LV-EditProfile`, `LV-Followers`.

Out of this phase (later phases, per Section 23): likes, comments, video replies and reply rooms
(4), Activity and notifications including `N-Prime` (4), share sheet, report, block, delete,
Settings (5), places pages, Discover, search, suggestions (6), the remaining empty/offline states
and analytics (7). Rail icons for likes, comments and replies are drawn as on the boards; their
counts are zero until phase 4 and the icons do nothing yet.

## Stages

1. **Backend.** Migration `…000500_core_loop.sql`: `places` (reference only; Canggu), `topics`,
   `prompts`, `responses`, `follows`, disclosure acknowledgement on `accounts`, pinned response on
   `profiles`. RLS by default; writes through functions. Feed functions: `home_feed`,
   `following_feed`, `prompt_responses`; profile functions; `post_response`, `acknowledge_disclosure`,
   `follow_user` / `unfollow_user`, `update_profile`, `set_pinned_response`. Edge Functions:
   `mux-create-upload` (signed-in; minted on Post Review), `mux-upload-status` (signed-in; polls the
   upload, marks the response live, pre-warms), `mux-webhook` (Mux → live, pre-warm). Team tool
   `scripts/create-prompt.sh`.
2. **Video layer** behind interfaces in `app/src/video/`: `Recorder` (expo-camera; H.264 ≈2.5 Mbps,
   1080p, 30 s ceiling, 2 s floor, 1× on the wide lens, torch re-applied after start, front light as a
   screen fill), `Uploader` (foreground PUT with progress; the recording stays on the phone until it
   posts; pending-post record for Retry and for the next launch), `Playback` (expo-video HLS, 1 s
   forward buffer on iOS, preload of the next video). Segments: the recording model is a list of
   segments so a mid-recording flip can be added with stitching; stitching itself is not in this
   phase, so the flip control is inactive while recording (flagged in the report).
3. **Screens**, in flow order: `C-Plus` → `R-Record` (+ `A-Camera`, `A-Mic`, `PR-Short`) →
   `PR-Review` / `PR-Caption` / `PR-Discard` → `A-Disclosure` → Home with `PR-Posting` /
   `X-Upload-Failed` → `Main` / `X-Loading` / `Z-Empty` / `Z-First` / `X-Following-Empty` →
   `R-Player-2/3/End` / `X-Unavailable` → `R-Profile` / `LV-MyProfile` / `X-Me-Empty` /
   `LV-EditProfile` / `LV-Followers`.
4. **Checks.** pgTAP for feed order, one response per person per prompt, disclosure enforcement,
   follows; Jest for the pure pieces (feed paging, time labels, caption limit, pending-post store);
   typecheck, lint; simulator run; device run pending.
