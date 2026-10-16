# Release checklist: from 16 Oct 2026 to the first outside tester

One ordered list. It covers Gates 1, 2, 5 and 7, blockers B-1 to B-4 (`docs/BLOCKERS.md`), every item in
`docs/BETA-READINESS.md` sections 1 to 9, and the open items of sections 14 to 20 that sit on the path to a tester.
Nothing is marked done unless the check that closes it has been run; "built locally" is not "verified on a device".
**Only Nemat closes a gate** (`CLAUDE.md`); this list says what each gate waits for, it never marks one passed.
Written 16 Oct 2026 by the release-engineering role (Agent F); **updated the same day for the integration branch at
`90eced7`**, which adds Agent A's video reliability notes, Agent C's `SECURITY.md`, Agent B's `CAMERA-FLIP.md`, and the
app-side notification fixes. Part 1B is the single ordered hosted deployment sequence; stage 3 below points into it.

## Legend

Every row has one or more **class** tags. The first tag is the thing that blocks it right now.

| Tag | Meaning |
| --- | --- |
| `LOCAL-DONE` | completed and checked in this repository without any account, device or hosted change. The check that was run is named. |
| `NEEDS-DEVICE` | needs a physical iPhone or Android phone (or a simulator where stated). |
| `NEEDS-CREDENTIALS` | needs a key, secret, id or service account that does not exist yet (the free parts of an account count here too). |
| `NEEDS-PAID-ACCOUNT` | needs money: Apple Developer Program, Google Play registration, a domain, a paid plan. |
| `NEEDS-HOSTED` | needs a change on the hosted project `picvoavfxnajfjkqawju`, Mux, Resend, DNS or EAS; each one needs Nemat's approval at the time (`CLAUDE.md`, DECISIONS). |
| `NEEDS-FOUNDER` | a decision or approval only Nemat can give. |
| `LONG-LEAD` | not a class: starts a wait outside our control (verification, enrolment, DNS, review). Start these first. |

Owners: **Nemat**; **Lead** (the orchestrator, integrates branches and builds natively once); **A** video
reliability, **B** camera flip and native builds, **C** auth, privacy and account lifecycle, **D** moderation admin,
**E** UI audit and design proposals, **F** this role; **Team** (moderators and ops, not yet named).

---

## Part 1. The ordered path

### Stage 0. Decisions only Nemat can make (they unblock the paid and permanent steps)

| # | Step | Class | Owner | Exact action | Unblocks |
| --- | --- | --- | --- | --- | --- |
| 0.1 | Product name and brand | NEEDS-FOUNDER | Nemat | Approve the name (CLAUDE.md: "Shortcut" is the implementation name, "Conga" is provisional and not cleared). Until then the icon, listings and any outside build wait (DECISIONS 9 Oct). | 0.2, 3.3, 4.x, 6.x |
| 0.2 | Bundle id and Android package | NEEDS-FOUNDER | Nemat | Confirm `app.shortcut` for both, or choose new ones **before** the first App Store Connect or Play Console app is created (identifiers are permanent). Changing means editing `app.config.ts`, `eas.json` notes, `supabase/.env` (Apple client id) and Google OAuth clients. | 4.2, 4.3, 4.5 |
| 0.3 | Who is the seller | NEEDS-FOUNDER, LONG-LEAD | Nemat | Individual or company for Apple Developer, Google Play and the policies' `[Company legal name]`. An organisation account needs a legal entity (and, for Apple, a D-U-N-S number) and can take days to weeks. | 4.2, 4.3, 6.1 |
| 0.4 | Domain | NEEDS-PAID-ACCOUNT, NEEDS-FOUNDER, LONG-LEAD | Nemat | Choose and buy (B-3). Do not use a domain of the provisional brand for email (DECISIONS 9 Oct). | 3.7, 6.5 |
| 0.5 | Decide the open product questions that have a "needs decision" status | NEEDS-FOUNDER | Nemat | (a) P1 to P9 failed-post boards: final visual approval (a beta blocker per BETA-READINESS 20.6). (b) Automated upload scanner: yes or no (SPEC 22). (c) Reviewer access plan for Apple and Google (`IOS.md` section 7). (d) Where Privacy policy and Terms live in the app (no board). (e) Retention periods for `analytics_events`, sent `push_outbox`, closed reports, live-account moderation records (`RETENTION-AND-RECOVERY.md`). (f) Whether redeeming an invite should close the waitlist row (BETA-READINESS section 11). (g) Moderators and rota. | 1.x, 5.x, 6.x |
| 0.6 | Gate 1 decision path | NEEDS-FOUNDER | Nemat | Gate 1 (Mux and expo-camera) closes only on Nemat's explicit approval, after the Android run (5.4). Record it in `docs/DECISIONS.md`. | Gate 1 |

### Stage 1. Local work that needs no account (agents, now)

| # | Step | Class | Owner | Exact action | Closes |
| --- | --- | --- | --- | --- | --- |
| 1.1 | Reproducible install | LOCAL-DONE | F | `app/.npmrc` (`legacy-peer-deps=true`); `rm -rf node_modules && npm ci && npm run typecheck && npm run lint && npm test` run 16 Oct: ci succeeds, tsc and eslint exit 0, Jest 17 suites 246/246. `docs/release/BUILD.md`. | lockfile failure |
| 1.2 | Release configuration for EAS | LOCAL-DONE (not run on EAS) | F | `eas.json` pins hosted URL, dev tools off, founder switch off; `app.config.ts` refuses a wrong EAS preview or production build; `.env.example` complete. Tested by simulating `EAS_BUILD=true`. | config audit |
| 1.3 | Fail clearly on missing Supabase config | LOCAL-DONE (Agent C, `04197bc`; Jest `supabaseConfig` 6 tests, `SECURITY.md` A1) | C | `configError()` throws at startup; outside `__DEV__` only `https://<20-char ref>.supabase.co` is accepted; no `http://localhost` fallback. Not run on a phone. Part 4 is kept as the record. | silent localhost fallback |
| 1.4 | B-1 camera flip during a take | LOCAL-DONE (Agent B, integrated; Jest `take.test.ts` 22 and `stitch.test.ts` 8; iOS module builds and its core passes 27 checks on a Mac harness; Android module compiles) then NEEDS-DEVICE | B, Nemat | `docs/release/CAMERA-FLIP.md` is built, **not verified on a phone**. Device procedure: its 19 cases and file/Mux checks on an iPhone (iOS 17+) and a mid-range Android (13+); B-1 can be closed by Nemat when cases 1, 2, 5, 6, 10, 11, 17 and 19 pass on both phones and the file checks match. Needs a board or decision: a state while Post Review stitches, and a message when stitching fails. | B-1 (after device) |
| 1.5 | Moderation web admin | LOCAL-DONE (Agent D: `admin` function, `moderators` table, `scripts/moderate.sh add-moderator`; pgTAP 0030 to 0032, Deno authz 18, integration 7, HTTP 4; walked once in a browser against a local stack); NEEDS-HOSTED (H4b, H5b, H7) and NEEDS-DEVICE (Safari) | D, Nemat | `docs/release/MODERATION.md`. Not deployed. Required before the first outside tester (Nemat 8 Oct). | Gate 5 item |
| 1.6 | Failed-post UI P1 to P9 | LOCAL-DONE on branch `hold/failed-post-ui` (tip `ecb72be`, not merged); NEEDS-FOUNDER (approval) | E, Nemat | Built and tested on the hold branch (Jest 331/331 on `90eced7`, per its notes; no simulator or device). Merge only after Nemat approves `DESIGN-APPROVALS.md` section A: step H11b. | BETA-READINESS 20.6 |
| 1.7 | Video reliability list | LOCAL-DONE for the `errored` rule (Agent A, `be99363`: an `errored` or undocumented Mux upload with no asset stays `kept`/`unverified` until 10 minutes after its URL's recorded expiry, then is retired; `VIDEO-RELIABILITY.md` section 2) and the provider test procedures (`PROVIDER-TESTS.md`, rehearsed against a fake Mux only); NEEDS-HOSTED for everything else | A | Hosted rollout is the H-sequence below; provider tests C1, C2w, C2a, E1 to E3 need Nemat's approval per step; test account T1 already exists. | section 12 open list |
| 1.8 | Account-lifecycle gaps found by F | LOCAL-DONE for (a) and (b) (Agent C: `avatar-cleanup`, `20261016000203`; sign-out drops the token, `bdc1cd2`); NEEDS-FOUNDER for (c) and (d) | C | (a) Profile photo files: replaced and purged photos removed (local, not deployed). (b) Sign-out removes the push token and clears queued events and recent searches (app code, not run on a phone). (c) Retention periods for the "No rule" rows in `RETENTION-AND-RECOVERY.md` are still undecided. (d) The web request path for account deletion still does not exist. | policy truth |
| 1.9 | App-link and push-open gaps found by F | LOCAL-DONE (Agent E, `978e053`; routes `r/[id]`, `p/[id]`, `u/[username]`, `i/[code]`, `a/[activityId]` exist) then NEEDS-DEVICE | E, Nemat | (a) Link routes exist; universal and app links still need the domain (3.7). (b) Cold-start tap handled in code (`launchTap`); (c) Android channel created before the ask. None run on a phone: `NOTIFICATIONS.md` section 4 step 6. | B-2, B-3 checks |
| 1.10 | Pin the web player script | LOCAL-DONE (`web/links.ts`: hls.js 1.7.3 with sha384 SRI; Deno `web_links_test.ts` 6/6); NEEDS-HOSTED (deploy `web`, H5) | F | Done in code. Open in the app uses the page's own route. The reflected-XSS fix on `/i/<code>` (Agent C, `755694a`) is in the same file and goes out with it. | privacy and supply chain |
| 1.11 | Integrate and re-verify | LOCAL-DONE (when done) | Lead | Merge the agents' branches; `npm ci`, typecheck, lint, Jest; pgTAP, Deno suites per BETA-READINESS 20.4. | before 2.1 |

### Stage 2. One native build, locally (no accounts needed)

| # | Step | Class | Owner | Exact action | Closes |
| --- | --- | --- | --- | --- | --- |
| 2.1 | Founder iPhone build from the integrated branch | NEEDS-DEVICE | Lead | `DEVICE=<udid> app/scripts/founder-ios.sh release` (free Personal Team, hosted project, no Apple sign-in, no push). Valid 7 days. | regression of 10 to 11 Oct |
| 2.2 | Regression pass on that build | NEEDS-DEVICE | Nemat | Sign-in by email code, 18+, invite, profile, record, review, Post, live, replay, delete; the failed-post device checks of BETA-READINESS 19.5 step 8 need the hosted deploys in 3.1 first. | phase 2 and 3 rows |
| 2.3 | First Android debug build | NEEDS-DEVICE | B | `npx expo prebuild --platform android --clean`, `npm run android` on a real mid-range phone (`ANDROID.md` section 9). The app has never been built for Android. | Android never run |

### Stage 3. Hosted project work (each a separate approval; `picvoavfxnajfjkqawju`)

| # | Step | Class | Owner | Exact action | Closes |
| --- | --- | --- | --- | --- | --- |
| 3.1 | Posting-idempotency and security rollout | NEEDS-HOSTED, NEEDS-FOUNDER | A, C, Lead | **Replaced by the ordered H-sequence in Part 1B**: H1 to H6 and H9. | section 16 to 19, `SECURITY.md` |
| 3.2 | Mux deletion worker policy | NEEDS-FOUNDER, NEEDS-HOSTED | A | Decide when `mux-cleanup` goes live (DECISIONS 12 Oct: "no Mux deletion runs until the worker is configured and explicitly switched to live"). The privacy and deletion pages are not true until it is. | policy checks 1 |
| 3.3 | Reference data on the hosted project | NEEDS-HOSTED | Lead | Topics, the other places, place neighbours exist only in `supabase/seed.sql` (never applied to hosted). Choose what the beta needs and apply it as a reviewed one-off, not by running the seed. | section 2 hosted row |
| 3.4 | Deploy `web` | NEEDS-HOSTED | Lead | H5. | section 6 row |
| 3.5 | Push sender on hosted | NEEDS-HOSTED, NEEDS-CREDENTIALS | Lead | H8; do it with 4.1, 4.6 and 4.7. | B-2 |
| 3.6 | Auth providers on hosted | NEEDS-HOSTED, NEEDS-CREDENTIALS | Lead | After 4.4 and 4.5: flip `[remotes.hosted.auth.external.apple]` and `.google` to `enabled = true` (prepared diffs in `IOS.md` section 5 and `ANDROID.md` section 3), `supabase config diff`, preview push, push. | Gate 2 |
| 3.7 | Web domain wiring | NEEDS-HOSTED, NEEDS-PAID-ACCOUNT | Lead | After 0.4: DNS or CNAME to the `web` function, serve `apple-app-site-association` and `assetlinks.json`, set `EXPO_PUBLIC_WEB_BASE_URL` in EAS, add `associatedDomains` and `intentFilters` (`IOS.md` section 3, `ANDROID.md` section 6) once the routes exist (1.9a). | B-3 |
| 3.8 | Mux housekeeping | NEEDS-HOSTED | Nemat | Revoke the spike token pair and the extra token in the spike environment; decide the spike's 7 assets; give the local stack its own dev token (BETA-READINESS section 12). | section 8 |
| 3.9 | Spike-function log check | NEEDS-HOSTED | Nemat | Look at invocation logs for 6 to 9 Oct for the deleted spike functions (Logs Explorer). One line in BETA-READINESS. | section 8 |
| 3.10 | Rate limit for `auth-signin-method` | NEEDS-FOUNDER | C | Decide before outside testers (section 10: enumeration and flood). | Gate 5 item |

### Stage 4. Accounts and credentials

| # | Step | Class | Owner | Exact action | Closes |
| --- | --- | --- | --- | --- | --- |
| 4.1 | Expo account and project | NEEDS-CREDENTIALS | Nemat | `npx eas-cli login`, `npx eas-cli init` in `app/`; add `EAS_PROJECT_ID` to `app/.env` and EAS environments. Then the EAS environment variables listed in `IOS.md` section 4 for `preview` and `production`. | B-2, B-4 (part) |
| 4.2 | Apple Developer Program | NEEDS-PAID-ACCOUNT, LONG-LEAD | Nemat | Enrol (after 0.3). Needed for signing, Sign in with Apple, push, associated domains, TestFlight, ad hoc builds. | B-1..B-4 (Apple part) |
| 4.3 | Google Play developer account | NEEDS-PAID-ACCOUNT, LONG-LEAD | Nemat | Register and complete identity verification (after 0.3). Check the current closed-testing requirement for the account type (`ANDROID.md` section 7). | B-4 (Android part) |
| 4.4 | Sign in with Apple at Apple and in Supabase | NEEDS-CREDENTIALS | Nemat, Lead | `IOS.md` section 5: App ID capability, Services ID, key, generated client secret (expires in at most 6 months: put the date in the calendar), `supabase/.env`. Register the email sending domain for relay addresses. | Gate 2 |
| 4.5 | Google Cloud OAuth clients | NEEDS-CREDENTIALS | Nemat | `ANDROID.md` section 3: consent screen, web, Android (three SHA-1s) and iOS clients; ids into EAS variables and `supabase/.env`. | Gate 2 |
| 4.6 | Firebase and FCM | NEEDS-CREDENTIALS | Nemat | `NOTIFICATIONS.md` section 4 step 3: `google-services.json` as EAS file variable, service-account key uploaded to Expo. | B-2 |
| 4.7 | APNs key | NEEDS-CREDENTIALS, NEEDS-PAID-ACCOUNT | Nemat | `NOTIFICATIONS.md` section 4 step 2. | B-2 |
| 4.8 | Resend deliverability | NEEDS-HOSTED | Nemat | Codes arrive within a minute on Gmail (done 9 Oct), Outlook, iCloud and a Bali address; a waitlist admission email arrives (`team_admit_from_waitlist` workflow is undefined, 0.5/7.x). | section 2 email row |
| 4.9 | Brand assets | NEEDS-FOUNDER | Nemat | After 0.1: the approved icon in `app/assets` (do not ship the Expo template icon), adaptive and monochrome Android icons, splash decision, production source of the welcome collage and faces. | section 5 |

### Stage 5. Builds on devices, and Gate 2

| # | Step | Class | Owner | Exact action | Closes |
| --- | --- | --- | --- | --- | --- |
| 5.1 | iOS preview build | NEEDS-DEVICE, NEEDS-PAID-ACCOUNT, NEEDS-CREDENTIALS | Nemat, Lead | `npx eas-cli device:create`, then `npx eas-cli build --platform ios --profile preview`; install on Nemat's iPhone. This is ad hoc: it needs the registered UDID (`IOS.md` section 4). | B-4 check (iOS, part) |
| 5.2 | Android preview APK | NEEDS-DEVICE, NEEDS-CREDENTIALS | Nemat, Lead | `npx eas-cli build --platform android --profile preview`; install from the link. | B-4 check (Android, part) |
| 5.3 | Gate 2 attempt | NEEDS-DEVICE | Nemat | Sign up with email, Apple and Google on both platforms against the hosted project, through 18+, invite and profile. Needs 3.6, 4.4, 4.5, 5.1, 5.2 and one invite per attempt (`scripts/create-invite.sh`). Nemat decides if Gate 2 closes. | Gate 2 |
| 5.4 | Android spike run | NEEDS-DEVICE | Nemat, B | `ANDROID.md` section 8 part A on a real mid-range phone over Bali mobile data; put the results in `spike/REPORT.md` section 8 and BETA-READINESS section 3. Nemat decides Gate 1. | Gate 1 |
| 5.5 | Mobile-data pass on iPhone | NEEDS-DEVICE | Nemat | Record, upload and play over Bali mobile data on the real app (the 11 Oct test did not confirm the network). | phase 3 row |
| 5.6 | Push end to end | NEEDS-DEVICE, NEEDS-CREDENTIALS | Nemat | `NOTIFICATIONS.md` section 4 step 6 on a paid-team iOS build and an Android build with FCM. | B-2 |
| 5.7 | Full board pass with two accounts | NEEDS-DEVICE | Nemat, Team | `ANDROID.md` section 8 part B on both platforms, two accounts replying, commenting, following, reporting, blocking each other; every phase's "not verified" list in BETA-READINESS section 3. | section 3 rows |

### Stage 6. Policies, store listings, links

| # | Step | Class | Owner | Exact action | Closes |
| --- | --- | --- | --- | --- | --- |
| 6.1 | Legal review of the drafts | NEEDS-FOUNDER | Nemat | A lawyer clears every `[LEGAL REVIEW]` in `docs/policies/*.md`, fills `[PLACEHOLDER]`s and deletes the "Checks before publishing" sections once true. | section 4 |
| 6.2 | Make the policy statements true | NEEDS-HOSTED | C, A | The "Checks before publishing" lists in `PRIVACY-POLICY.md`, `ACCOUNT-DELETION.md`, `TERMS-OF-SERVICE.md` and `RETENTION-AND-RECOVERY.md` section 4: Mux deletion live (3.2), avatar files, retention rules, backups, who reads events. | section 4 |
| 6.3 | Host the documents | NEEDS-HOSTED | Lead | Public URLs for guidelines, privacy, terms, deletion, help. | section 4 |
| 6.4 | Wire the in-app destinations | NEEDS-FOUNDER (design), then code | E | Settings rows for Community guidelines and Help and feedback (drawn, inactive), the `A-Removed` guidelines link; a board for the Privacy policy and Terms entry points and a Welcome line that names the Privacy Policy (Apple requires an in-app policy link). | section 1 and 4 |
| 6.5 | Store listing material | NEEDS-FOUNDER | Nemat | Name, subtitle, description, keywords, screenshots per device size, support URL, age-rating answers (18+, user-generated video, no ads), privacy labels and Data safety answers (`IOS.md` section 8 is the draft), reviewer access instructions. | sections 4, 5 |
| 6.6 | Help and feedback destination | NEEDS-FOUNDER | Nemat | An address or form monitored by a named person (`HELP-AND-CONTACT.md`). | section 4 |
| 6.7 | Account-deletion web path (Play) | NEEDS-FOUNDER | Nemat | A public page and a way to ask for deletion without the app. | Play listing |

### Stage 7. Safety gate (Gate 5) and the first TestFlight and Play builds

| # | Step | Class | Owner | Exact action | Closes |
| --- | --- | --- | --- | --- | --- |
| 7.1 | Production-profile builds | NEEDS-PAID-ACCOUNT, NEEDS-CREDENTIALS | Nemat, Lead | `eas build --profile production` for both; check `aps-environment` and permissions in the artifact (`NOTIFICATIONS.md` gap 5; `ANDROID.md` section 2). | B-4 |
| 7.2 | Internal tracks | NEEDS-PAID-ACCOUNT | Nemat | `eas submit` to TestFlight internal and Play internal testing. Install from the store tracks and sign in again (Play App Signing SHA-1 for Google). | B-4 check |
| 7.3 | Moderation operations ready | NEEDS-FOUNDER | Nemat, Team | Admin deployed (1.5), moderators named, review-request handling rehearsed, enforcement texts reference live guidelines. | Gate 5 |
| 7.4 | Phase 5 on devices | NEEDS-DEVICE | Nemat | Report, block and delete end to end; re-authentication with Apple and Google; account deletion with the email code and restore within 30 days; enforcement notices by push; link previews and opening the app from a link (B-3). | Gate 5 |
| 7.5 | External TestFlight and Play closed testing | NEEDS-FOUNDER, LONG-LEAD | Nemat | Beta App Review (Apple), closed test requirements (Google), reviewer access in place. | outside testers |
| 7.6 | Gate 5 decision | NEEDS-FOUNDER | Nemat | Only when 1.5, 6.x, 7.3 and 7.4 and B-2 hold. Record in `docs/DECISIONS.md`. | Gate 5 |
| 7.7 | **First outside tester** | NEEDS-FOUNDER | Nemat | An invite code, after Gate 5 is closed. Gate 7 (the closed beta opens in Canggu) is a separate decision. | Gate 7 |

---

## Part 1B. The hosted deployment sequence (one ordered list, H1 to H13)

Everything pending for `picvoavfxnajfjkqawju` in one order, from the repository at `3b6ffff` (25 migration files; Agent D merged).
**Each H-step is its own approval from Nemat; stop between steps.** None has been run. Sources: the order and checks are
those of `docs/release/VIDEO-RELIABILITY.md` section 5 (steps for `20261013000200` and `20261013000300`) and
`docs/release/SECURITY.md` section 6 (steps for `20261016000200` to `20261016000203`), merged without adding
steps of their own. Always deploy a function by name, never `--prune`, never `--yes` on a config push.

**State on the hosted project today** (BETA-READINESS section 15 and `VIDEO-RELIABILITY.md` 5.1): 17 migrations applied,
last `20261013000100`; Edge Functions deployed: `auth-signin-method`, `mux-create-upload`, `mux-upload-status`,
`mux-webhook`, `mux-cleanup`; **not deployed: `abandon-submission`, `web`, `send-push`, `avatar-cleanup`**; Vault empty.
No function other than the three named below has changed in the repository since `7ebb69e`
(`git diff --stat 7ebb69e HEAD -- supabase/functions`), so none of the deployed five needs redeploying.

### The migrations, with their rollbacks

| Order | Migration (pending) | Rollback file (`supabase/rollback/`) | What it changes | Batch |
| --- | --- | --- | --- | --- |
| 1 | `20261013000200_post_idempotency.sql` | `20261013000200_post_idempotency.down.sql` | `post_submissions`; five-argument posting functions with `p_submission` | A |
| 2 | `20261013000300_safe_submission_abandon.sql` | `20261013000300_safe_submission_abandon.down.sql` | `begin_submission_abandon` and `finish_submission_abandon` (service role); drops `abandon_submission` | A |
| 3 | `20261016000200_direct_read_privacy.sql` | `20261016000200_direct_read_privacy.down.sql` | members read only their own `profiles`, `follows`, `comments`; column grants hide `prompts.suggested_by` and moderator names and notes; `TRUNCATE`, `REFERENCES`, `TRIGGER` revoked (P1 to P3) | B |
| 4 | `20261016000201_viewer_visibility.sql` | `20261016000201_viewer_visibility.down.sql` | faces, Activity rows, the badge and follow counts respect blocks, reports and deletion (P4 to P7) | B |
| 5 | `20261016000202_session_lifecycle.sql` | `20261016000202_session_lifecycle.down.sql` | `delete_account` ends sessions; restore needs a newer session; `pre_request` refuses a revoked session; avatar writes need an active account (L1 to L4) | B |
| 6 | `20261016000203_avatar_cleanup.sql` | `20261016000203_avatar_cleanup.down.sql` | `avatar_removals` queue, `run_avatar_cleanup()`, cron job `avatar-cleanup` every 10 minutes (L5) | B |
| 7 | `20261016000300_response_slot_moderation.sql` (Agent D) | `20261016000300_response_slot_moderation.down.sql` | `responses_one_per_prompt` also covers `removed` (a moderator's removal no longer reopens the response slot); `publish_draft` answers `already_responded`. **Stops with a list, changing nothing, if a member already has two primary rows on one prompt** (pre-check in H4b) | C |
| 8 | `20261016000301_admin_moderators.sql` (Agent D) | `20261016000301_admin_moderators.down.sql` | `moderators` table (RLS on, service role only), `mod_add_moderator`, `mod_deactivate_moderator`, `mod_list_moderators`, `mod_whoami` and the read functions behind the admin | C |

**Rollback style (decided by the lead, 16 Oct; the only one used).** A rollback is applied as a **new forward migration whose
body is the `.down.sql` file**, pushed with `supabase db push --dry-run` then `db push`. Never by deleting rows from
`schema_migrations` and never by removing or editing an applied migration file. Order, newest first: `…0301`, `…0300`,
`…0203`, `…0202`, `…0201`, `…0200`, then `20261013000300`, `20261013000200`. Sessions already ended stay ended; undeploy
the `admin` function before rolling back `…0301` (without its database side it answers 403 to everyone,
`MODERATION.md` section 6). **`docs/release/SECURITY.md` section 6 step 9 still describes the other style (run the
files in one transaction, then delete the `schema_migrations` rows); read it together with this decision. It is Agent
C's file and was not edited.** `VIDEO-RELIABILITY.md` section 6 and `MODERATION.md` section 6 already say forward migration.

### The Edge Functions and what each needs

| Function | Action | `verify_jwt` | Function secrets | Vault secrets | Source |
| --- | --- | --- | --- | --- | --- |
| `abandon-submission` | deploy (new) with `--no-verify-jwt` | false (`config.toml`; hosted tokens are ES256, the function checks the caller itself) | none new: `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET` already set; `MUX_API_BASE` must stay **unset** | none | `VIDEO-RELIABILITY.md` 4, 5 |
| `web` | deploy (new; also carries the XSS fix and the pinned script) with `--no-verify-jwt` | false | optional `STORE_URL`, `WAITLIST_URL`. If unset the code falls back to `https://shortcut.app` and to the store URL (`web/index.ts`); that domain is not owned, so set them or accept the placeholder knowingly | none | `web/index.ts`, BETA-READINESS section 6 |
| `avatar-cleanup` | deploy (new) with `--no-verify-jwt` | false (`config.toml`) | `AVATAR_CLEANUP_KEY` (a long random string) | `avatar_cleanup_url` = `https://picvoavfxnajfjkqawju.supabase.co/functions/v1/avatar-cleanup`, `avatar_cleanup_key` = the same string as the function secret | `SECURITY.md` 6.5, 6.6 |
| `send-push` | deploy (new) with `--no-verify-jwt`, **only with the push credentials** (H8) | false | `PUSH_SENDER_KEY`; optional `EXPO_ACCESS_TOKEN` | `push_function_url`, `push_function_key` (= `PUSH_SENDER_KEY`) | `supabase/README.md`, `NOTIFICATIONS.md` 4 |
| `admin` (Agent D) | deploy (new) with `--no-verify-jwt` | false (`config.toml` `[functions.admin]`): the sign-in page must be reachable without a token and the function verifies the token and the moderator on every request itself | none required. The runtime provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Optional: `ADMIN_AUTH_BASE` (only if served from another origin than the project), `ADMIN_WEB_PLAYER_BASE` (only if the web player is not next to it) | none | `docs/release/MODERATION.md` sections 3 and 6 |
| `auth-signin-method`, `mux-create-upload`, `mux-upload-status`, `mux-webhook`, `mux-cleanup` | **no redeploy** (unchanged since `7ebb69e`) | false | unchanged (10 secrets on hosted) | `mux_cleanup_url`, `mux_cleanup_key` already used by the clean-up worker | `git diff --stat` above |

### The sequence

| Step | Action | Exact commands and checks | Waits for |
| --- | --- | --- | --- |
| H0 | Preconditions | Nemat reviews the commits behind each batch; `supabase` CLI 2.119+ logged in to the account that owns the project; a clean `git archive` of the reviewed commit to push from; both clean-up switches **non-live** (database `off`, `MUX_CLEANUP_MODE` unset); none of H1 to H9 touches them. | Nemat |
| H1 | **Read-only preflight (stop if any fails). DONE 16 Oct 11:44 UTC, all PASS (`H1-REPORT.md`).** | (a) `VIDEO-RELIABILITY.md` 5.1: schema fingerprint (`scripts/schema-fingerprint.sql`, 759 objects at the end of Test B2) line for line against a local stack built from the same 17 migrations; last applied `20261013000100`; `post_response(uuid, text, text, integer)` exists and `post_submissions` does not; functions and secrets as in B2 (no `abandon-submission`); health `ok`; no open job; the founder's and V's hashes. (b) `SECURITY.md` 6.1, as SQL: `select has_table_privilege('postgres','auth.sessions','select') as s, has_table_privilege('postgres','auth.sessions','delete') as d;` **both must be true** (if `s` is false every signed-in request fails in `pre_request`; if `d` is false `delete_account` fails); `select count(*) from pg_extension where extname = 'pg_graphql';` expect 0 (if 1 the same row-level rules apply through `/graphql/v1`); `select policyname from pg_policies where schemaname = 'storage' and policyname like 'avatars:%';` expect 4. | Nemat approves the read-only queries |
| H2 | Batch A: posting idempotency. **DONE 16 Oct 11:59 UTC (BETA-READINESS section 22; all verification checks passed).** | `supabase db push --linked --dry-run` must list exactly `20261013000200_post_idempotency.sql` then `20261013000300_safe_submission_abandon.sql`; then `supabase db push --linked`. Both in one push (0300 drops what 0200 creates). The installed founder build `ede68ed` keeps posting; a call during the DDL may fail once. Verify read-only (`VIDEO-RELIABILITY.md` 5.4): five-argument signatures, grants, `SECURITY DEFINER`, four-argument versions gone, `begin/finish_submission_abandon` executable by `service_role` only, `post_submissions` RLS on with no policy, `abandon_submission` absent, PostgREST lists `post_response` with `p_submission`. | H1 |
| H3 | Deploy `abandon-submission`. **DONE 16 Oct 12:04 UTC (BETA-READINESS section 23; v1 ACTIVE, verify_jwt false, 401 without a session).** | `supabase functions deploy abandon-submission --project-ref picvoavfxnajfjkqawju --no-verify-jwt`. Verify: `functions list` shows `ACTIVE`, `verify_jwt` false; a `POST` without a session answers 401; the other bundles unchanged. | H2 |
| H4 | Batch B: privacy, visibility, sessions, avatars. **DONE 16 Oct 12:07 UTC (BETA-READINESS section 24; all checks passed).** | **Conflict check first** (`SECURITY.md` 6.2): migrations `…200` to `…203` redefine `prompt_card`, `activity_row`, `activity_unread_count`, `get_profile`, `pre_request`, `delete_account`, `get_onboarding_state` and the two avatar write policies; Agent D's `…0300` redefines only `publish_draft` and the unique index and `…0301` adds new functions, so neither overlaps (checked 16 Oct by reading both files); any later file that redefines one of those functions must start from Agent C's version, for example keep the `session_is_current()` check in `pre_request`. The column grants hide `moderator`, `note`, `decided_by`, `reviewed_by` from `authenticated`, so the admin must read those tables with the service role. Then `db push --linked --dry-run` must list exactly `20261016000200` to `20261016000203`, then `db push --linked`. `cleanup_integration_test.ts` already signs in again after deletion (`b0b7295`), so the earlier test patch is no longer needed. | H3 (batch B assumes the 19 earlier migrations; `SECURITY.md` 4) |
| H4b | Batch C: response slot and moderators (Agent D) | **Pre-check first, read-only; it must return no rows** (`MODERATION.md` section 5): `select author_id, prompt_id, array_agg(id) from public.responses where kind = 'response' and status in ('processing', 'live', 'removed') group by 1, 2 having count(*) > 1;` A row means a member responded again after a removal; decide by hand which response stands (the migration stops with that list and changes nothing if it is not clean). Then `db push --linked --dry-run` must list exactly `20261016000300_response_slot_moderation.sql` then `20261016000301_admin_moderators.sql`; then `db push --linked`. Note for later: when `post_response` is next edited add `'removed'` to its early `already_responded` check and keep its `unique_violation` handler (`MODERATION.md` section 5). Consequence to accept: a moderator-removed response keeps its author's slot until a moderator restores it. | H4 |
| H5 | Deploy `web`. **DONE 16 Oct 12:18 UTC with `auth-signin-method` v11 and `send-push` v1 (BETA-READINESS section 25).** | `supabase functions deploy web --project-ref picvoavfxnajfjkqawju --no-verify-jwt` (+ optional `STORE_URL`, `WAITLIST_URL` via `supabase secrets set`). Verify: `/r/<id>`, `/p/<id>`, `/i/<code>`, `/u/<name>` render; `noindex`; each page's "Open in the app" link is `shortcut://r/…`, `p/…`, `u/…`, `i/…`; the hls.js tag carries the `integrity` hash and `crossorigin`; `/i/%3C/script%3E` does not break out of the inline script. | H4 (the visibility fixes reach the web through `web_video`/`web_prompt`) |
| H5b | **Check: is HTML from an Edge Function served as a page? CHECKED 16 Oct 12:18 UTC: NO. `content-type: text/plain` with a sandbox CSP on the default domain (BETA-READINESS section 25). A custom domain in front of the functions is now a prerequisite for shared links (B-3) and the admin (H7).** | Agent D's open question, which applies equally to the `web` function (BETA-READINESS section 1 lists it as built but unverified on hosted): as far as `MODERATION.md` section 6 knows, Supabase serves HTML from a function on the default `*.supabase.co` domain as `text/plain` (with a sandbox policy) unless a custom domain is used. Not verifiable locally. After H5, read-only: `curl -sI https://picvoavfxnajfjkqawju.supabase.co/functions/v1/web/i/CHECK` and read `content-type` (must be `text/html`, not `text/plain`), then open one `/r/<id>` link in a phone browser and confirm the page renders rather than showing source. **If it is `text/plain`, neither shared-link pages nor the admin work on the default domain**: a custom domain in front of the functions (then `ADMIN_AUTH_BASE` = the project URL) or another host is needed first (links B-3, 0.4, 3.7). Record the result in BETA-READINESS. | H5 |
| H6 | Deploy `avatar-cleanup` and turn it on. **DONE 16 Oct 12:20 UTC (BETA-READINESS section 26); first end-to-end call still to be observed at the first photo replacement.** | `supabase functions deploy avatar-cleanup --project-ref picvoavfxnajfjkqawju --no-verify-jwt`; `supabase secrets set AVATAR_CLEANUP_KEY=<long random>`; then `select vault.create_secret('https://picvoavfxnajfjkqawju.supabase.co/functions/v1/avatar-cleanup', 'avatar_cleanup_url');` and `select vault.create_secret('<the same string>', 'avatar_cleanup_key');`. Until both exist the cron job (`avatar-cleanup`, every 10 minutes) does nothing and names simply queue. Verify read-only: the four `avatars:%` policies, the cron job, `select count(*) from public.avatar_removals`, then rows getting `done_at`. | H4; may wait |
| H7 | Deploy `admin` and add the first moderator (Agent D) | `supabase functions deploy admin --project-ref picvoavfxnajfjkqawju --no-verify-jwt` (after H4b and **H5b passes**; no secrets needed). First moderator, once that person has an **email-code** account (an Apple or Google account gets no token from an email code, so it cannot sign in to the admin): `LINKED=1 MODERATOR="Nemat" scripts/moderate.sh add-moderator <username or account id>`, then `LINKED=1 scripts/moderate.sh moderators` to confirm (or in the SQL editor `select public.mod_add_moderator('<account id>', 'Nemat');`). Turn access off with `deactivate-moderator`. Then open `https://picvoavfxnajfjkqawju.supabase.co/functions/v1/admin` and walk it once with a test report before the first outside tester, in Safari too for the inline player (`MODERATION.md` section 8). | H4b, H5b |
| H8 | Push sender | `NOTIFICATIONS.md` section 4 step 4: choose `S`; `vault.create_secret(…/functions/v1/send-push, 'push_function_url')` and `vault.create_secret('<S>', 'push_function_key')`; `supabase secrets set PUSH_SENDER_KEY=<S>`; optional `EXPO_ACCESS_TOKEN`; `supabase functions deploy send-push --no-verify-jwt`. Harmless without tokens; do it together with 4.1, 4.6 and 4.7. | Expo project id, APNs key, FCM |
| H9 | Post-deploy hosted checks | Fingerprint equal to a local stack built from the 25 migrations (or 17 + the ones pushed); `SESSION_GATE=1 node scripts/hosted-auth-smoke.mjs` (Nemat, own address: sign-in, refresh, product call, and that a signed-out token is refused); `supabase config diff --project-ref picvoavfxnajfjkqawju` must show **no change** from the state after 9 Oct (no Auth, API, DB or Storage setting changed; `[functions.avatar-cleanup] verify_jwt = false` is not compared and takes effect at deploy). | H2 to H6 |
| H10 | Provider tests. **C1 PASSED 16 Oct 12:43 UTC (BETA-READINESS section 27).** | `PROVIDER-TESTS.md`: C1 and C2w need none of the above and may run earlier; C2a after H3; E1 to E3 at any point, in their order. Each step that changes anything is its own approval; the database switch stays `off` except for seconds in `scripts/provider-drain.sh`. | Nemat per step |
| H11 | Auth providers | After the credentials (4.4, 4.5): flip the hosted Apple and Google blocks, `config diff`, preview, push (3.6). Not before H9, so the sign-in hook and session changes are verified with email codes first. | 4.4, 4.5 |
| H11b | **Conditional: merge the failed-post UI** (`hold/failed-post-ui`, tip `ecb72be`) | Only after Nemat approves `docs/release/DESIGN-APPROVALS.md` section A (P1 to P9; A4 lists five build-time choices to look at). Not merged until then (design gate, `CLAUDE.md`). If approved: merge, re-run typecheck, lint and Jest (the branch reports 24 suites, 331 of 331 on `90eced7`, and says its test reads `design/proposals/failed-post-ux.html`, so update that path if the board file moves), and include it in the H12 build and device checks. It needs H2 and H3 on the server (it depends on the posting-submission and abandon work). If section A is not approved, H12 proceeds without it and Discard stays reachable only through Sign out anyway (BETA-READINESS 20.6). | Nemat approval |
| H12 | Founder build and device checks | A founder build from the reviewed commit **after H3 and H4** (and H11b if the failed-post UI is approved) (builds since `b7a02ad` send `p_submission` and fail visibly without the migration; the new startup check, sign-out cleanup and session handling come with this build; the server changes themselves work with the installed `ede68ed`, `SECURITY.md` 6.8). Device checks, in this order: (1) BETA-READINESS 19.5 step 8: lost answer then Retry, Discard while uploading online and offline, a second take while one waits, sign-out on each route, with the read-only ledger and submission checks after each. (2) `CAMERA-FLIP.md` "Physical-device test procedure": cases 1 to 19 and the file-integrity and Mux read-only checks on an iPhone (iOS 17+) and a mid-range Android (13+); pass bar is cases 1, 2, 5, 6, 10, 11, 17 and 19 on both phones plus the file checks. (3) Sessions (the claims of `SECURITY.md` L1 to L4): delete the account on phone A while signed in on phone B, then check that B is signed out and cannot cancel the deletion by opening the app, that a new sign-in restores everything, and that a signed-out phone's token is refused (`SESSION_GATE`). (4) Photos: replace a profile photo and check the old address stops working after about 10 minutes (H6 live). (5) Sign-out on a shared phone: the previous account stops receiving pushes (needs push credentials) and its recent searches are gone. | H3, H4, H6; push parts need H8 |
| H13 | Mux clean-up live | Only when `VIDEO-RELIABILITY.md` section 8 holds: C1, C2w, E1, E2 pass on hosted and C2a after H3; the H2/H3 rollout done or deferred knowingly; a continuous dry run of 3 to 7 days with every plan explained; a named person owns `select public.mux_cleanup_health();` daily; the Mux asset count reconciled by hand once; Nemat accepts the mechanics in BETA-READINESS section 15. Then `supabase secrets set MUX_CLEANUP_MODE=live` and `select public.mux_cleanup_set_mode('live', '<who>')`. **Gate 5 note:** before any outside tester clean-up must be live, or left in dry run with a recorded decision; until then a deleted or removed video stays playable at Mux by its playback id, and the privacy and deletion pages' video statements are not true. | Nemat |

## Part 2. Gates and blockers

| Item | State on 16 Oct | Waiting on | Owner |
| --- | --- | --- | --- |
| **Gate 1** video provider and camera library | Open. Mux and expo-camera provisional (iPhone evidence, founder iPhone upload 11 Oct). | 5.4 Android run; 1.4 B-1; Nemat's approval (0.6). | Nemat |
| **Gate 2** Nemat can sign up on iOS and Android | Open. Email sign-in works on the founder iPhone build and through the hosted Auth API. | 3.6, 4.2 to 4.5, 5.1 to 5.3. | Nemat |
| **Gate 5** safety complete | Open. | 1.5, 6.x, 7.3, 7.4, B-2, the decisions in 0.5. | Nemat |
| **Gate 7** closed beta opens in Canggu | Open. | Everything above, plus 7.7 and Nemat's decision. | Nemat |
| **B-1** camera flip during a take | Open. Built and integrated (Agent B); **not verified on a phone**. | The device procedure in `CAMERA-FLIP.md` on an iPhone and a mid-range Android (H12); Nemat closes it. | B, Nemat |
| **B-2** push credentials | Open. Code and database built; app-side gaps 1, 2 and 4 fixed in code (not run on a phone); `send-push` not deployed on hosted; no EAS project. | 4.1, 4.6, 4.7, H8, 5.6; receipts gap and `aps-environment` check remain (`NOTIFICATIONS.md`). | Nemat, Lead |
| **B-3** domain and app links | Open. Web function built and its app link routes exist; domain not bought. | 0.4, 3.7, 4.2. | Nemat |
| **B-4** store builds and listings | Open. Profiles exist; release config hardened (1.2). | 0.1, 0.3, 4.1 to 4.3, 4.9, 6.x, 5.1, 5.2, 7.x. | Nemat |

## Part 3. BETA-READINESS sections 1 to 9, row by row

Statuses are the document's own words from `docs/BETA-READINESS.md` as of `de3acbc`; the class and the next step are
this checklist's. "Step" points into Part 1.

### Section 1. Code remaining

| Item | Class | Owner | Step |
| --- | --- | --- | --- |
| B-1 camera flip | LOCAL-DONE (built), NEEDS-DEVICE | B | 1.4, H12 |
| B-3 app-link wiring in the app | NEEDS-PAID-ACCOUNT, NEEDS-FOUNDER (routes exist) | Lead | 0.4, 3.7 |
| Settings rows with no destination | NEEDS-FOUNDER | E | 6.3, 6.4 |
| Moderation web admin | NEEDS-HOSTED | D | 1.5 |
| Post refused while creating the row | NEEDS-FOUNDER (state and copy needed) | A, E | 0.5, then fix |
| Restricted on Retry | NEEDS-FOUNDER | A, E | same |
| Deleted reply stays in Me, Replies | NEEDS-DEVICE (small app fix, then check) | E | add to 1.6 |
| Duplicate upload URLs | LOCAL-DONE (fixed 13 Oct, tests 246/246); NEEDS-DEVICE | A | 3.1, 2.2 |
| iOS uploads in a background URLSession | LOCAL-DONE (foreground uploads, section 17); NEEDS-DEVICE | A | 2.2: go Home mid-upload, force-quit, see Retry and one upload |
| App icon | NEEDS-FOUNDER | Nemat | 0.1, 4.9 |

### Section 2. External credentials and accounts

| Item | Class | Owner | Step |
| --- | --- | --- | --- |
| Expo account and project id | NEEDS-CREDENTIALS | Nemat | 4.1 |
| Paid Apple developer team | NEEDS-PAID-ACCOUNT, LONG-LEAD | Nemat | 4.2 |
| Google Play developer account | NEEDS-PAID-ACCOUNT, LONG-LEAD | Nemat | 4.3 |
| APNs key and FCM service account | NEEDS-CREDENTIALS | Nemat | 4.6, 4.7, 3.5 |
| Google Sign-In credentials | NEEDS-CREDENTIALS | Nemat | 4.5 |
| Hosted Supabase project | NEEDS-HOSTED | Lead | 3.1, 3.3, 3.4, 3.5, 3.6 |
| Mux credentials for the hosted project | LOCAL-DONE on hosted (10 and 11 Oct); NEEDS-HOSTED for revocation | Nemat | 3.8 |
| Email provider | NEEDS-HOSTED | Nemat | 4.8 |

### Section 3. Real-device verification

| Phase | Class | Step |
| --- | --- | --- |
| 1 Video spike (Android open) | NEEDS-DEVICE | 5.4 |
| 2 Foundations | NEEDS-DEVICE, NEEDS-CREDENTIALS | 5.3, 5.7 |
| 3 Core loop | NEEDS-DEVICE | 2.2, 5.5, 5.7 |
| 4 Conversation | NEEDS-DEVICE, NEEDS-CREDENTIALS | 5.6 |
| 5 Safety | NEEDS-DEVICE | 7.4 |
| 6 Places and suggestions | NEEDS-DEVICE | 5.7 |
| 7 Beta readiness | NEEDS-DEVICE | 5.7 (A-Offline, offline Post, invite link from a message, timezone events) and 7.2 |

### Section 4. Policy and legal

| Item | Class | Step |
| --- | --- | --- |
| Community guidelines | NEEDS-FOUNDER; draft: LOCAL-DONE (`docs/policies/COMMUNITY-GUIDELINES.md`) | 6.1, 6.3, 6.4 |
| Privacy policy | NEEDS-FOUNDER; draft written | 6.1, 6.2 |
| Terms | NEEDS-FOUNDER; draft written | 6.1 |
| Data rules | NEEDS-FOUNDER (periods) ; the existing rules are written in `RETENTION-AND-RECOVERY.md` | 0.5(e), 1.8 |
| Store age ratings | NEEDS-FOUNDER, NEEDS-PAID-ACCOUNT | 6.5 |
| Help and feedback destination | NEEDS-FOUNDER; draft written | 6.6 |

### Section 5. Branding and store assets

| Item | Class | Step |
| --- | --- | --- |
| Product name and brand | NEEDS-FOUNDER | 0.1 |
| App icon | NEEDS-FOUNDER | 4.9 |
| Splash screen | NEEDS-FOUNDER (confirm or design) | 4.9 |
| Welcome collage and placeholder faces | NEEDS-FOUNDER | 4.9 |
| Store listing text and screenshots | NEEDS-FOUNDER | 6.5 |

### Section 6. Web and domain

| Item | Class | Step |
| --- | --- | --- |
| Domain | NEEDS-PAID-ACCOUNT, LONG-LEAD | 0.4 |
| Universal links and app links | NEEDS-PAID-ACCOUNT, NEEDS-HOSTED | 3.7 |
| Link previews | NEEDS-HOSTED, NEEDS-DEVICE | 3.4 then check in a messaging app |
| `EXPO_PUBLIC_WEB_BASE_URL` | NEEDS-HOSTED | 3.7 (documented in `.env.example`, LOCAL-DONE) |
| Web player on the hosted project | NEEDS-HOSTED | 3.4 |

### Section 7. Moderation operations

| Item | Class | Step |
| --- | --- | --- |
| Moderation web admin | NEEDS-HOSTED | 1.5 |
| Moderators and rota | NEEDS-FOUNDER | 0.5(g), 7.3 |
| Enforcement texts and the guidelines | NEEDS-FOUNDER | 6.1, 6.3 |
| Automated checks on uploads | NEEDS-FOUNDER | 0.5(b) |
| Waitlist admission and team invites | NEEDS-FOUNDER (define who admits and how the email goes) | 0.5, 7.3 |

### Section 8. Hosted project security

| Item | Class | Step |
| --- | --- | --- |
| Spike Mux functions removed | LOCAL-DONE (done 9 Oct on hosted) | none |
| Invocation logs 6 to 9 Oct unchecked | NEEDS-HOSTED | 3.9 |
| Spike token not revoked | NEEDS-HOSTED | 3.8 |

### Section 9. Hosted database

| Item | Class | Step |
| --- | --- | --- |
| Migrations applied (12 on 9 Oct; since then 5 more through `20261013000100`) | LOCAL-DONE on hosted | none |
| `20261013000200` and `20261013000300` not applied | NEEDS-HOSTED | 3.1 |
| Edge Functions, Vault, `send-push`, `web` not deployed | NEEDS-HOSTED | 3.4, 3.5 |
| Reference data (topics, other places, neighbours) | NEEDS-HOSTED | 3.3 |
| No backups or point-in-time recovery (9 Oct) | NEEDS-FOUNDER (a paid Supabase plan may be needed) | decide plan and state it in the policies (6.2) |

## Part 4. "Fail clearly on missing Supabase config": done

Closed by Agent C (`04197bc`, `docs/release/SECURITY.md` A1): `app/src/lib/supabase.ts` calls `configError()`, which throws
at startup for an empty URL or key, and outside `__DEV__` accepts only `https://<20-char ref>.supabase.co`; LAN `http`
still works in development; the `http://localhost` fallback is gone. Tested by Jest `supabaseConfig` (6 tests); not run
in a release build on a phone. The EAS side is separate and unchanged: `app.config.ts` refuses a preview or production
build with a bad URL or key before the binary exists.

## Part 5. Things found by this effort that were not on any list

1. `npm ci` was broken since 7 Oct for a reason unrelated to any change (peer dependencies; `BUILD.md`).
2. The EAS preview profile builds **ad hoc** on iOS: it cannot be sent to outside testers; TestFlight needs the
   `production` profile (`IOS.md` section 4).
3. `.env` never reaches EAS: before this effort the preview and production profiles would have built with no Supabase
   values at all (`BUILD.md` section 3).
4. Reviewers cannot sign in: invite-only, emailed codes. No plan exists (`IOS.md` section 7).
5. Apple requires an in-app privacy policy link and Play requires a web deletion path; neither has a board or a page.
6. Sign in with Apple's client secret expires within six months; Hide My Email addresses will not receive waitlist
   emails until the sending domain is registered with Apple.
7. Found 16 Oct, now fixed locally and not deployed or run on a phone: profile photo files were never deleted
   (`SECURITY.md` L5) and the app never removed the push token on sign-out (A2). Still open: `sent_at` on `push_outbox`
   means "accepted by Expo", receipts are never read (`NOTIFICATIONS.md`).
8. Opening a notification from a killed app, and the app routes for `/r`, `/p` and `/u`, had no code: built by Agent E (`978e053`) and the integration; not run on a phone.
9. `SPEC.md` disagrees with itself in three places after the 14 Oct §19 revision (`SPEC-SYNC.md` Part 1.3).
10. The shared web page loaded an unpinned script from a public CDN (now pinned with SRI, 1.10) and wrote the invite code into an inline script (reflected XSS, fixed by Agent C, `755694a`); both are in the `web` function that is **not redeployed** until H5.
11. Android: `SYSTEM_ALERT_WINDOW` and the legacy storage permissions are now blocked in `app.config.ts` (source-level check only; confirm the merged manifest on the first release build, `ANDROID.md` section 2). The dark-mode setting still has no effect without `expo-system-ui` (not added: dependency decision for Nemat).
