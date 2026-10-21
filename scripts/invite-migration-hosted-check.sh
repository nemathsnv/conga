#!/usr/bin/env bash
# Read-only hosted pre- and postflight for 20261021000100 (docs/release/INVITE-DELETION-FIX-21OCT.md).
# Every query is one SELECT through `supabase db query --linked --project-ref` (Management API), checked
# here to be select-only. Prints counts, hashes and verdicts only: no invite code, email, token or secret
# value. Writes the fingerprint, per-table hashes and secret names to <outdir> for a pre/post diff.
#   scripts/invite-migration-hosted-check.sh pre|post <outdir>
set -uo pipefail
PHASE="$1"; OUT="$2"; mkdir -p "$OUT"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0
# Select-only: one statement starting with select/with, no semicolon, no DML/DDL keyword.
q() {
  local sql="$1" lc; lc="$(printf '%s' "$sql" | tr '[:upper:]' '[:lower:]')"
  case "$(printf '%s' "$lc" | tr '\n\t' '  ' | sed -e 's/^ *//' | cut -c1-4)" in sele|with) ;; *) echo "REFUSED not a select" >&2; return 1 ;; esac
  if printf '%s' "$lc" | grep -q ';' || printf '%s' "$lc" | grep -Eq '(^|[^a-z_])(insert|update|delete|merge|alter|create|drop|grant|revoke|truncate|copy|call|do|set_config|nextval|setval)([^a-z_]|$)'; then echo "REFUSED write keyword" >&2; return 1; fi
  local tmp; tmp="$(mktemp -d)"; printf '%s\n' "$sql" > "$tmp/q.sql"
  (cd "$tmp" && supabase db query --linked --project-ref picvoavfxnajfjkqawju -f "$tmp/q.sql" --output-format json 2>/dev/null) | python3 -c '
import json,sys
d=json.loads(sys.stdin.read())
rows=d if isinstance(d,list) else d.get("rows",[])
for r in rows:
    v=r.get("v")
    print("" if v is None else v)'
  rm -rf "$tmp"
}
v() { if [ "$2" = "$3" ]; then echo "PASS  $1: $3"; else echo "FAIL  $1: got [$3] expected [$2]"; FAILED=1; fi; }
EXP_MIG=$([ "$PHASE" = pre ] && echo "27|20261019000200" || echo "28|20261021000100")
EXP_CON=$([ "$PHASE" = pre ] && echo "invites_redeemed_pair CHECK (((redeemed_by IS NULL) = (redeemed_at IS NULL)))" || echo "invites_redeemer_has_time CHECK (((redeemed_by IS NULL) OR (redeemed_at IS NOT NULL)))")
EXP_FP=$([ "$PHASE" = pre ] && echo "$REPO/docs/release/mr-expected-27-migrations.fp" || echo "$REPO/docs/release/inv-expected-28-migrations.fp")

echo "# $PHASE $(date -u +%FT%TZ)"
v "migrations (count|latest)" "$EXP_MIG" "$(q "select count(*) || '|' || max(version) as v from supabase_migrations.schema_migrations")"
q "select string_agg(version, ',' order by version) as v from supabase_migrations.schema_migrations" > "$OUT/migrations.txt"

BODY="$(sed -n '/^with objects(kind, name, def) as (/,/^)$/p' "$REPO/scripts/schema-fingerprint.sql")"
q "$BODY select kind || '|' || name || '|' || md5(coalesce(def, '')) as v from objects order by kind, name" | grep '|' | sort > "$OUT/fingerprint.fp"
v "fingerprint lines" "$(wc -l < "$EXP_FP" | tr -d ' ')" "$(wc -l < "$OUT/fingerprint.fp" | tr -d ' ')"
diff <(sort "$EXP_FP") "$OUT/fingerprint.fp" > "$OUT/fingerprint.diff"; v "fingerprint equals $(basename "$EXP_FP") line for line" "0" "$(grep -c '^[<>]' "$OUT/fingerprint.diff")"

v "invites check constraint" "$EXP_CON" "$(q "select string_agg(conname || ' ' || pg_get_constraintdef(oid), ' | ' order by conname) as v from pg_constraint where conrelid = 'public.invites'::regclass and contype = 'c' and conname <> 'invites_code_check'")"
v "invites code check unchanged" "CHECK ((code ~ '^[A-Z0-9]{2,12}-[A-Z0-9]{2,8}\$'::text))" "$(q "select pg_get_constraintdef(oid) as v from pg_constraint where conrelid = 'public.invites'::regclass and conname = 'invites_code_check'")"
v "invites foreign keys (on delete)" "invites_cohort_fkey:a,invites_inviter_id_fkey:n,invites_redeemed_by_fkey:n" "$(q "select string_agg(conname || ':' || confdeltype::text, ',' order by conname) as v from pg_constraint where conrelid = 'public.invites'::regclass and contype = 'f'")"
v "invites: total|unused|redeemer without time|time without redeemer|cancelled" "${EXP_INV:-2|0|0|0|0}" "$(q "select count(*) || '|' || count(*) filter (where redeemed_at is null) || '|' || count(*) filter (where redeemed_by is not null and redeemed_at is null) || '|' || count(*) filter (where redeemed_by is null and redeemed_at is not null) || '|' || count(*) filter (where cancelled_at is not null) as v from public.invites")"
v "invites whose redeemer has no account" "0" "$(q "select count(*) as v from public.invites i where i.redeemed_by is not null and not exists (select 1 from public.accounts a where a.id = i.redeemed_by)")"
v "invite lookups: every redeemed invite answers used" "$(q "select count(*) as v from public.invites where redeemed_at is not null")" "$(q "select count(*) as v from public.invites where redeemed_at is not null and public.invite_lookup_unlimited(code)->>'status' = 'used'")"
v "invite_lookup_unlimited still tests redeemed_at" "1" "$(q "select (pg_get_functiondef('public.invite_lookup_unlimited(text)'::regprocedure) ~ 'if v_invite.redeemed_at is not null then')::int as v")"

v "accounts: total|deleted (pending purge)" "2|0" "$(q "select count(*) || '|' || count(*) filter (where deleted_at is not null) as v from public.accounts")"
v "auth users" "2" "$(q "select count(*) as v from auth.users")"
v "account_purge_failures" "0" "$(q "select count(*) as v from public.account_purge_failures")"
v "clean-up switch" "off" "$(q "select public.mux_cleanup_mode() as v")"
v "open clean-up jobs (not done/skipped)" "0" "$(q "select count(*) as v from public.mux_cleanup_jobs where status not in ('done', 'skipped')")"
echo "INFO  clean-up jobs: total|delete_asset $(q "select count(*) || '|' || count(*) filter (where action = 'delete_asset') as v from public.mux_cleanup_jobs")"
v "clean-up health" "ok" "$(q "select (public.mux_cleanup_health())->>'status' as v")"
v "avatar removals pending" "0" "$(q "select count(*) as v from public.avatar_removals where done_at is null")"
v "cron failures since 20 Oct" "0" "$(q "select count(*) as v from cron.job_run_details where status <> 'succeeded' and start_time > '2026-10-20'")"
echo "INFO  cron: $(q "select count(*) || ' jobs, ' || count(*) filter (where active) || ' active' as v from cron.job")"
echo "INFO  last purge run: $(q "select coalesce(max(d.start_time)::text, 'never') || ' ' || coalesce((array_agg(d.status order by d.start_time desc))[1], '') as v from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'purge-deleted-accounts'")"

# Per-table row count and content hash (values never printed).
TABLES=$(grep '^table|' "$REPO/docs/release/mr-expected-27-migrations.fp" | cut -d'|' -f2)
SQL=""; for t in $TABLES; do SQL="$SQL${SQL:+ union all }select '$t' || ':' || count(*) || ':' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as v from public.$t x"; done
q "$SQL" | sort > "$OUT/tables.txt"
q "select 'auth.users:' || count(*) || ':' || md5(coalesce(string_agg(id::text || created_at::text, '|' order by id), '')) as v from auth.users" >> "$OUT/tables.txt"
echo "INFO  table hashes: $(wc -l < "$OUT/tables.txt" | tr -d ' ') lines in $OUT/tables.txt"
echo "secrets (names):" > "$OUT/secrets.txt"
(cd "$(mktemp -d)" && supabase secrets list --project-ref picvoavfxnajfjkqawju -o json 2>/dev/null) | python3 -c 'import json,sys; print("\n".join(sorted(s["name"] for s in json.load(sys.stdin))))' >> "$OUT/secrets.txt"
v "MUX_CLEANUP_MODE / MUX_API_BASE / MUX_STREAM_BASE secrets absent" "0" "$(grep -cE '^(MUX_CLEANUP_MODE|MUX_API_BASE|MUX_STREAM_BASE)$' "$OUT/secrets.txt")"
echo "INFO  secret names: $(($(wc -l < "$OUT/secrets.txt") - 1))"
echo "RESULT $PHASE: $([ $FAILED = 0 ] && echo PASS || echo FAIL)"
exit $FAILED
