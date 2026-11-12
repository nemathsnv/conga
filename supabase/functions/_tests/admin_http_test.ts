// The real admin function over HTTP in a LOCAL Edge runtime, with real Auth tokens: the same
// authorization rules as admin_authz_test.ts, through the gateway. Needs the function served:
//
//   (stack folder) supabase functions serve --no-verify-jwt --env-file <any fake env file>
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test --allow-env --allow-net supabase/functions/_tests/admin_http_test.ts
//
// Creates its own two accounts (one moderator, one not). Refuses any host but 127.0.0.1/localhost;
// ignored (not failed) when the function is not being served.
import { assert, assertEquals } from "./assert.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!API || !ANON || !SERVICE) throw new Error("set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY for the local stack");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error(`refusing to run against ${new URL(API).hostname}: local stack only`);

const F = `${API}/functions/v1/admin`;
const run = Date.now().toString(36);
const served = await fetch(F).then((r) => r.status === 200, () => false);

async function post(path: string, body: unknown, key = SERVICE, token = key) {
  const r = await fetch(`${API}${path}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
async function account(name: string): Promise<{ id: string; token: string }> {
  const email = `adm-http-${run}-${name}@example.com`;
  const c = await post("/auth/v1/admin/users", { email, email_confirm: true });
  const l = await post("/auth/v1/admin/generate_link", { type: "magiclink", email });
  const v = await post("/auth/v1/verify", { type: "email", email, token: l.json.email_otp }, ANON);
  await fetch(`${API}/rest/v1/profiles`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: c.json.id, name, username: `ah${name}${run}`.slice(0, 22) }) });
  return { id: c.json.id, token: v.json.access_token };
}

const t = { ignore: !served };
const mod = served ? await account("mod") : { id: "", token: "" };
const user = served ? await account("user") : { id: "", token: "" };
if (served) assertEquals((await post("/rest/v1/rpc/mod_add_moderator", { p_account: mod.id, p_added_by: "http test" })).status, 200, "add the moderator");

const get = (path: string, headers: Record<string, string> = {}) => fetch(`${F}${path}`, { headers });
const bearer = (tok: string, more: Record<string, string> = {}) => ({ Authorization: `Bearer ${tok}`, ...more });
const act = (tok: string, action: string, body: unknown, more: Record<string, string> = { "Content-Type": "application/json" }) =>
  fetch(`${F}/a/${action}`, { method: "POST", headers: bearer(tok, more), body: JSON.stringify(body) });
const ID = "a1111111-1111-4111-8111-111111111111";

Deno.test({ name: "http: the sign-in page is public and locked down", ...t, fn: async () => {
  const r = await get("");
  assertEquals(r.status, 200, "status");
  assert((r.headers.get("content-type") ?? "").startsWith("text/html"), "html");
  assert((r.headers.get("content-security-policy") ?? "").includes("script-src 'nonce-"), "nonce CSP");
  assert((r.headers.get("cache-control") ?? "").includes("no-store"), "not cached");
  assert(!r.headers.has("set-cookie"), "no cookie");
  await r.text();
} });

Deno.test({ name: "http: no token, forged tokens and cookies are 401", ...t, fn: async () => {
  for (const h of [{}, { Cookie: `sb=${mod.token}` }, bearer("x".repeat(40)), bearer(ANON), bearer(SERVICE)] as Record<string, string>[]) {
    const r = await get("/v/reports", h);
    assertEquals(r.status, 401, JSON.stringify(Object.keys(h)));
    await r.text();
  }
} });

Deno.test({ name: "http: a signed-in member who is not a moderator is 403 with an empty body, on views and actions", ...t, fn: async () => {
  for (const p of ["/me", "/v/reports", "/v/reviews", "/v/suggestions", "/v/accounts?q=a", `/v/video/${ID}`, `/v/account/${ID}`]) {
    const r = await get(p, bearer(user.token));
    assertEquals(r.status, 403, p);
    assertEquals(await r.text(), "", p);
  }
  for (const a of ["remove_video", "restore_video", "remove_comment", "close_report", "restrict", "suspend", "restore_account", "decide_review", "approve_suggestion", "decline_suggestion"]) {
    const r = await act(user.token, a, { id: ID, account: ID, action: ID, reason: "x", until: "2099-01-01", outcome: "upheld", confirm: true });
    assertEquals(r.status, 403, a);
    await r.text();
  }
} });

Deno.test({ name: "http: a moderator is served, never cached, with no cookie; form and cross-site posts are refused", ...t, fn: async () => {
  const me = await get("/me", bearer(mod.token));
  assertEquals(me.status, 200, "/me");
  assert((await me.json()).identity.includes(mod.id), "identity from the database");
  const q = await get("/v/reports", bearer(mod.token));
  assertEquals(q.status, 200, "reports");
  assert((q.headers.get("cache-control") ?? "").includes("no-store"), "no-store");
  assert(!q.headers.has("set-cookie"), "no cookie");
  await q.text();
  assertEquals((await act(mod.token, "close_report", { id: ID }, { "Content-Type": "application/x-www-form-urlencoded" })).status, 415, "form post");
  assertEquals((await act(mod.token, "close_report", { id: ID }, { "Content-Type": "application/json" })).status, 400, "no confirmation");
  assertEquals((await act(mod.token, "close_report", { id: ID, confirm: true }, { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" })).status, 403, "cross-site");
  assertEquals((await act(mod.token, "warn", { confirm: true }, { "Content-Type": "application/json" })).status, 404, "there is no warn");
} });
