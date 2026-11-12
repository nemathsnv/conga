// The web player for shared links (SPEC.md Section 16; boards SF-Web, SF-Web-Signin,
// LV-WebUnavailable, LV-WebEmpty). Server-rendered HTML, no account, no JavaScript framework:
//   /r/{id}   a response or video reply, with "N more responses" and the reply room
//   /p/{id}   a prompt: its newest response, or the empty state
//   /i/{code} an invite link: opens the app (shortcut://i/{code}) or the store page
// "Open in the app" opens the matching route (shortcut://r/{id}, p/{id}, u/{name}, i/{code}); links.ts.
//   /u/{name} profiles have no web page in v1: the sign-in sheet
// Pages are noindex during the beta and carry link previews (Open Graph). Every interaction
// opens the sign-in sheet. Blocking works only in the app; a visitor can watch public content.
// The pages themselves are rendered by render.ts, which the Cloudflare Pages host in web/ shares
// (docs/release/WEB-HOSTING.md).
import { proxiedClientIp, proxyKeyMatches } from "../_shared/client.ts";
import { adminClient } from "../_shared/supabase.ts";
import { appLink, LINK_TARGETS, linkEventTarget, type LinkKind, parseWebPath } from "./links.ts";
import { emptyPage, html, invitePage, renderConfig, unavailablePage, videoPage, type WebVideo } from "./render.ts";

const CFG = renderConfig("/functions/v1/web", {
  SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  STORE_URL: Deno.env.get("STORE_URL"),
  WAITLIST_URL: Deno.env.get("WAITLIST_URL"),
});
// Shared with the Pages host (web/), which passes the visitor's address and forwards its
// link-opened events. Unset: no request is trusted, and the function behaves as it always has.
const PROXY_KEY = Deno.env.get("WEB_PROXY_KEY");

// Web events (SPEC.md Section 21): web_link_opened and web_signin_sheet_shown. A visitor has
// no account, so the id is random per request (unlike the app's pseudonymous per-account id).
// At most web_event events per client IP per window (rate_limit_rules, migration 20261016000204):
// an anonymous beacon cannot fill the table. Over the limit the event is dropped; the page is the same.
async function logWebEvent(admin: ReturnType<typeof adminClient>, req: Request, name: string, props: Record<string, unknown>): Promise<void> {
  try {
    const { data: allowed } = await admin.rpc("web_event_allowed", { p_client: proxiedClientIp(req, PROXY_KEY) });
    if (allowed !== true) return;
    await admin.from("analytics_events").insert({ anon_id: crypto.randomUUID(), platform: "web", name, props, client_ts: new Date().toISOString() });
  } catch {
    // Analytics never break a page.
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const route = parseWebPath(url.pathname);
  if (!route) return html(unavailablePage(CFG, url.toString()), 404);
  const { kind, id } = route;
  const admin = adminClient();
  if (kind === "e") {
    if (id === "signin") await logWebEvent(admin, req, "web_signin_sheet_shown", { logged_in: false });
    // A page the Pages host rendered (only with its key; anyone else gets the same 204, nothing logged).
    const target = linkEventTarget(id);
    if (target && proxyKeyMatches(req, PROXY_KEY)) await logWebEvent(admin, req, "web_link_opened", { target, logged_in: false });
    return new Response(null, { status: 204 });
  }
  const link = appLink(kind as LinkKind, id);
  void logWebEvent(admin, req, "web_link_opened", { target: LINK_TARGETS[kind as LinkKind], logged_in: false });
  if (kind === "i") return html(invitePage(CFG, id, url.toString()));
  if (kind === "u") return html(unavailablePage(CFG, url.toString(), link));
  const rpc = kind === "r" ? "web_video" : "web_prompt";
  const { data, error } = await admin.rpc(rpc, { p_id: id });
  if (error) return html(unavailablePage(CFG, url.toString(), link), 500);
  const result = data as WebVideo;
  if (result.status === "live") return html(videoPage(CFG, result, url.toString(), link));
  if (result.status === "empty") return html(emptyPage(CFG, result.prompt, url.toString(), link));
  return html(unavailablePage(CFG, url.toString(), link), 404);
});
