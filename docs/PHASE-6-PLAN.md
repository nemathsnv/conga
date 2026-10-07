# Phase 6 plan: places and suggestions

Branch `phase-6-places`, from `phase-5-safety` at `13a32ba`. Phases 2 to 5 are implemented and
awaiting device verification; Gate 5 is open (`docs/BLOCKERS.md`). Nothing here closes a gate.

## 1. Scope (SPEC.md Section 23, item 6)

> Places and suggestions: places, place pages, cohort auto-follow, Discover and search.
> Prompt suggestions with review, Your suggestions, first-response drafts.

Spec sections: 3 (Discover, Places, Prompts rows; Search results boards), 4 (Discover tab, pin
labels, search), 5 (prompt model), 10 (scope), 11 (places), 12 (suggestion and review), 15 (place
prompt pushes, suggestion reviewed), 16 (a published draft is a first public video), 18 (drafts are
deleted with the account), 20 (`X-Search`), 21 (events). Out of scope and not touched: `S-Invites`
and members' invites (phase 7, Nemat's decision of 8 Oct), store builds, analytics.

## 2. Boards

| Board | What |
| --- | --- |
| `R-Discover` | The Discover tab: search field, topic chips, tonight's prompt card, "Busy right now". |
| `SR-Recent`, `SR-Results`, `SR-People`, `SR-None` | Search: one grouped list (Places, Prompts, People), recent searches on this phone, places not open yet without Follow, "Suggest a prompt" when nothing matches. |
| `P-Places`, `P-Unfollow`, `P-Place` | Settings → Places (search, Following with the fixed Global row, Suggested from places you follow, the privacy line), unfollow confirmation, the place page from any pin label. |
| `C-Plus` (updated), `C-Write`, `C-Scope`, `C-Preview`, `C-Submitted`, `C-Pending`, `C-Live`, `C-Draft`, `PR-Draft` | Suggest a prompt (120 characters, Global or a followed place, preview with "Show my name on this prompt", submit), Your suggestions (in review: Edit / Withdraw / draft; live; not published with the reason and rewrite), the outcome screens, the private first-response draft and its review variant. |

Pin labels on Home, the player, the + sheet and Activity ("Canggu · New prompt") open `P-Place`.

## 3. Backend (migration `20261009000100_places_suggestions.sql`)

- **Places**: `places` gains region line, type, image, `open`, neighbour suggestions
  (`place_neighbours`, team-kept); `place_follows` (private: RLS read-own, never in any card);
  `follow_place` / `unfollow_place` / `places_screen` / `place_page`; cohort auto-follow on invite
  redemption and waitlist admission (`beta_cohorts.place_id`), and once for existing beta accounts.
- **Feeds**: `home_feed` and `open_prompts` include prompts from followed places next to global
  ones; `following_feed` unchanged; the player and Activity already carry the place.
- **Discover**: `discover()` (tonight's prompt, busy prompts by recent responses, topic chips from
  `topics`), `search(q)` (Postgres full-text and prefix on places, prompts, people; every place
  including ones not open yet; people hidden by blocks excluded); recent searches stay on the phone.
- **Suggestions**: `suggestions` (text ≤ 120, scope, attribution, status in_review / withdrawn /
  live / not_published, decline reason from the fixed list, the live prompt id), at most 3 in review
  per member, `suggest_prompt`, `edit_suggestion`, `withdraw_suggestion`, `my_suggestions`;
  `prompts.suggested_by` for "Suggested by …" when attribution is on; moderator functions
  `mod_approve_suggestion` (with or without attribution) and `mod_decline_suggestion(reason)`, the
  suggestion review queue, every action logged; Activity and push "Your prompt is live in Canggu" /
  "not published" with the reason; `remove_attribution` as the existing moderator action.
- **Drafts**: a private first response recorded while in review: `responses.status = 'draft'`
  tied to the suggestion, visible to its author only, never counted, never in any feed or card;
  `publish_draft` (goes through the disclosure and the restriction checks like any first video),
  `discard_draft`; deleted with the account (cascade).
- **Restriction** also blocks suggesting (SPEC.md Section 17).
- pgTAP for all of it.

## 4. App

Discover tab (replaces the placeholder), search screen, `settings/places`, `place/[id]`,
suggest flow (`suggest/write`, `scope`, `preview`, `submitted`), `suggestions` (Your suggestions),
`C-Live` and `C-Draft` over Home, `PR-Draft` as a variant of the review screen with "Save draft",
the + sheet's suggest row and "Your suggestions · N in review", pin labels everywhere a prompt card
shows a place.

## 5. Checks

pgTAP, Jest for pure pieces (search query normalisation, 120-character rule, the three-in-review
rule messages), typecheck, lint, iOS simulator with the seed.

## 6. Open questions for Nemat (not decided here)

1. **"Busy right now"** has no definition in the spec: the build uses the most responses in the
   last 48 hours across global and followed-place prompts.
2. **Topic chips** on Discover (Food, Work, Surf…) come from the team's `topics` table; a chip
   filters Busy right now by topic. The spec does not say what a chip does.
3. **Decline reasons** are the fixed list from Section 12; the person-facing wording of each is not
   in the spec and is written plainly in the build (flagged in the report).
