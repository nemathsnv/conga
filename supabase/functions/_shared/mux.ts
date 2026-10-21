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

/** Hosts a local fake Mux may run on (tests only). Anything else in MUX_API_BASE is refused. */
const LOCAL_MUX_HOSTS = ["127.0.0.1", "localhost", "host.docker.internal"];

/**
 * https://api.mux.com, unless MUX_API_BASE names a fake Mux on this machine (http, loopback or
 * Docker's host alias). It can never point Mux calls at another host: on a hosted project such a
 * value only makes every Mux call fail.
 */
export function muxBase(): string {
  const override = Deno.env.get("MUX_API_BASE");
  if (!override) return MUX_API;
  const u = new URL(override);
  if (u.protocol !== "http:" || !LOCAL_MUX_HOSTS.includes(u.hostname)) throw new Error("invalid_mux_api_base");
  return u.origin;
}

/**
 * Where prewarm() fetches: https://stream.mux.com; or a local fake named by MUX_STREAM_BASE (the
 * MUX_API_BASE rule); or nowhere when MUX_API_BASE names a fake and MUX_STREAM_BASE is unset, so a run
 * against a fake Mux never sends its made-up playback ids to the real stream host.
 */
export function muxStreamBase(): string | null {
  const override = Deno.env.get("MUX_STREAM_BASE");
  if (override) {
    const u = new URL(override);
    if (u.protocol !== "http:" || !LOCAL_MUX_HOSTS.includes(u.hostname)) throw new Error("invalid_mux_stream_base");
    return u.origin;
  }
  return Deno.env.get("MUX_API_BASE") ? null : "https://stream.mux.com";
}

export async function mux<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = muxBase();
  const url = new URL(base + path);
  if (url.origin !== base) throw new Error("invalid_mux_path");
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new MuxHttpError(res.status, `Mux ${res.status} ${path}: ${JSON.stringify(body)}`);
  return body.data as T;
}

/** Mux answered with an error status. Unlike a timeout or a network error, the outcome is known. */
export class MuxHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
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

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", ...headers } });
}

/**
 * Pre-warm a freshly ready asset: the spike measured a 4.5 s cold first view because Mux
 * prepares renditions just in time. Fetching the manifest and the first segments once
 * makes the author's first play, and the first viewer's, warm.
 */
export async function prewarm(playbackId: string): Promise<void> {
  if (!isMuxId(playbackId)) return;
  try {
    const stream = muxStreamBase();
    if (!stream) return;
    const base = `${stream}/${playbackId}.m3u8`;
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
 * Checks a Mux-Signature header (t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">[,v1=...])
 * against the raw request body. Like Mux's own SDK, any one matching v1 signature is enough.
 * False without a secret, with no or more than one timestamp, outside 300 s of now, or when no
 * v1 signature matches.
 */
export async function verifyMuxSignature(header: string, raw: string, secret: string | undefined, nowMs = Date.now()): Promise<boolean> {
  if (!secret) return false;
  const timestamps: string[] = [];
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim(), value = part.slice(eq + 1).trim();
    if (name === "t") timestamps.push(value);
    else if (name === "v1") signatures.push(value);
  }
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0]) || !signatures.length) return false;
  const t = timestamps[0];
  if (Math.abs(nowMs / 1000 - Number(t)) > WEBHOOK_TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  let matched = false;
  for (const v1 of signatures) {
    if (!/^[a-f0-9]{64}$/.test(v1)) continue;
    const given = new Uint8Array(32);
    for (let i = 0; i < 32; i++) given[i] = parseInt(v1.slice(i * 2, i * 2 + 2), 16);
    // Every signature is compared; no early exit on a match.
    if (timingSafeEqual(expected, given)) matched = true;
  }
  return matched;
}
