// Integration tests for posting idempotency (20261013000200) against a LOCAL Supabase stack: real
// Auth sessions, PostgREST and separate transactions per request, so concurrent attempts of one
// submission really race. mux-upload-status and mux-webhook run in-process; Mux is never contacted
// (api.mux.com and stream.mux.com are answered by a stub; any other non-local host throws).
// Refuses to run unless SUPABASE_URL is 127.0.0.1 or localhost.
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... DB_CONTAINER=supabase_db_<project> \
//     deno test --allow-env --allow-net --allow-run supabase/functions/_tests/idempotency_integration_test.ts
//
// DB_CONTAINER lets one test hold a post's transaction open (psql in the database container), so a
// second attempt really arrives while the first is uncommitted. Without it that test is reported
// as ignored, not passed.
import { assert, assertEquals } from "./assert.ts";
import { handleUploadStatus } from "../mux-upload-status/handler.ts";
import { handleMuxWebhook } from "../mux-webhook/handler.ts";
import { handleAbandonSubmission } from "../abandon-submission/handler.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!API || !ANON || !SERVICE) throw new Error("set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY for the local stack");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error(`refusing to run against ${new URL(API).hostname}: local stack only`);

Deno.env.set("MUX_TOKEN_ID", "local-test-id");
Deno.env.set("MUX_TOKEN_SECRET", "local-test-secret");
const WEBHOOK_SECRET = "local-test-webhook-secret";
Deno.env.set("MUX_WEBHOOK_SECRET", WEBHOOK_SECRET);

const run = Date.now().toString(36);
const DB_CONTAINER = Deno.env.get("DB_CONTAINER") ?? "";

// Mux stub: an upload has an asset once the test says so.
const muxAssets = new Map<string, { id: string; playback: string; passthrough: string }>();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname === "stream.mux.com") return new Response("#EXTM3U\n");
  if (url.hostname === "api.mux.com") {
    // abandon-submission cancels an upload Mux reports waiting.
    const cancelled = url.pathname.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)\/cancel$/)?.[1];
    if (cancelled && init?.method === "PUT") return Response.json({ data: { id: cancelled, status: "cancelled" } });
    const upload = url.pathname.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)$/)?.[1];
    if (upload) {
      const a = muxAssets.get(upload);
      return Response.json({ data: { id: upload, status: a ? "asset_created" : "waiting", asset_id: a?.id } });
    }
    const asset = url.pathname.match(/^\/video\/v1\/assets\/([A-Za-z0-9]+)$/)?.[1];
    const found = [...muxAssets.values()].find((a) => a.id === asset);
    if (found) return Response.json({ data: { id: found.id, status: "ready", duration: 9.5, passthrough: found.passthrough, playback_ids: [{ id: found.playback, policy: "public" }] } });
    return Response.json({ error: "stub: no route" }, { status: 404 });
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error(`test fetch to ${url.hostname} blocked`);
  return realFetch(input, init);
}) as typeof fetch;

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
async function member(name: string): Promise<Member> {
  const email = `idem-${run}-${name}@example.com`;
  const created = await http("/auth/v1/admin/users", { method: "POST", body: { email, email_confirm: true } });
  assertEquals(created.status, 200, `create ${name}`);
  const id = (created.json as { id: string }).id;
  const link = await http("/auth/v1/admin/generate_link", { method: "POST", body: { type: "magiclink", email } });
  const otp = (link.json as { email_otp: string }).email_otp;
  const verified = await http("/auth/v1/verify", { method: "POST", key: ANON, body: { type: "email", email, token: otp } });
  assertEquals(verified.status, 200, `sign in ${name}`);
  assertEquals((await http("/rest/v1/profiles", { method: "POST", body: { id, name, username: `id${name}${run}`.slice(0, 24) } })).status, 201, `profile ${name}`);
  const now = new Date().toISOString();
  assertEquals((await http(`/rest/v1/accounts?id=eq.${id}`, { method: "PATCH", body: { age_confirmed_at: now, public_disclosure_ack_at: now } })).status, 204);
  const m = { id, token: (verified.json as { access_token: string }).access_token };
  members.push(m);
  return m;
}
let uploadSeq = 0;
/** An unused upload URL minted for the member (written as the service role, as mux-create-upload would). */
async function upload(m: Member): Promise<string> {
  const id = `upidem${run}n${++uploadSeq}`;
  assertEquals((await http("/rest/v1/video_uploads", { method: "POST", body: { account_id: m.id, upload_id: id, status: "active" } })).status, 201, "upload");
  return id;
}
async function rpc(m: Member | null, fn: string, body: Record<string, unknown>) {
  const r = await http(`/rest/v1/rpc/${fn}`, { method: "POST", key: ANON, token: m?.token ?? ANON, body });
  return { status: r.status, json: r.json as Record<string, unknown>, error: (r.json as { message?: string })?.message ?? null };
}
const postResponse = (m: Member, prompt: string, u: string, submission?: string, caption: string | null = null) =>
  rpc(m, "post_response", { p_prompt: prompt, p_upload_id: u, p_caption: caption, p_duration_ms: 9000, ...(submission ? { p_submission: submission } : {}) });
const postReply = (m: Member, to: string, u: string, submission?: string) =>
  rpc(m, "post_reply", { p_reply_to: to, p_upload_id: u, p_caption: null, p_duration_ms: 9000, ...(submission ? { p_submission: submission } : {}) });
const postDraft = (m: Member, suggestion: string, u: string, submission?: string) =>
  rpc(m, "post_draft", { p_suggestion: suggestion, p_upload_id: u, p_caption: null, p_duration_ms: 9000, ...(submission ? { p_submission: submission } : {}) });
/** Discard through abandon-submission (in-process; Mux stubbed above), as the app does. */
async function abandon(m: Member | null, submission: string) {
  const res = await handleAbandonSubmission(new Request("http://localhost/functions/v1/abandon-submission", {
    method: "POST", headers: { ...(m ? { Authorization: `Bearer ${m.token}` } : {}), "Content-Type": "application/json" }, body: JSON.stringify({ submissionId: submission }),
  }));
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}

async function rows(query: string) {
  return (await http(`/rest/v1/responses?${query}&select=id,status,kind,mux_upload_id`)).json as { id: string; status: string; kind: string; mux_upload_id: string }[];
}
async function ledgerRow(u: string) {
  return ((await http(`/rest/v1/video_uploads?upload_id=eq.${u}&select=status,response_id`)).json as { status: string; response_id: string | null }[])[0];
}
async function submissions(id: string) {
  return (await http(`/rest/v1/post_submissions?id=eq.${id}&select=account_id,response_id,upload_id`)).json as { account_id: string; response_id: string; upload_id: string }[];
}
async function signed(body: string, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("http://localhost/functions/v1/mux-webhook", { method: "POST", body, headers: { "Mux-Signature": `t=${t},v1=${hex}` } });
}

// Fixtures: prompts, a live video to reply to, a suggestion for drafts.
const prompts = await http("/rest/v1/prompts?select=id", {
  method: "POST", prefer: "return=representation",
  body: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ text: `Idempotency test prompt ${n} ${run}`, status: "live", published_at: new Date().toISOString() })),
});
assertEquals(prompts.status, 201, "prompts");
const P = (prompts.json as { id: string }[]).map((p) => p.id);
const lena = await member("lena");
const adam = await member("adam");
const target = (await http("/rest/v1/responses?select=id", {
  method: "POST", prefer: "return=representation",
  body: { prompt_id: P[0], author_id: adam.id, duration_ms: 9000, status: "live", mux_upload_id: `upidemlive${run}`, mux_asset_id: `asidemlive${run}`, mux_playback_id: `pbidemlive${run}`, live_at: new Date().toISOString() },
})).json as { id: string }[];
const liveVideo = target[0].id;
const suggestion = ((await http("/rest/v1/suggestions?select=id", { method: "POST", prefer: "return=representation", body: { author_id: lena.id, text: `Idempotency suggestion ${run}` } })).json as { id: string }[])[0].id;

// ---------------------------------------------------------------------------
Deno.test("lost answer: the same post_response again returns the same row; old clients get the old answers", async () => {
  const u = await upload(lena);
  const s = crypto.randomUUID();
  const first = await postResponse(lena, P[1], u, s);
  assertEquals(first.status, 200, String(first.error));
  // The answer is lost; the app sends the same request again (after a restart, from the stored post).
  const again = await postResponse(lena, P[1], u, s);
  assertEquals([again.status, again.json.id, again.json.replayed], [200, first.json.id, true]);
  assertEquals((await rows(`author_id=eq.${lena.id}&prompt_id=eq.${P[1]}`)).length, 1, "one row");
  assertEquals(await ledgerRow(u), { status: "claimed", response_id: first.json.id as string });
  // A build without submissions calls with four named arguments and gets exactly the old answers.
  const old = await postResponse(lena, P[1], u);
  assertEquals([old.status, old.error], [400, "already_responded"]);
  const oldOther = await postResponse(lena, P[2], u);
  assertEquals([oldOther.status, oldOther.error], [400, "upload_already_used"]);
});

Deno.test("concurrency: six simultaneous attempts of one post_response submission make one row, and all six get it", async () => {
  const u = await upload(lena);
  const s = crypto.randomUUID();
  const results = await Promise.all(Array.from({ length: 6 }, () => postResponse(lena, P[3], u, s)));
  assertEquals(results.map((r) => r.status), [200, 200, 200, 200, 200, 200], JSON.stringify(results.map((r) => r.error)));
  assertEquals(new Set(results.map((r) => r.json.id)).size, 1, "the same row for every attempt");
  assertEquals(results.filter((r) => r.json.replayed === true).length, 5, "five replays");
  assertEquals((await rows(`author_id=eq.${lena.id}&prompt_id=eq.${P[3]}`)).length, 1);
  assertEquals((await submissions(s)).length, 1);
});

Deno.test({
  name: "concurrency: a second attempt arriving while the first is still uncommitted waits for it and gets its row",
  ignore: !DB_CONTAINER,
  fn: async () => {
    const u = await upload(lena);
    const s = crypto.randomUUID();
    // The first attempt, held open for 1.5 s after posting (as a slow network or database would).
    const held = new Deno.Command("docker", {
      args: ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
      stdin: "piped", stdout: "piped", stderr: "piped",
    }).spawn();
    const w = held.stdin.getWriter();
    await w.write(new TextEncoder().encode(`begin;
select set_config('request.jwt.claims', json_build_object('sub', '${lena.id}', 'role', 'authenticated')::text, true);
set local role authenticated;
select (public.post_response('${P[6]}', '${u}', null, 9000, '${s}'))->>'id';
select pg_sleep(1.5);
commit;
`));
    await w.close();
    await new Promise((r) => setTimeout(r, 500));
    const t0 = Date.now();
    const second = await postResponse(lena, P[6], u, s);
    const waited = Date.now() - t0;
    const out = await held.output();
    assertEquals(out.code, 0, new TextDecoder().decode(out.stderr));
    const firstId = new TextDecoder().decode(out.stdout).split("\n").find((l) => /^[0-9a-f-]{36}$/.test(l));
    assertEquals([second.status, second.error], [200, null], "not upload_already_used or already_responded");
    assertEquals([second.json.id, second.json.replayed], [firstId, true]);
    assert(waited >= 700, `the second attempt waited for the first (${waited} ms)`);
    assertEquals((await rows(`author_id=eq.${lena.id}&prompt_id=eq.${P[6]}`)).length, 1);
  },
});

Deno.test("concurrency: six simultaneous attempts of one video reply make one reply", async () => {
  const u = await upload(lena);
  const s = crypto.randomUUID();
  const results = await Promise.all(Array.from({ length: 6 }, () => postReply(lena, liveVideo, u, s)));
  assertEquals(results.map((r) => r.status), [200, 200, 200, 200, 200, 200], JSON.stringify(results.map((r) => r.error)));
  assertEquals(new Set(results.map((r) => r.json.id)).size, 1);
  assertEquals((await rows(`author_id=eq.${lena.id}&kind=eq.reply&mux_upload_id=eq.${u}`)).length, 1, "one reply, not six");
});

Deno.test("concurrency: six different submissions racing for one upload: exactly one wins, as before", async () => {
  const u = await upload(lena);
  const results = await Promise.all(Array.from({ length: 6 }, () => postReply(lena, liveVideo, u, crypto.randomUUID())));
  assertEquals(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results.map((r) => r.error)));
  assertEquals(results.filter((r) => r.error === "upload_already_used").length, 5);
  assertEquals((await rows(`mux_upload_id=eq.${u}`)).length, 1, "the upload is on one row");
});

Deno.test("concurrency: six simultaneous attempts of one draft make one draft and never replace it", async () => {
  const u = await upload(lena);
  const s = crypto.randomUUID();
  const results = await Promise.all(Array.from({ length: 6 }, () => postDraft(lena, suggestion, u, s)));
  assertEquals(results.map((r) => r.status), [200, 200, 200, 200, 200, 200], JSON.stringify(results.map((r) => r.error)));
  assertEquals(new Set(results.map((r) => r.json.id)).size, 1);
  const drafts = await rows(`author_id=eq.${lena.id}&suggestion_id=eq.${suggestion}`);
  assertEquals(drafts.map((d) => d.status), ["draft"], "one draft, none deleted");
});

Deno.test("ownership: another member reusing a submission id gets submission_conflict, no row, and their upload stays usable", async () => {
  const u = await upload(lena);
  const s = crypto.randomUUID();
  const mine = await postResponse(lena, P[4], u, s);
  assertEquals(mine.status, 200);
  const theirs = await upload(adam);
  for (const attempt of [await postResponse(adam, P[4], u, s), await postResponse(adam, P[4], theirs, s), await postReply(adam, liveVideo, theirs, s)]) {
    assertEquals([attempt.status, attempt.error], [400, "submission_conflict"]);
    assert(!JSON.stringify(attempt.json).includes(String(mine.json.id)), "nothing of Lena's row is returned");
  }
  assertEquals((await ledgerRow(theirs)).status, "active");
  assertEquals((await abandon(adam, s)).json, { outcome: "not_found" });
  assertEquals((await rows(`id=eq.${mine.json.id}`))[0].status, "processing");
  // Signed out (the anon key) cannot post or abandon at all.
  assertEquals((await rpc(null, "post_response", { p_prompt: P[4], p_upload_id: u, p_caption: null, p_duration_ms: 9000, p_submission: s })).status, 401);
  assertEquals((await abandon(null, s)).status, 401);
  // The database-only abandon_submission is gone: no API role can reach it.
  assertEquals((await rpc(lena, "abandon_submission", { p_submission: s })).status, 404);
});

Deno.test("a changed request with the same id is refused: caption, duration, upload, target", async () => {
  const u = await upload(lena);
  const s = crypto.randomUUID();
  assertEquals((await postResponse(lena, P[5], u, s, "first")).status, 200);
  const other = await upload(lena);
  for (const r of [
    await postResponse(lena, P[5], u, s, "second"),
    await rpc(lena, "post_response", { p_prompt: P[5], p_upload_id: u, p_caption: "first", p_duration_ms: 8000, p_submission: s }),
    await postResponse(lena, P[5], other, s, "first"),
    await postResponse(lena, P[6], u, s, "first"),
  ]) assertEquals([r.status, r.error], [400, "submission_conflict"]);
  assertEquals((await ledgerRow(other)).status, "active", "no upload is claimed by a refused attempt");
});

Deno.test("end to end: post, a replay, Mux ready, live; a replay after that still returns the same video", async () => {
  const fresh = await member("maya");
  const u = await upload(fresh);
  const s = crypto.randomUUID();
  const first = await postResponse(fresh, P[1], u, s);
  assertEquals(first.status, 200);
  assertEquals((await postResponse(fresh, P[1], u, s)).json.id, first.json.id);
  muxAssets.set(u, { id: `asidem${run}`, playback: `pbidem${run}`, passthrough: fresh.id });
  const event = JSON.stringify({ type: "video.asset.ready", data: { id: `asidem${run}`, upload_id: u, status: "ready", duration: 9.5, playback_ids: [{ id: `pbidem${run}`, policy: "public" }], passthrough: fresh.id } });
  const hook = await handleMuxWebhook(await signed(event));
  assertEquals(hook.status, 200);
  await hook.body?.cancel();
  const url = new URL("http://localhost/functions/v1/mux-upload-status");
  url.searchParams.set("uploadId", u);
  const st = await handleUploadStatus(new Request(url, { headers: { Authorization: `Bearer ${fresh.token}` } }));
  assertEquals((await st.json()).responseStatus, "live");
  const late = await postResponse(fresh, P[1], u, s);
  assertEquals([late.status, late.json.id, late.json.status], [200, first.json.id, "live"]);
  assertEquals((await abandon(fresh, s)).json, { outcome: "kept", reason: "live", responseId: first.json.id }, "a live video is never abandoned");
  assertEquals((await rows(`id=eq.${first.json.id}`))[0].status, "live");
});

Deno.test("concurrency: a replay racing a discard ends in a consistent order", async () => {
  const fresh = await member("nico");
  const u = await upload(fresh);
  const s = crypto.randomUUID();
  const first = await postResponse(fresh, P[2], u, s);
  assertEquals(first.status, 200);
  const [replay, gone] = await Promise.all([postResponse(fresh, P[2], u, s), abandon(fresh, s)]);
  const row = (await rows(`id=eq.${first.json.id}`))[0];
  assertEquals(gone.json, { outcome: "abandoned", reason: "cancelled" }, "Mux had nothing (waiting): cancelled, then abandoned");
  assertEquals(row.status, "deleted");
  // The replay ran before (it got the row, then abandoned), during the Mux check (busy), or after (closed).
  assert((replay.status === 200 && replay.json.id === first.json.id) || replay.error === "submission_busy" || replay.error === "submission_closed", JSON.stringify(replay));
  // The prompt is free for the next recording.
  assertEquals((await postResponse(fresh, P[2], await upload(fresh), crypto.randomUUID())).status, 200);
});

Deno.test("retry_response_upload repeated after a lost answer changes nothing", async () => {
  const fresh = await member("omar");
  const u = await upload(fresh);
  const first = await postResponse(fresh, P[3], u, crypto.randomUUID());
  const next = await upload(fresh);
  assertEquals((await rpc(fresh, "retry_response_upload", { p_response: first.json.id, p_upload_id: next })).status, 204);
  const jobs = async () => ((await http(`/rest/v1/mux_cleanup_jobs?upload_id=eq.${u}&select=id`)).json as unknown[]).length;
  const before = await jobs();
  const again = await rpc(fresh, "retry_response_upload", { p_response: first.json.id, p_upload_id: next });
  assertEquals([again.status, again.error], [204, null]);
  assertEquals(await jobs(), before, "no second cancellation queued");
  assertEquals((await rows(`id=eq.${first.json.id}`))[0].mux_upload_id, next);
});

// ---------------------------------------------------------------------------
Deno.test("cleanup: remove the test members, their rows and the fixtures", async () => {
  for (const m of members) await http(`/rest/v1/responses?author_id=eq.${m.id}&kind=eq.reply`, { method: "DELETE" });
  for (const m of members) {
    await http(`/rest/v1/responses?author_id=eq.${m.id}`, { method: "DELETE" });
    await http(`/rest/v1/suggestions?author_id=eq.${m.id}`, { method: "DELETE" });
    await http(`/rest/v1/profiles?id=eq.${m.id}`, { method: "DELETE" });
    assertEquals((await http(`/auth/v1/admin/users/${m.id}`, { method: "DELETE" })).status, 200);
    assertEquals((await http(`/rest/v1/post_submissions?account_id=eq.${m.id}&select=id`)).json, [], "submissions go with the account");
  }
  await http(`/rest/v1/prompts?id=in.(${P.join(",")})`, { method: "DELETE" });
});
