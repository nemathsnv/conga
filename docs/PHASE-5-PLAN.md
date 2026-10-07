# Phase 5 plan: safety and web

Branch `phase-5-safety`, from `phase-4-conversation` at `04ebf9a`. Phases 2 to 4 are implemented and
awaiting device verification; nothing here closes a gate. Gate 5 ("safety complete; required before
any outside tester") is Nemat's decision after this phase is verified.

## 1. Scope (SPEC.md Section 23, item 5)

> Safety and web: report, block, delete, account deletion, enforcement notices, review requests,
> moderator tools. Web player for shared links and the sign-in sheet.

Spec sections: 3 (Safety and Web rows, lightweight variants 6–11), 4 (share sheet, … menu, links),
16 (web player), 17 (moderation), 18 (deletion and recovery), 20 (states), 21 (events).
Nothing is shortened for beta speed: every item above is in this phase.

## 2. Boards

| Board | Where it opens |
| --- | --- |
| `SF-Menu` | Share icon on any response or reply; … menu on someone's profile. Copy link, Share to…, Report, Block. |
| `SF-Report`, `SF-Reported` | From the share sheet, the profile menu, or a long-press on a comment (`LV-CommentActions`). Nine reasons, "won't know who reported it", Block offered afterwards. |
| `SF-Block` | From the share sheet, `SF-Reported`, the profile menu, `LV-CommentActions`. |
| `LV-CommentActions` | Long-press on someone else's comment: Report comment, Block. |
| `SF-Delete` | … on your own video → Delete. Comments go with it; replies stay on their authors' profiles (`A-Orphan`). |
| `S-Settings` | Gear on Me. Name and Username rows open Edit profile; Email is shown; Places is phase 6 (drawn, inactive); Notifications → `N-Settings`; Invite people → `S-Invites` (beta, built here since the row exists); Blocked accounts → `LV-Blocked`; Community guidelines and Help and feedback need Nemat's documents and address (section 6); Sign out (+ `LV-SignOut` when an unposted recording is on the phone); Delete account → `SF-DeleteAccount`. |
| `LV-Blocked` | Unblock. |
| `SF-DeleteAccount` | Confirm with the same sign-in method first, then soft delete for 30 days; signing back in restores. |
| `A-Removed`, `A-Restricted` | Enforcement notices, from Activity rows and when posting is refused; Request a review. |
| `LV-Suspended`, `LV-ReviewRequested` | At sign-in for a suspended account. One review per decision. |
| `SF-Web`, `SF-Web-Signin`, `LV-WebUnavailable`, `LV-WebEmpty` | The web player at `/r/{id}` and `/p/{id}`, served by an Edge Function (section 4). |

## 3. Backend (migration `20261008000100_safety.sql`)

- **blocks** (both directions hidden; follows removed both ways; notifications stop). A helper
  `hidden_between(viewer, other)` is applied in every read path: feeds, player order, rooms, comments,
  profiles, follow lists, suggestions, Activity, the push outbox.
- **reports** (anonymous; target video, comment or profile; nine reasons). What you reported is
  excluded from your feeds and rooms from then on.
- **Deletion**: `delete_video` (own response or reply; status `deleted`, comments go with a response,
  replies stay); `delete_account` (requires a sign-in no older than ten minutes; `accounts.deleted_at`;
  everything hidden; username reserved); signing in within 30 days restores; a daily job purges
  accounts past day 30 (the auth user row, which cascades).
- **Moderation**: `moderation_actions` (who, when, why; remove, warn, restrict until, suspend, restore,
  remove attribution), `accounts.moderation_status` / `restricted_until`, `responses.removed_*`,
  `comments.removed_*`; posting refused while restricted or suspended (`posting_paused`); a suspended
  account's onboarding state says so. Notices arrive as Activity rows and pushes ("We removed one of
  your responses"); `get_notice` backs `A-Removed` / `A-Restricted`; `request_review` (one per
  decision); the outcome is a notification. Moderator queues and actions are service-role functions
  (`mod_*`), driven by `scripts/moderate.sh` for the beta team (section 6 on a web admin).
- **Web**: `web_video(id)` and `web_prompt(id)` callable by anon: public cards only.
- pgTAP for every rule above.

## 4. App and web

- App: share sheet, report flow, block flow and Blocked accounts, delete flows, Settings, Delete
  account with re-authentication, notices, suspended screen, review requests, the Activity rows for
  notices, `LV-CommentActions`, `S-Invites`. Rail Share and More become active.
- Web: Edge Function `web` renders the four web boards server-side with HLS playback (hls.js from a
  CDN on browsers without native HLS), link previews (Open Graph), `noindex` during the beta, the
  sign-in sheet for every interaction, and `/i/{code}` for invite links. Domain and app links are a
  blocker (section 6); the function works on the Supabase URL meanwhile.

## 5. Checks

pgTAP, Jest for pure pieces, typecheck, lint, iOS simulator for each flow with the seed, the web
function locally in the browser pane.

## 6. Open questions and blockers for Nemat

1. **`SF-Block` copy is gendered** ("He won't be able to see…", written for Adam). Profiles carry no
   pronouns, so the build uses "they/their" in the same sentences. Confirm or give the wording.
2. **Community guidelines, privacy, terms**: the Settings row and "Read the Community Guidelines" on
   `A-Removed` need a document and a URL. Not written yet (SPEC.md Section 24).
3. **Help and feedback**: the row needs a destination (an email address or a form).
4. **Moderator tools**: the beta build gives the team SQL functions and a CLI with full logging. A
   small internal web admin (SPEC.md Section 22) is a separate piece of work; say if it must exist
   before the first outside tester.
5. **Web domain**: `shortcut.app` (or the chosen domain), DNS to the Edge Function, and universal /
   app links. Until then links use the Supabase function URL.
