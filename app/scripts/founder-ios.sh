#!/usr/bin/env bash
# Founder-only iPhone build: signed by the free Personal Team, pointed at the hosted project,
# without Sign in with Apple and push (app.config.ts, EXPO_PUBLIC_FOUNDER_BUILD). Loads ONLY
# app/.env.founder (EXPO_NO_DOTENV=1), so the local stack in app/.env can never leak in.
#
#   DEVICE=<udid> app/scripts/founder-ios.sh release   # standalone: JS bundled in, no Metro
#   DEVICE=<udid> app/scripts/founder-ios.sh debug     # dev client, then starts Metro on this Mac
#   INSTALL=0 DEVICE=<udid> app/scripts/founder-ios.sh release   # build and sign only; prints the install step
#
# The iPhone's UDID: `xcrun devicectl list devices`. Xcode must be signed in to the Apple ID of
# the Personal Team (Xcode > Settings > Accounts); xcodebuild then creates the free profile for
# app.shortcut.founder (`expo run:ios` cannot, it does not pass -allowProvisioningUpdates).
#
# ios/ is generated (git-ignored) and is regenerated here with --clean, because the founder build
# has its own bundle id and entitlements. Run `npx expo prebuild --clean` with the normal
# app/.env afterwards to get the regular project back.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env.founder
[[ -f $ENV_FILE ]] || { echo "app/$ENV_FILE is missing" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export EXPO_NO_DOTENV=1
# CocoaPods fails with an encoding error when the shell has no UTF-8 locale.
export LANG="${LANG:-en_US.UTF-8}" LC_ALL="${LC_ALL:-en_US.UTF-8}"

[[ ${EXPO_PUBLIC_FOUNDER_BUILD:-} == 1 ]] || { echo "EXPO_PUBLIC_FOUNDER_BUILD=1 is required" >&2; exit 1; }
[[ ${EXPO_PUBLIC_SUPABASE_URL:-} =~ ^https://[a-z0-9]{20}\.supabase\.co$ ]] || { echo "EXPO_PUBLIC_SUPABASE_URL must be the hosted project" >&2; exit 1; }
[[ ${EXPO_PUBLIC_SUPABASE_ANON_KEY:-} == sb_publishable_* ]] || { echo "EXPO_PUBLIC_SUPABASE_ANON_KEY must be the sb_publishable_ key" >&2; exit 1; }
[[ -n ${APPLE_TEAM_ID:-} ]] || { echo "APPLE_TEAM_ID (the Personal Team) is required" >&2; exit 1; }
[[ -n ${DEVICE:-} ]] || { echo "DEVICE=<iPhone UDID> is required (xcrun devicectl list devices)" >&2; exit 1; }

case "${1:-}" in
  debug) CONFIGURATION=Debug ;;
  release) CONFIGURATION=Release ;;
  *) echo "usage: DEVICE=<udid> $0 debug|release" >&2; exit 1 ;;
esac

if [[ $CONFIGURATION == Release ]]; then
  # The standalone build is the product: no development controls, whatever .env.founder says for Debug,
  # and shared links on the links domain. publish-update.sh founder sets the same values, so an update
  # for this build carries them too.
  export EXPO_PUBLIC_DEV_TOOLS=0
  export EXPO_PUBLIC_WEB_BASE_URL="${EXPO_PUBLIC_WEB_BASE_URL:-https://conga.churntech.com}"
  [[ $EXPO_PUBLIC_WEB_BASE_URL =~ ^https://[a-z0-9.-]+$ ]] || { echo "EXPO_PUBLIC_WEB_BASE_URL must be https://<host>" >&2; exit 1; }
fi

npx expo prebuild --platform ios --clean
xcodebuild -workspace ios/Conga.xcworkspace -scheme Conga -configuration "$CONFIGURATION" \
  -destination "id=$DEVICE" -derivedDataPath ios/build \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
APP="ios/build/Build/Products/$CONFIGURATION-iphoneos/Conga.app"
if [[ -f $APP/EXUpdates.bundle/fingerprint ]]; then
  echo "runtime version (fingerprint) of this build: $(cat "$APP/EXUpdates.bundle/fingerprint")"
fi
if [[ ${INSTALL:-1} == 0 ]]; then
  echo "built, not installed: $APP"
  echo "install: xcrun devicectl device install app --device $DEVICE \"$PWD/$APP\" && xcrun devicectl device process launch --device $DEVICE app.shortcut.founder"
  exit 0
fi
# Installing over the installed app.shortcut.founder keeps its data (sign-in, waiting recordings), as long
# as it is signed by the same team; iOS refuses, and deletes nothing, if the team differs.
xcrun devicectl device install app --device "$DEVICE" "$APP"
xcrun devicectl device process launch --device "$DEVICE" app.shortcut.founder

# The Debug build loads its JS from Metro on this Mac (same Wi-Fi as the iPhone).
if [[ $CONFIGURATION == Debug ]]; then
  exec npx expo start --dev-client
fi
