# Phase 7 plan: beta readiness

Branch `phase-7-beta`, from `phase-6-places` at `b97e2b6`. Phases 2 to 6 are implemented and
awaiting device verification; Gate 5 is open (`docs/BLOCKERS.md`). Nothing here closes a gate.
Gate 7 ("the closed beta opens in Canggu") is Nemat's decision.

## 1. Scope (SPEC.md Section 23, item 7)

> Beta readiness: every empty, error, offline and permission state; analytics events; store builds.
> Store age ratings, privacy policy, terms and community guidelines in place.

Plus `S-Invites` (members' invites, SPEC.md Section 14), placed in phase 7 by Nemat on 8 Oct.

Spec sections: 3 (screen inventory and the final design pass), 14 (invites and waitlist), 19
(offline and local drafts), 20 (empty, error and loading states), 21 (analytics events), 22
(analytics choice, links), 24 (still open: age ratings, privacy policy, terms, community
guidelines, data rules). No feature outside these sections is added.

## 2. What exists already

Every state in the Section 20 table is built except `A-Offline`: `X-Loading`, `X-Upload-Failed`,
`X-Unavailable` (with Try again), `A-Orphan`, `Z-Empty`, `Z-First`, `X-Following-Empty`,
`X-Activity-Empty`, `X-Me-Empty`, `A-Camera`, `A-Mic`, `W-Invalid`, `E-Code`, `E-Linked`,
`E-Username`, `SR-None`, `PR-Posting` and the Processing tile, `N-Prime` reused for phone
notifications off, `LV-SignOut`, `LV-CommentActions`, `LV-CommentOwn`, `LV-WebUnavailable`,
`LV-WebEmpty`. The invite gate, invite links (`W-Link`), the waitlist and team-created codes are
built (phase 2). No analytics exist. No EAS build configuration exists. The app icon is the Expo
template icon. `S-Invites` is a drawn, inactive Settings row.

## 3. Work

### 3a. States

- `A-Offline`: the banner over Home ("You're offline" / "Your response stays saved on this
  phone. Post when you're back online."), from `expo-network` (already a dependency); loaded
  videos keep playing; Post waits for the connection; `offline_shown` event.
- Walk every Section 20 state on the simulator and list what each one does; fix what differs
  from its board.

### 3b. Analytics (SPEC.md Section 21)

Section 22 leaves the choice open between PostHog, Amplitude and our own events table, and
Section 2 forbids tracking SDKs. The build uses **our own events table**: no SDK, no third party,
nothing leaves Supabase. Nemat confirms or picks another.

- `analytics_events` (anonymous user id, cohort, platform, app version, name, properties, client
  time, received time). The anonymous id is a random id on the account, never the account id;
  the table holds no email, name or username, and only the team can read it.
- `track_events(jsonb)` accepts a batch from a signed-in person; the app queues events on the
  phone and flushes every few seconds and on background. Events before sign-in (`signup_started`)
  are queued and sent with the first flush after sign-in.
- Every event in the Section 21 table, with its properties, at the moment the table names.
  `suggestion_reviewed` is written by the moderator functions server-side.
- A `scripts/metrics.sql` (or a view) for the four beta metrics as proposed in Section 21.

### 3c. Members' invites (`S-Invites`, SPEC.md Section 14)

- Each member gets a personal invite link (`/i/<code>`, a readable personal code). Opening it
  and signing in takes one of the member's invites for 7 days ("Link opened, not joined yet ·
  Expires in 5 days"); creating a profile makes it "Joined 2 days ago" with Follow / Following;
  Cancel on an unused one returns it. "4 of 5 left". Both limits come from `app_config`
  (`invites_per_member`, `invite_valid_days`) and change without an app update.
- The personal code also works typed on `O-Invite`.
- Server: `my_invites`, `cancel_invite`; `invite_lookup` / `redeem_invite` learn personal codes;
  expiry of an unfinished invite returns it. pgTAP.
- App: `settings/invites` from the Settings row; Copy and Share use `inviteLink`.

### 3d. Store builds

- `eas.json` with development, preview and production profiles; `app.config.ts` version and
  build numbers; the Android and iOS identifiers already set.
- Needs from Nemat (tracked in `docs/BLOCKERS.md`, B-4): an Expo account and `eas init` for the
  project id (also B-2), the paid Apple team (also B-1/B-2), the app icon (no board draws it),
  store listing text and screenshots, the age-rating answers, and the privacy policy, terms and
  community guidelines documents or URLs (SPEC.md Section 24). The Settings rows and the
  `A-Removed` guideline link stay inactive until the URLs exist.

## 4. Checks

pgTAP, Jest, typecheck, lint, iOS simulator with the seed (every state, the invite screen, the
events landing in the table).

## 5. Not in this phase

The moderation web admin (Gate 5 item), the domain and app links (B-3), push credentials (B-2),
the mid-recording flip (B-1), Android verification. Nothing from Section 2's non-goals.
