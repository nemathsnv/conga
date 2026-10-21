#!/usr/bin/env bash
# Exports the provider-test environment (docs/release/PROVIDER-TESTS.md section 2) for the HOSTED
# project, reading the public Supabase URL and publishable key from the founder checkout's app/.env.founder.
# Source it, do not run it:   source scripts/provider-env.sh
# It prints no value. It sets the approval flags, so source it only after Nemat's go for a test.
# The main checkout (where the git-ignored .env files live), found from git so the scripts keep
# working from any worktree and after the project folder is renamed (docs/release/CONGA-RENAME.md).
MAIN_CHECKOUT="$(cd "$(git -C "$(dirname "${BASH_SOURCE[0]:-$0}")" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
ENV_FILE="${CONGA_APP_ENV:-$MAIN_CHECKOUT/app/.env.founder}"   # the file that names the hosted project (app/.env points at the local stack)
if [ ! -r "$ENV_FILE" ]; then echo "provider-env: $ENV_FILE not readable" >&2; return 1 2>/dev/null || exit 1; fi
export PT_SUPABASE_URL="$(sed -n 's/^EXPO_PUBLIC_SUPABASE_URL=//p' "$ENV_FILE" | tr -d '"' | head -1)"
export PT_ANON_KEY="$(sed -n 's/^EXPO_PUBLIC_SUPABASE_ANON_KEY=//p' "$ENV_FILE" | tr -d '"' | head -1)"
export PT_HOSTED_REF=picvoavfxnajfjkqawju PT_APPROVED_BY_NEMAT=yes
export PROVIDER_HOSTED_REF=picvoavfxnajfjkqawju PROVIDER_APPROVED_BY_NEMAT=yes
# The test account the member scripts act as. Only T2 (E1 to E3): T1's tests are closed, and
# provider-member.mjs refuses T1 and the founder whatever is set here. Each member has its own files
# in ~/.conga-provider (mode 600): <m>.email (written by Nemat), <m>.id (by `verify --new`),
# <m>.token, <m>.invite (CP0'-a), <m>.respond.json (respond's journal).
PT_MEMBER="${PT_MEMBER:-t2}"
if [ "$PT_MEMBER" != "t2" ]; then echo "provider-env: PT_MEMBER must be t2 (T1 is closed)" >&2; unset PT_APPROVED_BY_NEMAT PROVIDER_APPROVED_BY_NEMAT; return 1 2>/dev/null || exit 1; fi
PT_DIR="$HOME/.conga-provider"
export PT_MEMBER PT_EMAIL_FILE="$PT_DIR/$PT_MEMBER.email" PT_ID_FILE="$PT_DIR/$PT_MEMBER.id" PT_INVITE_FILE="$PT_DIR/$PT_MEMBER.invite"
export PT_TOKEN_FILE="$PT_DIR/$PT_MEMBER.token" PT_JOURNAL_FILE="$PT_DIR/$PT_MEMBER.respond.json"
if [ -s "$PT_ID_FILE" ]; then export PT_EXPECT_USER="$(tr -d '[:space:]' < "$PT_ID_FILE")"; else unset PT_EXPECT_USER; fi
export MUXENV="${MUXENV:-$MAIN_CHECKOUT/supabase/.env.mux-hosted}"
mkdir -p "$(dirname "$PT_TOKEN_FILE")" && chmod 700 "$(dirname "$PT_TOKEN_FILE")"
case "$PT_SUPABASE_URL" in https://picvoavfxnajfjkqawju.supabase.co) echo "provider-env: hosted project, token file $PT_TOKEN_FILE" ;; *) echo "provider-env: app/.env does not point at the hosted project (URL host hidden); refusing" >&2; unset PT_APPROVED_BY_NEMAT PROVIDER_APPROVED_BY_NEMAT; return 1 2>/dev/null || exit 1 ;; esac
