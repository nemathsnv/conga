# Decisions and gates

Gate decisions belong to Nemat. Claude Code records them here once they are made. The spec (`SPEC.md`) is locked, and changing a locked decision means changing the spec first.

| Date | Decision | By | Evidence |
|---|---|---|---|
| 2026-10-05 | v1 spec locked (rev 110); A1 Native canvas final (version 26, 86 boards) | Nemat | `SPEC.md`, `design/` |
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

## Gates (SPEC.md Section 23)

- [ ] **Gate 1:** video provider picked (Mux / Cloudflare Stream / Supabase Storage). Camera library picked (expo-camera / react-native-vision-camera).
- [ ] **Gate 2:** Nemat can sign up on iOS and Android.
- [ ] **Gate 5:** safety complete. Required before any outside tester.
- [ ] **Gate 7:** the closed beta opens in Canggu.

## Still open before the beta (not blocking coding)

- Store age ratings, privacy policy, terms, community guidelines and data rules.
