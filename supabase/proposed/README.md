# Proposed database changes (not deployed)

SQL prepared and tested on an isolated local stack, waiting for Nemat's approval. Nothing here is
applied by `supabase db reset`, `supabase db push` or the deploy scripts: only `../migrations/` is.

To adopt a file once approved: move it to `../migrations/` (keeping its timestamp, or giving it the
next one), move its `.down.sql` to `../rollback/`, and its test to `../tests/`. Then deploy as usual.

| File | What | Why |
| --- | --- | --- |
| `20261019000100_prompt_card_viewer_responded.sql` | `prompt_card` gains `viewer_responded` | The + sheet and Respond know the member already has their one primary response on a prompt, by the server's own rule (founder iPhone test, 19 Oct). The app reads the field when present and falls back to the member's own responses until then. |
