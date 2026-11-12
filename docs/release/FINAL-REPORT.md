# Shortcut: multi-agent execution report (16 Oct 2026)

Lead: Fable 5.1 (orchestrator). Everything below was built and tested locally. Nothing was pushed,
deployed, run against the hosted project `picvoavfxnajfjkqawju`, real Mux, or a physical phone.
Where a claim is simulator-only or reasoned-only, it says so.

## A. Summary

- Six agents ran in parallel in isolated worktrees from one base (`7ebb69e`, the tip of the stacked
  feature branches). Their work is integrated on `claude/shortcut-multi-agent-execution-93fee4`.
- Built: camera flip during a take with native stitching (B-1); the conservative Mux `errored`
  rule; a privacy and session-lifecycle hardening of the backend (seven leaks and four lifecycle
  gaps fixed, rate limits on the anonymous endpoints); moderator removal now keeps the response
  slot; an internal moderation admin; the failed-post review package (P1 to P9) with the UI built on
  a holding branch; notification tap handling and routes; approved-UI fixes from a board audit; a
  reproducible install, EAS release configuration, release and policy documentation, and one ordered
  hosted deployment sequence.
- Verified locally: the full suite (pgTAP, Deno unit and integration, rollback rehearsal, scheduler,
  C1 and provider rehearsals, auth integration, typecheck, lint, Jest) on an isolated stack; one
  integrated iOS simulator walk.
- Not verified: anything on a phone, on the hosted project or against real Mux.

## B. Agents

| Agent | Model (runtime-confirmed) | Delivered |
|---|---|---|
| A | Opus | `abandon-submission`: an `errored` or undocumented Mux upload is kept unverified until 10 min after its URL expiry, then retired only if Mux still reports no asset; pgTAP 0014 (submissions across deletion, recovery, purge); provider procedures C1, C2w, C2a, C2e, E1 to E3 with scripts and a fake-Mux rehearsal; the rollback-check flake found and fixed (two pgTAP lookups depended on tie order); `docs/release/VIDEO-RELIABILITY.md`, `PROVIDER-TESTS.md` |
| B | Opus | B-1: segment recorder (`createTake` state machine, flip remounts the camera on iOS, rebinds on Android; limits on the total), Expo local module `app/modules/video-stitcher` (iOS AVFoundation composition + AVAssetWriter, Android Media3 Transformer 1.9.0), Review stitches once and plays the result; macOS harness 27/27; iOS simulator build; integrated simulator walk with screenshots; `docs/release/CAMERA-FLIP.md`, `SIMULATOR-WALK.md` |
| C | Opus | Migrations 200 to 204: own-row direct reads and column grants (moderator names and notes hidden), viewer visibility in faces, Activity, badge and follow counts, deletion ends every session and only a new sign-in restores, revoked sessions refused, avatar files removed by a new `avatar-cleanup` function, hashed fixed-window rate limits on invite lookups, sign-in method lookups and the web beacon; reflected XSS on `/i/<code>` fixed; startup refuses a missing or non-hosted Supabase URL; sign-out drops the push token and queued state; `docs/release/SECURITY.md` |
| D | Sonnet | Migration 300: a moderator-removed primary response keeps the slot (unique index covers `removed`; restore and author deletion unchanged); migration 301 and the `admin` Edge Function: server-rendered moderation admin with bearer-only auth, moderator membership checked on every request, every action through the existing `mod_*` functions; `scripts/moderate.sh add-moderator`; `docs/release/MODERATION.md` |
| E | Sonnet | Failed-post review package (`design/proposals/FAILED-POST-REVIEW.md`, screenshots); approved-UI audit and fixes (search icon, Ask someone, link routes `r`, `p`, `u`, `a`, account-scoped UI reset, Try again on a failed video, resume after background, accessibility); notification tap at cold start, push routes per kind, Android channel; link and icon fixes from the simulator walk; P1 to P9 built on `hold/failed-post-ui`; `docs/release/DESIGN-APPROVALS.md`, `UI-REVIEW.md` |
| F | Sonnet | `npm ci` fixed (`app/.npmrc`, lockfile untouched; cause explained in `BUILD.md`); `eas.json` and an EAS-only config guard; web player app links and pinned hls.js with SRI; Android blocked permissions; `docs/release/BUILD.md`, `IOS.md`, `ANDROID.md`, `NOTIFICATIONS.md`, `RELEASE-CHECKLIST.md` (with the hosted H-sequence), `SPEC-SYNC.md`; seven policy drafts in `docs/policies/` |
| Lead | Fable 5.1 | Audit, briefs, review and merge of every branch, conflict resolution, the session check's safe fallback, the consolidated verification runner, the lifecycle test fix for the new session rules, this report |

No Agent Teams tool exists in this runtime; the Agent tool with explicit models and per-agent
worktrees was used, with SendMessage for follow-ups. Notion was not reachable (connector not
authorised); `docs/PROGRESS.md` is the local record to synchronise.

## C. Code

- Integration branch: `claude/shortcut-multi-agent-execution-93fee4`, from `7ebb69e`
  (`claude/failed-post-designs-final-f3b632`, which contains every earlier feature branch).
  164 files changed, about 14,000 lines added, excluding screenshots. First-parent history lists
  each agent's integration commit; agent branches `worktree-agent-*` hold the detailed commits.
- Holding branch (not integrated): `hold/failed-post-ui` at `05173b6`, the P1 to P9 UI, rebased
  on the integrated tip. Merge only after design approval.
- New migrations (all local, none deployed), in order after the two still-pending 13 Oct ones:
  `20261013000200`, `20261013000300`, `20261016000200` to `204` (C), `20261016000300`, `301` (D).
  Each has `supabase/rollback/<name>.down.sql`.
- New or changed Edge Functions: `abandon-submission` (A), `web` (F, C), `avatar-cleanup` (C, new),
  `auth-signin-method` (C), `send-push` (C), `admin` (D, new). `config.toml` adds `verify_jwt =
  false` for `avatar-cleanup` and `admin`.
- Native: `app/modules/video-stitcher` (Swift, Kotlin, podspec, build.gradle), autolinked from
  `modules/`; no npm dependency added; `app.config.ts` unchanged by it.
- Not committed anywhere: `app/node_modules` (an agent merge had tracked it as a symlink; removed in
  `2113b77` and the ignore rule fixed), `.env` files, generated `ios/` and `android/`.

## D. Tests

Consolidated run on an isolated stack (`scripts/full-local-verification.sh`, project `shortcut-int`)
at the integrated tip. See the table filled in from run 3 below.

Run 3, 16 Oct 17:42 to 17:52 (+07), tip `d708cc7`, isolated stack `shortcut-int`, Mux faked, no
network beyond the stack:

| Suite | Result |
|---|---|
| pgTAP, 22 files | 1662/1662 |
| Deno unit: mux 21, cleanup 11, abandon 4, admin authz 18, web links 6, client 3 | all pass |
| Deno integration: uploads 32, integration 20, cleanup 28, idempotency 12, abandon 16, admin 7, avatar cleanup 3, sign-in method 3, web beacon 1 | all pass |
| Admin HTTP test through the served runtime | 4/4 (run separately against the same stack after run 3; the runner now includes it) |
| `scripts/idempotency-rollback-check.sh` (both rollbacks, old suite 1089, forward again, all 1662) | passed |
| `scripts/scheduler-integration.sh` | 13/13 |
| `scripts/c1-rehearsal.sh` | 29 checks passed |
| `scripts/provider-rehearsal.sh` (C2w, C2a, C2e, E1, E2, E3, guards, cleanup) | 8/8 |
| `scripts/auth-integration.mjs` | 52/52 |
| App: `tsc --noEmit`, `expo lint` | clean |
| App: Jest, 24 suites | 322/322 in run 3; 327/327 after the Back fix (`955a2aa`) |
| iOS simulator (Agent B, `SIMULATOR-WALK.md`, three walks) | onboarding, Home, record screen states, playback failure and Try again, `r`, `p`, `u` links, unknown link, Back from a link and from a pushed screen, delete own reply, sign-out, A-Mic/A-Camera/R-Record icons: as the boards; no product crash (two development-client reload crashes, not reproducible) |
| Native: iOS simulator build of the integrated tip | BUILD SUCCEEDED |
| Native: Android `video-stitcher` module | compiles; app never assembled for Android |
| macOS AVFoundation harness for the stitcher core | 27/27 |

Hold branch `hold/failed-post-ui` (05173b6): typecheck and lint clean, Jest 342/342 (not integrated).

Earlier agent-level counts on their own stacks: pgTAP 1245 (A), 1412 (C, before D), 1403 (D, before
C), 1656/1662 (C's follow-up, the six failures being the 0014 fixture fixed in `8afcef6`); Jest
up from 246 to 322; auth integration 52/52; provider rehearsal 8/8; C1 rehearsal 29/29; scheduler
13/13; rollback check 25/25 after the fix; macOS stitcher harness 27/27.

Not run: anything on a physical device; Android assembly of the whole app (the module compiles);
`send-push` against Expo; hosted or real-Mux steps; the hold branch on a simulator.

## E. Features (beta definition, SPEC section 23 and the brief)

| Area | State |
|---|---|
| Authentication, onboarding | Implemented (phases 2 to 7); email sign-in verified on hosted 9 to 11 Oct; Apple and Google need credentials; sign-up walked on the simulator 16 Oct |
| Recording, camera flip, stitching | Implemented locally (B-1); simulator cannot record; needs the device procedure in `CAMERA-FLIP.md`. B-1 stays open |
| Posting, idempotency, retry, discard | Implemented locally since 13 to 14 Oct; `errored` rule added; migrations 0200 and 0300 and `abandon-submission` not deployed |
| Failed-post recovery UI (P1 to P9) | Built on `hold/failed-post-ui`; awaits design approval |
| Video replies, playback, Discover, social | Implemented (phases 3 to 6); board audit fixes integrated; simulator walk of Home, playback failure, profile, links |
| Moderation, reporting, blocks | Backend since phase 5; admin built; slot rule fixed; not deployed |
| Notifications | Outbox and sender exist; tap handling, routes and Android channel added; delivery needs EAS, APNs and FCM |
| Account deletion and recovery | Hardened (sessions, restore rule, avatars); not deployed |

## F. Security

Satisfied locally (with tests): RLS on all 32 tables; all definer functions owned by postgres with
pinned search_path and no PUBLIC execute; only four anonymous RPCs; no direct table reads beyond
own rows; viewer-visibility respected on every member read path (74 cross-account checks);
no password path; one sign-in method per account; suspension gate on every path; deletion ends
sessions, restore only from a new sign-in; revoked tokens refused (with a safe fallback if
`auth.sessions` is unreadable); avatars removed on replacement and purge; rate limits on invite
lookups, sign-in method lookups and the web beacon; constant-time key checks; moderator-only
admin with service-role-only `mod_*` functions; no secrets in the app bundle; EAS builds refuse a
non-hosted URL.

Needs hosted verification: `postgres` can SELECT and DELETE `auth.sessions` (H1 preflight); which
header carries the client IP (rate limits); whether Edge Functions serve HTML on `*.supabase.co`
(H5b); the hosted auth smoke with `SESSION_GATE=1`. Remaining risks, ranked, are in
`SECURITY.md` section 3 (invite code length, enumeration bounded not closed, suspended authors'
content visibility, viewer-independent counts, email-code budget).

## G. Design

Implemented from approved boards: the UI-REVIEW fixes (search, Ask someone, link routes, Try
again, resume, account-scoped reset, accessibility, icons for A-Mic, A-Camera and R-Record).

Awaiting Nemat, in one pass (`docs/release/DESIGN-APPROVALS.md`): A, P1 to P9 as drawn (14
boards); B, two Post Review states while stitching and when stitching fails; C, 14 items
(failure patterns, video reply copy variants, singular counts, unavailable profile, text size,
contrast, draft copy, Ask someone, Android channel, push destinations, empty Replies tab); D,
four stale SPEC lines.

## H. Device testing

iPhone and a mid-range Android, in this order: `CAMERA-FLIP.md` 19 cases (flips, interruption,
permissions, orientation, failed stitch, 2 s and 30 s, backgrounding, file checks, playback and
upload); the failed-post device checks (BETA-READINESS 19.5 step 8) after H2 and H3; a Release-build
cold start from a link and Back (walked only on a development build); notification taps once credentials exist; sign-out, deletion and restore with the
new session rules; the Android spike checklist for Gate 1. Exact lists: `RELEASE-CHECKLIST.md`
stages 2 and 5, `SIMULATOR-WALK.md` "not walked".

## I. Deployment

The single ordered sequence is `RELEASE-CHECKLIST.md` Part 1B, H0 to H13; each step is its own
approval. In short: H1 read-only preflight (schema fingerprint, last applied migration,
`auth.sessions` privileges); H2 push `20261013000200` and `0300`; H3 deploy `abandon-submission`
`--no-verify-jwt`; H4 push `20261016000200` to `204` after the conflict check; H4b the
two-primary-rows pre-check then `300` and `301`; H5 deploy `web`; H5b confirm HTML is served as a
page; H6 `avatar-cleanup` with its secret and Vault entries; H7 `admin` and the first moderator;
H8 push sender; H9 post-deploy checks (fingerprint, hosted auth smoke, `config diff` unchanged);
H10 provider tests C1, C2w, C2a, E1 to E3; H11 auth providers; H11b merge the failed-post UI after
approval; H12 founder build and device checks; H13 Mux clean-up live, only after section 8 of
`VIDEO-RELIABILITY.md` holds. Rollback: apply the matching `.down.sql` body as a new forward
migration, newest first; never edit or delete an applied migration. Older app builds: the five-
argument posting functions are kept by the 0200 rollback; nothing deployed today breaks a build
since `b7a02ad`.

## J. Human approvals (one package)

1. Design: answer `DESIGN-APPROVALS.md` sections A to D ("all recommended" is a valid answer).
2. Product rules surfaced by the work: the `errored` rule (10 min after URL expiry); moderator
   removal keeps the slot with no "release the slot" action; rate-limit thresholds and whether
   invite codes get longer; suspended authors' content visibility; viewer-independent counts;
   whether to run C2e against real Mux.
3. Hosted: approve the H-sequence step by step, starting with H1; T1 already exists since CP0.
4. Accounts: Expo project (`eas init`), Apple Developer Program, Google Play, Apple and Google
   OAuth credentials, APNs key, FCM, Resend sending domain, the web domain.
5. Legal: review the seven drafts in `docs/policies/` (every placeholder is marked).
6. Spec: paste `SPEC-SYNC.md` into the online master.

## K. Timeline

Remaining work is measured in weeks, not days, and the critical path is outside the code:
- Days: the hosted H-sequence through H9 (one working day with approvals), the device passes
  (two to three days once a build is on both phones), the design answers and merging the hold
  branch (half a day).
- Weeks: Apple Developer enrolment and Google Play registration (long lead), Apple and Google
  sign-in credentials, push credentials, the domain, legal review, and the Android work that has
  never run on a phone (first Android build, spike checklist, B-1 on Android).
A controlled external beta on iPhone only is the shorter path: it needs the H-sequence, the
paid Apple team and a TestFlight build, the device passes, the design approvals and the policies.

## L. Next action

Run H1, the read-only hosted preflight in `RELEASE-CHECKLIST.md` Part 1B, and answer
`DESIGN-APPROVALS.md`. Both unblock the most work with no risk: H1 tells us whether the session
hardening and the admin can deploy as built, and the design answers release the failed-post UI
that is the last beta blocker in the app itself.
