# Phase 4 plan: conversation

Branch `phase-4-conversation`, from `phase-3-core-loop` at `da74627`. Phase 3 is **implemented, awaiting
device verification**; its open items stay tracked in `docs/BLOCKERS.md` and `docs/PHASE-3-REPORT.md`
section 8. Phases 3 and 4 overlap (SPEC.md Section 23).

## 1. Scope (SPEC.md Section 23, item 4)

> Conversation: video reply rooms and replies to replies, comments sheet, likes, Activity.
> Push notifications with the ask timing and settings.

Spec sections that define it: 7 (video reply model), 8 (comments), 15 (notifications), 16 (the
disclosure also gates the first video reply), 20 (Activity empty, original deleted), 21 (events).

## 2. Boards (design/BOARDS.md)

| Board | Built in this phase |
| --- | --- |
| `Replies` | Reply room sheet: "N video replies", root author and caption, grid, "Reply to [root author]" tile. |
| `Reply-Watch`, `Reply-Watch-2` | Watching a reply, flat room, "x of N", the card of what it replies to, "[Root]'s response" and "Reply to [author]". |
| `Record-Reply`, `PR-Reply` | Recording a reply with the context card; review says "Post reply". |
| `A-Orphan` | A reply whose root response was deleted. Drawn; it can only be reached once deletion exists (phase 5), so it is covered by the data model and a pgTAP case, not by a screen flow. |
| `Comments` | Sheet over the playing response; reply-room card; one-level threads; Author tag; hearts without counts; input bar with the black Video button. |
| `LV-CommentOwn` | Long-press on your own comment: Delete comment. |
| `LV-CommentActions` | Long-press on someone else's comment: Report comment, Block. **Both actions are phase 5.** The sheet is not drawn until then, so no control pretends. Flagged in section 6. |
| `Activity`, `X-Activity-Empty` | Activity tab, New and This week, likes as one line, Follow back, Respond. |
| `N-Prime`, `N-Settings` | The ask after the first public video, again on the first reply or comment after Not now; the settings screen reachable from Settings (the `S-Settings` screen itself is phase 5, so a minimal dev entry opens `N-Settings` until then). |

Rail buttons on the player that these boards activate: Like, Comments, Video replies, "Reply to …".
Share and More stay drawn and inactive until phase 5, as in phase 3.

## 3. Backend

One migration, `20261007000100_conversation.sql`:

- `responses.kind` (`response` | `reply`), `root_response_id`, `reply_to_id`, `prompt_id` copied
  from the root. The table holds every public video; the one-per-prompt rule applies to kind
  `response` only. Feeds and profile Responses filter on kind; the Mux upload, status, retry,
  abandon and go-live paths are unchanged because they key on the upload id.
- `comments`: response only, one level (`parent_id` must point at a top-level comment), 300
  characters, soft delete by the author.
- `likes`: `(user_id, target_kind, target_id)`; target is a video or a comment. Counts on videos;
  `liked` only on comments.
- `activity`: one row per event for a recipient (`video_reply`, `comment`, `comment_reply`,
  `follow`, `like`, `followed_responded`), written by triggers, never by the client. `read_at`
  marks New vs This week. Likes on one video collapse into one row per recipient and video.
- `notification_prefs` (one row per account, defaults from Section 15), `push_tokens`,
  `accounts.notification_ask` (`never` | `declined_once` | `declined_twice` | `accepted`),
  `accounts.timezone` for tonight's prompt.
- `push_outbox`: a trigger on `activity` queues a delivery when the recipient's prefs allow it;
  comments on one response are held for 10 minutes and merged into one notification. A pg_cron job
  calls the `send-push` Edge Function every minute through pg_net; tonight's prompt is queued by a
  second job at about 18:30 in each account's timezone.
- Functions: `reply_room`, `get_video` (response or reply, with its context card), `post_reply`,
  `comments_list`, `post_comment`, `delete_comment`, `like_video`, `unlike_video`, `like_comment`,
  `unlike_comment`, `activity_list`, `mark_activity_read`, `get_notification_prefs`,
  `update_notification_prefs`, `register_push_token`, `set_notification_ask`, `set_timezone`.
  Same rules as before: `security definer`, empty search path, acting user from `auth.uid()`,
  explicit grants.

Edge Function `send-push`: reads due outbox rows, sends through Expo's push service, records the
result. Expo push tokens need an EAS project id and, for real devices, APNs and FCM credentials:
tracked as a blocker; the outbox and the client ask flow are verifiable without them.

## 4. App

- `expo-notifications` is added (needed for the permission ask, the token and tapping a
  notification). No other new dependency.
- Video layer: `Recording` gains the reply context; `posting.tsx` posts a reply through
  `post_reply` and otherwise reuses the upload path. PR-Reply is the review screen with the context
  card and "Post reply".
- Screens: `replies/[responseId]` (sheet), `reply/[id]` (reply player), `record/reply/[videoId]`,
  `comments/[responseId]` (sheet with the input bar and the thread), Activity tab, `N-Prime`
  sheet, `notifications` settings screen.
- Like on the player rail; counts on the rail come from the server now.

## 5. Checks

pgTAP for: one level of comments, 300 characters, author tag data, delete own comment only,
like once, counts, reply room order and "x of N", reply to a reply carries the root, orphan data,
activity rows per event, likes collapsing, prefs defaults and Pause all, outbox respecting prefs
and the 10-minute comment grouping, ask state transitions. Jest for the pure pieces (activity
grouping labels, ask timing, comment limits). Typecheck, lint, iOS simulator with the seed.

## 6. Open questions for Nemat (not decided here)

1. **Reply room order.** The spec gives "x of N" but no order. The build uses oldest first
   (the conversation reads top to bottom). Newest first would also be defensible.
2. **Deleting a top-level comment that has replies.** No board shows a deleted-comment
   placeholder. The build hides the whole thread. The alternative is keeping the replies with a
   placeholder, which needs a design.
3. **Tonight's prompt timezone.** "About 18:30 local time" needs the person's timezone; the build
   records the phone's timezone on launch. Confirm that is the intended reading.
4. **`LV-CommentActions`** (Report, Block) is deferred to phase 5 with the rest of safety, so the
   long-press on someone else's comment does nothing in phase 4. Confirm.
