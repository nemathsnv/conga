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
