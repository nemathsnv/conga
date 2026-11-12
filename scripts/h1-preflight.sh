#!/usr/bin/env bash
# H1: the read-only hosted preflight of docs/release/H1-PREFLIGHT.md as one command.
#
#   scripts/h1-preflight.sh               hosted project (the folder must be linked: supabase link)
#   scripts/h1-preflight.sh --local DIR   a local stack folder, for testing the script itself
#
# Every query is one SELECT (the CLI runs one statement per call). Nothing is written anywhere except the
# results file, docs/release/h1-results-<UTC timestamp>.txt, which contains no key, token, email
# or password (secrets are listed by name only). Compare: each block prints PASS, FAIL or CHECK
# (a value a person has to read) next to its expected value.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
MODE="linked"; STACK=""
if [ "${1:-}" = "--local" ]; then MODE="local"; STACK="${2:?stack folder}"; fi
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
cd "$REPO"
if [ "$MODE" = "linked" ] && [ ! -s supabase/.temp/project-ref ]; then
  echo "not linked: run 'supabase link --project-ref picvoavfxnajfjkqawju' in $REPO first (it writes local files only)" >&2; exit 2
fi
OUT="$REPO/docs/release/h1-results-$STAMP.txt"
FAILED=0

q() { # one read-only SELECT whose single column is named v; prints one line per row
  local sql="$1" out
  if [ "$MODE" = "local" ]; then
    out="$(cd "$STACK" && supabase db query --local "$sql" 2>/dev/null)"
  else
    out="$(supabase db query --linked "$sql" 2>/dev/null)"
  fi
  printf '%s' "$out" | python3 -c '
import json, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print("ERROR " + raw[:300].replace("\n", " ")); sys.exit(0)
rows = d["rows"] if isinstance(d, dict) and "rows" in d else (d if isinstance(d, list) else None)
if rows is None:
    print("ERROR " + json.dumps(d)[:300])
else:
    for r in rows:
        v = r.get("v") if isinstance(r, dict) else r
        print("" if v is None else v)
'
}
say() { echo "$1" | tee -a "$OUT"; }
verdict() { # name, expected, got
  if [ "$2" = "$3" ]; then say "PASS  $1: $3"; else say "FAIL  $1: got [$3] expected [$2]"; FAILED=1; fi
}

say "# H1 preflight, $STAMP, mode $MODE"
say "# project: $( [ "$MODE" = local ] && echo "$STACK" || cat supabase/.temp/project-ref 2>/dev/null || echo linked )"

# 1. migrations
r="$(q "select count(*) || '|' || max(version) as v from supabase_migrations.schema_migrations" | tail -1)"
verdict "1 migrations (count|latest)" "17|20261013000100" "$r"
say "1 migrations list: $(q "select string_agg(version, ',' order by version) as v from supabase_migrations.schema_migrations" | tail -1)"

# 2. fingerprint
BODY="$(sed -n '/^with objects(kind, name, def) as (/,/^)$/p' "$REPO/scripts/schema-fingerprint.sql")"
r="$(q "$BODY select count(*) || '|' || md5(string_agg(kind || '|' || name || '|' || md5(coalesce(def, '')), E'\\n' order by kind, name)) as v from objects" | tail -1)"
verdict "2 fingerprint (objects|md5)" "759|f4990575c686f379fa6bec9c70e37e16" "$r"
if [ "$r" != "759|f4990575c686f379fa6bec9c70e37e16" ]; then
  LIST="$REPO/docs/release/h1-hosted-fingerprint-$STAMP.fp"
  q "$BODY select kind || '|' || name || '|' || md5(coalesce(def, '')) as v from objects order by kind, name" | grep '|' > "$LIST"
  say "2 full listing saved to $LIST; differences against docs/release/h1-expected-17-migrations.fp:"
  diff "$REPO/docs/release/h1-expected-17-migrations.fp" "$LIST" | tee -a "$OUT" | head -80
fi

# 3. posting functions
r="$(q "select (to_regprocedure('public.post_response(uuid, text, text, integer)') is not null) || '|' || (to_regprocedure('public.post_response(uuid, text, text, integer, uuid)') is not null) || '|' || (to_regclass('public.post_submissions') is not null) || '|' || (to_regprocedure('public.begin_submission_abandon(uuid, uuid)') is not null) as v" | tail -1)"
verdict "3 four_arg|five_arg|post_submissions|abandon_helpers" "true|false|false|false" "$r"

# 4. auth.sessions privileges, pg_graphql, avatar policies
r="$(q "select has_table_privilege('postgres', 'auth.sessions', 'select') || '|' || has_table_privilege('postgres', 'auth.sessions', 'delete') || '|' || has_table_privilege('postgres', 'auth.users', 'select') as v" | tail -1)"
verdict "4 auth.sessions select|delete, auth.users select" "true|true|true" "$r"
r="$(q "select count(*) as v from pg_extension where extname = 'pg_graphql'" | tail -1)"
if [ "$r" = "0" ]; then say "PASS  4 pg_graphql absent"; else say "CHECK 4 pg_graphql present ($r): the same row rules apply through /graphql/v1; note it, not a stop"; fi
r="$(q "select count(*) || '|' || string_agg(policyname, ';' order by policyname) as v from pg_policies where schemaname = 'storage' and policyname like 'avatars:%'" | tail -1)"
verdict "4 avatar policies" "4|avatars: anyone can read;avatars: delete your own folder;avatars: insert into your own folder;avatars: update your own folder" "$r"

# 5. response slot
r="$(q "select count(*) as v from (select author_id, prompt_id from public.responses where kind = 'response' and status in ('processing', 'live', 'removed') group by 1, 2 having count(*) > 1) x" | tail -1)"
verdict "5 members with two primary rows on one prompt" "0" "$r"

# 6. clean-up state
h="$(q "select public.mux_cleanup_health()::text as v" | tail -1)"
say "6 health: $h"
r="$(q "select coalesce((public.mux_cleanup_health()->>'mode'), '?') as v" | tail -1)"; verdict "6 clean-up mode" "off" "$r"
r="$(q "select coalesce((public.mux_cleanup_health()->>'status'), '?') as v" | tail -1)"
case "$r" in ok) say "PASS  6 health status: ok" ;; warn) say "CHECK 6 health status: warn (read the problems in the health line above; only schedule_never_ran warnings are acceptable)" ;; *) say "FAIL  6 health status: $r"; FAILED=1 ;; esac
r="$(q "select coalesce((public.mux_cleanup_health()->'metrics'->>'failed'), '?') || '|' || coalesce((public.mux_cleanup_health()->'metrics'->>'stuck'), '?') || '|' || coalesce((public.mux_cleanup_health()->'metrics'->>'due'), '?') as v" | tail -1)"
verdict "6 failed|stuck|due jobs" "0|0|0" "$r"
r="$(q "select count(*) as v from public.mux_cleanup_jobs where status not in ('done', 'skipped')" | tail -1)"; verdict "6 open jobs" "0" "$r"
r="$(q "select count(*) as v from public.account_purge_failures" | tail -1)"; verdict "6 purge failures" "0" "$r"
r="$(q "select string_agg(jobname || '=' || schedule || '/' || active, ';' order by jobname) as v from cron.job" | tail -1)"
verdict "6 cron jobs" "mux-cleanup=* * * * */true;mux-cleanup-monitor=*/10 * * * */true;mux-sweep=45 4 * * */true;prune-moderation-records=30 3 * * */true;prune-mux-cleanup-jobs=40 3 * * */true;purge-deleted-accounts=15 3 * * */true;send-push=* * * * */true;tonight-prompt=*/10 * * * */true" "$r"
say "6 job statuses: $(q "select coalesce(string_agg(status || '=' || n, ';' order by status), 'none') as v from (select status, count(*) n from public.mux_cleanup_jobs group by 1) s" | tail -1)"

# 7. founder, V, T1 (ids only; no email, no name)
r="$(q "select md5(row_to_json(r)::text) || '|' || r.status as v from public.responses r where r.id = '5b321c24-1e1e-4393-9ae1-e6503903430d'" | tail -1)"
verdict "7 founder response md5|status" "c9918f8241a2c45eefb106b5d0ec0a8f|live" "$r"
r="$(q "select md5(u::text) || '|' || u.status as v from public.video_uploads u where u.response_id = '5b321c24-1e1e-4393-9ae1-e6503903430d' or u.upload_id = (select r.mux_upload_id from public.responses r where r.id = '5b321c24-1e1e-4393-9ae1-e6503903430d') limit 1" | tail -1)"
verdict "7 founder ledger md5|status" "9726bb8fdf8d9eb0cb759d13ce59c8b6|claimed" "$r"
r="$(q "select r.status || '|' || coalesce(r.mux_playback_id, '') || '|' || coalesce(r.mux_asset_id, '') || '|' || r.author_id as v from public.responses r where r.id = '52bbaabb-6faa-4bd2-94f9-015e43be791d'" | tail -1)"
verdict "7 V status|playback|asset|author" "live|tu8ooWH201axyHzgonRLCnDhETAgeWw014kaZMAHMrdmo|01IyQdSiLvAbHXb01Xg1ZQISiMz9UvMxLMgfZDpscKMBw|b0c14e38-4e89-4dbd-a9a3-8a8c01872a78" "$r"
r="$(q "select (a.deleted_at is null) || '|' || coalesce(a.moderation_status, 'none') as v from public.accounts a where a.id = 'b0c14e38-4e89-4dbd-a9a3-8a8c01872a78'" | tail -1)"
verdict "7 T1 active|moderation" "true|active" "$r"
r="$(q "select (select count(*) from public.accounts where deleted_at is not null) || '|' || (select count(*) from public.responses where status in ('removed', 'deleted')) as v" | tail -1)"
# One deleted video is expected: the stage 3 step 4B canary, a video reply (6f600f9e-…) deleted by
# its author on 12 Oct 16:53 UTC, whose Mux asset was the first real deletion (BETA-READINESS 15).
verdict "7 deleted accounts|removed or deleted videos" "0|1" "$r"
r="$(q "select r.id::text || '|' || r.kind || '|' || r.status || '|' || coalesce(r.deleted_at::text, '') as v from public.responses r where r.status in ('removed', 'deleted') order by r.created_at" | tail -1)"
verdict "7 the one deleted video is the 12 Oct canary" "6f600f9e-3559-4911-9ebf-13d9d3df509d|reply|deleted|2026-10-12 16:53:19.162388+00" "$r"
say "6 job statuses expected: done=3 (canary deletion 12 Oct; A1 revoke and B1 restore of V, 13 Oct), skipped=1 (A1's retention deletion, skipped by the restore)"

# 8. functions and secrets (names only)
if [ "$MODE" = "linked" ]; then
  REF="$(cat supabase/.temp/project-ref 2>/dev/null)"
  say "8 functions: $(supabase functions list --project-ref "$REF" -o json 2>/dev/null | python3 -c '
import json, sys
try:
    fs = json.load(sys.stdin)
except Exception:
    print("could not parse functions list"); sys.exit(0)
if isinstance(fs, dict): fs = fs.get("functions", fs.get("data", []))
parts = []
for f in fs:
    slug = f.get("slug") or f.get("name")
    parts.append("%s v%s %s verify_jwt=%s" % (slug, f.get("version"), f.get("status"), f.get("verify_jwt")))
print("; ".join(parts))')"
  say "8 secrets (names only): $(supabase secrets list --project-ref "$REF" -o json 2>/dev/null | python3 -c '
import json, sys
try:
    ss = json.load(sys.stdin)
except Exception:
    print("could not parse secrets list"); sys.exit(0)
if isinstance(ss, dict): ss = ss.get("secrets", ss.get("data", []))
names = sorted(s.get("name", "?") for s in ss)
print(len(names), "names:", ", ".join(names))')"
  say "8 migration list (remote applied | local only):"
  supabase migration list --linked 2>/dev/null | tee -a "$OUT" | tail -30
else
  say "8 skipped in local mode"
fi

say "# result: $( [ "$FAILED" = 0 ] && echo 'every compared block PASS (block 8 and any CHECK line still need a person to read them)' || echo 'at least one FAIL; H2 does not start' )"
say "# written to $OUT"
exit "$FAILED"
