// Integration tests for security stage 3 (deleting videos at Mux, revoking playback, the purge)
// against a LOCAL Supabase stack: real Auth sessions, PostgREST, RLS and separate transactions.
// The mux-create-upload, mux-webhook and mux-cleanup handlers run in-process. Mux is a stateful
// fake (uploads, assets, playback ids, listing) that can fail or stall on demand; it is never
// contacted, and any other non-local host throws. Refuses to run unless SUPABASE_URL is 127.0.0.1
// or localhost.
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test --allow-env --allow-net supabase/functions/_tests/cleanup_integration_test.ts
import { assert, assertEquals } from "./assert.ts";
import { handleCreateUpload } from "../mux-create-upload/handler.ts";
import { handleMuxWebhook } from "../mux-webhook/handler.ts";
import { drain, handleMuxCleanup } from "../mux-cleanup/handler.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!API || !ANON || !SERVICE) throw new Error("set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY for the local stack");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error(`refusing to run against ${new URL(API).hostname}: local stack only`);

// Fake credentials: even a missed stub could not act on a real Mux environment.
Deno.env.set("MUX_TOKEN_ID", "local-test-id");
Deno.env.set("MUX_TOKEN_SECRET", "local-test-secret");
const WEBHOOK_SECRET = "local-test-webhook-secret";
Deno.env.set("MUX_WEBHOOK_SECRET", WEBHOOK_SECRET);
const CLEANUP_KEY = "local-test-cleanup-key";
Deno.env.set("MUX_CLEANUP_KEY", CLEANUP_KEY);
// Both switches on for this run (the database's is put back to off at the end).
Deno.env.set("MUX_CLEANUP_MODE", "live");

const run = Date.now().toString(36);

// ---------------------------------------------------------------------------
// Fake Mux
type FakeAsset = { id: string; status: string; passthrough?: string; upload_id?: string; playback_ids: { id: string; policy: string }[]; created_at: string; duration: number };
type FakeUpload = { id: string; url: string; status: string; asset_id?: string; timeout: number; new_asset_settings: { passthrough?: string } };
const assets = new Map<string, FakeAsset>();
const uploads = new Map<string, FakeUpload>();
type MuxCall = { method: string; path: string };
const muxCalls: MuxCall[] = [];
let seq = 0;
const nid = (prefix: string) => `${prefix}${run}n${++seq}`;
/** A test can answer any Mux call itself (a failure, a stall) by returning a Response. */
let fault: (method: string, path: string) => Response | Promise<Response> | null = () => null;

async function fakeMux(method: string, url: URL, body: string | null, useFault = true): Promise<Response> {
  const p = url.pathname;
  if (useFault) muxCalls.push({ method, path: p + url.search });
  if (url.hostname === "stream.mux.com") return new Response("#EXTM3U\n");
  const injected = useFault ? fault(method, p) : null;
  if (injected) return await injected;
  const data = (d: unknown, status = 200) => Response.json({ data: d }, { status });
  const missing = () => Response.json({ error: { type: "not_found" } }, { status: 404 });
  let m: RegExpMatchArray | null;
  if (method === "POST" && p === "/video/v1/uploads") {
    const req = JSON.parse(body ?? "{}");
    const u: FakeUpload = { id: nid("up"), url: "https://storage.example.invalid/u", status: "waiting", timeout: 3600, new_asset_settings: { passthrough: req.new_asset_settings?.passthrough } };
    uploads.set(u.id, u);
    return data(u, 201);
  }
  if ((m = p.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)$/)) && method === "GET") return uploads.has(m[1]) ? data(uploads.get(m[1])) : missing();
  if ((m = p.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)\/cancel$/)) && method === "PUT") {
    const u = uploads.get(m[1]);
    if (!u) return missing();
    if (u.status !== "waiting") return Response.json({ error: { type: "invalid_parameters" } }, { status: 400 });
    u.status = "cancelled";
    return data(u);
  }
  if (method === "GET" && p === "/video/v1/assets") {
    const page = Number(url.searchParams.get("page") ?? "1"), limit = Number(url.searchParams.get("limit") ?? "25");
    return data([...assets.values()].slice((page - 1) * limit, page * limit));
  }
  if ((m = p.match(/^\/video\/v1\/assets\/([A-Za-z0-9]+)$/))) {
    const a = assets.get(m[1]);
    if (!a) return missing();
    if (method === "GET") return data(a);
    if (method === "DELETE") {
      assets.delete(a.id);
      return new Response(null, { status: 204 });
    }
  }
  if ((m = p.match(/^\/video\/v1\/assets\/([A-Za-z0-9]+)\/playback-ids$/)) && method === "POST") {
    const a = assets.get(m[1]);
    if (!a) return missing();
    const pb = { id: nid("pb"), policy: JSON.parse(body ?? "{}").policy };
    a.playback_ids.push(pb);
    return data(pb, 201);
  }
  if ((m = p.match(/^\/video\/v1\/assets\/([A-Za-z0-9]+)\/playback-ids\/([A-Za-z0-9]+)$/)) && method === "DELETE") {
    const a = assets.get(m[1]);
    if (!a || !a.playback_ids.some((x) => x.id === m![2])) return missing();
    a.playback_ids = a.playback_ids.filter((x) => x.id !== m![2]);
    return new Response(null, { status: 204 });
  }
  return Response.json({ error: "fake: no route" }, { status: 404 });
}
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === "api.mux.com" || url.hostname === "stream.mux.com") return await fakeMux(init?.method ?? "GET", url, init?.body ? String(init.body) : null);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error(`test fetch to ${url.hostname} blocked`);
  return realFetch(input, init);
}) as typeof fetch;
const calls = (method: string, fragment: string) => muxCalls.filter((c) => c.method === method && c.path.includes(fragment)).length;
const destructive = (id: string) => muxCalls.filter((c) => (c.method === "DELETE" || c.method === "PUT") && c.path.includes(id));

/** What Mux does when the bytes arrive: the upload becomes a ready asset with public playback. */
function muxReceives(uploadId: string, opts: { passthrough?: string; createdDaysAgo?: number } = {}): FakeAsset {
  const u = uploads.get(uploadId)!;
  const a: FakeAsset = {
    id: nid("as"), status: "ready", upload_id: uploadId, passthrough: opts.passthrough ?? u.new_asset_settings.passthrough,
    playback_ids: [{ id: nid("pb"), policy: "public" }], duration: 9.5,
    created_at: String(Math.floor(Date.now() / 1000) - (opts.createdDaysAgo ?? 0) * 86_400),
  };
  assets.set(a.id, a);
  u.status = "asset_created";
  u.asset_id = a.id;
  return a;
}

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
const service = async (fn: string, body: Record<string, unknown> = {}) => (await http(`/rest/v1/rpc/${fn}`, { method: "POST", body })).json as Record<string, unknown> & unknown;

type Member = { id: string; token: string };
const members: Member[] = [];
async function member(name: string): Promise<Member> {
  const email = `sec3-${run}-${name}@example.com`;
  const created = await http("/auth/v1/admin/users", { method: "POST", body: { email, email_confirm: true } });
  assertEquals(created.status, 200, `create ${name}`);
  const id = (created.json as { id: string }).id;
  const link = await http("/auth/v1/admin/generate_link", { method: "POST", body: { type: "magiclink", email } });
  const otp = (link.json as { email_otp: string }).email_otp;
  const verified = await http("/auth/v1/verify", { method: "POST", key: ANON, body: { type: "email", email, token: otp } });
  assertEquals(verified.status, 200, `sign in ${name}`);
  assertEquals((await http("/rest/v1/profiles", { method: "POST", body: { id, name, username: `s3${name}${run}`.slice(0, 24) } })).status, 201, `profile ${name}`);
  await account(id, { age_confirmed_at: new Date().toISOString(), public_disclosure_ack_at: new Date().toISOString() });
  const m = { id, token: (verified.json as { access_token: string }).access_token };
  members.push(m);
  return m;
}
async function account(id: string, patch: Record<string, unknown>) {
  assertEquals((await http(`/rest/v1/accounts?id=eq.${id}`, { method: "PATCH", body: patch })).status, 204, "account patch");
}
async function rpc(m: Member | null, fn: string, body: Record<string, unknown> = {}) {
  const r = await http(`/rest/v1/rpc/${fn}`, { method: "POST", key: ANON, token: m?.token ?? ANON, body });
  return { status: r.status, json: r.json as Record<string, unknown>, error: (r.json as { message?: string })?.message ?? null };
}
type Row = { id: string; status: string; author_id: string | null; mux_asset_id: string | null; mux_playback_id: string | null; mux_upload_id: string | null; caption: string | null };
async function row(id: string): Promise<Row | undefined> {
  const r = await http(`/rest/v1/responses?id=eq.${id}&select=id,status,author_id,mux_asset_id,mux_playback_id,mux_upload_id,caption`);
  return (r.json as Row[])[0];
}
type JobRow = { action: string; reason: string; status: string; attempts: number; last_error: string | null; not_before: string; owner_id: string | null; result: Record<string, unknown> | null; id: string; max_attempts: number };
async function jobs(target: string): Promise<JobRow[]> {
  const r = await http(`/rest/v1/mux_cleanup_jobs?or=(asset_id.eq.${target},upload_id.eq.${target})&select=id,action,reason,status,attempts,last_error,not_before,owner_id,result,max_attempts&order=created_at`);
  return r.json as JobRow[];
}
async function patchJobs(target: string, patch: Record<string, unknown>) {
  await http(`/rest/v1/mux_cleanup_jobs?or=(asset_id.eq.${target},upload_id.eq.${target})&status=eq.pending`, { method: "PATCH", body: patch });
}
/** "Due now", a minute back: the host clock may run ahead of the database's. */
const due = () => new Date(Date.now() - 60_000).toISOString();
const web = async (id: string) => (await rpc(null, "web_video", { p_id: id })).json as { status: string; video?: { playback_id: string } };

async function mint(m: Member): Promise<string> {
  const res = await handleCreateUpload(new Request("http://localhost/functions/v1/mux-create-upload", { method: "POST", headers: { Authorization: `Bearer ${m.token}` } }));
  const body = await res.json();
  assertEquals(res.status, 200, `mint ${JSON.stringify(body)}`);
  return body.uploadId as string;
}
async function signed(body: string) {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("http://localhost/functions/v1/mux-webhook", { method: "POST", body, headers: { "Mux-Signature": `t=${t},v1=${hex}` } });
}
async function ready(a: FakeAsset) {
  const res = await handleMuxWebhook(await signed(JSON.stringify({ type: "video.asset.ready", data: a })));
  assertEquals(res.status, 200, "webhook");
  return await res.json();
}

const promptIds: string[] = [];
async function prompt(): Promise<string> {
  const r = await http("/rest/v1/prompts?select=id", { method: "POST", prefer: "return=representation", body: { text: `Stage 3 test prompt ${run} ${promptIds.length}`, status: "live", published_at: new Date().toISOString() } });
  assertEquals(r.status, 201, "prompt");
  const id = (r.json as { id: string }[])[0].id;
  promptIds.push(id);
  return id;
}
type Video = { id: string; uploadId: string; asset: FakeAsset };
/** Mint, post (claim before upload), Mux receives the bytes, the webhook makes it live. */
async function liveVideo(m: Member): Promise<Video> {
  const uploadId = await mint(m);
  const posted = await rpc(m, "post_response", { p_prompt: await prompt(), p_upload_id: uploadId, p_caption: "hello", p_duration_ms: 9000 });
  assertEquals(posted.status, 200, `post ${posted.error}`);
  const asset = muxReceives(uploadId);
  await ready(asset);
  assertEquals((await row(posted.json.id as string))?.status, "live");
  return { id: posted.json.id as string, uploadId, asset };
}
async function liveReply(m: Member, to: string): Promise<Video> {
  const uploadId = await mint(m);
  const posted = await rpc(m, "post_reply", { p_reply_to: to, p_upload_id: uploadId, p_caption: null, p_duration_ms: 5000 });
  assertEquals(posted.status, 200, `reply ${posted.error}`);
  const asset = muxReceives(uploadId);
  await ready(asset);
  return { id: posted.json.id as string, uploadId, asset };
}
/** Drains until nothing is due (as the every-minute cron would, faster). */
async function drainAll() {
  const totals: Record<string, number> = {};
  for (let i = 0; i < 10; i++) {
    const r = await drain() as Record<string, number>;
    for (const [k, v] of Object.entries(r)) if (typeof v === "number") totals[k] = (totals[k] ?? 0) + v;
    if (!r.claimed) break;
  }
  return totals;
}

const setMode = async (mode: string) => assertEquals((await http("/rest/v1/rpc/mux_cleanup_set_mode", { method: "POST", body: { p_mode: mode, p_by: `test-${run}` } })).status, 200, `mode ${mode}`);
const mutations = () => muxCalls.filter((c) => c.method !== "GET");
await setMode("live");

// Every job already due in this local database is set aside, so this run drains only its own.
await http("/rest/v1/mux_cleanup_jobs?status=in.(pending,running)", { method: "PATCH", body: { status: "skipped", lease_id: null, locked_until: null, result: { outcome: "set_aside_by_test", run } } });

// The founder's video, as on the hosted project: posted first, checked untouched at the end.
const founder = await member("founder");
const founderVideo = await liveVideo(founder);
const founderRow = await row(founderVideo.id);

// ---------------------------------------------------------------------------
Deno.test("worker: only POST with MUX_CLEANUP_KEY; drain and sweep, nothing else", async () => {
  const call = (init: RequestInit) => handleMuxCleanup(new Request("http://localhost/functions/v1/mux-cleanup", init));
  assertEquals((await call({ method: "GET" })).status, 405);
  assertEquals((await call({ method: "POST" })).status, 401);
  assertEquals((await call({ method: "POST", headers: { Authorization: "Bearer wrong" } })).status, 401);
  assertEquals((await call({ method: "POST", headers: { Authorization: `Bearer ${SERVICE}` } })).status, 401, "not even the service key");
  const bad = await call({ method: "POST", headers: { Authorization: `Bearer ${CLEANUP_KEY}` }, body: JSON.stringify({ mode: "purge" }) });
  assertEquals(bad.status, 400);
  const ok = await call({ method: "POST", headers: { Authorization: `Bearer ${CLEANUP_KEY}` }, body: JSON.stringify({ mode: "drain" }) });
  assertEquals(ok.status, 200);
  assertEquals((await ok.json()).ok, true);
});

Deno.test("members cannot reach the queue, the worker's functions or the purge", async () => {
  const m = await member("nosy");
  const read = await http("/rest/v1/mux_cleanup_jobs?select=id", { key: ANON, token: m.token });
  assert(read.status === 401 || read.status === 403, `queue read ${read.status}`);
  for (const fn of ["mux_cleanup_claim", "mux_cleanup_overview", "purge_deleted_accounts", "mux_cleanup_sweep", "run_mux_cleanup"]) {
    const r = await rpc(m, fn, fn === "mux_cleanup_sweep" ? { p_assets: [] } : {});
    assert(r.status === 401 || r.status === 403 || r.status === 404, `${fn} answered ${r.status}`);
  }
});

// ---------------------------------------------------------------------------
Deno.test("author deletion: hidden at once everywhere, the asset deleted at Mux after the ownership check", async () => {
  const lena = await member("lena");
  const v = await liveVideo(lena);
  assertEquals((await web(v.id)).status, "live");
  assertEquals((await rpc(lena, "delete_video", { p_id: v.id })).status, 204);
  assertEquals((await web(v.id)).status, "unavailable", "the web shows it unavailable before Mux is touched");
  muxCalls.length = 0;
  const r = await drainAll();
  assertEquals(r.done, 1);
  assertEquals(muxCalls.filter((c) => c.path.includes(v.asset.id)).map((c) => c.method), ["GET", "DELETE"], "read and verified, then deleted");
  assert(!assets.has(v.asset.id), "the asset is gone at Mux");
  assertEquals((await row(v.id))?.mux_asset_id, null);
  const [job] = await jobs(v.asset.id);
  assertEquals([job.status, job.reason, job.owner_id], ["done", "author_deleted", null]);
  assertEquals(destructive(founderVideo.asset.id), []);
});

Deno.test("deleted before Mux finished: a waiting upload is cancelled; an asset made meanwhile is found and deleted", async () => {
  const adam = await member("adam");
  // a) deleted before any bytes: the upload is still waiting and is cancelled.
  const u1 = await mint(adam);
  const p1 = await rpc(adam, "post_response", { p_prompt: await prompt(), p_upload_id: u1, p_caption: null, p_duration_ms: 9000 });
  assertEquals((await rpc(adam, "delete_video", { p_id: p1.json.id })).status, 204);
  await drainAll();
  assertEquals(uploads.get(u1)?.status, "cancelled");
  assertEquals((await jobs(u1))[0].status, "done");
  // b) the bytes arrived and Mux made an asset, but the ready event has not come yet.
  const u2 = await mint(adam);
  const p2 = await rpc(adam, "post_response", { p_prompt: await prompt(), p_upload_id: u2, p_caption: null, p_duration_ms: 9000 });
  const asset = muxReceives(u2);
  assertEquals((await rpc(adam, "delete_video", { p_id: p2.json.id })).status, 204);
  muxCalls.length = 0;
  await drainAll();
  assert(!assets.has(asset.id), "the asset Mux made is deleted");
  assertEquals(calls("PUT", u2), 0, "no cancel was attempted on an upload that was not waiting");
  // The late ready event changes nothing, warms nothing and the queue finds the asset already gone.
  muxCalls.length = 0;
  await ready(asset);
  assertEquals(muxCalls.filter((c) => c.path.endsWith(".m3u8")).length, 0, "a deleted video is never pre-warmed");
  assertEquals((await row(p2.json.id as string))?.status, "deleted");
  await drainAll();
  assertEquals((await jobs(asset.id)).map((j) => j.status), ["done", "done"]);
  assertEquals((await jobs(asset.id))[1].result?.outcome, "already_gone");
});

Deno.test("an upload never posted: its asset is deleted once the URL has expired, owned by the member it was minted for", async () => {
  const maya = await member("mayaorphan");
  const u = await mint(maya);
  const asset = muxReceives(u);
  const hook = await ready(asset);
  assertEquals(hook.response.status, "unknown_upload");
  await drainAll();
  assert(assets.has(asset.id), "kept while the URL could still be posted");
  const [held] = await jobs(asset.id);
  assertEquals([held.status, held.reason, held.attempts], ["pending", "abandoned", 0]);
  // An hour later the URL has expired.
  await http(`/rest/v1/video_uploads?upload_id=eq.${u}`, { method: "PATCH", body: { expires_at: new Date(Date.now() - 1000).toISOString() } });
  await patchJobs(asset.id, { not_before: due() });
  await drainAll();
  assert(!assets.has(asset.id), "then it is deleted");
  assertEquals((await jobs(asset.id))[0].status, "done");
});

// ---------------------------------------------------------------------------
Deno.test("moderation: playback revoked at once, the asset kept; a restore brings a new playback id", async () => {
  const rita = await member("rita");
  const v = await liveVideo(rita);
  const oldPlayback = v.asset.playback_ids[0].id;
  await service("mod_remove_video", { p_video: v.id, p_reason: "Spam.", p_moderator: "test" });
  assertEquals((await web(v.id)).status, "unavailable");
  await drainAll();
  assert(assets.has(v.asset.id), "the asset is kept privately");
  assertEquals(assets.get(v.asset.id)!.playback_ids, [], "with no public playback");
  assertEquals((await row(v.id))?.mux_playback_id, null);
  const del = (await jobs(v.asset.id)).find((j) => j.action === "delete_asset")!;
  assertEquals(del.status, "pending");
  const days = (Date.parse(del.not_before) - Date.now()) / 86_400_000;
  assert(days > 29.9 && days < 30.1, `kept for 30 days after the case closed, got ${days}`);
  await service("mod_restore_video", { p_video: v.id, p_reason: "Mistake.", p_moderator: "test" });
  await drainAll();
  const restored = (await row(v.id))!;
  assert(restored.mux_playback_id && restored.mux_playback_id !== oldPlayback, "a new playback id");
  assertEquals(assets.get(v.asset.id)!.playback_ids.map((p) => p.id), [restored.mux_playback_id]);
  assertEquals((await web(v.id)).video?.playback_id, restored.mux_playback_id, "it plays again");
  // The retention's deletion, when it comes due, finds the video live and keeps the asset.
  await patchJobs(v.asset.id, { not_before: due() });
  await drainAll();
  assert(assets.has(v.asset.id));
  assertEquals((await jobs(v.asset.id)).find((j) => j.action === "delete_asset")!.status, "skipped");
});

Deno.test("account deletion and recovery: playback off for the window, back on after signing in", async () => {
  const sam = await member("sam");
  const v = await liveVideo(sam);
  assertEquals((await rpc(sam, "delete_account")).status, 204);
  assertEquals((await web(v.id)).status, "unavailable");
  await drainAll();
  assertEquals(assets.get(v.asset.id)!.playback_ids, [], "revoked at Mux");
  assert(assets.has(v.asset.id), "nothing deleted during the window");
  assertEquals((await rpc(sam, "get_onboarding_state")).json.has_profile, true, "signing back in restores");
  await drainAll();
  const pb = (await row(v.id))!.mux_playback_id;
  assert(pb, "a new playback id");
  assertEquals((await web(v.id)).video?.playback_id, pb);
});

Deno.test("concurrency: a restore never overlaps a running revoke of the same video", async () => {
  const dee = await member("dee");
  const v = await liveVideo(dee);
  assertEquals((await rpc(dee, "delete_account")).status, 204);
  // Mux is slow to delete the playback id: the first drain is still inside it when Dee signs back in.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  fault = (method, path) =>
    method === "DELETE" && path.includes(`/assets/${v.asset.id}/playback-ids/`)
      ? gate.then(() => fakeMux(method, new URL(`https://api.mux.com${path}`), null, false))
      : null;
  const first = drain(1);
  await new Promise((r) => setTimeout(r, 300));
  assertEquals((await jobs(v.asset.id)).map((j) => j.status), ["running"], "the revoke is inside Mux");
  assertEquals((await rpc(dee, "get_onboarding_state")).json.has_profile, true);
  await drain(1);
  assertEquals((await jobs(v.asset.id)).map((j) => j.status), ["running", "pending"], "the restore waits: one job per asset at a time");
  release();
  await first;
  fault = () => null;
  assertEquals(assets.get(v.asset.id)!.playback_ids, [], "the revoke finished");
  await drainAll();
  assertEquals(assets.get(v.asset.id)!.playback_ids.length, 1, "then the restore ran");
  assertEquals((await web(v.id)).status, "live");
});

Deno.test("concurrency: three workers at once act on each job exactly once", async () => {
  const kim = await member("kim");
  const videos = [];
  for (let i = 0; i < 6; i++) videos.push(await liveVideo(kim));
  for (const v of videos) assertEquals((await rpc(kim, "delete_video", { p_id: v.id })).status, 204);
  muxCalls.length = 0;
  const results = await Promise.all([drain(), drain(), drain()]) as Record<string, number>[];
  assert(results.reduce((n, r) => n + r.claimed, 0) >= 6, "all six jobs leased");
  for (const v of videos) {
    assertEquals(calls("DELETE", `/assets/${v.asset.id}`), 1, `asset ${v.asset.id} deleted once`);
    assert(!assets.has(v.asset.id));
  }
});

// ---------------------------------------------------------------------------
Deno.test("retry: a Mux failure is retried with backoff; the asset is deleted once Mux recovers", async () => {
  const ola = await member("ola");
  const v = await liveVideo(ola);
  await rpc(ola, "delete_video", { p_id: v.id });
  fault = (method, path) => method === "DELETE" && path.includes(v.asset.id) ? Response.json({ error: "busy" }, { status: 503 }) : null;
  await drain();
  let [job] = await jobs(v.asset.id);
  assertEquals([job.status, job.attempts, job.last_error], ["pending", 1, "mux_503"]);
  const wait = (Date.parse(job.not_before) - Date.now()) / 1000;
  assert(wait > 50 && wait < 70, `retried after about a minute, got ${wait}`);
  assert(assets.has(v.asset.id));
  fault = (method, path) => method === "GET" && path.includes(v.asset.id) ? Promise.reject(new TypeError("network down")) : null;
  await patchJobs(v.asset.id, { not_before: due() });
  await drain();
  [job] = await jobs(v.asset.id);
  assertEquals([job.status, job.attempts, job.last_error], ["pending", 2, "network down"]);
  fault = () => null;
  await patchJobs(v.asset.id, { not_before: due() });
  await drainAll();
  assertEquals((await jobs(v.asset.id))[0].status, "done");
  assert(!assets.has(v.asset.id));
});

Deno.test("failure: out of attempts the job fails, shows in the overview, and a retry finishes it", async () => {
  const pia = await member("pia");
  const v = await liveVideo(pia);
  await rpc(pia, "delete_video", { p_id: v.id });
  await patchJobs(v.asset.id, { max_attempts: 2 });
  fault = (method, path) => method === "DELETE" && path.includes(v.asset.id) ? Response.json({ error: "down" }, { status: 500 }) : null;
  await drain();
  await patchJobs(v.asset.id, { not_before: due() });
  await drain();
  const [job] = await jobs(v.asset.id);
  assertEquals([job.status, job.attempts], ["failed", 2]);
  const overview = await service("mux_cleanup_overview") as { failed: { id: string }[] };
  assert(overview.failed.some((f) => f.id === job.id), "listed as failed");
  fault = () => null;
  await service("mux_cleanup_retry", { p_job: job.id });
  await drainAll();
  assertEquals((await jobs(v.asset.id))[0].status, "done");
  assert(!assets.has(v.asset.id));
});

Deno.test("ownership: an asset whose passthrough or upload is not the recorded one is never changed", async () => {
  const quinn = await member("quinn");
  const a = await liveVideo(quinn), b = await liveVideo(quinn);
  assets.get(a.asset.id)!.passthrough = founder.id;
  assets.get(b.asset.id)!.upload_id = `up${run}someoneelse`;
  await rpc(quinn, "delete_video", { p_id: a.id });
  await rpc(quinn, "delete_video", { p_id: b.id });
  muxCalls.length = 0;
  await drainAll();
  assertEquals(destructive(a.asset.id).length + destructive(b.asset.id).length, 0, "no DELETE or cancel");
  assert(assets.has(a.asset.id) && assets.has(b.asset.id));
  assertEquals((await jobs(a.asset.id))[0].status + ":" + (await jobs(a.asset.id))[0].last_error, "failed:passthrough_mismatch", "left for a person, never retried automatically");
  assertEquals((await jobs(b.asset.id))[0].status + ":" + (await jobs(b.asset.id))[0].last_error, "failed:upload_id_mismatch");
});

// ---------------------------------------------------------------------------
Deno.test("purge: a response with other people's video replies becomes a tombstone; every asset is deleted after the rows are gone", async () => {
  const maya = await member("maya"), lena = await member("lenapurge");
  const root = await liveVideo(maya);
  const lenaReply = await liveReply(lena, root.id);
  const mayaReply = await liveReply(maya, root.id);
  const lenaToMaya = await liveReply(lena, mayaReply.id);
  const lonely = await liveVideo(maya);
  const comment = await rpc(maya, "post_comment", { p_response: (await liveVideo(lena)).id, p_body: "from Maya" });
  await rpc(lena, "post_comment", { p_response: comment.json.response_id, p_body: "reply to Maya", p_parent: comment.json.id });
  assertEquals((await rpc(maya, "delete_account")).status, 204);
  await drainAll();
  await account(maya.id, { deleted_at: new Date(Date.now() - 31 * 86_400_000).toISOString() });
  const purged = await http("/rest/v1/rpc/purge_deleted_accounts", { method: "POST", body: {} });
  assertEquals(purged.status, 200);
  assert((purged.json as number) >= 1, "purged");
  assertEquals((await http(`/auth/v1/admin/users/${maya.id}`)).status, 404, "her Auth user is gone");
  const failures = await http(`/rest/v1/account_purge_failures?account_id=eq.${maya.id}`);
  assertEquals(failures.json, [], "no failure recorded");
  // Tombstones: the root and her reply stay, without her.
  for (const id of [root.id, mayaReply.id]) {
    const t = (await row(id))!;
    assertEquals([t.status, t.author_id, t.caption, t.mux_asset_id, t.mux_playback_id, t.mux_upload_id], ["deleted", null, null, null, null, null]);
  }
  assertEquals(await row(lonely.id), undefined, "a video nobody replied to is gone");
  assertEquals((await web(lenaReply.id)).status, "live", "Lena's reply still plays");
  const ctx = (await rpc(lena, "get_video", { p_id: lenaToMaya.id })).json.context as Record<string, unknown>;
  assertEquals([ctx.root_deleted, ctx.reply_to_deleted], [true, true], "Original response deleted / Replying to a deleted video");
  const sheet = (await rpc(lena, "comments_list", { p_response: comment.json.response_id })).json.comments as { id: string; deleted: boolean; replies: unknown[] }[];
  const parent = sheet.find((c) => c.id === comment.json.id)!;
  assertEquals([parent.deleted, parent.replies.length], [true, 1], "her comment is a deleted parent; Lena's reply stays");
  // Mux: the jobs outlive the rows; every one of her assets is deleted after an ownership check.
  muxCalls.length = 0;
  await drainAll();
  for (const a of [root.asset, mayaReply.asset, lonely.asset]) assert(!assets.has(a.id), `${a.id} deleted`);
  for (const a of [lenaReply.asset, lenaToMaya.asset]) assert(assets.has(a.id) && a.playback_ids.length === 1, "Lena's videos untouched");
  assertEquals((await jobs(root.asset.id)).filter((j) => j.reason === "account_purged")[0].status, "done");
});

Deno.test("purge: several accounts due at once, each with a reply chain, are all purged", async () => {
  // (One account failing without stopping the others is covered in pgTAP, 0010 section 7: it
  // needs a fault injected inside the database.)
  const una = await member("una"), vic = await member("vic");
  const a = await liveVideo(una);
  const b = await liveReply(vic, a.id);
  await liveReply(una, b.id);
  for (const m of [una, vic]) await account(m.id, { deleted_at: new Date(Date.now() - 31 * 86_400_000).toISOString() });
  const purged = await http("/rest/v1/rpc/purge_deleted_accounts", { method: "POST", body: {} });
  assertEquals(purged.status, 200);
  for (const m of [una, vic]) assertEquals((await http(`/auth/v1/admin/users/${m.id}`)).status, 404, "purged");
  assertEquals((await http(`/rest/v1/account_purge_failures?account_id=in.(${una.id},${vic.id})`)).json, []);
  await drainAll();
  assert(!assets.has(a.asset.id) && !assets.has(b.asset.id), "both accounts' assets deleted");
});

Deno.test("Admin API deletion (as the Dashboard does): anonymised, tombstoned, and every asset deleted with its provenance", async () => {
  const rex = await member("rex"), lia = await member("lia");
  const replied = await liveVideo(rex), removed = await liveVideo(rex);
  const liaReply = await liveReply(lia, replied.id);
  const liaVideo = await liveVideo(lia);
  const comment = await rpc(rex, "post_comment", { p_response: liaVideo.id, p_body: "from Rex" });
  await rpc(lia, "post_comment", { p_response: liaVideo.id, p_body: "reply to Rex", p_parent: comment.json.id });
  await rpc(rex, "report_item", { p_kind: "video", p_id: liaVideo.id, p_reason: "spam" });
  await service("mod_remove_video", { p_video: removed.id, p_reason: "Free text naming someone.", p_moderator: "test", p_note: "internal note" });
  await drainAll();
  const openUrl = await mint(rex);
  // Supabase Auth deletes the user (its own database role); the account goes by cascade.
  assertEquals((await http(`/auth/v1/admin/users/${rex.id}`, { method: "DELETE" })).status, 200, "admin delete");
  assertEquals((await http(`/rest/v1/accounts?id=eq.${rex.id}&select=id`)).json, []);
  const actions = (await http(`/rest/v1/moderation_actions?kind=eq.remove&anonymized_at=not.is.null&select=account_id,target_id,moderator,reason,note,target_kind&order=created_at.desc&limit=1`)).json as Record<string, unknown>[];
  assertEquals(actions[0], { account_id: null, target_id: null, moderator: null, reason: null, note: null, target_kind: "video" }, "the removal is anonymised");
  const free = await http(`/rest/v1/moderation_actions?or=(reason.eq.Free%20text%20naming%20someone.,note.eq.internal%20note)&select=id`);
  assertEquals(free.json, [], "no free text left");
  const report = (await http(`/rest/v1/reports?target_id=eq.${liaVideo.id}&select=reporter_id,status`)).json as { reporter_id: string | null; status: string }[];
  assertEquals(report, [{ reporter_id: null, status: "open" }], "his report on Lia's video stays open, without him");
  const t = (await row(replied.id))!;
  assertEquals([t.status, t.author_id, t.caption, t.mux_asset_id], ["deleted", null, null, null], "a tombstone keeps Lia's reply in its room");
  assertEquals((await web(liaReply.id)).status, "live");
  const sheet = (await rpc(lia, "comments_list", { p_response: liaVideo.id })).json.comments as { id: string; deleted: boolean; replies: unknown[] }[];
  assertEquals(sheet.filter((c) => c.id === comment.json.id).map((c) => [c.deleted, c.replies.length]), [[true, 1]], "his comment is a deleted parent; Lia's reply stays");
  // Mux: every asset and the open upload URL queued with his id; the worker checks it and acts.
  assertEquals((await jobs(replied.asset.id)).map((j) => [j.action, j.reason, j.status]), [["delete_asset", "account_removed", "pending"]], "his video's asset is queued");
  // The removed video already had its deletion queued for the end of its retention: the removal
  // merges into it, keeping the later time.
  const held = (await jobs(removed.asset.id)).filter((j) => j.action === "delete_asset");
  assertEquals(held.map((j) => [j.reason, j.status]), [["moderation_removed", "pending"]]);
  const days = (Date.parse(held[0].not_before) - Date.now()) / 86_400_000;
  assert(days > 29.9 && days < 30.1, `still 30 days, got ${days}`);
  assertEquals((await jobs(openUrl))[0].action, "cancel_upload", "the URL he still held is queued for cancellation");
  muxCalls.length = 0;
  await drainAll();
  assert(!assets.has(replied.asset.id), "his video's asset is deleted (passthrough checked against the recorded owner)");
  assert(assets.has(removed.asset.id), "the removed one is kept for its 30 days");
  assertEquals(uploads.get(openUrl)?.status, "cancelled");
  assert(assets.has(liaReply.asset.id) && assets.has(liaVideo.asset.id), "Lia's videos untouched");
});

// ---------------------------------------------------------------------------
Deno.test("sweep: an orphan from an unused upload is deleted; an asset of unknown origin is only reported", async () => {
  const wen = await member("wen");
  const orphanUpload = await mint(wen);
  const orphan = muxReceives(orphanUpload, { createdDaysAgo: 2 });
  // Minted two days ago, never posted, no ready event seen (a missed webhook).
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
  await http(`/rest/v1/video_uploads?upload_id=eq.${orphanUpload}`, { method: "PATCH", body: { created_at: twoDaysAgo, expires_at: twoDaysAgo } });
  const stranger: FakeAsset = { id: nid("as"), status: "ready", upload_id: nid("up"), passthrough: wen.id, playback_ids: [{ id: nid("pb"), policy: "public" }], duration: 3, created_at: String(Math.floor(Date.now() / 1000) - 5 * 86_400) };
  assets.set(stranger.id, stranger);
  const young = muxReceives(await mint(wen), { createdDaysAgo: 0 });
  const res = await handleMuxCleanup(new Request("http://localhost/functions/v1/mux-cleanup", { method: "POST", headers: { Authorization: `Bearer ${CLEANUP_KEY}` }, body: JSON.stringify({ mode: "sweep" }) }));
  const sweep = await res.json();
  assertEquals([res.status, sweep.ok, sweep.complete], [200, true, true]);
  assert(sweep.queued >= 1 && sweep.review >= 1, JSON.stringify(sweep));
  assertEquals((await jobs(orphan.id))[0].reason, "orphan");
  assertEquals((await jobs(stranger.id))[0].status, "review");
  assertEquals(await jobs(young.id), [], "a young asset is left alone");
  await drainAll();
  assert(!assets.has(orphan.id), "the orphan is deleted");
  assert(assets.has(stranger.id) && assets.has(young.id), "the stranger and the young asset are untouched");
  assertEquals(destructive(stranger.id), []);
});

Deno.test("the founder's video: never touched at Mux, its row unchanged, still playing", async () => {
  assertEquals(destructive(founderVideo.asset.id), []);
  assertEquals(assets.get(founderVideo.asset.id)!.playback_ids.length, 1);
  assertEquals(await row(founderVideo.id), founderRow);
  assertEquals((await web(founderVideo.id)).video?.playback_id, founderVideo.asset.playback_ids[0].id);
  assertEquals((await jobs(founderVideo.asset.id)).filter((j) => j.status !== "skipped"), []);
});


// ---------------------------------------------------------------------------
// The switches: nothing changes at Mux unless both say live.
Deno.test("off: nothing is leased and Mux is not called, not even listed", async () => {
  const xia = await member("xia");
  const v = await liveVideo(xia);
  await rpc(xia, "delete_video", { p_id: v.id });
  await setMode("off");
  muxCalls.length = 0;
  const r = await drain() as Record<string, unknown>;
  assertEquals([r.mode, r.claimed], ["off", 0]);
  const s = await handleMuxCleanup(new Request("http://localhost/functions/v1/mux-cleanup", { method: "POST", headers: { Authorization: `Bearer ${CLEANUP_KEY}` }, body: JSON.stringify({ mode: "sweep" }) }));
  assertEquals((await s.json()).skipped, "off");
  assertEquals(muxCalls, [], "no Mux call of any kind");
  assert(assets.has(v.asset.id));
  await setMode("live");
  await drainAll();
  assert(!assets.has(v.asset.id), "once on, the deletion runs");
});

Deno.test("dry run (the function's switch): Mux is read, never changed; the plan is recorded; going live acts on it", async () => {
  const yan = await member("yan");
  const v = await liveVideo(yan), w = await liveVideo(yan);
  await rpc(yan, "delete_video", { p_id: v.id });
  await service("mod_remove_video", { p_video: w.id, p_reason: "Spam.", p_moderator: "test" });
  Deno.env.set("MUX_CLEANUP_MODE", "dry_run");
  try {
    muxCalls.length = 0;
    const r = await drain() as Record<string, number | string>;
    assertEquals(r.mode, "dry_run");
    assert((r.release as number) >= 2, JSON.stringify(r));
    assertEquals(mutations(), [], "only GETs");
    assert(assets.has(v.asset.id) && assets.get(w.asset.id)!.playback_ids.length === 1, "nothing changed at Mux");
    assertEquals((await row(w.id))!.mux_playback_id, w.asset.playback_ids[0].id, "nor in the database's videos");
    const [job] = await jobs(v.asset.id);
    assertEquals([job.status, job.attempts, (job.result as { dry_run: boolean }).dry_run], ["pending", 0, true]);
    assertEquals((job.result as { would: { act: string } }).would.act, "delete");
    const overview = await service("mux_cleanup_overview") as { dry_run_planned: { asset_id: string }[] };
    assert(overview.dry_run_planned.some((p) => p.asset_id === v.asset.id), "the overview lists the plan");
  } finally {
    Deno.env.set("MUX_CLEANUP_MODE", "live");
  }
  await setMode("live");
  await drainAll();
  assert(!assets.has(v.asset.id), "live: deleted");
  assertEquals(assets.get(w.asset.id)!.playback_ids, [], "live: revoked");
});

Deno.test("dry run (the database's switch): the sweep queues and records nothing, and reports what it would", async () => {
  const zed = await member("zed");
  const u = await mint(zed);
  const orphan = muxReceives(u, { createdDaysAgo: 3 });
  const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
  await http(`/rest/v1/video_uploads?upload_id=eq.${u}`, { method: "PATCH", body: { created_at: old, expires_at: old } });
  await setMode("dry_run");
  try {
    muxCalls.length = 0;
    const res = await handleMuxCleanup(new Request("http://localhost/functions/v1/mux-cleanup", { method: "POST", headers: { Authorization: `Bearer ${CLEANUP_KEY}` }, body: JSON.stringify({ mode: "sweep" }) }));
    const sweep = await res.json();
    assertEquals([sweep.mode, sweep.dry_run], ["dry_run", true]);
    assert(sweep.would_queue.includes(orphan.id), JSON.stringify(sweep));
    assertEquals(await jobs(orphan.id), [], "nothing queued");
    assertEquals(mutations(), []);
  } finally {
    await setMode("live");
  }
});

// ---------------------------------------------------------------------------
// Ordering: the worker acts on the database as it is at the last moment.
Deno.test("ordering: a restore whose video is deleted again while Mux creates the id removes the id at once", async () => {
  const ama = await member("ama");
  const v = await liveVideo(ama);
  assertEquals((await rpc(ama, "delete_account")).status, 204);
  await drainAll();
  assertEquals(assets.get(v.asset.id)!.playback_ids, []);
  assertEquals((await rpc(ama, "get_onboarding_state")).json.has_profile, true);
  // Mux is slow to create the new playback id; meanwhile Ama deletes her account again.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  fault = (method, path) =>
    method === "POST" && path === `/video/v1/assets/${v.asset.id}/playback-ids`
      ? gate.then(() => fakeMux(method, new URL(`https://api.mux.com${path}`), JSON.stringify({ policy: "public" }), false))
      : null;
  const running = drain(1);
  await new Promise((r) => setTimeout(r, 300));
  assertEquals((await rpc(ama, "delete_account")).status, 204);
  release();
  await running;
  fault = () => null;
  assertEquals(assets.get(v.asset.id)!.playback_ids, [], "the id created for the stale restore was removed straight away");
  assertEquals((await row(v.id))!.mux_playback_id, null, "and never recorded");
  assertEquals((await web(v.id)).status, "unavailable");
  await drainAll();
  assertEquals(assets.get(v.asset.id)!.playback_ids, []);
});

Deno.test("ordering: a deleted video stays deleted through account deletion and recovery", async () => {
  const bo = await member("bo");
  const gone = await liveVideo(bo), kept = await liveVideo(bo);
  await rpc(bo, "delete_video", { p_id: gone.id });
  assertEquals((await rpc(bo, "delete_account")).status, 204);
  assertEquals((await rpc(bo, "get_onboarding_state")).json.has_profile, true);
  await drainAll();
  assert(!assets.has(gone.asset.id), "the deleted video's asset is deleted");
  assertEquals((await web(gone.id)).status, "unavailable");
  assertEquals((await web(kept.id)).status, "live", "the other one plays");
});

Deno.test("ordering: removal, review, reversal brings the video back; removal, restore, removal leaves it off", async () => {
  const cy = await member("cy");
  const v = await liveVideo(cy), w = await liveVideo(cy);
  await service("mod_remove_video", { p_video: v.id, p_reason: "Spam.", p_moderator: "test" });
  await drainAll();
  const action = ((await http(`/rest/v1/moderation_actions?target_id=eq.${v.id}&kind=eq.remove&select=id`)).json as { id: string }[])[0].id;
  assertEquals((await rpc(cy, "request_review", { p_action: action })).status, 204);
  await service("mod_decide_review", { p_action: action, p_outcome: "reversed", p_moderator: "test" });
  await drainAll();
  assertEquals(assets.get(v.asset.id)!.playback_ids.length, 1);
  assertEquals((await web(v.id)).video?.playback_id, assets.get(v.asset.id)!.playback_ids[0].id, "it plays again");

  await service("mod_remove_video", { p_video: w.id, p_reason: "Spam.", p_moderator: "test" });
  await service("mod_restore_video", { p_video: w.id, p_reason: "Mistake.", p_moderator: "test" });
  await service("mod_remove_video", { p_video: w.id, p_reason: "Spam again.", p_moderator: "test" });
  muxCalls.length = 0;
  await drainAll();
  assertEquals(assets.get(w.asset.id)!.playback_ids, [], "removed in the end: no playback");
  assert(assets.has(w.asset.id), "the asset kept for the retention");
  assertEquals((await web(w.id)).status, "unavailable");
  assertEquals(muxCalls.filter((c) => c.method === "POST" && c.path.includes(w.asset.id)).length, 0, "no playback id was ever created for it");
});

// ---------------------------------------------------------------------------
// Reliability fixes (20261013000100 and the worker's dry-run plans): G1, G2, G5.
const sweepNow = async () => await (await handleMuxCleanup(new Request("http://localhost/functions/v1/mux-cleanup", { method: "POST", headers: { Authorization: `Bearer ${CLEANUP_KEY}` }, body: JSON.stringify({ mode: "sweep" }) }))).json();
type Plan = { act: string; direction?: string; asset_id?: string; would_revoke?: string[]; would_create?: string; public_playback_ids?: string[] };
const planOf = (j: JobRow) => (j.result as { would: Plan }).would;

Deno.test("G1: a dry run says whether it would revoke or restore playback, on which asset, with which ids; the log shortens them", async () => {
  const ida = await member("ida");
  const v = await liveVideo(ida);
  const pb = v.asset.playback_ids[0].id;
  await service("mod_remove_video", { p_video: v.id, p_reason: "Spam.", p_moderator: "test" });
  const logged: string[] = [];
  const log = console.log;
  Deno.env.set("MUX_CLEANUP_MODE", "dry_run");
  try {
    console.log = (...a: unknown[]) => logged.push(a.map(String).join(" "));
    muxCalls.length = 0;
    await drain();
    console.log = log;
    const sync = (await jobs(v.asset.id)).find((j) => j.action === "sync_playback")!;
    assertEquals([sync.status, planOf(sync).act, planOf(sync).direction, planOf(sync).asset_id], ["pending", "sync", "revoke", v.asset.id]);
    assertEquals(planOf(sync).would_revoke, [pb]);
    assertEquals(mutations(), [], "only reads");
    assert(logged.some((l) => l.includes(`"direction":"revoke"`)), "the plan is logged");
    assert(!logged.some((l) => l.includes(pb)), "but not the playback id itself");
    assert(logged.some((l) => l.includes(`${pb.slice(0, 4)}…`)), "only its first characters");
  } finally {
    console.log = log;
    Deno.env.set("MUX_CLEANUP_MODE", "live");
  }
  await setMode("live");
  await drainAll();
  assertEquals(assets.get(v.asset.id)!.playback_ids, [], "live: revoked");
  await service("mod_restore_video", { p_video: v.id, p_reason: "Mistake.", p_moderator: "test" });
  Deno.env.set("MUX_CLEANUP_MODE", "dry_run");
  try {
    muxCalls.length = 0;
    await drain();
    const sync = (await jobs(v.asset.id)).filter((j) => j.action === "sync_playback" && j.status === "pending").at(-1)!;
    assertEquals([planOf(sync).direction, planOf(sync).would_create, planOf(sync).public_playback_ids], ["restore", "public", []]);
    assertEquals(mutations(), []);
  } finally {
    Deno.env.set("MUX_CLEANUP_MODE", "live");
  }
  await setMode("live");
  await drainAll();
  assertEquals(assets.get(v.asset.id)!.playback_ids.length, 1, "live: a new id");
  assert(assets.get(v.asset.id)!.playback_ids[0].id !== pb);
  assertEquals((await web(v.id)).video?.playback_id, assets.get(v.asset.id)!.playback_ids[0].id, "it plays");
});

Deno.test("G2: removed, restored, then deleted by its author: the asset is deleted at Mux at once; an open report stays open", async () => {
  const eli = await member("eli"), fay = await member("fay");
  const v = await liveVideo(eli);
  await service("mod_remove_video", { p_video: v.id, p_reason: "Spam.", p_moderator: "test" });
  await drainAll();
  const retention = (await jobs(v.asset.id)).find((j) => j.action === "delete_asset")!;
  assert(new Date(retention.not_before).getTime() > Date.now() + 29 * 86_400_000, "the removal's retention: 30 days");
  await service("mod_restore_video", { p_video: v.id, p_reason: "Mistake.", p_moderator: "test" });
  await drainAll();
  assertEquals((await web(v.id)).status, "live", "restored and playing");
  assertEquals((await jobs(v.asset.id)).find((j) => j.id === retention.id)!.status, "skipped", "the restore ended the retention");
  assertEquals((await rpc(fay, "report_item", { p_kind: "video", p_id: v.id, p_reason: "spam" })).status, 200, "reported again");
  assertEquals((await rpc(eli, "delete_video", { p_id: v.id })).status, 204);
  muxCalls.length = 0;
  await drainAll();
  assert(!assets.has(v.asset.id), "the asset is deleted at Mux now, not in 30 days");
  assertEquals(muxCalls.filter((c) => c.path.includes(v.asset.id)).map((c) => c.method), ["GET", "DELETE"], "read and verified, then deleted");
  const last = (await jobs(v.asset.id)).filter((j) => j.action === "delete_asset").at(-1)!;
  assertEquals([last.status, last.reason], ["done", "author_deleted"]);
  const reports = (await http(`/rest/v1/reports?target_id=eq.${v.id}&select=status`)).json as { status: string }[];
  assert(reports.some((r) => r.status === "open"), "the open report stays open");
  assertEquals(destructive(founderVideo.asset.id), []);
});

Deno.test("G2: deleted by its author while Mux creates the restored id: the id is removed and the asset deleted", async () => {
  const gus = await member("gus");
  const v = await liveVideo(gus);
  await service("mod_remove_video", { p_video: v.id, p_reason: "Spam.", p_moderator: "test" });
  await drainAll();
  await service("mod_restore_video", { p_video: v.id, p_reason: "Mistake.", p_moderator: "test" });
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  fault = (method, path) =>
    method === "POST" && path === `/video/v1/assets/${v.asset.id}/playback-ids`
      ? gate.then(() => fakeMux(method, new URL(`https://api.mux.com${path}`), JSON.stringify({ policy: "public" }), false))
      : null;
  const running = drain(1);
  await new Promise((r) => setTimeout(r, 300));
  assertEquals((await rpc(gus, "delete_video", { p_id: v.id })).status, 204, "Gus deletes it meanwhile");
  release();
  await running;
  fault = () => null;
  assert(!assets.has(v.asset.id) || assets.get(v.asset.id)!.playback_ids.length === 0, "the id made for the stale restore is gone");
  await drainAll();
  assert(!assets.has(v.asset.id), "and the asset is deleted");
  assertEquals((await row(v.id))!.mux_playback_id, null);
  assertEquals((await web(v.id)).status, "unavailable");
});

Deno.test("G5: the sweep pages past 100 assets, judges only what it listed when a later page fails, leaves failed and held assets alone, and repeats safely", async () => {
  const hal = await member("hal");
  const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const orphan = async () => {
    const u = await mint(hal);
    await http(`/rest/v1/video_uploads?upload_id=eq.${u}`, { method: "PATCH", body: { created_at: old, expires_at: old } });
    return muxReceives(u, { createdDaysAgo: 3 });
  };
  const o1 = await orphan(), o3 = await orphan();
  // H: removed with a review pending, so its case is open.
  const h = await liveVideo(hal);
  await service("mod_remove_video", { p_video: h.id, p_reason: "Spam.", p_moderator: "test" });
  const action = ((await http(`/rest/v1/moderation_actions?target_id=eq.${h.id}&kind=eq.remove&select=id`)).json as { id: string }[])[0].id;
  assertEquals((await rpc(hal, "request_review", { p_action: action })).status, 204);
  await drainAll();
  assertEquals((await jobs(h.asset.id)).map((j) => j.status).sort(), ["done", "skipped"], "revoked; the deletion skipped while the case is open");
  h.asset.created_at = String(Math.floor(Date.now() / 1000) - 3 * 86_400);
  const stamp = (d: number) => String(Math.floor(Date.now() / 1000) - d * 86_400);
  const r1: FakeAsset = { id: nid("as"), status: "ready", upload_id: nid("up"), playback_ids: [], duration: 3, created_at: stamp(4) };
  const r2: FakeAsset = { id: nid("as"), status: "ready", passthrough: hal.id, playback_ids: [], duration: 3, created_at: stamp(4) };
  // Mux's listing, in order: 230 assets over three pages (100, 100, 30), mostly young.
  const saved = new Map(assets);
  assets.clear();
  const at: Record<number, FakeAsset> = { 5: o1, 10: h.asset, 150: r1, 151: r2, 220: o3 };
  for (let i = 0; i < 230; i++) {
    const a = at[i] ?? { id: nid("as"), status: "ready", playback_ids: [], duration: 1, created_at: stamp(0) };
    assets.set(a.id, a);
  }
  const listCalls = () => muxCalls.filter((c) => c.method === "GET" && c.path.startsWith("/video/v1/assets?")).map((c) => c.path);
  try {
    // 1. Dry run: all three pages read; nothing queued.
    await setMode("dry_run");
    muxCalls.length = 0;
    const s1 = await sweepNow();
    assertEquals([s1.listed, s1.complete, s1.seen, s1.young, s1.held, s1.queued, s1.review], [230, true, 230, 225, 1, 2, 2]);
    assertEquals(s1.would_queue, [o1.id, o3.id]);
    assertEquals(s1.would_review, [r1.id, r2.id], "no passthrough, no upload id: for review");
    assertEquals(listCalls(), ["/video/v1/assets?limit=100&page=1", "/video/v1/assets?limit=100&page=2", "/video/v1/assets?limit=100&page=3"]);
    assertEquals(mutations(), []);
    assertEquals([...(await jobs(o1.id)), ...(await jobs(r1.id))], [], "nothing queued in a dry run");
    await setMode("live");
    // 2. Page 2 fails: only page 1 is judged.
    let n = 0;
    fault = (method, path) => method === "GET" && path === "/video/v1/assets" && ++n === 2 ? Response.json({ error: { type: "server" } }, { status: 500 }) : null;
    const s2 = await sweepNow();
    fault = () => null;
    assertEquals([s2.listed, s2.complete, s2.listError, s2.queued, s2.review, s2.held], [100, false, "mux_500", 1, 0, 1]);
    assertEquals((await jobs(o1.id)).map((j) => j.reason), ["orphan"], "the page-1 orphan is queued");
    assertEquals([...(await jobs(o3.id)), ...(await jobs(r1.id)), ...(await jobs(r2.id))], [], "nothing beyond the failed page is judged");
    // 3. Complete again: the rest is judged; the page-1 orphan is not queued twice.
    const s3 = await sweepNow();
    assertEquals([s3.listed, s3.complete, s3.queued, s3.review, s3.held], [230, true, 1, 2, 1]);
    assertEquals((await jobs(o1.id)).length, 1);
    assertEquals((await jobs(r1.id)).map((j) => j.status), ["review"]);
    // 4. Again: nothing new, one job per asset.
    const s4 = await sweepNow();
    assertEquals([s4.queued, s4.review, s4.held, s4.unresolved], [0, 0, 1, undefined]);
    assertEquals([(await jobs(o1.id)).length, (await jobs(o3.id)).length, (await jobs(r1.id)).length, (await jobs(r2.id)).length, (await jobs(h.asset.id)).length], [1, 1, 1, 1, 2]);
    // 5. O1 turns out not to be Hal's at Mux: its deletion fails for a person; O3 is deleted.
    o1.passthrough = "someone-else";
    await drainAll();
    assert(!assets.has(o3.id), "the proven orphan is deleted");
    assert(assets.has(o1.id) && assets.has(r1.id) && assets.has(r2.id) && assets.has(h.asset.id), "the rest untouched");
    const [failed] = await jobs(o1.id);
    assertEquals([failed.status, failed.last_error], ["failed", "passthrough_mismatch"]);
    // 6. Daily sweeps leave the failure alone (counted, still listed), and never queue it again.
    for (let i = 0; i < 2; i++) {
      const s = await sweepNow();
      assertEquals([s.unresolved, s.queued, s.review, s.held], [1, 0, 0, 1]);
    }
    assertEquals((await jobs(o1.id)).length, 1, "no duplicate job");
    const overview = await service("mux_cleanup_overview") as { failed: { asset_id: string }[] };
    assert(overview.failed.some((f) => f.asset_id === o1.id), "still listed for a person");
    const health = await service("mux_cleanup_health") as { status: string; problems: { check: string }[] };
    assertEquals(health.status, "alert");
    assert(health.problems.some((p) => p.check === "failed_jobs"), JSON.stringify(health.problems));
    // 7. Resolved and retried: one job, and the next drain deletes it.
    o1.passthrough = hal.id;
    await service("mux_cleanup_retry", { p_job: failed.id });
    const s7 = await sweepNow();
    assertEquals([s7.unresolved, s7.queued], [undefined, 0]);
    assertEquals((await jobs(o1.id)).length, 1);
    await drainAll();
    assert(!assets.has(o1.id), "deleted once resolved");
    assertEquals([destructive(r1.id), destructive(r2.id), destructive(h.asset.id)], [[], [], []], "review and held assets never changed");
  } finally {
    fault = () => null;
    await setMode("live");
    assets.clear();
    for (const [k, a] of saved) assets.set(k, a);
  }
});

// ---------------------------------------------------------------------------
Deno.test("cleanup: remove the test members, their rows and the prompts", async () => {
  // Replies first (they reference their root), then tombstones, then everything else.
  for (const m of members) await http(`/rest/v1/responses?author_id=eq.${m.id}&kind=eq.reply`, { method: "DELETE" });
  await http(`/rest/v1/responses?author_id=is.null&kind=eq.reply&prompt_id=in.(${promptIds.join(",")})`, { method: "DELETE" });
  await http(`/rest/v1/responses?author_id=is.null&prompt_id=in.(${promptIds.join(",")})`, { method: "DELETE" });
  for (const m of members) {
    await http(`/rest/v1/responses?author_id=eq.${m.id}`, { method: "DELETE" });
    await http(`/rest/v1/profiles?id=eq.${m.id}`, { method: "DELETE" });
    await http(`/auth/v1/admin/users/${m.id}`, { method: "DELETE" });
  }
  await http(`/rest/v1/prompts?id=in.(${promptIds.join(",")})`, { method: "DELETE" });
  await setMode("off");
  // This run's open jobs (the 30-day retentions) are closed so they never act on a later run.
  await http(`/rest/v1/mux_cleanup_jobs?status=in.(pending,running,review)&or=(asset_id.like.*${run}*,upload_id.like.*${run}*)`, {
    method: "PATCH", body: { status: "skipped", lease_id: null, locked_until: null, result: { outcome: "test_cleanup" } },
  });
});
