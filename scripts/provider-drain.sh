#!/usr/bin/env bash
# One controlled drain of the Mux clean-up queue, as in the stage 3 Tests A and B
# (docs/BETA-READINESS.md section 15), for the provider tests (docs/release/PROVIDER-TESTS.md).
#
#   scripts/provider-drain.sh <target> <dry_run|live> "<who: reason>" <expected job ids|none>
#
#   <target>   local:<stack folder>, or hosted (see scripts/provider-sql.sh for its guards; on hosted
#              PROVIDER_WRITE_STEP must name the approved step)
#   <expected> the job ids that must be due once the switch is set, comma separated, or none
#
# In order:
#   1. waits until just after a pg_cron minute tick (seconds 3 to 15), so the scheduled drain cannot
#      run while the switch is up;
#   2. one transaction (one DO block): the switch must be off; it is set to <mode>; exactly the
#      expected jobs must be due; one run_mux_cleanup('drain') must record exactly one request. Any
#      difference raises, and everything rolls back with the switch still off;
#   3. waits up to 35 s for pg_net's record of the worker's answer and prints it;
#   4. sets the switch back to off (always, also after a failure in 3) and checks it with a separate
#      select.
# For live, the function's own switch must also be live (on hosted: supabase secrets set
# MUX_CLEANUP_MODE=live before, unset after; locally: the env file the functions are served with).
# Exit 0 only if the worker answered 200 and the switch is off again.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"; MODE="${2:-}"; WHO="${3:-}"; EXPECTED="${4:-}"
SQL="$REPO/scripts/provider-sql.sh"
UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
case "$MODE" in dry_run|live) ;; *) echo "mode must be dry_run or live" >&2; exit 2 ;; esac
[[ "$WHO" =~ ^[A-Za-z0-9\ :,._()/+-]{3,120}$ ]] || { echo "who: 3 to 120 plain characters (no quotes)" >&2; exit 2; }
if [ "$EXPECTED" = "none" ]; then IDS=""
elif [[ "$EXPECTED" =~ ^$UUID(,$UUID)*$ ]]; then IDS="$EXPECTED"
else echo "expected: comma-separated job ids, or none" >&2; exit 2; fi
if [ "$TARGET" = hosted ] && [ -z "${PROVIDER_WRITE_STEP:-}" ]; then echo "hosted: set PROVIDER_WRITE_STEP to the approved step" >&2; exit 2; fi

scalar() { # first column of the first row, from provider-sql.sh's JSON
  "$SQL" "$TARGET" "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j._tag==="Error"){console.error(j.error.message);process.exit(1)}const r=(j.rows||[])[0];const v=r?Object.values(r)[0]:null;process.stdout.write(v===null||v===undefined?"":typeof v==="object"?JSON.stringify(v):String(v))})'
}

before="$(scalar "select coalesce(max(request_id), 0) as n from public.mux_cleanup_runs")"
[ "$(scalar "select public.mux_cleanup_mode() as m")" = off ] || { echo "precondition: the switch is not off" >&2; exit 1; }

# 1. Just after a minute tick.
while :; do s=$((10#$(date -u +%S))); [ "$s" -ge 3 ] && [ "$s" -le 15 ] && break; sleep 1; done

off() {
  "$SQL" "$TARGET" "select public.mux_cleanup_set_mode('off', '$WHO (finished)') as off" >/dev/null || true
  local m; m="$(scalar "select public.mux_cleanup_mode() as m" || true)"
  echo "switch after: $m"
  [ "$m" = off ]
}

# A Ctrl-C or kill after this point must still put the switch back: the transaction may already
# have committed on the server (16 Oct review, finding B).
trap 'echo "interrupted: setting the switch off"; off; exit 130' INT TERM

# 2. The guarded transaction.
GUARD="do \$guard\$
declare
  v_expected uuid[] := '{${IDS}}'::uuid[];
  v_due uuid[];
  v_before bigint;
begin
  if public.mux_cleanup_mode() <> 'off' then raise exception 'precondition_failed: the switch is not off'; end if;
  perform public.mux_cleanup_set_mode('${MODE}', '${WHO}');
  select coalesce(array_agg(id order by id), '{}') into v_due from public.mux_cleanup_jobs where status = 'pending' and not_before <= now();
  if v_due <> (select coalesce(array_agg(x order by x), '{}') from unnest(v_expected) x) then
    raise exception 'precondition_failed: due jobs are %, expected %', v_due, v_expected;
  end if;
  if exists (select 1 from public.mux_cleanup_jobs where status = 'running') then raise exception 'precondition_failed: a job is running'; end if;
  select coalesce(max(request_id), 0) into v_before from public.mux_cleanup_runs;
  perform public.run_mux_cleanup('drain');
  if (select count(*) from public.mux_cleanup_runs where request_id > v_before) <> 1 then
    raise exception 'precondition_failed: the drain did not record exactly one request';
  end if;
end
\$guard\$"
if ! out="$("$SQL" "$TARGET" "$GUARD")" || printf '%s' "$out" | grep -q '"_tag":"Error"'; then
  echo "guarded transaction refused (rolled back; nothing was called):" >&2
  printf '%s\n' "$out" >&2
  off || true
  exit 1
fi
echo "drain sent ($MODE) at $(date -u +%H:%M:%S) UTC"

# 3. The worker's answer.
answer=""
for _ in $(seq 1 35); do
  answer="$(scalar "select coalesce(r.status_code::text, 'error ' || coalesce(r.error_msg, '')) || ' ' || coalesce(r.content, '') as a from net._http_response r where r.id = (select min(request_id) from public.mux_cleanup_runs where request_id > $before)" || true)"
  [ -n "$answer" ] && break
  sleep 1
done

# 4. Off, always.
ok=0
off || ok=1
echo "worker answer: ${answer:-none within 35 s}"
case "$answer" in 200\ *) ;; *) ok=1 ;; esac
exit $ok
