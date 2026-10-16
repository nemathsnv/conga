// Integration tests for the Mux-checked abandonment (abandon-submission, 20261013000300; review of
// 13 Oct, B3) against a LOCAL Supabase stack: real Auth sessions, PostgREST and transactions. The
// handler runs in-process; Mux is a stub (api.mux.com only; any other non-local host throws), and
// each test sets what Mux says about the upload. Refuses to run unless SUPABASE_URL is local.
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test --allow-env --allow-net supabase/functions/_tests/abandon_integration_test.ts
import { assert, assertEquals } from "./assert.ts";
import { handleAbandonSubmission, SETTLE_AFTER_EXPIRY_MS } from "../abandon-submission/handler.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!API || !ANON || !SERVICE) throw new Error("set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY for the local stack");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error(`refusing to run against ${new URL(API).hostname}: local stack only`);
Deno.env.set("MUX_TOKEN_ID", "local-test-id");
Deno.env.set("MUX_TOKEN_SECRET", "local-test-secret");

const run = Date.now().toString(36);

// ---------------------------------------------------------------------------
// Mux stub. read: what GET /uploads/{id} answers; cancel: what PUT .../cancel does.
type Read = { status: string; asset_id?: string } | "error" | "network";
type Cancel = "ok" | "refuse" | "network" | "not_cancelled";
let read: (id: string) => Read = () => ({ status: "waiting" });
let cancel: (id: string) => Cancel = () => "ok";
let readDelay: Promise<void> | null = null;
const calls: { method: string; path: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === "api.mux.com") {
    const method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname });
    const cancelled = url.pathname.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)\/cancel$/);
    if (cancelled && method === "PUT") {
      const c = cancel(cancelled[1]);
      if (c === "network") throw new TypeError("network error");
      if (c === "refuse") return Response.json({ error: { type: "invalid_parameters", messages: ["upload is not waiting"] } }, { status: 400 });
      return Response.json({ data: { id: cancelled[1], status: c === "ok" ? "cancelled" : "waiting" } });
    }
    const got = url.pathname.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)$/);
    if (got && method === "GET") {
      if (readDelay) await readDelay;
      const r = read(got[1]);
      if (r === "network") throw new TypeError("network error");
      if (r === "error") return Response.json({ error: "boom" }, { status: 500 });
      return Response.json({ data: { id: got[1], ...r } });
    }
    return Response.json({ error: "stub: no route" }, { status: 404 });
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error(`test fetch to ${url.hostname} blocked`);
  return realFetch(input, init);
}) as typeof fetch;
function resetMux() {
  read = () => ({ status: "waiting" });
  cancel = () => "ok";
  readDelay = null;
  calls.length = 0;
}
const muxChanges = () => calls.filter((c) => c.method !== "GET");

// ---------------------------------------------------------------------------
async function http(path: string, opts: { method?: string; key?: string; token?: string; body?: unknown; prefer?: string } = {}) {
  const res = await realFetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers: { apikey: opts.key ?? SERVICE, Authorization: `Bearer ${opts.token ?? opts.key ?? SERVICE}`, "Content-Type": "application/json", ...(opts.prefer ? { Prefer: opts.prefer } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}
type Member = { id: string; token: string };
const members: Member[] = [];
async function member(name: string): Promise<Member> {
  const email = `abandon-${run}-${name}@example.com`;
  const created = await http("/auth/v1/admin/users", { method: "POST", body: { email, email_confirm: true } });
  assertEquals(created.status, 200, `create ${name}`);
  const id = (created.json as { id: string }).id;
  const link = await http("/auth/v1/admin/generate_link", { method: "POST", body: { type: "magiclink", email } });
  const verified = await http("/auth/v1/verify", { method: "POST", key: ANON, body: { type: "email", email, token: (link.json as { email_otp: string }).email_otp } });
  assertEquals(verified.status, 200, `sign in ${name}`);
  assertEquals((await http("/rest/v1/profiles", { method: "POST", body: { id, name, username: `ab${name}${run}`.slice(0, 24) } })).status, 201);
  const now = new Date().toISOString();
  await http(`/rest/v1/accounts?id=eq.${id}`, { method: "PATCH", body: { age_confirmed_at: now, public_disclosure_ack_at: now } });
  const m = { id, token: (verified.json as { access_token: string }).access_token };
  members.push(m);
  return m;
}
let seq = 0;
async function upload(m: Member): Promise<string> {
  const id = `upab${run}n${++seq}`;
  assertEquals((await http("/rest/v1/video_uploads", { method: "POST", body: { account_id: m.id, upload_id: id, status: "active" } })).status, 201);
  return id;
}
async function post(m: Member, prompt: string, u: string, s: string) {
  const r = await http("/rest/v1/rpc/post_response", { method: "POST", key: ANON, token: m.token, body: { p_prompt: prompt, p_upload_id: u, p_caption: null, p_duration_ms: 9000, p_submission: s } });
  return { status: r.status, json: r.json as Record<string, unknown>, error: (r.json as { message?: string })?.message ?? null };
}
async function abandon(token: string | null, body: unknown) {
  const res = await handleAbandonSubmission(new Request("http://localhost/functions/v1/abandon-submission", {
    method: "POST", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}
const row = async (id: string) => ((await http(`/rest/v1/responses?id=eq.${id}&select=status,mux_asset_id`)).json as { status: string }[])[0];
const sub = async (id: string) => ((await http(`/rest/v1/post_submissions?id=eq.${id}&select=abandoned_at,abandoning_until,response_id`)).json as { abandoned_at: string | null; abandoning_until: string | null }[])[0];

const prompts = await http("/rest/v1/prompts?select=id", {
  method: "POST", prefer: "return=representation",
  body: Array.from({ length: 40 }, (_, n) => ({ text: `Abandon test prompt ${n} ${run}`, status: "live", published_at: new Date().toISOString() })),
});
assertEquals(prompts.status, 201);
const P = (prompts.json as { id: string }[]).map((p) => p.id);
let promptIndex = 0;
const lena = await member("lena");
const adam = await member("adam");

/** Lena posts with a submission; the app may never have heard the answer. */
async function posted() {
  const u = await upload(lena);
  const s = crypto.randomUUID();
  const r = await post(lena, P[promptIndex++], u, s);
  assertEquals(r.status, 200, String(r.error));
  return { u, s, id: r.json.id as string };
}

// ---------------------------------------------------------------------------
Deno.test("input: no session is 401; a bad id is 400; GET is 405; Mux is not asked", async () => {
  resetMux();
  assertEquals((await abandon(null, { submissionId: crypto.randomUUID() })).status, 401);
  assertEquals((await abandon(ANON, { submissionId: crypto.randomUUID() })).status, 401);
  assertEquals((await abandon(lena.token, { submissionId: "not-a-uuid" })).status, 400);
  const get = await handleAbandonSubmission(new Request("http://localhost/functions/v1/abandon-submission", { headers: { Authorization: `Bearer ${lena.token}` } }));
  assertEquals(get.status, 405);
  await get.body?.cancel();
  assertEquals(calls.length, 0);
});

Deno.test("upload still waiting at Mux: cancelled there first, then the row retired; the prompt is free", async () => {
  resetMux();
  const p = await posted();
  const r = await abandon(lena.token, { submissionId: p.s });
  assertEquals(r.json, { outcome: "abandoned", reason: "cancelled" });
  assertEquals(calls.map((c) => `${c.method} ${c.path}`), [`GET /video/v1/uploads/${p.u}`, `PUT /video/v1/uploads/${p.u}/cancel`]);
  assertEquals((await row(p.id)).status, "deleted");
  assert((await sub(p.s)).abandoned_at, "closed");
  assertEquals((await post(lena, P[promptIndex - 1], await upload(lena), crypto.randomUUID())).status, 200, "a new recording can respond");
});

Deno.test("Mux already has it (asset_created, or an asset id): kept, the row and upload untouched, the app told the row", async () => {
  for (const said of [{ status: "asset_created", asset_id: "asX" }, { status: "waiting", asset_id: "asY" }]) {
    resetMux();
    read = () => said;
    const p = await posted();
    const r = await abandon(lena.token, { submissionId: p.s });
    assertEquals(r.json, { outcome: "kept", reason: "at_mux", responseId: p.id });
    assertEquals(muxChanges(), [], "no cancel");
    assertEquals((await row(p.id)).status, "processing");
    assertEquals((await sub(p.s)).abandoning_until, null, "released");
  }
});

Deno.test("Mux cannot be read (error or no answer): kept unverified, released, nothing changed", async () => {
  for (const said of ["error", "network"] as const) {
    resetMux();
    read = () => said;
    const p = await posted();
    const r = await abandon(lena.token, { submissionId: p.s });
    assertEquals([r.json.outcome, r.json.reason], ["kept", "unverified"]);
    assertEquals(muxChanges(), []);
    assertEquals((await row(p.id)).status, "processing");
    assertEquals((await sub(p.s)).abandoning_until, null);
  }
});

Deno.test("an unknown upload state: kept unverified", async () => {
  resetMux();
  read = () => ({ status: "something_new" });
  const p = await posted();
  assertEquals((await abandon(lena.token, { submissionId: p.s })).json.reason, "unverified");
  assertEquals((await row(p.id)).status, "processing");
});

Deno.test("cancel refused (it stopped waiting meanwhile) or not confirmed: kept; the next attempt reads the real state", async () => {
  for (const c of ["refuse", "network", "not_cancelled"] as const) {
    resetMux();
    cancel = () => c;
    const p = await posted();
    const r = await abandon(lena.token, { submissionId: p.s });
    assertEquals([r.json.outcome, r.json.reason], ["kept", "unverified"], c);
    assertEquals((await row(p.id)).status, "processing");
    // Later: Mux says it was cancelled after all (no answer had reached us): retired, no new cancel.
    resetMux();
    read = () => ({ status: "cancelled" });
    assertEquals((await abandon(lena.token, { submissionId: p.s })).json, { outcome: "abandoned", reason: "cancelled" });
    assertEquals(muxChanges(), []);
  }
});

Deno.test("Mux says timed out or cancelled with no asset: nothing more can arrive; retired without a cancel", async () => {
  for (const status of ["timed_out", "cancelled"]) {
    resetMux();
    read = () => ({ status });
    const p = await posted();
    assertEquals((await abandon(lena.token, { submissionId: p.s })).json.outcome, "abandoned", status);
    assertEquals(muxChanges(), []);
    assertEquals((await row(p.id)).status, "deleted");
  }
});

/** Moves the upload's recorded expiry (video_uploads.expires_at) to `msFromNow`. */
async function expireUpload(u: string, msFromNow: number) {
  const at = new Date(Date.now() + msFromNow).toISOString();
  assertEquals((await http(`/rest/v1/video_uploads?upload_id=eq.${u}`, { method: "PATCH", body: { expires_at: at } })).status, 204);
}

Deno.test("Mux says errored (undocumented) with no asset: kept unverified while the URL is valid or just expired; the app's recording is not released", async () => {
  for (const status of ["errored", "something_new"]) {
    for (const expiry of [30 * 60_000, -60_000, -SETTLE_AFTER_EXPIRY_MS + 60_000]) {
      resetMux();
      read = () => ({ status });
      const p = await posted();
      await expireUpload(p.u, expiry);
      const r = await abandon(lena.token, { submissionId: p.s });
      assertEquals(r.json, { outcome: "kept", reason: "unverified", responseId: p.id }, `${status}, expiry ${expiry}`);
      assertEquals(muxChanges(), [], "no cancel");
      assertEquals((await row(p.id)).status, "processing");
      const s = await sub(p.s);
      assertEquals([s.abandoned_at, s.abandoning_until], [null, null], "not closed, hold released");
    }
  }
});

Deno.test("errored, asked again once the URL has long expired and Mux still has no asset: retired (bounded); a replay is then closed", async () => {
  resetMux();
  read = () => ({ status: "errored" });
  const p = await posted();
  assertEquals((await abandon(lena.token, { submissionId: p.s })).json.reason, "unverified", "first: URL still valid");
  await expireUpload(p.u, -SETTLE_AFTER_EXPIRY_MS - 60_000);
  assertEquals((await abandon(lena.token, { submissionId: p.s })).json.outcome, "abandoned", "later reconciliation");
  assertEquals(muxChanges(), []);
  assertEquals((await row(p.id)).status, "deleted");
  assert((await sub(p.s)).abandoned_at, "closed");
  const replay = await post(lena, P[promptIndex - 1], p.u, p.s);
  assertEquals([replay.status, replay.error], [400, "submission_closed"]);
  // An asset Mux makes from it after all is never published: its ready event finds a deleted row.
  const late = await http("/rest/v1/rpc/mark_response_live", { method: "POST", body: { p_upload_id: p.u, p_asset_id: `aslate${run}`, p_playback_id: `pblate${run}`, p_duration_ms: 9000, p_passthrough: lena.id } });
  assertEquals((late.json as { status: string }).status, "deleted");
  const queued = await http(`/rest/v1/mux_cleanup_jobs?asset_id=eq.aslate${run}&select=action,reason`);
  assertEquals(queued.json, [{ action: "delete_asset", reason: "abandoned" }]);
});

Deno.test("errored with an asset id, even long expired: kept at_mux", async () => {
  resetMux();
  read = () => ({ status: "errored", asset_id: "asErr" });
  const p = await posted();
  await expireUpload(p.u, -SETTLE_AFTER_EXPIRY_MS - 60_000);
  assertEquals((await abandon(lena.token, { submissionId: p.s })).json, { outcome: "kept", reason: "at_mux", responseId: p.id });
  assertEquals((await row(p.id)).status, "processing");
});

Deno.test("errored long expired, but the ledger has no expiry for the member's upload, or Mux answers malformed: kept", async () => {
  resetMux();
  read = () => ({ status: "errored" });
  const p = await posted();
  // The ledger row now belongs to nobody we can match (another member): no expiry for Lena.
  assertEquals((await http(`/rest/v1/video_uploads?upload_id=eq.${p.u}`, { method: "PATCH", body: { account_id: adam.id, expires_at: new Date(Date.now() - 86_400_000).toISOString() } })).status, 204);
  assertEquals((await abandon(lena.token, { submissionId: p.s })).json.reason, "unverified");
  assertEquals((await row(p.id)).status, "processing");
  await http(`/rest/v1/video_uploads?upload_id=eq.${p.u}`, { method: "PATCH", body: { account_id: lena.id } });
  for (const said of [{ status: undefined as unknown as string }, { status: "errored", id: "upSomeoneElse" }]) {
    resetMux();
    read = () => said;
    assertEquals((await abandon(lena.token, { submissionId: p.s })).json.reason, "unverified", JSON.stringify(said));
    assertEquals((await row(p.id)).status, "processing");
  }
});

Deno.test("settled videos are never touched, and Mux is not asked: live, removed, an asset recorded", async () => {
  resetMux();
  const live = await posted();
  await http(`/rest/v1/responses?id=eq.${live.id}`, { method: "PATCH", body: { status: "live", mux_asset_id: `asl${run}`, mux_playback_id: `pbl${run}`, live_at: new Date().toISOString() } });
  assertEquals((await abandon(lena.token, { submissionId: live.s })).json, { outcome: "kept", reason: "live", responseId: live.id });
  assertEquals((await row(live.id)).status, "live");
  const removed = await posted();
  await http(`/rest/v1/responses?id=eq.${removed.id}`, { method: "PATCH", body: { status: "removed" } });
  assertEquals((await abandon(lena.token, { submissionId: removed.s })).json.reason, "removed");
  assertEquals((await row(removed.id)).status, "removed", "a moderator's removal stands");
  assertEquals(calls.length, 0);
});

Deno.test("ownership: another member gets not_found for Lena's submission; nothing asked or changed", async () => {
  resetMux();
  const p = await posted();
  assertEquals((await abandon(adam.token, { submissionId: p.s })).json, { outcome: "not_found" });
  assertEquals(calls.length, 0);
  assertEquals((await row(p.id)).status, "processing");
  assertEquals((await sub(p.s)).abandoning_until, null);
});

Deno.test("a submission that never made a row: closed at once; the request arriving late cannot make one", async () => {
  resetMux();
  const s = crypto.randomUUID();
  assertEquals((await abandon(lena.token, { submissionId: s })).json, { outcome: "abandoned", reason: "no_row" });
  assertEquals(calls.length, 0);
  const late = await post(lena, P[promptIndex++], await upload(lena), s);
  assertEquals([late.status, late.error], [400, "submission_closed"]);
});

Deno.test("concurrency: two abandonments at once ask Mux once; the second is kept busy", async () => {
  resetMux();
  const p = await posted();
  let release!: () => void;
  readDelay = new Promise<void>((r) => (release = r));
  const first = abandon(lena.token, { submissionId: p.s });
  await new Promise((r) => setTimeout(r, 200));
  const second = await abandon(lena.token, { submissionId: p.s });
  assertEquals([second.json.outcome, second.json.reason], ["kept", "busy"]);
  // A replay of the post during the check is refused, not answered with a row about to go.
  const replay = await post(lena, P[promptIndex - 1], p.u, p.s);
  assertEquals([replay.status, replay.error], [400, "submission_busy"]);
  release();
  assertEquals((await first).json, { outcome: "abandoned", reason: "cancelled" });
  assertEquals(calls.filter((c) => c.method === "PUT").length, 1);
});

Deno.test("cleanup: remove the test members, their rows and the prompts", async () => {
  for (const m of members) {
    await http(`/rest/v1/responses?author_id=eq.${m.id}`, { method: "DELETE" });
    await http(`/rest/v1/profiles?id=eq.${m.id}`, { method: "DELETE" });
    assertEquals((await http(`/auth/v1/admin/users/${m.id}`, { method: "DELETE" })).status, 200);
  }
  await http(`/rest/v1/prompts?id=in.(${P.join(",")})`, { method: "DELETE" });
});
