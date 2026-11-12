#!/usr/bin/env bash
# Rehearses Test C1 (scripts/c1-retire.mjs) on a LOCAL stack against a fake Mux
# (scripts/c1-rehearsal.mjs). Real Mux and the hosted project are never contacted.
#
#   scripts/c1-rehearsal.sh [stack folder]     (default: the repository; the folder whose
#                                               supabase/config.toml names the stack)
#
# Serves the Edge Functions with fake-only settings (no real Mux credentials exist in it) and
# removes that Edge runtime at the end: serve the functions again afterwards if other tests need
# them.
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
PORT="${FAKE_MUX_PORT:-55691}"
ENV_FILE="$(mktemp)"
LOG="$(mktemp)"
cat > "$ENV_FILE" <<EOF
MUX_API_BASE=http://host.docker.internal:$PORT
MUX_TOKEN_ID=c1-rehearsal-id
MUX_TOKEN_SECRET=c1-rehearsal-secret
MUX_WEBHOOK_SECRET=c1-rehearsal-webhook
EOF

( cd "$STACK" && supabase functions serve --no-verify-jwt --env-file "$ENV_FILE" >>"$LOG" 2>&1 ) &
SERVE=$!
cleanup() {
  kill "$SERVE" 2>/dev/null || true
  pkill -f "supabase functions serve --no-verify-jwt --env-file $ENV_FILE" 2>/dev/null || true
  docker rm -f "supabase_edge_runtime_$PROJECT" >/dev/null 2>&1 || true
  rm -f "$ENV_FILE"
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/functions/v1/mux-create-upload" || true)"
  [ "$code" = "405" ] && break
  sleep 1
done
[ "$code" = "405" ] || { echo "the Edge runtime did not come up; log: $LOG" >&2; exit 1; }

eval "$(sed -n -e 's/^API_URL=/export SUPABASE_URL=/p' -e 's/^ANON_KEY=/export SUPABASE_ANON_KEY=/p' -e 's/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/p' <<<"$STATUS")"
FAKE_MUX_PORT="$PORT" node "$REPO/scripts/c1-rehearsal.mjs"
