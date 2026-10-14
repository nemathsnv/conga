# Failed-post states: proposal for approval (14 Oct)

**Status: proposal. Not approved boards.** `design/boards/`, `design/html/` and `design/BOARDS.md`
are unchanged. The visual mock-ups are in `failed-post-ux.html` (P1 to P9). Built only from approved
boards: the X-Upload-Failed banner, the PR-Discard and LV-SignOut sheets, and PR-Posting's copy.
Copy in **bold** below is new and needs Nemat's approval; everything else is existing board copy,
word for word.

Behaviour behind these states is already built and tested locally (`docs/BETA-READINESS.md`
section 19), with no UI: nothing calls Discard yet except Sign out anyway.

## States

| # | State | When | Copy | Actions |
|---|---|---|---|---|
| P1 | Upload failed, can be retried | A connection failure, an upload limit, Mux not answering | "Your response didn't post" / existing second line (connection, or the approved limit lines) | Retry (existing); **Discard** (new text button) |
| P2 | Upload failed, can never post | `already_responded`, `prompt_not_found`, `video_not_found`, `suggestion_not_found`, `response_removed`, `response_deleted`, `submission_closed`, `submission_conflict` | "Your response didn't post" / **"This recording can't be posted."** | **Discard** only |
| P3 | Upload failed, file gone | `recording_missing` | "Your response didn't post" / **"This recording is no longer on this phone."** | **Discard** only |
| P4 | Discard confirmation | Discard tapped in P1 to P3 | PR-Discard, word for word: "Discard this recording?" / "It won't be saved anywhere." | Discard (destructive) / Cancel |
| P5 | Discarding, not confirmed yet | After Discard (or Sign out anyway), offline or Mux not verifiable | **"Discarding your response"** / **"It stays on this phone until Shortcut confirms."** | none (the app asks again by itself when the connection returns) |
| P6 | Discard: Mux already has it | The server answers `at_mux` | **"This recording already reached Shortcut"** / **"It will post. You can delete it from your profile afterwards."** | OK; the banner then shows PR-Posting |
| P7 | Another recording, first one failed or offline | Respond, Reply or Record tapped while a recording waits | **"Your last recording hasn't posted yet"** / **"Retry or discard it first."** | OK (no camera opens) |
| P8 | Another recording, first one still posting | The same, while it uploads or processes | **"Your last recording is still posting"** / "Keep Shortcut open until it's done." (PR-Posting) | OK |
| P9 | Sign-out warning on the other routes | LV-Suspended's Sign out, the end of Delete account, confirm email, with a recording waiting | LV-SignOut, word for word: "Sign out?" / "You have 1 recording that hasn't posted. Signing out deletes it from this phone." | Sign out anyway / Cancel |

Drafts use the banner's existing "Your draft didn't save" title; the new lines apply unchanged.

## Behaviour (built, waiting for these states)

- **Retry and Discard never run together.** Retry switches the banner to PR-Posting at once, so
  Discard is not on screen while anything is being sent or asked. Discard during an upload stops it
  and waits for it to end.
- **Safe discard:**
  - A recording that never sent anything goes at once, offline too.
  - Otherwise the server is asked first (abandon-submission, which asks Mux).
    - Confirmed: it goes.
    - Mux already has it: P6, and it posts.
    - Not confirmed (offline, Mux not verifiable): P5. It stays and still blocks a new recording,
      and is asked again at launch and when the connection returns.
  - Nothing published or processing is deleted automatically.
- **Retry offline** enters A-Offline (existing board) and posts by itself when the connection
  returns, as a post tapped offline does (Nemat, 9 Oct).
- **A waiting recording is never replaced:** a second Post is refused (`post_pending`). With P7/P8
  the camera does not open in the first place. Fallback, if a second take exists anyway: the same
  sheet on Post Review's Post, and the take stays on screen.

## Decisions needed

1. **Discard's placement:** a text button beside Retry (P1, recommended: visible, one tap from the
   confirmation), or tapping the banner opens a sheet with Retry / Discard / Cancel.
2. **When to block a second recording:** at camera entry (P7/P8, recommended), or only at Post.
   During an upload, or only once it has failed. Blocking during an upload stops a reply from being
   recorded while a response finishes (up to about a minute on mobile data).
3. **P5:** accept "asked again later" (built), or refuse Discard while offline with **"You're
   offline" / "Connect to discard this recording. It stays saved on this phone." / OK** (not
   built).
4. **P6's wording,** and whether "delete it from your profile" is the right pointer. Deleting your
   own video is SPEC.md §18 (SF-Delete), and A-Disclosure promises "Delete any of your videos at any
   time."
5. **Optional:** the banner says "response" for video replies too; the Words rule says "video
   reply" ("Your video reply didn't post").

## SPEC.md §19 revision (proposed text; SPEC.md is locked, so Nemat's decision)

Current text:

> - **Upload fails** (`X-Upload-Failed`): "Your response didn't post. It's saved on this phone. Check your connection." and Retry.
>
> - Unposted recordings are deleted from the phone on sign-out, after a warning (below).
>
> **Signing out with unposted recordings:** a warning comes first: "You have 1 recording that hasn't posted. Signing out deletes it from this phone." Sign out anyway, or Cancel. Drawn as LV-SignOut (section 3).

Proposed:

> - **Upload fails** (`X-Upload-Failed`): "Your response didn't post." with the reason, and Retry, or Discard after the PR-Discard confirmation. A recording that can never post offers Discard only.
> - **One waiting recording at a time:** while a recording is posting, waiting offline or failed, Respond, Reply and Record say so and do not open the camera. A waiting recording is never replaced.
> - **Discard:** the recording is deleted from the phone once Shortcut confirms it won't post. If Shortcut already has it, it posts (and can be deleted like any video). If Shortcut can't confirm yet, it stays on the phone and is discarded when the connection returns.
> - Unposted recordings are deleted from the phone on sign-out by any route, after a warning (below), on the same terms as Discard. One Shortcut cannot confirm yet stays on the phone, hidden, and is discarded the next time that person signs in on this phone.
>
> **Signing out with unposted recordings:** unchanged copy, shown on every sign-out route (Settings, LV-Suspended, the end of Delete account, confirm email).
