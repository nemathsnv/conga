#!/usr/bin/env bash
# Rollback check for 20261013000300_safe_submission_abandon.sql and 20261013000200_post_idempotency.sql.
# LOCAL STACK ONLY.
#
#   scripts/idempotency-rollback-check.sh [stack folder]   (default: the repository; the folder whose
#                                                           supabase/config.toml names the stack)
#
# On a local stack with both applied:
#   1. a member posts with a submission (the row must survive the rollback), and an id is closed
#      with a tombstone;
#   2. applies the 20261013000300 rollback, then the 20261013000200 rollback;
#   3. checks the four-argument functions are back, abandon_submission, the helpers, the
#      abandonment functions and post_submissions are gone, the row is still there, and a build
#      that sends p_submission still posts (the five-argument versions the rollback keeps; there is
#      no fallback in the app);
#   4. runs the pgTAP files from before these migrations (0001 to 0011);
#   5. drops those five-argument versions (as the re-forward migration would), applies both
#      migrations again and runs every pgTAP file, 0012 and 0013 included.
# The stack ends as it started (forward migration applied). Exits non-zero on any failure.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
STACK="${1:-$REPO}"
STATUS="$(cd "$STACK" && supabase status -o env 2>/dev/null)"
API_URL="$(sed -n 's/^API_URL="\(.*\)"$/\1/p' <<<"$STATUS")"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "refusing: API_URL '$API_URL' is not a local stack" >&2; exit 1 ;;
esac
PROJECT="$(sed -n 's/^project_id = "\(.*\)"$/\1/p' "$STACK/supabase/config.toml" | head -1)"
DB="supabase_db_$PROJECT"
psql_() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
check() { # name, sql returning t
  if [ "$(psql_ -c "$2")" = "t" ]; then echo "PASS  $1"; else echo "FAIL  $1" >&2; exit 1; fi
}

check "the forward migration is applied" "select to_regprocedure('public.post_response(uuid, text, text, integer, uuid)') is not null"

# 1. A post made with a submission, as a throwaway member (removed at the end).
MEMBER="0f0f0f0f-0000-4000-8000-$(printf '%012d' $((RANDOM * RANDOM)))"
PROMPT="$(psql_ -c "insert into public.prompts (text, status, published_at) values ('rollback check $MEMBER', 'live', now()) returning id" | head -1)"
psql_ -q >/dev/null <<SQL
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('$MEMBER', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rollback-$MEMBER@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now() where id = '$MEMBER';
insert into public.profiles (id, name, username) values ('$MEMBER', 'Rollback Check', 'rb' || substr(replace('$MEMBER', '-', ''), 21, 12));
insert into public.video_uploads (account_id, upload_id, status) values ('$MEMBER', 'uprb' || substr(replace('$MEMBER', '-', ''), 21, 12), 'active');
begin;
select set_config('request.jwt.claims', json_build_object('sub', '$MEMBER', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.post_response('$PROMPT', 'uprb' || substr(replace('$MEMBER', '-', ''), 21, 12), null, 5000, '$MEMBER');
commit;
SQL
check "a post with a submission exists" "select exists (select 1 from public.post_submissions where id = '$MEMBER')"
TOMB="$(psql_ -c "select gen_random_uuid()" | head -1)"
psql_ -q -c "select public.begin_submission_abandon('$MEMBER', '$TOMB')" >/dev/null
check "a tombstone exists" "select exists (select 1 from public.post_submissions where id = '$TOMB' and kind is null)"

# 2. Rollback, newest first.
psql_ -q < "$REPO/supabase/rollback/20261013000300_safe_submission_abandon.down.sql"
check "after the first rollback: the abandonment functions and columns are gone, the tombstone deleted, submissions whole again" "select to_regprocedure('public.begin_submission_abandon(uuid, uuid)') is null and to_regprocedure('public.finish_submission_abandon(uuid, uuid, text)') is null and not exists (select 1 from public.post_submissions where id = '$TOMB') and (select attnotnull from pg_attribute where attrelid = 'public.post_submissions'::regclass and attname = 'kind')"
psql_ -q < "$REPO/supabase/rollback/20261013000200_post_idempotency.down.sql"

# 3. Shape after rollback.
check "four-argument post_response, post_reply, post_draft are back" "select to_regprocedure('public.post_response(uuid, text, text, integer)') is not null and to_regprocedure('public.post_reply(uuid, text, text, integer)') is not null and to_regprocedure('public.post_draft(uuid, text, text, integer)') is not null"
check "five-argument versions stay for builds that send p_submission, with no default (no ambiguity)" "select to_regprocedure('public.post_response(uuid, text, text, integer, uuid)') is not null and to_regprocedure('public.post_reply(uuid, text, text, integer, uuid)') is not null and to_regprocedure('public.post_draft(uuid, text, text, integer, uuid)') is not null and (select pronargdefaults from pg_proc where oid = 'public.post_response(uuid, text, text, integer, uuid)'::regprocedure) = 0 and has_function_privilege('authenticated', 'public.post_response(uuid, text, text, integer, uuid)', 'execute') and not has_function_privilege('anon', 'public.post_response(uuid, text, text, integer, uuid)', 'execute')"
check "abandon_submission and the helpers are gone" "select to_regprocedure('public.abandon_submission(uuid)') is null and to_regprocedure('public.submission_replay(uuid, uuid, text, uuid, text, text, integer)') is null and to_regprocedure('public.record_submission(uuid, uuid, text, uuid, text, text, integer, uuid)') is null"
check "post_submissions is gone" "select to_regclass('public.post_submissions') is null"
check "members can post with four arguments again" "select has_function_privilege('authenticated', 'public.post_response(uuid, text, text, integer)', 'execute') and has_function_privilege('authenticated', 'public.post_reply(uuid, text, text, integer)', 'execute') and has_function_privilege('authenticated', 'public.post_draft(uuid, text, text, integer)', 'execute') and not has_function_privilege('anon', 'public.post_response(uuid, text, text, integer)', 'execute')"
check "the row posted with a submission is still there" "select exists (select 1 from public.responses where author_id = '$MEMBER' and prompt_id = '$PROMPT' and status = 'processing')"
# A new build (p_submission sent) and an old one (four arguments), both after the rollback.
PROMPT2="$(psql_ -c "insert into public.prompts (text, status, published_at) values ('rollback check 2 $MEMBER', 'live', now()) returning id" | head -1)"
PROMPT3="$(psql_ -c "insert into public.prompts (text, status, published_at) values ('rollback check 3 $MEMBER', 'live', now()) returning id" | head -1)"
psql_ -q >/dev/null <<SQL
insert into public.video_uploads (account_id, upload_id, status) values ('$MEMBER', 'uprbnew' || substr(replace('$MEMBER', '-', ''), 21, 12), 'active'), ('$MEMBER', 'uprbold' || substr(replace('$MEMBER', '-', ''), 21, 12), 'active');
begin;
select set_config('request.jwt.claims', json_build_object('sub', '$MEMBER', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.post_response(p_prompt => '$PROMPT2', p_upload_id => 'uprbnew' || substr(replace('$MEMBER', '-', ''), 21, 12), p_caption => null, p_duration_ms => 5000, p_submission => gen_random_uuid());
select public.post_response(p_prompt => '$PROMPT3', p_upload_id => 'uprbold' || substr(replace('$MEMBER', '-', ''), 21, 12), p_caption => null, p_duration_ms => 5000);
commit;
SQL
check "after the rollback, a build sending p_submission and an older build both post" "select count(*) = 2 from public.responses where author_id = '$MEMBER' and prompt_id in ('$PROMPT2', '$PROMPT3')"

# 4. The suite from before the migration.
TESTS="$(cd "$STACK" && ls supabase/tests/00{01,02,03,04,05,06,07,08,09,10,11}_*.sql)"
(cd "$STACK" && supabase test db $TESTS)

# 5. Forward again (a re-forward migration would drop the five-argument versions first), then everything.
psql_ -q -c "drop function public.post_response(uuid, text, text, integer, uuid); drop function public.post_reply(uuid, text, text, integer, uuid); drop function public.post_draft(uuid, text, text, integer, uuid);"
psql_ -q < "$REPO/supabase/migrations/20261013000200_post_idempotency.sql"
psql_ -q < "$REPO/supabase/migrations/20261013000300_safe_submission_abandon.sql"
check "both migrations apply again on top of the rollback" "select to_regprocedure('public.post_response(uuid, text, text, integer, uuid)') is not null and to_regclass('public.post_submissions') is not null and to_regprocedure('public.begin_submission_abandon(uuid, uuid)') is not null and to_regprocedure('public.post_response(uuid, text, text, integer)') is null"
(cd "$STACK" && supabase test db)

psql_ -q -c "delete from auth.users where id = '$MEMBER'; delete from public.prompts where id in ('$PROMPT', '$PROMPT2', '$PROMPT3');"
echo "rollback check passed"
