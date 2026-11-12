// Local rehearsal of the provider tests C2, E1, E2 and E3 (docs/release/PROVIDER-TESTS.md) with the
// exact scripts the hosted run uses: scripts/provider-member.mjs (the member's actions),
// scripts/provider-drain.sh (one controlled drain, through scripts/provider-sql.sh and
// `supabase db query`) and scripts/provider-mux-read.mjs (Mux GETs). The database calls the worker
// over pg_net, the worker and abandon-submission run in the local Edge runtime, and Mux is a fake
// served by this test. LOCAL STACK ONLY; run it with scripts/provider-rehearsal.sh, which serves the
// functions with fake-only settings (MUX_CLEANUP_MODE=live, MUX_API_BASE pointing here).
//
// What the fake assumes about Mux is only what Mux documents (a cancel succeeds only while an upload
// waits; a cancelled or timed-out upload makes no asset) plus one assumption for the open question,
// marked ASSUMED: a complete transfer of a file that is not a video leaves the upload errored with
// no asset. The real answer is what provider step C2e is for.
import { assert, assertEquals } from "./assert.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DB = Deno.env.get("DB_CONTAINER") ?? "";
const STACK = Deno.env.get("STACK_DIR") ?? "";
const PORT = Number(Deno.env.get("FAKE_MUX_PORT") ?? "55713");
const KEY = Deno.env.get("CLEANUP_KEY") ?? "provider-rehearsal-cleanup-key";
const REPO = new URL("../../../", import.meta.url).pathname;
if (!API || !ANON || !SERVICE || !DB || !STACK) throw new Error("set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DB_CONTAINER and STACK_DIR");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error("local stack only");
const GATEWAY = DB.replace("supabase_db_", "supabase_kong_");
const run = Date.now().toString(36);
const scratch = await Deno.makeTempDir();
const tokenFile = `${scratch}/token`;

// ---------------------------------------------------------------------------
// Fake Mux (API, upload URLs, stream and image hosts on one port).
type Upload = { id: string; status: string; asset_id?: string; passthrough: string; bytes: number };
type Asset = { id: string; status: string; passthrough: string; upload_id: string; playback_ids: { id: string; policy: string }[]; created_at: string };
const uploads = new Map<string, Upload>();
const assets = new Map<string, Asset>();
const calls: { method: string; path: string }[] = [];
let seq = 0;
const server = Deno.serve({ hostname: "0.0.0.0", port: PORT, onListen: () => {} }, async (req) => {
  const url = new URL(req.url);
  const p = url.pathname;
  calls.push({ method: req.method, path: p });
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\/upload\/([A-Za-z0-9]+)$/)) && req.method === "PUT") {
    const u = uploads.get(m[1]);
    const declared = Number(req.headers.get("content-length") ?? "0");
    let got = 0;
    try {
      for await (const chunk of req.body ?? []) got += chunk.length;
    } catch {
      // The transfer was cut.
    }
    if (!u) return new Response(null, { status: 404 });
    u.bytes += got;
    if (got < declared || u.status !== "waiting") return new Response(null, { status: 400 }); // cut, or not waiting: nothing kept
    u.status = "errored"; // ASSUMED: a complete transfer of something that is not a video
    return new Response(null, { status: 200 });
  }
  if ((m = p.match(/^\/([A-Za-z0-9]+)\.m3u8$/))) {
    const live = [...assets.values()].some((a) => a.playback_ids.some((x) => x.id === m![1]));
    return new Response(live ? "#EXTM3U\n" : "not found", { status: live ? 200 : 404 });
  }
  if ((m = p.match(/^\/([A-Za-z0-9]+)\/thumbnail\.jpg$/))) {
    const live = [...assets.values()].some((a) => a.playback_ids.some((x) => x.id === m![1]));
    return new Response(live ? "jpg" : "not found", { status: live ? 200 : 404 });
  }
  if (!/^Basic /.test(req.headers.get("authorization") ?? "")) return Response.json({ error: "no auth" }, { status: 401 });
  if (req.method === "POST" && p === "/video/v1/uploads") {
    const body = await req.json();
    const id = `uppr${run}n${++seq}`;
    uploads.set(id, { id, status: "waiting", passthrough: body?.new_asset_settings?.passthrough ?? "", bytes: 0 });
    return Response.json({ data: { id, url: `https://storage.example.invalid/upload/${id}?sig=secret${id}`, status: "waiting", timeout: 3600 } }, { status: 201 });
  }
  if ((m = p.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)$/)) && req.method === "GET") {
    const u = uploads.get(m[1]);
    if (!u) return Response.json({ error: { type: "not_found" } }, { status: 404 });
    return Response.json({ data: { id: u.id, status: u.status, ...(u.asset_id ? { asset_id: u.asset_id } : {}), timeout: 3600, new_asset_settings: { passthrough: u.passthrough } } });
  }
  if ((m = p.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)\/cancel$/)) && req.method === "PUT") {
    const u = uploads.get(m[1]);
    if (!u || u.status !== "waiting") return Response.json({ error: { type: "invalid_parameters", messages: ["not waiting"] } }, { status: 400 });
    u.status = "cancelled";
    return Response.json({ data: { id: u.id, status: "cancelled" } });
  }
  if (req.method === "GET" && p === "/video/v1/assets") {
    return Response.json({ data: Number(url.searchParams.get("page") ?? "1") === 1 ? [...assets.values()] : [] });
  }
  if ((m = p.match(/^\/video\/v1\/assets\/([A-Za-z0-9]+)$/))) {
    const a = assets.get(m[1]);
    if (!a) return Response.json({ error: { type: "not_found" } }, { status: 404 });
    if (req.method === "GET") return Response.json({ data: a });
    if (req.method === "DELETE") {
      assets.delete(a.id);
      return new Response(null, { status: 204 });
    }
  }
  if ((m = p.match(/^\/video\/v1\/assets\/([A-Za-z0-9]+)\/playback-ids\/([A-Za-z0-9]+)$/)) && req.method === "DELETE") {
    const a = assets.get(m[1]);
    if (!a) return Response.json({}, { status: 404 });
    a.playback_ids = a.playback_ids.filter((x) => x.id !== m![2]);
    return new Response(null, { status: 204 });
  }
  if ((m = p.match(/^\/video\/v1\/assets\/([A-Za-z0-9]+)\/playback-ids$/)) && req.method === "POST") {
    const a = assets.get(m[1]);
    if (!a) return Response.json({}, { status: 404 });
    const id = `pbpr${run}n${++seq}`;
    a.playback_ids.push({ id, policy: "public" });
    return Response.json({ data: { id, policy: "public" } }, { status: 201 });
  }
  return Response.json({ error: "fake: no route" }, { status: 404 });
});
const changes = () => calls.filter((c) => c.method !== "GET" && !c.path.startsWith("/upload/") && c.path !== "/video/v1/uploads");

// ---------------------------------------------------------------------------
async function sql(statement: string): Promise<string> {
  const out = await new Deno.Command("docker", { args: ["exec", "-i", DB, "psql", "-U", "postgres", "-tA", "-v", "ON_ERROR_STOP=1", "-c", statement], stdout: "piped", stderr: "piped" }).output();
  if (!out.success) throw new Error(`psql: ${new TextDecoder().decode(out.stderr)}`);
  return new TextDecoder().decode(out.stdout).trim();
}
const lit = (v: string) => `'${v.replaceAll("'", "''")}'`;
async function http(path: string, opts: { method?: string; key?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers: { apikey: opts.key ?? SERVICE, Authorization: `Bearer ${opts.token ?? opts.key ?? SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}
type Run = { code: number; out: string; json: Record<string, unknown> | null };
async function script(cmd: string, args: string[], env: Record<string, string> = {}): Promise<Run> {
  const out = await new Deno.Command(cmd, { args, cwd: REPO, env: { ...env }, stdout: "piped", stderr: "piped" }).output();
  const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
  let json: Record<string, unknown> | null = null;
  const start = text.indexOf("{");
  try { json = start >= 0 ? JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) : null; } catch { json = null; }
  return { code: out.code, out: text, json };
}
// The member the scripts act as (PT_EXPECT_USER): this run's stand-in T1, a new random id, so the
// guards built into provider-member.mjs (the real T1 and founder ids) do not apply to it.
let current = "";
const memberEnv = () => ({ PT_SUPABASE_URL: API, PT_ANON_KEY: ANON, PT_TOKEN_FILE: tokenFile, PT_LOCAL_UPLOAD_BASE: `http://127.0.0.1:${PORT}`, PT_EXPECT_USER: current });
const t1 = (...args: string[]) => script("node", ["scripts/provider-member.mjs", ...args], memberEnv());
const muxRead = (...args: string[]) => script("node", ["scripts/provider-mux-read.mjs", ...args], {
  MUX_TOKEN_ID: "rehearsal-id", MUX_TOKEN_SECRET: "rehearsal-secret", MUX_API_BASE: `http://127.0.0.1:${PORT}`,
  MUX_STREAM_BASE: `http://127.0.0.1:${PORT}`, MUX_IMAGE_BASE: `http://127.0.0.1:${PORT}`,
});
const drain = (mode: "dry_run" | "live", ids: string[]) =>
  script("bash", ["scripts/provider-drain.sh", `local:${STACK}`, mode, `rehearsal ${run} ${mode}`, ids.length ? ids.join(",") : "none"]);
function noSecrets(r: Run, label: string) {
  assert(!/storage\.example|sig=secret|eyJ|sb_secret|rehearsal-secret/.test(r.out), `${label}: no upload URL, token or key in the output`);
}
type Job = { id: string; action: string; reason: string; status: string; result: Record<string, unknown> | null; upload_id: string | null; asset_id: string | null; owner_id: string | null };
const jobs = async (where: string) => (await http(`/rest/v1/mux_cleanup_jobs?${where}&select=id,action,reason,status,result,upload_id,asset_id,owner_id&order=created_at`)).json as Job[];
const due = async () => (await http(`/rest/v1/mux_cleanup_jobs?status=eq.pending&not_before=lte.${encodeURIComponent(new Date().toISOString())}&select=id`)).json as { id: string }[];

async function member(name: string, keepToken: boolean) {
  const email = `provider-${run}-${name}@example.com`;
  const created = await http("/auth/v1/admin/users", { method: "POST", body: { email, email_confirm: true } });
  const id = (created.json as { id: string }).id;
  const link = await http("/auth/v1/admin/generate_link", { method: "POST", body: { type: "magiclink", email } });
  const otp = (link.json as { email_otp: string }).email_otp;
  if (keepToken) {
    current = id;
    const v = await t1("verify", email, otp);
    assertEquals(v.json?.token_saved, true, "verify saves the token");
    noSecrets(v, "verify");
  }
  await http("/rest/v1/profiles", { method: "POST", body: { id, name, username: `pr${name}${run}`.slice(0, 24) } });
  const now = new Date().toISOString();
  await http(`/rest/v1/accounts?id=eq.${id}`, { method: "PATCH", body: { age_confirmed_at: now, public_disclosure_ack_at: now } });
  return { id, email };
}
/** A fresh sign-in for T1 (delete_account wants one from the last 10 minutes). */
async function signInAgain(email: string) {
  const link = await http("/auth/v1/admin/generate_link", { method: "POST", body: { type: "magiclink", email } });
  const v = await t1("verify", email, (link.json as { email_otp: string }).email_otp);
  assertEquals(v.json?.token_saved, true, "verify saves the token");
}
/** A live response with its asset at the fake Mux. */
async function liveVideo(owner: string, n: number) {
  const prompt = await http("/rest/v1/prompts", { method: "POST", body: { text: `Provider rehearsal ${run} ${n}`, status: "live", published_at: new Date().toISOString() } });
  const promptId = (prompt.json as { id: string }[])[0].id;
  const a: Asset = { id: `aspr${run}v${n}`, status: "ready", passthrough: owner, upload_id: `uppr${run}v${n}`, playback_ids: [{ id: `pbpr${run}v${n}`, policy: "public" }], created_at: String(Math.floor(Date.now() / 1000)) };
  assets.set(a.id, a);
  await http("/rest/v1/video_uploads", { method: "POST", body: { account_id: owner, upload_id: a.upload_id, status: "claimed" } });
  const r = await http("/rest/v1/responses", { method: "POST", body: { prompt_id: promptId, author_id: owner, duration_ms: 6000, status: "live", mux_upload_id: a.upload_id, mux_asset_id: a.id, mux_playback_id: a.playback_ids[0].id, live_at: new Date().toISOString() } });
  assertEquals(r.status, 201, "live video");
  return { id: (r.json as { id: string }[])[0].id, promptId, asset: a };
}

// Clean start (this local database only): other runs' pending jobs set aside, the switch off, the
// worker's two Vault secrets pointing at the local gateway.
await http("/rest/v1/mux_cleanup_jobs?status=in.(pending,running)", { method: "PATCH", body: { status: "skipped", lease_id: null, locked_until: null, result: { outcome: "set_aside_by_rehearsal", run } } });
await sql(`select public.mux_cleanup_set_mode('off', ${lit(`rehearsal-${run}`)})`);
await sql("delete from vault.secrets where name in ('mux_cleanup_url', 'mux_cleanup_key')");
await sql(`select vault.create_secret(${lit(`http://${GATEWAY}:8000/functions/v1/mux-cleanup`)}, 'mux_cleanup_url')`);
await sql(`select vault.create_secret(${lit(KEY)}, 'mux_cleanup_key')`);
const founder = await member("founder", false);
const R0 = await liveVideo(founder.id, 0);
const T1 = await member("t1", true);
const V = await liveVideo(T1.id, 1);

// ---------------------------------------------------------------------------
Deno.test("C2 (worker): an abandoned video reply's upload, cut part-way, is cancelled by one controlled drain", async () => {
  calls.length = 0;
  const r = await t1("c2", "--reply-to", R0.id, "--submission", "no", "--bytes", "partial", "--discard", "abandon-response");
  noSecrets(r, "c2");
  assertEquals(r.code, 0, r.out);
  const steps = r.json?.steps as Record<string, unknown>[];
  const upload = steps[0].uploadId as string;
  const row = steps[1].responseId as string;
  assertEquals(steps[2].cut, true, "the transfer was cut");
  assertEquals(uploads.get(upload)?.status, "waiting", "Mux still waits (bytes incomplete)");
  assertEquals(((await http(`/rest/v1/responses?id=eq.${row}&select=status`)).json as { status: string }[])[0].status, "deleted");
  assertEquals(((await http(`/rest/v1/video_uploads?upload_id=eq.${upload}&select=status`)).json as { status: string }[])[0].status, "claimed");
  const queued = await jobs(`upload_id=eq.${upload}`);
  assertEquals(queued.map((j) => [j.action, j.reason, j.status, j.owner_id]), [["cancel_upload", "abandoned", "pending", T1.id]]);
  assertEquals((await due()).map((d) => d.id), [queued[0].id], "exactly this job is due");
  const read = await muxRead("upload", upload);
  assertEquals([(read.json?.upload as Record<string, unknown>).status, (read.json?.upload as Record<string, unknown>).passthrough], ["waiting", T1.id]);

  const dry = await drain("dry_run", [queued[0].id]);
  assertEquals(dry.code, 0, dry.out);
  assert(dry.out.includes("switch after: off"), "back off");
  const planned = (await jobs(`id=eq.${queued[0].id}`))[0];
  assertEquals([planned.status, planned.result?.dry_run], ["pending", true]);
  assertEquals(changes(), [], "the dry run changed nothing at Mux");

  const live = await drain("live", [queued[0].id]);
  assertEquals(live.code, 0, live.out);
  const done = (await jobs(`id=eq.${queued[0].id}`))[0];
  assertEquals([done.status, done.result?.outcome], ["done", "cancelled"]);
  assertEquals(changes().map((c) => `${c.method} ${c.path}`), [`PUT /video/v1/uploads/${upload}/cancel`], "one cancel, nothing else");
  assertEquals(((await muxRead("upload", upload)).json?.upload as Record<string, unknown>).status, "cancelled");
  assertEquals([...assets.keys()].sort(), [R0.asset.id, V.asset.id].sort(), "no asset created or deleted");
  assertEquals(await sql("select public.mux_cleanup_mode()"), "off");
});

Deno.test("C2 (abandon-submission): a video reply cut part-way and discarded: cancelled at Mux first, then retired; no job, no drain", async () => {
  calls.length = 0;
  const r = await t1("c2", "--reply-to", R0.id, "--submission", "yes", "--bytes", "partial", "--discard", "abandon-submission");
  noSecrets(r, "c2");
  assertEquals(r.code, 0, r.out);
  const steps = r.json?.steps as Record<string, unknown>[];
  const upload = steps[0].uploadId as string;
  assertEquals(steps[3].answer, { outcome: "abandoned", reason: "cancelled" });
  assertEquals(uploads.get(upload)?.status, "cancelled");
  assertEquals(changes().map((c) => `${c.method} ${c.path}`), [`PUT /video/v1/uploads/${upload}/cancel`]);
  assertEquals(((await http(`/rest/v1/responses?id=eq.${steps[1].responseId}&select=status`)).json as { status: string }[])[0].status, "deleted");
  assert(((await http(`/rest/v1/post_submissions?id=eq.${steps[1].submission}&select=abandoned_at`)).json as { abandoned_at: string }[])[0].abandoned_at, "submission closed");
  assertEquals(await jobs(`upload_id=eq.${upload}`), [], "no clean-up job: the function cancelled it itself");
});

Deno.test("C2e (errored, ASSUMED fake behaviour): kept unverified while the URL can take bytes; retired on a later ask once it has long expired", async () => {
  calls.length = 0;
  const r = await t1("c2", "--reply-to", R0.id, "--submission", "yes", "--bytes", "invalid", "--discard", "abandon-submission");
  assertEquals(r.code, 0, r.out);
  const steps = r.json?.steps as Record<string, unknown>[];
  const upload = steps[0].uploadId as string;
  assertEquals(uploads.get(upload)?.status, "errored");
  assertEquals((steps[3].answer as Record<string, unknown>).reason, "unverified");
  assertEquals(((await http(`/rest/v1/responses?id=eq.${steps[1].responseId}&select=status`)).json as { status: string }[])[0].status, "processing");
  await http(`/rest/v1/video_uploads?upload_id=eq.${upload}`, { method: "PATCH", body: { expires_at: new Date(Date.now() - 11 * 60_000).toISOString() } });
  const again = await t1("abandon", steps[1].submission as string);
  assertEquals((again.json?.answer as Record<string, unknown>).outcome, "abandoned");
  assertEquals(changes(), [], "no change at Mux");
});

Deno.test("E1: T1 deletes the account: one playback job; a dry run plans the revocation; a live drain revokes P2; the asset stays", async () => {
  calls.length = 0;
  const P2 = V.asset.playback_ids[0].id;
  await signInAgain(T1.email);
  const d = await t1("delete-account");
  assertEquals(d.json?.http, 204, d.out);
  assertEquals((await t1("sign-in-state")).json?.error, "session_revoked", "the deletion signs the phone out at once");
  const queued = await jobs(`response_id=eq.${V.id}&status=eq.pending`);
  assertEquals(queued.map((j) => [j.action, j.reason]), [["sync_playback", "account_deleted"]]);
  assertEquals((await due()).map((x) => x.id), [queued[0].id]);
  assertEquals((await drain("dry_run", [queued[0].id])).code, 0);
  const plan = (await jobs(`id=eq.${queued[0].id}`))[0].result as Record<string, unknown>;
  assertEquals([(plan.would as Record<string, unknown>)?.direction, (plan.would as Record<string, unknown>)?.would_revoke], ["revoke", [P2]]);
  assertEquals(changes(), []);
  assertEquals((await drain("live", [queued[0].id])).code, 0);
  assertEquals(((await jobs(`id=eq.${queued[0].id}`))[0]).result?.outcome, "revoked");
  assertEquals(changes().map((c) => `${c.method} ${c.path}`), [`DELETE /video/v1/assets/${V.asset.id}/playback-ids/${P2}`]);
  assertEquals((await muxRead("playback", P2)).json?.hls, 404);
  assertEquals((await muxRead("asset", V.asset.id)).json?.http, 200, "the asset is kept");
  assertEquals(((await http(`/rest/v1/responses?id=eq.${V.id}&select=mux_playback_id,status`)).json as unknown[])[0], { mux_playback_id: null, status: "live" });
});

Deno.test("E2: T1 signs back in within 30 days: restored; a live drain makes a new public id P3; V plays again on the same asset", async () => {
  calls.length = 0;
  // The deletion ended every session (20261016000202): the phone's old token is refused, and only a
  // new sign-in (a new email code) restores the account.
  const stale = await t1("sign-in-state");
  assertEquals(stale.json?.error, "session_revoked", stale.out);
  assert(stale.json?.http === 401 || stale.json?.http === 403, `old session refused: ${stale.json?.http}`);
  assertEquals(await sql(`select deleted_at is not null from public.accounts where id = ${lit(T1.id)}`), "t", "a refused call restores nothing");
  await signInAgain(T1.email);
  const s = await t1("sign-in-state");
  assertEquals(s.json?.http, 200, s.out);
  assertEquals(await sql(`select deleted_at is null from public.accounts where id = ${lit(T1.id)}`), "t");
  const queued = await jobs(`response_id=eq.${V.id}&status=eq.pending`);
  assertEquals(queued.map((j) => [j.action, j.reason]), [["sync_playback", "account_restored"]]);
  assertEquals((await drain("dry_run", [queued[0].id])).code, 0);
  assertEquals(((await jobs(`id=eq.${queued[0].id}`))[0].result?.would as Record<string, unknown>)?.direction, "restore");
  assertEquals((await drain("live", [queued[0].id])).code, 0);
  const done = (await jobs(`id=eq.${queued[0].id}`))[0];
  assertEquals([done.status, done.result?.outcome], ["done", "restored"]);
  const P3 = ((await http(`/rest/v1/responses?id=eq.${V.id}&select=mux_playback_id`)).json as { mux_playback_id: string }[])[0].mux_playback_id;
  assert(P3 && P3 !== `pbpr${run}v1`, "a new playback id is recorded");
  assertEquals(V.asset.playback_ids.map((p) => p.id), [P3], "same asset, exactly the new id");
  assertEquals((await muxRead("playback", P3)).json?.hls, 200);
});

Deno.test("E3: deleted again and purged on day 30: one asset deletion for V's asset, done by a live drain; nothing else at Mux", async () => {
  calls.length = 0;
  await signInAgain(T1.email);
  assertEquals((await t1("delete-account")).json?.http, 204);
  // The 30 days, locally only: the account's deletion moved back.
  await sql(`update public.accounts set deleted_at = now() - interval '31 days' where id = ${lit(T1.id)}`);
  await sql(`update public.mux_cleanup_jobs set status = 'skipped', result = '{"outcome":"set_aside_by_rehearsal"}' where response_id = ${lit(V.id)} and status = 'pending'`);
  assertEquals(await sql("select public.purge_deleted_accounts()"), "1");
  const queued = await jobs(`asset_id=eq.${V.asset.id}&status=eq.pending`);
  assertEquals(queued.map((j) => [j.action, j.reason]), [["delete_asset", "account_purged"]]);
  const dueNow = (await due()).map((x) => x.id);
  assert(dueNow.includes(queued[0].id), "the deletion is due at the purge");
  assertEquals((await drain("dry_run", dueNow)).code, 0);
  assertEquals(changes(), []);
  assertEquals((await drain("live", dueNow)).code, 0);
  assertEquals(((await jobs(`id=eq.${queued[0].id}`))[0]).result?.outcome, "deleted");
  assertEquals(changes().filter((c) => c.method === "DELETE" && c.path.startsWith("/video/v1/assets/") && !c.path.includes("playback")).map((c) => c.path), [`/video/v1/assets/${V.asset.id}`]);
  assertEquals((await muxRead("asset", V.asset.id)).json?.http, 404);
  assert(assets.has(R0.asset.id), "the founder's asset is untouched");
});

Deno.test("guards: the scripts refuse the hosted project without the approval flags", async () => {
  const m = await script("node", ["scripts/provider-member.mjs", "sign-in-state"], { ...memberEnv(), PT_SUPABASE_URL: "https://picvoavfxnajfjkqawju.supabase.co" });
  assertEquals(m.code, 2);
  const q = await script("bash", ["scripts/provider-sql.sh", "hosted", "select 1"], { PATH: Deno.env.get("PATH") ?? "", PROVIDER_HOSTED_REF: "picvoavfxnajfjkqawju" });
  assertEquals(q.code, 2);
  const w = await script("bash", ["scripts/provider-sql.sh", "hosted", "select public.mux_cleanup_set_mode('live', 'x')"], { PATH: Deno.env.get("PATH") ?? "", PROVIDER_HOSTED_REF: "picvoavfxnajfjkqawju", PROVIDER_APPROVED_BY_NEMAT: "yes" });
  assertEquals(w.code, 2, "a write needs the approved step");
  const r = await script("node", ["scripts/provider-mux-read.mjs", "upload", "abc"], { MUX_TOKEN_ID: "x", MUX_TOKEN_SECRET: "y", MUX_API_BASE: "http://example.com" });
  assert(r.code !== 0, "a non-local fake base is refused");
});

Deno.test("cleanup: switch off, secrets removed, this run's rows removed", async () => {
  await sql(`select public.mux_cleanup_set_mode('off', ${lit(`rehearsal-${run} done`)})`);
  await sql("delete from vault.secrets where name in ('mux_cleanup_url', 'mux_cleanup_key')");
  for (const id of [founder.id, T1.id]) {
    await http(`/rest/v1/responses?author_id=eq.${id}`, { method: "DELETE" });
    await http(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  }
  await http(`/rest/v1/prompts?text=like.${encodeURIComponent(`Provider rehearsal ${run}*`)}`, { method: "DELETE" });
  await Deno.remove(scratch, { recursive: true });
  await server.shutdown();
});
