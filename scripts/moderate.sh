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
#   scripts/moderate.sh add-moderator <account-id|username>   let an account use the web admin (supabase/functions/admin)
#   scripts/moderate.sh deactivate-moderator <account-id|username>   turn that access off at once
#   scripts/moderate.sh moderators                   who has web admin access
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

# An account id as given, or a username looked up in the database (never interpolated unchecked).
acct() {
  if [[ "$1" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then printf "'%s'::uuid" "$1"
  elif [[ "$1" =~ ^@?[a-z0-9_.]{1,40}$ ]]; then printf "(select id from public.profiles where username = '%s')" "${1#@}"
  else echo "not an account id or a username: $1" >&2; exit 1; fi
}

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
  add-moderator)        q "select jsonb_pretty(public.mod_add_moderator($(acct "$1"), '$(lit "$MOD")'))" ;;
  deactivate-moderator) q "select public.mod_deactivate_moderator($(acct "$1"))" ;;
  moderators)           q "select jsonb_pretty(public.mod_list_moderators())" ;;
  *) sed -n '2,26p' "$0"; exit 1 ;;
esac
