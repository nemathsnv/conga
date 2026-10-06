// POST { assetIds?: string[] } -> deletes the given assets, or every asset in the
// environment when assetIds is omitted. Spike-only: frees the free-plan 10-asset cap.
import { corsHeaders, json, mux } from "../_shared/mux.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    let ids: string[] = Array.isArray(body.assetIds) ? body.assetIds : [];
    if (!ids.length) {
      const all = await mux<{ id: string }[]>("/video/v1/assets?limit=100");
      ids = all.map((a) => a.id);
    }
    const results: Record<string, string> = {};
    for (const id of ids) {
      try {
        await fetch(`https://api.mux.com/video/v1/assets/${id}`, { method: "DELETE", headers: { Authorization: "Basic " + btoa(`${Deno.env.get("MUX_TOKEN_ID")}:${Deno.env.get("MUX_TOKEN_SECRET")}`) } }).then((r) => { results[id] = String(r.status); });
      } catch (e) { results[id] = String(e); }
    }
    return json({ deleted: ids.length, results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
