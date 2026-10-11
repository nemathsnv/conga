// Mux webhook: video.asset.ready -> the response goes live and is pre-warmed.
// Verified with MUX_WEBHOOK_SECRET (Mux-Signature: t=...,v1=...). No user JWT.
import { json, prewarm, type MuxAsset } from "../_shared/mux.ts";
import { adminClient } from "../_shared/supabase.ts";

async function verify(req: Request, raw: string): Promise<boolean> {
  const secret = Deno.env.get("MUX_WEBHOOK_SECRET");
  if (!secret) return false;
  const header = req.headers.get("Mux-Signature") ?? "";
  const t = /t=(\d+)/.exec(header)?.[1];
  const v1 = /v1=([a-f0-9]+)/.exec(header)?.[1];
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`));
  const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  return hex === v1;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const raw = await req.text();
  if (!(await verify(req, raw))) return json({ error: "bad_signature" }, 401);
  const event = JSON.parse(raw) as { type: string; data: MuxAsset & { upload_id?: string } };
  if (event.type !== "video.asset.ready") return json({ ok: true, ignored: event.type });
  const asset = event.data;
  const playbackId = asset.playback_ids?.find((p) => p.policy === "public")?.id;
  if (!asset.upload_id || !playbackId) return json({ ok: true, ignored: "no upload or playback id" });
  const admin = adminClient();
  const { data, error } = await admin.rpc("mark_response_live", {
    p_upload_id: asset.upload_id, p_asset_id: asset.id, p_playback_id: playbackId,
    p_duration_ms: asset.duration ? Math.round(asset.duration * 1000) : null,
  });
  if (error) return json({ error: "db_failed" }, 500);
  await prewarm(playbackId);
  return json({ ok: true, response: data });
});
