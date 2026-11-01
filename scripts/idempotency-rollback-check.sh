#!/usr/bin/env bash
# Rollback check for batch A (20261013000200_post_idempotency.sql, 20261013000300_safe_submission_abandon.sql)
# on a stack built from every migration. ISOLATED LOCAL STACK ONLY (never the founder's `shortcut`).
#
#   scripts/idempotency-rollback-check.sh <stack folder>   (the folder whose supabase/config.toml names
#                                                           the stack, e.g. full-local-verification.sh's)
#
# Batch A cannot be rolled back on its own any more: every later migration has to go first, newest
# first. The chain is every migration from 20261013000200 on, each undone by its
# supabase/rollback/<name>.down.sql (one transaction per step, with its schema_migrations row).
#
# On a stack with every migration in supabase/migrations applied:
#   0. records the migration set, the schema_migrations rows, the schema fingerprint
#      (scripts/schema-fingerprint.sql) and the row count of every public table;
#   1. incompatible data: a throwaway member responds twice to one prompt (allowed since
#      20261019000200, Nemat 19 Oct). The 20261019000200 rollback must refuse with
#      multiple_responses_exist naming that member and prompt, and change nothing (same migration
#      set, same fingerprint, both rows still there). That member and prompt are then removed;
#   2. a member posts with a submission (the row must survive the rollback), and an id is closed
#      with a tombstone;
#   3. rolls the chain back, newest first, then checks batch A's rollback shape: the four-argument
#      functions are back, abandon_submission, the helpers, the abandonment functions and
#      post_submissions are gone, the row is still there, and a build that sends p_submission
#      still posts (the five-argument versions the rollback keeps; there is no fallback in the app);
#   4. runs the pgTAP files from before batch A (0001 to 0011) as they were then: a throwaway copy
#      with the later migrations' test edits reversed (scripts/rollback-check/*.patch);
#   5. goes forward again, oldest first, with each migration's own file (dropping the five-argument
#      versions first, as a re-forward migration of 20261013000200 would), and checks the migration
#      set, the schema_migrations rows and the fingerprint match step 0;
#   6. removes its throwaway rows, runs every pgTAP file, and checks the row counts match step 0.
# The stack ends as it started. Exits non-zero, naming the step, on any failure.
#
# Everything it prints is also written to a log (ROLLBACK_CHECK_LOG, default a new file under
# $TMPDIR), whose path is printed first and last. On a failure, from whatever step it stopped in, it
# prints the failing pgTAP lines and the pg_cron runs during the check, re-applies (oldest first)
# every migration it had rolled back, removes its throwaway members and prompts, and compares the
# fingerprint and migration set with step 0 to say whether the stack is back.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
STACK="${1:?usage: $0 <stack folder>}"
STACK="$(cd "$STACK" && pwd)"
PROJECT="$(sed -n 's/^project_id = "\(.*\)"$/\1/p' "$STACK/supabase/config.toml" | head -1)"
case "$PROJECT" in
  shortcut-?*) ;;
  *) echo "refusing: project_id '$PROJECT' is not an isolated stack (shortcut-<id>); never the founder's stack" >&2; exit 1 ;;
esac
STATUS="$(cd "$STACK" && supabase status -o env 2>/dev/null)"
API_URL="$(sed -n 's/^API_URL="\(.*\)"$/\1/p' <<<"$STATUS")"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "refusing: API_URL '$API_URL' is not a local stack" >&2; exit 1 ;;
esac
DB="supabase_db_$PROJECT"
psql_() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }

LOG="${ROLLBACK_CHECK_LOG:-$(mktemp "${TMPDIR:-/tmp}/idempotency-rollback-check.XXXXXX")}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/idempotency-rollback-check-work.XXXXXX")"
OLD_TESTS="$STACK/supabase/rollback-check-tests"
exec > >(tee -a "$LOG") 2>&1
echo "log: $LOG"
STARTED="$(psql_ -c "select now()")"

# The chain: every migration from batch A on, oldest first. Each needs its rollback file.
CHAIN=""
for f in "$REPO"/supabase/migrations/*.sql; do
  b="$(basename "$f" .sql)"; v="${b%%_*}"
  if [[ "$v" > "20261013000199" ]]; then
    [ -f "$REPO/supabase/rollback/$b.down.sql" ] || { echo "FAIL  $b has no supabase/rollback/$b.down.sql; the chain cannot be rehearsed" >&2; exit 1; }
    CHAIN="$CHAIN $b"
  fi
done
CHAIN="${CHAIN# }"
REVERSED="$(tr ' ' '\n' <<<"$CHAIN" | sort -r | tr '\n' ' ')"; REVERSED="${REVERSED% }"

PHASE="start"   # the step in progress, for the failure message
ROLLED=""       # migrations rolled back and not yet re-applied, in rollback order (newest first)
FP0=""          # the fingerprint file from step 0; the restore is verified against it
MEMBER=""; MULTI=""; PROMPTS=""

migset() { psql_ -c "select coalesce(string_agg(version, ',' order by version), '') from supabase_migrations.schema_migrations"; }
migrows() { psql_ -c "select md5(coalesce(string_agg(row_to_json(m)::text, '|' order by version), '')) from supabase_migrations.schema_migrations m"; }
fingerprint() { { echo "begin read only;"; cat "$REPO/scripts/schema-fingerprint.sql"; echo "rollback;"; } | psql_ -q -f - > "$1"; }
rowcounts() {
  psql_ -c "select table_name || ' ' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
              from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1" > "$1"
}
same_as_start() { # prints what differs from step 0; returns 0 when nothing does
  local ok=0
  [ "$(migset)" = "$MIGSET0" ] || { echo "  migration set differs: $(migset)"; ok=1; }
  [ "$(migrows)" = "$MIGROWS0" ] || { echo "  schema_migrations rows differ"; ok=1; }
  fingerprint "$WORK/fp-now"
  diff "$FP0" "$WORK/fp-now" > "$WORK/fp-diff" || { echo "  schema fingerprint differs ($(grep -c '^[<>]' "$WORK/fp-diff") lines):"; sed 's/^/    /' "$WORK/fp-diff" | head -40; ok=1; }
  return "$ok"
}

# One rollback step, in one transaction with the removal of its schema_migrations row.
rollback_step() { # migration name
  local b="$1" v="${1%%_*}"
  { cat "$REPO/supabase/rollback/$b.down.sql"; echo; echo "delete from supabase_migrations.schema_migrations where version = '$v';"; } \
    | psql_ -q -1 -f - >/dev/null || return 1
  ROLLED="$ROLLED $b"; ROLLED="${ROLLED# }"
}
# One forward step, in one transaction with its saved schema_migrations row.
forward_step() { # migration name
  local b="$1" v="${1%%_*}"
  {
    # The rollback of 20261013000200 keeps five-argument versions with no default; the forward
    # migration's create or replace cannot change their defaults, so a re-forward drops them first.
    if [ "$v" = "20261013000200" ]; then
      echo "drop function if exists public.post_response(uuid, text, text, integer, uuid);"
      echo "drop function if exists public.post_reply(uuid, text, text, integer, uuid);"
      echo "drop function if exists public.post_draft(uuid, text, text, integer, uuid);"
    fi
    cat "$REPO/supabase/migrations/$b.sql"; echo
    cat "$WORK/row-$v.sql"
  } | psql_ -q -1 -f - >/dev/null || return 1
  ROLLED="$(tr ' ' '\n' <<<"$ROLLED" | { grep -vx "$b" || true; } | tr '\n' ' ')"; ROLLED="${ROLLED% }"
}
# Re-applies everything rolled back, oldest first.
forward_all() {
  local b
  for b in $(tr ' ' '\n' <<<"$ROLLED" | sort); do
    PHASE="forward $b"
    forward_step "$b" || { echo "FAIL  step '$PHASE': $b did not apply again on top of its rollback" >&2; return 1; }
  done
}
remove_throwaway() {
  local ids="" p
  for p in $MEMBER $MULTI; do ids="$ids${ids:+, }'$p'"; done
  # Removing an account queues cancel_upload jobs for its (fake) uploads; they go too.
  [ -n "$ids" ] && psql_ -q -c "delete from auth.users where id in ($ids); delete from public.mux_cleanup_jobs where owner_id in ($ids);" >/dev/null
  ids=""
  for p in $PROMPTS; do ids="$ids${ids:+, }'$p'"; done
  [ -n "$ids" ] && psql_ -q -c "delete from public.prompts where id in ($ids)" >/dev/null
  MEMBER=""; MULTI=""; PROMPTS=""
}

on_exit() {
  local code=$?
  trap - EXIT
  set +e
  if [ "$code" -ne 0 ]; then
    echo "== rollback check FAILED (exit $code) in step: $PHASE"
    grep -E "Failed test|^#  +(have|want|caught|wanted)|not ok|Dubious|Bad plan|ERROR|^FAIL" "$LOG"
    echo "-- pg_cron runs since the start ($STARTED):"
    psql_ -c "select j.jobname || ' ' || d.status || ' ' || to_char(d.start_time, 'HH24:MI:SS.MS') || ' ' || left(coalesce(d.return_message, ''), 120) from cron.job_run_details d join cron.job j using (jobid) where d.start_time >= '$STARTED' order by d.start_time"
    if [ -n "$ROLLED" ]; then
      echo "-- restoring: re-applying, oldest first: $(tr ' ' '\n' <<<"$ROLLED" | sort | tr '\n' ' ')"
      forward_all
    fi
  fi
  remove_throwaway 2>/dev/null || echo "could not remove the throwaway members and prompts"
  rm -rf "$OLD_TESTS"
  if [ "$code" -ne 0 ] && [ -n "$FP0" ]; then
    if [ -z "$ROLLED" ] && same_as_start; then
      echo "-- restored: same migration set, schema_migrations rows and schema fingerprint as at the start"
    else
      echo "-- NOT restored (still rolled back: ${ROLLED:-none}). This is an isolated stack: rebuild it with"
      echo "   (cd '$STACK' && supabase db reset)"
    fi
  fi
  rm -rf "$WORK"
  echo "log: $LOG"
  exit "$code"
}
trap on_exit EXIT
check() { # name, sql returning t
  if [ "$(psql_ -c "$2")" = "t" ]; then echo "PASS  $1"; else echo "FAIL  $1 (step: $PHASE)" >&2; exit 1; fi
}
new_prompt() { # label: a live prompt, its id in NEW (and in PROMPTS, for the clean-up)
  NEW="$(psql_ -c "insert into public.prompts (text, status, published_at) values ('rollback check $1', 'live', now()) returning id" | head -1)"
  PROMPTS="$PROMPTS $NEW"
}
new_member_sql() { # id: an adult member with a profile, past the disclosure
  cat <<SQL
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('$1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rollback-$1@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now() where id = '$1';
insert into public.profiles (id, name, username) values ('$1', 'Rollback Check', 'rb' || substr(replace('$1', '-', ''), 21, 12));
SQL
}
as_member() { # id: sql to start a transaction as that member
  echo "begin; select set_config('request.jwt.claims', json_build_object('sub', '$1', 'role', 'authenticated')::text, true); set local role authenticated;"
}

# 0. The starting point: every migration applied, and nothing else.
PHASE="0. starting point"
REPO_SET="$(for f in "$REPO"/supabase/migrations/*.sql; do b="$(basename "$f")"; echo "${b%%_*}"; done | sort | paste -sd, -)"
MIGSET0="$(migset)"
[ "$MIGSET0" = "$REPO_SET" ] || { echo "FAIL  the stack's migrations are not exactly supabase/migrations (stack: $MIGSET0)" >&2; exit 1; }
echo "PASS  all $(tr ',' '\n' <<<"$MIGSET0" | wc -l | tr -d ' ') migrations applied; chain: $CHAIN"
MIGROWS0="$(migrows)"
fingerprint "$WORK/fp0"; FP0="$WORK/fp0"
rowcounts "$WORK/rows0"
for b in $CHAIN; do
  v="${b%%_*}"
  psql_ -c "select format('insert into supabase_migrations.schema_migrations select * from json_populate_record(null::supabase_migrations.schema_migrations, %L);', row_to_json(m)::text) from supabase_migrations.schema_migrations m where version = '$v'" > "$WORK/row-$v.sql"
  [ -s "$WORK/row-$v.sql" ] || { echo "FAIL  no schema_migrations row for $v" >&2; exit 1; }
done
echo "PASS  recorded the start: $(wc -l < "$FP0" | tr -d ' ') fingerprint lines, $(wc -l < "$WORK/rows0" | tr -d ' ') tables"

# 1. Incompatible data: the 20261019000200 rollback must refuse and change nothing.
PHASE="1. refusal on several responses per prompt"
MULTI="0f0f0f0f-0000-4000-8001-$(printf '%012d' $((RANDOM * RANDOM)))"
new_prompt "multi $MULTI"; PROMPT_M="$NEW"
U="uprbm$(cut -c25-36 <<<"$MULTI")"
psql_ -q >/dev/null <<SQL
$(new_member_sql "$MULTI")
insert into public.video_uploads (account_id, upload_id, status) values ('$MULTI', '${U}a', 'active'), ('$MULTI', '${U}b', 'active');
$(as_member "$MULTI")
select public.post_response(p_prompt => '$PROMPT_M', p_upload_id => '${U}a', p_caption => null, p_duration_ms => 5000, p_submission => gen_random_uuid());
select public.post_response(p_prompt => '$PROMPT_M', p_upload_id => '${U}b', p_caption => null, p_duration_ms => 5000, p_submission => gen_random_uuid());
commit;
SQL
check "a member has two responses on one prompt (allowed since 20261019000200)" "select count(*) = 2 from public.responses where author_id = '$MULTI' and prompt_id = '$PROMPT_M' and kind = 'response'"
NEWEST="${REVERSED%% *}"
[ "$NEWEST" = "20261019000200_multiple_responses" ] || echo "note: the newest migration is $NEWEST; the refusal is checked on 20261019000200 after the newer ones are rolled back"
for b in $REVERSED; do # roll back anything newer than 20261019000200 first (none today)
  [ "$b" = "20261019000200_multiple_responses" ] && break
  PHASE="1. rollback $b"; rollback_step "$b" || { echo "FAIL  step '$PHASE': supabase/rollback/$b.down.sql errored" >&2; exit 1; }
done
PHASE="1. refusal on several responses per prompt"
if OUT="$({ cat "$REPO/supabase/rollback/20261019000200_multiple_responses.down.sql"; echo; echo "delete from supabase_migrations.schema_migrations where version = '20261019000200';"; } | psql_ -q -1 -f - 2>&1)"; then
  ROLLED="$ROLLED 20261019000200_multiple_responses"; ROLLED="${ROLLED# }"
  echo "FAIL  the 20261019000200 rollback applied although a member has two responses on one prompt" >&2; exit 1
fi
if grep -q "multiple_responses_exist: account $MULTI prompt $PROMPT_M rows" <<<"$OUT"; then
  echo "PASS  the 20261019000200 rollback refuses: $(grep -o 'multiple_responses_exist: account [^ ]* prompt [^ ]*' <<<"$OUT" | head -1)"
else
  echo "FAIL  the 20261019000200 rollback failed, but not with multiple_responses_exist for this member and prompt:" >&2; echo "$OUT" >&2; exit 1
fi
if [ -z "$ROLLED" ]; then
  if same_as_start; then echo "PASS  nothing changed: same migration set, schema_migrations rows and schema fingerprint"; else echo "FAIL  the refused rollback changed the stack" >&2; exit 1; fi
fi
check "both responses are still there" "select count(*) = 2 from public.responses where author_id = '$MULTI' and prompt_id = '$PROMPT_M' and kind = 'response'"
psql_ -q -c "delete from auth.users where id = '$MULTI'; delete from public.mux_cleanup_jobs where owner_id = '$MULTI'; delete from public.prompts where id = '$PROMPT_M';" >/dev/null
MULTI=""; PROMPTS="$(tr ' ' '\n' <<<"$PROMPTS" | { grep -vx "$PROMPT_M" || true; } | tr '\n' ' ')"
check "that member and prompt are removed; nobody has two responses on one prompt" "select not exists (select 1 from public.responses where kind = 'response' and status in ('processing', 'live', 'removed') group by author_id, prompt_id having count(*) > 1)"

# 2. A post made with a submission, as a throwaway member (removed at the end).
PHASE="2. batch A data"
MEMBER="0f0f0f0f-0000-4000-8000-$(printf '%012d' $((RANDOM * RANDOM)))"
new_prompt "$MEMBER"; PROMPT="$NEW"
U="uprb$(cut -c25-36 <<<"$MEMBER")"
psql_ -q >/dev/null <<SQL
$(new_member_sql "$MEMBER")
insert into public.video_uploads (account_id, upload_id, status) values ('$MEMBER', '$U', 'active');
$(as_member "$MEMBER")
select public.post_response('$PROMPT', '$U', null, 5000, '$MEMBER');
commit;
SQL
check "a post with a submission exists" "select exists (select 1 from public.post_submissions where id = '$MEMBER')"
TOMB="$(psql_ -c "select gen_random_uuid()" | head -1)"
psql_ -q -c "select public.begin_submission_abandon('$MEMBER', '$TOMB')" >/dev/null
check "a tombstone exists" "select exists (select 1 from public.post_submissions where id = '$TOMB' and kind is null)"

# 3. The rollback chain, newest first.
for b in $REVERSED; do
  case " $ROLLED " in *" $b "*) continue ;; esac
  PHASE="3. rollback $b"
  rollback_step "$b" || { echo "FAIL  step '$PHASE': supabase/rollback/$b.down.sql errored; that step changed nothing" >&2; exit 1; }
  echo "PASS  rolled back $b"
  case "$b" in
    20261019000200_*)
      check "one response per prompt is back (unique index over processing, live and removed)" "select indisunique and pg_get_expr(indpred, indrelid) like '%removed%' from pg_index where indexrelid = to_regclass('public.responses_one_per_prompt') and to_regclass('public.responses_author_prompt_idx') is null" ;;
    20261013000300_*)
      check "after the 20261013000300 rollback: the abandonment functions and columns are gone, the tombstone deleted, submissions whole again" "select to_regprocedure('public.begin_submission_abandon(uuid, uuid)') is null and to_regprocedure('public.finish_submission_abandon(uuid, uuid, text)') is null and not exists (select 1 from public.post_submissions where id = '$TOMB') and (select attnotnull from pg_attribute where attrelid = 'public.post_submissions'::regclass and attname = 'kind')" ;;
  esac
done
PHASE="3. shape after the rollback"
check "the stack holds exactly the migrations before batch A" "select (select max(version) from supabase_migrations.schema_migrations) = '20261013000100' and not exists (select 1 from supabase_migrations.schema_migrations where version >= '20261013000200')"
check "four-argument post_response, post_reply, post_draft are back" "select to_regprocedure('public.post_response(uuid, text, text, integer)') is not null and to_regprocedure('public.post_reply(uuid, text, text, integer)') is not null and to_regprocedure('public.post_draft(uuid, text, text, integer)') is not null"
check "five-argument versions stay for builds that send p_submission, with no default (no ambiguity)" "select to_regprocedure('public.post_response(uuid, text, text, integer, uuid)') is not null and to_regprocedure('public.post_reply(uuid, text, text, integer, uuid)') is not null and to_regprocedure('public.post_draft(uuid, text, text, integer, uuid)') is not null and (select pronargdefaults from pg_proc where oid = 'public.post_response(uuid, text, text, integer, uuid)'::regprocedure) = 0 and has_function_privilege('authenticated', 'public.post_response(uuid, text, text, integer, uuid)', 'execute') and not has_function_privilege('anon', 'public.post_response(uuid, text, text, integer, uuid)', 'execute')"
check "abandon_submission and the helpers are gone" "select to_regprocedure('public.abandon_submission(uuid)') is null and to_regprocedure('public.submission_replay(uuid, uuid, text, uuid, text, text, integer)') is null and to_regprocedure('public.record_submission(uuid, uuid, text, uuid, text, text, integer, uuid)') is null"
check "post_submissions is gone" "select to_regclass('public.post_submissions') is null"
check "members can post with four arguments again" "select has_function_privilege('authenticated', 'public.post_response(uuid, text, text, integer)', 'execute') and has_function_privilege('authenticated', 'public.post_reply(uuid, text, text, integer)', 'execute') and has_function_privilege('authenticated', 'public.post_draft(uuid, text, text, integer)', 'execute') and not has_function_privilege('anon', 'public.post_response(uuid, text, text, integer)', 'execute')"
check "the row posted with a submission is still there" "select exists (select 1 from public.responses where author_id = '$MEMBER' and prompt_id = '$PROMPT' and status = 'processing')"
# A new build (p_submission sent) and an old one (four arguments), both after the rollback.
new_prompt "2 $MEMBER"; PROMPT2="$NEW"
new_prompt "3 $MEMBER"; PROMPT3="$NEW"
psql_ -q >/dev/null <<SQL
insert into public.video_uploads (account_id, upload_id, status) values ('$MEMBER', 'uprbnew' || substr(replace('$MEMBER', '-', ''), 21, 12), 'active'), ('$MEMBER', 'uprbold' || substr(replace('$MEMBER', '-', ''), 21, 12), 'active');
$(as_member "$MEMBER")
select public.post_response(p_prompt => '$PROMPT2', p_upload_id => 'uprbnew' || substr(replace('$MEMBER', '-', ''), 21, 12), p_caption => null, p_duration_ms => 5000, p_submission => gen_random_uuid());
select public.post_response(p_prompt => '$PROMPT3', p_upload_id => 'uprbold' || substr(replace('$MEMBER', '-', ''), 21, 12), p_caption => null, p_duration_ms => 5000);
commit;
SQL
check "after the rollback, a build sending p_submission and an older build both post" "select count(*) = 2 from public.responses where author_id = '$MEMBER' and prompt_id in ('$PROMPT2', '$PROMPT3')"

# 4. The suite from before batch A, as it was then: the later migrations' edits to these files reversed.
PHASE="4. pgTAP 0001-0011 as before batch A"
rm -rf "$OLD_TESTS"; mkdir -p "$OLD_TESTS"
cp "$STACK"/supabase/tests/00{01,02,03,04,05,06,07,08,09,10,11}_*.sql "$OLD_TESTS/"
for p in $(ls "$REPO"/scripts/rollback-check/tests-before-*.patch | sort -r); do
  patch -s -p3 -d "$OLD_TESTS" < "$p" || { echo "FAIL  $(basename "$p") does not apply to the current supabase/tests" >&2; exit 1; }
done
(cd "$STACK" && supabase test db supabase/rollback-check-tests/*.sql)
rm -rf "$OLD_TESTS"

# 5. Forward again, oldest first, each migration's own file.
forward_all
PHASE="5. forward state"
if same_as_start; then echo "PASS  every migration applies again: same migration set, schema_migrations rows and schema fingerprint as at the start"; else echo "FAIL  going forward again did not restore the starting schema" >&2; exit 1; fi
check "the row posted with a submission is still there" "select exists (select 1 from public.responses where author_id = '$MEMBER' and prompt_id = '$PROMPT' and status = 'processing')"

# 6. Without the throwaway rows: every pgTAP file, then the row counts.
PHASE="6. full pgTAP suite"
remove_throwaway
(cd "$STACK" && supabase test db)
PHASE="6. row counts"
rowcounts "$WORK/rows1"
if diff "$WORK/rows0" "$WORK/rows1" > "$WORK/rows-diff"; then echo "PASS  every public table has the row count it started with"; else echo "FAIL  row counts differ from the start:" >&2; cat "$WORK/rows-diff" >&2; exit 1; fi
PHASE="done"
echo "rollback check passed"
