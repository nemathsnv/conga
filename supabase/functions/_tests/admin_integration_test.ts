// Integration test for the moderation admin against a LOCAL Supabase stack: real Auth sessions
// (email codes), PostgREST, RLS and the real mod_* functions. The admin handler runs in-process
// with the real token check and the real service role. Nothing is sent anywhere else; Mux is
// never contacted. Refuses to run unless SUPABASE_URL is 127.0.0.1 or localhost.
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test --allow-env --allow-net supabase/functions/_tests/admin_integration_test.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals } from "./assert.ts";
import { createHandler, type Deps } from "../admin/handler.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!API || !ANON || !SERVICE) throw new Error("set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY for the local stack");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error(`refusing to run against ${new URL(API).hostname}: local stack only`);

const run = Date.now().toString(36);
const svc = createClient(API, SERVICE, { auth: { persistSession: false } });
const verifier = createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const deps: Deps = {
  verifyToken: async (token) => {
    const { data, error } = await verifier.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id };
  },
  rpc: async (name, args) => {
    const { data, error } = await svc.rpc(name, args ?? {});
    return { data, error: error ? { message: error.message, code: error.code } : null };
  },
  config: { anonKey: ANON, authBase: "", webBase: "" },
  log: () => {},
};
const handler = createHandler(deps);

async function http(path: string, opts: { method?: string; key?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers: { apikey: opts.key ?? SERVICE, Authorization: `Bearer ${opts.token ?? opts.key ?? SERVICE}`, "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

async function member(name: string): Promise<{ id: string; token: string; username: string }> {
  const email = `adm-${run}-${name}@example.com`;
  const created = await http("/auth/v1/admin/users", { method: "POST", body: { email, email_confirm: true } });
  assertEquals(created.status, 200, `create ${name}`);
  const id = (created.json as { id: string }).id;
  const link = await http("/auth/v1/admin/generate_link", { method: "POST", body: { type: "magiclink", email } });
  const otp = (link.json as { email_otp: string }).email_otp;
  const verified = await http("/auth/v1/verify", { method: "POST", key: ANON, body: { type: "email", email, token: otp } });
  assertEquals(verified.status, 200, `sign in ${name}`);
  const username = `ad${name}${run}`.slice(0, 22);
  const p = await http("/rest/v1/profiles", { method: "POST", body: { id, name: `${name} ${run}`, username } });
  assertEquals(p.status, 201, `profile ${name}`);
  await http(`/rest/v1/accounts?id=eq.${id}`, { method: "PATCH", body: { age_confirmed_at: new Date().toISOString(), public_disclosure_ack_at: new Date().toISOString() } });
  return { id, token: (verified.json as { access_token: string }).access_token, username };
}

function call(method: string, path: string, init: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.token) headers["Authorization"] = `Bearer ${init.token}`;
  let body: string | undefined;
  if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    headers["Content-Type"] = "application/json";
  }
  return handler(new Request(`${API}/functions/v1/admin${path}`, { method, headers, body }));
}
const act = (token: string, action: string, body: Record<string, unknown>) => call("POST", `/a/${action}`, { token, body: { confirm: true, ...body } });

// ---------------------------------------------------------------------------
// Fixtures
const mod = await member("mod");
const lena = await member("lena");
const adam = await member("adam");
const maya = await member("maya");
const inactive = await member("inactive");
const outsider = await member("outsider");

const prompts = await http("/rest/v1/prompts?select=id", {
  method: "POST",
  body: [1, 2].map((n) => ({ text: `Admin test prompt ${n} ${run}`, status: "live", published_at: new Date().toISOString() })),
});
assertEquals(prompts.status, 201, "prompts");
const pr = await http(`/rest/v1/prompts?text=like.Admin test prompt*${run}&select=id,text&order=text`);
const [p1, p2] = (pr.json as { id: string }[]).map((p) => p.id);

const live = (prompt: string, author: string, tag: string, caption: string) => ({
  prompt_id: prompt, author_id: author, duration_ms: 9000, status: "live", caption,
  mux_upload_id: `up${tag}${run}`, mux_asset_id: `as${tag}${run}`, mux_playback_id: `pb${tag}${run}`, live_at: new Date().toISOString(),
});
const rows = await http("/rest/v1/responses?select=id,mux_upload_id", {
  method: "POST",
  body: [live(p1, maya.id, "Maya1", "Maya's response"), live(p1, adam.id, "Adam1", "Adam's response"), live(p2, lena.id, "Lena2", "Lena's response")],
});
assertEquals(rows.status, 201, "responses");
const rid = async (tag: string) => ((await http(`/rest/v1/responses?mux_upload_id=eq.up${tag}${run}&select=id`)).json as { id: string }[])[0].id;
const mayaVideo = await rid("Maya1"), adamVideo = await rid("Adam1"), lenaVideo = await rid("Lena2");
const cm = await http("/rest/v1/comments?select=id", { method: "POST", body: { response_id: adamVideo, author_id: maya.id, body: `Rude comment <b>${run}</b>` } });
assertEquals(cm.status, 201, "comment");
const mayaComment = ((cm.json as { id: string }[])[0]).id;

assertEquals((await svc.rpc("mod_add_moderator", { p_account: mod.id, p_added_by: "integration test" })).error, null, "add the moderator");
assertEquals((await svc.rpc("mod_add_moderator", { p_account: inactive.id, p_added_by: "integration test" })).error, null, "add a second moderator");
assertEquals((await svc.rpc("mod_deactivate_moderator", { p_account: inactive.id })).error, null, "and switch it off");

// ---------------------------------------------------------------------------
Deno.test("access: real tokens, real membership", async () => {
  assertEquals((await call("GET", "/me")).status, 401, "no token");
  assertEquals((await call("GET", "/me", { token: "x".repeat(40) })).status, 401, "a made-up token");
  assertEquals((await call("GET", "/me", { token: ANON })).status, 401, "the anon key is not a user");
  assertEquals((await call("GET", "/me", { token: SERVICE })).status, 401, "nor the service key");
  const ok = await call("GET", "/me", { token: mod.token });
  assertEquals(ok.status, 200, "the moderator");
  assertEquals((await ok.json()).identity, `@${mod.username} (${mod.id})`, "identity from the database");
  for (const m of [lena, outsider, inactive]) {
    const r = await call("GET", "/v/reports", { token: m.token });
    assertEquals(r.status, 403, "not a moderator, or switched off");
    assertEquals(await r.text(), "", "with nothing in the body");
  }
  // Being suspended ends it at once, with the very next request.
  assertEquals((await svc.rpc("mod_suspend", { p_account: mod.id, p_reason: "test", p_moderator: "integration test" })).error, null);
  assertEquals((await call("GET", "/me", { token: mod.token })).status, 403, "a suspended moderator is refused");
  assertEquals((await svc.rpc("mod_restore_account", { p_account: mod.id, p_reason: "test", p_moderator: "integration test" })).error, null);
  assertEquals((await call("GET", "/me", { token: mod.token })).status, 200, "and back in when restored");
});

Deno.test("normal users cannot reach the moderator database layer", async () => {
  for (const m of [lena, outsider]) {
    for (const [fn, body] of [
      ["mod_reports_queue", {}], ["mod_whoami", { p_account: m.id }], ["mod_add_moderator", { p_account: m.id, p_added_by: "me" }],
      ["mod_remove_video", { p_video: adamVideo, p_reason: "x", p_moderator: "me" }], ["mod_account_overview", { p_account: m.id }],
      ["mod_video_detail", { p_video: adamVideo }], ["mod_suspend", { p_account: adam.id, p_reason: "x", p_moderator: "me" }],
    ] as [string, Record<string, unknown>][]) {
      const r = await http(`/rest/v1/rpc/${fn}`, { method: "POST", key: ANON, token: m.token, body });
      assert([401, 403, 404].includes(r.status), `${fn} as a member: ${r.status}`);
      assert(!JSON.stringify(r.json).includes(adam.username), "and nothing about anyone");
    }
    const t = await http("/rest/v1/moderators?select=*", { key: ANON, token: m.token });
    assert([401, 403].includes(t.status), `the moderators table as a member: ${t.status}`);
  }
  const anon = await http("/rest/v1/moderators?select=*", { key: ANON });
  assert([401, 403].includes(anon.status), "and as anon");
  const anonRpc = await http("/rest/v1/rpc/mod_reports_queue", { method: "POST", key: ANON, body: {} });
  assert([401, 403, 404].includes(anonRpc.status), "anon cannot call a mod_* function");
});

Deno.test("reports: the queue, the report with its reporter, remove, and the removed video's privacy", async () => {
  const rep = await http("/rest/v1/rpc/report_item", { method: "POST", key: ANON, token: lena.token, body: { p_kind: "video", p_id: mayaVideo, p_reason: "spam" } });
  assertEquals(rep.status, 200, "Lena reports Maya's response");
  const rep2 = await http("/rest/v1/rpc/report_item", { method: "POST", key: ANON, token: adam.token, body: { p_kind: "comment", p_id: mayaComment, p_reason: "harassment" } });
  assertEquals(rep2.status, 200, "Adam reports Maya's comment");

  const queue = await (await call("GET", "/v/reports", { token: mod.token })).text();
  assert(queue.includes(`@${maya.username}`), "the queue names the author");
  assert(queue.includes("Spam or scam") && queue.includes("Harassment or bullying"), "with the reasons as the app words them");
  assert(queue.includes("Rude comment &lt;b&gt;"), "comment text is escaped, not rendered");
  const reportId = ((await svc.rpc("mod_reports_queue", {})).data as { id: string; kind: string }[]).find((r) => r.kind === "video")!.id;

  const detail = await (await call("GET", `/v/report/${reportId}`, { token: mod.token })).text();
  assert(detail.includes(`@${lena.username}`), "the report shows its reporter");
  assert(detail.includes("Maya's response"), "and the reported response");
  assert(detail.includes(`https://stream.mux.com/pbMaya1${run}.m3u8`), "with its stream, while it is live");
  assert(detail.includes("Remove this response"), "and the action");

  // The video before removal is on the web and in the app.
  const web1 = await http("/rest/v1/rpc/web_video", { method: "POST", key: ANON, body: { p_id: mayaVideo } });
  assertEquals((web1.json as { status: string }).status, "live", "public before the removal");

  assertEquals((await act(mod.token, "remove_video", { id: mayaVideo, reason: "Spam about a product.", note: "second report today" })).status, 200, "remove");
  const log = (await svc.rpc("mod_account_log", { p_account: maya.id })).data as { moderator: string; reason: string; note: string }[];
  assertEquals(log[0].moderator, `@${mod.username} (${mod.id})`, "the log records the moderator from the token");
  assertEquals(log[0].reason, "Spam about a product.", "and the reason");
  const notice = await http("/rest/v1/rpc/activity_list", { method: "POST", key: ANON, token: maya.token, body: {} });
  assert(JSON.stringify(notice.json).includes('"removed"'), "Maya got the removal notice");

  // Removed-video privacy: nothing, on the web or in the app, for anyone.
  const web2 = await http("/rest/v1/rpc/web_video", { method: "POST", key: ANON, body: { p_id: mayaVideo } });
  assertEquals((web2.json as { status: string }).status, "unavailable", "the web player has nothing");
  for (const viewer of [lena, adam]) {
    const gv = await http("/rest/v1/rpc/get_video", { method: "POST", key: ANON, token: viewer.token, body: { p_id: mayaVideo } });
    assertEquals((gv.json as { status: string }).status, "unavailable", "get_video: unavailable");
    const direct = await http(`/rest/v1/responses?id=eq.${mayaVideo}&select=id`, { key: ANON, token: viewer.token });
    assertEquals(direct.json, [], "and no direct table read");
  }
  const pl = await http("/rest/v1/rpc/prompt_responses", { method: "POST", key: ANON, token: lena.token, body: { p_prompt: p1 } });
  assert(!JSON.stringify(pl.json).includes(`pbMaya1${run}`), "the player list has no playback id of it");

  const after = await (await call("GET", `/v/video/${mayaVideo}`, { token: mod.token })).text();
  assert(after.includes("No public playback"), "moderators are told it has no public playback");
  assert(!after.includes("stream.mux.com"), "and are given no stream");
  assert(after.includes("Spam about a product.") && after.includes("second report today"), "but see the removal, reason and note");

  // A removed response still occupies Maya's slot; a restore gives it back.
  assertEquals((await act(mod.token, "restore_video", { id: mayaVideo, reason: "Looked again: fine." })).status, 200, "restore");
  const web3 = await http("/rest/v1/rpc/web_video", { method: "POST", key: ANON, body: { p_id: mayaVideo } });
  assertEquals((web3.json as { status: string }).status, "live", "public again after the restore");
  const closed = await (await call("GET", `/v/report/${reportId}`, { token: mod.token })).text();
  assert(closed.includes("closed"), "the report was closed by the removal");
});

Deno.test("comments and reports: remove a comment, close a report", async () => {
  const detail = await (await call("GET", `/v/comment/${mayaComment}`, { token: mod.token })).text();
  assert(detail.includes("Rude comment &lt;b&gt;") && !detail.includes("<b>"), "comment text escaped");
  assertEquals((await act(mod.token, "remove_comment", { id: mayaComment, reason: "Rude." })).status, 200, "remove the comment");
  const again = await act(mod.token, "remove_comment", { id: mayaComment, reason: "Rude." });
  assertEquals(again.status, 409, "removing it twice is refused");
  assert(String((await again.json()).message).includes("not found"), "with a sentence");
  const qr = await http("/rest/v1/rpc/report_item", { method: "POST", key: ANON, token: lena.token, body: { p_kind: "video", p_id: adamVideo, p_reason: "other" } });
  assertEquals(qr.status, 200);
  const open = (await svc.rpc("mod_reports_queue", {})).data as { id: string; target_id: string }[];
  const mine = open.find((r) => r.target_id === adamVideo)!;
  assertEquals((await act(mod.token, "close_report", { id: mine.id })).status, 200, "close");
  assertEquals(((await svc.rpc("mod_reports_queue", {})).data as { id: string }[]).some((r) => r.id === mine.id), false, "it leaves the queue");
});

Deno.test("review requests: the queue and both outcomes", async () => {
  assertEquals((await act(mod.token, "remove_video", { id: lenaVideo, reason: "Not allowed here." })).status, 200, "remove Lena's response");
  const actionId = ((await svc.rpc("mod_account_log", { p_account: lena.id })).data as { id: string }[])[0].id;
  const rr = await http("/rest/v1/rpc/request_review", { method: "POST", key: ANON, token: lena.token, body: { p_action: actionId } });
  assertEquals(rr.status, 204, "Lena asks for a review");
  const q = await (await call("GET", "/v/reviews", { token: mod.token })).text();
  assert(q.includes(`@${lena.username}`) && q.includes("Not allowed here."), "it is in the queue");
  assertEquals((await act(mod.token, "decide_review", { action: actionId, outcome: "maybe" })).status, 400, "a bad outcome");
  assertEquals((await act(mod.token, "decide_review", { action: actionId, outcome: "reversed", note: "our mistake" })).status, 200, "reversed");
  const v = await http(`/rest/v1/responses?id=eq.${lenaVideo}&select=status`);
  assertEquals((v.json as { status: string }[])[0].status, "live", "the response is back");
  const empty = await (await call("GET", "/v/reviews", { token: mod.token })).text();
  assert(!empty.includes("Not allowed here."), "and out of the queue");
});

Deno.test("accounts: lookup, restrict, suspend, restore", async () => {
  const found = await (await call("GET", `/v/accounts?q=${encodeURIComponent(`@${adam.username.slice(0, 8)}`)}`, { token: mod.token })).text();
  assert(found.includes(`@${adam.username}`), "found by the beginning of a username");
  const page = await (await call("GET", `/v/account/${adam.id}`, { token: mod.token })).text();
  assert(page.includes("Adam's response") && page.includes("Moderation log"), "the account page lists content and the log");
  assert(!page.includes("@example.com"), "and never an email address");

  const past = await act(mod.token, "restrict", { account: adam.id, until: "2001-01-01", reason: "x" });
  assertEquals(past.status, 409, "a date in the past is refused by the database");
  assert(String((await past.json()).message).includes("future"));
  const until = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  assertEquals((await act(mod.token, "restrict", { account: adam.id, until, reason: "Two responses removed for harassment." })).status, 200, "restrict");
  let st = (await http(`/rest/v1/accounts?id=eq.${adam.id}&select=moderation_status,restricted_until`)).json as { moderation_status: string }[];
  assertEquals(st[0].moderation_status, "restricted");
  assertEquals((await act(mod.token, "suspend", { account: adam.id, reason: "Severe abuse." })).status, 200, "suspend");
  st = (await http(`/rest/v1/accounts?id=eq.${adam.id}&select=moderation_status`)).json as { moderation_status: string }[];
  assertEquals(st[0].moderation_status, "suspended");
  // Suspension is enforced across the product API (pre_request): Adam's own token is refused.
  const refused = await http("/rest/v1/rpc/home_feed", { method: "POST", key: ANON, token: adam.token, body: {} });
  assert(refused.status >= 400, `a suspended account's API call is refused (${refused.status})`);
  assertEquals((await act(mod.token, "restore_account", { account: adam.id, reason: "Appeal upheld." })).status, 200, "restore");
  st = (await http(`/rest/v1/accounts?id=eq.${adam.id}&select=moderation_status`)).json as { moderation_status: string }[];
  assertEquals(st[0].moderation_status, "active");
  assertEquals((await act(mod.token, "suspend", { account: mod.id, reason: "x" })).status, 400, "a moderator cannot suspend themselves in the admin");
  const logs = await (await call("GET", `/v/account/${adam.id}`, { token: mod.token })).text();
  assert(logs.includes("restrict") && logs.includes("suspend") && logs.includes("restore"), "all three are in the log");
});

Deno.test("prompt suggestions: approve with keep-name false, decline with a fixed reason", async () => {
  const ins = await http("/rest/v1/suggestions?select=id", { method: "POST", body: [
    { author_id: lena.id, text: `Suggestion A ${run}` }, { author_id: adam.id, text: `Suggestion B ${run}` },
  ] });
  assertEquals(ins.status, 201, "suggestions");
  const [a, b] = (ins.json as { id: string }[]).map((x) => x.id);
  const q = await (await call("GET", "/v/suggestions", { token: mod.token })).text();
  assert(q.includes(`Suggestion A ${run}`) && q.includes("Singles out a person or group"), "queue with the fixed reasons");
  assertEquals((await act(mod.token, "decline_suggestion", { id: b, reason: "rude" })).status, 400, "only the fixed reasons");
  assertEquals((await act(mod.token, "decline_suggestion", { id: b, reason: "unclear" })).status, 200, "decline");
  assertEquals((await act(mod.token, "approve_suggestion", { id: a, keep_name: false })).status, 200, "approve");
  const s = (await http(`/rest/v1/suggestions?id=in.(${a},${b})&select=id,status,decline_reason,prompt_id`)).json as { id: string; status: string; decline_reason: string; prompt_id: string }[];
  assertEquals(s.find((x) => x.id === a)!.status, "live");
  assertEquals(s.find((x) => x.id === b)!.decline_reason, "unclear");
  const prompt = (await http(`/rest/v1/prompts?id=eq.${s.find((x) => x.id === a)!.prompt_id}&select=attribution`)).json as { attribution: boolean }[];
  assertEquals(prompt[0].attribution, false, "published without the name");
  assertEquals((await act(mod.token, "approve_suggestion", { id: a })).status, 409, "a decided suggestion cannot be decided again");
});
