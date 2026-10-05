// POST -> mints a Mux direct-upload URL. Body: { label?: string }
// Returns { uploadId, uploadUrl, createdAt }.
import { corsHeaders, json, mux } from "../_shared/mux.ts";

interface MuxUpload {
  id: string;
  url: string;
  status: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const { label } = await req.json().catch(() => ({ label: undefined }));
    const upload = await mux<MuxUpload>("/video/v1/uploads", {
      method: "POST",
      body: JSON.stringify({
        cors_origin: "*",
        timeout: 3600,
        new_asset_settings: {
          playback_policies: ["public"],
          video_quality: "basic",
          passthrough: label ?? "shortcut-spike",
        },
      }),
    });
    return json({ uploadId: upload.id, uploadUrl: upload.url, createdAt: Date.now() });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
