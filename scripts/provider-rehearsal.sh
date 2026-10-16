#!/usr/bin/env bash
# Rehearses the provider tests C2, E1, E2 and E3 (docs/release/PROVIDER-TESTS.md) on a LOCAL stack
# against a fake Mux, with the same scripts the hosted run uses (provider-member.mjs,
# provider-drain.sh, provider-sql.sh, provider-mux-read.mjs). Real Mux and the hosted project are
# never contacted.
#
#   scripts/provider-rehearsal.sh [stack folder]     (default: the repository; the folder whose
#                                                     supabase/config.toml names the stack)
#   FAKE_MUX_PORT=<port> (default 55713) moves the fake Mux.
#
# Serves the Edge Functions with fake-only settings (MUX_CLEANUP_MODE=live, so the database's switch
# alone decides, as on hosted during a live step) and removes that Edge runtime at the end: serve the
# functions again afterwards if other tests need them. It sets and removes the local database's
# mux_cleanup_url / mux_cleanup_key Vault secrets and leaves the switch off.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
STACK="$(cd "${1:-$REPO}" && pwd)"
STATUS="$(cd "$STACK" && supabase status -o env 2>/dev/null)"
API_URL="$(sed -n 's/^API_URL="\(.*\)"$/\1/p' <<<"$STATUS")"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "refusing: API_URL '$API_URL' is not a local stack" >&2; exit 1 ;;
esac
PROJECT="$(sed -n 's/^project_id = "\(.*\)"$/\1/p' "$STACK/supabase/config.toml" | head -1)"
PORT="${FAKE_MUX_PORT:-55713}"
ENV_FILE="$(mktemp)"
LOG="$(mktemp)"
cat > "$ENV_FILE" <<EOF
MUX_API_BASE=http://host.docker.internal:$PORT
MUX_TOKEN_ID=provider-rehearsal-id
MUX_TOKEN_SECRET=provider-rehearsal-secret
MUX_WEBHOOK_SECRET=provider-rehearsal-webhook
MUX_CLEANUP_KEY=provider-rehearsal-cleanup-key
MUX_CLEANUP_MODE=live
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
  code="$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/functions/v1/mux-cleanup" || true)"
  [ "$code" = "405" ] && break
  sleep 1
done
[ "$code" = "405" ] || { echo "the Edge runtime did not come up; log: $LOG" >&2; exit 1; }

eval "$(sed -n -e 's/^API_URL=/export SUPABASE_URL=/p' -e 's/^ANON_KEY=/export SUPABASE_ANON_KEY=/p' -e 's/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/p' <<<"$STATUS")"
export DB_CONTAINER="supabase_db_$PROJECT" STACK_DIR="$STACK" FAKE_MUX_PORT="$PORT" CLEANUP_KEY="provider-rehearsal-cleanup-key"
deno test --allow-env --allow-net --allow-run --allow-read --allow-write "$REPO/supabase/functions/_tests/provider_rehearsal_test.ts"
