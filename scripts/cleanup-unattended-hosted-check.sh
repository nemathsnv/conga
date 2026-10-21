#!/usr/bin/env bash
# Read-only hosted checks for leaving the Mux clean-up on (20261021000200;
# docs/release/MUX-CLEANUP-UNATTENDED.md). Every query is one SELECT through `supabase db query
# --linked --project-ref` (Management API), checked here to be select-only; `supabase secrets list`
# and `supabase functions list` only list. Prints counts, digests-match verdicts and statuses, never a
# key, secret value, email or Mux id. Writes per-table hashes, the fingerprint, secret names and
# function versions to <outdir> so two phases can be diffed.
#
#   scripts/cleanup-unattended-hosted-check.sh pre|post|live <outdir>
#     pre   before the migration:   28 migrations, switch off, no MUX_CLEANUP_MODE
#     post  after the migration:    29 migrations, 12 schedules, switch off, no cap, no MUX_CLEANUP_MODE
#     live  after enabling:         29 migrations, switch live, cap 2, MUX_CLEANUP_MODE=live, alerts set
# Exit 0 only if every check passes.
set -uo pipefail
PHASE="${1:-}"; OUT="${2:-}"
case "$PHASE" in pre|post|live) ;; *) echo "usage: $0 pre|post|live <outdir>" >&2; exit 2 ;; esac
[ -n "$OUT" ] || { echo "usage: $0 pre|post|live <outdir>" >&2; exit 2; }
mkdir -p "$OUT"
REF=picvoavfxnajfjkqawju
REPO="$(cd "$(dirname "$0")/.." && pwd)"
MAIN="$(cd "$(git -C "$REPO" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
FAILED=0
q() {
  local sql="$1" lc; lc="$(printf '%s' "$sql" | tr '[:upper:]' '[:lower:]')"
  case "$(printf '%s' "$lc" | tr '\n\t' '  ' | sed -e 's/^ *//' | cut -c1-4)" in sele|with) ;; *) echo "REFUSED not a select" >&2; return 1 ;; esac
  if printf '%s' "$lc" | grep -q ';' || printf '%s' "$lc" | grep -Eq '(^|[^a-z_])(insert|update|delete|merge|alter|create|drop|grant|revoke|truncate|copy|call|do|set_config|nextval|setval|set_mode|set_deletion_cap|resume_deletions|mux_cleanup_alert|run_mux_cleanup|mux_cleanup_retry|mux_cleanup_claim|purge_)([^a-z_]|$)'; then echo "REFUSED write keyword" >&2; return 1; fi
  local tmp; tmp="$(mktemp -d)"; printf '%s\n' "$sql" > "$tmp/q.sql"
  (cd "$tmp" && supabase db query --linked --project-ref "$REF" -f "$tmp/q.sql" --output-format json 2>/dev/null) | python3 -c '
import json,sys
d=json.loads(sys.stdin.read())
rows=d if isinstance(d,list) else d.get("rows",[])
for r in rows:
    v=r.get("v")
    print("" if v is None else v)'
  rm -rf "$tmp"
}
v() { if [ "$2" = "$3" ]; then echo "PASS  $1: $3"; else echo "FAIL  $1: got [$3] expected [$2]"; FAILED=1; fi; }
sha() { printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1; }
envval() { sed -n "s/^$2=//p" "$1" 2>/dev/null | tr -d '"' | head -1; }

if [ "$PHASE" = pre ]; then EXP_MIG="28|20261021000100"; EXP_FP="$REPO/docs/release/inv-expected-28-migrations.fp"; EXP_CRON="10|10"
else EXP_MIG="29|20261021000200"; EXP_FP="$REPO/docs/release/cu-expected-29-migrations.fp"; EXP_CRON="12|12"; fi
echo "# $PHASE $(date -u +%FT%TZ)"

# --- schema ---------------------------------------------------------------------------------------
v "migrations (count|latest)" "$EXP_MIG" "$(q "select count(*) || '|' || max(version) as v from supabase_migrations.schema_migrations")"
BODY="$(sed -n '/^with objects(kind, name, def) as (/,/^)$/p' "$REPO/scripts/schema-fingerprint.sql")"
q "$BODY select kind || '|' || name || '|' || md5(coalesce(def, '')) as v from objects order by kind, name" | grep '|' | sort > "$OUT/fingerprint.fp"
diff <(sort "$EXP_FP") "$OUT/fingerprint.fp" > "$OUT/fingerprint.diff"
v "fingerprint equals $(basename "$EXP_FP") line for line" "0" "$(grep -c '^[<>]' "$OUT/fingerprint.diff")"

# --- clean-up state -------------------------------------------------------------------------------
if [ "$PHASE" = live ]; then EXP_MODE=live; else EXP_MODE=off; fi
v "clean-up switch" "$EXP_MODE" "$(q "select public.mux_cleanup_mode() as v")"
if [ "$PHASE" != pre ]; then
  v "deletion cap|paused" "$([ "$PHASE" = live ] && echo "2|no" || echo "none|no")" "$(q "select coalesce(deletion_cap::text, 'none') || '|' || case when deletions_paused_at is null then 'no' else 'yes' end as v from public.mux_cleanup_settings")"
  echo "INFO  settings log: $(q "select count(*) || ' change(s); last: ' || coalesce(max(changed_at)::text, 'none') as v from public.mux_cleanup_settings_log")"
fi
v "open clean-up jobs (not done/skipped)" "0" "$(q "select count(*) as v from public.mux_cleanup_jobs where status not in ('done', 'skipped')")"
echo "INFO  clean-up jobs: $(q "select count(*) || ' total, ' || count(*) filter (where status = 'done') || ' done, ' || count(*) filter (where status = 'skipped') || ' skipped' as v from public.mux_cleanup_jobs")"
v "clean-up health" "ok" "$(q "select (public.mux_cleanup_health())->>'status' as v")"
echo "INFO  health problems: $(q "select coalesce(string_agg((p->>'level') || ' ' || (p->>'check'), ', '), 'none') as v from jsonb_array_elements((public.mux_cleanup_health())->'problems') p")"
echo "INFO  last worker request: $(q "select coalesce(max(request_id)::text || ' at ' || max(requested_at)::text, 'none') as v from public.mux_cleanup_runs")"
v "accounts: total|deleted (pending purge)" "2|0" "$(q "select count(*) || '|' || count(*) filter (where deleted_at is not null) as v from public.accounts")"
v "auth users" "2" "$(q "select count(*) as v from auth.users")"
v "account_purge_failures" "0" "$(q "select count(*) as v from public.account_purge_failures")"
v "cron jobs (total|active)" "$EXP_CRON" "$(q "select count(*) || '|' || count(*) filter (where active) as v from cron.job")"
v "cron failures in the last 24 hours" "0" "$(q "select count(*) as v from cron.job_run_details where status <> 'succeeded' and status <> 'running' and start_time > now() - interval '24 hours'")"
echo "INFO  mux-cleanup last run: $(q "select coalesce(max(d.start_time)::text, 'never') as v from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'mux-cleanup'")"
echo "INFO  purge last run: $(q "select coalesce(max(d.start_time)::text, 'never') || ' ' || coalesce((array_agg(d.status order by d.start_time desc))[1], '') as v from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'purge-deleted-accounts'")"

# --- Vault (names only) ---------------------------------------------------------------------------
v "Vault: worker url and key present" "2" "$(q "select count(*) as v from vault.secrets where name in ('mux_cleanup_url', 'mux_cleanup_key')")"
v "Vault: no alert url override (messages go to Resend)" "0" "$(q "select count(*) as v from vault.secrets where name = 'mux_cleanup_alert_url'")"
if [ "$PHASE" = live ]; then
  v "Vault: alert key, to, from present" "3" "$(q "select count(*) as v from vault.secrets where name in ('mux_cleanup_alert_key', 'mux_cleanup_alert_to', 'mux_cleanup_alert_from')")"
fi

# --- function secrets (names and digests; values never read) --------------------------------------
(cd "$(mktemp -d)" && supabase secrets list --project-ref "$REF" -o json 2>/dev/null) > "$OUT/secrets.json"
python3 -c 'import json,sys; print("\n".join(sorted(s["name"] for s in json.load(open(sys.argv[1])))))' "$OUT/secrets.json" > "$OUT/secrets.txt"
digest() { python3 -c 'import json,sys; d={s["name"]: s.get("value", "") for s in json.load(open(sys.argv[1]))}; print(d.get(sys.argv[2], ""))' "$OUT/secrets.json" "$1"; }
v "MUX_API_BASE / MUX_STREAM_BASE absent" "0" "$(grep -cE '^(MUX_API_BASE|MUX_STREAM_BASE)$' "$OUT/secrets.txt")"
if [ "$PHASE" = live ]; then
  v "MUX_CLEANUP_MODE is live (digest)" "$(sha "live")" "$(digest MUX_CLEANUP_MODE)"
else
  v "MUX_CLEANUP_MODE absent" "0" "$(grep -c '^MUX_CLEANUP_MODE$' "$OUT/secrets.txt")"
fi
BETA_ID="$(envval "$MAIN/supabase/.env.mux-hosted" MUX_TOKEN_ID)"; SPIKE_ID="$(envval "$MAIN/spike/supabase/.env" MUX_TOKEN_ID)"
HOSTED_ID="$(digest MUX_TOKEN_ID)"
v "the worker's Mux token is Shortcut Beta's (digest)" "yes" "$([ -n "$BETA_ID" ] && [ "$HOSTED_ID" = "$(sha "$BETA_ID")" ] && echo yes || echo no)"
v "and not the spike's" "yes" "$([ -n "$SPIKE_ID" ] && [ "$HOSTED_ID" != "$(sha "$SPIKE_ID")" ] && echo yes || echo no)"
rm -f "$OUT/secrets.json"
echo "INFO  secret names: $(wc -l < "$OUT/secrets.txt" | tr -d ' ')"

# --- functions (versions, to see that no bundle changed) ------------------------------------------
(cd "$(mktemp -d)" && supabase functions list --project-ref "$REF" -o json 2>/dev/null) \
  | python3 -c 'import json,sys; [print("%s|v%s|%s|%s" % (f["slug"], f.get("version"), f.get("status"), f.get("ezbr_sha256", "")[:12])) for f in sorted(json.load(sys.stdin), key=lambda f: f["slug"])]' > "$OUT/functions.txt"
echo "INFO  mux-cleanup: $(grep '^mux-cleanup|' "$OUT/functions.txt")"

# --- per-table row counts and content hashes (values never printed) -------------------------------
TABLES=$(grep '^table|' "$EXP_FP" | cut -d'|' -f2)
SQL=""; for t in $TABLES; do SQL="$SQL${SQL:+ union all }select '$t' || ':' || count(*) || ':' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as v from public.$t x"; done
q "$SQL" | sort > "$OUT/tables.txt"
q "select 'auth.users:' || count(*) || ':' || md5(coalesce(string_agg(id::text || created_at::text, '|' order by id), '')) as v from auth.users" >> "$OUT/tables.txt"
echo "INFO  table hashes: $(wc -l < "$OUT/tables.txt" | tr -d ' ') lines in $OUT/tables.txt"
echo "RESULT $PHASE: $([ $FAILED = 0 ] && echo PASS || echo FAIL)"
exit $FAILED
