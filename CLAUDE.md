# Shortcut: instructions for Claude Code

Shortcut is a global social video app. People respond to prompts with short videos and talk back with video replies. The closed beta is seeded in Canggu, Bali. Nemat is the founder and product owner.

## Sources of truth, in order

1. **`SPEC.md`**: the locked v1 product and build spec (rev 110, locked 5 Oct 2026). It is the only source of product behaviour.
2. **`design/`**: the 86 approved A1 Native boards (canvas version 26).
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
- The open choices are listed in SPEC.md Section 22. The video provider and camera library are decided by the phase 1 spike, not by preference.

## Words

- People **respond** to a prompt, and the video is a **response**.
- People **reply** to a response or to another reply, and that video is a **video reply**.
- A **comment** is text.
- Never use "answer" or "post" as a noun for these, in code identifiers, UI copy or docs.

## Current phase

**Phase 1: video spike.** Not started. The prompt is in `prompts/PHASE-1-video-spike.md`.

- The spike is throwaway code in `spike/`. It is not the app.
- Do not scaffold the product app, database schema or any product screens until Nemat has picked the video provider (gate 1) and asked for phase 2.

## Working style

- Small, reviewable commits with clear messages.
- Ask before adding a dependency that isn't needed for the current phase.
- Nemat wants direct, critical feedback. If a plan or decision looks weak, say so, explain why, and propose an alternative. Don't just comply.
