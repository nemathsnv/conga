// Integration tests for security stage 1 (F1, F3, F12, F13) against a LOCAL Supabase stack:
// real Auth sessions, PostgREST and RLS; the mux-upload-status and mux-webhook handlers run
// in-process. Mux is never contacted: api.mux.com and stream.mux.com are answered by a stub, and
// any other non-local host throws. Refuses to run unless SUPABASE_URL is 127.0.0.1 or localhost.
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test --allow-env --allow-net supabase/functions/_tests/integration_test.ts
import { assert, assertEquals } from "./assert.ts";
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

// ---------------------------------------------------------------------------
// Mux stub
type MuxReply = { status?: number; body: unknown };
const muxCalls: string[] = [];
let muxRoutes: Record<string, MuxReply> = {};
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === "api.mux.com" || url.hostname === "stream.mux.com") {
    muxCalls.push(url.toString());
    if (url.hostname === "stream.mux.com") return Promise.resolve(new Response("#EXTM3U\n"));
    const r = muxRoutes[url.pathname];
    return Promise.resolve(r ? Response.json(r.body, { status: r.status ?? 200 }) : Response.json({ error: "stub: no route" }, { status: 404 }));
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error(`test fetch to ${url.hostname} blocked`);
  return realFetch(input, init);
}) as typeof fetch;
function resetMux(routes: Record<string, MuxReply> = {}) {
  muxCalls.length = 0;
  muxRoutes = routes;
}

// ---------------------------------------------------------------------------
// Local stack helpers
const run = Date.now().toString(36);
const ids = (name: string) => `${name}${run}`.replace(/[^A-Za-z0-9]/g, "");

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

async function member(name: string): Promise<{ id: string; token: string }> {
  const email = `sec1-${run}-${name}@example.com`;
  const created = await http("/auth/v1/admin/users", { method: "POST", body: { email, email_confirm: true } });
  assertEquals(created.status, 200, `create ${name}`);
  const id = (created.json as { id: string }).id;
  // An email code, as the app signs in, without sending an email.
  const link = await http("/auth/v1/admin/generate_link", { method: "POST", body: { type: "magiclink", email } });
  const otp = (link.json as { email_otp: string }).email_otp;
  const verified = await http("/auth/v1/verify", { method: "POST", key: ANON, body: { type: "email", email, token: otp } });
  assertEquals(verified.status, 200, `sign in ${name}`);
  const p = await http("/rest/v1/profiles", { method: "POST", body: { id, name, username: `s1${name}${run}`.slice(0, 20) } });
  assertEquals(p.status, 201, `profile ${name}`);
  return { id, token: (verified.json as { access_token: string }).access_token };
}

async function row(uploadId: string) {
  const r = await http(`/rest/v1/responses?mux_upload_id=eq.${uploadId}&select=id,status,author_id,mux_asset_id,mux_playback_id,duration_ms`);
  return (r.json as Record<string, unknown>[])[0];
}

function statusRequest(uploadId: string | null, token?: string): Request {
  const url = new URL("http://localhost/functions/v1/mux-upload-status");
  if (uploadId !== null) url.searchParams.set("uploadId", uploadId);
  return new Request(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

async function call(req: Request) {
  const res = await handleUploadStatus(req);
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Fixtures: Lena and Adam, three prompts, responses in processing and live.
const lena = await member("lena");
const adam = await member("adam");
const prompts = await http("/rest/v1/prompts?select=id", {
  method: "POST", prefer: "return=representation",
  body: [1, 2, 3, 4].map((n) => ({ text: `Security stage 1 test prompt ${n} ${run}`, status: "live", published_at: new Date().toISOString() })),
});
assertEquals(prompts.status, 201, "prompts");
const [p1, p2, p3, p4] = (prompts.json as { id: string }[]).map((p) => p.id);

const U = {
  lenaProc: ids("upLenaProc"), lenaProcHostile: ids("upLenaHostile"), lenaWaiting: ids("upLenaWait"), lenaLive: ids("upLenaLive"),
  adamProc: ids("upAdamProc"), adamLive: ids("upAdamLive"), adamWebhookBad: ids("upAdamBadSig"),
};
const blank = { mux_asset_id: null, mux_playback_id: null, live_at: null };
const inserted = await http("/rest/v1/responses", {
  method: "POST",
  body: [
    { prompt_id: p1, author_id: lena.id, duration_ms: 9000, status: "processing", mux_upload_id: U.lenaProc },
    { prompt_id: p2, author_id: lena.id, duration_ms: 9000, status: "processing", mux_upload_id: U.lenaProcHostile },
    { prompt_id: p3, author_id: lena.id, duration_ms: 9000, status: "processing", mux_upload_id: U.lenaWaiting },
    { prompt_id: p4, author_id: lena.id, duration_ms: 9000, status: "live", mux_upload_id: U.lenaLive, mux_asset_id: ids("asLenaLive"), mux_playback_id: ids("pbLenaLive"), live_at: new Date().toISOString() },
    { prompt_id: p1, author_id: adam.id, duration_ms: 9000, status: "processing", mux_upload_id: U.adamProc },
    { prompt_id: p2, author_id: adam.id, duration_ms: 9000, status: "live", mux_upload_id: U.adamLive, mux_asset_id: ids("asAdamLive"), mux_playback_id: ids("pbAdamLive"), live_at: new Date().toISOString() },
    { prompt_id: p3, author_id: adam.id, duration_ms: 9000, status: "processing", mux_upload_id: U.adamWebhookBad },
  ].map((r) => ({ ...blank, ...r })),
});
assertEquals(inserted.status, 201, "responses");

// ---------------------------------------------------------------------------
// F1 over HTTP: the REST API serves members only their own rows.
Deno.test("F1: GET /rest/v1/responses returns only the caller's own rows", async () => {
  const r = await http("/rest/v1/responses?select=author_id,mux_upload_id", { key: ANON, token: adam.token });
  assertEquals(r.status, 200);
  const rows = r.json as { author_id: string; mux_upload_id: string }[];
  assertEquals(rows.length, 3, "Adam's three rows");
  assert(rows.every((x) => x.author_id === adam.id), "no one else's rows");
});

Deno.test("F1: another member's live response is not readable by upload id or id", async () => {
  const byUpload = await http(`/rest/v1/responses?mux_upload_id=eq.${U.lenaLive}&select=id`, { key: ANON, token: adam.token });
  assertEquals(byUpload.json, []);
  const lenaLiveId = (await row(U.lenaLive)).id as string;
  const byId = await http(`/rest/v1/responses?id=eq.${lenaLiveId}&select=id,mux_asset_id`, { key: ANON, token: adam.token });
  assertEquals(byId.json, []);
});

Deno.test("F1: anon reads no responses", async () => {
  const r = await http("/rest/v1/responses?select=id", { key: ANON });
  assertEquals(r.json, []);
});

Deno.test("F1: get_response still serves another member's live response", async () => {
  const lenaLiveId = (await row(U.lenaLive)).id as string;
  const r = await http("/rest/v1/rpc/get_response", { method: "POST", key: ANON, token: adam.token, body: { p_id: lenaLiveId } });
  assertEquals(r.status, 200);
  assertEquals((r.json as { playback_id: string }).playback_id, ids("pbLenaLive"));
});

// ---------------------------------------------------------------------------
// mux-upload-status: authentication, F3 and F13.
Deno.test("status: no token or a bad token is 401, before any Mux call", async () => {
  resetMux();
  assertEquals((await call(statusRequest(U.lenaProc))).status, 401);
  assertEquals((await call(statusRequest(U.lenaProc, "not-a-jwt"))).status, 401);
  assertEquals((await call(statusRequest(U.lenaProc, ANON))).status, 401);
  assertEquals(muxCalls, []);
});

Deno.test("status: a missing upload id is 400", async () => {
  assertEquals((await call(statusRequest(null, lena.token))).status, 400);
});

Deno.test("F3: a malformed upload id is 400 invalid_upload_id, before the database and Mux", async () => {
  resetMux({ "/video/v1/assets/x": { body: { data: { id: "x", status: "ready" } } } });
  for (const id of ["../assets/x", `${U.lenaProc}/../../assets/x`, `${U.lenaProc}?limit=100`, `${U.lenaProc}#x`, `${U.lenaProc}%2F..`, "..", "a/b", "a b", "", "a".repeat(129), `${U.lenaProc}-x`]) {
    const r = await call(statusRequest(id, lena.token));
    assertEquals(r.status, 400, JSON.stringify(id));
    if (id !== "") assertEquals(r.json.error, "invalid_upload_id", JSON.stringify(id));
  }
  assertEquals(muxCalls, []);
});

Deno.test("F13: another member's processing upload is 404, with no Mux call and no change", async () => {
  resetMux({ [`/video/v1/uploads/${U.adamProc}`]: { body: { data: { id: U.adamProc, status: "asset_created", asset_id: "asX" } } } });
  const r = await call(statusRequest(U.adamProc, lena.token));
  assertEquals(r.status, 404);
  assertEquals(muxCalls, []);
  assertEquals((await row(U.adamProc)).status, "processing");
});

Deno.test("F13: another member's live upload is 404 and reveals nothing", async () => {
  resetMux();
  const r = await call(statusRequest(U.adamLive, lena.token));
  assertEquals(r.status, 404);
  assertEquals(r.json, { error: "not_found" });
  assertEquals(muxCalls, []);
});

Deno.test("status: the caller's own live response answers from the database, without Mux", async () => {
  resetMux();
  const r = await call(statusRequest(U.lenaLive, lena.token));
  assertEquals(r.status, 200);
  assertEquals(r.json, { uploadStatus: "asset_created", assetStatus: "ready", playbackId: ids("pbLenaLive"), responseStatus: "live" });
  assertEquals(muxCalls, []);
});

Deno.test("status: the caller's own upload still waiting at Mux stays processing", async () => {
  resetMux({ [`/video/v1/uploads/${U.lenaWaiting}`]: { body: { data: { id: U.lenaWaiting, status: "waiting" } } } });
  const r = await call(statusRequest(U.lenaWaiting, lena.token));
  assertEquals(r.status, 200);
  assertEquals(r.json.uploadStatus, "waiting");
  assertEquals(r.json.responseStatus, "processing");
  assertEquals(muxCalls, [`https://api.mux.com/video/v1/uploads/${U.lenaWaiting}`]);
});

Deno.test("status: the caller's own ready upload goes live (the verified iPhone path)", async () => {
  const asset = ids("asLenaProc"), playback = ids("pbLenaProc");
  resetMux({
    [`/video/v1/uploads/${U.lenaProc}`]: { body: { data: { id: U.lenaProc, status: "asset_created", asset_id: asset } } },
    [`/video/v1/assets/${asset}`]: { body: { data: { id: asset, status: "ready", duration: 9.911, playback_ids: [{ id: playback, policy: "public" }] } } },
  });
  const r = await call(statusRequest(U.lenaProc, lena.token));
  assertEquals(r.status, 200);
  assertEquals(r.json.responseStatus, "live");
  assertEquals(r.json.playbackId, playback);
  assertEquals(muxCalls.slice(0, 3), [
    `https://api.mux.com/video/v1/uploads/${U.lenaProc}`,
    `https://api.mux.com/video/v1/assets/${asset}`,
    `https://stream.mux.com/${playback}.m3u8`,
  ]);
  const after = await row(U.lenaProc);
  assertEquals([after.status, after.mux_asset_id, after.mux_playback_id, after.duration_ms], ["live", asset, playback, 9911]);
});

Deno.test("F3: a hostile asset id from Mux is never put into a URL", async () => {
  resetMux({ [`/video/v1/uploads/${U.lenaProcHostile}`]: { body: { data: { id: U.lenaProcHostile, status: "asset_created", asset_id: `../uploads/${U.adamProc}` } } } });
  const r = await call(statusRequest(U.lenaProcHostile, lena.token));
  assertEquals(r.status, 502);
  assertEquals(muxCalls, [`https://api.mux.com/video/v1/uploads/${U.lenaProcHostile}`]);
  assertEquals((await row(U.lenaProcHostile)).status, "processing");
  assertEquals((await row(U.adamProc)).status, "processing");
});

// ---------------------------------------------------------------------------
// mux-webhook: F12 end to end.
async function signed(body: string, secret = WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("http://localhost/functions/v1/mux-webhook", { method: "POST", body, headers: { "Mux-Signature": `t=${t},v1=${hex}` } });
}
const readyEvent = (uploadId: string, asset: string, playback: string) =>
  JSON.stringify({ type: "video.asset.ready", data: { id: asset, upload_id: uploadId, status: "ready", duration: 12.5, playback_ids: [{ id: playback, policy: "public" }] } });

Deno.test("F12: a webhook signed with the wrong secret is 401 and changes nothing", async () => {
  resetMux();
  const res = await handleMuxWebhook(await signed(readyEvent(U.adamWebhookBad, ids("asBad"), ids("pbBad")), "wrong-secret"));
  assertEquals(res.status, 401);
  await res.body?.cancel();
  assertEquals((await row(U.adamWebhookBad)).status, "processing");
  assertEquals(muxCalls, []);
});

Deno.test("F12: a stale correctly signed webhook is 401", async () => {
  const res = await handleMuxWebhook(await signed(readyEvent(U.adamWebhookBad, ids("asBad"), ids("pbBad")), WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 301));
  assertEquals(res.status, 401);
  await res.body?.cancel();
  assertEquals((await row(U.adamWebhookBad)).status, "processing");
});

Deno.test("F12: GET is 405", async () => {
  const res = await handleMuxWebhook(new Request("http://localhost/functions/v1/mux-webhook"));
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test("webhook: a correctly signed video.asset.ready makes the response live", async () => {
  resetMux();
  const asset = ids("asAdamProc"), playback = ids("pbAdamProc");
  const res = await handleMuxWebhook(await signed(readyEvent(U.adamProc, asset, playback)));
  assertEquals(res.status, 200);
  assertEquals(((await res.json()) as { response: { status: string } }).response.status, "live");
  const after = await row(U.adamProc);
  assertEquals([after.status, after.mux_asset_id, after.mux_playback_id, after.duration_ms], ["live", asset, playback, 12500]);
  assertEquals(muxCalls[0], `https://stream.mux.com/${playback}.m3u8`);
});

Deno.test("webhook: other signed event types are acknowledged and ignored", async () => {
  const res = await handleMuxWebhook(await signed(JSON.stringify({ type: "video.upload.created", data: { id: "x" } })));
  assertEquals(res.status, 200);
  assertEquals(((await res.json()) as { ignored: string }).ignored, "video.upload.created");
});

// ---------------------------------------------------------------------------
Deno.test("cleanup: remove the test members, their rows and the prompts", async () => {
  for (const m of [lena, adam]) {
    await http(`/rest/v1/responses?author_id=eq.${m.id}`, { method: "DELETE" });
    await http(`/rest/v1/profiles?id=eq.${m.id}`, { method: "DELETE" });
    assertEquals((await http(`/auth/v1/admin/users/${m.id}`, { method: "DELETE" })).status, 200);
  }
  await http(`/rest/v1/prompts?id=in.(${[p1, p2, p3, p4].join(",")})`, { method: "DELETE" });
});
