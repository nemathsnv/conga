// Mux REST helper. Runs only inside Edge Functions; MUX_TOKEN_ID / MUX_TOKEN_SECRET are
// function secrets and never reach the app.
const MUX_API = "https://api.mux.com";

function authHeader(): string {
  const id = Deno.env.get("MUX_TOKEN_ID");
  const secret = Deno.env.get("MUX_TOKEN_SECRET");
  if (!id || !secret) throw new Error("MUX_TOKEN_ID / MUX_TOKEN_SECRET not set");
  return "Basic " + btoa(`${id}:${secret}`);
}

// Mux object ids (uploads, assets, playback ids) are letters and digits only.
const MUX_ID = /^[A-Za-z0-9]{1,128}$/;

export function isMuxId(value: unknown): value is string {
  return typeof value === "string" && MUX_ID.test(value);
}

/** A Mux id as one URL path segment. Throws on anything else, so no input can change the path. */
export function muxSegment(id: unknown): string {
  if (!isMuxId(id)) throw new Error("invalid_mux_id");
  return encodeURIComponent(id);
}

export async function mux<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(MUX_API + path);
  if (url.origin !== MUX_API) throw new Error("invalid_mux_path");
  const res = await fetch(url, {
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
  if (!isMuxId(playbackId)) return;
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

/** Compares two byte strings in time that depends only on their length, not their contents. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const WEBHOOK_TOLERANCE_S = 300;

/**
 * Checks a Mux-Signature header (t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">) against the
 * raw request body. False without a secret, outside 300 s of now, or on any mismatch.
 */
export async function verifyMuxSignature(header: string, raw: string, secret: string | undefined, nowMs = Date.now()): Promise<boolean> {
  if (!secret) return false;
  const t = /t=(\d+)/.exec(header)?.[1];
  const v1 = /v1=([a-f0-9]+)/.exec(header)?.[1];
  if (!t || !v1 || v1.length !== 64) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > WEBHOOK_TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  const given = new Uint8Array(32);
  for (let i = 0; i < 32; i++) given[i] = parseInt(v1.slice(i * 2, i * 2 + 2), 16);
  return timingSafeEqual(expected, given);
}
