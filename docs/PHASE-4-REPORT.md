# Phase 4 report: conversation

Branch `phase-4-conversation` (from `phase-3-core-loop` at `da74627`). Status: **implemented, awaiting
device verification**. No gate is claimed. Phase 3's open items stay tracked (`docs/BLOCKERS.md` B-1,
`docs/PHASE-3-REPORT.md` section 8) and Phase 3 is still awaiting its own device verification.

## 1. Scope (SPEC.md Section 23, item 4)

Video reply rooms and replies to replies, the comments sheet, likes, Activity, push notifications with
the ask timing and settings.

## 2. What was built

- **Video replies** (Sections 7, 16): a reply is a video in the responses table with `kind = 'reply'`,
  its root response and the video it replies to. One flat room per root; a reply to a reply carries
  "Replying to [name]" and "In replies to [root author]". The disclosure gates the first reply as it
  gates the first response. Same Mux path, same limits, same Retry.
- **Reply room** (`Replies`), **watching a reply** (`Reply-Watch`, `Reply-Watch-2`, `A-Orphan`),
  **recording a reply** (`Record-Reply`), **reviewing it** (`PR-Reply`, "Post reply"). "[Root]'s
  response" and "Reply to [author]" buttons, "x of N" within the room, "Next reply · name".
- **Comments** (`Comments`, `LV-CommentOwn`): sheet over the playing response (the player hides its
  chrome and keeps playing), reply-room card at the top, one-level threads with "View N replies", the
  Author tag, hearts without counts, "Add a comment" with the black Video button, 300 characters,
  long-press on your own comment to delete.
- **Likes** on responses and replies (rail counts are real now; the heart fills) and on comments (no
  counts anywhere).
- **Activity** (`Activity`, `X-Activity-Empty`): New and This week, video replies first and largest,
  comments on one response grouped ("Sofia and Putu commented on your response"), likes collapsed
  into one quiet line computed from the likes themselves, "people you follow responded" grouped per
  prompt, Follow back, the bell filled while anything is unread.
- **Notifications** (Section 15): `N-Prime` right after the first public video posts, once more when
  the first reply or comment arrives after Not now, then Settings only; `N-Settings` with Pause all and
  the spec's groups and defaults; the ask state lives on the account. Server-side outbox with the
  spec's texts, comments on one response held 10 minutes and sent as one, tonight's prompt at about
  18:30 in each account's timezone, pg_cron + pg_net draining through the `send-push` Edge Function
  (Expo push service). Tokens register once the permission is on.
- **Profiles**: the Replies tab and count are real.

## 3. Migrations

`20261007000100_conversation.sql`: responses.kind / root_response_id / reply_to_id; comments (with
thread_id); likes; activity (+ triggers on responses going live, comments, follows, likes);
notification_prefs; push_tokens; accounts.notification_ask and accounts.timezone; push_outbox (+
trigger by preference, grouping); pg_cron jobs `send-push` and `tonight-prompt`; functions listed in
`docs/PHASE-4-PLAN.md` section 3; explicit grants. Edge Function `send-push`
(`[functions.send-push] verify_jwt = false`, authenticated by `PUSH_SENDER_KEY`).

## 4. Boards

Built: `Comments`, `LV-CommentOwn`, `Replies`, `Reply-Watch`, `Reply-Watch-2`, `A-Orphan`,
`Record-Reply`, `PR-Reply`, `Activity`, `X-Activity-Empty`, `N-Prime`, `N-Settings`.
Not built: `LV-CommentActions` (Report, Block: phase 5; long-press on someone else's comment does
nothing). Share and More on the rails stay drawn and inactive until phase 5.

## 5. Checks

| Check | Result |
| --- | --- |
| pgTAP (`supabase test db`) | 171/171 (onboarding 50, core loop 31, conversation 90) |
| `npm run typecheck`, `npm run lint` | clean |
| Jest | 46/46 (activity labels, ask timing, phase 2–3 suites) |
| iOS simulator build (iPhone 17) | runs with the seed and a seeded dev session |

**Seen on the simulator** (as the seeded person Adam, with Mux assets from the spike): Home with the
filled bell; Activity with grouped comments, two video-reply cards and the likes line; New → This week
after reading; the reply player with "Replying to Sofia Marín", "In replies to Adam Novak", "3 of 3",
"Adam's response" and "Reply to Maya", auto-advance through the room; `Record-Reply` with the context
card (no camera on the simulator); the comments sheet over the still-playing response with the
reply-room card, the expanded thread and the Author tag; `LV-CommentOwn`; the `Replies` sheet
(root row, "Reply to Maya" tile) over the paused response; `N-Prime` (settings mode); `X-Unavailable`
(reached when the database was reset under the app).

**Not verified**: a real take and post of a video reply (needs a camera), `PR-Reply` on screen,
`N-Settings` on screen (needs the phone's permission; the simulator was never granted it), the ask
right after a first post, the Replies tab grid on a profile, a room grid with tiles (only the empty
room was drawn), push delivery (B-2), `A-Orphan` on screen (deletion is phase 5), Android, any real
phone.

## 6. Deviations and open questions for Nemat

1. **Reply room order**: oldest first. Not in the spec; "x of N" counts in that order.
2. **Deleting a top-level comment** hides its thread (no board for a placeholder). Replies by others
   are soft-deleted with it; nothing is lost in the database.
3. **Comment input while replying**: the placeholder reads "Reply to Putu" while a reply is being
   typed. The board has no state for this; the alternative was no indication at all.
4. **Single-commenter push text** uses the full name ("Lena Hart commented on your response"); the
   grouped text uses first names as the spec's example does.
5. **Second ask trigger**: N-Prime opens when the Activity tab loads with a reply or comment present
   (and the state is declined once). The spec says "when their first reply or comment arrives"; the
   push itself cannot open a sheet, so the tab is the moment.
6. **Tonight's prompt timezone**: the phone's zone, recorded on launch. Confirm.
7. **Record-Reply's sub line** can truncate on narrow phones ("… · up to 30 seco…"); same width as
   the board.
8. **Opening the camera from a sheet** replaces the sheet (a screen pushed over a transparent modal
   would present as a card). Back from the camera returns to the player, not the sheet.
9. **`expo-notifications`** was added (needed for the permission ask, token and tap handling).

## 7. Blockers

`docs/BLOCKERS.md` B-1 (mid-recording flip stitcher, phase 3) and B-2 (push credentials: EAS project
id, APNs key, FCM; Vault secrets per environment). Plus the phase 2–3 list: hosted deploy, paid Apple
team, Google credentials, Android device, Mux webhook on the hosted project.

## 8. Commits

`b1cb8ae` backend; see `git log phase-3-core-loop..phase-4-conversation` for the app and fixes.
