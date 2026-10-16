#!/usr/bin/env bash
# C2w-c (docs/release/PROVIDER-TESTS.md section 5): one live cancellation by the worker, as one command,
# for Nemat to run (the lead's shell may not write the function's secret store):
#   1. supabase secrets set MUX_CLEANUP_MODE=live        (the function's own switch)
#   2. one controlled drain with the database switch live inside one transaction, restricted to the
#      expected job, through scripts/provider-drain.sh (it sets the database switch off again, always)
#   3. supabase secrets unset MUX_CLEANUP_MODE           (always, also when 2 fails)
# Nothing else runs while the function switch is live: the database switch is off except inside the
# drain's transaction, so the scheduled worker cannot act.
#   scripts/provider-c2w-c.sh <job id>
set -u
JOB="${1:?job id}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO"
# shellcheck disable=SC1091
source scripts/provider-env.sh >/dev/null || exit 1
REF=picvoavfxnajfjkqawju
LOG="$REPO/docs/release/c2w-c-$(date -u +%Y%m%dT%H%M%SZ).log"
unset_mode() { supabase secrets unset MUX_CLEANUP_MODE --project-ref "$REF" 2>&1 | grep -v -i 'new version\|recommend' | tee -a "$LOG"; echo "function switch unset at $(date -u '+%H:%M:%S UTC')" | tee -a "$LOG"; }
trap unset_mode EXIT
echo "C2w-c start $(date -u '+%Y-%m-%d %H:%M:%S UTC'), job $JOB" | tee "$LOG"
supabase secrets set MUX_CLEANUP_MODE=live --project-ref "$REF" 2>&1 | grep -v -i 'new version\|recommend' | tee -a "$LOG"
echo "function switch live at $(date -u '+%H:%M:%S UTC')" | tee -a "$LOG"
PROVIDER_WRITE_STEP=C2w-c scripts/provider-drain.sh hosted live "Nemat: C2w-c cancellation" "$JOB" 2>&1 | tee -a "$LOG"
echo "drain exit=${PIPESTATUS[0]}" | tee -a "$LOG"
