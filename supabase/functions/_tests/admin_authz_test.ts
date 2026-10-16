// Authorization and rendering tests for the moderation admin (supabase/functions/admin). The
// handler runs in-process with the token check and the database mocked: no network, no stack.
//
//   deno test --allow-env supabase/functions/_tests/admin_authz_test.ts
//
// What is proven here: nothing but the sign-in page answers without a verified token (401); a
// verified account that is not an active moderator gets 403 and an empty body on every route and
// every action, with only the membership check made against the database; membership is checked on
// every request; actions pass the moderator's identity from the database and only the existing
// mod_* functions; no cookie is ever read or set; output is escaped.
import { assert, assertEquals } from "./assert.ts";
import { createHandler, type Deps, type RpcResult } from "../admin/handler.ts";

const MOD = "a1111111-1111-4111-8111-111111111111";
const OTHER = "b2222222-2222-4222-8222-222222222222";
const ID = "c3333333-3333-4333-8333-333333333333";
const TOK_MOD = "tok-moderator-aaaaaaaaaaaaaaaaaaaa";
const TOK_USER = "tok-ordinary-bbbbbbbbbbbbbbbbbbbbbb";
const TOK_BAD = "tok-forged-cccccccccccccccccccccccc";
const IDENTITY = `@alice (${MOD})`;

type Call = { name: string; args: Record<string, unknown> };

function setup(overrides: { answers?: Record<string, unknown>; errors?: Record<string, string>; whoamiError?: boolean } = {}) {
  const calls: Call[] = [];
  const state = { moderators: new Set([MOD]) as Set<string> };
  const logs: Record<string, unknown>[] = [];
  const answers: Record<string, unknown> = {
    mod_reports_queue: [],
    mod_review_queue: [],
    mod_suggestions_queue: [],
    mod_account_lookup: [],
    mod_account_overview: { account: { id: ID, name: "Lena", username: "lena", moderation_status: "active" }, videos: [], comments: [] },
    mod_account_log: [],
    mod_report_detail: { id: ID, kind: "profile", target_id: ID, reason: "spam", status: "open", created_at: "2026-10-16T10:00:00Z", others: [], reporter: null },
    mod_video_detail: { id: ID, kind: "response", status: "live", created_at: "2026-10-16T10:00:00Z", author: null, prompt: null, playback_public: false, restorable: false },
    mod_comment_detail: { id: ID, body: "hi", created_at: "2026-10-16T10:00:00Z", deleted_at: null, author: null, response: null, removal: null },
    ...overrides.answers,
  };
  const deps: Deps = {
    verifyToken: (t) => Promise.resolve(t === TOK_MOD ? { id: MOD } : t === TOK_USER ? { id: OTHER } : null),
    rpc: (name, args = {}): Promise<RpcResult> => {
      calls.push({ name, args });
      if (name === "mod_whoami") {
        if (overrides.whoamiError) return Promise.resolve({ data: null, error: { message: "db down" } });
        const id = args.p_account as string;
        return Promise.resolve({ data: state.moderators.has(id) ? { id, username: "alice", name: "Alice", identity: `@alice (${id})` } : null, error: null });
      }
      if (overrides.errors?.[name]) return Promise.resolve({ data: null, error: { message: overrides.errors[name] } });
      return Promise.resolve({ data: answers[name] ?? "00000000-0000-4000-8000-000000000000", error: null });
    },
    config: { anonKey: "anon-public-key", authBase: "", webBase: "" },
    log: (e) => logs.push(e),
  };
  const handler = createHandler(deps);
  const call = (method: string, path: string, init: { token?: string; body?: unknown; headers?: Record<string, string>; raw?: string } = {}) => {
    const headers: Record<string, string> = { ...init.headers };
    if (init.token) headers["Authorization"] = `Bearer ${init.token}`;
    let body: string | undefined;
    if (init.raw !== undefined) body = init.raw;
    else if (init.body !== undefined) {
      body = JSON.stringify(init.body);
      headers["Content-Type"] ??= "application/json";
    }
    return handler(new Request(`http://localhost:54321/functions/v1/admin${path}`, { method, headers, body }));
  };
  return { call, calls, state, logs };
}

// Every route the function has, and every action.
const ACTIONS: Record<string, Record<string, unknown>> = {
  remove_video: { id: ID, reason: "Harassment" },
  restore_video: { id: ID, reason: "Wrongly removed" },
  remove_comment: { id: ID, reason: "Harassment" },
  close_report: { id: ID },
  restrict: { account: ID, until: "2099-01-01", reason: "Repeated harassment" },
  suspend: { account: ID, reason: "Severe abuse" },
  restore_account: { account: ID, reason: "Appeal upheld" },
  decide_review: { action: ID, outcome: "upheld" },
  approve_suggestion: { id: ID, keep_name: true },
  decline_suggestion: { id: ID, reason: "unclear" },
};
const GET_ROUTES = [
  "/me", "/v/reports", "/v/reviews", "/v/suggestions", "/v/accounts", "/v/accounts?q=lena",
  `/v/video/${ID}`, `/v/comment/${ID}`, `/v/account/${ID}`, `/v/report/${ID}`,
];
const PROTECTED: { method: string; path: string; body?: unknown }[] = [
  ...GET_ROUTES.map((path) => ({ method: "GET", path })),
  ...Object.entries(ACTIONS).map(([a, body]) => ({ method: "POST", path: `/a/${a}`, body: { ...body, confirm: true } })),
  { method: "GET", path: "/anything-else" },
  { method: "DELETE", path: "/" + "v/reports" },
  { method: "POST", path: "/a/warn", body: { confirm: true } },
  { method: "OPTIONS", path: "/a/remove_video" },
];

Deno.test("the sign-in page is public, holds no data, and is locked down", async () => {
  const { call, calls } = setup();
  const res = await call("GET", "");
  assertEquals(res.status, 200, "status");
  const body = await res.text();
  assert(body.includes("Shortcut moderation"), "it is the admin page");
  assert(body.includes("anon-public-key"), "the public anon key is on the page, by design");
  assertEquals(calls.length, 0, "no database call for the sign-in page");
  const csp = res.headers.get("Content-Security-Policy") ?? "";
  const nonce = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(csp)?.[1] ?? "";
  assert(nonce.length >= 16, "a fresh nonce");
  assert(body.includes(`<script nonce="${nonce}">`), "the one script carries it");
  assert(!/unsafe-inline|unsafe-eval|\*/.test(csp), "no unsafe-inline, unsafe-eval or wildcard in the policy");
  assert(csp.includes("frame-ancestors 'none'") && csp.includes("form-action 'none'") && csp.includes("default-src 'none'"), "framing and forms locked");
  assert(!/\son[a-z]+=|javascript:/i.test(body), "no inline handlers or javascript: URLs");
  assert((res.headers.get("Cache-Control") ?? "").includes("no-store"), "never cached");
  assertEquals(res.headers.get("X-Frame-Options"), "DENY", "not framed");
  assertEquals(res.headers.get("X-Content-Type-Options"), "nosniff", "nosniff");
  assert(!res.headers.has("Set-Cookie"), "no cookie");
  assert(![...res.headers.keys()].some((h) => h.toLowerCase().startsWith("access-control-")), "no CORS");
  const nonce2 = /script-src 'nonce-([A-Za-z0-9]+)'/.exec((await call("GET", "")).headers.get("Content-Security-Policy") ?? "")?.[1];
  assert(nonce2 !== nonce, "the nonce differs per response");
});

Deno.test("the page's config cannot break out of its script block", async () => {
  const deps = setup();
  const h = createHandler({
    verifyToken: () => Promise.resolve(null),
    rpc: () => Promise.resolve({ data: null, error: null }),
    config: { anonKey: "</script><script>alert(1)</script>", authBase: "", webBase: "" },
  });
  const body = await (await h(new Request("http://localhost/functions/v1/admin/"))).text();
  assert(!body.includes("</script><script>alert(1)"), "markup in the config is escaped");
  assert(body.includes("\\u003c/script\\u003e"), "as unicode escapes");
  void deps;
});

Deno.test("no token: 401 on every route and action, and the database is never asked", async () => {
  const { call, calls } = setup();
  for (const r of PROTECTED) {
    const res = await call(r.method, r.path, { body: r.body });
    assertEquals(res.status, 401, `${r.method} ${r.path}`);
    const text = await res.text();
    assert(!text.includes("reports") || text.includes("unauthorized"), "nothing but the refusal");
  }
  assertEquals(calls.length, 0, "no database call without a token");
});

Deno.test("a token Auth does not accept: 401, and the membership check is not even made", async () => {
  const { call, calls } = setup();
  for (const r of PROTECTED) {
    assertEquals((await call(r.method, r.path, { token: TOK_BAD, body: r.body })).status, 401, `${r.method} ${r.path}`);
  }
  assertEquals(calls.length, 0, "forged tokens reach nothing");
  // Malformed Authorization headers.
  for (const h of ["Bearer", "Bearer ", "Basic abc", TOK_MOD, "Bearer a b", "Bearer short"]) {
    const res = await call("GET", "/v/reports", { headers: { Authorization: h } });
    assertEquals(res.status, 401, `Authorization: ${h}`);
  }
  assertEquals(calls.length, 0, "and malformed headers too");
});

Deno.test("a valid account that is not a moderator: 403, empty body, nothing but the membership check", async () => {
  const { call, calls } = setup();
  for (const r of PROTECTED) {
    const res = await call(r.method, r.path, { token: TOK_USER, body: r.body });
    assertEquals(res.status, 403, `${r.method} ${r.path}`);
    assertEquals(await res.text(), "", `${r.method} ${r.path} gives no information`);
  }
  assert(calls.length > 0 && calls.every((c) => c.name === "mod_whoami"), `only mod_whoami was called, got ${[...new Set(calls.map((c) => c.name))]}`);
  assert(calls.every((c) => c.args.p_account === OTHER), "for the verified account only");
});

Deno.test("an inactive, suspended or deleted moderator is the same as no moderator: 403", async () => {
  // mod_whoami answers null for a moderator switched off, suspended or deleted (pgTAP 0031).
  const { call, calls, state } = setup();
  assertEquals((await call("GET", "/v/reports", { token: TOK_MOD })).status, 200, "active: 200");
  state.moderators.delete(MOD);
  const res = await call("GET", "/v/reports", { token: TOK_MOD });
  assertEquals(res.status, 403, "switched off: 403 on the very next request (no caching of membership)");
  assertEquals(await res.text(), "", "and nothing is revealed");
  const res2 = await call("POST", "/a/remove_video", { token: TOK_MOD, body: { ...ACTIONS.remove_video, confirm: true } });
  assertEquals(res2.status, 403, "actions too");
  assert(!calls.some((c) => c.name === "mod_remove_video"), "no action reached the database");
});

Deno.test("membership is checked on every request", async () => {
  const { call, calls } = setup();
  for (let i = 0; i < 3; i++) await call("GET", "/me", { token: TOK_MOD });
  assertEquals(calls.filter((c) => c.name === "mod_whoami").length, 3, "one membership check per request");
});

Deno.test("if the membership check cannot be made, nothing is served (fail closed)", async () => {
  const { call, calls } = setup({ whoamiError: true });
  for (const r of PROTECTED.filter((x) => x.method !== "OPTIONS")) {
    const res = await call(r.method, r.path, { token: TOK_MOD, body: r.body });
    assertEquals(res.status, 503, `${r.method} ${r.path}`);
    assertEquals((await res.text()).includes("reports"), false, "no data");
  }
  assert(calls.every((c) => c.name === "mod_whoami"), "nothing else was called");
});

Deno.test("cookies are never authentication: a cookie alone is 401, and nothing sets one", async () => {
  const { call, calls } = setup();
  const withCookie = { Cookie: `sb-access-token=${TOK_MOD}; token=${TOK_MOD}; Authorization=Bearer ${TOK_MOD}` };
  for (const r of PROTECTED.filter((x) => x.method !== "OPTIONS")) {
    const res = await call(r.method, r.path, { headers: withCookie, body: r.body });
    assertEquals(res.status, 401, `${r.method} ${r.path} with only cookies`);
  }
  assertEquals(calls.length, 0, "no database call");
  // The same cookie beside a non-moderator's header changes nothing.
  assertEquals((await call("GET", "/v/reports", { token: TOK_USER, headers: withCookie })).status, 403, "a cookie does not upgrade a non-moderator");
  // No response ever sets a cookie or opens CORS.
  const r1 = await call("GET", "/v/reports", { token: TOK_MOD });
  const r2 = await call("POST", "/a/close_report", { token: TOK_MOD, body: { id: ID, confirm: true } });
  for (const r of [r1, r2]) {
    assert(!r.headers.has("Set-Cookie"), "no Set-Cookie");
    assert(![...r.headers.keys()].some((h) => h.toLowerCase().startsWith("access-control-")), "no CORS headers");
  }
});

Deno.test("actions: POST and JSON only, from the same site, with the moderator's confirmation", async () => {
  const { call, calls } = setup();
  const noAction = () => assert(!calls.some((c) => c.name.startsWith("mod_") && c.name !== "mod_whoami"), "no action was taken");
  // GET on an action route
  assertEquals((await call("GET", "/a/remove_video", { token: TOK_MOD })).status, 405, "GET is not an action");
  // not JSON: what a cross-site form can send
  const form = await call("POST", "/a/remove_video", { token: TOK_MOD, raw: `id=${ID}&reason=x&confirm=true`, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  assertEquals(form.status, 415, "form posts are refused");
  const plain = await call("POST", "/a/remove_video", { token: TOK_MOD, raw: JSON.stringify({ ...ACTIONS.remove_video, confirm: true }), headers: { "Content-Type": "text/plain" } });
  assertEquals(plain.status, 415, "text/plain (the other no-preflight type) is refused");
  // cross-site
  const cross = await call("POST", "/a/remove_video", { token: TOK_MOD, body: { ...ACTIONS.remove_video, confirm: true }, headers: { "Sec-Fetch-Site": "cross-site" } });
  assertEquals(cross.status, 403, "a request the browser marks cross-site is refused");
  const same = await call("POST", "/a/remove_video", { token: TOK_MOD, body: { ...ACTIONS.remove_video, confirm: true }, headers: { "Sec-Fetch-Site": "same-origin" } });
  assertEquals(same.status, 200, "same-origin is fine");
  calls.length = 0;
  // no confirmation
  for (const [a, body] of Object.entries(ACTIONS)) {
    assertEquals((await call("POST", `/a/${a}`, { token: TOK_MOD, body })).status, 400, `${a} without confirm`);
    assertEquals((await call("POST", `/a/${a}`, { token: TOK_MOD, body: { ...body, confirm: "true" } })).status, 400, `${a} with confirm as a string`);
  }
  noAction();
  // junk
  assertEquals((await call("POST", "/a/remove_video", { token: TOK_MOD, raw: "{not json", headers: { "Content-Type": "application/json" } })).status, 400, "unreadable body");
  assertEquals((await call("POST", "/a/remove_video", { token: TOK_MOD, raw: "[1]", headers: { "Content-Type": "application/json" } })).status, 400, "array body");
  assertEquals((await call("POST", "/a/remove_video", { token: TOK_MOD, raw: "x".repeat(20000), headers: { "Content-Type": "application/json" } })).status, 413, "too large");
  noAction();
  // PUT/DELETE
  assertEquals((await call("PUT", "/a/remove_video", { token: TOK_MOD, body: { confirm: true } })).status, 405, "PUT");
  assertEquals((await call("POST", "/v/reports", { token: TOK_MOD, body: {} })).status, 405, "POST on a view");
  assertEquals((await call("OPTIONS", "/a/remove_video", { token: TOK_MOD })).status, 405, "OPTIONS is not answered (no preflight succeeds)");
});

Deno.test("each action calls its mod_* function with the moderator's identity from the database", async () => {
  const expected: Record<string, [string, Record<string, unknown>]> = {
    remove_video: ["mod_remove_video", { p_video: ID, p_reason: "Harassment", p_moderator: IDENTITY, p_note: null }],
    restore_video: ["mod_restore_video", { p_video: ID, p_reason: "Wrongly removed", p_moderator: IDENTITY, p_note: null }],
    remove_comment: ["mod_remove_comment", { p_comment: ID, p_reason: "Harassment", p_moderator: IDENTITY, p_note: null }],
    close_report: ["mod_close_report", { p_report: ID, p_moderator: IDENTITY }],
    restrict: ["mod_restrict", { p_account: ID, p_until: "2099-01-01T00:00:00.000Z", p_reason: "Repeated harassment", p_moderator: IDENTITY, p_note: null }],
    suspend: ["mod_suspend", { p_account: ID, p_reason: "Severe abuse", p_moderator: IDENTITY, p_note: null }],
    restore_account: ["mod_restore_account", { p_account: ID, p_reason: "Appeal upheld", p_moderator: IDENTITY, p_note: null }],
    decide_review: ["mod_decide_review", { p_action: ID, p_outcome: "upheld", p_moderator: IDENTITY, p_note: null }],
    approve_suggestion: ["mod_approve_suggestion", { p_id: ID, p_moderator: IDENTITY, p_keep_attribution: true, p_note: null }],
    decline_suggestion: ["mod_decline_suggestion", { p_id: ID, p_reason: "unclear", p_moderator: IDENTITY, p_note: null }],
  };
  for (const [action, body] of Object.entries(ACTIONS)) {
    const { call, calls, logs } = setup();
    // A request cannot choose who it acts as.
    const res = await call("POST", `/a/${action}`, { token: TOK_MOD, body: { ...body, confirm: true, moderator: "someone else", p_moderator: "someone else", note: "internal" } });
    assertEquals(res.status, 200, action);
    const j = await res.json();
    assertEquals(j.ok, true, `${action} ok`);
    const [fn, args] = expected[action];
    const made = calls.filter((c) => c.name !== "mod_whoami");
    assertEquals(made.length, 1, `${action} makes exactly one call`);
    assertEquals(made[0].name, fn, `${action} calls ${fn}`);
    const wantArgs = { ...args };
    if ("p_note" in wantArgs) wantArgs.p_note = "internal";
    assertEquals(made[0].args, wantArgs, `${action} arguments`);
    assertEquals(logs.length, 1, "one log line");
    assert(!JSON.stringify(logs[0]).includes(TOK_MOD), "the log has no token");
  }
});

Deno.test("there is no warn, no way to add a moderator, and nothing that is not an existing mod_* action", async () => {
  const { call, calls } = setup();
  for (const a of ["warn", "mod_warn", "add_moderator", "add-moderator", "deactivate_moderator", "sql", "rpc", "..%2Fme", ""]) {
    const res = await call("POST", `/a/${a}`, { token: TOK_MOD, body: { ...ACTIONS.suspend, confirm: true } });
    assertEquals(res.status, 404, `/a/${a}`);
  }
  assert(calls.every((c) => c.name === "mod_whoami"), "none reached the database");
});

Deno.test("input is validated before the database is asked", async () => {
  const { call, calls } = setup();
  const post = (action: string, body: Record<string, unknown>) => call("POST", `/a/${action}`, { token: TOK_MOD, body: { confirm: true, ...body } });
  assertEquals((await post("remove_video", { id: "not-a-uuid", reason: "x" })).status, 400, "bad id");
  assertEquals((await post("remove_video", { id: ID, reason: "" })).status, 400, "no reason");
  assertEquals((await post("remove_video", { id: ID, reason: "   " })).status, 400, "blank reason");
  assertEquals((await post("remove_video", { id: ID, reason: "x".repeat(501) })).status, 400, "reason too long");
  assertEquals((await post("remove_video", { id: ID, reason: "ok", note: "x".repeat(2001) })).status, 400, "note too long");
  assertEquals((await post("remove_video", { id: ID, reason: 5 })).status, 400, "reason not text");
  assertEquals((await post("restrict", { account: ID, reason: "x", until: "tomorrow" })).status, 400, "bad date");
  assertEquals((await post("restrict", { account: ID, reason: "x" })).status, 400, "no date");
  assertEquals((await post("decide_review", { action: ID, outcome: "maybe" })).status, 400, "bad outcome");
  assertEquals((await post("decline_suggestion", { id: ID, reason: "because" })).status, 400, "reason off the fixed list");
  assertEquals((await post("decline_suggestion", { id: ID, reason: "__proto__" })).status, 400, "or inherited from the prototype");
  assertEquals((await post("suspend", { account: MOD, reason: "x" })).status, 400, "a moderator cannot suspend themselves here");
  assertEquals((await post("restrict", { account: MOD, reason: "x", until: "2099-01-01" })).status, 400, "or restrict");
  assert(calls.every((c) => c.name === "mod_whoami"), "none reached the database");
  // keep_name defaults to keeping the author's name; false removes it.
  await post("approve_suggestion", { id: ID, keep_name: false });
  assertEquals(calls.at(-1)?.args.p_keep_attribution, false, "keep_name false is passed");
});

Deno.test("a refusal from the database is shown as a plain sentence, never as database text", async () => {
  const known = setup({ errors: { mod_restore_video: "asset_deleted" } });
  const r = await known.call("POST", "/a/restore_video", { token: TOK_MOD, body: { ...ACTIONS.restore_video, confirm: true } });
  assertEquals(r.status, 409, "status");
  const j = await r.json();
  assertEquals(j.ok, false, "not ok");
  assert(String(j.message).includes("permanently deleted"), "a sentence the moderator can act on");
  const odd = setup({ errors: { mod_remove_video: 'duplicate key value violates unique constraint "responses_pkey"' } });
  const r2 = await odd.call("POST", "/a/remove_video", { token: TOK_MOD, body: { ...ACTIONS.remove_video, confirm: true } });
  assertEquals(r2.status, 500, "unknown failure: 500");
  const text = await r2.text();
  assert(!text.includes("responses_pkey") && !text.includes("duplicate"), "no database text leaks");
});

Deno.test("views render for a moderator, with no caching", async () => {
  const { call, calls } = setup();
  for (const path of GET_ROUTES.filter((p) => p !== "/me")) {
    const res = await call("GET", path, { token: TOK_MOD });
    assert([200, 404].includes(res.status), `${path}: ${res.status}`);
    assert((res.headers.get("Cache-Control") ?? "").includes("no-store"), `${path} is not cacheable`);
    assert((res.headers.get("Content-Type") ?? "").startsWith("text/html"), `${path} is html`);
    await res.text();
  }
  const used = new Set(calls.map((c) => c.name));
  for (const fn of ["mod_reports_queue", "mod_review_queue", "mod_suggestions_queue", "mod_account_lookup", "mod_video_detail", "mod_comment_detail", "mod_account_overview", "mod_account_log", "mod_report_detail"]) {
    assert(used.has(fn), `${fn} is used`);
  }
  const me = await (await call("GET", "/me", { token: TOK_MOD })).json();
  assertEquals(me.identity, IDENTITY, "/me");
  // An id that is not a UUID never reaches the database.
  const before = calls.length;
  assertEquals((await call("GET", "/v/video/1;drop table", { token: TOK_MOD })).status, 404, "bad id");
  assertEquals(calls.length - before, 1, "only the membership check");
});

const EVIL = `<script>alert(1)</script>"><img src=x onerror=alert(2)>'`;

Deno.test("everything from the database is escaped", async () => {
  const author = { id: OTHER, name: EVIL, username: EVIL, moderation_status: "active", restricted_until: null, deleted_at: null, joined_at: "2026-10-01T00:00:00Z" };
  const { call } = setup({
    answers: {
      mod_reports_queue: [{ id: ID, kind: "comment", target_id: ID, reason: "spam", created_at: "2026-10-16T10:00:00Z", reports_on_target: 2, author, comment: { body: EVIL } }],
      mod_video_detail: { id: ID, kind: "response", status: "live", caption: EVIL, duration_ms: 12000, created_at: "2026-10-16T10:00:00Z", author, prompt: { id: ID, text: EVIL },
        playback_public: true, playback_id: 'abc"><script>alert(3)</script>', restorable: true, open_reports: 1, all_reports: 1, removal: null },
      mod_comment_detail: { id: ID, body: EVIL, created_at: "2026-10-16T10:00:00Z", deleted_at: null, author, response: { id: ID, kind: "response", status: "live", prompt: EVIL }, removal: null },
      mod_account_lookup: [author],
      mod_suggestions_queue: [{ id: ID, text: EVIL, place: EVIL, attribution: true, author, created_at: "2026-10-16T10:00:00Z", has_draft: false }],
      mod_review_queue: [{ action_id: ID, account: author, requested_at: "2026-10-16T10:00:00Z", action: { kind: "remove", target_kind: "video", target_id: ID, reason: EVIL, note: EVIL, moderator: EVIL, created_at: "2026-10-16T10:00:00Z" }, video_restorable: true }],
    },
  });
  for (const path of ["/v/reports", "/v/reviews", "/v/suggestions", "/v/accounts?q=x", `/v/video/${ID}`, `/v/comment/${ID}`]) {
    const body = await (await call("GET", path, { token: TOK_MOD })).text();
    assert(body.length > 100, `${path} rendered`);
    assert(!body.includes("<script"), `${path}: no script element from data`);
    assert(!/<img[^>]*onerror/i.test(body), `${path}: no injected attribute`);
    assert(!body.includes("<img src=x"), `${path}: no injected element`);
    assert(body.includes("&lt;script&gt;"), `${path}: shown as text`);
  }
  const video = await (await call("GET", `/v/video/${ID}`, { token: TOK_MOD })).text();
  assert(!video.includes("stream.mux.com"), "a playback id that is not plain letters and digits is never put in a URL");
});

Deno.test("removed videos say they have no public playback; live ones link the stream", async () => {
  const author = { id: OTHER, name: "Maya", username: "maya", moderation_status: "active" };
  const base = { id: ID, kind: "response", caption: "hi", duration_ms: 9000, created_at: "2026-10-16T10:00:00Z", author, prompt: { id: ID, text: "P" }, open_reports: 0, all_reports: 0 };
  const removed = setup({ answers: { mod_video_detail: { ...base, status: "removed", playback_public: false, playback_id: null, restorable: true, holds_response_slot: true,
    removal: { action_id: ID, reason: "Spam", note: "n", moderator: "@nemat (x)", created_at: "2026-10-16T11:00:00Z", review: null } } } });
  const r = await (await removed.call("GET", `/v/video/${ID}`, { token: TOK_MOD })).text();
  assert(r.includes("No public playback"), "says so");
  assert(!r.includes("<video") && !r.includes("stream.mux.com") && !r.includes("image.mux.com"), "no player, stream or thumbnail");
  assert(r.includes("Restore this response"), "can be restored");
  assert(r.includes("still occupies its author"), "and says the removal keeps the response slot");
  assert(!r.includes("Remove this response"), "no remove button on a removed video");
  const gone = setup({ answers: { mod_video_detail: { ...base, status: "removed", playback_public: false, playback_id: null, restorable: false, removal: null } } });
  const g = await (await gone.call("GET", `/v/video/${ID}`, { token: TOK_MOD })).text();
  assert(g.includes("Cannot be restored") && !g.includes("Restore this response"), "an asset that is gone cannot be restored");
  const live = setup({ answers: { mod_video_detail: { ...base, status: "live", playback_public: true, playback_id: "AbC123xyz789", restorable: false, removal: null } } });
  const l = await (await live.call("GET", `/v/video/${ID}`, { token: TOK_MOD })).text();
  assert(l.includes("https://stream.mux.com/AbC123xyz789.m3u8"), "the HLS link");
  assert(l.includes(`data-web="/r/${ID}"`), "and the web player link");
  assert(l.includes("Remove this response"), "a live video can be removed");
});

Deno.test("the page uses the words response, video reply and comment", async () => {
  const author = { id: OTHER, name: "Maya", username: "maya", moderation_status: "active" };
  const reply = setup({ answers: { mod_video_detail: { id: ID, kind: "reply", status: "live", caption: null, duration_ms: 5000, created_at: "2026-10-16T10:00:00Z", author, prompt: { id: ID, text: "P" }, playback_public: true, playback_id: "AbC123xyz789", restorable: false, open_reports: 0, all_reports: 0, removal: null } } });
  const t = await (await reply.call("GET", `/v/video/${ID}`, { token: TOK_MOD })).text();
  assert(t.includes("Video reply") && t.includes("Remove this video reply"), "a video reply is called one");
  assert(!/\b(answer|post)\b/i.test(t.replace(/Posting is paused|posting/gi, "")), "never answer or post as a noun");
});
