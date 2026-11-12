// The moderation admin on the Pages domain (docs/release/WEB-HOSTING.md, option B; security model
// in docs/release/MODERATION.md section 3, unchanged):
//   GET /admin       the sign-in page: the function's own shellPage, SECURITY_HEADERS and nonce
//                    CSP, rendered here because Supabase's default domain would serve it as
//                    text/plain under a sandbox policy. It holds no data and no secret.
//   /admin/<rest>    proxied to <SUPABASE_URL>/functions/v1/admin/<rest>. Only Authorization,
//                    Content-Type and Sec-Fetch-Site go up (never a cookie); the function still
//                    verifies the token with Auth and the moderator membership on every request.
//                    The answer comes back with the function's SECURITY_HEADERS and its content
//                    type restored (the default domain rewrites text/html to text/plain).
// The browser talks to Auth directly at SUPABASE_URL (authBase), so Auth's own per-address
// limits see the moderator's address, not this edge's.
import { csp, nonce, SECURITY_HEADERS } from "../../supabase/functions/admin/handler.ts";
import { shellPage, type ShellConfig } from "../../supabase/functions/admin/shell.ts";
import type { Env, FetchLike } from "./handler.ts";

/** Twice the function's own body limit; the function answers anything over 16 KiB with 413. */
const MAX_PROXY_BODY = 32 * 1024;
const FORWARDED = ["authorization", "content-type", "sec-fetch-site"];

function respond(body: BodyInit | null, status: number, contentType: string, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...SECURITY_HEADERS, "Content-Type": contentType, ...extra } });
}

export function shellConfig(env: Env, origin: string): ShellConfig {
  return { anonKey: env.SUPABASE_ANON_KEY, authBase: env.SUPABASE_URL, webBase: env.WEB_BASE_URL || origin };
}

/** The type the function set: JSON stays JSON; a non-empty view fragment is HTML (the default
 *  domain turns it into text/plain); an empty answer (403) is text/plain, as the function sends it. */
export function restoredType(sub: string, upstreamType: string, bodyLength: number): string {
  if (upstreamType.toLowerCase().startsWith("application/json")) return "application/json; charset=utf-8";
  if (sub.startsWith("/v/") && bodyLength > 0) return "text/html; charset=utf-8";
  return "text/plain; charset=utf-8";
}

export async function adminRequest(req: Request, env: Env, f: FetchLike): Promise<Response> {
  const url = new URL(req.url);
  const sub = url.pathname.replace(/^\/admin/, "").replace(/\/+$/, "") || "/";

  if (sub === "/" && (req.method === "GET" || req.method === "HEAD")) {
    const n = nonce();
    const cfg = shellConfig(env, url.origin);
    return respond(req.method === "HEAD" ? null : shellPage(cfg, n), 200, "text/html; charset=utf-8", { "Content-Security-Policy": csp(n, cfg) });
  }

  const headers = new Headers();
  for (const h of FORWARDED) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_PROXY_BODY) return respond(JSON.stringify({ ok: false, error: "too_large" }), 413, "application/json; charset=utf-8");
  }
  let res: Response;
  try {
    res = await f(`${env.SUPABASE_URL}/functions/v1/admin${sub}${url.search}`, { method: req.method, headers, body, redirect: "manual" });
  } catch {
    return respond(JSON.stringify({ error: "unavailable" }), 503, "application/json; charset=utf-8");
  }
  const data = await res.arrayBuffer();
  const type = restoredType(sub, res.headers.get("content-type") ?? "", data.byteLength);
  return respond(data.byteLength > 0 ? data : null, res.status, type);
}
