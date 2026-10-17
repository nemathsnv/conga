# Design boards: A1 Native (final, approved 5 Oct 2026)

86 approved boards from the Claude Design canvas (version 26): https://claude.ai/artifact/AUxUiU1muSm6Z61SP2wCUP

Plus 14 failed-post boards (`P1` to `P9`, with their video reply versions), approved as drawn by Nemat on 16 Oct 2026 and drawn after the canvas: 100 boards in all. They are in the section "Failed posts" below. Their history (the proposal page, review package and screenshots) is in `proposals/`.

- `boards/<ID>.jpg` is a 2x render of each board (390x844 pt iPhone frame).
- `html/<ID>.html` is the static board markup. Open it in a browser and use it for exact colours, sizes, spacing and copy. It is a design reference, not app code. Rebuild in React Native and do not port the HTML.
- Board IDs match the screen IDs in `SPEC.md`. Where a canvas note below disagrees with SPEC.md, **SPEC.md wins**.
- People and photos in the boards are placeholders.
- Product name: the boards were drawn as "Shortcut". Since 17 Oct 2026 the product is **Conga** (`docs/DECISIONS.md`): the name is replaced in `html/<ID>.html` and in the notes below, which stay the copy source word for word. The `boards/<ID>.jpg` renders are unchanged images and still show "Shortcut"; read the name from the HTML.

## A1 Native — prompt, video responses, conversation. Press Play and tap through.

| Board | Title | Image | Markup |
|---|---|---|---|
| `Main` | A1 · Home feed | [jpg](boards/Main.jpg) | [html](html/Main.html) |
| `R-Discover` | A1 · Discover | [jpg](boards/R-Discover.jpg) | [html](html/R-Discover.html) |
| `R-Player-2` | A1 · Response player · 2 of 23 | [jpg](boards/R-Player-2.jpg) | [html](html/R-Player-2.html) |
| `R-Player-3` | A1 · Response player · swiped up, 3 of 23 | [jpg](boards/R-Player-3.jpg) | [html](html/R-Player-3.html) |
| `R-Player-End` | A1 · Response player · end of responses | [jpg](boards/R-Player-End.jpg) | [html](html/R-Player-End.html) |
| `R-Profile` | A1 · Profile | [jpg](boards/R-Profile.jpg) | [html](html/R-Profile.html) |
| `R-Record` | A1 · Recording a response | [jpg](boards/R-Record.jpg) | [html](html/R-Record.html) |

> **Canvas note:** One model only: a prompt (question, statement, instruction, challenge, anything) and the video responses to it. No polls, no votes, no sides, and responses are never classified. Swipe up = next response; the face strip jumps directly; the ring and playback bar move with you; "2 of 23" stays top-right. At the end: "You've seen all 23 responses", Add your response, Watch again, then the next conversation.

## A1 — Conversation: comments, video replies, activity

| Board | Title | Image | Markup |
|---|---|---|---|
| `Comments` | A1 · Comments over a playing response (no counts on comments) | [jpg](boards/Comments.jpg) | [html](html/Comments.html) |
| `Replies` | A1 · Video replies to one response | [jpg](boards/Replies.jpg) | [html](html/Replies.html) |
| `Reply-Watch` | A1 · Watching a video reply (Sofia → Adam) | [jpg](boards/Reply-Watch.jpg) | [html](html/Reply-Watch.html) |
| `Reply-Watch-2` | A1 · Reply to a reply (Theo → Sofia), flat in Adam's room | [jpg](boards/Reply-Watch-2.jpg) | [html](html/Reply-Watch-2.html) |
| `Record-Reply` | A1 · Recording a reply to Sofia | [jpg](boards/Record-Reply.jpg) | [html](html/Record-Reply.html) |
| `Activity` | A1 · Activity | [jpg](boards/Activity.jpg) | [html](html/Activity.html) |

> **Canvas note:** Hierarchy: video responses are the conversation; video replies extend it face to face; text comments are lightweight and secondary. Comments open as a sheet while the response keeps playing; the input bar always offers Video next to text. Any video reply can be replied to, but the room stays flat: every reply lives in the root response's grid, and a reply to a reply carries one line of context ("Replying to Sofia") plus the root ("In replies to Adam Novak"). No nested trees. Video replies have likes and further video replies, no comment section. Text comments show no like counts. Activity: no streaks or milestones; likes aggregated into one quiet line.

## A1 — Getting in and starting conversations: sign in, invite gate, minimal onboarding, empty prompt

| Board | Title | Image | Markup |
|---|---|---|---|
| `O-Welcome` | A1 · Welcome and sign in (iOS: Apple, Google, email) | [jpg](boards/O-Welcome.jpg) | [html](html/O-Welcome.html) |
| `O-Welcome-Android` | A1 · Welcome and sign in (Android: Google, Apple, email) | [jpg](boards/O-Welcome-Android.jpg) | [html](html/O-Welcome-Android.html) |
| `O-Email` | A1 · Sign in with email code | [jpg](boards/O-Email.jpg) | [html](html/O-Email.html) |
| `O-Invite` | A1 · Invite gate — closed beta only, removable | [jpg](boards/O-Invite.jpg) | [html](html/O-Invite.html) |
| `O-Profile` | A1 · Onboarding · name and username | [jpg](boards/O-Profile.jpg) | [html](html/O-Profile.html) |
| `O-Photo` | A1 · Onboarding · optional photo | [jpg](boards/O-Photo.jpg) | [html](html/O-Photo.html) |
| `Z-Empty` | A1 · City prompt with no responses yet (location is the prompt's, not the person's) | [jpg](boards/Z-Empty.jpg) | [html](html/Z-Empty.html) |
| `Z-First` | A1 · After posting the first response | [jpg](boards/Z-First.jpg) | [html](html/Z-First.html) |

> **Canvas note:** Global product; Canggu is only the first seeding market. Sign in: Apple, Google, or email code (no phone verification unless we decide we need it). Button order follows the platform: iOS Apple, Google, email; Android Google, Apple, email. The same order applies wherever sign-in buttons appear (shared links, account-linking). Closed beta adds one invite step. Then name + username, optional photo, Home. No location step and nothing location-based under anyone's name. Location belongs to prompts and feeds: a prompt can be global, country, city or community scoped. Global prompts carry no badge; scoped prompts get a quiet pin label ("Canggu"). People choose and follow places; no device location required (nearby suggestions may come later).

## A1 — Places and notifications

| Board | Title | Image | Markup |
|---|---|---|---|
| `P-Places` | A1 · Places you follow (Settings → Places) | [jpg](boards/P-Places.jpg) | [html](html/P-Places.html) |
| `P-Unfollow` | A1 · Unfollowing a place | [jpg](boards/P-Unfollow.jpg) | [html](html/P-Unfollow.html) |
| `P-Place` | A1 · A place page (tap a pin label) | [jpg](boards/P-Place.jpg) | [html](html/P-Place.html) |
| `S-Settings` | A1 · Settings | [jpg](boards/S-Settings.jpg) | [html](html/S-Settings.html) |
| `N-Prime` | A1 · Notification ask, after the first response | [jpg](boards/N-Prime.jpg) | [html](html/N-Prime.html) |
| `N-Settings` | A1 · Notification settings | [jpg](boards/N-Settings.jpg) | [html](html/N-Settings.html) |

> **Canvas note:** Places are a private feed preference, never shown on a profile. A Canggu beta invite follows Canggu automatically (the invite screen says so); unfollowing keeps global prompts and people you follow. Suggestions come from places you already follow, never from GPS. A place page opens from any pin label or from Settings → Places; the same system works for any city or cohort.
>
> Notifications: never asked on first launch. First ask comes right after someone posts their first response. After "Not now", ask once more only when their first reply arrives; after that, Settings only. On by default: video replies, comments, replies to your comments, new followers, tonight's prompt (once a day), new prompts in places you follow. Off by default: likes, every response from people you follow. If the system permission is off, Settings shows a banner linking to phone settings.

## A1 — Invites, waitlist and sign-in edge cases

| Board | Title | Image | Markup |
|---|---|---|---|
| `W-Link` | A1 · Opening an invite link | [jpg](boards/W-Link.jpg) | [html](html/W-Link.html) |
| `W-Invalid` | A1 · Invite code already used | [jpg](boards/W-Invalid.jpg) | [html](html/W-Invalid.html) |
| `W-Waitlist` | A1 · On the waitlist | [jpg](boards/W-Waitlist.jpg) | [html](html/W-Waitlist.html) |
| `S-Invites` | A1 · Invite people (closed beta) | [jpg](boards/S-Invites.jpg) | [html](html/S-Invites.html) |
| `E-Code` | A1 · Email code did not work | [jpg](boards/E-Code.jpg) | [html](html/E-Code.html) |
| `E-Linked` | A1 · Email already uses Apple sign-in | [jpg](boards/E-Linked.jpg) | [html](html/E-Linked.html) |
| `E-Username` | A1 · Username taken | [jpg](boards/E-Username.jpg) | [html](html/E-Username.html) |

> **Canvas note:** An invite link skips the code step and says who invited you and what you'll start with. A code can be not found, expired or already used: same inline error, plus waitlist. Waitlist shows no queue number. Each member has 5 invites during the beta; an unused one can be cancelled and comes back. Sign-in edge cases: wrong or expired email code; an email already linked to Apple or Google (continue with that method); username taken, with suggestions. Apple's "Hide my email" addresses are treated like any other email.

## A1 — Loading, error and empty states

| Board | Title | Image | Markup |
|---|---|---|---|
| `X-Loading` | A1 · Home loading | [jpg](boards/X-Loading.jpg) | [html](html/X-Loading.html) |
| `X-Upload-Failed` | A1 · Response failed to post | [jpg](boards/X-Upload-Failed.jpg) | [html](html/X-Upload-Failed.html) |
| `X-Unavailable` | A1 · Response deleted or removed | [jpg](boards/X-Unavailable.jpg) | [html](html/X-Unavailable.html) |
| `X-Following-Empty` | A1 · Following feed, empty | [jpg](boards/X-Following-Empty.jpg) | [html](html/X-Following-Empty.html) |
| `X-Activity-Empty` | A1 · Activity, empty | [jpg](boards/X-Activity-Empty.jpg) | [html](html/X-Activity-Empty.html) |
| `X-Me-Empty` | A1 · Your profile, before your first response | [jpg](boards/X-Me-Empty.jpg) | [html](html/X-Me-Empty.html) |

> **Canvas note:** Loading shows the layout without fake content. A failed upload keeps the video on the phone with Discard and Retry side by side (P1); uploading uses the same banner with progress. A recording that can never post, or whose file is gone, offers Discard only (P2, P3); see "Failed posts". A deleted or removed response shows one neutral message, never the reason; a video that just failed to load offers Try again. Empty Following suggests people from prompts you watched; empty Activity and your own profile point to tonight's prompt.
>
> Not designed yet: offline banner, camera/microphone permission denied, reporting and moderation, suspended account.

## A1 — Suggesting prompts (reviewed before they go live)

| Board | Title | Image | Markup |
|---|---|---|---|
| `C-Plus` | A1 · The + button: respond, or suggest a prompt | [jpg](boards/C-Plus.jpg) | [html](html/C-Plus.html) |
| `C-Write` | A1 · 1 · Write the prompt | [jpg](boards/C-Write.jpg) | [html](html/C-Write.html) |
| `C-Scope` | A1 · 2 · Global or a place you follow | [jpg](boards/C-Scope.jpg) | [html](html/C-Scope.html) |
| `C-Preview` | A1 · 3 · Preview, with name on/off | [jpg](boards/C-Preview.jpg) | [html](html/C-Preview.html) |
| `C-Submitted` | A1 · 4 · Sent for review | [jpg](boards/C-Submitted.jpg) | [html](html/C-Submitted.html) |
| `C-Pending` | A1 · 5 · Your suggestions: in review, live, not published | [jpg](boards/C-Pending.jpg) | [html](html/C-Pending.html) |
| `C-Live` | A1 · 6 · Approved and live (no draft) | [jpg](boards/C-Live.jpg) | [html](html/C-Live.html) |
| `C-Draft` | A1 · 7 · Prompt live: publish your draft response? | [jpg](boards/C-Draft.jpg) | [html](html/C-Draft.html) |

> **Canvas note:** The + button is always about prompts. It opens one sheet: respond to an open prompt (tonight's global prompt first, then prompts from places you follow), or suggest a prompt. No free posting in v1: every video answers a prompt.
>
> Suggesting: write (up to 120 characters) → Global or a place you follow → preview → submit. Preview has "Show my name on this prompt" (on by default); moderators can also remove the name. A person reviews every suggestion; copy never promises a time ("We'll let you know when it's reviewed"). In review: edit or withdraw. Outcome: live, or not published with a reason that can be rewritten and resent.
>
> First-response draft: optional while in review, saved privately with the suggestion. Never auto-published. When the prompt goes live, the person is asked to publish it, re-record or delete the draft.

## A1 — Safety and ownership: report, block, delete, shared links

| Board | Title | Image | Markup |
|---|---|---|---|
| `SF-Menu` | A1 · Share sheet: Report and Block | [jpg](boards/SF-Menu.jpg) | [html](html/SF-Menu.html) |
| `SF-Report` | A1 · Report: reason | [jpg](boards/SF-Report.jpg) | [html](html/SF-Report.html) |
| `SF-Reported` | A1 · Report sent, block offered | [jpg](boards/SF-Reported.jpg) | [html](html/SF-Reported.html) |
| `SF-Block` | A1 · Block confirmation | [jpg](boards/SF-Block.jpg) | [html](html/SF-Block.html) |
| `SF-Delete` | A1 · Delete your own response | [jpg](boards/SF-Delete.jpg) | [html](html/SF-Delete.html) |
| `SF-DeleteAccount` | A1 · Delete account | [jpg](boards/SF-DeleteAccount.jpg) | [html](html/SF-DeleteAccount.html) |
| `SF-Web` | A1 · Shared link without an account | [jpg](boards/SF-Web.jpg) | [html](html/SF-Web.html) |
| `SF-Web-Signin` | A1 · Shared link: sign-in to interact | [jpg](boards/SF-Web-Signin.jpg) | [html](html/SF-Web-Signin.html) |

> **Canvas note:** Report and Block sit in the share sheet of any response (and the … menu on profiles), so the approved player is unchanged. Reports are anonymous; the reported response disappears for the reporter at once, and blocking is offered right after. Blocking is silent: neither person sees the other. Your own response: … → Delete; its comments go, other people's video replies stay on their profiles. Account deletion: confirm identity, 30 days to change your mind, suggested prompts stay without your name.
>
> Shared links open a web player. Watching a response and its conversation is open to anyone; responding, replying, liking and following route to the app. During the beta, a waitlist link is shown.

## A1 — Age, public visibility, permissions, offline and enforcement states

| Board | Title | Image | Markup |
|---|---|---|---|
| `A-Age` | A1 · 18+ confirmation, right after sign-in | [jpg](boards/A-Age.jpg) | [html](html/A-Age.html) |
| `A-Disclosure` | A1 · One-time disclosure before the first public video of any type | [jpg](boards/A-Disclosure.jpg) | [html](html/A-Disclosure.html) |
| `A-Orphan` | A1 · Video reply whose original response was deleted | [jpg](boards/A-Orphan.jpg) | [html](html/A-Orphan.html) |
| `A-Camera` | A1 · Camera access off | [jpg](boards/A-Camera.jpg) | [html](html/A-Camera.html) |
| `A-Mic` | A1 · Microphone access off | [jpg](boards/A-Mic.jpg) | [html](html/A-Mic.html) |
| `A-Offline` | A1 · Offline | [jpg](boards/A-Offline.jpg) | [html](html/A-Offline.html) |
| `A-Removed` | A1 · Your response was removed | [jpg](boards/A-Removed.jpg) | [html](html/A-Removed.html) |
| `A-Restricted` | A1 · Restricted account: posting paused | [jpg](boards/A-Restricted.jpg) | [html](html/A-Restricted.html) |

> **Canvas note:** The beta is 18+: one self-confirmation right after sign-in, before the invite step, so under-18s never use an invite. "May be under 18" stays a report reason.
>
> Before the first public video of any type (a response, a video reply, or a published draft), a one-time sheet says videos are public, can be shared, and can be watched on the web without an account. Shown once, not hidden in the Terms.
>
> If an original response is deleted, video replies to it stay on their creators' profiles, still tied to the prompt, with "Original response deleted" as context.
>
> Enforcement is manual in the beta: a first ordinary violation means removal plus a warning; a repeated similar one, a temporary posting pause; further or severe abuse, suspension. Severe cases can skip stages. Copy never promises automatic thresholds or review times, and never shows who reported. Review requests: "We'll review it again."
>
> Offline: recordings stay saved on the phone; the person posts again when back online. No background upload queue in v1. For a video reply the line reads "Your video reply stays saved on this phone. Post when you're back online." (16 Oct 2026).

## A1 — Post review: from recording to posted

| Board | Title | Image | Markup |
|---|---|---|---|
| `PR-Review` | A1 · Post review | [jpg](boards/PR-Review.jpg) | [html](html/PR-Review.html) |
| `PR-Caption` | A1 · Post review — caption | [jpg](boards/PR-Caption.jpg) | [html](html/PR-Caption.html) |
| `PR-Reply` | A1 · Post review — video reply | [jpg](boards/PR-Reply.jpg) | [html](html/PR-Reply.html) |
| `PR-Draft` | A1 · Post review — private draft | [jpg](boards/PR-Draft.jpg) | [html](html/PR-Draft.html) |
| `PR-Discard` | A1 · Discard recording | [jpg](boards/PR-Discard.jpg) | [html](html/PR-Discard.html) |
| `PR-Posting` | A1 · Posting in progress | [jpg](boards/PR-Posting.jpg) | [html](html/PR-Posting.html) |
| `PR-Short` | A1 · Under 2 seconds | [jpg](boards/PR-Short.jpg) | [html](html/PR-Short.html) |

> **Canvas note:** Order after recording: Review (play back, optional caption up to 150 characters, Discard, Re-record or Post) → first public video of any type only: the one-time "Your videos are public" sheet opens when Post is tapped (no hint on the review screen itself) → back to the feed, with a "Posting" banner. Uploads run in the foreground: the banner says to keep Conga open. On failure: the Upload failed state (recording kept on the phone; P1 to P3). After the first successful post only: the notification ask.
>
> Variants: the posting banner for a video reply says "Posting your video reply" (P8-R); a video reply shows who and what it answers and says "Post reply"; the first response to your own suggested prompt says "Only you" and "Save draft", and is never published automatically.
>
> Leaving review asks "Discard this recording?". Recordings under 2 seconds don't reach review: a toast says to keep going.

## A1 — Failed posts: Discard, camera entry and sign-out (approved 16 Oct 2026)

| Board | Title | Image | Markup |
|---|---|---|---|
| `P1` | A1 · Upload failed: Retry and Discard, side by side | [jpg](boards/P1.jpg) | [html](html/P1.html) |
| `P1-R` | A1 · Upload failed: a video reply | [jpg](boards/P1-R.jpg) | [html](html/P1-R.html) |
| `P2` | A1 · Upload failed: it can never post | [jpg](boards/P2.jpg) | [html](html/P2.html) |
| `P2-R` | A1 · Upload failed: a video reply that can never post | [jpg](boards/P2-R.jpg) | [html](html/P2-R.html) |
| `P3` | A1 · Upload failed: the file is gone | [jpg](boards/P3.jpg) | [html](html/P3.html) |
| `P3-R` | A1 · Upload failed: a video reply no longer on this phone | [jpg](boards/P3-R.jpg) | [html](html/P3-R.html) |
| `P4` | A1 · Discard confirmation (revised) | [jpg](boards/P4.jpg) | [html](html/P4.html) |
| `P5` | A1 · Discarding: not confirmed yet | [jpg](boards/P5.jpg) | [html](html/P5.html) |
| `P5-R` | A1 · Discarding a video reply: not confirmed yet | [jpg](boards/P5-R.jpg) | [html](html/P5-R.html) |
| `P6` | A1 · Discard: it already reached Conga | [jpg](boards/P6.jpg) | [html](html/P6.html) |
| `P7` | A1 · Camera entry: a recording waits (failed or offline) | [jpg](boards/P7.jpg) | [html](html/P7.html) |
| `P8` | A1 · Camera entry: a recording is still posting | [jpg](boards/P8.jpg) | [html](html/P8.html) |
| `P8-R` | A1 · PR-Posting: a video reply | [jpg](boards/P8-R.jpg) | [html](html/P8-R.html) |
| `P9` | A1 · Sign-out warning, every route (shown on LV-Suspended) | [jpg](boards/P9.jpg) | [html](html/P9.html) |

> **Canvas note:** Drawn after canvas version 26 and approved as drawn by Nemat on 16 Oct 2026 (the five decisions of 14 Oct and the final copy for P4, P6 and P9). Each is a state of an approved screen; the layouts are the existing banner, sheet and sign-out sheet. The `-R` boards are the same state for a video reply: only the title changes ("video reply" for "response"). Source: `proposals/failed-post-ux.html`, with the review page `proposals/FAILED-POST-REVIEW.md`.
>
> Upload failed (`X-Upload-Failed`): Discard sits beside Retry (P1). Both disappear while an attempt runs; Retry switches the banner to `PR-Posting`. A recording that can never post (already responded, prompt or video gone, removed, closed submission, conflicting request) says "This recording can't be posted." and offers Discard only (P2); one no longer on the phone says "This recording is no longer on this phone." (P3). A busy server, an upload limit and a lost connection stay P1.
>
> Discard asks first (P4): "Conga will try to stop it from posting. If it has already uploaded, it may still appear." The recording leaves the phone only once Conga confirms nothing of it will be processed. Not confirmed yet (offline, or Conga cannot verify): it stays on the phone as "Discarding your response" with no buttons, and Conga asks again by itself: when the app opens or comes back, when the connection returns, then after 30 seconds, 2 minutes and 10 minutes (P5). Already at Conga: "It may finish processing. If it appears on your profile, you can delete it there." (P6); it is never deleted automatically.
>
> One waiting recording at a time: while one is failed, waiting offline or posting, Respond, Reply and Record do not open the camera. "Your last recording hasn't posted yet" / "Retry or discard it first." (P7); "Your last recording is still posting" / "Keep Conga open until it's done." (P8).
>
> Sign out (P9): the revised `LV-SignOut` sheet, shown on every sign-out route while a recording waits. Sign out anyway stops the upload on this phone and never blocks signing out.

## A1 — Search results

| Board | Title | Image | Markup |
|---|---|---|---|
| `SR-Recent` | A1 · Search — recent | [jpg](boards/SR-Recent.jpg) | [html](html/SR-Recent.html) |
| `SR-Results` | A1 · Search — place match | [jpg](boards/SR-Results.jpg) | [html](html/SR-Results.html) |
| `SR-People` | A1 · Search — people match | [jpg](boards/SR-People.jpg) | [html](html/SR-People.html) |
| `SR-None` | A1 · Search — no results | [jpg](boards/SR-None.jpg) | [html](html/SR-None.html) |

> **Canvas note:** One list, three sections in a fixed order: Places, Prompts, People; empty sections are left out, with a one-line note when a type has no match. No tabs in v1.
>
> Recent searches stay on this phone only and can be cleared.
>
> Search can reach any place, including ones you don't follow. A place that isn't open yet shows as "Not open yet" with no follow button; the no-results state offers Suggest a prompt.
>
> Prompt matches show their place and response count; matching starts from the beginning of any word.

## A1 — Lightweight variants of approved screens (settings, profile, comments, web)

| Board | Title | Image | Markup |
|---|---|---|---|
| `LV-EditProfile` | A1 · Edit profile | [jpg](boards/LV-EditProfile.jpg) | [html](html/LV-EditProfile.html) |
| `LV-Followers` | A1 · Followers / Following | [jpg](boards/LV-Followers.jpg) | [html](html/LV-Followers.html) |
| `LV-MyProfile` | A1 · My profile (populated) | [jpg](boards/LV-MyProfile.jpg) | [html](html/LV-MyProfile.html) |
| `LV-Blocked` | A1 · Blocked accounts | [jpg](boards/LV-Blocked.jpg) | [html](html/LV-Blocked.html) |
| `LV-Suspended` | A1 · Permanent suspension | [jpg](boards/LV-Suspended.jpg) | [html](html/LV-Suspended.html) |
| `LV-ReviewRequested` | A1 · Review requested (after appeal) | [jpg](boards/LV-ReviewRequested.jpg) | [html](html/LV-ReviewRequested.html) |
| `LV-SignOut` | A1 · Sign-out warning | [jpg](boards/LV-SignOut.jpg) | [html](html/LV-SignOut.html) |
| `LV-CommentActions` | A1 · Comment actions — someone else's comment | [jpg](boards/LV-CommentActions.jpg) | [html](html/LV-CommentActions.html) |
| `LV-CommentOwn` | A1 · Comment actions — your own comment | [jpg](boards/LV-CommentOwn.jpg) | [html](html/LV-CommentOwn.html) |
| `LV-CommentDeleted` | A1 · Comments — deleted parent comment keeps its replies (added 7 Oct 2026 for Nemat's deletion rule; built from `Comments`, no new pattern; no render yet) | — | [html](html/LV-CommentDeleted.html) |
| `LV-WebUnavailable` | Web · Video unavailable | [jpg](boards/LV-WebUnavailable.jpg) | [html](html/LV-WebUnavailable.html) |
| `LV-WebEmpty` | Web · Prompt with no responses | [jpg](boards/LV-WebEmpty.jpg) | [html](html/LV-WebEmpty.html) |

> **Canvas note:** Each is built from an approved screen and adds no new pattern.
>
> Comment actions: someone else's comment shows Report comment and Block; your own shows Delete comment only, with "Deleting can't be undone" (the sheet is the confirmation; no undo). Response authors can't delete other people's comments.
>
> Deleted parent (7 Oct 2026, Nemat): deleting your own top-level comment never removes other people's replies. The row stays in its place as "Comment deleted" (grey, placeholder avatar, no name, no Reply, no heart) with the replies under it; a deleted comment with no replies disappears.
>
> Permanent suspension is shown at sign-in; one review request per decision; after it is sent, the button is replaced by "Review requested" and the outcome arrives as a notification. No review-time promise.
>
> Sign-out warning only appears when a recording that hasn't posted is saved on this phone. Revised 16 Oct 2026 (P9): its body is "You have 1 recording that hasn't posted. Signing out stops the upload on this phone, but it may still finish on Conga. An unresolved recording stays private on this device for your account.", and the same sheet appears on every sign-out route: Settings, the permanent-suspension screen, the end of Delete account and confirm email.
>
> Web: an unavailable video and a prompt with no responses both route to the app; no web profiles.

## Other canvas notes

> **Canvas note (next to `O-Invite`):** Closed beta only. This screen is a single removable step between sign-in and name + username. Removing it changes no other screen: sign-in goes straight to name + username. Invite links skip it during the beta.
