# Decisions and gates

Gate decisions belong to Nemat. Claude Code records them here once they are made. The spec (`SPEC.md`) is locked, and changing a locked decision means changing the spec first.

| Date | Decision | By | Evidence |
|---|---|---|---|
| 2026-10-05 | v1 spec locked (rev 110); A1 Native canvas final (version 26, 86 boards) | Nemat | `SPEC.md`, `design/` |
| 2026-10-06 | Provisional implementation stack: Mux for video hosting and playback, expo-camera for recording. Selected on the phase 1 iPhone evidence and used to build phases 2 to 7. A technology selection for implementation, **not** a gate decision: Gate 1 stays open (see Gates). Does not settle SPEC.md Section 22's video hosting and camera library rows. Evidence (iPhone 17 Pro, iOS 27.0, mobile data): 4 rounds, 22 recordings, 21 uploads, 31 playbacks; median upload 9.9 s over the 19 mobile-data uploads; median Mux upload-to-playable 1.6 s (4.8 s for three 30 s clips); median cold first frame 4.5 s over 18 cold plays; no mid-transfer upload failures. Recorded on 9 Oct 2026. | Nemat | `spike/REPORT.md` Sections 2 and 9; `docs/PHASE-2-REPORT.md` Section 2 |
| 2026-10-06 | Camera flip must work while recording, not only before it. Clarifies SPEC.md Section 6 "camera flip" control. Needs a spec edit at the next revision. | Nemat | Said during the phase 1 spike; `spike/REPORT.md` |
| 2026-10-07 | Reply room order is oldest first for v1 ("x of N" counts in that order). Clarifies SPEC.md Section 7. | Nemat | Phase 4 review message |
| 2026-10-07 | Deleting your own top-level comment never removes or hides other people's replies: the parent becomes a deleted-parent (tombstone) row and the replies stay under it. "No undo after confirmation" stands. Clarifies SPEC.md Section 8. | Nemat | Phase 4 review message; board `LV-CommentDeleted` |
| 2026-10-07 | Tonight's prompt uses the phone's current IANA timezone, refreshed on launch and when the app returns to the foreground. Clarifies SPEC.md Section 15. | Nemat | Phase 4 review message |
| 2026-10-07 | `LV-CommentActions` (Report, Block on someone else's comment) ships in phase 5 with safety; no partial version before then. | Nemat | Phase 4 review message |
| 2026-10-07 | Second notification ask: after the first Not now, the arrival of the first reply or comment makes another ask due; N-Prime shows at the next safe foreground moment, not only when Activity is opened. Clarifies SPEC.md Section 15. | Nemat | Phase 4 review message |
| 2026-10-08 | `SF-Block` uses gender-neutral they/their copy ("They won't be able to see your responses, reply to you or follow you, and you won't see theirs. They won't be told."). | Nemat | Phase 5 review message |
| 2026-10-08 | `S-Invites` (members' invites) belongs to phase 7 closed-beta work. | Nemat | Phase 5 review message |
| 2026-10-08 | A small internal moderation web admin is required before the first outside tester; the CLI (`scripts/moderate.sh`) stays acceptable for development. Tracked as a Gate 5 item. | Nemat | Phase 5 review message |
| 2026-10-08 | Review outcome texts: "We reviewed your request. The decision stands." and "We reviewed your request and reversed the decision." | Nemat | Phase 5 review message |
| 2026-10-08 | Viewer-visible reply and comment counts may exclude content hidden from that viewer by a block or a report. | Nemat | Phase 5 review message |
| 2026-10-08 | Suspension is enforced server-side across every product API path; only the suspension notice, review request, account deletion and recovery, and sign-out remain. A standalone moderator "warn" action is unavailable: a warning is the removal notice (`A-Removed`), per the enforcement ladder. | Nemat | Phase 5 review message |
| 2026-10-08 | "Busy right now" (Discover) = prompts visible to the viewer, ranked by response count in the last 48 hours, then newest. Clarifies SPEC.md Section 4. | Nemat | Phase 6 review message |
| 2026-10-08 | Discover topic chips use the team-managed prompt topics and filter the browse / Busy section. Tonight's featured prompt stays featured regardless of the selected chip. "For you" means no topic filter. | Nemat | Phase 6 review message |
| 2026-10-08 | The plain-English decline-reason sentences (`decline_reason_text`) are accepted. The fixed reason categories of SPEC.md Section 12 stay locked; the copy stays neutral and actionable. | Nemat | Phase 6 review message |
| 2026-10-08 | First-response drafts reuse the normal approved response recorder; no separate draft-recording board. `PR-Draft` remains the distinct draft review state. | Nemat | Phase 6 review message |
| 2026-10-08 | Substring search is sufficient for the closed beta. No full-text ranking unless beta usage shows a real problem. | Nemat | Phase 6 review message |
| 2026-10-08 | Viewer-visible counts and thumbnails (place pages, Discover, search) continue to respect block and report visibility. | Nemat | Phase 6 review message |
| 2026-10-09 | Analytics stay first-party in Supabase (`analytics_events`) for the beta; no PostHog or Amplitude. The account-linked identifier (`accounts.analytics_id`) is pseudonymous, not anonymous, and is documented as such. Settles the Section 22 "Analytics" choice. | Nemat | Phase 7 review message |
| 2026-10-09 | Member invite model: an invite is reserved when a recipient signs in through the personal link or code. Until they create a profile, expiry or the inviter's cancellation releases the slot and they return to the beta access gate. Once they have created a profile, that invite cannot be cancelled. Clarifies SPEC.md Section 14. | Nemat | Phase 7 review message |
| 2026-10-09 | The app icon is not finalised until the product name and brand are approved. The Expo template icon is development-only and must not go to outside testers or the stores. | Nemat | Phase 7 review message |
| 2026-10-09 | Posting while already offline: no Upload failed state. The recording stays on the phone and waits for the connection while the app is open, then posts by itself. If the app closes first, the next launch shows the existing Retry state. No background queue survives app termination. Clarifies SPEC.md Section 19. | Nemat | Phase 7 review message |
| 2026-10-09 | Beta metrics: Response rate counts published primary responses (`video_published` with kind `response`, carrying `prompt_id`), not `record_completed`. Day-7 return counts only activity the person did in the app, never server-only events. Clarifies SPEC.md Section 21. | Nemat | Phase 7 review message |
| 2026-10-09 | Email provider for the closed beta: Resend (free plan) as Supabase Auth's SMTP sender for the six-digit sign-in codes. Settles the SPEC.md Section 22 "Email" row for the beta. The sending domain is not chosen yet and is not to be a domain of the provisional Conga brand. | Nemat | Auth preparation message, 9 Oct |
| 2026-10-09 | Email sign-in settings: six-digit codes, Confirm email on, 60 seconds between codes, one-hour expiry. Apple and Google stay disabled on the hosted project until their credentials are configured. | Nemat | Auth preparation message, 9 Oct |
| 2026-10-12 | Upload limits per account (security stage 2): anti-abuse limits on newly minted upload URLs, for responses, video replies and drafts alike: at most 10 in any rolling hour, 30 in any rolling 24 hours, and 3 unused URLs at a time. Not limits on how many videos or replies a person has (SPEC.md Section 6 "video replies are not limited" stands); publishing an existing draft mints no URL and costs no quota. Suspended, restricted (posting paused) and deleted accounts get no upload URL. Every upload is bound to the account it was minted for and can be used once, before it expires. No project-wide limit until the Mux plan and account-wide storage allowance are verified (`docs/BETA-READINESS.md` section 14). | Nemat | Stage 2 brief and the finalise-stage-2 brief, 12 Oct; `supabase/migrations/20261012000100_video_uploads.sql` |
| 2026-10-12 | Stage 2 refinements: re-recording must not exhaust the 3 unused URLs, so abandoned unused URLs are cancelled at Mux (only unclaimed ones that Mux reports waiting; the slot is freed only once Mux confirms) and still count towards the hour and the day. Silent Post failures are not acceptable: the X-Upload-Failed banner is reused with accurate lines for the hourly limit, the daily limit and no free upload slot (the wording is Claude's and awaits Nemat's approval); A-Restricted and LV-Suspended unchanged; no new screen. | Nemat | Finalise-stage-2 brief, 12 Oct; `docs/BETA-READINESS.md` section 14 |

## Gates (SPEC.md Section 23)

- [ ] **Gate 1:** video provider picked (Mux / Cloudflare Stream / Supabase Storage). Camera library picked (expo-camera / react-native-vision-camera).
  - Technology selected for implementation: **yes, provisionally.** Mux and expo-camera (6 Oct, above).
  - Gate formally approved by Nemat: **no.** Open until Nemat explicitly approves its closure.
  - Android verification: **still required.** The spike checklist on a real mid-range Android over Bali mobile data (SPEC.md Section 23, phase 1; `spike/REPORT.md` Section 8). Not run.
  - Related open item: B-1, camera flip during a take, which neither camera library does without segment stitching (`docs/BLOCKERS.md`).
- [ ] **Gate 2:** Nemat can sign up on iOS and Android.
- [ ] **Gate 5:** safety complete. Required before any outside tester.
- [ ] **Gate 7:** the closed beta opens in Canggu.

## Still open before the beta (not blocking coding)

- Store age ratings, privacy policy, terms, community guidelines and data rules.
