#!/usr/bin/env bash
# Moderator tools for the beta team (SPEC.md Section 17): queues and actions on the local
# stack (default) or the linked hosted project (LINKED=1). Every action is logged server-side
# with who, when and why. The moderator name comes from MODERATOR (default: git user.name).
#
#   scripts/moderate.sh reports                      open reports, oldest first
#   scripts/moderate.sh reviews                      pending review requests
#   scripts/moderate.sh log <account-id>             every action on an account
#   scripts/moderate.sh remove-video <id> "<reason>" [note]
#   scripts/moderate.sh remove-comment <id> "<reason>" [note]
#   scripts/moderate.sh restrict <account-id> <until ISO date> "<reason>" [note]
#   scripts/moderate.sh suspend <account-id> "<reason>" [note]
#   scripts/moderate.sh restore-account <account-id> "<reason>" [note]
#   scripts/moderate.sh restore-video <id> "<reason>" [note]
#   scripts/moderate.sh close-report <report-id>
#   scripts/moderate.sh decide <action-id> upheld|reversed [note]
#   scripts/moderate.sh suggestions                  prompt suggestions in review
#   scripts/moderate.sh approve <suggestion-id> [keep-name true|false] [note]
#   scripts/moderate.sh decline <suggestion-id> singles_out|too_similar|promotion|private_details|unclear|other [note]
#
# The reason is shown to the person (A-Removed, A-Restricted, LV-Suspended); the note is internal.
# There is no standalone warning: a warning is the removal notice itself (A-Removed).
set -euo pipefail
cd "$(dirname "$0")/.."

MOD="${MODERATOR:-$(git config user.name 2>/dev/null || echo moderator)}"
target=(--local)
if [[ "${LINKED:-}" == "1" ]]; then target=(--linked); fi

q() { supabase db query "${target[@]}" "$1"; }
lit() { printf "%s" "$1" | sed "s/'/''/g"; }
note() { if [[ -n "${1:-}" ]]; then printf "'%s'" "$(lit "$1")"; else printf "null"; fi; }

cmd="${1:-}"; shift || true
case "$cmd" in
  reports)         q "select jsonb_pretty(public.mod_reports_queue())" ;;
  reviews)         q "select jsonb_pretty(public.mod_review_queue())" ;;
  log)             q "select jsonb_pretty(public.mod_account_log('$1'))" ;;
  remove-video)    q "select public.mod_remove_video('$1', '$(lit "$2")', '$(lit "$MOD")', $(note "${3:-}"))" ;;
  remove-comment)  q "select public.mod_remove_comment('$1', '$(lit "$2")', '$(lit "$MOD")', $(note "${3:-}"))" ;;
  restrict)        q "select public.mod_restrict('$1', '$2'::timestamptz, '$(lit "$3")', '$(lit "$MOD")', $(note "${4:-}"))" ;;
  suspend)         q "select public.mod_suspend('$1', '$(lit "$2")', '$(lit "$MOD")', $(note "${3:-}"))" ;;
  restore-account) q "select public.mod_restore_account('$1', '$(lit "$2")', '$(lit "$MOD")', $(note "${3:-}"))" ;;
  restore-video)   q "select public.mod_restore_video('$1', '$(lit "$2")', '$(lit "$MOD")', $(note "${3:-}"))" ;;
  close-report)    q "select public.mod_close_report('$1', '$(lit "$MOD")')" ;;
  decide)          q "select public.mod_decide_review('$1', '$2', '$(lit "$MOD")', $(note "${3:-}"))" ;;
  suggestions)     q "select jsonb_pretty(public.mod_suggestions_queue())" ;;
  approve)         q "select public.mod_approve_suggestion('$1', '$(lit "$MOD")', ${2:-true}, $(note "${3:-}"))" ;;
  decline)         q "select public.mod_decline_suggestion('$1', '$2', '$(lit "$MOD")', $(note "${3:-}"))" ;;
  *) sed -n '2,23p' "$0"; exit 1 ;;
esac
