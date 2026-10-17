#!/usr/bin/env bash
# Publish an over-the-air JavaScript update to one channel (docs/release/OTA-UPDATES.md).
# Never run a bare `eas update` in app/: it would export the bundle with app/.env (the local stack)
# inlined into the code that phones run. This script loads the channel's own values and sets
# CONGA_UPDATE_CHANNEL, so app.config.ts refuses the export when they are wrong.
#
#   app/scripts/publish-update.sh founder "Fix the comment count"        # Nemat's own iPhone build
#   app/scripts/publish-update.sh preview "Fix the comment count"        # EAS preview builds
#   app/scripts/publish-update.sh production "Fix the comment count"     # TestFlight and store builds
#   DRY_RUN=1 app/scripts/publish-update.sh founder "..."                # checks and a local export, no upload
#
# Only builds whose native fingerprint equals this checkout's receive the update (runtime version
# policy "fingerprint", app.config.ts). If the native side changed since the build, the update reaches
# nobody: make a new build instead.
set -euo pipefail
cd "$(dirname "$0")/.."

CHANNEL=${1:-}
MESSAGE=${2:-}
usage() { echo "usage: $0 founder|preview|production \"message\"" >&2; exit 1; }
[[ -n $MESSAGE ]] || usage

export EXPO_NO_DOTENV=1
export LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}"

# The update must be a commit that can be found again (and eas update refuses a dirty tree anyway).
[[ -z $(git status --porcelain -- .) ]] || { echo "app/ has uncommitted changes; commit first" >&2; exit 1; }
REVISION=$(git rev-parse --short HEAD)

case "$CHANNEL" in
  founder)
    # The same values as scripts/founder-ios.sh release, so the bundle and the fingerprint match that build.
    [[ -f .env.founder ]] || { echo "app/.env.founder is missing" >&2; exit 1; }
    set -a
    # shellcheck disable=SC1091
    source .env.founder
    set +a
    export EXPO_PUBLIC_DEV_TOOLS=0
    export EXPO_PUBLIC_WEB_BASE_URL="${EXPO_PUBLIC_WEB_BASE_URL:-https://conga.churntech.com}"
    # The founder values come from .env.founder; the EAS "development" environment must hold no
    # EXPO_PUBLIC_ variable (it would override them, and app.config.ts would then refuse the export).
    ENVIRONMENT=development
    PLATFORM=ios
    ;;
  preview|production)
    # The values eas.json gives this profile's builds; the publishable key comes from the EAS environment
    # of the same name, loaded by `eas env:exec` below so that every evaluation of app.config.ts sees it.
    while IFS= read -r line; do export "${line?}"; done < <(node -e '
      const env = require("./eas.json").build[process.argv[1]].env || {};
      for (const [k, v] of Object.entries(env)) console.log(`${k}=${v}`);' "$CHANNEL")
    ENVIRONMENT=$CHANNEL
    PLATFORM=all
    ;;
  *) usage ;;
esac

[[ ${EAS_PROJECT_ID:-} =~ ^[0-9a-f-]{36}$ ]] || { echo "EAS_PROJECT_ID is not set (eas init; docs/release/OTA-UPDATES.md)" >&2; exit 1; }

EAS="npx --yes eas-cli@25.1.1"
UPDATE_ARGS=(--channel "$CHANNEL" --environment "$ENVIRONMENT" --platform "$PLATFORM" --message "$MESSAGE ($REVISION)" --non-interactive)

if [[ ${DRY_RUN:-} == 1 ]]; then
  # Everything except the upload: the config guard, the bundle export and the runtime version.
  CONGA_UPDATE_CHANNEL=$CHANNEL npx expo config --type public >/dev/null
  CONGA_UPDATE_CHANNEL=$CHANNEL npx expo export --platform "$PLATFORM" --output-dir "${TMPDIR:-/tmp}/conga-update-dry-run"
  for p in $([[ $PLATFORM == all ]] && echo ios android || echo "$PLATFORM"); do
    echo "runtime version ($p): $(npx expo-updates runtimeversion:resolve --platform "$p" | tail -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).runtimeVersion))')"
  done
  echo "dry run only: nothing uploaded"
  exit 0
fi

if [[ $CHANNEL == founder ]]; then
  CONGA_UPDATE_CHANNEL=$CHANNEL $EAS update "${UPDATE_ARGS[@]}"
else
  printf -v CMD 'CONGA_UPDATE_CHANNEL=%q %s update' "$CHANNEL" "$EAS"
  for a in "${UPDATE_ARGS[@]}"; do printf -v CMD '%s %q' "$CMD" "$a"; done
  $EAS env:exec "$ENVIRONMENT" "$CMD" --non-interactive
fi
