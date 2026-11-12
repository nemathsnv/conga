# iPhone bugs and mobile UX (19 Oct 2026)

Fixes for Nemat's real-device test on the iPhone 17 Pro (founder build `app.shortcut.founder`, hosted project).

- **Base:** `22a8f7a`, the tip of `claude/conga-mobile-beta-055063`. It was checked and is still the latest Conga commit.
- **Branch:** `claude/conga-iphone-bugs-ux-6cf82a`, four commits.
- **What did not happen:** nothing was pushed, deployed, published (no EAS Update) or installed on the phone. The hosted project and Mux were not touched.

| Commit | What |
| --- | --- |
| `817ce93` | P0: a refused Post is Upload failed (P2/P1), never silent |
| `a471142` | P1: zoom (pinch and button) during a take; flip beside Record |
| `00df105` | P2: swipe sideways between Home, profile and follower lists |
| `3bd9a1d` | P2: Home and player bottom overlay lower and tighter |

## P0. Respond → Post did nothing

**Root cause.** Two things combine.

1. **The server refuses the post.** SPEC.md Section 6 allows one response per person per prompt, so `post_response` refuses with `already_responded`. It checks this before it even looks at the upload. `post_reply` has no such limit.
   - The hosted project's first live prompt (`ddd5a383…`, 11 Oct) already has Nemat's live response `5b321c24…` (BETA-READINESS section 12).
   - The + sheet ("Respond to") still lists prompts you have already responded to.
   - So Home → + → Respond → record → Post is refused on the server, while a video reply posts.
2. **The app hid the refusal.** `submitPost` threw every server refusal, and Post Review only did `console.error('post failed')` and re-enabled Post. Nothing was shown, the recording stayed on Post Review, and Discard was the only way out.
   - This was already listed as open in BETA-READINESS section 1, under "Post refused while creating the row".

**Reproduced** on an isolated local stack (`shortcut-cg`, seed data). Signed in as Adam on the simulator, the + sheet offers "Be honest about the place you live", which Adam has already responded to.

- Called as Adam in a rolled-back transaction, `post_response` for that prompt answered `ERROR: already_responded`.
- `post_reply` to Maya's response on the same prompt passed every product check and stopped only at my fake upload id (`upload_not_found`).
- A real Post could not be made on the simulator because it has no camera (`recordAsync` → `SimulatorNotSupported`).

**Fix.**

- **`submitPost`** (`app/src/video/uploadRun.ts`):
  - A server refusal other than a restriction or `disclosure_required` is now stored as an Upload failed post with its reason.
  - Home then shows the approved banner:
    - P2 for `already_responded`, `prompt_not_live` and the other refusals Retry cannot fix: "Your response didn't post" / "This recording can't be posted.", Discard only.
    - P1 for anything else.
  - The refusal rolled back, so the stored post holds no upload URL. Discard deletes the recording at once without asking the server.
  - The URL Post Review asked for stays in the ticket store for the next recording, so nothing extra is minted at Mux.
  - The recording stays on the phone until Discard.
  - Duplicate submissions are still prevented by the existing gate, `busy` and once-per-recording guards.
- **Post Review** (`app/src/app/record/review.tsx`):
  - `disclosure_required` reopens A-Disclosure.
  - A disclosure check with no answer (offline, a blip) no longer blocks Post. The server checks the acknowledgement itself. Before, every offline Post silently did nothing.
  - Any other Post failure (a failed stitch, phone storage) shows a **system alert** with the banner's first line ("Your response didn't post"). The recording stays and Post can be tapped again. **This alert is not an approved board** (see the decisions below).
- **Regression tests** cover both entry points (`uploadRun.test.ts`, `memberPosting.test.ts`):
  - For a response (`already_responded`, `prompt_not_live`, `prompt_not_found`) and a video reply (`video_not_found`, `response_removed`):
    - Post resolves, the post is kept as failed, the view is P2, and Discard removes it without the server.
    - The review-time URL is reused, with no extra mint.
    - The right RPC is used for each.
  - Restrictions and `disclosure_required` are still thrown.
  - A refusal during a Discard stores nothing.
  - A storage failure is still thrown.

## P1. Zoom, and the flip button

**Root cause.** Zoom was never built.

- The "1×" button had no handler, and the camera's `zoom` was fixed at 0 (`RECORDING_SETTINGS.zoom`).
- The code comment read SPEC.md Section 6's control list, "… 1× zoom …", as "the spec allows only 1x".
- expo-camera (iOS) can zoom during recording. It sets `videoZoomFactor = max ^ zoom` on the wide-angle camera, live. But JavaScript cannot read `max`, and `CameraView` has no pinch of its own.

**Fix.**

- **`app/modules/camera-zoom`:** a new local Expo module (iOS, 20 lines of Swift). It returns the wide-angle camera's `videoMaxZoomFactor` for its current format, so the app can set and show a real factor.
  - **It is native code, so it needs a new build. An EAS Update cannot deliver it.**
- **`app/src/video/zoom.ts`:** converts factor ↔ expo-camera zoom, scales the pinch, and toggles 1× ↔ 2×. Zoom is capped at 10× or the camera's own limit. It has tests.
- **Record screen:**
  - Two-finger pinch anywhere on the preview zooms, before or during a take.
    - The pinch layer sits under every control and only takes two-finger touches, so taps on Record, Light, Flip and Cancel are unaffected.
    - The prompt card ignores touches, so a pinch over it still zooms.
  - The zoom button above Record shows the live factor ("1×", "1.4×", "2×") and toggles 1× / 2×.
  - Each camera starts at 1× after a flip, including mid-take. The flip still records a new segment, and Post Review stitches them as before.
  - **Flip** moves from the top right to the right of Record, as on the iPhone camera: Light | Record | Flip, with zoom above Record.
    - PR-Short's toast moves above the zoom button.
    - A-Camera (camera off) keeps its board layout.
- **Unchanged:** Light (torch and its re-apply), flip during a take, segment stitching and the 30 s total.
- **Android** reads no range (Android has never run). It assumes 8× with CameraX linear zoom, so the shown factor is approximate there.

## P2. Horizontal swipe

**Fix.**

- **`app/src/ui/SwipePages.tsx`:** a native paging horizontal ScrollView of the two lists, kept in step with the tabs.
  - A tab tap moves the pager. The tab changes once a swipe settles.
  - UIKit (and Android nested scrolling) picks vertical or horizontal from the first movement, so no JavaScript gesture competes with the video feed, sheets or recording.
  - Bounce is off.
  - On pushed screens (profile, followers) a 20 pt strip along the left edge keeps its touches from the pager, so the stack's back swipe still works on every page. A horizontal UIScrollView otherwise wins over the edge gesture.
- **Home (For you / Following):** each list is now its own page with its own list, position and loads.
  - Leaving a list reloads it from the top, as a tab switch always did.
  - Only the list on screen plays and counts `prompt_viewed` / `response_viewed`.
- **Me and other profiles (Responses / Replies):** the pager is as tall as the list shown, inside the profile's own scroll.
- **Followers / Following:** both lists swipe.

## P2. Video screen bottom overlay

**Root cause (Home).**

- `ConversationView` placed the Respond row `tabBarSpace + 90 + 10` above the bottom. `tabBarSpace` already includes the 84 pt tab bar, so the bar was counted twice (since phase 3).
- Board Main puts that row 28 pt above the tab bar (top 688 of 844). The author block, and the rail at a fixed top, sat equally high.
- Measured on the simulator, there were ~88 pt of empty video between the Respond row and the progress line. The board has ~18.

**Fix** (`app/src/ui/videoLayout.ts`, with tests). Nothing is removed and the copy is unchanged.

- **Home:**
  - The Respond row is 28 pt above the tab bar, as on the board.
  - The author block and the rail stand on it (or on Z-First's card) instead of a fixed top.
  - The whole overlay is **72 pt lower** on every iPhone.
- **Response player (R-Player-2):**
  - The "Next · name" row stands on the home-indicator inset (a 44 pt touch target, outside the inset).
  - Above it come the progress line, the two buttons, the author block and the rail, with the board's gaps.
  - The overlay is **34 to 70 pt lower**. The prompt header, face strip and "2 of N" at the top are unchanged.

## Verification

| | Where | Result |
| --- | --- | --- |
| Typecheck, lint | Mac | clean |
| Jest | Mac | 39 suites, 481 tests pass (444 at the base) |
| iOS Debug build, simulator | Mac, iPhone 18 Pro simulator (iOS 27.0) | BUILD SUCCEEDED, including the new CameraZoom module |
| Founder **Release** build, device, signed | Mac (`INSTALL=0`, not installed) | BUILD SUCCEEDED; details below |
| Server refusal asymmetry | isolated stack `shortcut-cg` | `post_response` → `already_responded`; `post_reply` passes |
| Home, player layout | simulator | before/after screenshots below; matches board Main's spacing |
| Swipe Home For you ↔ Following | simulator | works both ways; vertical paging inside each list still works; tab taps work |
| Swipe Me Responses ↔ Replies; Followers ↔ Following | simulator | works |
| Back swipe from the left edge on Followers (page 1) | simulator | goes back to Me |
| Record screen layout | simulator | Light, Record, Flip; zoom above Record; nothing top right |
| Zoom, pinch, flip with zoom, recording, stitching | **not run** | the simulator has no camera |
| Post Review after a refusal (P2 banner) | **not run end to end** | no recording possible on the simulator; covered by unit tests at the posting layer, not by a screen test |

**Simulator note.** A sideways swipe that starts while a vertical page is still snapping is taken by the vertical list. This is UIKit's normal behaviour (it held for both swipe directions once the page was at rest). Check that it feels right on the phone.

**Screenshots** (`screenshots/iphone-bugs-19oct/`):

- [01 Home before](screenshots/iphone-bugs-19oct/01-home-before.jpg) and [04 Home after](screenshots/iphone-bugs-19oct/04-home-after.jpg)
- [02 player before](screenshots/iphone-bugs-19oct/02-player-before.jpg) and [03 player after](screenshots/iphone-bugs-19oct/03-player-after.jpg)
- [05 Me after swiping to Replies](screenshots/iphone-bugs-19oct/05-me-replies-after-swipe.jpg)
- [06 record controls](screenshots/iphone-bugs-19oct/06-record-controls.jpg)

**Founder build** (built at `3bd9a1d`; installed on the iPhone 19 Oct, Nemat approved):

- Command: `INSTALL=0 DEVICE=00008150-00095DC03A61401C app/scripts/founder-ios.sh release`, with `app/.env.founder` copied, git-ignored, from the `conga-mobile-beta` worktree.
- Signing: `codesign --verify --deep --strict` is valid. Bundle id `app.shortcut.founder`, team `BP7TM32HCQ`, display name Conga, 0.1.0 (1). The free profile expires **24 Oct 2026 16:19 UTC**.
- Contents: the `CameraZoomModule` is linked. The JS bundle holds the hosted project URL and `conga.churntech.com`, and no local address.
- Runtime fingerprint: `a64bc144e306e405f6845ff316e48968dd83bf84`. The installed build has `edf83d3d…`, so **an EAS Update cannot carry these changes to the installed app**.
- Same bundle id and team as the installed app, so installing over it keeps the app's data, sign-in and any waiting recording.
- **Installed 19 Oct (Nemat approved)** over the existing `app.shortcut.founder` with `devicectl`. The first attempt returned a transient `IXRemoteErrorDomain` error 6; the retry reported "App installed". The launch was refused because the iPhone was locked (`BSErrorCodeDescription = Locked`), Once Nemat unlocked the phone, `devicectl` launched it at 05:59:08 UTC. The process (pid 20045, from the new install's path `397F48ED…`) was still running at 06:00:07 UTC, with no Conga crash log. Whether it opened signed in, with its data, is not seen from the Mac: Nemat to confirm on the phone.
- Commands used:

  ```bash
  xcrun devicectl device install app --device 00008150-00095DC03A61401C "app/ios/build/Build/Products/Release-iphoneos/Conga.app"
  ```

  ```bash
  xcrun devicectl device process launch --device 00008150-00095DC03A61401C app.shortcut.founder
  ```

  Run both from the worktree root. `app/ios` is generated and git-ignored; rebuild with the same command if it is gone.

## Needs a real iPhone

1. **P0 on the hosted project.** Respond to the prompt you have already responded to, then Post.
   - **Expected:** you land on Home with "Your response didn't post / This recording can't be posted." and Discard. Discard clears it.
   - Respond to a prompt you have *not* responded to (if one is open). **Expected:** it posts.
   - A video reply still posts.
2. **Zoom** on both cameras, before and during a take:
   - pinch in and out;
   - the button 1× → 2× → 1×;
   - the label tracks the pinch;
   - it never goes past the camera's limit;
   - flip mid-take, then zoom on the new camera;
   - stop, and check that Post Review plays one stitched clip with the zoom in it.
   - Also check that the torch still re-applies on the back camera.
3. **The new flip position:** reachable one-handed, no mis-taps on Record.
4. **Swipes:**
   - Home, Me, another person's profile, Followers;
   - the back swipe from the edge on the profile and Followers screens;
   - no swipe fights the vertical video scroll, Comments or Replies sheets, or the + sheet.
5. **Layout:** the Home and player overlays on the 17 Pro, with long captions (3 lines) and Z-First.

## Needs Nemat's decision (flagged, not decided here)

1. **SPEC.md Section 6, "1× zoom".** It was built as a fixed 1×. Your brief asks for working zoom, and SPEC's wording now conflicts with the build. Please record the decision in `docs/DECISIONS.md` and, if you agree, revise the SPEC line.
2. **Board drift:**
   - The flip is no longer top right on R-Record / Record-Reply.
   - The zoom button moved above Record.
   - Swipe is not on any board (it adds no screen).
   - Please approve, or ask for the boards to be redrawn.
3. **The Post Review system alert** for a Post that fails before anything is stored (stitch, storage). It uses the approved banner's first line but is not a board. Approve it, or design the state.
4. **The refusal copy.** For `already_responded`, P2 says "This recording can't be posted." without the reason.
5. **The + sheet and Home's Respond offer prompts you have already responded to.** You find out only after recording. A server field such as `viewer_responded` on `prompt_card`, plus a rule for what the sheet shows, would prevent this. That needs a decision and a board.
6. **"Reduce unnecessary duplication".** I removed nothing. The candidates are approved elements:
   - Home's "4 responses" in the prompt label and "3 more responses" at the bottom.
   - The player's "Next · name" row next to the face strip.
   - Say which, if any, should go.
7. **Home tab switching now keeps the other list alive.** It still reloads the list you leave, so content stays as fresh as before.

## Not changed

- No backend, migration or Edge Function change.
- Nothing deployed, published or pushed. The founder build was installed on the phone with Nemat's approval.
- The local stack `shortcut-cg` was used and stopped. The founder stack `shortcut` was not touched.
