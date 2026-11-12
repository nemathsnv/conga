// Integration tests for security stage 2 (upload ownership and limits) against a LOCAL Supabase
// stack: real Auth sessions, PostgREST, RLS and separate transactions per request, so concurrent
// requests really race. The mux-create-upload, mux-upload-status and mux-webhook handlers run
// in-process. Mux is never contacted: api.mux.com and stream.mux.com are answered by a stub, and
// any other non-local host throws. Refuses to run unless SUPABASE_URL is 127.0.0.1 or localhost.
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test --allow-env --allow-net supabase/functions/_tests/uploads_integration_test.ts
import { assert, assertEquals } from "./assert.ts";
import { handleCreateUpload } from "../mux-create-upload/handler.ts";
import { handleUploadStatus } from "../mux-upload-status/handler.ts";
import { handleMuxWebhook } from "../mux-webhook/handler.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!API || !ANON || !SERVICE) throw new Error("set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY for the local stack");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error(`refusing to run against ${new URL(API).hostname}: local stack only`);

// Fake Mux credentials: even a missed stub could not act on a real Mux environment.
Deno.env.set("MUX_TOKEN_ID", "local-test-id");
Deno.env.set("MUX_TOKEN_SECRET", "local-test-secret");
const WEBHOOK_SECRET = "local-test-webhook-secret";
Deno.env.set("MUX_WEBHOOK_SECRET", WEBHOOK_SECRET);

const run = Date.now().toString(36);

// ---------------------------------------------------------------------------
// Mux stub. Creating an upload answers with a fresh id unless a test sets another behaviour.
// Uploads it created are remembered as Mux would: waiting until cancelled, and cancel succeeds
// only while waiting. Tests can replace the read or the cancel of one upload.
type MuxCall = { method: string; url: string; body: unknown };
const muxCalls: MuxCall[] = [];
let uploadSeq = 0;
const muxUploads = new Map<string, string>();
const freshUpload = () => {
  const id = `up${run}n${++uploadSeq}`;
  muxUploads.set(id, "waiting");
  return Response.json({ data: { id, url: `https://storage.example.invalid/upload/${id}`, status: "waiting", timeout: 3600 } }, { status: 201 });
};
let createUpload: () => Response | Promise<Response> = freshUpload;
let muxGets: Record<string, unknown> = {};
let readUpload: (id: string) => Response | Promise<Response> | null = () => null;
let cancelUpload: (id: string) => Response | Promise<Response> | null = () => null;
function muxUploadRoute(method: string, path: string): Response | Promise<Response> | null {
  const cancel = path.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)\/cancel$/);
  if (method === "PUT" && cancel) {
    const id = cancel[1];
    const custom = cancelUpload(id);
    if (custom) return custom;
    if (muxUploads.get(id) !== "waiting") return Response.json({ error: { type: "invalid_parameters", messages: ["not waiting"] } }, { status: 400 });
    muxUploads.set(id, "cancelled");
    return Response.json({ data: { id, status: "cancelled" } });
  }
  const read = path.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)$/);
  if (method === "GET" && read && !muxGets[path]) {
    const custom = readUpload(read[1]);
    if (custom) return custom;
    if (muxUploads.has(read[1])) return Response.json({ data: { id: read[1], status: muxUploads.get(read[1]) } });
  }
  return null;
}
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === "api.mux.com" || url.hostname === "stream.mux.com") {
    const method = init?.method ?? "GET";
    muxCalls.push({ method, url: url.toString(), body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.hostname === "stream.mux.com") return new Response("#EXTM3U\n");
    if (method === "POST" && url.pathname === "/video/v1/uploads") return await createUpload();
    const route = muxUploadRoute(method, url.pathname);
    if (route) return await route;
    const data = muxGets[url.pathname];
    return data ? Response.json({ data }) : Response.json({ error: "stub: no route" }, { status: 404 });
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error(`test fetch to ${url.hostname} blocked`);
  return realFetch(input, init);
}) as typeof fetch;
function resetMux() {
  muxCalls.length = 0;
  createUpload = freshUpload;
  muxGets = {};
  readUpload = () => null;
  cancelUpload = () => null;
}
const creates = () => muxCalls.filter((c) => c.method === "POST" && c.url === "https://api.mux.com/video/v1/uploads");
const cancels = () => muxCalls.filter((c) => c.method === "PUT").map((c) => c.url.split("/")[6]);
const reads = () => muxCalls.filter((c) => c.method === "GET" && /\/video\/v1\/uploads\/[A-Za-z0-9]+$/.test(c.url)).map((c) => c.url.split("/")[6]);

// ---------------------------------------------------------------------------
// Local stack helpers
async function http(path: string, opts: { method?: string; key?: string; token?: string; body?: unknown; prefer?: string } = {}) {
  const res = await realFetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      apikey: opts.key ?? SERVICE,
      Authorization: `Bearer ${opts.token ?? opts.key ?? SERVICE}`,
      "Content-Type": "application/json",
      ...(opts.prefer ? { Prefer: opts.prefer } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

type Member = { id: string; token: string };
const members: Member[] = [];
async function member(name: string, opts: { profile?: boolean } = {}): Promise<Member> {
  const email = `sec2-${run}-${name}@example.com`;
  const created = await http("/auth/v1/admin/users", { method: "POST", body: { email, email_confirm: true } });
  assertEquals(created.status, 200, `create ${name}`);
  const id = (created.json as { id: string }).id;
  const link = await http("/auth/v1/admin/generate_link", { method: "POST", body: { type: "magiclink", email } });
  const otp = (link.json as { email_otp: string }).email_otp;
  const verified = await http("/auth/v1/verify", { method: "POST", key: ANON, body: { type: "email", email, token: otp } });
  assertEquals(verified.status, 200, `sign in ${name}`);
  if (opts.profile !== false) {
    const p = await http("/rest/v1/profiles", { method: "POST", body: { id, name, username: `s2${name}${run}`.slice(0, 24) } });
    assertEquals(p.status, 201, `profile ${name}`);
  }
  await account(id, { age_confirmed_at: new Date().toISOString(), public_disclosure_ack_at: new Date().toISOString() });
  const m = { id, token: (verified.json as { access_token: string }).access_token };
  members.push(m);
  return m;
}
async function account(id: string, patch: Record<string, unknown>) {
  const r = await http(`/rest/v1/accounts?id=eq.${id}`, { method: "PATCH", body: patch });
  assertEquals(r.status, 204, "account patch");
}
async function ledger(accountId: string) {
  const r = await http(`/rest/v1/video_uploads?account_id=eq.${accountId}&select=upload_id,status,response_id,created_at,expires_at&order=created_at`);
  return r.json as { upload_id: string | null; status: string; response_id: string | null; created_at: string; expires_at: string }[];
}
async function ledgerRow(uploadId: string) {
  const r = await http(`/rest/v1/video_uploads?upload_id=eq.${uploadId}&select=account_id,status,response_id`);
  return (r.json as { account_id: string; status: string; response_id: string | null }[])[0];
}
async function responseRow(uploadId: string) {
  const r = await http(`/rest/v1/responses?mux_upload_id=eq.${uploadId}&select=id,status,author_id,mux_playback_id`);
  return (r.json as { id: string; status: string; author_id: string; mux_playback_id: string | null }[])[0];
}
/** Older uploads for an account, written as the service role: the time travel the limits need. */
async function history(accountId: string, n: number, minutesAgo: number) {
  const created_at = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const rows = Array.from({ length: n }, (_, i) => ({ account_id: accountId, upload_id: `old${run}${accountId.slice(0, 8)}m${minutesAgo}n${i}`, status: "claimed", created_at, reserved_until: created_at, expires_at: created_at }));
  assertEquals((await http("/rest/v1/video_uploads", { method: "POST", body: rows })).status, 201, "history");
}

/** Moves a member's URLs back in time, as the minutes between re-records would. */
async function age(accountId: string, seconds = 60) {
  const rows = await ledger(accountId);
  for (const r of rows) {
    if (!r.upload_id) continue;
    const created_at = new Date(Date.parse(r.created_at) - seconds * 1000).toISOString();
    await http(`/rest/v1/video_uploads?upload_id=eq.${r.upload_id}`, { method: "PATCH", body: { created_at } });
  }
}

async function mint(token?: string, method = "POST") {
  const req = new Request("http://localhost/functions/v1/mux-create-upload", { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const res = await handleCreateUpload(req);
  return { status: res.status, json: await res.json() as Record<string, unknown>, retryAfter: res.headers.get("Retry-After") };
}
async function rpc(m: Member, fn: string, body: Record<string, unknown>) {
  const r = await http(`/rest/v1/rpc/${fn}`, { method: "POST", key: ANON, token: m.token, body });
  return { status: r.status, json: r.json as Record<string, unknown>, error: (r.json as { message?: string })?.message ?? null };
}
const postResponse = (m: Member, prompt: string, uploadId: string) => rpc(m, "post_response", { p_prompt: prompt, p_upload_id: uploadId, p_caption: null, p_duration_ms: 9000 });
const postReply = (m: Member, to: string, uploadId: string) => rpc(m, "post_reply", { p_reply_to: to, p_upload_id: uploadId, p_caption: null, p_duration_ms: 9000 });

async function status(uploadId: string, token: string) {
  const url = new URL("http://localhost/functions/v1/mux-upload-status");
  url.searchParams.set("uploadId", uploadId);
  const res = await handleUploadStatus(new Request(url, { headers: { Authorization: `Bearer ${token}` } }));
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}
async function signed(body: string, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("http://localhost/functions/v1/mux-webhook", { method: "POST", body, headers: { "Mux-Signature": `t=${t},v1=${hex}` } });
}
const readyEvent = (uploadId: string, asset: string, playback: string, passthrough: string) =>
  JSON.stringify({ type: "video.asset.ready", data: { id: asset, upload_id: uploadId, status: "ready", duration: 9.5, playback_ids: [{ id: playback, policy: "public" }], passthrough } });

// ---------------------------------------------------------------------------
// Fixtures
const prompts = await http("/rest/v1/prompts?select=id", {
  method: "POST", prefer: "return=representation",
  body: [1, 2, 3].map((n) => ({ text: `Security stage 2 test prompt ${n} ${run}`, status: "live", published_at: new Date().toISOString() })),
});
assertEquals(prompts.status, 201, "prompts");
const [p1, p2, p3] = (prompts.json as { id: string }[]).map((p) => p.id);

// ---------------------------------------------------------------------------
// Authentication and account state
Deno.test("mint: no token, a garbage token or the anon key is 401, before the database and Mux", async () => {
  resetMux();
  assertEquals((await mint()).status, 401);
  assertEquals((await mint("not-a-jwt")).status, 401);
  assertEquals((await mint(ANON)).status, 401);
  assertEquals(muxCalls, []);
});

Deno.test("mint: GET is 405", async () => {
  const lena = await member("getter");
  assertEquals((await mint(lena.token, "GET")).status, 405);
});

Deno.test("mint: suspended, restricted, deleted and profile-less accounts get 403 and no URL", async () => {
  resetMux();
  const sam = await member("sam"), rita = await member("rita"), dee = await member("dee"), maya = await member("maya", { profile: false });
  await account(sam.id, { moderation_status: "suspended" });
  await account(rita.id, { moderation_status: "restricted", restricted_until: new Date(Date.now() + 86_400_000).toISOString() });
  await account(dee.id, { deleted_at: new Date().toISOString() });
  assertEquals(await mint(sam.token), { status: 403, json: { error: "suspended" }, retryAfter: null });
  assertEquals(await mint(rita.token), { status: 403, json: { error: "posting_paused" }, retryAfter: null });
  assertEquals(await mint(dee.token), { status: 403, json: { error: "account_deleted" }, retryAfter: null });
  assertEquals(await mint(maya.token), { status: 403, json: { error: "profile_required" }, retryAfter: null });
  assertEquals(muxCalls, []);
  for (const m of [sam, rita, dee, maya]) assertEquals(await ledger(m.id), []);
});

Deno.test("mint: a URL minted before a restriction cannot be posted after it", async () => {
  resetMux();
  const later = await member("later");
  const before = await mint(later.token);
  assertEquals(before.status, 200);
  await account(later.id, { moderation_status: "restricted", restricted_until: new Date(Date.now() + 86_400_000).toISOString() });
  assertEquals((await mint(later.token)).json, { error: "posting_paused" });
  assertEquals((await postResponse(later, p1, before.json.uploadId as string)).error, "posting_paused");
  assertEquals((await ledgerRow(before.json.uploadId as string)).status, "active");
});

// ---------------------------------------------------------------------------
// The verified iPhone path, unchanged for the app
Deno.test("mint: answers exactly { uploadId, uploadUrl } and records the upload against the caller", async () => {
  resetMux();
  const lena = await member("lena");
  const r = await mint(lena.token);
  assertEquals(r.status, 200);
  assertEquals(Object.keys(r.json).sort(), ["uploadId", "uploadUrl"]);
  assertEquals(creates().length, 1);
  assertEquals(creates()[0].body, {
    cors_origin: "*", timeout: 3600,
    new_asset_settings: { playback_policies: ["public"], video_quality: "basic", passthrough: lena.id },
  });
  const rows = await ledger(lena.id);
  assertEquals(rows.map((x) => [x.upload_id, x.status]), [[r.json.uploadId, "active"]]);
  const life = Date.parse(rows[0].expires_at) - Date.parse(rows[0].created_at);
  assertEquals(life, 3_600_000, "the ledger expires the URL an hour after the reservation");
});

Deno.test("end to end: mint, post, Mux ready, live, with the upload claimed by the response", async () => {
  resetMux();
  const ella = await member("ella");
  const t = await mint(ella.token);
  const uploadId = t.json.uploadId as string;
  const posted = await postResponse(ella, p1, uploadId);
  assertEquals(posted.status, 200);
  assertEquals(posted.json.status, "processing");
  const asset = `as${run}ella`, playback = `pb${run}ella`;
  muxGets = {
    [`/video/v1/uploads/${uploadId}`]: { id: uploadId, status: "asset_created", asset_id: asset },
    [`/video/v1/assets/${asset}`]: { id: asset, status: "ready", duration: 9.9, playback_ids: [{ id: playback, policy: "public" }], passthrough: ella.id },
  };
  const s = await status(uploadId, ella.token);
  assertEquals([s.status, s.json.responseStatus, s.json.playbackId], [200, "live", playback]);
  const row = await responseRow(uploadId);
  assertEquals([row.status, row.mux_playback_id], ["live", playback]);
  assertEquals(await ledgerRow(uploadId), { account_id: ella.id, status: "claimed", response_id: row.id });
});

// ---------------------------------------------------------------------------
// Ownership and reuse
Deno.test("cross-account: another member's upload id is refused and stays usable by its owner", async () => {
  resetMux();
  const adam = await member("adam"), lena = await member("lena2");
  const a = await mint(adam.token);
  const stolen = await postResponse(lena, p1, a.json.uploadId as string);
  assertEquals([stolen.status, stolen.error], [400, "upload_not_found"]);
  assertEquals(await responseRow(a.json.uploadId as string), undefined);
  assertEquals((await ledgerRow(a.json.uploadId as string)).status, "active");
  // Asking Mux-status about it reveals nothing either.
  assertEquals((await status(a.json.uploadId as string, lena.token)).status, 404);
  const own = await postResponse(adam, p1, a.json.uploadId as string);
  assertEquals(own.status, 200);
  assertEquals((await responseRow(a.json.uploadId as string)).author_id, adam.id);
});

Deno.test("reuse: an upload is posted once; a second post, reply or retry with it is refused", async () => {
  resetMux();
  const lena = await member("lena3");
  const u = (await mint(lena.token)).json.uploadId as string;
  const first = await postResponse(lena, p1, u);
  assertEquals(first.status, 200);
  assertEquals((await postResponse(lena, p2, u)).error, "upload_already_used");
  await http("/rest/v1/rpc/mark_response_live", { method: "POST", body: { p_upload_id: u, p_asset_id: `as${run}l3`, p_playback_id: `pb${run}l3`, p_duration_ms: 9000, p_passthrough: lena.id } });
  assertEquals((await postReply(lena, first.json.id as string, u)).error, "upload_already_used");
  const second = (await mint(lena.token)).json.uploadId as string;
  const pending = await postResponse(lena, p2, second);
  assertEquals((await rpc(lena, "retry_response_upload", { p_response: pending.json.id, p_upload_id: u })).error, "upload_already_used");
});

Deno.test("expiry: an upload past its hour is refused", async () => {
  resetMux();
  const lena = await member("lena4");
  const u = (await mint(lena.token)).json.uploadId as string;
  await http(`/rest/v1/video_uploads?upload_id=eq.${u}`, { method: "PATCH", body: { expires_at: new Date(Date.now() - 1000).toISOString() } });
  assertEquals((await postResponse(lena, p1, u)).error, "upload_expired");
  assertEquals((await ledgerRow(u)).status, "active");
});

Deno.test("concurrency: six simultaneous posts of one upload; exactly one wins", async () => {
  resetMux();
  const host = await member("host"), lena = await member("lena5");
  const h = (await mint(host.token)).json.uploadId as string;
  const root = (await postResponse(host, p1, h)).json.id as string;
  await http("/rest/v1/rpc/mark_response_live", { method: "POST", body: { p_upload_id: h, p_asset_id: `as${run}host`, p_playback_id: `pb${run}host`, p_duration_ms: 9000, p_passthrough: host.id } });
  const u = (await mint(lena.token)).json.uploadId as string;
  const results = await Promise.all(Array.from({ length: 6 }, () => postReply(lena, root, u)));
  assertEquals(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => r.error)));
  assertEquals(results.filter((r) => r.error === "upload_already_used").length, 5);
  const rows = await http(`/rest/v1/responses?mux_upload_id=eq.${u}&select=id`);
  assertEquals((rows.json as unknown[]).length, 1);
  assertEquals((await ledgerRow(u)).status, "claimed");
});

// ---------------------------------------------------------------------------
// Limits
Deno.test("repeated recording: each re-record retires the oldest unused URL at Mux, and Post still works", async () => {
  resetMux();
  const m = await member("rerecord");
  const tickets: string[] = [];
  for (let i = 0; i < 5; i++) {
    const r = await mint(m.token);
    assertEquals(r.status, 200, `re-record ${i + 1}`);
    tickets.push(r.json.uploadId as string);
    await age(m.id);
  }
  assertEquals(creates().length, 5);
  assertEquals(reads(), tickets.slice(0, 2), "Mux is asked about the oldest unused URL before it is cancelled");
  assertEquals(cancels(), tickets.slice(0, 2), "re-records 4 and 5 each cancelled one abandoned URL");
  assertEquals((await ledger(m.id)).map((x) => x.status), ["cancelled", "cancelled", "active", "active", "active"]);
  // Normal posting with the latest URL; an abandoned one cannot be posted.
  assertEquals((await postResponse(m, p1, tickets[4])).status, 200);
  assertEquals((await postResponse(m, p2, tickets[0])).error, "upload_cancelled");
  assertEquals((await postResponse(m, p2, tickets[3])).status, 200);
});

Deno.test("repeated recording: cancelled URLs still count; the eleventh in an hour is 429 upload_limit_hour", async () => {
  resetMux();
  const m = await member("quota");
  for (let i = 0; i < 10; i++) {
    assertEquals((await mint(m.token)).status, 200, `mint ${i + 1}`);
    await age(m.id);
  }
  const r = await mint(m.token);
  assertEquals([r.status, r.json.error], [429, "upload_limit_hour"]);
  assert(Number(r.retryAfter) > 0 && Number(r.retryAfter) <= 3600, `Retry-After ${r.retryAfter}`);
  assertEquals(creates().length, 10);
  assertEquals(cancels().length, 7);
  const statuses = (await ledger(m.id)).map((x) => x.status);
  assertEquals([statuses.filter((x) => x === "cancelled").length, statuses.filter((x) => x === "active").length], [7, 3]);
});

Deno.test("limits: three URLs minted moments ago are not abandoned; the fourth is 429 with no Mux call", async () => {
  resetMux();
  const m = await member("active");
  for (let i = 0; i < 3; i++) assertEquals((await mint(m.token)).status, 200);
  const r = await mint(m.token);
  assertEquals([r.status, r.json.error], [429, "upload_limit_active"]);
  assert(Number(r.retryAfter) > 3500 && Number(r.retryAfter) <= 3600, `Retry-After ${r.retryAfter}`);
  assertEquals(r.json.retryAfter, Number(r.retryAfter));
  assertEquals([creates().length, reads().length, cancels().length], [3, 0, 0]);
  assertEquals((await ledger(m.id)).map((x) => x.status), ["active", "active", "active"]);
});

// Each cancellation failure: the mint is 429, the abandoned URL is not freed, and nothing is
// cancelled that Mux did not report waiting.
const failures: { name: string; read?: (id: string) => Response | Promise<Response> | null; cancel?: (id: string) => Response | Promise<Response> | null; status: string; put: boolean }[] = [
  { name: "Mux cannot be reached to read it", read: () => Promise.reject(new TypeError("network down")), status: "active", put: false },
  { name: "Mux reports a transfer finished (asset_created)", read: (id) => Response.json({ data: { id, status: "asset_created", asset_id: "asX" } }), status: "active", put: false },
  { name: "Mux reports it errored", read: (id) => Response.json({ data: { id, status: "errored" } }), status: "active", put: false },
  { name: "Mux refuses the cancel (no longer waiting)", cancel: () => Response.json({ error: { type: "invalid_parameters" } }, { status: 400 }), status: "active", put: true },
  { name: "Mux answers the cancel without cancelling", cancel: (id) => Response.json({ data: { id, status: "waiting" } }), status: "active", put: true },
  { name: "the cancel times out (outcome unknown)", cancel: () => Promise.reject(new DOMException("timed out", "TimeoutError")), status: "cancelling", put: true },
];
for (const f of failures) {
  Deno.test(`cancellation failure: ${f.name}; 429, the slot is not freed`, async () => {
    resetMux();
    const m = await member(`cf${failures.indexOf(f)}`);
    const tickets: string[] = [];
    for (let i = 0; i < 3; i++) tickets.push((await mint(m.token)).json.uploadId as string);
    await age(m.id);
    if (f.read) readUpload = (id) => (id === tickets[0] ? f.read!(id) : null);
    if (f.cancel) cancelUpload = (id) => (id === tickets[0] ? f.cancel!(id) : null);
    const r = await mint(m.token);
    assertEquals([r.status, r.json.error], [429, "upload_limit_active"]);
    assertEquals(creates().length, 3, "no new upload at Mux");
    assertEquals(cancels(), f.put ? [tickets[0]] : []);
    assertEquals((await ledgerRow(tickets[0])).status, f.status);
    assertEquals((await ledger(m.id)).filter((x) => x.status === "cancelled").length, 0, "nothing freed");
    if (f.status === "active") {
      assertEquals((await postResponse(m, p1, tickets[0])).status, 200, "an upload put back can still be posted");
    } else {
      assertEquals((await postResponse(m, p1, tickets[0])).error, "upload_cancelled", "an upload whose cancel is unknown cannot be posted");
      // It keeps its slot; the next mint retires the next abandoned URL instead.
      const next = await mint(m.token);
      assertEquals(next.status, 200);
      assertEquals(cancels(), [tickets[0], tickets[1]]);
    }
  });
}

Deno.test("cancellation: an upload Mux already reports cancelled or timed out frees its slot without a cancel call", async () => {
  for (const status of ["cancelled", "timed_out"]) {
    resetMux();
    const m = await member(`gone${status.replace("_", "")}`);
    const tickets: string[] = [];
    for (let i = 0; i < 3; i++) tickets.push((await mint(m.token)).json.uploadId as string);
    await age(m.id);
    readUpload = (id) => (id === tickets[0] ? Response.json({ data: { id, status } }) : null);
    assertEquals((await mint(m.token)).status, 200, status);
    assertEquals(cancels(), []);
    assertEquals((await ledgerRow(tickets[0])).status, "cancelled");
  }
});

Deno.test("concurrency: six simultaneous mints at the cap retire each abandoned URL once and give exactly three", async () => {
  resetMux();
  const m = await member("racecap");
  const old: string[] = [];
  for (let i = 0; i < 3; i++) old.push((await mint(m.token)).json.uploadId as string);
  await age(m.id);
  muxCalls.length = 0;
  const results = await Promise.all(Array.from({ length: 6 }, () => mint(m.token)));
  assertEquals(results.filter((r) => r.status === 200).length, 3, JSON.stringify(results.map((r) => r.json.error ?? r.status)));
  assertEquals(results.filter((r) => r.json.error === "upload_limit_active").length, 3);
  assertEquals(cancels().sort(), [...old].sort(), "each abandoned URL cancelled exactly once");
  assertEquals(creates().length, 3);
  const rows = await ledger(m.id);
  assertEquals(rows.filter((x) => x.status === "active").map((x) => x.upload_id).sort(), results.filter((r) => r.status === 200).map((r) => r.json.uploadId as string).sort(), "the three handed out are the three usable");
  assertEquals(rows.filter((x) => x.status === "cancelled").map((x) => x.upload_id).sort(), [...old].sort());
});

Deno.test("concurrency: a post arriving while its upload is being cancelled is refused, and the cancel completes", async () => {
  resetMux();
  const m = await member("midcancel");
  const old: string[] = [];
  for (let i = 0; i < 3; i++) old.push((await mint(m.token)).json.uploadId as string);
  await age(m.id);
  let during: Awaited<ReturnType<typeof postResponse>> | null = null;
  // Mux is being asked about old[0] for its cancellation: the person taps Post with it right then.
  readUpload = (id) => {
    if (id !== old[0]) return null;
    return (async () => {
      during = await postResponse(m, p1, old[0]);
      return Response.json({ data: { id, status: "waiting" } });
    })();
  };
  const minted = await mint(m.token);
  assertEquals(minted.status, 200);
  assertEquals(during!.error, "upload_cancelled");
  assertEquals(cancels(), [old[0]]);
  assertEquals(await ledgerRow(old[0]), { account_id: m.id, status: "cancelled", response_id: null });
  assertEquals(await responseRow(old[0]), undefined);
  // The app then mints a fresh URL and posts (postingFlow.prepareUpload replaces it once).
  assertEquals((await postResponse(m, p1, minted.json.uploadId as string)).status, 200);
});

Deno.test("concurrency: a post and a mint at the cap at the same moment; a claimed upload is never cancelled", async () => {
  for (let round = 0; round < 4; round++) {
    resetMux();
    const m = await member(`claimrace${round}`);
    const old: string[] = [];
    for (let i = 0; i < 3; i++) old.push((await mint(m.token)).json.uploadId as string);
    await age(m.id);
    muxCalls.length = 0;
    const [minted, posted] = await Promise.all([mint(m.token), postResponse(m, p1, old[0])]);
    assertEquals(minted.status, 200, `round ${round}`);
    const row = await ledgerRow(old[0]);
    if (posted.status === 200) {
      assertEquals(row.status, "claimed", `round ${round}: posted, so claimed`);
      assert(!cancels().includes(old[0]), `round ${round}: a claimed upload is never cancelled`);
      // Posted before the mint reserved: a slot was already free. Posted after: the next abandoned one went instead.
      assert(cancels().length === 0 || (cancels().length === 1 && cancels()[0] === old[1]), `round ${round}: ${cancels()}`);
    } else {
      assertEquals(posted.error, "upload_cancelled", `round ${round}`);
      assertEquals(row.status, "cancelled", `round ${round}`);
      assertEquals(cancels(), [old[0]], `round ${round}`);
    }
  }
});

Deno.test("concurrency: ten simultaneous mints give exactly three URLs", async () => {
  resetMux();
  const m = await member("racer");
  const results = await Promise.all(Array.from({ length: 10 }, () => mint(m.token)));
  assertEquals(results.filter((r) => r.status === 200).length, 3, JSON.stringify(results.map((r) => r.status)));
  assertEquals(results.filter((r) => r.status === 429 && r.json.error === "upload_limit_active").length, 7);
  assertEquals(creates().length, 3, "Mux is called only for the three");
  assertEquals((await ledger(m.id)).map((x) => x.status), ["active", "active", "active"]);
});

Deno.test("concurrency: with 8 used this hour, six simultaneous mints give exactly two URLs", async () => {
  resetMux();
  const m = await member("burst");
  await history(m.id, 8, 10);
  const results = await Promise.all(Array.from({ length: 6 }, () => mint(m.token)));
  assertEquals(results.filter((r) => r.status === 200).length, 2, JSON.stringify(results.map((r) => r.json.error ?? r.status)));
  assertEquals(results.filter((r) => r.json.error === "upload_limit_hour").length, 4);
  assertEquals(creates().length, 2);
  const blocked = results.find((r) => r.status === 429)!;
  assert(Number(blocked.retryAfter) > 2900 && Number(blocked.retryAfter) <= 3000, `Retry-After ${blocked.retryAfter}`);
});

Deno.test("limits: 30 uploads in a day is 429 upload_limit_day, and Mux is not called", async () => {
  resetMux();
  const m = await member("daily");
  await history(m.id, 30, 120);
  const r = await mint(m.token);
  assertEquals([r.status, r.json.error], [429, "upload_limit_day"]);
  assert(Number(r.retryAfter) > 22 * 3600 - 60 && Number(r.retryAfter) <= 22 * 3600, `Retry-After ${r.retryAfter}`);
  assertEquals(muxCalls, []);
});

// ---------------------------------------------------------------------------
// Partial failures
Deno.test("partial failure: Mux refuses (HTTP 500); 502, the slot is given back", async () => {
  resetMux();
  const m = await member("refused");
  createUpload = () => Response.json({ error: { type: "server_error" } }, { status: 500 });
  const r = await mint(m.token);
  assertEquals([r.status, r.json.error], [502, "mux_unavailable"]);
  assertEquals((await ledger(m.id)).map((x) => [x.upload_id, x.status]), [[null, "failed"]]);
  createUpload = freshUpload;
  for (let i = 0; i < 3; i++) assertEquals((await mint(m.token)).status, 200, "the failed attempt takes no slot");
});

Deno.test("partial failure: a network error or timeout keeps the slot reserved, so retries cannot bypass the limits", async () => {
  resetMux();
  const m = await member("timeout");
  createUpload = () => Promise.reject(new TypeError("network down"));
  for (let i = 0; i < 3; i++) assertEquals((await mint(m.token)).status, 502);
  assertEquals((await ledger(m.id)).map((x) => x.status), ["reserved", "reserved", "reserved"]);
  createUpload = freshUpload;
  const r = await mint(m.token);
  assertEquals([r.status, r.json.error], [429, "upload_limit_active"]);
  assert(Number(r.retryAfter) <= 60, "free again once the 60 s reservations lapse");
});

Deno.test("partial failure: a malformed upload id from Mux is never handed out", async () => {
  resetMux();
  const m = await member("badid");
  createUpload = () => Response.json({ data: { id: "../uploads/x", url: "https://storage.example.invalid/x" } }, { status: 201 });
  assertEquals((await mint(m.token)).status, 502);
  assertEquals((await ledger(m.id)).map((x) => [x.upload_id, x.status]), [[null, "reserved"]]);
  assertEquals(muxCalls.filter((c) => c.method === "PUT").length, 0, "no cancel with an unsafe id");
});

Deno.test("partial failure: if the ledger cannot record Mux's upload, it is cancelled at Mux and not handed out", async () => {
  resetMux();
  const m = await member("dbdown");
  // The database becomes unreachable for the service role after Mux has answered.
  createUpload = () => {
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "not-a-key");
    return freshUpload();
  };
  let r;
  try {
    r = await mint(m.token);
  } finally {
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE);
  }
  assertEquals([r.status, r.json.error], [503, "ledger_unavailable"]);
  const created = `up${run}n${uploadSeq}`;
  assertEquals(muxCalls.filter((c) => c.method === "PUT").map((c) => c.url), [`https://api.mux.com/video/v1/uploads/${created}/cancel`]);
  assertEquals((await ledger(m.id)).map((x) => [x.upload_id, x.status]), [[null, "reserved"]], "the slot keeps counting");
  assertEquals(await ledgerRow(created), undefined);
});

// ---------------------------------------------------------------------------
// Going live only for the member the upload was minted for
Deno.test("owner check: an asset whose passthrough is someone else does not go live via status or webhook", async () => {
  resetMux();
  const mal = await member("mal"), other = await member("other");
  const u = (await mint(mal.token)).json.uploadId as string;
  assertEquals((await postResponse(mal, p3, u)).status, 200);
  const asset = `as${run}mal`, playback = `pb${run}mal`;
  muxGets = {
    [`/video/v1/uploads/${u}`]: { id: u, status: "asset_created", asset_id: asset },
    [`/video/v1/assets/${asset}`]: { id: asset, status: "ready", playback_ids: [{ id: playback, policy: "public" }], passthrough: other.id },
  };
  const s = await status(u, mal.token);
  assertEquals([s.status, s.json.responseStatus], [200, "processing"]);
  const hook = await handleMuxWebhook(await signed(readyEvent(u, asset, playback, other.id)));
  assertEquals([hook.status, (await hook.json()).ignored], [200, "owner_mismatch"]);
  assertEquals((await responseRow(u)).status, "processing");
  assertEquals(muxCalls.filter((c) => c.url.startsWith("https://stream.mux.com")).length, 0, "nothing pre-warmed");
  const genuine = await handleMuxWebhook(await signed(readyEvent(u, asset, playback, mal.id)));
  assertEquals(genuine.status, 200);
  await genuine.body?.cancel();
  assertEquals((await responseRow(u)).status, "live");
});

// ---------------------------------------------------------------------------
Deno.test("cleanup: remove the test members, their rows and the prompts", async () => {
  // Replies first: they reference their root response.
  for (const m of members) await http(`/rest/v1/responses?author_id=eq.${m.id}&kind=eq.reply`, { method: "DELETE" });
  for (const m of members) {
    await http(`/rest/v1/responses?author_id=eq.${m.id}`, { method: "DELETE" });
    await http(`/rest/v1/profiles?id=eq.${m.id}`, { method: "DELETE" });
    assertEquals((await http(`/auth/v1/admin/users/${m.id}`, { method: "DELETE" })).status, 200);
    assertEquals(await ledger(m.id), [], "the ledger rows go with the account");
  }
  await http(`/rest/v1/prompts?id=in.(${[p1, p2, p3].join(",")})`, { method: "DELETE" });
});
