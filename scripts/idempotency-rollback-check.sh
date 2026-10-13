#!/usr/bin/env bash
# Rollback check for 20261013000200_post_idempotency.sql. LOCAL STACK ONLY.
#
#   scripts/idempotency-rollback-check.sh [stack folder]   (default: the repository; the folder whose
#                                                           supabase/config.toml names the stack)
#
# On a local stack with 20261013000200 applied:
#   1. a member posts with a submission (the row must survive the rollback);
#   2. applies supabase/rollback/20261013000200_post_idempotency.down.sql;
#   3. checks the four-argument functions are back, the five-argument ones, abandon_submission and
#      post_submissions are gone, and the row is still there;
#   4. runs the pgTAP files from before this migration (0001 to 0011);
#   5. applies the forward migration again and runs every pgTAP file, 0012 included.
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

# 2. Rollback.
psql_ -q < "$REPO/supabase/rollback/20261013000200_post_idempotency.down.sql"

# 3. Shape after rollback.
check "four-argument post_response, post_reply, post_draft are back" "select to_regprocedure('public.post_response(uuid, text, text, integer)') is not null and to_regprocedure('public.post_reply(uuid, text, text, integer)') is not null and to_regprocedure('public.post_draft(uuid, text, text, integer)') is not null"
check "the five-argument ones are gone" "select to_regprocedure('public.post_response(uuid, text, text, integer, uuid)') is null and to_regprocedure('public.post_reply(uuid, text, text, integer, uuid)') is null and to_regprocedure('public.post_draft(uuid, text, text, integer, uuid)') is null"
check "abandon_submission and the helpers are gone" "select to_regprocedure('public.abandon_submission(uuid)') is null and to_regprocedure('public.submission_replay(uuid, uuid, text, uuid, text, text, integer)') is null and to_regprocedure('public.record_submission(uuid, uuid, text, uuid, text, text, integer, uuid)') is null"
check "post_submissions is gone" "select to_regclass('public.post_submissions') is null"
check "members can post with four arguments again" "select has_function_privilege('authenticated', 'public.post_response(uuid, text, text, integer)', 'execute') and has_function_privilege('authenticated', 'public.post_reply(uuid, text, text, integer)', 'execute') and has_function_privilege('authenticated', 'public.post_draft(uuid, text, text, integer)', 'execute') and not has_function_privilege('anon', 'public.post_response(uuid, text, text, integer)', 'execute')"
check "the row posted with a submission is still there" "select exists (select 1 from public.responses where author_id = '$MEMBER' and prompt_id = '$PROMPT' and status = 'processing')"

# 4. The suite from before the migration.
TESTS="$(cd "$STACK" && ls supabase/tests/00{01,02,03,04,05,06,07,08,09,10,11}_*.sql)"
(cd "$STACK" && supabase test db $TESTS)

# 5. Forward again, then everything.
psql_ -q < "$REPO/supabase/migrations/20261013000200_post_idempotency.sql"
check "the forward migration applies again on top of the rollback" "select to_regprocedure('public.post_response(uuid, text, text, integer, uuid)') is not null and to_regclass('public.post_submissions') is not null"
(cd "$STACK" && supabase test db)

psql_ -q -c "delete from auth.users where id = '$MEMBER'; delete from public.prompts where id = '$PROMPT';"
echo "rollback check passed"
