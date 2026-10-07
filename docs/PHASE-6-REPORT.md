# Phase 6 report: places and suggestions

Branch `phase-6-places` (from `phase-5-safety` at `13a32ba`). Status: **implemented, awaiting
device verification**. No gate is claimed. Gate 5 stays open (`docs/BLOCKERS.md`), and phases 2 to
5 are still awaiting device verification. `S-Invites` and the other closed-beta work stay in phase
7 (Nemat, 8 Oct).

## 1. Scope (SPEC.md Section 23, item 6)

Places, place pages, cohort auto-follow, Discover and search; prompt suggestions with review, Your
suggestions, first-response drafts. The plan is `docs/PHASE-6-PLAN.md`.

## 2. What was built

- **Places** (`P-Places` from Settings, `P-Unfollow`, `P-Place` from every pin label): following
  is private (own rows only, never in a card or on a profile); the beta cohort's place is followed
  at admission ("from your beta invite"); the fixed Global row; neighbour suggestions from the
  places you follow; places not open yet are listed without Follow ("Places open as the beta
  grows."). Pin labels on Home, in the player, the + sheet and Activity open the place page.
- **Feeds**: Home and the + sheet carry prompts from followed places next to global ones; a place
  prompt shows the pin label; the place page lists only that place's prompts.
- **Discover** (`R-Discover`): search field, topic chips (For you + the team's topics), tonight's
  prompt with hours left and the latest thumbnails, "Busy right now" (most responses in the last
  48 hours across what the person can see; a chip filters it by topic).
- **Search** (`SR-Recent`, `SR-Results`, `SR-People`, `SR-None`): one grouped list (Places,
  People, Prompts) from the first character; recent searches stay on the phone (8 kept); nothing
  found offers "Suggest a prompt".
- **Suggest a prompt** (`C-Plus` updated, `C-Write`, `C-Scope`, `C-Preview`, `C-Submitted`): 120
  characters, Global or a followed place, "Show my name on this prompt" (on by default), at most
  3 in review, refused while restricted or suspended like any posting. From `C-Submitted` the
  person can record the first response as a private draft.
- **Your suggestions** (`C-Pending`): in review (Edit, Withdraw, the saved draft), live (faces and
  the count, opens the player), not published (the reason in plain words, Rewrite and resend,
  which edits and resends the same suggestion).
- **Review outcomes**: Activity rows and pushes "Your prompt is live in Uluwatu" (opens `C-Live`,
  or `C-Draft` when a draft is waiting) and "Your prompt wasn't published" with the reason (opens
  Your suggestions). Followers of a place get "New prompt in Uluwatu, a place you follow" with
  Respond.
- **Drafts** (`PR-Draft`, `C-Draft`): the review screen for a draft says "Save draft" and "Saved
  privately. When your prompt goes live, you choose whether to publish it."; the posting banner
  says "Saving your draft"; a draft waits for its Mux asset only (it is never live on its own).
  `C-Draft` plays the draft, Publish response (through the disclosure if it was never acknowledged,
  then into the player), Re-record, Delete draft. A draft is never published automatically.
- **Moderation**: `scripts/moderate.sh suggestions | approve <id> [keep-name] | decline <id>
  <reason>` over `mod_suggestions_queue`, `mod_approve_suggestion`, `mod_decline_suggestion`,
  logged like every other action.

## 3. Migration

`20261009000100_places_suggestions.sql` (committed in `b134f0e`): `place_neighbours`,
`place_follows` (RLS read-own), `beta_cohorts.place_id` and the auto-follow trigger,
`follow_place` / `unfollow_place` / `places_screen` / `place_page`, `prompt_in_feed`, `home_feed` and
`open_prompts` by scope, `discover`, `search`, `suggestions` with `decline_reason_text`,
`responses.status = 'draft'` with `suggestion_id` and a nullable `prompt_id`, `suggest_prompt`,
`edit_suggestion`, `withdraw_suggestion`, `my_suggestions`, `get_suggestion`, `post_draft`,
`publish_draft`, `discard_draft`, the moderator functions, `team_create_prompt` notifying place
followers, Activity kinds `suggestion_live` / `suggestion_declined` / `place_prompt`, push texts,
explicit grants.

## 4. Boards

Built: `R-Discover`, `SR-Recent`, `SR-Results`, `SR-People`, `SR-None`, `P-Places`, `P-Unfollow`,
`P-Place`, `C-Plus` (the two suggestion rows), `C-Write`, `C-Scope`, `C-Preview`, `C-Submitted`,
`C-Pending`, `C-Live`, `C-Draft`, `PR-Draft`. Not built: `S-Invites` (phase 7).

## 5. Checks

| Check | Result |
| --- | --- |
| pgTAP (`supabase test db`) | 334/334 (places and suggestions 60) |
| `npm run typecheck`, `npm run lint` | clean |
| Jest | 49/49 |
| iOS simulator build (iPhone 17) | runs with the seed; flows below |

**Seen on the simulator** (iPhone 17, local stack, as the seeded person Adam, 7 Oct 2026):
`R-Discover` with tonight's prompt, chips and Busy right now; search results for a typed letter
(places with Following / Follow / Not open yet, a person, prompts); Follow on Uluwatu from the
result, then `P-Place` for Uluwatu with its prompt and the "Global prompts … are in your Home
feed" line; `P-Places` with Canggu "from your beta invite", Uluwatu, Global prompts, Seminyak
suggested; the + sheet with the Canggu place prompts, "Suggest a prompt · Reviewed before anyone
sees it" and "Your suggestions · 1 in review"; `C-Write` with the counter; `C-Scope` with Global
and the two followed places; `C-Preview` with "Uluwatu · Suggested by Adam Novak" and the toggle;
Submit for review, then `C-Submitted`; "Record the first response" opening the recorder with the
suggestion's text; `C-Pending` with in review (Edit, Withdraw), a second in review, and the seeded
not-published one with its reason and Rewrite and resend; after `scripts/moderate.sh approve` and
`decline too_similar`, the two Activity rows and `C-Live` from the live row ("Your prompt is live in
Uluwatu", Be the first to respond, Share prompt); a team prompt in Uluwatu arriving as "New prompt
in Uluwatu, a place you follow" with Respond; `C-Draft` for a draft seeded straight into the
database (the simulator has no camera) with the video, Publish response, Re-record, Delete draft;
Publish response opening the player on the now-live prompt with the response counted.

Found and fixed on the way: "sent Just now ago" on `C-Pending` (now "sent just now", shared with
the Home empty state's "New prompt · 15m ago"); a stray leading space on Activity rows without a
name.

**Not verified**: recording and uploading a draft end to end (no camera on the simulator; the
`post_draft` path and the wait for the Mux asset are covered by pgTAP and typecheck only); the
header "Next" buttons on `C-Write` and `C-Scope` could not be tapped on the simulator because the
Expo dev-menu floating button sits over them (Cancel and every other control respond; the steps
were reached by deep link with the draft kept in memory); the pin label on Home and in the player
opening `P-Place` (no seeded place prompt has a response, so none reaches the Home feed; the label
is the same component as the + sheet's); `P-Unfollow`; `SR-None`'s suggest link;
pushes for the three new kinds (B-2); anything on a phone; Android.

## 6. Deviations and open questions for Nemat

1. **"Busy right now"** has no definition in the spec. Built as: the prompts the person can see,
   ordered by responses in the last 48 hours, then newest; a topic chip filters it by the prompt's
   topic. Confirm or define it.
2. **Topic chips** come from the team-kept `topics` table (food, work, surf, fitness, nights in
   the seed). The spec names no topics and does not say what a chip does beyond filtering.
3. **Decline reasons** are the fixed list from Section 12 (singles out a person or group, too
   similar, promotion, private details, unclear, other). The person-facing sentences are written
   plainly in `decline_reason_text`, for example "Not published because it is too similar to a
   prompt that is already live. You can rewrite it and send it again." Confirm the wording.
4. **The recorder for a draft** reuses the ordinary record screen (the suggestion's text in the
   prompt card, "Responding · up to 30 seconds"); only the review step (`PR-Draft`) is a board.
   Say if the record step needs its own treatment.
5. **Search** matches by substring (ILIKE) on place names, prompt text, names and usernames; the
   plan said full-text and prefix. Substring is simpler and covers the beta's data size; say if
   ranking matters before the beta.
6. **Place prompts and Discover** show counts and thumbnails the viewer can see (blocks and
   reports applied), consistent with the 8 Oct decision on counts.
