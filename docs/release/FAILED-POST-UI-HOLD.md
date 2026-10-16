# Failed-post UI (P1 to P9) on `hold/failed-post-ui`: not for integration until approved

This branch implements `design/proposals/failed-post-ux.html` exactly as drawn, so that approval turns into a merge, not a build. **Do not merge it before Nemat approves P1 to P9** (`design/proposals/FAILED-POST-REVIEW.md`). The design gate (CLAUDE.md) forbids building a state that is not an approved board.

It was cut from the Agent E main branch tip and changes nothing under `app/src/video/`: it reads the posting state (`usePosting`) and calls the Discard and Sign out anyway functions that already exist.

## What is where

| Board | Where | Notes |
|---|---|---|
| P1, P1-R | `ui/HomeStates.tsx` `PostingBanner`, `ui/failedPost.ts` | Discard text button beside Retry (14 pt, 600, white; Retry unchanged). Video reply title. |
| P2, P2-R, P3, P3-R | `failedView()` in `ui/failedPost.ts` | A reason in `CANNOT_POST` gives P2; `recording_missing` gives P3; anything else (connection, the three upload limits, a busy server, interrupted, offline) stays P1. Discard only. |
| P4 | `(tabs)/index.tsx`, `DISCARD_SHEET` | `ActionSheet` in a Modal: Discard (destructive), Cancel. |
| P5, P5-R | `PostingBanner` | Shown when the stored post has `discardRequested`. No buttons. |
| P6 | `(tabs)/index.tsx`, `REACHED_SHORTCUT_SHEET` | Shown after a Discard when the posting state becomes `processing` for that same recording (read from the state; the provider's discard function returns nothing). OK only. |
| P7, P8 | `ui/recordEntry.tsx`, `cameraBlock()` | `RecordEntryProvider` (in `app/_layout.tsx`) renders the sheet. Every place that opened the camera now calls `useOpenRecord().open(...)`: Home Respond and "Be the first to respond", the C-Plus sheet, Me, Activity, the player (Respond, Reply, end card), the video reply player, the comments and replies sheets, and the suggestion draft screens. `failed`, `waiting` give P7; `uploading`, `processing` give P8. |
| P8-R, A-Offline (video reply) | `postingTitle()`, `offlineDetail()` | |
| P9 | `ui/SignOutWarning.tsx` | `useSignOutWarning()` on Settings, LV-Suspended, Delete account (Apple and Google path) and confirm email. |

Tests: `src/__tests__/failedPost.test.ts` (20). It reads `design/proposals/failed-post-ux.html` and checks that every string the UI shows for P1 to P9 is in the board. **If the html moves when the boards are added to `design/html/`, update the path in that test.**

## Decisions made while building (need a look at approval)

1. **P9 on Delete account and confirm email is asked before anything is deleted**, once the person has confirmed who they are (after the Apple or Google re-sign-in, or after the email code is accepted), not after the deletion. Cancel then really cancels. "At the end" in the proposal text could also mean after deletion, where Cancel would leave a signed-in session on a deleted account.
2. **P7 also shows while a discard waits for Shortcut (P5).** The board's second line, "Retry or discard it first.", then points at buttons that are not on screen. Either accept that, or draw a P7 variant for it.
3. **A-Offline for a video reply** is the existing sentence with the noun changed: "Your video reply stays saved on this phone. Post when you're back online." SPEC.md section 19 names only the first half.
4. **Discarding a draft** has no board ("Discarding your draft" is used, matching "Your draft didn't save" and "Saving your draft"). Drafts have no P6 either (open question in the review package).
5. **While a Discard runs**, the banner's Discard and Retry buttons are disabled (no board for that moment).

## Not done here (outside Agent E's files)

- **Post Review** (`app/src/app/record/review.tsx`, Agent B): when Post is refused with `post_pending` it should show the same P7 or P8 sheet. The hook is ready: `useOpenRecord().showBlock()` returns whether it showed one. One line in that file once both branches are integrated.
- The camera screens themselves are unchanged, and Post Review's own Re-record (a take that has not been posted yet) is not blocked.

## Verification (16 Oct, this branch)

`npm run typecheck` clean, `npm run lint` clean, `npm test` 272 of 272. Not run: a simulator, a device, VoiceOver. The sheets, the banner layout against the board and the P6 trigger have only been read, not seen.
