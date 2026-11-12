// Unit tests for the Pages host: no network, no Cloudflare account, no Supabase stack. Every call
// upstream goes through a recording fake fetch.   cd web && npm test
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { type Env, type FetchLike, handle } from "../src/handler.ts";
import { restoredType } from "../src/admin.ts";
import { emptyPage, invitePage, renderConfig, unavailablePage, videoPage } from "../../supabase/functions/web/render.ts";
import { PROXY_CLIENT_HEADER, PROXY_KEY_HEADER } from "../../supabase/functions/_shared/client.ts";

const SB = "https://ref.supabase.co";
const KEY = "p".repeat(40);
const ENV: Env = { SUPABASE_URL: SB, SUPABASE_ANON_KEY: "sb_publishable_test", WEB_PROXY_KEY: KEY };
const ID = "5b321c24-1e1e-4393-9ae1-e6503903430d";

type Call = { url: string; init: RequestInit };
function fake(answer: (url: string, init: RequestInit) => Response | Promise<Response>): { f: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  return { calls, f: async (url, init = {}) => { calls.push({ url, init }); return answer(url, init); } };
}
function ctx() {
  const pending: Promise<unknown>[] = [];
  return { pending, ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) } };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
const headersOf = (c: Call) => new Headers(c.init.headers as HeadersInit);

const card = (id: string, kind: "response" | "reply" = "response") => ({
  id, kind, playback_id: "PB" + id, caption: "a <b>caption</b>", live_at: "2026-10-16T10:00:00Z",
  author: { id: "a" + id, name: "Putu", username: "putu", photo_path: "a/p.jpg" }, like_count: 2, comment_count: 1, reply_count: 0,
});
const prompt = { id: "p1", text: "Best sunset spot?", place: { name: "Canggu" }, response_count: 3, published_at: null };
const live = { status: "live", video: card(ID), prompt, more: [card("m1"), card("m2")], replies: [] };

async function get(path: string, f: FetchLike, env: Env = ENV, init: RequestInit = {}, host = "links.example.com") {
  const c = ctx();
  const res = await handle(new Request(`https://${host}${path}`, init), env, c.ctx, f);
  await Promise.all(c.pending);
  return res;
}

describe("shared-link pages", () => {
  it("/r/{id} renders the web player as text/html from web_video, called as anon", async () => {
    const { f, calls } = fake((url) => (url.includes("/rest/v1/rpc/") ? json(live) : new Response(null, { status: 204 })));
    const res = await get(`/r/${ID}`, f);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    const body = await res.text();
    expect(body).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(body).toContain('<meta property="og:title" content="Putu on Conga">');
    expect(body).toContain(`href="shortcut://r/${ID}"`);
    expect(body).toContain("Watch freely. Sign in to respond, reply, like or follow.");
    expect(body).toContain('href="/r/m1"');
    expect(body).toContain("navigator.sendBeacon('/e/signin')");
    expect(body).not.toContain("/functions/v1/");
    const rpc = calls.find((c) => c.url.includes("/rest/v1/rpc/"))!;
    expect(rpc.url).toBe(`${SB}/rest/v1/rpc/web_video`);
    expect(rpc.init.method).toBe("POST");
    expect(JSON.parse(String(rpc.init.body))).toEqual({ p_id: ID });
    expect(headersOf(rpc).get("apikey")).toBe("sb_publishable_test");
    expect(headersOf(rpc).get("authorization")).toBeNull();
  });

  it("is the Edge Function's page with only the path prefix changed", async () => {
    const { f } = fake((url) => (url.includes("/rest/v1/rpc/") ? json(live) : new Response(null, { status: 204 })));
    const pages = await (await get(`/r/${ID}`, f)).text();
    const url = `https://links.example.com/r/${ID}`;
    const edge = videoPage(renderConfig("/functions/v1/web", { SUPABASE_URL: SB }), live as never, url, `shortcut://r/${ID}`);
    expect(pages).toBe(edge.replace("navigator.sendBeacon('/functions/v1/web/e/signin')", "navigator.sendBeacon('/e/signin')").replace('href="/functions/v1/web/r/m1"', 'href="/r/m1"'));
    const edgeInvite = invitePage(renderConfig("/functions/v1/web", { SUPABASE_URL: SB }), "PUTU-7K2", "u");
    const pagesInvite = invitePage(renderConfig("", { SUPABASE_URL: SB }), "PUTU-7K2", "u");
    expect(pagesInvite).toBe(edgeInvite.replace("'/functions/v1/web/e/signin'", "'/e/signin'"));
  });

  it("a legacy JWT anon key also goes in Authorization, as supabase-js sends it", async () => {
    const { f, calls } = fake(() => json({ status: "unavailable" }));
    await get(`/r/${ID}`, f, { ...ENV, SUPABASE_ANON_KEY: "eyJhbGciOi.test.sig" });
    const rpc = calls.find((c) => c.url.includes("/rest/v1/rpc/"))!;
    expect(headersOf(rpc).get("authorization")).toBe("Bearer eyJhbGciOi.test.sig");
  });

  it("/p/{id} with no responses renders the empty prompt; a live one the player", async () => {
    const { f, calls } = fake((url) => (url.includes("/rpc/web_prompt") ? json({ status: "empty", prompt }) : new Response(null, { status: 204 })));
    const res = await get(`/p/${prompt.id}`, f);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe(emptyPage(renderConfig("", { SUPABASE_URL: SB }), prompt, `https://links.example.com/p/${prompt.id}`, `shortcut://p/${prompt.id}`));
    expect(body).toContain("No responses yet.");
    expect(calls.some((c) => c.url === `${SB}/rest/v1/rpc/web_prompt`)).toBe(true);
  });

  it("unavailable is 404, an RPC error or a network failure 500, with the unavailable page", async () => {
    const cfg = renderConfig("", { SUPABASE_URL: SB });
    for (const [answer, status] of [[() => json({ status: "unavailable" }), 404], [() => json({ code: "22P02" }, 400), 500], [() => Promise.reject(new Error("down")), 500]] as const) {
      const { f } = fake(answer as () => Response);
      const res = await get(`/r/not-a-uuid`, f);
      expect(res.status).toBe(status);
      expect(await res.text()).toBe(unavailablePage(cfg, "https://links.example.com/r/not-a-uuid", "shortcut://r/not-a-uuid"));
    }
  });

  it("/i/{code} and /u/{name} need no database call", async () => {
    const { f, calls } = fake(() => new Response(null, { status: 204 }));
    const inv = await get("/i/PUTU-7K2", f);
    expect(inv.status).toBe(200);
    const body = await inv.text();
    expect(body).toContain("You're invited to Conga");
    expect(body).toContain('href="shortcut://i/PUTU-7K2"');
    const prof = await get("/u/lena.hart", f);
    expect(prof.status).toBe(200);
    expect(await prof.text()).toContain('href="shortcut://u/lena.hart"');
    expect(calls.every((c) => !c.url.includes("/rest/v1/"))).toBe(true);
  });

  it("the invite code cannot break out of the script (X1)", async () => {
    const { f } = fake(() => new Response(null, { status: 204 }));
    const body = await (await get("/i/%3C%2Fscript%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E", f)).text();
    expect(body).not.toMatch(/<\/script><script>alert/);
  });

  it("anything else is the unavailable page, 404, with no event", async () => {
    const { f, calls } = fake(() => new Response(null, { status: 204 }));
    for (const p of ["/", "/x/abc", "/r/", "/r/a/b", "/favicon.ico"]) {
      const res = await get(p, f);
      expect(res.status, p).toBe(404);
      expect(await res.text()).toContain("This video isn't available");
    }
    expect(calls).toHaveLength(0);
  });
});

describe("web events", () => {
  it("each page forwards web_link_opened to the function with the visitor address and the key", async () => {
    const { f, calls } = fake((url) => (url.includes("/rest/v1/") ? json(live) : new Response(null, { status: 204 })));
    for (const [path, target] of [[`/r/${ID}`, "video"], ["/p/p1", "prompt"], ["/i/C", "invite"], ["/u/n", "profile"]]) {
      calls.length = 0;
      await get(path, f, ENV, { headers: { "cf-connecting-ip": "203.0.113.5" } });
      const ev = calls.find((c) => c.url.includes("/functions/v1/web/e/"))!;
      expect(ev.url).toBe(`${SB}/functions/v1/web/e/link-${target}`);
      expect(ev.init.method).toBe("POST");
      expect(headersOf(ev).get(PROXY_KEY_HEADER)).toBe(KEY);
      expect(headersOf(ev).get(PROXY_CLIENT_HEADER)).toBe("203.0.113.5");
    }
  });

  it("/e/signin answers 204 and forwards; other /e/ ids are not forwarded", async () => {
    const { f, calls } = fake(() => new Response(null, { status: 204 }));
    const res = await get("/e/signin", f, ENV, { method: "POST", headers: { "cf-connecting-ip": "2001:db8::7" } });
    expect(res.status).toBe(204);
    expect(calls.map((c) => c.url)).toEqual([`${SB}/functions/v1/web/e/signin`]);
    expect(headersOf(calls[0]).get(PROXY_CLIENT_HEADER)).toBe("2001:db8::7");
    calls.length = 0;
    expect((await get("/e/link-video", f, ENV, { method: "POST" })).status).toBe(204);
    expect(calls).toHaveLength(0);
  });

  it("without WEB_PROXY_KEY no visitor address or key is sent", async () => {
    const { f, calls } = fake(() => new Response(null, { status: 204 }));
    await get("/e/signin", f, { ...ENV, WEB_PROXY_KEY: undefined }, { method: "POST", headers: { "cf-connecting-ip": "203.0.113.5" } });
    expect(headersOf(calls[0]).get(PROXY_KEY_HEADER)).toBeNull();
    expect(headersOf(calls[0]).get(PROXY_CLIENT_HEADER)).toBeNull();
  });

  it("a failing event never breaks the page", async () => {
    const { f } = fake((url) => (url.includes("/rest/v1/") ? json(live) : Promise.reject(new Error("down"))));
    expect((await get(`/r/${ID}`, f)).status).toBe(200);
  });
});

describe("moderation admin", () => {
  it("GET /admin is the function's sign-in page with its headers and a nonce-only CSP", async () => {
    const { f, calls } = fake(() => new Response(null, { status: 500 }));
    const res = await get("/admin", f);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    for (const [h, v] of [["x-frame-options", "DENY"], ["referrer-policy", "no-referrer"], ["cache-control", "no-store, no-cache, max-age=0, must-revalidate"], ["x-robots-tag", "noindex, nofollow"], ["cross-origin-opener-policy", "same-origin"]]) {
      expect(res.headers.get(h), h).toBe(v);
    }
    const body = await res.text();
    const nonce = /<script nonce="([A-Za-z0-9]+)">/.exec(body)![1];
    const policy = res.headers.get("content-security-policy")!;
    expect(policy).toContain(`script-src 'nonce-${nonce}'`);
    expect(policy).toContain(`connect-src 'self' ${SB}`);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(body).toContain("<title>Conga moderation</title>");
    const cfg = JSON.parse(/<script type="application\/json" id="cfg">(.*?)<\/script>/.exec(body)![1]);
    expect(cfg).toEqual({ anonKey: "sb_publishable_test", authBase: SB, webBase: "https://links.example.com" });
    expect(calls).toHaveLength(0);
    const again = await (await get("/admin/", f)).text();
    expect(/<script nonce="([A-Za-z0-9]+)">/.exec(again)![1]).not.toBe(nonce);
  });

  it("views are proxied with the bearer token only, and come back as HTML with the admin's headers", async () => {
    const { f, calls } = fake(() => new Response("<h1>Reports</h1>", { status: 200, headers: { "content-type": "text/plain", "content-security-policy": "default-src 'none'; sandbox" } }));
    const res = await get("/admin/v/reports?x=1", f, ENV, { headers: { Authorization: "Bearer tok", Cookie: "s=1", "X-Other": "y" } });
    expect(calls[0].url).toBe(`${SB}/functions/v1/admin/v/reports?x=1`);
    const sent = headersOf(calls[0]);
    expect(sent.get("authorization")).toBe("Bearer tok");
    expect(sent.get("cookie")).toBeNull();
    expect(sent.get("x-other")).toBeNull();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(res.headers.get("cache-control")).toBe("no-store, no-cache, max-age=0, must-revalidate");
    expect(await res.text()).toBe("<h1>Reports</h1>");
  });

  it("actions keep POST, the JSON body and Sec-Fetch-Site, so the function's checks still apply", async () => {
    const { f, calls } = fake(() => json({ ok: false, error: "forbidden" }, 403));
    const res = await get("/admin/a/remove_video", f, ENV, { method: "POST", headers: { Authorization: "Bearer tok", "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" }, body: '{"id":"x","confirm":true}' });
    expect(calls[0].init.method).toBe("POST");
    expect(new TextDecoder().decode(calls[0].init.body as ArrayBuffer)).toBe('{"id":"x","confirm":true}');
    expect(headersOf(calls[0]).get("sec-fetch-site")).toBe("cross-site");
    expect(headersOf(calls[0]).get("content-type")).toBe("application/json");
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await res.json()).toEqual({ ok: false, error: "forbidden" });
  });

  it("401 and 403 pass through unchanged; an unreachable function is 503", async () => {
    let { f } = fake(() => json({ error: "unauthorized" }, 401));
    let res = await get("/admin/me", f);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    ({ f } = fake(() => new Response(null, { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } })));
    res = await get("/admin/v/reports", f, ENV, { headers: { Authorization: "Bearer tok" } });
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("");
    ({ f } = fake(() => Promise.reject(new Error("down"))));
    res = await get("/admin/me", f);
    expect(res.status).toBe(503);
  });

  it("an oversized body is refused before it is sent", async () => {
    const { f, calls } = fake(() => json({}));
    const res = await get("/admin/a/x", f, ENV, { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(33 * 1024) });
    expect(res.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it("with ADMIN_HOST the admin lives only there, and the pages never do", async () => {
    const env = { ...ENV, ADMIN_HOST: "admin.example.com" };
    const { f } = fake((url) => (url.includes("/rest/v1/") ? json(live) : new Response(null, { status: 204 })));
    expect((await get("/admin", f, env, {}, "admin.example.com")).status).toBe(200);
    const pageOnAdmin = await get(`/r/${ID}`, f, env, {}, "admin.example.com");
    expect(pageOnAdmin.status).toBe(404);
    expect(await pageOnAdmin.text()).toBe("");
    const adminOnLinks = await get("/admin", f, env, {}, "links.example.com");
    expect(adminOnLinks.status).toBe(404);
    expect(await adminOnLinks.text()).toContain("This video isn't available");
    expect((await get(`/r/${ID}`, f, env, {}, "links.example.com")).status).toBe(200);
  });

  it("restoredType", () => {
    expect(restoredType("/me", "application/json; charset=utf-8", 10)).toBe("application/json; charset=utf-8");
    expect(restoredType("/v/reports", "text/plain", 10)).toBe("text/html; charset=utf-8");
    expect(restoredType("/v/reports", "text/html; charset=utf-8", 10)).toBe("text/html; charset=utf-8");
    expect(restoredType("/v/reports", "text/plain; charset=utf-8", 0)).toBe("text/plain; charset=utf-8");
    expect(restoredType("/a/x", "text/plain", 5)).toBe("text/plain; charset=utf-8");
  });
});

describe("static files", () => {
  const root = new URL("../public/", import.meta.url);
  it("the association files are valid JSON placeholders for app.shortcut", () => {
    const aasa = JSON.parse(readFileSync(new URL(".well-known/apple-app-site-association", root), "utf8"));
    expect(aasa.applinks.details[0].appIDs).toEqual(["APPLE_TEAM_ID.app.shortcut"]);
    expect(aasa.applinks.details[0].components.map((c: { "/": string }) => c["/"])).toEqual(["/r/*", "/p/*", "/i/*", "/u/*"]);
    const links = JSON.parse(readFileSync(new URL(".well-known/assetlinks.json", root), "utf8"));
    expect(links[0].target.package_name).toBe("app.shortcut");
  });
  it("/.well-known is static (no Function invocation) and served as JSON", () => {
    const routes = JSON.parse(readFileSync(new URL("_routes.json", root), "utf8"));
    expect(routes).toEqual({ version: 1, include: ["/*"], exclude: ["/.well-known/*"] });
    const headers = readFileSync(new URL("_headers", root), "utf8");
    expect(headers).toMatch(/\/\.well-known\/apple-app-site-association\n\s+Content-Type: application\/json/);
    expect(headers).toMatch(/\/\.well-known\/assetlinks\.json\n\s+Content-Type: application\/json/);
  });
});
