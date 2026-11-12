# H1 read-only hosted preflight: result (16 Oct 2026, 11:44 UTC)

Project `picvoavfxnajfjkqawju`. Run by the lead with `scripts/h1-preflight.sh` from the integration
worktree (linked with `supabase link`, local files only), under a permission rule Nemat added for
the read-only CLI commands. Evidence: `docs/release/h1-results-20261016T114442Z.txt` (committed;
ids, hashes, counts and secret names only). Nothing was written on the hosted project; every query
was a single SELECT, and the independent review of the package (same day) confirmed that none of
the functions it calls can write.

## Verdict

**H1 passes.** Every compared block matches the baseline. One expected value in the package was
wrong and was corrected after the first run (below); nothing on the hosted project differed from
what `docs/BETA-READINESS.md` records.

| Block | Check | Hosted | Baseline | Result |
|---|---|---|---|---|
| 1 | Applied migrations | 17, latest `20261013000100` | 17, `20261013000100` (after Test B2, 13 Oct) | PASS |
| 2 | Schema fingerprint | 759 objects, listing md5 `f4990575…` | 759, `f4990575…` (local 17-migration stack, 16 Oct) | PASS, line for line |
| 3 | Posting functions | four-argument `post_response` present; five-argument, `post_submissions`, abandon helpers absent | batch A not applied | PASS |
| 4 | `auth.sessions` privileges | `postgres` can SELECT and DELETE; `auth.users` SELECT | required by `20261016000202` | PASS |
| 4 | `pg_graphql` | absent | 0 | PASS |
| 4 | Avatar storage policies | the 4 named in `20261006000300_storage_avatars.sql` | 4 | PASS |
| 5 | Two primary responses on one prompt | none | none (required by `20261016000300`) | PASS |
| 6 | Clean-up mode, health | `off`, `ok`; failed 0, stuck 0, due 0; open jobs 0; purge failures 0 | `off`, `ok`, no open job | PASS |
| 6 | Cron jobs | the 8 jobs, schedules and `active` as recorded | 8 | PASS |
| 6 | Finished jobs | `done=3`, `skipped=1` | canary deletion (12 Oct), A1 revoke, A1 retention deletion skipped by the restore, B1 restore | PASS (read) |
| 7 | Founder response and ledger | `c9918f82…` `live`; `9726bb8f…` `claimed` | same since stage 2 | PASS |
| 7 | V | `live`, playback P2 `tu8ooWH2…`, asset `01IyQdSi…`, author T1 | end of Test B2 | PASS |
| 7 | T1 | active, `moderation_status` `active` | the column's default (`20261008000100_safety.sql`); CP0 recorded T1 as an ordinary member | PASS |
| 7 | Deleted accounts, deleted or removed videos | 0, 1 | 0, 1: the step 4B canary video reply `6f600f9e…`, deleted by its author 12 Oct 16:53:19 UTC | PASS (corrected, below) |
| 8 | Functions | `auth-signin-method` v10, `mux-webhook` v12, `mux-create-upload` v10, `mux-upload-status` v11, `mux-cleanup` v8; all `ACTIVE`, `verify_jwt` false; no `abandon-submission`, `web`, `avatar-cleanup`, `admin`, `send-push` | exactly the versions recorded after Test B2 (BETA-READINESS section 15: `auth-signin-method` v10, `mux-cleanup` v8, `mux-create-upload` v10, `mux-upload-status` v11, `mux-webhook` v12) | PASS (read) |
| 8 | Secrets | 11 names: `MUX_CLEANUP_KEY`, `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_WEBHOOK_SECRET` and the 7 platform names; no `MUX_CLEANUP_MODE`, `PUSH_SENDER_KEY`, `AVATAR_CLEANUP_KEY` | 11, no `MUX_CLEANUP_MODE` | PASS (read) |
| 8 | Migration list | 17 remote; 9 local-only: `20261013000200`, `…0300`, `20261016000200` to `…204`, `…300`, `…301`; none remote-only | | PASS (read) |
| 9 | HTML content type from a function | not applicable: `web` is not deployed (block 8) | | deferred to H5b |

## What the first run flagged, and why it was the package, not the project

The first run (11:42 UTC) failed one line: "0 deleted accounts, 0 removed or deleted videos", hosted
answered `0|1`. The one row is video reply `6f600f9e-3559-4911-9ebf-13d9d3df509d`, status
`deleted`, `deleted_at` 2026-10-12 16:53:19.16 UTC, which is the creation time of the first
clean-up job (`delete_asset`, `author_deleted`, finished 17:16 UTC): the stage 3 step 4B canary,
the first real Mux deletion, recorded in BETA-READINESS section 15. The package's "0 videos" came
from the stage 3 preflight of 12 Oct, taken before that canary; the Test B2 record never claimed
zero. The expectation was corrected to the canary and the run repeated at 11:44 UTC: all PASS. No
change on the hosted project between the two runs.

The function versions equal the post-B2 record exactly (the two secret changes around Test B2 had
already moved each function up two versions by then), so no function has been touched since 13
Oct. The preflight does not compare bundle hashes; `supabase functions list` does not print them
in this CLI version.

The first run's results file (11:42 UTC) was not kept: the script was corrected and re-run, and
only the 11:44 file is committed (force-added, since `.gitignore` excludes result files by
default). The first run's failing line read `0|1`; every other line of that run matched the 11:44
run. The jobs' creation and finish times quoted above come from a separate read-only query of
`mux_cleanup_jobs` made between the runs, not from the evidence file; BETA-READINESS section 15
records the same times to the second.

## What H1 establishes for the sequence

- H2 (batch A) can start on Nemat's go-ahead: 17 applied, the four-argument posting functions in
  place, nothing of batch A present. The package is `docs/release/H2-DEPLOY.md`.
- H4 (batch B) has its hard dependency satisfied: `postgres` can SELECT and DELETE `auth.sessions`,
  so `pre_request`'s session check and `delete_account` will work as built (and the fallback added
  on 16 Oct will not be needed).
- H4b (batch C) has a clean pre-check: no member holds two primary rows on one prompt.
- H5 and H8 are first deployments, not redeployments (`web` and `send-push` are absent); H5b's
  content-type question stays open until `web` is deployed.
- The clean-up switches are non-live (`off`, no `MUX_CLEANUP_MODE`), the queue is quiet, and the
  founder's and T1's content is exactly as recorded on 13 Oct.

## Not covered by H1

- Bundle hashes of the deployed functions (not printed by the CLI; the 13 Oct record is the last
  byte comparison).
- Mux itself (no Mux call was made; the next Mux read is part of the provider tests).
- Which header carries the client address, and whether the default domain serves HTML (both after
  their deployments: H9 and H5b).
