# Failed-post boards (approved and built 16 Oct)

**Status: approved and built 16 Oct 2026.** Nemat approved P1 to P9 as drawn, with the five decisions and the final copy for P4, P6 and P9. They are now approved boards: `design/html/<ID>.html`, `design/boards/<ID>.jpg` and `design/BOARDS.md` (section "Failed posts"). This folder is kept as the history of how they were reviewed.
- The UI is built (merged 16 Oct, `3908825`); see `docs/release/FAILED-POST-UI-HOLD.md`.
- The rendered proposal page is `failed-post-ux.html`.
- SPEC.md §19 matches (14 Oct, status note updated 16 Oct).

Copy marks below:
- **bold**: new or revised copy, approved 14 Oct (the five decisions, and the final P4, P6 and P9
  wording). No drafted wording remains.
- Everything else is existing approved copy, word for word.

## Decisions applied

1. **Discard is visible beside Retry** (P1).
2. **A second recording is blocked at camera entry** (P7, P8), whenever a recording is posting,
   waiting offline or failed.
3. **An unconfirmed Discard keeps the recording and retries safely** (P5). It asks again at launch,
   on returning to the app, and when the connection returns, then after 30 s, 2 min and 10 min.
   Never within the server's 2-minute hold.
4. **"May finish processing", not "will post"** (P4, P6, P9).
5. **"Video reply" for replies** (P1-R, P2-R, P3-R, P5-R, P8-R; the same for every state).

## Boards

| Board | When | Copy | Actions |
|---|---|---|---|
| P1 | Upload failed, can be retried: a connection failure, an upload limit, Mux not answering, the server busy | "Your response didn't post" / existing second line (connection, or the approved limit lines) | **Discard** · Retry |
| P1-R | The same, video reply | "Your **video reply** didn't post" / as P1 | **Discard** · Retry |
| P2 | Can never post: already responded, prompt or video gone, removed, closed submission, conflicting request | "Your response didn't post" / **"This recording can't be posted."** | **Discard** |
| P3 | The file is gone | "Your response didn't post" / **"This recording is no longer on this phone."** | **Discard** |
| P4 | Discard tapped | "Discard this recording?" / **"Conga will try to stop it from posting. If it has already uploaded, it may still appear."** | Discard (destructive) / Cancel |
| P5 | Discard not confirmed yet (offline, not verifiable) | **"Discarding your response"** / **"It stays on this phone until Conga confirms."** | none |
| P6 | Discard found it already at Conga | **"This recording already reached Conga"** / **"It may finish processing. If it appears on your profile, you can delete it there."** | OK |
| P7 | Respond, Reply or Record while one waits (failed or offline) | **"Your last recording hasn't posted yet"** / **"Retry or discard it first."** | OK |
| P8 | The same while it is posting | **"Your last recording is still posting"** / "Keep Conga open until it's done." | OK |
| P8-R | PR-Posting, video reply | "Posting your **video reply**" / "Keep Conga open until it's done." | none |
| P9 | Every sign-out with a recording waiting: Settings, LV-Suspended, the end of Delete account, confirm email | "Sign out?" / "You have 1 recording that hasn't posted. **Signing out stops the upload on this phone, but it may still finish on Conga. An unresolved recording stays private on this device for your account.**" | Sign out anyway / Cancel |

Video reply versions of the other states (P2-R, P3-R and P5-R are drawn; P4, P6, P7 and P9 read the same for both; A-Offline is an existing board, not redrawn here):
- P2-R, P3-R: same lines, title "Your video reply didn't post".
- P5-R: **"Discarding your video reply"**.
- A-Offline: **"Your video reply stays saved on this phone."**

Drafts keep "Your draft didn't save" and "Saving your draft".

## Copy checks (14 Oct)

- **P6, delete from your profile:** checked in the code, not on a device.
  - A recording Discard finds already at Mux always has its own row, still processing
    (`begin_submission_abandon`, `20261013000300`). Once live, it is on the author's profile:
    Responses or Replies.
  - Your own response: profile → player → More → "Delete your response?" (SF-Delete,
    `player/[promptId].tsx`). Your own video reply: profile → Replies → More → the same
    confirmation (`reply/[id].tsx`). Both call `delete_video`, which deletes the asset at Mux.
  - Not covered: a first-response draft for a suggested prompt. It never appears on a profile; it
    is deleted from its suggestion ("Delete draft", section 12). No draft variant of P6 is drawn.
    Open question for Nemat.
- **P9, "stops the upload on this phone":** matches the app. Sign out anyway runs the same
  discard as Discard, which stops any upload first (`discardForSignOut`, `memberPosting.ts`).
  A recording it cannot confirm stays in that member's own slot and is asked about again at
  their next sign-in.

## Behaviour (built and tested; waits for these boards)

- **Discard (P1 to P4)** runs only when no attempt is in flight. Retry switches the banner to
  PR-Posting at once, and Discard first stops and waits for any Post or upload.
- **The recording is deleted only once the server confirms nothing of it will be processed.**
  - Otherwise P5 (still blocking a new recording), asked again as in decision 3.
  - If Mux already has it: P6, and it carries on processing. Never deleted automatically.
- **Retry offline** enters A-Offline and posts by itself when the connection returns.
- **A waiting recording is never replaced.** P7/P8 stop the camera opening. If a second take
  exists anyway, Post is refused (`post_pending`), and the same P7/P8 sheet shows on Post Review.
- **Sign out anyway (P9)** never blocks signing out. A recording it cannot confirm stays on the
  phone under that account only, and is discarded at that person's next sign-in.

## Known differences between these boards and the app today

- None of P1 to P9 is built.
  - The app shows X-Upload-Failed with Retry only, and nothing in it calls Discard except Sign out
    anyway (Settings).
  - P2's and P3's lines are not mapped: the banner shows the connection line for every reason.
- Video replies still show "response" in the banner (`HomeStates.tsx`).
- The camera is not blocked at entry: a second take is refused only at Post (`post_pending`), with
  no message.
- LV-SignOut appears only in Settings, with the old body.
