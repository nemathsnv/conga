# Phase 5 report: safety and web

Branch `phase-5-safety` (from `phase-4-conversation` at `04ebf9a`). Status: **implemented, awaiting
device verification**. Gate 5 ("safety complete; required before any outside tester") is not
claimed: it is Nemat's decision, and the open items in section 6 and `docs/BLOCKERS.md` B-3 stand
between the build and that decision. Phases 2 to 4 are also still awaiting device verification.

## 1. Scope (SPEC.md Section 23, item 5)

Report, block, delete, account deletion, enforcement notices, review requests, moderator tools; the
web player for shared links and the sign-in sheet. Nothing was shortened for beta speed.

## 2. What was built

- **Report** (`SF-Menu` → `SF-Report` → `SF-Reported`, also from the … menu on a profile and a
  long-press on a comment, `LV-CommentActions`): nine reasons, anonymous, "won't know who reported
  it", Block offered afterwards. What you reported never shows for you again (feeds, player, rooms,
  comments).
- **Block** (`SF-Block`, `LV-Blocked` from Settings): silent, both directions hidden everywhere
  (profiles, videos, replies, comments, follow lists, suggestions, Activity, pushes), follows removed
  both ways, interactions with a hidden person refused by the server, Unblock in Settings.
- **Delete** (`SF-Delete` from … on your own response or reply): comments go with a response,
  replies stay on their authors' profiles and show "Original response deleted" (`A-Orphan`). No undo.
- **Delete account** (`S-Settings` → `SF-DeleteAccount`): what happens, confirm with the same sign-in
  method (Apple and Google natively, email with a code), then a 30-day soft delete that hides
  everything and keeps the username; signing back in restores; a daily job purges after day 30.
- **Enforcement ladder** (Section 17): moderator functions remove a video or comment, warn, restrict
  until a date, suspend, restore, decide a review; every action logged with who, when, reason and
  note. People see `A-Removed` and `A-Restricted` (from Activity rows and when posting is refused),
  `LV-Suspended` / `LV-ReviewRequested` at sign-in; posting is refused while restricted or
  suspended; "Request a review" once per decision; the outcome arrives as a notification; a reversed
  review restores the video or the account.
- **Settings** (`S-Settings`): the gear on Me; Name, Username (Edit profile), Email, Notifications,
  Blocked accounts, Sign out (with `LV-SignOut` when an unposted recording is on the phone), Delete
  account. Rows without a destination yet are drawn and inactive (section 6).
- **Web** (`SF-Web`, `SF-Web-Signin`, `LV-WebUnavailable`, `LV-WebEmpty`): the `web` Edge Function
  renders shared links server-side with HLS playback, link previews, `noindex`, the sign-in sheet
  for every interaction, "N more responses", and `/i/{code}` for invite links. Share icons and
  Copy link in the app use these links.
- **Moderator tools**: `scripts/moderate.sh` over the `mod_*` functions (queues for reports and
  review requests, every action, the per-account log).

## 3. Migration

`20261008000100_safety.sql`: blocks, reports, moderation_actions, review_requests;
accounts.moderation_status / restricted_until / deleted_at; responses.removed_action_id;
comments.removed_action_id; Activity and push kinds for notices; `can_see`, `reported_by`,
`video_visible`, `assert_can_post`, `assert_can_see`; every read function re-created with visibility;
report_item, block_user, unblock_user, blocked_list, delete_video, delete_account (fresh sign-in
required), get_onboarding_state (restore on sign-in, suspended and restriction state),
purge_deleted_accounts (+ cron), get_notice, request_review, mod_* (service role), web_video,
web_prompt (anon); explicit grants.

## 4. Boards

Built: `SF-Menu`, `SF-Report`, `SF-Reported`, `SF-Block`, `SF-Delete`, `SF-DeleteAccount`,
`LV-CommentActions`, `S-Settings`, `LV-Blocked`, `LV-SignOut`, `A-Removed`, `A-Restricted`,
`LV-Suspended`, `LV-ReviewRequested`, `SF-Web`, `SF-Web-Signin`, `LV-WebUnavailable`, `LV-WebEmpty`.
Not built: `S-Invites` (members' invites, SPEC.md Section 14; the Settings row is drawn and
inactive; it is not in the phase 5 list and belongs with the closed-beta work, section 6).

## 5. Checks

| Check | Result |
| --- | --- |
| pgTAP (`supabase test db`) | 260/260 (onboarding 50, core loop 31, conversation 99, safety 80) |
| `npm run typecheck`, `npm run lint` | clean |
| Jest | 46/46 |
| Web function in the browser pane (local stack) | `SF-Web` with HLS playback and counts, `LV-WebEmpty`, `LV-WebUnavailable`, the sign-in sheet |
| iOS simulator build (iPhone 17) | runs with the seed; flows below |

**Seen on the simulator** (iPhone 17, local stack, as the seeded person Adam): `SF-Menu` from the
rail Share icon; `SF-Report` with the nine reasons; `SF-Reported` with the Block offer, and the report
in the queue (`scripts/moderate.sh reports`); `SF-Block`, after which Home reloaded without Maya and
the follows were gone both ways; `SF-Delete` from … on his own response (cancelled); `S-Settings`;
`LV-Blocked` with Unblock (the block row gone server-side); `SF-DeleteAccount` (cancelled before the
re-sign-in); a removal and a restriction made with `scripts/moderate.sh` arriving as Activity rows;
`A-Removed` with the blurred item, the reason and Request a review, then the "Review requested"
block and the request in `scripts/moderate.sh reviews`; `A-Restricted` with "See what was removed";
`LV-Suspended` at launch after `scripts/moderate.sh suspend`, `LV-ReviewRequested` after Request a
review, and `scripts/moderate.sh decide … reversed` restoring the account with a review_outcome row.

Found and fixed on the way: the client's onboarding-state parser dropped the new `suspended`,
`suspension` and `restriction` fields, so the suspended screen never showed; the Home feed now
reloads after a block, report or delete.

**Not verified**: a real report, block or delete end to end on a phone; re-authentication with
Apple or Google (needs the paid team and Google credentials); account deletion with the email code
on a device; enforcement notices arriving by push (B-2); link previews in a messaging app and
opening the app from a link (B-3); Android.

## 6. Deviations, open questions and blockers for Nemat

1. **`SF-Block` copy is gendered** on the board ("He won't be able to see…", written for Adam).
   Profiles carry no pronouns, so the sheet says "They won't be able to see your responses, reply to
   you or follow you, and you won't see theirs. They won't be told." Confirm or give the wording.
2. **Community guidelines, Help and feedback**: the Settings rows and "Read the Community
   Guidelines" on `A-Removed` have no document or address yet (SPEC.md Section 24). Drawn, inactive.
3. **Places** (phase 6) and **Invite people** (`S-Invites`, closed-beta work) rows in Settings are
   drawn and inactive. Say which phase `S-Invites` belongs to.
4. **Moderator tools** are SQL functions and a CLI for the team, fully logged. A small internal web
   admin (SPEC.md Section 22) is separate work; say if it must exist before the first outside tester.
5. **Web domain and app links**: `docs/BLOCKERS.md` B-3. Links work on the Supabase function URL.
6. **Review outcome text** is not in the spec: the push says "We reviewed it again. The decision
   stands." or "We reviewed it again and reversed the decision." The Activity row says "We reviewed
   your request again" and opens the notice. Confirm the wording.
7. **A standalone warning** (moderator action `warn`) is logged but shows no notice: the spec's
   warning is the removal notice itself ("Please treat this as a warning").
8. **Counts** on a video are what the viewer can open: someone you blocked is not counted in your
   view of "N video replies" or "N comments"; prompt response counts stay public.
9. **Suspended accounts** are stopped at sign-in and at every posting function; reading functions
   are not individually blocked (the app never shows them a feed).
10. **`expo-clipboard`** was added for Copy link.
