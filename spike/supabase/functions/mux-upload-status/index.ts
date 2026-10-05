// GET ?uploadId=... -> { uploadStatus, assetId, assetStatus, playbackId, tracks, maxResolution, duration }
// The app polls this after the PUT finishes to measure "upload finished -> playable".
import { corsHeaders, json, mux } from "../_shared/mux.ts";

interface MuxUpload { id: string; status: string; asset_id?: string; error?: unknown }
interface MuxAsset {
  id: string;
  status: string;
  playback_ids?: { id: string; policy: string }[];
  duration?: number;
  max_stored_resolution?: string;
  resolution_tier?: string;
  tracks?: unknown[];
  errors?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const uploadId = new URL(req.url).searchParams.get("uploadId");
  if (!uploadId) return json({ error: "uploadId required" }, 400);
  try {
    const upload = await mux<MuxUpload>(`/video/v1/uploads/${uploadId}`);
    if (!upload.asset_id) {
      return json({ uploadStatus: upload.status, assetId: null, assetStatus: null, playbackId: null, error: upload.error ?? null });
    }
    const asset = await mux<MuxAsset>(`/video/v1/assets/${upload.asset_id}`);
    const playbackId = asset.playback_ids?.find((p) => p.policy === "public")?.id ?? null;
    return json({
      uploadStatus: upload.status,
      assetId: asset.id,
      assetStatus: asset.status,
      playbackId,
      duration: asset.duration ?? null,
      maxResolution: asset.max_stored_resolution ?? null,
      resolutionTier: asset.resolution_tier ?? null,
      tracks: asset.tracks ?? [],
      errors: asset.errors ?? null,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
