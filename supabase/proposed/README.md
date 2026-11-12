# Proposed database changes (not deployed)

SQL prepared and tested on an isolated local stack, waiting for Nemat's approval. Nothing here is
applied by `supabase db reset`, `supabase db push` or the deploy scripts: only `../migrations/` is.

To adopt a file once approved: move it to `../migrations/` (keeping its timestamp, or giving it the
next one), move its `.down.sql` to `../rollback/`, and its test to `../tests/`. Then deploy as usual.

Nothing is proposed at the moment.

Withdrawn (19 Oct 2026): `20261019000100_prompt_card_viewer_responded.sql` (`prompt_card.viewer_responded`,
"the member already holds their one primary response"). It was never deployed. Several responses
per prompt (`../migrations/20261019000200_multiple_responses.sql`) removed the rule it reported; the
+ sheet's "Respond again" label reads the member's own responses instead. The files are in Git
history (commit 4b67636).
