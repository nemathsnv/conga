#!/usr/bin/env bash
# Signs the test account (T2) in with the six-digit code from its inbox, privately: the code is read
# without echo and never printed; the token goes to PT_TOKEN_FILE (mode 600). The address comes from
# ~/.conga-provider/t2.email, which Nemat writes. docs/release/PROVIDER-TESTS.md section 2.
#   scripts/provider-member-verify.sh --new   the first sign-in: creates the account record and
#                                             writes its id to ~/.conga-provider/t2.id
#   scripts/provider-member-verify.sh         every later sign-in: must be that same account
# provider-member.mjs removes the token on any mismatch (T1, the founder, another or an old account).
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
# shellcheck disable=SC1091
source scripts/provider-env.sh >/dev/null || exit 1
[ -s "$PT_EMAIL_FILE" ] || { echo "no address file at $PT_EMAIL_FILE" >&2; exit 1; }
NEW=""
case "${1:-}" in --new) NEW="--new" ;; "") ;; *) echo "usage: $0 [--new]" >&2; exit 2 ;; esac
printf 'Six-digit sign-in code for %s (not shown as you type): ' "$PT_MEMBER"
read -r -s CODE
echo
case "$CODE" in [0-9][0-9][0-9][0-9][0-9][0-9]) ;; *) echo "that is not six digits; nothing sent" >&2; exit 1 ;; esac
node scripts/provider-member.mjs verify "$(cat "$PT_EMAIL_FILE")" "$CODE" $NEW | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/<address>/g'
STATUS=${PIPESTATUS[0]}
unset CODE
if [ "$STATUS" = 0 ] && [ -s "$PT_TOKEN_FILE" ]; then echo "token saved to $PT_TOKEN_FILE ($(stat -f '%Sp' "$PT_TOKEN_FILE"))"; else echo "no token saved (exit $STATUS)" >&2; exit 1; fi
