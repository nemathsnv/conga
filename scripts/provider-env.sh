#!/usr/bin/env bash
# Exports the provider-test environment (docs/release/PROVIDER-TESTS.md section 2) for the HOSTED
# project, reading the public Supabase URL and publishable key from the founder checkout's app/.env.founder.
# Source it, do not run it:   source scripts/provider-env.sh
# It prints no value. It sets the approval flags, so source it only after Nemat's go for a test.
ENV_FILE="${SHORTCUT_APP_ENV:-/Users/nemathsnv/Projects/shortcut/app/.env.founder}"   # the file that names the hosted project (app/.env points at the local stack)
if [ ! -r "$ENV_FILE" ]; then echo "provider-env: $ENV_FILE not readable" >&2; return 1 2>/dev/null || exit 1; fi
export PT_SUPABASE_URL="$(sed -n 's/^EXPO_PUBLIC_SUPABASE_URL=//p' "$ENV_FILE" | tr -d '"' | head -1)"
export PT_ANON_KEY="$(sed -n 's/^EXPO_PUBLIC_SUPABASE_ANON_KEY=//p' "$ENV_FILE" | tr -d '"' | head -1)"
export PT_HOSTED_REF=picvoavfxnajfjkqawju PT_APPROVED_BY_NEMAT=yes
export PROVIDER_HOSTED_REF=picvoavfxnajfjkqawju PROVIDER_APPROVED_BY_NEMAT=yes
export PT_TOKEN_FILE="${PT_TOKEN_FILE:-$HOME/.shortcut-provider/t1.token}"
export MUXENV="${MUXENV:-/Users/nemathsnv/Projects/shortcut/supabase/.env.mux-hosted}"
mkdir -p "$(dirname "$PT_TOKEN_FILE")" && chmod 700 "$(dirname "$PT_TOKEN_FILE")"
case "$PT_SUPABASE_URL" in https://picvoavfxnajfjkqawju.supabase.co) echo "provider-env: hosted project, token file $PT_TOKEN_FILE" ;; *) echo "provider-env: app/.env does not point at the hosted project (URL host hidden); refusing" >&2; unset PT_APPROVED_BY_NEMAT PROVIDER_APPROVED_BY_NEMAT; return 1 2>/dev/null || exit 1 ;; esac
