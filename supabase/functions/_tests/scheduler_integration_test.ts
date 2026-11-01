// End-to-end test of the scheduled path on a LOCAL stack: pg_cron -> public.run_mux_cleanup ->
// pg_net -> the mux-cleanup function running in the local Edge runtime -> a fake Mux served by this
// test process. Nothing in-process stands in for the worker here: the database calls it over HTTP
// exactly as on a hosted project.
//
// Run it with scripts/scheduler-integration.sh, which does the following. It needs the local Edge
// runtime serving the functions with fake-only settings, kept in a restart loop (from the stack's
// folder):
//   supabase functions serve --no-verify-jwt --env-file <file>
// where <file> holds:
//   MUX_API_BASE=http://host.docker.internal:55690      (this test's fake Mux)
//   MUX_TOKEN_ID=sched-test-id
//   MUX_TOKEN_SECRET=sched-test-secret
//   MUX_CLEANUP_KEY=sched-test-cleanup-key
//   MUX_CLEANUP_MODE=live
// and then:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... DB_CONTAINER=supabase_db_<project> \
//   EDGE_CONTAINER=supabase_edge_runtime_<project> \
//     deno test --allow-env --allow-net --allow-run supabase/functions/_tests/scheduler_integration_test.ts
//
// Refuses to run unless SUPABASE_URL is 127.0.0.1 or localhost. It changes the local database's
// Vault secrets mux_cleanup_url and mux_cleanup_key and the worker's switch, and puts the switch
// back to off and removes the secrets at the end.
import { assert, assertEquals } from "./assert.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DB = Deno.env.get("DB_CONTAINER") ?? "";
const EDGE = Deno.env.get("EDGE_CONTAINER") ?? "";
const PORT = Number(Deno.env.get("FAKE_MUX_PORT") ?? "55690");
const KEY = Deno.env.get("CLEANUP_KEY") ?? "sched-test-cleanup-key";
if (!API || !ANON || !SERVICE || !DB || !EDGE) throw new Error("set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DB_CONTAINER and EDGE_CONTAINER");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error(`refusing to run against ${new URL(API).hostname}: local stack only`);
// The worker as the database container reaches it: through the stack's API gateway, the same
// route as https://<ref>.supabase.co/functions/v1/mux-cleanup on a hosted project.
const GATEWAY = Deno.env.get("GATEWAY_CONTAINER") ?? DB.replace("supabase_db_", "supabase_kong_");
const WORKER_URL = Deno.env.get("WORKER_URL") ?? `http://${GATEWAY}:8000/functions/v1/mux-cleanup`;

const run = Date.now().toString(36);

// ---------------------------------------------------------------------------
// Fake Mux, served over HTTP to the Edge runtime container.
type FakeAsset = { id: string; status: string; passthrough: string; upload_id: string; playback_ids: { id: string; policy: string }[]; created_at: string };
const assets = new Map<string, FakeAsset>();
const calls: { method: string; path: string }[] = [];
const applied: string[] = [];
let stall: ((method: string, path: string) => Promise<void> | null) = () => null;
let failWith: ((method: string, path: string) => number | null) = () => null;
const server = Deno.serve({ hostname: "0.0.0.0", port: PORT, onListen: () => {} }, async (req) => {
  const url = new URL(req.url);
  const p = url.pathname;
  calls.push({ method: req.method, path: p });
  const hold = stall(req.method, p);
  if (hold) await hold;
  if (req.signal.aborted) return new Response(null, { status: 499 });
  const code = failWith(req.method, p);
  if (code) return Response.json({ error: "fake failure" }, { status: code });
  let m: RegExpMatchArray | null;
  if (req.method === "GET" && p === "/video/v1/assets") {
    const page = Number(url.searchParams.get("page") ?? "1");
    return Response.json({ data: page === 1 ? [...assets.values()] : [] });
  }
  if ((m = p.match(/^\/video\/v1\/assets\/([A-Za-z0-9]+)$/))) {
    const a = assets.get(m[1]);
    if (!a) return Response.json({}, { status: 404 });
    if (req.method === "GET") return Response.json({ data: a });
    if (req.method === "DELETE") {
      assets.delete(a.id);
      applied.push(`delete ${a.id}`);
      return new Response(null, { status: 204 });
    }
  }
  if ((m = p.match(/^\/video\/v1\/assets\/([A-Za-z0-9]+)\/playback-ids\/([A-Za-z0-9]+)$/)) && req.method === "DELETE") {
    const a = assets.get(m[1]);
    if (!a) return Response.json({}, { status: 404 });
    a.playback_ids = a.playback_ids.filter((x) => x.id !== m![2]);
    applied.push(`revoke ${m[2]}`);
    return new Response(null, { status: 204 });
  }
  return Response.json({ error: "fake: no route" }, { status: 404 });
});
const deletes = (id: string) => applied.filter((a) => a === `delete ${id}`).length;
const mutations = () => calls.filter((c) => c.method !== "GET");

// ---------------------------------------------------------------------------
// Local stack helpers
async function sql(statement: string): Promise<string> {
  const out = await new Deno.Command("docker", { args: ["exec", "-i", DB, "psql", "-U", "postgres", "-tA", "-v", "ON_ERROR_STOP=1", "-c", statement], stdout: "piped", stderr: "piped" }).output();
  if (!out.success) throw new Error(`psql: ${new TextDecoder().decode(out.stderr)}`);
  return new TextDecoder().decode(out.stdout).trim();
}
const lit = (v: string) => `'${v.replaceAll("'", "''")}'`;
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
async function waitFor<T>(what: string, f: () => Promise<T | null | undefined | false>, ms = 20_000): Promise<T> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await f();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timed out waiting for ${what}`);
}
const setMode = (mode: string) => sql(`select public.mux_cleanup_set_mode(${lit(mode)}, ${lit(`scheduler-test-${run}`)})`);
async function setSecrets(url: string | null, key: string | null) {
  await sql("delete from vault.secrets where name in ('mux_cleanup_url', 'mux_cleanup_key')");
  if (url) await sql(`select vault.create_secret(${lit(url)}, 'mux_cleanup_url')`);
  if (key) await sql(`select vault.create_secret(${lit(key)}, 'mux_cleanup_key')`);
}
const queued = async () => Number(await sql("select count(*) from net.http_request_queue"));
const lastResponseId = async () => Number(await sql("select coalesce(max(id), 0) from net._http_response"));
/** Calls run_mux_cleanup as the cron job does, and waits for pg_net's record of the HTTP call. */
async function viaCron(mode: "drain" | "sweep", times = 1) {
  const before = await lastResponseId();
  await sql(`select public.run_mux_cleanup(${lit(mode)}) from generate_series(1, ${times})`);
  return await waitFor(`pg_net to call the worker (${mode})`, async () => {
    const rows = await sql(`select coalesce(status_code::text, 'error:' || coalesce(error_msg, '')) || ' ' || coalesce(content, '') from net._http_response where id > ${before} order by id`);
    const lines = rows ? rows.split("\n") : [];
    return lines.length >= times ? lines : null;
  }, 60_000);
}
type JobRow = { status: string; attempts: number; last_error: string | null; result: Record<string, unknown> | null; reason: string };
async function job(asset: string): Promise<JobRow> {
  // The deletion; an author's deletion also queues a playback revocation (20261101000100).
  const r = await http(`/rest/v1/mux_cleanup_jobs?asset_id=eq.${asset}&action=eq.delete_asset&order=created_at.desc&limit=1&select=status,attempts,last_error,result,reason`);
  return (r.json as JobRow[])[0];
}
type Member = { id: string; token: string };
const members: Member[] = [];
async function member(name: string): Promise<Member> {
  const email = `sched-${run}-${name}@example.com`;
  const created = await http("/auth/v1/admin/users", { method: "POST", body: { email, email_confirm: true } });
  const id = (created.json as { id: string }).id;
  const link = await http("/auth/v1/admin/generate_link", { method: "POST", body: { type: "magiclink", email } });
  const verified = await http("/auth/v1/verify", { method: "POST", key: ANON, body: { type: "email", email, token: (link.json as { email_otp: string }).email_otp } });
  assertEquals(verified.status, 200, `sign in ${name}`);
  await http("/rest/v1/profiles", { method: "POST", body: { id, name, username: `sc${name}${run}`.slice(0, 24) } });
  const m = { id, token: (verified.json as { access_token: string }).access_token };
  members.push(m);
  return m;
}
const promptIds: string[] = [];
let seq = 0;
/** A live video with its asset at the fake Mux; deleted by its author unless told otherwise. */
async function video(m: Member, opts: { delete?: boolean } = {}) {
  const n = ++seq;
  const prompt = await http("/rest/v1/prompts?select=id", { method: "POST", body: { text: `Scheduler test ${run} ${n}`, status: "live", published_at: new Date().toISOString() } });
  const promptId = ((await http(`/rest/v1/prompts?text=eq.${encodeURIComponent(`Scheduler test ${run} ${n}`)}&select=id`)).json as { id: string }[])[0].id;
  assert(prompt.status === 201 || prompt.status === 200, "prompt");
  promptIds.push(promptId);
  const a: FakeAsset = { id: `as${run}s${n}`, status: "ready", passthrough: m.id, upload_id: `up${run}s${n}`, playback_ids: [{ id: `pb${run}s${n}`, policy: "public" }], created_at: String(Math.floor(Date.now() / 1000)) };
  assets.set(a.id, a);
  const r = await http("/rest/v1/responses?select=id", { method: "POST", body: { prompt_id: promptId, author_id: m.id, duration_ms: 9000, status: "live", mux_upload_id: a.upload_id, mux_asset_id: a.id, mux_playback_id: a.playback_ids[0].id, live_at: new Date().toISOString() } });
  assertEquals(r.status, 201, "response");
  const id = ((await http(`/rest/v1/responses?mux_asset_id=eq.${a.id}&select=id`)).json as { id: string }[])[0].id;
  if (opts.delete !== false) {
    const d = await http("/rest/v1/rpc/delete_video", { method: "POST", key: ANON, token: m.token, body: { p_id: id } });
    assertEquals(d.status, 204, "delete_video");
  }
  return { id, asset: a };
}

// Start from a clean queue (this local database only), the switch off and no secrets.
await http("/rest/v1/mux_cleanup_jobs?status=in.(pending,running)", { method: "PATCH", body: { status: "skipped", lease_id: null, locked_until: null, result: { outcome: "set_aside_by_test", run } } });
await setMode("off");
await setSecrets(null, null);
const owner = await member("owner");

// ---------------------------------------------------------------------------
Deno.test("schedules: the drain every minute, the sweep and the prunes daily, all active", async () => {
  const rows = await sql("select jobname || ' ' || schedule || ' ' || active from cron.job where jobname in ('mux-cleanup', 'mux-sweep', 'prune-mux-cleanup-jobs', 'prune-moderation-records', 'purge-deleted-accounts') order by jobname");
  assertEquals(rows.split("\n"), ["mux-cleanup * * * * * true", "mux-sweep 45 4 * * * true", "prune-moderation-records 30 3 * * * true", "prune-mux-cleanup-jobs 40 3 * * * true", "purge-deleted-accounts 15 3 * * * true"]);
});

Deno.test("missing secrets: the worker is never called, even switched on", async () => {
  const v = await video(owner);
  await setMode("live");
  const before = await queued();
  calls.length = 0;
  await sql("select public.run_mux_cleanup('drain')");
  await sql("select public.run_mux_cleanup('sweep')");
  assertEquals(await queued(), before, "no HTTP request queued");
  await new Promise((r) => setTimeout(r, 1500));
  assertEquals(calls, [], "Mux untouched");
  assertEquals((await job(v.asset.id)).status, "pending");
});

Deno.test("switched off: with the secrets set, the worker is still never called", async () => {
  await setSecrets(WORKER_URL, KEY);
  await setMode("off");
  const before = await queued();
  await sql("select public.run_mux_cleanup('drain')");
  await sql("select public.run_mux_cleanup('sweep')");
  assertEquals(await queued(), before);
});

Deno.test("authentication: a wrong key is refused by the worker; nothing happens", async () => {
  const v = await video(owner);
  await setSecrets(WORKER_URL, "not-the-key");
  await setMode("live");
  calls.length = 0;
  const [answer] = await viaCron("drain");
  assert(answer.startsWith("401"), answer);
  assertEquals(calls, []);
  assertEquals((await job(v.asset.id)).status, "pending");
  assert(assets.has(v.asset.id));
});

Deno.test("failed HTTP request: an unreachable worker changes nothing; the next run works", async () => {
  const v = await video(owner);
  await setSecrets(`http://${GATEWAY}:9/functions/v1/mux-cleanup`, KEY);
  const [answer] = await viaCron("drain");
  assert(answer.startsWith("error:"), answer);
  assertEquals((await job(v.asset.id)).status, "pending");
  assert(assets.has(v.asset.id));
  await setSecrets(WORKER_URL, KEY);
  const [ok] = await viaCron("drain");
  assert(ok.startsWith("200"), ok);
  await waitFor("the deletion", async () => (await job(v.asset.id)).status === "done");
  assertEquals(deletes(v.asset.id), 1);
});

Deno.test("the complete path: pg_cron fires on its own and the asset is deleted", async () => {
  const v = await video(owner);
  const since = await sql("select now()");
  // Waits for the minute tick: nothing here calls the worker.
  await waitFor("cron to delete the asset", async () => (await job(v.asset.id)).status === "done", 75_000);
  assertEquals(deletes(v.asset.id), 1);
  const ran = await sql(`select count(*) from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'mux-cleanup' and d.status = 'succeeded' and d.start_time >= ${lit(since)}`);
  assert(Number(ran) >= 1, "cron recorded the run");
});

Deno.test("retries: a Mux failure is retried with backoff through the scheduled path", async () => {
  const v = await video(owner);
  failWith = (method, path) => method === "DELETE" && path.endsWith(v.asset.id) ? 503 : null;
  await viaCron("drain");
  const failed = await waitFor("the retry", async () => { const j = await job(v.asset.id); return j.attempts === 1 && j.status === "pending" ? j : null; });
  assertEquals(failed.last_error, "mux_503");
  assert(assets.has(v.asset.id));
  failWith = () => null;
  await sql(`update public.mux_cleanup_jobs set not_before = now() where asset_id = ${lit(v.asset.id)} and status = 'pending'`);
  await viaCron("drain");
  await waitFor("the deletion", async () => (await job(v.asset.id)).status === "done");
  assertEquals(deletes(v.asset.id), 1);
});

Deno.test("duplicate execution: three calls at once delete each asset exactly once", async () => {
  const vs = [];
  for (let i = 0; i < 5; i++) vs.push(await video(owner));
  const answers = await viaCron("drain", 3);
  assert(answers.every((a) => a.startsWith("200")), answers.join(" | "));
  for (const v of vs) {
    await waitFor(`the deletion of ${v.asset.id}`, async () => (await job(v.asset.id)).status === "done");
    assertEquals(deletes(v.asset.id), 1, v.asset.id);
  }
});

Deno.test("worker restart: a job cut off mid-call is leased again once its lease runs out, and done once", async () => {
  const v = await video(owner);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  stall = (method, path) => method === "DELETE" && path.endsWith(v.asset.id) ? gate : null;
  const before = await lastResponseId();
  await sql("select public.run_mux_cleanup('drain')");
  await waitFor("the worker to reach Mux", () => Promise.resolve(calls.some((c) => c.method === "DELETE" && c.path.endsWith(v.asset.id))));
  assertEquals((await job(v.asset.id)).status, "running");
  // The Edge runtime dies while the call is in flight (scripts/scheduler-integration.sh serves it
  // in a loop, so it comes back as a platform restart would).
  const killed = await new Deno.Command("docker", { args: ["kill", EDGE], stdout: "null", stderr: "null" }).output();
  assert(killed.success, "docker kill");
  release();
  stall = () => null;
  assertEquals((await job(v.asset.id)).status, "running", "the lease is still held by the dead worker");
  await waitFor("pg_net to give up on the dead call", async () => Number(await sql(`select count(*) from net._http_response where id > ${before}`)) > 0, 70_000);
  await waitFor("the worker to come back", async () => {
    const r = await fetch(`${API}/functions/v1/mux-cleanup`, { method: "GET" }).catch(() => null);
    await r?.body?.cancel();
    return r?.status === 405;
  }, 60_000);
  // As 120 s passing would: the lease runs out.
  await sql(`update public.mux_cleanup_jobs set locked_until = now() - interval '1 second' where asset_id = ${lit(v.asset.id)} and status = 'running'`);
  await viaCron("drain");
  await waitFor("the deletion", async () => (await job(v.asset.id)).status === "done");
  const j = await job(v.asset.id);
  assertEquals(j.attempts, 2, "leased twice");
  assert(!assets.has(v.asset.id));
  assert(deletes(v.asset.id) <= 1, "deleted at most once at Mux");
});

Deno.test("dry run through the scheduled path: Mux is only read; the plan is recorded", async () => {
  const v = await video(owner);
  await setMode("dry_run");
  calls.length = 0;
  const [answer] = await viaCron("drain");
  assert(answer.startsWith("200") && answer.includes('"mode":"dry_run"'), answer);
  const j = await waitFor("the plan", async () => { const x = await job(v.asset.id); return x.result?.dry_run ? x : null; });
  assertEquals([j.status, j.attempts], ["pending", 0]);
  assertEquals(mutations(), [], "no change at Mux");
  assert(assets.has(v.asset.id));
  await setMode("live");
  await viaCron("drain");
  await waitFor("the deletion once live", async () => (await job(v.asset.id)).status === "done");
});

Deno.test("daily orphan clean-up: the sweep queues a proven orphan, reports an unknown one; the drain deletes the orphan", async () => {
  const twoDaysAgo = String(Math.floor(Date.now() / 1000) - 2 * 86_400);
  const orphan: FakeAsset = { id: `as${run}orphan`, status: "ready", passthrough: owner.id, upload_id: `up${run}orphan`, playback_ids: [{ id: `pb${run}orphan`, policy: "public" }], created_at: twoDaysAgo };
  const stranger: FakeAsset = { id: `as${run}stranger`, status: "ready", passthrough: owner.id, upload_id: `up${run}stranger`, playback_ids: [], created_at: twoDaysAgo };
  assets.set(orphan.id, orphan);
  assets.set(stranger.id, stranger);
  const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
  await http("/rest/v1/video_uploads", { method: "POST", body: { account_id: owner.id, upload_id: orphan.upload_id, status: "active", created_at: old, reserved_until: old, expires_at: old, activated_at: old } });
  const live = await video(owner, { delete: false });
  live.asset.created_at = twoDaysAgo;
  const [answer] = await viaCron("sweep");
  assert(answer.startsWith("200"), answer);
  const sweep = JSON.parse(answer.slice(4));
  assert(sweep.queued >= 1 && sweep.review >= 1 && sweep.in_use >= 1, answer);
  assertEquals((await job(orphan.id)).reason, "orphan");
  assertEquals((await job(stranger.id)).status, "review");
  await viaCron("drain");
  await waitFor("the orphan's deletion", async () => (await job(orphan.id)).status === "done");
  assert(!assets.has(orphan.id) && assets.has(stranger.id) && assets.has(live.asset.id), "only the orphan is deleted");
  assertEquals(applied.filter((a) => a.includes(stranger.id) || a.includes(live.asset.id)), []);
});

Deno.test("monitoring: every call to the worker is recorded; its answer collected; errors show in the health check", async () => {
  const since = await sql("select now()");
  const v = await video(owner);
  await setMode("live");
  await setSecrets(WORKER_URL, "not-the-key");
  await viaCron("drain");
  await setSecrets(`http://${GATEWAY}:9/functions/v1/mux-cleanup`, KEY);
  await viaCron("drain");
  await setSecrets(WORKER_URL, KEY);
  await viaCron("drain");
  await waitFor("the deletion", async () => (await job(v.asset.id)).status === "done");
  assertEquals(Number(await sql(`select count(*) from public.mux_cleanup_runs where requested_at >= ${lit(since)}`)), 3, "three requests recorded");
  assert(Number(await sql("select public.mux_cleanup_collect_runs()")) >= 3, "their answers collected");
  const rows = (await sql(`select coalesce(status_code::text, 'none') || '|' || coalesce(ok::text, 'null') || '|' || (error is not null)::text || '|' || coalesce(summary->>'claimed', '-') from public.mux_cleanup_runs where requested_at >= ${lit(since)} order by request_id`)).split("\n");
  assertEquals(rows[0], "401|null|false|-", "the wrong key: 401");
  assert(rows[1].startsWith("none|null|true"), `unreachable: an error, no status (${rows[1]})`);
  assertEquals(rows[2], "200|true|false|2", "the right key: 200, ok, two jobs claimed (the revocation and the deletion)");
  assertEquals(await sql(`select count(*) from public.mux_cleanup_runs where requested_at >= ${lit(since)} and summary::text like '%${v.asset.id}%'`), "0", "no Mux id kept from the answers");
  const health = JSON.parse(await sql("select public.mux_cleanup_health()"));
  assertEquals(health.status, "alert");
  const worker = health.problems.find((p: { check: string }) => p.check === "worker_errors");
  assert(worker && Number(worker.detail.split(" ")[0]) >= 2, JSON.stringify(health.problems));
  assert(Number(health.metrics.worker.requests_24h) >= 3);
  assertEquals(health.metrics.schedules["mux-cleanup"].active, true);
  await sql(`delete from public.mux_cleanup_runs where requested_at >= ${lit(since)}`);
});

Deno.test("cleanup: switch off, secrets removed, this run's rows removed", async () => {
  await setMode("off");
  await setSecrets(null, null);
  await http(`/rest/v1/mux_cleanup_jobs?status=in.(pending,running,review)&or=(asset_id.like.*${run}*,upload_id.like.*${run}*)`, { method: "PATCH", body: { status: "skipped", lease_id: null, locked_until: null, result: { outcome: "test_cleanup" } } });
  for (const m of members) {
    await http(`/rest/v1/responses?author_id=eq.${m.id}`, { method: "DELETE" });
    await http(`/rest/v1/profiles?id=eq.${m.id}`, { method: "DELETE" });
    await http(`/auth/v1/admin/users/${m.id}`, { method: "DELETE" });
  }
  if (promptIds.length) await http(`/rest/v1/prompts?id=in.(${promptIds.join(",")})`, { method: "DELETE" });
  await server.shutdown();
});
