// GET ?uploadId=... -> { uploadStatus, assetStatus, playbackId, responseStatus }
// The app polls this after its upload finishes (webhooks also arrive, but polling works
// in local development and when a webhook is late). Marks the response live server-side.
import { corsHeaders, json, mux, prewarm, type MuxAsset, type MuxUpload } from "../_shared/mux.ts";
import { adminClient, callerClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const caller = await callerClient(req);
  if (!caller) return json({ error: "unauthorized" }, 401);
  const uploadId = new URL(req.url).searchParams.get("uploadId");
  if (!uploadId) return json({ error: "uploadId required" }, 400);
  // Only the author may ask about their own upload.
  const { data: own } = await caller.client.from("responses").select("id,status,mux_playback_id").eq("mux_upload_id", uploadId).maybeSingle();
  if (!own) return json({ error: "not_found" }, 404);
  if (own.status === "live") return json({ uploadStatus: "asset_created", assetStatus: "ready", playbackId: own.mux_playback_id, responseStatus: "live" });
  try {
    const upload = await mux<MuxUpload>(`/video/v1/uploads/${uploadId}`);
    if (!upload.asset_id) return json({ uploadStatus: upload.status, assetStatus: null, playbackId: null, responseStatus: own.status, error: upload.error ?? null });
    const asset = await mux<MuxAsset>(`/video/v1/assets/${upload.asset_id}`);
    const playbackId = asset.playback_ids?.find((p) => p.policy === "public")?.id ?? null;
    let responseStatus = own.status;
    if (asset.status === "ready" && playbackId) {
      const admin = adminClient();
      const { data } = await admin.rpc("mark_response_live", {
        p_upload_id: uploadId, p_asset_id: asset.id, p_playback_id: playbackId,
        p_duration_ms: asset.duration ? Math.round(asset.duration * 1000) : null,
      });
      responseStatus = data?.status ?? responseStatus;
      await prewarm(playbackId);
    }
    return json({ uploadStatus: upload.status, assetStatus: asset.status, playbackId, responseStatus, errors: asset.errors ?? null });
  } catch (e) {
    console.error(e);
    return json({ error: "mux_unavailable" }, 502);
  }
});
