# Online master spec: synchronisation package

Written 16 Oct 2026 by the release-engineering role. **The online master (the Claude Doc at
`https://claude.ai/code/artifact/eee59791-f711-4dac-bc44-d24dfaae2018`) was not read, opened or changed.** This file
only says what differs between the master as exported at rev 110 (5 Oct 2026) and the local `SPEC.md`, so Nemat can
paste the changes in. The header of `SPEC.md` carries the warning: "Not yet in the online master: update the
master before the next re-export, or this revision is lost." **Do not re-export the master over `SPEC.md` before
Part 1 is pasted into the master.**

How this was derived: `git log --format='%h %ad %s' --date=short 3cce0ac..HEAD -- SPEC.md` lists exactly two commits
after the rev 110 export (`3cce0ac`, 5 Oct), both on 14 Oct 2026: `f1dd2c6` (section 19 revised) and `7ebb69e`
(final copy for the P4, P6 and P9 boards, which changed only section 19 and the header note). `git diff 3cce0ac
HEAD -- SPEC.md` is 15 insertions and 6 deletions: the header comment and section 19, nothing else. Part 1 is that
diff in paste-ready form. Parts 2 and 3 are changes that are **decided but not yet written into SPEC.md at all**
(they live only in `docs/DECISIONS.md`); they are proposed wording for Nemat to confirm, because the spec is locked
and nobody but Nemat edits product text.

## Part 1. Changes already in the local SPEC.md (approved by Nemat, 14 Oct 2026)

### 1.1 Header comment (local file only; the master has no such comment)

The export header is a comment in the repository copy, not part of the master document. No paste needed. Before:

```
<!-- Exported from the locked Claude Docs spec (rev 110, 5 Oct 2026):
https://claude.ai/code/artifact/eee59791-f711-4dac-bc44-d24dfaae2018
The online doc is the master. If it changes, re-export this file. Diagrams were converted to text. -->
```

After (for the record):

```
<!-- Exported from the locked Claude Docs spec (rev 110, 5 Oct 2026):
https://claude.ai/code/artifact/eee59791-f711-4dac-bc44-d24dfaae2018
The online doc is the master. If it changes, re-export this file. Diagrams were converted to text.
Local revision, 14 Oct 2026 (approved by Nemat): section 19, failed posts, Discard and sign-out.
Not yet in the online master: update the master before the next re-export, or this revision is lost. -->
```

When the master has Part 1, **delete the last two lines** of that comment (the "Local revision" note and the
"Not yet in the online master" warning) and update the rev label if Nemat wants one (the repository says "rev 110";
a new revision number is Nemat's to assign, none is proposed here).

### 1.2 Section 19, "Offline and local drafts": replace the whole section

In the master, select everything from the heading `## 19. Offline and local drafts` up to, not including, `## 20.
Empty, error and loading states`, and replace it with the block under "Replacement text". The "Current text in the
master" block is the rev 110 text, so the right range can be confirmed before replacing.

**Current text in the master (rev 110, `git show 3cce0ac:SPEC.md`):**

~~~~markdown
## 19. Offline and local drafts

A recording is never lost because of a bad connection. It stays saved on the phone until it posts or the person deletes it. There is no background upload that survives closing the app.

- **Upload:** starts when Post is tapped and runs while the app is open.
- **Upload fails** (`X-Upload-Failed`): "Your response didn't post. It's saved on this phone. Check your connection." and Retry.
- **App closed mid-upload:** the recording stays saved. Next time the app opens, the same banner offers Retry.
- **Offline** (`A-Offline`): "You're offline. Your response stays saved on this phone. Post when you're back online." Already loaded videos keep playing. No offline downloads.
- **Recording offline:** allowed. Post waits for the connection.
- **Two kinds of draft:**
  - An **unposted recording** lives only on the phone.
  - A **first-response draft** for a suggested prompt is uploaded privately to the server, so it survives reinstalls (section 12).
- Unposted recordings are deleted from the phone on sign-out, after a warning (below). They show up only through the Upload failed banner (`X-Upload-Failed`); there is no separate list.

**Signing out with unposted recordings:** a warning comes first: "You have 1 recording that hasn't posted. Signing out deletes it from this phone." Sign out anyway, or Cancel. Drawn as LV-SignOut (section 3).
~~~~

**Replacement text (local `SPEC.md`, 14 Oct 2026; copied by script, character for character):**

~~~~markdown
## 19. Offline and local drafts

A recording is never lost because of a bad connection. It stays saved on the phone until it posts or the person discards it. There is no background upload that survives closing the app.

*Revised 14 Oct 2026 (Nemat): Discard, one waiting recording at a time, and sign-out on every route. The new states are proposal boards P1 to P9 (`design/proposals/`), awaiting visual approval; nothing here is built until they are approved. Final copy for P4, P6 and P9 approved 14 Oct.*

- **Upload:** starts when Post is tapped and runs while the app is open.
- **Upload fails** (`X-Upload-Failed`): "Your response didn't post. It's saved on this phone. Check your connection." with Discard and Retry side by side. For a video reply: "Your video reply didn't post." A recording that can never post ("This recording can't be posted.") or is no longer on the phone ("This recording is no longer on this phone.") offers Discard only.
- **Discard:** a confirmation comes first: "Discard this recording?" / "Shortcut will try to stop it from posting. If it has already uploaded, it may still appear." Discard, or Cancel. The recording is deleted from the phone once Shortcut confirms none of it will be processed.
  - **Not confirmed yet** (offline, or Shortcut cannot verify): the recording stays on the phone, shown as "Discarding your response" / "It stays on this phone until Shortcut confirms." Shortcut asks again by itself: when the app opens or comes back, when the connection returns, and on a short, limited schedule.
  - **Already reached Shortcut:** "This recording already reached Shortcut" / "It may finish processing. If it appears on your profile, you can delete it there." A video that reached Shortcut is never deleted automatically.
- **One waiting recording at a time:** a recording that is posting, waiting offline or failed is never replaced. While one waits, Respond, Reply and Record do not open the camera: "Your last recording hasn't posted yet" / "Retry or discard it first."; while it posts: "Your last recording is still posting" / "Keep Shortcut open until it's done."
- **Posting** (`PR-Posting`): for a video reply, "Posting your video reply".
- **App closed mid-upload:** the recording stays saved. Next time the app opens, the same banner offers Retry.
- **Offline** (`A-Offline`): "You're offline. Your response stays saved on this phone. Post when you're back online." For a video reply, "Your video reply stays saved on this phone." Already loaded videos keep playing. No offline downloads.
- **Recording offline:** allowed. Post waits for the connection.
- **Two kinds of draft:**
  - An **unposted recording** lives only on the phone.
  - A **first-response draft** for a suggested prompt is uploaded privately to the server, so it survives reinstalls (section 12).
- Unposted recordings are discarded on sign-out by any route, after a warning (below), on the same terms as Discard. One Shortcut cannot confirm yet stays on the phone, out of reach of any other account, and is discarded the next time that person signs in on this phone. They show up only through the Upload failed banner (`X-Upload-Failed`); there is no separate list.

**Signing out with unposted recordings:** a warning comes first, on every sign-out route (Settings, LV-Suspended, the end of Delete account, confirm email): "You have 1 recording that hasn't posted. Signing out stops the upload on this phone, but it may still finish on Shortcut. An unresolved recording stays private on this device for your account." Sign out anyway, or Cancel. Drawn as LV-SignOut (section 3); its revised text and the other routes are proposal board P9.
~~~~

What changed, in words: Discard beside Retry with a confirmation; the "may still appear" and "already reached
Shortcut" states; one waiting recording at a time with the two camera-entry messages; video-reply wording
("video reply", not "reply"); sign-out discards by every route with a longer warning; the italic revision note
(proposal boards P1 to P9, final copy for P4, P6 and P9 approved 14 Oct). Decisions: `docs/DECISIONS.md` rows of 13
Oct (a second recording never overwrites a waiting one) and 14 Oct (two rows).

### 1.3 Places in the local SPEC.md that still carry the old behaviour (found while diffing; decision for Nemat)

Section 19 was rewritten, but four other lines were not, so the local spec now disagrees with itself. They are
stated here, not fixed here:

| Where | Current text | Conflicts with |
| --- | --- | --- |
| Section 3, screen inventory row 8 (`LV-SignOut`) | "Only when an unposted recording would be deleted." | Section 19: the warning appears on every sign-out route when a recording has not posted, and the outcome is "discarded", possibly "stays private on this device". |
| Section 20, states table, "Posting failed" | "Saved on the phone, Retry." | Section 19: Discard and Retry side by side; Discard only for a recording that can never post. |
| Section 20, states table, "Sign-out with unposted recordings" | "Warns before deleting them from the phone." | Section 19: "Signing out stops the upload on this phone, but it may still finish on Shortcut." |
| Section 23, phase 3 | "posting with local save and Retry" | Historic phase description; harmless, listed for completeness. |

The first three are stale by the spec's own rule ("Where this spec and a canvas note disagree, this spec wins"), but
a one-line edit each is a product-text change, so it is left for Nemat. Also: the proposal boards P1 to P9 live in
`design/proposals/` and are **not** in the A1 Native canvas (version 26) or in section 3's inventory; the
canvas master has not been updated either.

## Part 2. The camera-flip clarification of Section 6 (DECISIONS 6 Oct 2026)

`docs/DECISIONS.md`, 2026-10-06: "Camera flip must work while recording, not only before it. Clarifies SPEC.md
Section 6 'camera flip' control. Needs a spec edit at the next revision." The edit was never made, in the master or
in the local `SPEC.md`. It is the requirement behind blocker B-1 (`docs/BLOCKERS.md`).

**Current text, Section 6 "Recording (`R-Record`)", second bullet (identical in the master and locally):**

```
- Controls: cancel, camera flip, light, 1× zoom, record and stop with a progress ring, red timer.
```

**Proposed replacement (wording drafted from the decision and from `docs/BLOCKERS.md` B-1; Nemat to confirm):**

```
- Controls: cancel, camera flip, light, 1× zoom, record and stop with a progress ring, red timer. The camera flip works before recording and during it; flipping mid-take keeps recording, and the result is one continuous clip.
```

Companion sentences the same decision implies, if Nemat wants them in the spec: the 30-second limit and the 2-second
minimum apply to the total length of the take across camera flips (BLOCKERS B-1 step 1).

## Part 3. Other decisions that clarify the spec but were never written into it

`docs/DECISIONS.md` rows that say "Clarifies SPEC.md Section N" or that change spec behaviour, with the spec text
they touch. Nothing below is in the master or in the local `SPEC.md`. For each: the anchor to find, the decision
(quoted from DECISIONS where the decision gives exact words), and proposed insertion text. **All proposed wording
is a draft for Nemat; none is a new rule**: it restates the recorded decision. Rows 12 and 14 Oct about
upload limits and video retention are listed separately in 3.2 because they add new limits.

### 3.1 Clarifications

| # | Section and anchor | Decision (date, DECISIONS row) | Proposed text |
| --- | --- | --- | --- |
| 1 | 4 Navigation: Home feed / Discover tab row "busy prompts" | 8 Oct: "Busy right now" = prompts visible to the viewer, ranked by response count in the last 48 hours, then newest. | Add under Discover: "**Busy right now:** prompts the person can see, ranked by responses in the last 48 hours, then newest." |
| 2 | 4 Navigation: Discover "topic chips" | 8 Oct: chips use the team-managed prompt topics and filter the browse / Busy section; tonight's featured prompt stays featured whatever chip is chosen; "For you" means no topic filter. | Add: "Topic chips filter the browse and busy lists. Tonight's featured prompt stays featured under any chip. For you means no topic filter." |
| 3 | 6 Response model: Recording controls | 6 Oct | Part 2 above. |
| 4 | 7 Video reply model: "x of N" and the grid | 7 Oct: reply room order is oldest first; "x of N" counts in that order. | Add to Presentation: "The room lists video replies oldest first; "x of N" counts in that order." |
| 5 | 8 Comments: "You can delete your own comments." | 7 Oct: deleting your own top-level comment never removes or hides other people's replies; the parent becomes a deleted-parent (tombstone) row and the replies stay under it; no undo after confirmation. Board `LV-CommentDeleted`. | Add: "Deleting your own comment never removes other people's replies to it: the comment shows as deleted and the replies stay under it." |
| 6 | 12 Prompt suggestion: "Declining needs a reason from a fixed list" | 8 Oct: the plain-English decline-reason sentences (`decline_reason_text`) are accepted; the fixed categories stay locked. | Add: "Each reason is shown to the author as one neutral sentence (the approved decline-reason wording); the categories stay as listed." Exact sentences: `supabase/migrations`, function `decline_reason_text`. |
| 7 | 12 Prompt suggestion: first-response draft | 8 Oct: first-response drafts reuse the normal approved response recorder; `PR-Draft` stays the distinct draft review state. | Add: "A first-response draft is recorded with the normal response recorder." |
| 8 | 14 Closed beta invites: Members' invites | 9 Oct: an invite is reserved when a recipient signs in through the personal link or code. Until they create a profile, expiry or the inviter's cancellation releases the slot and they return to the beta access gate. Once they have created a profile, that invite cannot be cancelled. | Replace "Cancelling an unused invite returns it." with: "An invite is reserved once the recipient signs in through the link or code. Until they create a profile, expiry or the inviter cancelling releases it and they return to the beta access gate; after the profile exists the invite can no longer be cancelled." |
| 9 | 15 Notifications: "When to ask", point 2 | 7 Oct: after the first Not now, the arrival of the first reply or comment makes another ask due; N-Prime shows at the next safe foreground moment, not only when Activity is opened. | Replace "ask once more, only when their first reply or comment arrives" with: "ask once more when their first reply or comment arrives, at the next safe moment the app is in the foreground." |
| 10 | 15 Notifications: tonight's prompt | 7 Oct: tonight's prompt uses the phone's current IANA timezone, refreshed on launch and when the app returns to the foreground. | Add: ""About 18:30 local time" means the phone's current time zone, refreshed whenever the app opens or returns to the foreground." |
| 11 | 17 Moderation: enforcement ladder / moderator actions | 8 Oct: suspension is enforced server-side across every product API path; only the suspension notice, review request, account deletion and recovery, and sign-out remain. A standalone moderator "warn" action is unavailable: a warning is the removal notice (`A-Removed`). | In "Moderator tools", change the action list "remove content, warn, restrict until a date, suspend, restore..." to "remove content (which sends the removal notice, the warning), restrict until a date, suspend, restore..."; and add to the suspension step: "A suspended person can only see the suspension notice, request a review, delete or recover the account, and sign out." |
| 12 | 17 Moderation: Review requests, outcome sent as a notification | 8 Oct: outcome texts are fixed. | Add: "The outcome text is either "We reviewed your request. The decision stands." or "We reviewed your request and reversed the decision."" (exact, from DECISIONS). |
| 13 | 17 Moderation: Block copy / `SF-Block` | 8 Oct: gender-neutral copy: "They won't be able to see your responses, reply to you or follow you, and you won't see theirs. They won't be told." | If the spec quotes the block sheet, use this sentence; otherwise board-only. |
| 14 | 17 Moderation or 7/8 counts | 8 Oct: viewer-visible reply and comment counts, and counts and thumbnails on place pages, Discover and search, may exclude content hidden from that viewer by a block or a report. | Add: "Counts a person sees may leave out content hidden from them by a block or a report." |
| 15 | 19 Offline: the 9 Oct posting decision | 9 Oct: posting while already offline shows no Upload failed state; the recording stays and posts by itself when the connection returns while the app is open; if the app closes first the next launch shows Retry. | Already consistent with the local section 19 ("Post waits for the connection"); add if wanted: "If Post is tapped while offline, the recording waits and posts by itself when the connection returns, as long as the app stays open." |
| 16 | 21 Analytics: Beta metrics ("Proposed definitions") | 9 Oct: Response rate counts published primary responses (`video_published` with kind `response`, carrying `prompt_id`), not `record_completed`; Day-7 return counts only activity the person did in the app, never server-only events. | Change "(Proposed definitions)" to decided and edit: "**Response rate:** published primary responses to a prompt ÷ people who watched at least one response to it." and "**Day-7 return:** share of new members who do something in the app again 7 days after joining (server-only events do not count)." Also in `video_published` add property `prompt_id` for responses. |
| 17 | 21 Analytics: "Every event carries an anonymous user id" | 9 Oct: analytics stay first-party in Supabase (`analytics_events`); the account-linked identifier is pseudonymous, not anonymous. | Replace "an anonymous user id" with "a pseudonymous user id (a random id linked to the account only through the team-only accounts table)". |
| 18 | 22 Unresolved choices: Analytics row | 9 Oct: first-party events table; no PostHog or Amplitude. | Mark the row decided: "Our own events table in Supabase (decided 9 Oct)." |
| 19 | 22: Email row | 9 Oct: Resend (free plan) as Supabase Auth's SMTP sender for sign-in codes; the sending domain is not a domain of the provisional brand. | Mark decided: "Resend (decided 9 Oct, closed beta)." |
| 20 | 22: Search row | 8 Oct: substring search is sufficient for the closed beta. | Change "Postgres for the beta" to "Substring search in Postgres for the beta; no full-text ranking unless usage shows a problem." |
| 21 | 22: Video hosting and Camera library rows | 6 Oct: **provisional only** (Mux and expo-camera); Gate 1 is open. | **Do not mark decided.** Left open on purpose; listed so nobody pastes a decision that was not made. |
| 22 | 13 Auth: email | 9 Oct: six-digit codes, Confirm email on, 60 seconds between codes, one-hour expiry. | Add to `O-Email`: "The code expires after one hour; a new one can be sent every 60 seconds." |
| 23 | 22 / 23: moderation admin | 8 Oct: a small internal moderation web admin is required before the first outside tester (CLI stays for development). | Already stated in section 22 ("Admin needed before the first outside tester"); no edit. |

### 3.2 New limits and retention rules (decisions of 12 to 13 Oct)

These add rules the locked spec does not contain; they are the largest gap between the spec and the system as built.
Source rows are quoted from `docs/DECISIONS.md`; the cross-referenced detail is in `docs/BETA-READINESS.md` sections 14
and 15.

| # | Where they would go | Decision | Proposed text |
| --- | --- | --- | --- |
| 24 | 6 Response model, after "Video replies are not limited." (also 7) | 12 Oct: anti-abuse limits on newly minted upload URLs: at most 10 in any rolling hour, 30 in any rolling 24 hours, and 3 unused URLs at a time; not limits on how many videos a person has; publishing an existing draft costs no quota; suspended, restricted and deleted accounts get no upload URL; every upload is bound to its account and usable once. | "To prevent abuse, a person can start at most 10 uploads in an hour and 30 in 24 hours. This does not limit how many videos or replies they can have." |
| 25 | 19 Offline, `X-Upload-Failed` | 12 Oct (approved wording): "You've reached the limit of 10 uploads per hour. Try again later." / "You've reached the limit of 30 uploads in 24 hours. Try again later." / "Uploading isn't available right now. Try again later." Same banner, no new screen. | Add a bullet under `X-Upload-Failed` listing the three lines. |
| 26 | 18 Deletion: "Deleted content disappears everywhere at once" | 12 Oct, finalised: an author's deletion is immediate (the video is deleted at Mux); a video removed by moderation is kept privately, public playback off, until 30 days after its moderation case closes (a case closes at the removal when no review is requested; a review requested in time suspends clean-up until the decision); then deleted permanently, after which a restore or a reversing review decision is refused; during the 30-day account deletion window playback is disabled and signing back in restores it; an author's deletion is effective even when reports are open. | Add to 18: "A removed video is kept out of sight for up to 30 days after its moderation case closes, then deleted for good. After that it cannot be restored." |
| 27 | 18 Deleting an account; 17 Moderation records | 12 Oct: after a purge, minimal anonymised moderation records are kept for 90 days from the purge (no free-text reason, note, moderator name, account, target or reporter); anonymised tombstones of responses, video replies and comments are kept while other people's replies need them; successful clean-up job records are kept, minimal, for 30 days. | Add to 18: "After permanent deletion, a minimal anonymised record of any moderation action (what was done and when, with no names or text) is kept for 90 days. A deleted video or comment that other people's replies sit under stays as an empty "deleted" placeholder." |
| 28 | 18 Deleting an account | 12 Oct: an account removed outside the scheduled purge gets the same treatment as the purge. | Implementation rule, not user-visible; no spec text. |

### 3.3 Not spec text (listed so they are not mistaken for omissions)

7 Oct: `LV-CommentActions` ships in phase 5. 8 Oct: `S-Invites` belongs to phase 7. 9 Oct: the app icon waits for the brand;
the Expo template icon is development-only. 13 Oct: the remaining real-Mux test plan is accepted. These are scheduling
and process decisions.

## How to apply this package

1. Open the master. Do Part 1.2 first (replace section 19). That alone makes the master equal to the repository.
2. Decide Part 2 and Part 3: for each row Nemat accepts, paste the proposed text into the master, then paste the same
   text into `SPEC.md` (an agent can do the second step when asked) so the two stay equal.
3. Delete the "Local revision / Not yet in the online master" lines from the header of `SPEC.md`, update the revision
   label if one is assigned, and re-export the master over `SPEC.md` (CLAUDE.md: "If it changes, re-export it here").
4. Record the sync in `docs/DECISIONS.md` (date, who, which rows).
