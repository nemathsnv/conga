# Design approvals: one pass (16 Oct 2026)

Everything that waits on a design or product decision from Nemat, in one list. Each item: what, where in the app, a recommended default, and **one yes or no**. No new boards are drawn here; where an item needs words that no board has, the proposed words are marked **(new copy)** and a "yes" approves them.

**How to answer:** reply with the item numbers and yes or no, for example "A1 yes, A2 no, A3 keep, B1 yes, B2 yes, C1 yes ... D1 yes". "All recommended" is a valid answer. A "no" on an item leaves the app as it is today and nothing is built for it.

Status of the work behind this list: the failed-post UI is built and tested on branch `hold/failed-post-ui` and waits on section A. Nothing else here is built; each "yes" in B and C is a small follow-up build.

---

## A. Failed-post boards P1 to P9, as drawn: A1 answered yes (16 Oct); A2 to A4 still open

Full page with every board, its copy, the screenshots and the prepared board-set updates: `design/proposals/FAILED-POST-REVIEW.md`. Open `design/proposals/failed-post-ux.html` to see all boards.

| # | What | Where in the app | Recommended | Answer |
|---|---|---|---|---|
| A1 | Approve P1, P1-R, P2, P2-R, P3, P3-R, P4, P5, P5-R, P6, P7, P8, P8-R and P9 as drawn (14 boards), and add them to the approved set (`design/BOARDS.md`, 86 to 100 boards, and the four changed boards X-Upload-Failed, LV-SignOut, PR-Posting, A-Offline). | Home banner (Discard beside Retry, P2/P3/P5 states), the Discard and "already reached Shortcut" sheets, the camera-entry sheets, the sign-out warning on every route. Built on `hold/failed-post-ui`. | Yes. | **yes, 16 Oct 2026** (approved as drawn, built, boards added to the approved set) |
| A2 | A variant of P6 for a first-response draft of a suggested prompt (it never appears on a profile, so "you can delete it there" does not apply). | Discarding a draft that Mux already has. | No. Keep deleting it from its suggestion ("Delete draft"). | yes (draw one) / no |
| A3 | Keep the board IDs P1 to P9, beside P-Place, P-Places, P-Unfollow. | `design/BOARDS.md` | Keep. | keep / rename (F1 to F9) |
| A4 | Five choices made while building, each only visible on the built branch (details in `docs/release/FAILED-POST-UI-HOLD.md`): (a) the sign-out warning for Delete account is asked after you confirm who you are and before anything is deleted, so Cancel really cancels; (b) the "Your last recording hasn't posted yet" sheet also shows while a discard is waiting for Shortcut (its line "Retry or discard it first." then points at buttons that are not on screen); (c) A-Offline for a video reply is the existing sentence with the noun changed: "Your video reply stays saved on this phone. Post when you're back online."; (d) discarding a draft says "Discarding your draft"; (e) Discard and Retry are disabled while a discard is running. | Home banner, camera entry, Delete account, Settings. | Yes to all five. | yes / no for each of a to e |

## B. Post Review: two states with no board (reported by Agent B)

Both come from the camera flip during a take (B-1): a take with a flip is joined into one video on Post Review before it can be posted (`docs/release/CAMERA-FLIP.md`). A take without a flip never shows either state.

| # | What | Where in the app | Today | Recommended minimal option | Answer |
|---|---|---|---|---|---|
| B1 | While the take is being joined (a few seconds for 30 s on a recent phone, not measured). | Post Review (`PR-Review`, `PR-Reply`, `PR-Draft`), video area, `app/src/app/record/review.tsx`. Post waits for the join. | A black video area with a progress line stuck at the start, and no sign that anything is happening. | Show the spinner from X-Loading (the same one Home and the profile use) centred in the video area until the clip is ready. **No words.** Post stays as it is (it waits). Reuses an approved element; adds no copy. | yes / no |
| B2 | When joining the take fails (no space, the encoder fails, a build without the module). | Post Review, after tapping Post. | Post is enabled again and nothing is shown; a second tap tries again, Re-record and Discard work. The failure is only in the log. | Show the under-2-second toast from `PR-Short` (a one-line message over the screen, the same form, the same place). **(new copy)** "Couldn't prepare your video. Try Post again." Nothing else changes. If you prefer no new copy: leave as is. | yes (toast and this copy) / leave as is |

The failed-post form `X-Upload-Failed` does not fit B2: it is Home's banner for a recording that was posted and did not arrive, and says "Check your connection", which is wrong here.

## C. Gaps in the approved UI, and assumptions to confirm

From `docs/release/UI-REVIEW.md` ("Needs a design"). None was changed in the app.

| # | What | Where in the app | Recommended default | Answer |
|---|---|---|---|---|
| C1 | **A message when an action or a load fails.** About 70 places fail silently: the Home feed (a blank black screen), a delete that closes the sheet without saying it failed, report, block, follow, send a comment, request a review, profile and place loads. | Everywhere (`console.error` only). | Reuse existing forms, no new boards. Actions: the `PR-Short` toast form with **(new copy)** "Something went wrong. Try again." Loads: the `X-Unavailable` form's own line, "If it just didn't load: Try again", under the X-Loading layout (so Home's feed failure shows the loading layout with Try again, not a black screen). | yes / no |
| C2 | **Video reply versions of existing sheets.** Today the app says "response" or a bare "reply" for a video reply in: delete ("Delete your reply?" / "Delete reply", and the body "Video replies people sent stay on their own profiles", which is wrong for a video reply); report and block ("Why are you reporting this response?", "You won't see this response again."); the unavailable screen ("This response isn't available"); Activity's "liked your response". | `app/src/app/safety.tsx`, `reply/[id].tsx`, `lib/activityLabels.ts`. | Swap the noun to "video reply" and, for delete, use SPEC §18's own consequence: **(new copy)** "Delete your video reply?" / "It's removed from the conversation. Replies to it show 'Replying to a deleted video'." / "Delete video reply". Everything else keeps the board's sentence with "video reply" for "response". | yes / no |
| C3 | **A profile that cannot be shown** (missing, blocked, failed to load): today a blank page under its header. The video reply player's unavailable screen also has no Next or Try again. | `profile/[id].tsx`, `reply/[id].tsx`. | Reuse the `X-Unavailable` layout, with **(new copy)** "This profile isn't available" for profiles; give the video reply player the same Try again as the response player. | yes / no |
| C4 | **A video that fails to load in the Home feed.** In the response and video reply players it now shows X-Unavailable with Try again. In the Home feed the still frame just stays. A buffering indicator on slow connections has no board either. | `ui/VideoSurface.tsx`, Home. | Leave both as they are (the feed swipes on to the next conversation). | leave / draw something |
| C5 | **Recent searches belong to the phone, not the account**: someone who signs in as another account on the same phone sees the previous account's recent searches. | `lib/recentSearches.ts`, `SR-Recent` ("stay on this phone only"). | Clear them when the account changes (privacy on a shared phone). | clear / keep as drawn |
| C6 | **Largest text sizes.** Screens are laid out at fixed positions drawn for an 844 pt screen; at the largest accessibility text sizes text can overlap or clip. Controls and sheets already grow. | Player, Home, banners. | Cap text growth at about 130 percent in the product (a small build change), instead of redrawing a large-text layout. | cap / draw large-text layouts |
| C7 | **Contrast.** The boards' secondary text colour (`#8A8A8E` on white is 3.44:1, on the grey fill 3.08:1) and destructive text (`#FF3B30` on white is 3.55:1) are below 4.5:1 for small text. | Colour tokens in `ui/theme.ts`, used in many screens. | Use the darker tokens the boards already contain: `#6E6E73` for secondary text, `#D70015` for destructive text. A small visible change. | yes / no |
| C8 | **Draft banner words** that are in the app but on no board or in SPEC.md: "Saving your draft" and "Your draft didn't save". | Home banner, for a first-response draft. | Approve as built. | yes / no |
| C9 | **"Ask someone"** on the first-response card (Z-First) was a dead button. It now opens the phone's share sheet with the prompt's link, as the suggestion screen does. SPEC.md names the button, not what it does. | `ui/ConversationView.tsx`. | Yes, as built. | yes / no |
| C10 | **Android notification channel**: one channel, id `default`, named **"Shortcut"** (what Android's settings list), importance **default** (sound, appears in the shade, no pop-up banner). The ask timing (N-Prime) is unchanged. | `lib/notifications.ts`. | Yes, as built. | yes / no |
| C11 | **Where a tapped push goes** (SPEC §15 gives the texts, not the destinations): a video reply opens the video reply; a comment opens the comments sheet over the response; tonight's prompt, a prompt in a followed place and "people you follow respond" open the prompt; a **follow opens the follower's profile** and a moderation notice, review outcome or suggestion outcome opens the same screen as its Activity row; a **like opens the Activity tab** (it is one quiet line there and has nothing of its own). | `lib/pushRoutes.ts`, `app/a/[activityId].tsx`. | Yes, as built: a push goes where tapping the same event in Activity goes. | yes / no |
| C12 | **Singular counts on a profile** (found on the simulator, M2): a profile with one response says "1 responses" and one follower says "1 followers"; the boards only show plural counts. "following" is the same in both forms. | `ui/ProfileView.tsx` (the stats line under the name). | Use singular forms: **(new copy)** "1 response", "1 follower". Nothing else changes. | yes / no |
| C13 | **The video reply delete sheet says "along with its comments"** (found on the simulator, M5), but a video reply has no comments (SPEC §7). This is the same sheet as C2; the sentence is the part to fix. | `app/src/app/safety.tsx` (delete flow, title `reply`). | Approve the C2 wording, which drops "along with its comments" for a video reply. | yes / no (answer C2) |
| C14 | **An empty Replies tab on your own profile shows nothing** (no text, no board). Responses has X-Me-Empty ("Your responses show up here."). | `ui/ProfileView.tsx`. | Mirror that line, **(new copy)** "Your video replies show up here.", own profile only; other people's empty Replies tab stays blank. | yes / no |

## D. SPEC.md disagrees with itself (from `docs/release/SPEC-SYNC.md`, part 1.3)

Section 19 of the local SPEC.md was rewritten on 14 Oct (Discard, one waiting recording, sign-out on every route). Four other lines still carry the old behaviour. By the spec's own rule a line that disagrees with a newer section is stale, but each fix is a one-line product-text edit, so it waits for you. All four are applied together with A1, in the local SPEC.md and (separately) the online master.

| # | Where | Today | Recommended replacement | Answer |
|---|---|---|---|---|
| D1 | Section 3, screen inventory row 8 (`LV-SignOut`) | "Only when an unposted recording would be deleted." | "Only when a recording that hasn't posted is saved on this phone." (the wording of the board's canvas note) | yes / no |
| D2 | Section 20, states table, "Posting failed" (`X-Upload-Failed`) | "Saved on the phone, Retry." | "Saved on the phone. Discard or Retry; Discard only when it can't be posted." | yes / no |
| D3 | Section 20, states table, "Sign-out with unposted recordings" (`LV-SignOut`) | "Warns before deleting them from the phone." | "Warns before signing out: the upload stops on this phone, and it may still finish on Shortcut." | yes / no |
| D4 | Section 23, phase 3 | "posting with local save and Retry" | Leave: it describes what phase 3 built, as history. | leave / edit |

One more item for the same pass, no answer needed from you: the approved `LV-SignOut` board and today's app still say "Signing out deletes it from this phone." until A1 is approved and built, while SPEC.md section 19 already carries the new sentence.

## What happens after your answers

- **A1 yes:** the board files are added to `design/` and `design/BOARDS.md`, the four boards are updated, `hold/failed-post-ui` is merged, and D1 to D3 are applied. A "no" or an objection on a board: only that board is redrawn.
- **B, C yes:** each is a small follow-up build with tests, on a branch, nothing merged before you answer. Items marked "leave" or "no" need nothing.
- Every answer is recorded as a row in `docs/DECISIONS.md`.
