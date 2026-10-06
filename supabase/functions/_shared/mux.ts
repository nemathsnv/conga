// Mux REST helper. Runs only inside Edge Functions; MUX_TOKEN_ID / MUX_TOKEN_SECRET are
// function secrets and never reach the app.
const MUX_API = "https://api.mux.com";

function authHeader(): string {
  const id = Deno.env.get("MUX_TOKEN_ID");
  const secret = Deno.env.get("MUX_TOKEN_SECRET");
  if (!id || !secret) throw new Error("MUX_TOKEN_ID / MUX_TOKEN_SECRET not set");
  return "Basic " + btoa(`${id}:${secret}`);
}

export async function mux<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(MUX_API + path, {
    ...init,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mux ${res.status} ${path}: ${JSON.stringify(body)}`);
  return body.data as T;
}

export interface MuxUpload { id: string; url: string; status: string; asset_id?: string; error?: unknown }
export interface MuxAsset {
  id: string;
  status: string;
  playback_ids?: { id: string; policy: string }[];
  duration?: number;
  errors?: unknown;
  passthrough?: string;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/**
 * Pre-warm a freshly ready asset: the spike measured a 4.5 s cold first view because Mux
 * prepares renditions just in time. Fetching the manifest and the first segments once
 * makes the author's first play, and the first viewer's, warm.
 */
export async function prewarm(playbackId: string): Promise<void> {
  try {
    const base = `https://stream.mux.com/${playbackId}.m3u8`;
    const master = await (await fetch(base)).text();
    const variants = master.split("\n").filter((l) => l.trim() && !l.startsWith("#")).slice(0, 3);
    await Promise.all(variants.map(async (v) => {
      const url = new URL(v, base).toString();
      const media = await (await fetch(url)).text();
      const seg = media.split("\n").find((l) => l.trim() && !l.startsWith("#"));
      if (seg) await fetch(new URL(seg, url).toString(), { method: "GET" }).then((r) => r.arrayBuffer());
    }));
  } catch {
    // Warming is best effort.
  }
}
