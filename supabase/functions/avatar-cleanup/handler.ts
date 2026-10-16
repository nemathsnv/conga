// Removes queued profile photos from the public avatars bucket (migration
// 20261016000203_avatar_cleanup.sql): photos that were replaced or removed, and every photo of an
// account that was purged or otherwise removed. The database cannot delete Storage files itself
// (Supabase refuses DELETE on storage.objects outside the Storage API), so it queues the names and
// this function removes them through the Storage API with the service role.
// Called by pg_cron through pg_net (public.run_avatar_cleanup) with the key stored in Vault as
// avatar_cleanup_key; the same value is this function's AVATAR_CLEANUP_KEY secret. No user JWT.
import { bearerMatches } from "../_shared/client.ts";
import { json } from "../_shared/mux.ts";
import { adminClient } from "../_shared/supabase.ts";

const BATCH = 100;
const BUCKET = "avatars";

export async function handleAvatarCleanup(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!bearerMatches(req.headers.get("Authorization"), Deno.env.get("AVATAR_CLEANUP_KEY"))) return json({ error: "unauthorized" }, 401);

  const admin = adminClient();
  const { data, error } = await admin.rpc("avatar_cleanup_due", { p_limit: BATCH });
  if (error) return json({ error: "db_failed" }, 500);
  const names = ((data ?? []) as string[]).filter((n) => typeof n === "string" && n.length > 0);
  if (names.length === 0) return json({ removed: 0, failed: 0 });

  // Storage answers with the objects it removed; a name it no longer has is simply absent, which
  // is the result wanted, so every name of a successful call counts as removed.
  const { error: removeError } = await admin.storage.from(BUCKET).remove(names);
  const removed = removeError ? [] : names;
  const failed = removeError ? names : [];
  const { error: finishError } = await admin.rpc("avatar_cleanup_finish", {
    p_removed: removed,
    p_failed: failed,
    p_error: removeError ? String(removeError.message ?? "remove_failed").slice(0, 200) : null,
  });
  if (finishError) return json({ error: "db_failed", removed: removed.length }, 500);
  return json({ removed: removed.length, failed: failed.length });
}
