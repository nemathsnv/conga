#!/usr/bin/env bash
# CP0'-a, write 1: one closed-beta invite for the disposable test account T2, and nothing else
# (docs/release/PROVIDER-SESSION.md). One guarded transaction through provider-sql.sh: it requires
# exactly the expected number of invites and no unused, unexpired one, then calls
# team_create_invite(null, 'canggu', null, null), as scripts/create-invite.sh does. The new code is
# then read with a plain select and written to the invite file (mode 600); it is never printed.
#
#   PROVIDER_WRITE_STEP=CP0a-invite scripts/provider-t2-invite.sh <hosted|local:<folder>> <expected invites before> <invite file>
#
# Refuses if the invite file already exists (an invite was already made for T2).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SQL="$REPO/scripts/provider-sql.sh"
TARGET="${1:-}"; EXPECTED="${2:-}"; FILE="${3:-}"
[ -n "$TARGET" ] && [[ "$EXPECTED" =~ ^[0-9]+$ ]] && [ -n "$FILE" ] || { echo "usage: $0 <hosted|local:<folder>> <expected invites before> <invite file>" >&2; exit 2; }
[ -e "$FILE" ] && { echo "refusing: $FILE exists (an invite was already made for T2)" >&2; exit 2; }
[ "$TARGET" != hosted ] || [ "${PROVIDER_WRITE_STEP:-}" = CP0a-invite ] || { echo "refusing: the hosted write needs PROVIDER_WRITE_STEP=CP0a-invite" >&2; exit 2; }

rows() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j._tag==="Error"){console.error(j.error.message);process.exit(1)}process.stdout.write(JSON.stringify(Array.isArray(j)?j:(j.rows||[])))})'; }

GUARD="do \$guard\$
begin
  if (select count(*) from public.invites) <> ${EXPECTED} then
    raise exception 'precondition_failed: % invites, expected ${EXPECTED}', (select count(*) from public.invites);
  end if;
  if exists (select 1 from public.invites where redeemed_by is null and cancelled_at is null and expires_at > now()) then
    raise exception 'precondition_failed: an unused invite already exists';
  end if;
  perform public.team_create_invite(null, 'canggu', null, null);
  if (select count(*) from public.invites) <> ${EXPECTED} + 1 then raise exception 'precondition_failed: not exactly one new invite'; end if;
end
\$guard\$"
status=0
out="$("$SQL" "$TARGET" "$GUARD" 2>&1)" || status=$?
if [ "$status" != 0 ] || printf '%s' "$out" | grep -q '"_tag":"Error"'; then
  echo "the guarded write failed; nothing changed: $(printf '%s' "$out" | grep -oE 'precondition_failed[^"\\]*|refusing: .*' | head -1)" >&2
  exit 1
fi

# Read back the one unused invite (plain select) and keep its code in the file only.
new="$("$SQL" "$TARGET" "select id, code, cohort, inviter_id, expires_at from public.invites where redeemed_by is null and cancelled_at is null and expires_at > now() order by created_at desc" | rows)"
umask 077
printf '%s' "$new" | node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    const r=JSON.parse(s);
    if (r.length!==1 || r[0].inviter_id!==null || r[0].cohort!=="canggu") { console.error(`expected exactly one unused team invite, found ${r.length}`); process.exit(1); }
    require("fs").writeFileSync(process.argv[1], r[0].code, { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ invite: r[0].id, cohort: r[0].cohort, expires_at: r[0].expires_at, code: "(saved to the invite file, not shown)" }));
  })' "$FILE"
