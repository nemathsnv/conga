# Conga: instructions for Claude Code

Conga is a global social video app. People respond to prompts with short videos and talk back with video replies. The closed beta is seeded in Canggu, Bali. Nemat is the founder and product owner.

## Sources of truth, in order

1. **`SPEC.md`**: the locked v1 product and build spec (rev 110, locked 5 Oct 2026). It is the only source of product behaviour.
2. **`design/`**: the 86 approved A1 Native boards (canvas version 26) and the 14 failed-post boards approved 16 Oct 2026 (100 in all).
   - `design/BOARDS.md` indexes them by row, with the canvas notes.
   - `design/boards/<ID>.jpg` are renders.
   - `design/html/<ID>.html` hold exact copy, colours and sizes.
3. Nothing else. Old code, old databases and your own assumptions are not sources.

If SPEC.md and a board or canvas note disagree, SPEC.md wins. Flag the mismatch to Nemat; don't fix it silently.

## Hard rules

- **The spec is locked.** Do not change, add or "improve" product behaviour, copy, limits or flows.
  - If something is missing, ambiguous or contradictory, stop and ask Nemat. Don't invent a rule. For example, no username-change frequency rule exists, so don't add one.
- **Design gate.** Build no user-facing screen or state that isn't an approved board.
  - Use the board's copy word for word.
  - If a screen you need has no board, stop and ask; it has to be designed first.
- **One phase at a time** (SPEC.md Section 23).
  - Work only on the current phase below.
  - Each gate needs Nemat's decision before the next phase starts.
  - Record every gate decision in `docs/DECISIONS.md`.
- **Non-goals stay out** (SPEC.md Section 2): no DMs, polls or votes, camera-roll upload, filters, background uploads, phone sign-in, web interaction, streaks or badges, ads or tracking SDKs.
- **Secrets** live in `.env` files, which are git-ignored. Never commit keys. Never ship a service-role or provider secret in the app bundle; mint upload URLs server-side.
- **Be honest about verification.** Say what you ran on a real device, what you ran on a simulator, and what you did not run. "It compiles" is not "it works".

## Fixed stack

Expo / React Native / TypeScript / Expo Router, and Supabase (Postgres, Auth, Storage, Edge Functions), starting from clean migrations.

- iOS and Android from one app, plus a minimal web player for shared links (phase 5).
- The open choices are listed in SPEC.md Section 22. The video provider and camera library are decided by the phase 1 spike evidence, not by preference. Mux and expo-camera are provisional until Gate 1 closes (see Current state).

## Words

- People **respond** to a prompt, and the video is a **response**.
- People **reply** to a response or to another reply, and that video is a **video reply**.
- A **comment** is text.
- Never use "answer" or "post" as a noun for these, in code identifiers, UI copy or docs.

## Current state (9 Oct 2026)

**Current work: beta readiness and real-device validation.** No new feature phase is authorized. Don't add features, screens or flows. Change app code only to fix a demonstrated setup or verification blocker, and say so.

- **Phase 1, video spike:** run on a real iPhone 17 Pro over mobile data (4 rounds, 22 recordings, 21 uploads, 31 playbacks; `spike/REPORT.md`). Android has not been run. `spike/` is throwaway code, not the app.
- **Phases 2 to 7:** implemented in `app/` and `supabase/`. None has been verified on a real device. What was seen on the iOS simulator is listed in each `docs/PHASE-*-REPORT.md`. Android has never run.
- **Provisional stack:** Mux (video hosting and playback) and expo-camera, selected on the iPhone spike evidence and used for implementation since phase 2. Provisional means Gate 1 is not passed and SPEC.md Section 22's video rows are not settled. Don't swap either without Nemat.
- **Outstanding:** Android video validation (the spike checklist on a real mid-range Android over Bali mobile data), and B-1, camera flip during a take (segment stitching; `docs/BLOCKERS.md`).
- **Gates 1, 2, 5 and 7 are open.** Only Nemat closes a gate, and it is recorded in `docs/DECISIONS.md`. Never mark a gate passed.
- **What is still open:** `docs/BETA-READINESS.md` (consolidated) and `docs/BLOCKERS.md` (B-1 to B-4).
- **Name:** "Conga" is the product name in code, copy and docs (Nemat, 17 Oct 2026; it replaces the earlier implementation name "Shortcut"). The public link domain is `conga.churntech.com`, the moderation admin `admin.conga.churntech.com`, the Cloudflare Pages project `conga-web`.
  - Some stable identifiers still say `shortcut` on purpose: the iOS bundle id and Android package `app.shortcut`, the URL scheme `shortcut://`, the app's on-device storage keys `shortcut.*`, the local Supabase `project_id` and its containers, and names inside deployed migrations. Don't rename them without the migration plan in `docs/release/CONGA-RENAME.md`.
  - Historical reports and results keep the name they were written with.

## Working style

- Small, reviewable commits with clear messages.
- Ask before adding a dependency that isn't needed for the current phase.
- Nemat wants direct, critical feedback. If a plan or decision looks weak, say so, explain why, and propose an alternative. Don't just comply.
