#!/usr/bin/env bash
# Signs T1 in with the six-digit code from its inbox, privately: the code is read without echo and
# never printed; the token goes to PT_TOKEN_FILE (mode 600). docs/release/PROVIDER-TESTS.md section 2.
#   scripts/provider-t1-verify.sh        (T1's address is read from ~/.conga-provider/t1.email)
set -u
# Closed 21 Oct: T1's tests are done, and E1 to E3 run on T2 (scripts/provider-member-verify.sh).
# provider-member.mjs refuses to act as T1 in any case.
echo "provider-t1-verify.sh is retired: T1's tests are closed; use scripts/provider-member-verify.sh for T2" >&2
exit 2
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
# shellcheck disable=SC1091
source scripts/provider-env.sh >/dev/null || exit 1
ADDR_FILE="$HOME/.conga-provider/t1.email"
[ -s "$ADDR_FILE" ] || { echo "no address file at $ADDR_FILE" >&2; exit 1; }
printf 'Six-digit sign-in code for T1 (not shown as you type): '
read -r -s CODE
echo
case "$CODE" in [0-9][0-9][0-9][0-9][0-9][0-9]) ;; *) echo "that is not six digits; nothing sent" >&2; exit 1 ;; esac
node scripts/provider-member.mjs verify "$(cat "$ADDR_FILE")" "$CODE" | sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/<address>/g'
unset CODE
if [ -s "$PT_TOKEN_FILE" ]; then echo "token saved to $PT_TOKEN_FILE ($(stat -f '%Sp' "$PT_TOKEN_FILE"))"; else echo "no token saved" >&2; exit 1; fi
