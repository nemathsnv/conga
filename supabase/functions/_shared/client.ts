// Small request helpers shared by the functions that limit or authenticate callers.
import { timingSafeEqual } from "./mux.ts";

/** "Bearer <key>" compared in constant time; false when no key is configured. */
export function bearerMatches(header: string | null, key: string | undefined): boolean {
  if (!key) return false;
  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(header ?? ""), enc.encode(`Bearer ${key}`));
}

/**
 * The caller's address, as the platform's edge passes it on (the same order as the database's
 * request_client_ip). Used only as a rate-limit key, hashed in the database; never stored or logged.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const first = (v: string | null) => (v ?? "").split(",")[0].trim();
  return first(h.get("cf-connecting-ip")) || first(h.get("x-real-ip")) || first(h.get("x-forwarded-for")) || "unknown";
}

/** Headers a trusted proxy in front of a function uses to pass on the visitor: the Cloudflare
 *  Pages Functions in web/ (docs/release/WEB-HOSTING.md). On a Worker's request to another zone,
 *  Cloudflare sets cf-connecting-ip to one fixed Worker address, so without this every visitor
 *  of the proxy would share one rate-limit bucket. */
export const PROXY_KEY_HEADER = "x-conga-proxy-key";
export const PROXY_CLIENT_HEADER = "x-conga-client-ip";

/** The proxy's shared key (WEB_PROXY_KEY), compared in constant time. False when no key, or a key
 *  shorter than 32 characters, is configured: an unset key trusts nobody. */
export function proxyKeyMatches(req: Request, key: string | undefined): boolean {
  if (!key || key.length < 32) return false;
  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(req.headers.get(PROXY_KEY_HEADER) ?? ""), enc.encode(key));
}

/** The visitor's address as the trusted proxy passed it on, when the key matches and the value
 *  looks like an address; otherwise clientIp(req), exactly as before. */
export function proxiedClientIp(req: Request, key: string | undefined): string {
  if (proxyKeyMatches(req, key)) {
    const ip = (req.headers.get(PROXY_CLIENT_HEADER) ?? "").trim();
    if (/^[0-9A-Fa-f:.]{2,45}$/.test(ip)) return ip;
  }
  return clientIp(req);
}
