#!/usr/bin/env bash
# Team tool: publish a prompt (SPEC.md Section 5: the team publishes prompts directly).
#   scripts/create-prompt.sh "Be honest about the place you live."            # global, live now
#   scripts/create-prompt.sh "What should every newcomer unlearn?" canggu      # tied to a place
#   FEATURED=2026-10-06 scripts/create-prompt.sh "Tonight's prompt text"       # tonight's prompt for that day
#   LINKED=1 ...                                                               # hosted project
set -euo pipefail
cd "$(dirname "$0")/.."
TEXT=${1:?prompt text required}
PLACE=${2:-}
if [ -n "$PLACE" ]; then PLACE_SQL="'$PLACE'"; else PLACE_SQL="null"; fi
if [ -n "${FEATURED:-}" ]; then FEAT_SQL="'$FEATURED'::date"; else FEAT_SQL="null"; fi
SQL="select public.team_create_prompt(\$q\$$TEXT\$q\$, $PLACE_SQL, $FEAT_SQL) as id;"
if [ "${LINKED:-}" = "1" ]; then supabase db query --linked "$SQL"; else supabase db query --local "$SQL"; fi
