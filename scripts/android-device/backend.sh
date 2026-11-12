#!/usr/bin/env bash
# The isolated test backend for Android device sessions (scripts/android-device/README.md). Never the founder
# stack "shortcut", never the hosted project, never real Mux.
#   scripts/android-device/backend.sh up | down | status
# State lives in $CONGA_ANDROID_WORK (default ~/Library/Caches/conga-android), outside the repository:
# the stack's copy of supabase/, the fake Mux certificate, logs and each device's results.
set -uo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${CONGA_ANDROID_WORK:-$HOME/Library/Caches/conga-android}"
PROJECT=shortcut-and
STACK="$WORK/stack"
FAKE="$WORK/fakemux"
EDGE_ENV="$WORK/edge.env"
mkdir -p "$WORK" "$FAKE"

make_stack() { # a copy of supabase/ with its own project id and ports 558xx; studio, analytics, realtime off
  mkdir -p "$STACK"
  rsync -a --delete --exclude '.env' --exclude '.env.*' "$REPO/supabase/" "$STACK/supabase/"
  local cfg="$STACK/supabase/config.toml"
  sed -i '' -e "s/^project_id = \"shortcut\"$/project_id = \"$PROJECT\"/" \
    -e 's/^port = 54321$/port = 55801/' -e 's/^port = 54322$/port = 55802/' -e 's/^shadow_port = 54320$/shadow_port = 55800/' \
    -e 's/^port = 54329$/port = 55809/' -e 's/^port = 54323$/port = 55803/' -e 's/^port = 54324$/port = 55804/' \
    -e 's/^port = 54327$/port = 55807/' "$cfg"
  python3 -I - "$cfg" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
for section in ("studio", "analytics", "realtime"):
    s = re.sub(r"(\[%s\]\n(?:[^\[]*?))enabled = true" % section, r"\1enabled = false", s, count=1)
open(p, "w").write(s)
PY
  grep -q "project_id = \"$PROJECT\"" "$cfg" || { echo "config rewrite failed" >&2; exit 1; }
}

case "${1:-status}" in
  up)
    docker info >/dev/null 2>&1 || { echo "Docker is not running" >&2; exit 1; }
    fresh=0
    [ -f "$STACK/supabase/config.toml" ] || { make_stack; fresh=1; }
    if ! docker ps --format '{{.Names}}' | grep -q "^supabase_db_$PROJECT$" && [ "$(docker ps --format '{{.Names}}' | grep -c '^supabase_db_shortcut-')" -ge 2 ]; then
      echo "two agent stacks are already running; refusing a third (Docker has 3.8 GB)" >&2; exit 1
    fi
    (cd "$STACK" && supabase start >/dev/null 2>&1) || { echo "supabase start failed" >&2; exit 1; }
    API=$(cd "$STACK" && supabase status -o env 2>/dev/null | sed -n 's/^API_URL="\(.*\)"$/\1/p')
    [ "$API" = "http://127.0.0.1:55801" ] || { echo "not the isolated stack: $API" >&2; exit 1; }
    [ "$fresh" = 1 ] && { (cd "$STACK" && supabase db reset >/dev/null 2>&1) || { echo "db reset failed" >&2; exit 1; }; }
    # Seed members can sign in by email on a fresh stack (memory: simulator-local-testing).
    docker exec -i "supabase_db_$PROJECT" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
update auth.users set confirmation_token=coalesce(confirmation_token,''), recovery_token=coalesce(recovery_token,''),
  email_change_token_new=coalesce(email_change_token_new,''), email_change=coalesce(email_change,''),
  email_change_token_current=coalesce(email_change_token_current,''), phone_change=coalesce(phone_change,''),
  phone_change_token=coalesce(phone_change_token,''), reauthentication_token=coalesce(reauthentication_token,'')
 where email like 'dev-%';
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.id::text, 'email', jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
  from auth.users u where u.email like 'dev-%' and not exists (select 1 from auth.identities i where i.user_id = u.id);
SQL
    # The fake Mux's own CA (a phone does not trust it: uploads fail there, which tests the failure path).
    [ -f "$FAKE/cert.pem" ] || openssl req -x509 -newkey rsa:2048 -nodes -keyout "$FAKE/key.pem" -out "$FAKE/cert.pem" -days 90 \
      -subj "/CN=Conga local fake upload" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" \
      -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,digitalSignature,keyEncipherment" >/dev/null 2>&1
    echo ok > "$FAKE/mode"
    cat > "$EDGE_ENV" <<'EOT'
MUX_API_BASE=http://host.docker.internal:55699
MUX_TOKEN_ID=verify-id
MUX_TOKEN_SECRET=verify-secret
MUX_WEBHOOK_SECRET=verify-webhook
MUX_CLEANUP_KEY=verify-cleanup-key
PUSH_SENDER_KEY=verify-push-key
EOT
    pgrep -f "scripts/android-device/fake-mux.mjs" >/dev/null || (nohup node "$REPO/scripts/android-device/fake-mux.mjs" "$FAKE" >> "$WORK/fakemux.log" 2>&1 &)
    pgrep -f "functions serve --no-verify-jwt --env-file $EDGE_ENV" >/dev/null || (cd "$STACK" && nohup supabase functions serve --no-verify-jwt --env-file "$EDGE_ENV" > "$WORK/serve.log" 2>&1 &)
    # Metro with file watching (CI=1 turns watching off), reading app/.env (the stack's URL and its JWT anon key).
    pgrep -f "expo start --dev-client --port 8081" >/dev/null || (cd "$REPO/app" && nohup env -u CI npx expo start --dev-client --port 8081 < /dev/null > "$WORK/metro.log" 2>&1 &)
    for _ in $(seq 1 90); do
      a=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:55801/functions/v1/mux-create-upload)
      m=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/status)
      f=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:55699/nothing)
      [ "$a" = 405 ] && [ "$m" = 200 ] && [ "$f" = 404 ] && break
      sleep 2
    done
    echo "edge=$a (405 ok) metro=$m (200 ok) fakemux=$f (404 ok)"
    # Build Metro's Android bundle now, so the first launch on a device does not wait for it.
    curl -s -o /dev/null -w 'bundle warmed: %{http_code}, %{size_download} bytes in %{time_total}s\n' \
      "http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=src%2Fapp&unstable_transformProfile=hermes-stable"
    ;;
  down)
    pkill -f "scripts/android-device/fake-mux.mjs"; pkill -f "functions serve --no-verify-jwt --env-file $EDGE_ENV"; pkill -f "expo start --dev-client --port 8081"
    docker rm -f "supabase_edge_runtime_$PROJECT" >/dev/null 2>&1
    [ -d "$STACK" ] && (cd "$STACK" && supabase stop --project-id "$PROJECT" >/dev/null 2>&1)
    echo stopped ;;
  status)
    echo "work: $WORK"; echo "stack containers: $(docker ps --format '{{.Names}}' 2>/dev/null | grep -c "$PROJECT")"
    pgrep -fl "fake-mux.mjs|functions serve --no-verify-jwt|expo start --dev-client" | cut -c1-100 ;;
  *) echo "usage: $0 up|down|status" >&2; exit 2 ;;
esac
