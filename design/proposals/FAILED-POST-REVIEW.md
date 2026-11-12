# Failed-post boards P1 to P9: one-page approval package (16 Oct 2026)

**Status: approved and built 16 Oct 2026.** Nemat approved P1 to P9 as drawn. The ready-to-apply update in section 6 was applied: the 14 boards are in `design/html/`, `design/boards/` and `design/BOARDS.md`, the four changed boards (X-Upload-Failed, LV-SignOut, PR-Posting, A-Offline) are updated, and the UI is merged (`3908825`). This page is kept as the history of the review; the sections below are as they stood before approval.

Open `failed-post-ux.html` to see every board rendered (it is the source), or the PNGs listed below.

## 1. Checks done on 16 Oct

- `failed-post-ux.html` carries exactly the decided wording for P4, P6 and P9 (strings below), and "video reply" on every reply variant (P1-R, P2-R, P3-R, P5-R, P8-R). P4, P6, P7 and P9 read the same for a response and a video reply. No fix to the html was needed.
- `FAILED-POST-UX.md` and SPEC.md section 19 carry the same strings as the html.
- All 18 screenshots in `screenshots/` were opened and compared with the html text, board by board. Every one matches. `marked-P4`, `marked-P6` and `marked-P9` are the same boards with the new wording highlighted in yellow (P9 checked directly; the P4 and P6 highlights are also visible in `00-overview.png`).
- P9 keeps "You have 1 recording that hasn't posted." as its first sentence; the html shows it.

## 2. The boards

Yellow in the html means new or revised copy, approved 14 Oct. Everything else is existing approved copy, word for word.

| Board | When | Title | Second line | Actions |
|---|---|---|---|---|
| P1 | Upload failed and Retry can help (connection, upload limit, Mux not answering, server busy) | Your response didn't post | It's saved on this phone. Check your connection. (or the approved limit lines) | **Discard** · Retry |
| P1-R | The same, video reply | Your **video reply** didn't post | as P1 | Discard · Retry |
| P2 | It can never post (already responded, prompt or video gone, removed, closed submission, conflicting request) | Your response didn't post | This recording can't be posted. | Discard |
| P2-R | The same, video reply | Your video reply didn't post | This recording can't be posted. | Discard |
| P3 | The file is gone from the phone | Your response didn't post | This recording is no longer on this phone. | Discard |
| P3-R | The same, video reply | Your video reply didn't post | This recording is no longer on this phone. | Discard |
| P4 | Discard tapped (confirmation sheet) | Discard this recording? | Conga will try to stop it from posting. If it has already uploaded, it may still appear. | Discard (destructive) · Cancel |
| P5 | Discard not confirmed yet (offline, or Conga cannot verify) | Discarding your response | It stays on this phone until Conga confirms. | none |
| P5-R | The same, video reply | Discarding your video reply | It stays on this phone until Conga confirms. | none |
| P6 | Discard found it already at Conga | This recording already reached Conga | It may finish processing. If it appears on your profile, you can delete it there. | OK |
| P7 | Respond, Reply or Record while one waits (failed or offline) | Your last recording hasn't posted yet | Retry or discard it first. | OK |
| P8 | The same while it is posting | Your last recording is still posting | Keep Conga open until it's done. | OK |
| P8-R | PR-Posting banner, video reply | Posting your video reply | Keep Conga open until it's done. | none |
| P9 | Every sign-out with a recording waiting: Settings, LV-Suspended, end of Delete account, confirm email | Sign out? | You have 1 recording that hasn't posted. Signing out stops the upload on this phone, but it may still finish on Conga. An unresolved recording stays private on this device for your account. | Sign out anyway · Cancel |

Also decided, not drawn separately: A-Offline for a video reply reads "Your video reply stays saved on this phone." Drafts keep "Your draft didn't save" and "Saving your draft".

## 3. Screenshots (`design/proposals/screenshots/`, committed)

`00-overview.png` (all boards on one sheet), `01-P1`, `02-P1-R`, `03-P2`, `04-P2-R`, `05-P3`, `06-P3-R`, `07-P4`, `08-P5`, `09-P5-R`, `10-P6`, `11-P7`, `12-P8`, `13-P8-R`, `14-P9`, plus `marked-P4`, `marked-P6`, `marked-P9` (new wording highlighted). The zip is not committed.

## 4. Decisions already applied (14 Oct)

The three final copy decisions, as recorded in `docs/DECISIONS.md` (14 Oct rows) and applied to the html, `FAILED-POST-UX.md`, SPEC.md section 19 and `docs/DECISIONS.md`:
1. **P4**: "Discard this recording?" / "Conga will try to stop it from posting. If it has already uploaded, it may still appear." / Discard, Cancel.
2. **P6**: "This recording already reached Conga" / "It may finish processing. If it appears on your profile, you can delete it there."
3. **P9**: "Signing out stops the upload on this phone, but it may still finish on Conga. An unresolved recording stays private on this device for your account."

They complete the five design decisions of 14 Oct: Discard beside Retry (P1); a second recording blocked at camera entry (P7, P8); an unconfirmed Discard keeps the recording and retries safely (P5); "may finish processing", not "will post" (P4, P6, P9); "video reply" for replies (the -R boards).

## 5. The approval needed

One of:
- **"Approve P1 to P9 as drawn"** (this includes the five -R variants, and releases the prepared build on branch `hold/failed-post-ui`); or
- **Per-board objections**, for example "P5: change X". Only the objected boards are redrawn; the rest stay approved.

Two items need a yes or no, because the boards do not cover them:
- **First-response draft for a suggested prompt.** It never appears on a profile, so P6's "you can delete it there" does not apply, and no draft variant of P6 is drawn. Do you want one, or is the current behaviour (deleted from its suggestion with "Delete draft") enough?
- **ID names.** The new IDs `P1` to `P9` sit beside the existing `P-Places`, `P-Place` and `P-Unfollow`. They cannot clash, but they read alike. Keep them, or rename (for example `F1` to `F9`)?

## 6. Prepared updates to the approved set (not applied; apply on approval)

**New boards to add to `design/BOARDS.md`** (a row each, jpg from the matching screenshot, html split out of `failed-post-ux.html`): `P1`, `P1-R`, `P2`, `P2-R`, `P3`, `P3-R`, `P4`, `P5`, `P5-R`, `P6`, `P7`, `P8`, `P8-R`, `P9`. That is 14 boards, so the set goes from 86 to 100 and the counts in `BOARDS.md`, `CLAUDE.md` and SPEC.md status line change with it. Suggested section: "A1 — Failed posts: Discard, camera entry and sign-out", with the canvas note taken from section 4 above.

**Existing boards that change:**

| Board | Today | Change on approval |
|---|---|---|
| `X-Upload-Failed` | "Your response didn't post" / "It's saved on this phone. Check your connection." with Retry only | Add Discard beside Retry (P1); video reply title (P1-R); Discard-only variants with the two new second lines (P2, P3 and their -R boards); the Retry-only banner no longer exists. Canvas note "A failed upload keeps the video on the phone with Retry" becomes "with Discard and Retry". |
| `LV-SignOut` | "You have 1 recording that hasn't posted. Signing out deletes it from this phone." Settings only | Body becomes the P9 text; the warning is drawn for every sign-out route (Settings, LV-Suspended, end of Delete account, confirm email). Canvas note "Sign-out warning only appears when a recording that hasn't posted is saved on this phone" stays true. |
| `PR-Posting` | "Posting your response" | Add the video reply title "Posting your video reply" (P8-R). The canvas note "On failure: the existing Upload failed state" now points at P1 to P3. |
| `A-Offline` | "Your response stays saved on this phone. Post when you're back online." | Add the video reply line "Your video reply stays saved on this phone." |
| `PR-Discard` | "Discard this recording?" / "It won't be saved anywhere." | **No change.** It is the Post Review sheet, before anything is uploaded. P4 is a separate sheet for a recording that may already have uploaded. |

**Other files that change with the boards:** `design/BOARDS.md` canvas notes (Loading, error and empty states; Post review; Lightweight variants), SPEC.md section 3 rows for `X-Upload-Failed`, `LV-SignOut` and the new IDs, SPEC.md section 20 rows "Posting failed" and "Sign-out with unposted recordings" (which still say "Retry" and "deleting them from the phone"), and one row in `docs/DECISIONS.md` recording the approval. The online master spec needs the same section 19 change (it does not have it yet).

**Known mismatch to be aware of today:** SPEC.md section 19 already carries the revised sign-out text, while the approved `LV-SignOut` board and the app still say "Signing out deletes it from this phone." SPEC.md wins by the precedence rule, but the app cannot show the new text until P9 is approved (the design gate).
