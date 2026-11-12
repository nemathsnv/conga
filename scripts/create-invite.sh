#!/usr/bin/env bash
# Team tool: create a closed-beta invite code (SPEC.md Section 14, "The team can create
# codes at any time"). Runs team_create_invite() on the database through the Supabase CLI,
# so no app or dashboard editing is involved and the service role never leaves the server.
#
#   scripts/create-invite.sh                 # random code, Canggu cohort, default validity, local database
#   scripts/create-invite.sh PUTU-7K2        # a chosen code
#   scripts/create-invite.sh PUTU-7K2 canggu 30
#   LINKED=1 scripts/create-invite.sh        # against the linked hosted project (asks for the database password)
set -euo pipefail
cd "$(dirname "$0")/.."

CODE=${1:-}
COHORT=${2:-canggu}
DAYS=${3:-}

if [ -n "$CODE" ]; then CODE_SQL="'$CODE'"; else CODE_SQL="null"; fi
if [ -n "$DAYS" ]; then DAYS_SQL="$DAYS"; else DAYS_SQL="null"; fi

SQL="select public.team_create_invite($CODE_SQL, '$COHORT', null, $DAYS_SQL) as code;"

if [ "${LINKED:-}" = "1" ]; then
  supabase db query --linked "$SQL"
else
  supabase db query --local "$SQL"
fi
