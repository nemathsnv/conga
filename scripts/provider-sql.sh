#!/usr/bin/env bash
# One SQL statement against a local stack or, only when explicitly enabled, the hosted project,
# through `supabase db query` (the same command on both, so a local rehearsal exercises the hosted
# path's tool and output). Prints the rows as JSON. Used by the provider tests
# (docs/release/PROVIDER-TESTS.md) and scripts/provider-drain.sh.
#
#   scripts/provider-sql.sh <target> "<one SQL statement>"
#   scripts/provider-sql.sh <target> -f <file with one SQL statement>
#
# <target>:
#   local:<stack folder>   the folder whose supabase/config.toml names the stack; its DB_URL comes from
#                          `supabase status -o env` there. The founder's stack (project_id "shortcut")
#                          is refused unless PROVIDER_ALLOW_MAIN_STACK=yes.
#   hosted                 needs PROVIDER_HOSTED_REF=<project ref> and PROVIDER_APPROVED_BY_NEMAT=yes;
#                          a statement that is not a plain select also needs PROVIDER_WRITE_STEP=<the
#                          test step Nemat approved, e.g. C2c>. Runs from an empty scratch folder,
#                          with `--linked --project-ref` (the Management API), never `supabase link`.
#
# One statement only: `supabase db query --db-url` runs it as a prepared statement. A guarded
# change is therefore one `do $$ ... $$` block, which is one transaction by itself.
set -euo pipefail

TARGET="${1:-}"
shift || true
if [ "${1:-}" = "-f" ]; then SQL="$(cat "$2")"; else SQL="${1:-}"; fi
[ -n "$TARGET" ] && [ -n "$SQL" ] || { echo "usage: $0 <local:<folder>|hosted> \"<sql>\" | -f <file>" >&2; exit 2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
printf '%s\n' "$SQL" > "$TMP/q.sql"

# A write: anything but a select, or a select calling a function known to change something.
# (Conservative by text; the read-only checks in docs/release/PROVIDER-TESTS.md and
# docs/release/MUX-CLEANUP-UNATTENDED.md call only mux_cleanup_overview, mux_cleanup_health and plain
# selects. mux_cleanup_alert sends an email, so it counts as a write.)
first="$(printf '%s' "$SQL" | sed -e 's/--.*$//' | tr -s ' \n\t' ' ' | sed -e 's/^ *//' | cut -d' ' -f1 | tr '[:upper:]' '[:lower:]')"
WRITE=no
case "$first" in select|with) ;; *) WRITE=yes ;; esac
if printf '%s' "$SQL" | tr '[:upper:]' '[:lower:]' | grep -Eq '(^|[^a-z_])(insert|update|delete|merge|do|call|alter|create|drop|grant|revoke|truncate|copy|vacuum|nextval|setval|pg_terminate_backend|create_secret|update_secret)([^a-z_]|$)|set_mode|set_deletion_cap|resume_deletions|mux_cleanup_alert *\(|run_mux_cleanup|mux_cleanup_retry|purge_|delete_account|get_onboarding_state|mod_[a-z_]*\(|begin_submission_abandon|finish_submission_abandon'; then
  WRITE=yes
fi

case "$TARGET" in
  local:*)
    STACK="${TARGET#local:}"
    PROJECT="$(sed -n 's/^project_id = "\(.*\)"$/\1/p' "$STACK/supabase/config.toml" | head -1)"
    if [ "$PROJECT" = "shortcut" ] && [ "${PROVIDER_ALLOW_MAIN_STACK:-}" != "yes" ]; then
      echo "refusing: $STACK is the main local stack (project_id shortcut)" >&2; exit 2
    fi
    DB_URL="$(cd "$STACK" && supabase status -o env 2>/dev/null | sed -n 's/^DB_URL="\(.*\)"$/\1/p')"
    case "$DB_URL" in
      postgresql://*@127.0.0.1:*|postgresql://*@localhost:*) ;;
      *) echo "refusing: no local DB_URL for $STACK" >&2; exit 2 ;;
    esac
    supabase db query --db-url "$DB_URL?sslmode=disable" -f "$TMP/q.sql" --output-format json 2>/dev/null
    ;;
  hosted)
    REF="${PROVIDER_HOSTED_REF:-}"
    [[ "$REF" =~ ^[a-z0-9]{20}$ ]] || { echo "refusing: PROVIDER_HOSTED_REF is not a project ref" >&2; exit 2; }
    [ "${PROVIDER_APPROVED_BY_NEMAT:-}" = "yes" ] || { echo "refusing: the hosted run is not enabled (PROVIDER_APPROVED_BY_NEMAT)" >&2; exit 2; }
    if [ "$WRITE" = yes ] && [ -z "${PROVIDER_WRITE_STEP:-}" ]; then
      echo "refusing: a write on the hosted project needs PROVIDER_WRITE_STEP=<approved step>" >&2; exit 2
    fi
    [ "$WRITE" = yes ] && echo "hosted write for step ${PROVIDER_WRITE_STEP}" >&2
    (cd "$TMP" && supabase db query --linked --project-ref "$REF" -f "$TMP/q.sql" --output-format json 2>/dev/null)
    ;;
  *) echo "unknown target: $TARGET" >&2; exit 2 ;;
esac
