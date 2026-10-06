// POST -> { uploadId, uploadUrl }. Mints a Mux direct-upload URL for the signed-in person.
// Called while they are on Post Review so the URL is ready when they tap Post (spike finding).
import { corsHeaders, json, mux, type MuxUpload } from "../_shared/mux.ts";
import { callerClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const caller = await callerClient(req);
  if (!caller) return json({ error: "unauthorized" }, 401);
  const { data: hasProfile } = await caller.client.rpc("has_profile", { p_account: caller.userId });
  if (!hasProfile) return json({ error: "profile_required" }, 403);
  try {
    const upload = await mux<MuxUpload>("/video/v1/uploads", {
      method: "POST",
      body: JSON.stringify({
        cors_origin: "*",
        timeout: 3600,
        new_asset_settings: {
          playback_policies: ["public"],
          video_quality: "basic",
          passthrough: caller.userId,
        },
      }),
    });
    return json({ uploadId: upload.id, uploadUrl: upload.url });
  } catch (e) {
    console.error(e);
    return json({ error: "mux_unavailable" }, 502);
  }
});
