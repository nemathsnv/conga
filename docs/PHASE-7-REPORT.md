# Phase 7 report: beta readiness

Branch `phase-7-beta` (from `phase-6-places` at `b97e2b6`). Status: **implemented, awaiting
device verification**. No gate is claimed: Gate 5 stays open and Gate 7 ("the closed beta opens in
Canggu") is Nemat's decision, with the items in `docs/BLOCKERS.md` (B-1 to B-4 and the Gate 5
list) between the build and that decision. Phases 2 to 6 are still awaiting device verification.

## 1. Scope (SPEC.md Section 23, item 7)

Every empty, error, offline and permission state; analytics events; store builds; store age
ratings, privacy policy, terms and community guidelines in place. Plus `S-Invites` (Nemat, 8 Oct).
The plan is `docs/PHASE-7-PLAN.md`. Nothing outside Sections 3, 14, 19, 20, 21, 22 and 24 was
added.

## 2. What was built

- **`A-Offline`**: the banner over Home ("You're offline" / "Your response stays saved on this
  phone. Post when you're back online.") from `expo-network`, which was already a dependency.
  Loaded videos keep playing, recording works, Post waits. A post in flight or waiting for Retry
  keeps its own banner. `offline_shown` is recorded.
- **Every other Section 20 state** was already built in phases 2 to 6 (`X-Loading`,
  `X-Upload-Failed`, `X-Unavailable` with Try again, `A-Orphan`, `Z-Empty`, `Z-First`,
  `X-Following-Empty`, `X-Activity-Empty`, `X-Me-Empty`, `A-Camera`, `A-Mic`, `W-Invalid`,
  `E-Code`, `E-Linked`, `E-Username`, `SR-None`, `PR-Posting` and the Processing tile, `N-Prime`
  for phone notifications off, `LV-SignOut`, `LV-CommentActions`, `LV-CommentOwn`,
  `LV-WebUnavailable`, `LV-WebEmpty`). Section 3 of the plan lists them; nothing was changed.
- **Analytics (Section 21)** in our own table, no SDK (the Section 22 choice; see section 6):
  `analytics_events` keyed by a pseudonymous id on the account (random, never the account id; it is
  account-linked, so it is pseudonymous, not anonymous: Nemat, 9 Oct),
  with cohort, platform, app version, name, properties and client time; nobody but the team can
  read it (RLS, no table grants). The app queues events on the phone (`lib/analytics.ts`), sends
  batches of up to 200 through `track_events` every five seconds and on going to the background,
  keeps the queue on any failure, and sends events recorded before sign-in (`signup_started`)
  with the first flush after it. Every event in the Section 21 table is recorded at the moment
  the table names, with its properties; `suggestion_reviewed` and
  `account_deletion_cancelled` are written by the server (triggers), `web_link_opened` and
  `web_signin_sheet_shown` by the web function (a random id per request, no cookie).
  `scripts/metrics.sql` has the four beta metrics as proposed in Section 21.
- **Members' invites (`S-Invites`, Section 14)**: Settings → Invite people. A personal invite
  link per member (a readable code from the first name, e.g. `ADAM-WJM6`, shown in lower case),
  Copy and Share, "4 of 5 left", the cohort line; the Sent list with "Joined 2 days ago" and a
  Follow / Following pill, or "Link opened, not joined yet · Expires in 5 days" with Cancel
  ("Cancelling gives you the invite back."). Opening the link and signing in takes one of the
  member's invites for `invite_valid_days`; creating a profile makes it joined; an unfinished one
  expires back to the member; the personal code also works typed on `O-Invite`. Both limits come
  from `app_config` and change without an app update. Team-created codes with an inviter count
  against that inviter the same way.
- **Store builds**: `app/eas.json` (development, preview, production; build numbers kept on
  EAS), `buildNumber` / `versionCode`, and the EAS project id from `EAS_PROJECT_ID` when it
  exists. Everything else a store build needs is outside this repository: `docs/BLOCKERS.md` B-4.

## 3. Migration

`20261010000100_beta.sql`: `accounts.analytics_id`, `analytics_events`, `log_server_event`,
`track_events`, the `suggestion_reviewed` and `account_deletion_cancelled` triggers;
`accounts.invite_code`, `ensure_invite_code`, `invites_left`, `has_beta_access` (an invite holds
while it is not cancelled and either joined or not yet expired), `personal_invite_owner`,
`invite_lookup` and `redeem_invite` learn personal codes, `my_invites`, `cancel_invite`;
explicit grants.

## 4. Boards

Built: `A-Offline`, `S-Invites`. Every other board in the phase 7 scope already existed.

## 5. Checks

| Check | Result |
| --- | --- |
| pgTAP (`supabase test db`) | 371/371 (beta 37) |
| `npm run typecheck`, `npm run lint` | clean |
| Jest | 54/54 (the event queue: waits for sign-in, batches with platform and version, keeps the queue on refusal, merges a stored queue without doubling, carries no email, name or username) |
| iOS simulator build (iPhone 17) | runs with the seed; flows below |

**Seen on the simulator** (iPhone 17, local stack, as the seeded person Adam): Home and the
events `prompt_viewed` and `response_viewed` (with `watch_ms` and `completed`) landing in
`analytics_events` with the cohort and platform; `S-Invites` with "5 of 5 left", the link, Copy,
Share invite and the cohort line; after a newcomer redeemed Adam's personal code over the API,
"4 of 5 left" and "Link opened, not joined yet · Expires in 7 days"; Cancel returning the invite;
the joined state with the Follow pill after the newcomer's profile was created. The web function
served locally logged `web_link_opened` for a prompt page and `web_signin_sheet_shown` from the
sheet's beacon.

Found and fixed on the way: the event queue sent every event twice on the first flush of a launch
(the in-memory copy and the stored copy); it now merges the stored queue before anything is
written.

**Not verified**: `A-Offline` on the simulator (no way to cut its connection cleanly; the banner
is driven by `expo-network`'s state and its copy is the board's); the invite link opened on a
phone from a message (B-3); a real store build (B-4); the events' client timestamps across a
timezone change; Android.

## 6. Deviations and open questions for Nemat

1. **Analytics storage**: Section 22 leaves PostHog, Amplitude or our own table open and Section
   2 forbids tracking SDKs. The build uses our own table, so nothing leaves Supabase and no SDK is
   added. Confirm, or pick one of the others (the `track()` calls stay the same).
2. **The personal invite link model**: Section 14 describes one personal link per member, "4 of
   5 left", a sent list with "opened, not joined" rows and expiry, and Cancel. The build reads
   that as: opening the link and signing in takes one invite for 7 days; creating a profile makes
   it joined; an unfinished one expires back to the member; cancelling an opened-not-joined one
   sends that person back to the invite step. Confirm the last two consequences.
3. **"Opened" starts at sign-in**, not at the tap on the link: before sign-in nobody is known.
   A link opened and never signed in with shows nothing.
4. **The app icon** has no board, so the Expo template icon remains (B-4).
5. **Community guidelines, privacy policy, terms, Help and feedback**: still no documents or
   addresses (Section 24, Gate 5 items); the rows stay inactive.
6. **Posting while offline** keeps the existing behaviour: the upload fails and the Upload failed
   banner offers Retry. The spec's "Post waits for the connection" (Section 19) is read as that
   banner; nothing retries by itself.

## 7. Corrections of 9 Oct 2026 (Nemat)

Decisions recorded in `docs/DECISIONS.md`: first-party analytics stay (no PostHog or Amplitude);
the account-linked identifier is documented as pseudonymous (migration `20261010000200_beta_fixes.sql`
updates the comments; the column name stays); the member invite model as built is confirmed; the
app icon waits for the approved name and brand, and the Expo template icon never leaves development.

Fixed: **Post while already offline** no longer enters Upload failed. The post is kept on the
phone in a `waiting` state, Home shows `A-Offline`, and the upload starts by itself when the
connection returns while the app is open; if the app closes first, the next launch shows the
existing Retry state (no queue survives termination, SPEC.md Section 19). **Metrics**:
`video_published` now carries `prompt_id`; Response rate counts published primary responses
(`video_published`, kind `response`); Day-7 return counts only ios and android events, never
server-written ones. Checks after the corrections: pgTAP 371/371, Jest 54/54 (the waiting state's
resume rule is covered), typecheck and lint clean. The waiting state itself was not exercised on
the simulator (its connection cannot be cut cleanly). The consolidated open list is
`docs/BETA-READINESS.md`.
