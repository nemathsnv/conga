// The shared-link pages and the moderation admin on a Cloudflare Pages domain
// (docs/release/WEB-HOSTING.md, option B). Supabase stays the backend:
//   /r/{id}, /p/{id}  rendered here from the anon RPCs web_video / web_prompt (PostgREST), with the
//                     same render.ts as the `web` Edge Function: same words, Open Graph, noindex,
//                     app link. Only the paths differ: /r/{id} here, /functions/v1/web/r/{id} there.
//   /i/{code}, /u/{n} rendered here, no database call (as in the function).
//   /e/signin         the sign-in sheet beacon: forwarded to the `web` function, which logs it.
//   /admin            the admin sign-in page, rendered here with the function's own shell, headers
//                     and nonce CSP; /admin/* (me, views, actions) proxied to the `admin` function.
// Nothing here holds a service-role key. The anon (publishable) key is the public one the app ships.
import { PROXY_CLIENT_HEADER, PROXY_KEY_HEADER } from "../../supabase/functions/_shared/client.ts";
import { appLink, LINK_TARGETS, type LinkKind, parseWebPath } from "../../supabase/functions/web/links.ts";
import { emptyPage, html, invitePage, renderConfig, unavailablePage, videoPage, type WebVideo } from "../../supabase/functions/web/render.ts";
import { adminRequest } from "./admin.ts";

export type Env = {
  /** https://<ref>.supabase.co (no trailing slash). */
  SUPABASE_URL: string;
  /** The project's public anon / publishable key (the one in the app). Not a secret. */
  SUPABASE_ANON_KEY: string;
  /** Shared with the `web` function's WEB_PROXY_KEY: lets it trust the visitor address we pass on. */
  WEB_PROXY_KEY?: string;
  STORE_URL?: string;
  WAITLIST_URL?: string;
  /** When set (e.g. admin.<domain>), the admin is served only on that host, and the shared-link
   *  pages never on it, so the admin's origin runs no other page's scripts. Empty: /admin anywhere. */
  ADMIN_HOST?: string;
  /** Where the admin's "web player" links point; empty = this request's origin. */
  WEB_BASE_URL?: string;
};

export type Ctx = { waitUntil(p: Promise<unknown>): void };
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const PAGE_BASE = "";

/** POST /rest/v1/rpc/<name> as anon. A JWT-style anon key also goes in Authorization (as
 *  supabase-js does); a publishable key (sb_publishable_...) only in apikey. */
async function rpc(env: Env, f: FetchLike, name: "web_video" | "web_prompt", id: string): Promise<{ data: unknown; ok: boolean }> {
  const headers: Record<string, string> = { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json", Accept: "application/json" };
  if (env.SUPABASE_ANON_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${env.SUPABASE_ANON_KEY}`;
  try {
    const res = await f(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, { method: "POST", headers, body: JSON.stringify({ p_id: id }) });
    if (!res.ok) {
      await res.body?.cancel();
      return { data: null, ok: false };
    }
    return { data: await res.json(), ok: true };
  } catch {
    return { data: null, ok: false };
  }
}

/** Hands a web event to the `web` function, which checks the per-visitor limit and logs it. With
 *  WEB_PROXY_KEY the visitor's address (cf-connecting-ip at this edge) goes along; without it the
 *  function sees Cloudflare's one Worker address, and link-opened events are not logged at all. */
function forwardEvent(env: Env, req: Request, f: FetchLike, id: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (env.WEB_PROXY_KEY) {
    headers[PROXY_KEY_HEADER] = env.WEB_PROXY_KEY;
    const ip = req.headers.get("cf-connecting-ip");
    if (ip) headers[PROXY_CLIENT_HEADER] = ip;
  }
  return f(`${env.SUPABASE_URL}/functions/v1/web/e/${id}`, { method: "POST", headers })
    .then((r) => r.body?.cancel())
    .catch(() => {
      // Analytics never break a page.
    });
}

function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}

export async function handle(req: Request, env: Env, ctx: Ctx, f: FetchLike = fetch): Promise<Response> {
  const url = new URL(req.url);
  const adminHost = (env.ADMIN_HOST ?? "").trim().toLowerCase();
  const onAdminHost = adminHost !== "" && url.hostname.toLowerCase() === adminHost;

  if (onAdminHost || (adminHost === "" && isAdminPath(url.pathname))) {
    if (!isAdminPath(url.pathname)) return new Response(null, { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } });
    return adminRequest(req, env, f);
  }

  const cfg = renderConfig(PAGE_BASE, env);
  const route = parseWebPath(url.pathname);
  if (!route) return html(unavailablePage(cfg, url.toString()), 404);
  const { kind, id } = route;
  if (kind === "e") {
    if (id === "signin") ctx.waitUntil(forwardEvent(env, req, f, "signin"));
    return new Response(null, { status: 204 });
  }
  const link = appLink(kind as LinkKind, id);
  ctx.waitUntil(forwardEvent(env, req, f, `link-${LINK_TARGETS[kind as LinkKind]}`));
  if (kind === "i") return html(invitePage(cfg, id, url.toString()));
  if (kind === "u") return html(unavailablePage(cfg, url.toString(), link));
  const { data, ok } = await rpc(env, f, kind === "r" ? "web_video" : "web_prompt", id);
  if (!ok) return html(unavailablePage(cfg, url.toString(), link), 500);
  const result = data as WebVideo;
  if (result?.status === "live") return html(videoPage(cfg, result, url.toString(), link));
  if (result?.status === "empty") return html(emptyPage(cfg, result.prompt, url.toString(), link));
  return html(unavailablePage(cfg, url.toString(), link), 404);
}
