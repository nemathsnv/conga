# Failed-post boards: for final visual review (revised 14 Oct)

**Status: proposal boards, revised with Nemat's five decisions (14 Oct). Not approved boards.**
- `design/boards/`, `design/html/` and `design/BOARDS.md` are unchanged.
- No UI is built.
- The rendered boards are in `failed-post-ux.html`.
- SPEC.md §19 is revised to match (14 Oct).

Copy marks below:
- **bold**: new copy that follows from a decision already made.
- ***bold italic (drafted)***: wording drafted here, because the approved revised Discard
  confirmation, "may finish processing" and sign-out text was not supplied. Confirm or replace
  before the boards are approved.
- Everything else is existing approved copy, word for word.

## Decisions applied

1. **Discard is visible beside Retry** (P1).
2. **A second recording is blocked at camera entry** (P7, P8), whenever a recording is posting,
   waiting offline or failed.
3. **An unconfirmed Discard keeps the recording and retries safely** (P5). It asks again at launch,
   on returning to the app, and when the connection returns, then after 30 s, 2 min and 10 min.
   Never within the server's 2-minute hold.
4. **"May finish processing", not "will post"** (P4, P6, P9).
5. **"Video reply" for replies** (P1-R, P8-R; the same for every state).

## Boards

| Board | When | Copy | Actions |
|---|---|---|---|
| P1 | Upload failed, can be retried: a connection failure, an upload limit, Mux not answering, the server busy | "Your response didn't post" / existing second line (connection, or the approved limit lines) | **Discard** · Retry |
| P1-R | The same, video reply | "Your **video reply** didn't post" / as P1 | **Discard** · Retry |
| P2 | Can never post: already responded, prompt or video gone, removed, closed submission, conflicting request | "Your response didn't post" / **"This recording can't be posted."** | **Discard** |
| P3 | The file is gone | "Your response didn't post" / **"This recording is no longer on this phone."** | **Discard** |
| P4 | Discard tapped | "Discard this recording?" / ***"It will be deleted from this phone. If it already reached Shortcut, it may finish processing."*** (drafted) | Discard (destructive) / Cancel |
| P5 | Discard not confirmed yet (offline, not verifiable) | **"Discarding your response"** / **"It stays on this phone until Shortcut confirms."** | none |
| P6 | Discard found it already at Shortcut | **"This recording already reached Shortcut"** / ***"It may finish processing. If it appears on your profile, you can delete it there."*** (drafted) | OK |
| P7 | Respond, Reply or Record while one waits (failed or offline) | **"Your last recording hasn't posted yet"** / **"Retry or discard it first."** | OK |
| P8 | The same while it is posting | **"Your last recording is still posting"** / "Keep Shortcut open until it's done." | OK |
| P8-R | PR-Posting, video reply | "Posting your **video reply**" / "Keep Shortcut open until it's done." | none |
| P9 | Every sign-out with a recording waiting: Settings, LV-Suspended, the end of Delete account, confirm email | "Sign out?" / "You have 1 recording that hasn't posted. ***Signing out discards it from this phone. If it already reached Shortcut, it may finish processing.***" (second sentence drafted) | Sign out anyway / Cancel |

Video reply versions of the other states:
- P2, P3: same lines, title "Your video reply didn't post".
- P5: **"Discarding your video reply"**.
- A-Offline: **"Your video reply stays saved on this phone."**

Drafts keep "Your draft didn't save" and "Saving your draft".

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
