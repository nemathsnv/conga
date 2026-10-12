// Mux webhook: video.asset.ready -> the response goes live and is pre-warmed.
// Verified with MUX_WEBHOOK_SECRET (Mux-Signature: t=...,v1=...). No user JWT.
import { json, prewarm, verifyMuxSignature, type MuxAsset } from "../_shared/mux.ts";
import { adminClient } from "../_shared/supabase.ts";

export async function handleMuxWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const raw = await req.text();
  if (!(await verifyMuxSignature(req.headers.get("Mux-Signature") ?? "", raw, Deno.env.get("MUX_WEBHOOK_SECRET")))) return json({ error: "bad_signature" }, 401);
  const event = JSON.parse(raw) as { type: string; data: MuxAsset & { upload_id?: string } };
  if (event.type !== "video.asset.ready") return json({ ok: true, ignored: event.type });
  const asset = event.data;
  const playbackId = asset.playback_ids?.find((p) => p.policy === "public")?.id;
  if (!asset.upload_id || !playbackId) return json({ ok: true, ignored: "no upload or playback id" });
  const admin = adminClient();
  const { data, error } = await admin.rpc("mark_response_live", {
    p_upload_id: asset.upload_id, p_asset_id: asset.id, p_playback_id: playbackId,
    p_duration_ms: asset.duration ? Math.round(asset.duration * 1000) : null,
    // The member the upload was minted for; it must be the response's author.
    p_passthrough: asset.passthrough ?? "",
  });
  if (error) return json({ error: "db_failed" }, 500);
  // Acknowledged so Mux does not retry; the response is left as it was.
  if (data?.status === "owner_mismatch") {
    console.error("owner_mismatch", asset.upload_id);
    return json({ ok: true, ignored: "owner_mismatch" });
  }
  await prewarm(playbackId);
  return json({ ok: true, response: data });
}
