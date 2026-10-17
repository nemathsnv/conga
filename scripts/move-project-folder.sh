#!/usr/bin/env bash
# Moves the main checkout (and every worktree inside it) to a new folder and repairs Git's worktree
# links in both directions, keeping every commit, branch, worktree and uncommitted change
# (docs/release/CONGA-RENAME.md section 6). Run it by hand, when no session, editor, Metro, Xcode
# build or local Supabase stack is using the folder:
#
#   scripts/move-project-folder.sh /Users/nemathsnv/Projects/conga            # dry run: checks only
#   scripts/move-project-folder.sh /Users/nemathsnv/Projects/conga --move     # the move
#
# Worktrees outside the main checkout are repaired too (their own path does not change). Branch
# names and worktree folder names are not changed: active sessions and reports refer to them.
set -euo pipefail

NEW="${1:-}"
MODE="${2:-}"
[[ -n $NEW ]] || { echo "usage: $0 <new absolute path> [--move]" >&2; exit 2; }
[[ $NEW == /* ]] || { echo "the new path must be absolute" >&2; exit 2; }

OLD="$(cd "$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)/.." && pwd -P)"
[[ -d $OLD/.git ]] || { echo "not a main checkout: $OLD" >&2; exit 1; }
[[ ! -e $NEW ]] || { echo "already exists: $NEW" >&2; exit 1; }
[[ -d $(dirname "$NEW") ]] || { echo "parent folder missing: $(dirname "$NEW")" >&2; exit 1; }
case "$NEW/" in "$OLD"/*) echo "the new path is inside the old one" >&2; exit 1 ;; esac

echo "main checkout: $OLD"
echo "new path:      $NEW"

# Every worktree, with its new path (worktrees under the main checkout move with it).
WORKTREES=()
NEW_PATHS=()
while read -r line; do
  path="${line#worktree }"
  [[ $path == "$OLD" ]] && continue
  WORKTREES+=("$path")
  case "$path/" in "$OLD"/*) NEW_PATHS+=("$NEW${path#"$OLD"}") ;; *) NEW_PATHS+=("$path") ;; esac
done < <(git -C "$OLD" worktree list --porcelain | grep '^worktree ')
echo "worktrees:     ${#WORKTREES[@]}"

# Refuse while anything runs inside the folder: its working directory would vanish.
BUSY="$(lsof -a -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | grep -F "$OLD" | grep -v -x -F "$(pwd -P)" || true)"
if [[ -n $BUSY ]]; then
  echo "processes have their working directory inside $OLD; close them first:" >&2
  echo "$BUSY" | sort -u >&2
  [[ $MODE == --move ]] && exit 1
fi
# A running local Supabase stack mounts supabase/ from the checkout it was started in.
MOUNTED=""
if command -v docker >/dev/null; then
  for c in $(docker ps --format '{{.Names}}' 2>/dev/null); do
    if docker inspect --format '{{range .Mounts}}{{.Source}}{{"\n"}}{{end}}' "$c" 2>/dev/null | grep -q -F "$OLD/"; then MOUNTED+="$c "; fi
  done
fi
if [[ -n $MOUNTED ]]; then
  echo "running containers mount files from $OLD: $MOUNTED; stop them first (supabase stop keeps the data)." >&2
  [[ $MODE == --move ]] && exit 1
fi

if [[ $MODE != --move ]]; then
  echo "dry run: nothing moved. Add --move to move."
  exit 0
fi

# Record each worktree's state, to compare after the move.
before="$(for w in "$OLD" "${WORKTREES[@]}"; do [[ -d $w ]] && git -C "$w" rev-parse HEAD && git -C "$w" status --porcelain | shasum; done)"

mv "$OLD" "$NEW"
cd "$NEW"
git worktree repair "${NEW_PATHS[@]}"

after="$(for w in "$NEW" "${NEW_PATHS[@]}"; do [[ -d $w ]] && git -C "$w" rev-parse HEAD && git -C "$w" status --porcelain | shasum; done)"
git worktree list
if [[ $before != "$after" ]]; then
  echo "WARNING: a worktree's HEAD or status differs after the move; check git worktree list above." >&2
  exit 1
fi
echo "moved; every worktree's HEAD and status are unchanged."
echo "Not moved by this script (do by hand if wanted): Claude Code's per-folder memory and sessions under"
echo "  ~/.claude/projects/$(printf '%s' "$OLD" | tr '/' '-') (the new folder gets a new, empty entry), and any"
echo "  editor or terminal tab still pointing at $OLD."
