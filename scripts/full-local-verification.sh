#!/usr/bin/env bash
# Consolidated local verification on an ISOLATED stack. Never touches the hosted project or real Mux.
#
#   scripts/full-local-verification.sh [stack id] [port base]
#     stack id   default "int"  -> project_id shortcut-int, containers supabase_*_shortcut-int
#     port base  default 555    -> api 55501, db 55502, shadow 55500, pooler 55509, studio 55503,
#                                   inbucket 55504, analytics 55507
#
# Creates <scratch>/stack-<id>/supabase as a copy of this repository's supabase/ with the project id
# and ports above (studio, analytics and realtime off), starts it, resets it from the migrations, then
# runs, in order and in series:
#   1. pgTAP (supabase test db)
#   2. Deno unit tests (no network)
#   3. Edge runtime served with fake-only Mux settings; the Deno integration suites
#   4. scripts/idempotency-rollback-check.sh
#   5. scripts/scheduler-integration.sh   (replaces the Edge runtime; served again afterwards)
#   6. scripts/c1-rehearsal.sh and scripts/provider-rehearsal.sh (same)
#   7. scripts/auth-integration.mjs       (needs the Edge runtime and Mailpit)
#   8. app: npm run typecheck, npm run lint, npm test
# Stops the stack at the end unless KEEP_STACK=1. Exit status is non-zero on the first failure
# unless CONTINUE=1, in which case every step runs and the summary lists the failures.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
ID="${1:-int}"
BASE="${2:-555}"
SCRATCH="${SCRATCH:-${TMPDIR:-/tmp}/shortcut-verification}"
STACK="$SCRATCH/stack-$ID"
PROJECT="shortcut-$ID"
DB="supabase_db_$PROJECT"
EDGE="supabase_edge_runtime_$PROJECT"
CONTINUE="${CONTINUE:-0}"
KEEP_STACK="${KEEP_STACK:-0}"
RESULTS=()
FAILED=0

step() { # name, command...
  local name="$1"; shift
  echo; echo "=================== $name ==================="
  if "$@"; then RESULTS+=("PASS  $name"); else RESULTS+=("FAIL  $name"); FAILED=1; [ "$CONTINUE" = "1" ] || finish; fi
}
finish() {
  echo; echo "=================== summary ==================="
  printf '%s\n' "${RESULTS[@]}"
  stop_serve
  if [ "$KEEP_STACK" != "1" ]; then (cd "$STACK" && supabase stop --project-id "$PROJECT" >/dev/null 2>&1 || true); fi
  exit "$FAILED"
}
trap 'stop_serve' EXIT

SERVE_PID=""
ENV_FILE=""
serve() { # fake-only Edge runtime
  stop_serve
  ENV_FILE="$(mktemp)"
  cat > "$ENV_FILE" <<EOT
MUX_API_BASE=http://host.docker.internal:55699
MUX_TOKEN_ID=verify-id
MUX_TOKEN_SECRET=verify-secret
MUX_WEBHOOK_SECRET=verify-webhook
MUX_CLEANUP_KEY=verify-cleanup-key
PUSH_SENDER_KEY=verify-push-key
EOT
  ( cd "$STACK" && supabase functions serve --no-verify-jwt --env-file "$ENV_FILE" >"$SCRATCH/serve-$ID.log" 2>&1 ) &
  SERVE_PID=$!
  for _ in $(seq 1 90); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/functions/v1/mux-create-upload" || true)"
    [ "$code" = "405" ] && return 0
    sleep 1
  done
  echo "the Edge runtime did not come up; see $SCRATCH/serve-$ID.log" >&2; return 1
}
stop_serve() {
  if [ -n "$SERVE_PID" ]; then kill "$SERVE_PID" 2>/dev/null || true; SERVE_PID=""; fi
  if [ -n "$ENV_FILE" ]; then pkill -f "supabase functions serve --no-verify-jwt --env-file $ENV_FILE" 2>/dev/null || true; rm -f "$ENV_FILE"; ENV_FILE=""; fi
  docker rm -f "$EDGE" >/dev/null 2>&1 || true
}

# --- stack -------------------------------------------------------------------------------------
mkdir -p "$STACK"
rsync -a --delete --exclude '.env' --exclude '.env.*' "$REPO/supabase/" "$STACK/supabase/"
cfg="$STACK/supabase/config.toml"
sed -i '' -e "s/^project_id = \"shortcut\"$/project_id = \"$PROJECT\"/" \
  -e "s/^port = 54321$/port = ${BASE}01/" -e "s/^port = 54322$/port = ${BASE}02/" \
  -e "s/^shadow_port = 54320$/shadow_port = ${BASE}00/" -e "s/^port = 54329$/port = ${BASE}09/" \
  -e "s/^port = 54323$/port = ${BASE}03/" -e "s/^port = 54324$/port = ${BASE}04/" \
  -e "s/^port = 54327$/port = ${BASE}07/" "$cfg"
python3 - "$cfg" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
for section in ("studio", "analytics", "realtime"):
    s = re.sub(r"(\[%s\]\n(?:[^\[]*?))enabled = true" % section, r"\1enabled = false", s, count=1)
open(p, "w").write(s)
PY
grep -q "project_id = \"$PROJECT\"" "$cfg" || { echo "config rewrite failed" >&2; exit 1; }
if [ "$(docker ps --format '{{.Names}}' | grep -c '^supabase_db_shortcut-')" -ge 2 ] && ! docker ps --format '{{.Names}}' | grep -q "^$DB$"; then
  echo "two agent stacks are already running; refusing to start a third (Docker has 3.8 GB)" >&2; exit 1
fi
( cd "$STACK" && supabase start ) || { echo "supabase start failed" >&2; exit 1; }
( cd "$STACK" && supabase db reset ) || { echo "supabase db reset failed" >&2; exit 1; }
STATUS="$(cd "$STACK" && supabase status -o env)"
API_URL="$(sed -n 's/^API_URL="\(.*\)"$/\1/p' <<<"$STATUS")"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "not a local stack: $API_URL" >&2; exit 1 ;; esac
eval "$(sed -n -e 's/^API_URL=/export SUPABASE_URL=/p' -e 's/^ANON_KEY=/export SUPABASE_ANON_KEY=/p' -e 's/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/p' -e 's/^MAILPIT_URL=/export MAILPIT_URL=/p' <<<"$STATUS")"
export DB_CONTAINER="$DB" EDGE_CONTAINER="$EDGE"

# --- 1. pgTAP ----------------------------------------------------------------------------------
step "pgTAP" bash -c "cd '$STACK' && supabase test db"

# --- 2. Deno unit ------------------------------------------------------------------------------
for t in "$REPO"/supabase/functions/_tests/*_test.ts; do
  case "$(basename "$t")" in *integration_test.ts|provider_rehearsal_test.ts) ;; *) step "deno unit $(basename "$t")" deno test --allow-env --allow-read "$t" ;; esac
done

# --- 3. Deno integration (served Edge runtime) ------------------------------------------------
step "serve edge runtime" serve
for t in "$REPO"/supabase/functions/_tests/*integration_test.ts; do
  case "$(basename "$t")" in scheduler_integration_test.ts) ;; *) step "deno $(basename "$t")" deno test --allow-env --allow-net --allow-run "$t" ;; esac
done
stop_serve

# --- 4-6. scripts ------------------------------------------------------------------------------
# The integration suites above leave members and content behind; the rollback check runs the old
# pgTAP suite, whose counts assume a clean database, so reset first.
step "db reset before the rollback check" bash -c "cd '$STACK' && supabase db reset"
step "idempotency-rollback-check" "$REPO/scripts/idempotency-rollback-check.sh" "$STACK"
step "scheduler-integration" "$REPO/scripts/scheduler-integration.sh" "$STACK"
step "c1-rehearsal" "$REPO/scripts/c1-rehearsal.sh" "$STACK"
step "provider-rehearsal" "$REPO/scripts/provider-rehearsal.sh" "$STACK"

# --- 7. auth integration -----------------------------------------------------------------------
step "serve edge runtime (auth)" serve
step "auth-integration" bash -c "cd '$STACK' && DB_CONTAINER='$DB' MAILPIT_URL='$MAILPIT_URL' node '$REPO/scripts/auth-integration.mjs'"
stop_serve

# --- 8. app -----------------------------------------------------------------------------------
step "app typecheck" bash -c "cd '$REPO/app' && npm run typecheck"
step "app lint" bash -c "cd '$REPO/app' && npm run lint"
step "app jest" bash -c "cd '$REPO/app' && npx jest --ci 2>&1 | tail -15"

finish
