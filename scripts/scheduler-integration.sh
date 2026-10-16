#!/usr/bin/env bash
# Runs supabase/functions/_tests/scheduler_integration_test.ts: pg_cron -> pg_net -> mux-cleanup in
# the local Edge runtime -> a fake Mux served by the test. LOCAL STACK ONLY.
#
#   scripts/scheduler-integration.sh [stack folder]     (default: the repository; the folder whose
#                                                        supabase/config.toml names the stack)
#   FAKE_MUX_PORT=<port> (default 55690) moves the fake Mux, so two local stacks can run it at once.
#
# The Edge runtime is served with fake-only settings (no real Mux credentials exist in it) and kept
# in a restart loop, so the test can kill it mid-call the way a platform restart would. It replaces
# the stack's own Edge runtime and is removed at the end: serve the functions again afterwards
# (supabase functions serve, or supabase stop && supabase start) before tests that need them, such
# as scripts/auth-integration.mjs.
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
PORT="${FAKE_MUX_PORT:-55690}"
ENV_FILE="$(mktemp)"
LOG="$(mktemp)"
cat > "$ENV_FILE" <<EOF
MUX_API_BASE=http://host.docker.internal:$PORT
MUX_TOKEN_ID=sched-test-id
MUX_TOKEN_SECRET=sched-test-secret
MUX_WEBHOOK_SECRET=sched-test-webhook
MUX_CLEANUP_KEY=sched-test-cleanup-key
MUX_CLEANUP_MODE=live
EOF

( cd "$STACK" && while true; do supabase functions serve --no-verify-jwt --env-file "$ENV_FILE" >>"$LOG" 2>&1 || true; sleep 1; done ) &
LOOP=$!
cleanup() {
  kill "$LOOP" 2>/dev/null || true
  pkill -f "supabase functions serve --no-verify-jwt --env-file $ENV_FILE" 2>/dev/null || true
  docker rm -f "supabase_edge_runtime_$PROJECT" >/dev/null 2>&1 || true
  rm -f "$ENV_FILE"
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/functions/v1/mux-cleanup" || true)"
  [ "$code" = "405" ] && break
  sleep 1
done
[ "$code" = "405" ] || { echo "the Edge runtime did not come up; log: $LOG" >&2; exit 1; }

eval "$(sed -n -e 's/^API_URL=/export SUPABASE_URL=/p' -e 's/^ANON_KEY=/export SUPABASE_ANON_KEY=/p' -e 's/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/p' <<<"$STATUS")"
export DB_CONTAINER="supabase_db_$PROJECT" EDGE_CONTAINER="supabase_edge_runtime_$PROJECT" FAKE_MUX_PORT="$PORT"
deno test --allow-env --allow-net --allow-run "$REPO/supabase/functions/_tests/scheduler_integration_test.ts"
