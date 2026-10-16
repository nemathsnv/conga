# Release checklist: from 16 Oct 2026 to the first outside tester

One ordered list. It covers Gates 1, 2, 5 and 7, blockers B-1 to B-4 (`docs/BLOCKERS.md`), every item in
`docs/BETA-READINESS.md` sections 1 to 9, and the open items of sections 14 to 20 that sit on the path to a tester.
Nothing is marked done unless the check that closes it has been run; "built locally" is not "verified on a device".
**Only Nemat closes a gate** (`CLAUDE.md`); this list says what each gate waits for, it never marks one passed.
Written 16 Oct 2026 by the release-engineering role (Agent F) from the repository at `de3acbc` plus this effort's
commits.

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
| 1.3 | Fail clearly on missing Supabase config | NEEDS-FOUNDER (approve a small app change) | C | See Part 4: `supabase.ts` must throw on an empty URL or key instead of building a client for `http://localhost`. | silent localhost fallback |
| 1.4 | B-1 camera flip during a take | NEEDS-DEVICE | B | Segment recorder plus local stitching module (iOS AVFoundation, Android Media3); upload stitches. Device check: record, flip twice, stop, review and live response play one clip with sound across the joins, on an iPhone and an Android phone. | B-1 (after device) |
| 1.5 | Moderation web admin | NEEDS-HOSTED (deploy), NEEDS-DEVICE (use) | D | Build the internal admin over `mod_*`; a moderator handles a report, a review request and a suggestion without the CLI (BETA-READINESS section 7). Required before the first outside tester (Nemat 8 Oct). | Gate 5 item |
| 1.6 | Failed-post UI P1 to P9 | NEEDS-FOUNDER (approval), then build | E | After 0.5(a): build the approved boards and the design-gate items; SPEC.md §19 already describes them. | BETA-READINESS 20.6 |
| 1.7 | Video reliability list | NEEDS-HOSTED, NEEDS-DEVICE | A | `mux-cleanup` `errored` handling, reliability list, E1/E2/C1 procedures (sections 14 to 19). | section 12 open list |
| 1.8 | Account-lifecycle gaps found by F | NEEDS-FOUNDER (decide), then fix | C | (a) Profile photo files are never deleted (replacement or purge). (b) The app never calls `remove_push_token` on sign-out. (c) Decide retention for the "No rule" rows in `RETENTION-AND-RECOVERY.md`. (d) Web request path for account deletion. | policy truth |
| 1.9 | App-link and push-open gaps found by F | NEEDS-DEVICE | B or C | (a) Routes for `/r/{id}`, `/p/{id}`, `/u/{name}`, and a decision for universal links (only `app/i/[code]` exists). (b) Cold-start notification tap (`getLastNotificationResponseAsync`). (c) Android notification channel before the permission request on Android 13+. (d) Fix once, with a device test. | B-2, B-3 checks |
| 1.10 | Pin the web player script | NEEDS-HOSTED (change locally, redeploy `web`) | A or D | `supabase/functions/web` loads `hls.js@1` from jsDelivr unpinned and without an integrity hash. Pin a version with SRI, or self-host. | privacy and supply chain |
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
| 3.1 | Posting-idempotency rollout | NEEDS-HOSTED, NEEDS-FOUNDER | A, Lead | BETA-READINESS 19.5 steps 2 to 5: read-only preflight, `db push` of `20261013000200` and `20261013000300`, deploy `abandon-submission`, read-only checks. The installed `ede68ed` keeps posting; a build with submission ids needs these. | section 16 to 19 |
| 3.2 | Mux deletion worker policy | NEEDS-FOUNDER, NEEDS-HOSTED | A | Decide when `mux-cleanup` goes live (DECISIONS 12 Oct: "no Mux deletion runs until the worker is configured and explicitly switched to live"). The privacy and deletion pages are not true until it is. | policy checks 1 |
| 3.3 | Reference data on the hosted project | NEEDS-HOSTED | Lead | Topics, the other places, place neighbours exist only in `supabase/seed.sql` (never applied to hosted). Choose what the beta needs and apply it as a reviewed one-off, not by running the seed. | section 2 hosted row |
| 3.4 | Deploy `web` | NEEDS-HOSTED | Lead | `supabase functions deploy web --project-ref picvoavfxnajfjkqawju` (by name only) with secrets `STORE_URL`, `WAITLIST_URL` (store URLs do not exist yet; see 6.4). Check `/r`, `/p`, `/i`, `/u` render and `noindex`. | section 6 row |
| 3.5 | Push sender on hosted | NEEDS-HOSTED, NEEDS-CREDENTIALS | Lead | `NOTIFICATIONS.md` section 4 step 4: Vault secrets, `PUSH_SENDER_KEY`, `supabase functions deploy send-push --no-verify-jwt`. Harmless until tokens exist; do it with 4.7. | B-2 |
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

## Part 2. Gates and blockers

| Item | State on 16 Oct | Waiting on | Owner |
| --- | --- | --- | --- |
| **Gate 1** video provider and camera library | Open. Mux and expo-camera provisional (iPhone evidence, founder iPhone upload 11 Oct). | 5.4 Android run; 1.4 B-1; Nemat's approval (0.6). | Nemat |
| **Gate 2** Nemat can sign up on iOS and Android | Open. Email sign-in works on the founder iPhone build and through the hosted Auth API. | 3.6, 4.2 to 4.5, 5.1 to 5.3. | Nemat |
| **Gate 5** safety complete | Open. | 1.5, 6.x, 7.3, 7.4, B-2, the decisions in 0.5. | Nemat |
| **Gate 7** closed beta opens in Canggu | Open. | Everything above, plus 7.7 and Nemat's decision. | Nemat |
| **B-1** camera flip during a take | Open, in progress (Agent B). | 1.4 including the device check on both platforms. | B |
| **B-2** push credentials | Open. Code and database built; `send-push` not deployed on hosted; no EAS project. | 4.1, 4.6, 4.7, 3.5, 5.6; gaps in 1.9. | Nemat, Lead |
| **B-3** domain and app links | Open. Web function built; domain not bought. | 0.4, 3.7, 1.9(a), 4.2. | Nemat |
| **B-4** store builds and listings | Open. Profiles exist; release config hardened (1.2). | 0.1, 0.3, 4.1 to 4.3, 4.9, 6.x, 5.1, 5.2, 7.x. | Nemat |

## Part 3. BETA-READINESS sections 1 to 9, row by row

Statuses are the document's own words from `docs/BETA-READINESS.md` as of `de3acbc`; the class and the next step are
this checklist's. "Step" points into Part 1.

### Section 1. Code remaining

| Item | Class | Owner | Step |
| --- | --- | --- | --- |
| B-1 camera flip | NEEDS-DEVICE | B | 1.4 |
| B-3 app-link wiring in the app | NEEDS-PAID-ACCOUNT, NEEDS-FOUNDER | Lead | 0.4, 3.7 (routes: 1.9a) |
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

## Part 4. The exact change for "fail clearly on missing Supabase config" (Agent C, `app/src`)

Today `app/src/lib/env.ts` defines `missingConfig()` but nothing calls it, and `app/src/lib/supabase.ts` does

```ts
export const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_ANON_KEY || 'anon', { ... });
```

so a build with an empty `EXPO_PUBLIC_SUPABASE_URL` starts normally and every request fails later against
`http://localhost`. Proposed change, near the top of `supabase.ts`, after the existing founder check:

```ts
const configError = missingConfig();
if (configError) throw new Error(configError);                 // empty URL or key: fail at startup, not on the first request
if (!__DEV__ && !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(SUPABASE_URL)) {
  throw new Error('Release build: EXPO_PUBLIC_SUPABASE_URL must be the hosted https://<ref>.supabase.co URL.');
}
```

and `createClient(SUPABASE_URL, SUPABASE_ANON_KEY, ...)` without the fallbacks. Notes: `missingConfig()` already exists with
the right message; the thrown error appears as the standard red screen in development and a startup crash in a release
build, which is the intended "fail clearly" (a friendlier screen would need a board). Jest imports of `supabase.ts`
need the two variables set in `jest.setup.js`. The EAS side is already covered: `app.config.ts` refuses a preview or
production build with a bad URL or key before the binary exists.

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
7. Profile photo files are never deleted; the app never removes the push token on sign-out; `sent_at` on
   `push_outbox` means "accepted by Expo", receipts are never read (`NOTIFICATIONS.md`).
8. Opening a notification from a killed app, and shared links to `/r` and `/p`, are probably broken (no code for them).
9. `SPEC.md` disagrees with itself in three places after the 14 Oct §19 revision (`SPEC-SYNC.md` Part 1.3).
10. The shared web page loads an unpinned script from a public CDN.
11. Android: `SYSTEM_ALERT_WINDOW` and legacy storage permissions ship in a release build by default; the dark-mode
    setting has no effect without `expo-system-ui` (not added: dependency decision for Nemat).
