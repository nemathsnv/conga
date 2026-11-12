#!/usr/bin/env bash
# Rollback rehearsal for 20261101000100_forget_video_revokes_playback.sql alone, on an ISOLATED local
# stack with every migration applied (never the founder's `shortcut`). Preflight of 2 Nov.
#
#   scripts/revocation-rollback-check.sh <stack folder> [<fingerprint out>]
#
#   0. the fingerprint (scripts/schema-fingerprint.sql) of the 30 migrations, saved to <fingerprint
#      out> if given (the expected file for the hosted `revoke` check); it differs from
#      cu-expected-29-migrations.fp in exactly one line, mux_forget_video;
#   1. a throwaway member deletes a live video: a revocation and a deletion are queued;
#   2. the rollback file, with the removal of its schema_migrations row, in one transaction;
#   3. the fingerprint equals cu-expected-29-migrations.fp (what the hosted project holds today), and
#      every clean-up job is unchanged: the queued revocation stays pending and will still run;
#   4. after the rollback a deletion queues only the asset deletion again (the old behaviour);
#   5. the migration again, with its schema_migrations row: the fingerprint equals step 0's, the
#      schema_migrations rows equal step 0's;
#   6. removes its throwaway rows; the row count of every public table equals step 0's.
# Exits non-zero, naming the step, on any failure; on a failure after step 2 it re-applies the
# migration so the stack ends as it started.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
STACK="${1:?usage: $0 <stack folder> [<fingerprint out>]}"
FP_OUT="${2:-}"
PROJECT="$(sed -n 's/^project_id = "\(.*\)"$/\1/p' "$STACK/supabase/config.toml" | head -1)"
[ -n "$PROJECT" ] && [ "$PROJECT" != "shortcut" ] || { echo "refusing: not an isolated stack ($PROJECT)" >&2; exit 2; }
DB="supabase_db_$PROJECT"
M=20261101000100_forget_video_revokes_playback
V=20261101000100
WORK="$(mktemp -d)"
psql_() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At "$@"; }
fingerprint() { { echo "begin read only;"; cat "$REPO/scripts/schema-fingerprint.sql"; echo "rollback;"; } | psql_ -q -f - | grep '|' | sort > "$1"; }
migrows() { psql_ -c "select md5(coalesce(string_agg(row_to_json(m)::text, '|' order by version), '')) from supabase_migrations.schema_migrations m"; }
jobs_hash() { psql_ -c "select count(*) || ':' || md5(coalesce(string_agg(row_to_json(j)::text, '|' order by id), '')) from public.mux_cleanup_jobs j"; }
rowcounts() { psql_ -c "select string_agg(format('%s:%s', c.relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text), ',' order by c.relname) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'"; }
check() { if [ "$(psql_ -c "$2")" = "t" ]; then echo "PASS  $1"; else echo "FAIL  $1" >&2; exit 1; fi; }
ROLLED=no
restore() {
  if [ "$ROLLED" = yes ]; then
    { cat "$REPO/supabase/migrations/$M.sql"; echo; cat "$WORK/row.sql"; } | psql_ -q -1 -f - >/dev/null && echo "restored: $M applied again" >&2
  fi
  psql_ -q -c "delete from public.mux_cleanup_jobs where owner_id in (select id from public.accounts where id::text like '0f0f0f0f-0000-4000-9101-%'); delete from public.responses where author_id::text like '0f0f0f0f-0000-4000-9101-%'; delete from auth.users where id::text like '0f0f0f0f-0000-4000-9101-%'; delete from public.prompts where text like 'Revocation rollback check %';" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap 'restore' EXIT

# 0.
check "all migrations applied, $V the newest" "select max(version) = '$V' from supabase_migrations.schema_migrations"
fingerprint "$WORK/fp30"
[ -n "$FP_OUT" ] && cp "$WORK/fp30" "$FP_OUT"
MIGROWS0="$(migrows)"
ROWS0="$(rowcounts)"
psql_ -c "select format('insert into supabase_migrations.schema_migrations select * from json_populate_record(null::supabase_migrations.schema_migrations, %L);', row_to_json(m)::text) from supabase_migrations.schema_migrations m where version = '$V'" > "$WORK/row.sql"
diff <(sort "$REPO/docs/release/cu-expected-29-migrations.fp") "$WORK/fp30" > "$WORK/fp-diff" || true
changed="$(grep '^[<>]' "$WORK/fp-diff" | cut -d'|' -f1,2 | sed 's/^[<>] //' | sort -u)"
[ "$changed" = "function|mux_forget_video(uuid,text,text,uuid,text)" ] && [ "$(grep -c '^[<>]' "$WORK/fp-diff")" = 2 ] \
  && echo "PASS  30 migrations differ from the hosted 29 in one fingerprint line: mux_forget_video" \
  || { echo "FAIL  fingerprint difference from 29 is not just mux_forget_video:" >&2; cat "$WORK/fp-diff" >&2; exit 1; }

# 1.
U=0f0f0f0f-0000-4000-9101-$(printf '%012d' $$)
P="$(psql_ -c "insert into public.prompts (text, status, published_at) values ('Revocation rollback check $U', 'live', now()) returning id" | head -1)"
psql_ -q >/dev/null <<SQL
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('$U', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rb-$U@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now() where id = '$U';
insert into public.profiles (id, name, username) values ('$U', 'Rollback Check', 'rb' || substr(replace('$U', '-', ''), 21, 12));
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('$U', '$P', '$U', 9000, 'live', 'upRbA', 'asRbA', 'pbRbA', now()),
  (gen_random_uuid(), '$P', '$U', 9000, 'live', 'upRbB', 'asRbB', 'pbRbB', now());
select set_config('request.jwt.claims', json_build_object('sub', '$U', 'role', 'authenticated', 'iat', extract(epoch from now())::bigint,
  'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint + 1)))::text, false);
set role authenticated;
select public.delete_video('$U');
reset role;
SQL
check "before the rollback a deletion queues the revocation and the deletion" "select count(*) filter (where action = 'sync_playback' and status = 'pending') = 1 and count(*) filter (where action = 'delete_asset') = 1 from public.mux_cleanup_jobs where asset_id = 'asRbA'"
JOBS1="$(jobs_hash)"

# 2.
{ cat "$REPO/supabase/rollback/$M.down.sql"; echo; echo "delete from supabase_migrations.schema_migrations where version = '$V';"; } | psql_ -q -1 -f - >/dev/null \
  || { echo "FAIL  step 2: the rollback file errored (one transaction: nothing changed)" >&2; exit 1; }
ROLLED=yes
echo "PASS  rolled back $M"

# 3.
fingerprint "$WORK/fp29"
if diff <(sort "$REPO/docs/release/cu-expected-29-migrations.fp") "$WORK/fp29" >/dev/null; then echo "PASS  the fingerprint equals cu-expected-29-migrations.fp (the hosted state today) line for line"; else echo "FAIL  after the rollback the fingerprint differs from the 29-migration one" >&2; exit 1; fi
[ "$(jobs_hash)" = "$JOBS1" ] && echo "PASS  no clean-up job changed: the queued revocation stays pending and will still run" || { echo "FAIL  the rollback changed clean-up jobs" >&2; exit 1; }

# 4.
psql_ -q >/dev/null <<SQL
select set_config('request.jwt.claims', json_build_object('sub', '$U', 'role', 'authenticated', 'iat', extract(epoch from now())::bigint,
  'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint + 1)))::text, false);
set role authenticated;
select public.delete_video((select id from public.responses where mux_asset_id = 'asRbB'));
reset role;
SQL
check "after the rollback a deletion queues only the asset deletion again (the old behaviour)" "select count(*) filter (where action = 'sync_playback') = 0 and count(*) filter (where action = 'delete_asset') = 1 from public.mux_cleanup_jobs where asset_id = 'asRbB'"

# 5.
{ cat "$REPO/supabase/migrations/$M.sql"; echo; cat "$WORK/row.sql"; } | psql_ -q -1 -f - >/dev/null || { echo "FAIL  step 5: the migration did not apply again" >&2; exit 1; }
ROLLED=no
fingerprint "$WORK/fp30b"
diff "$WORK/fp30" "$WORK/fp30b" >/dev/null && echo "PASS  forward again: the fingerprint equals step 0's" || { echo "FAIL  forward again: the fingerprint differs from step 0" >&2; exit 1; }
[ "$(migrows)" = "$MIGROWS0" ] && echo "PASS  schema_migrations rows equal step 0's" || { echo "FAIL  schema_migrations rows differ" >&2; exit 1; }

# 6.
trap - EXIT
restore
[ "$(rowcounts)" = "$ROWS0" ] && echo "PASS  every public table has the row count it started with" || { echo "FAIL  row counts differ from the start" >&2; exit 1; }
echo "revocation rollback check passed"
