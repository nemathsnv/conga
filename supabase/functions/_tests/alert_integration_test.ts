// Integration test for the clean-up alerts (20261021000200) against a LOCAL stack: pg_cron ->
// public.mux_cleanup_alert() -> pg_net -> a fake Resend API served by this test. Resend is never
// contacted: mux_cleanup_alert_url points the messages at the fake, and only a local stack is
// accepted. Leaves no secret, row or schedule change behind.
//
//   SUPABASE_URL=... DB_CONTAINER=supabase_db_<project> ALERT_FAKE_PORT=55691 \
//     deno test --allow-env --allow-net --allow-run supabase/functions/_tests/alert_integration_test.ts
import { assert, assertEquals } from "./assert.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const DB = Deno.env.get("DB_CONTAINER") ?? "";
const PORT = Number(Deno.env.get("ALERT_FAKE_PORT") ?? "55691");
if (!API || !DB) throw new Error("set SUPABASE_URL and DB_CONTAINER");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error("local stack only");
if (DB === "supabase_db_shortcut") throw new Error("refusing the founder's stack (project_id shortcut)");

async function sql(statement: string): Promise<string> {
  const out = await new Deno.Command("docker", { args: ["exec", "-i", DB, "psql", "-U", "postgres", "-tA", "-v", "ON_ERROR_STOP=1", "-c", statement], stdout: "piped", stderr: "piped" }).output();
  if (!out.success) throw new Error(`psql: ${new TextDecoder().decode(out.stderr)}`);
  return new TextDecoder().decode(out.stdout).trim();
}
const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;
const KEY = "re_local_test_key";
const PURGE_ROW = "d0000000-0000-0000-0000-0000000a1e47";

// The fake Resend API: records each message and answers with the status a test asks for.
type Message = { auth: string | null; body: { from: string; to: string[]; subject: string; text: string } };
const received: Message[] = [];
let answer = 200;
const server = Deno.serve({ hostname: "0.0.0.0", port: PORT, onListen: () => {} }, async (req) => {
  if (req.method !== "POST" || new URL(req.url).pathname !== "/emails") return new Response("no route", { status: 404 });
  received.push({ auth: req.headers.get("Authorization"), body: await req.json() });
  return Response.json(answer < 300 ? { id: crypto.randomUUID() } : { name: "validation_error" }, { status: answer });
});
async function until<T>(what: string, f: () => Promise<T | null | undefined | false>, ms = 90_000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await f();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timed out waiting for ${what}`);
}
const alert = async (kind: string) => JSON.parse(await sql(`select public.mux_cleanup_alert(${lit(kind)})`));

const schedule = await sql("select schedule from cron.job where jobname = 'mux-cleanup-alert'");
const firstAlert = Number(await sql("select coalesce(max(id), 0) from public.mux_cleanup_alerts"));
await sql("delete from vault.secrets where name like 'mux_cleanup_alert_%'");
await sql(`select vault.create_secret(${lit(KEY)}, 'mux_cleanup_alert_key')`);
await sql(`select vault.create_secret('ops@example.com', 'mux_cleanup_alert_to')`);
await sql(`select vault.create_secret('Conga ops <ops@auth.example.com>', 'mux_cleanup_alert_from')`);
await sql(`select vault.create_secret(${lit(`http://host.docker.internal:${PORT}/emails`)}, 'mux_cleanup_alert_url')`);

Deno.test("a test message reaches the channel through pg_net, with the key and no ids", async () => {
  const r = await alert("test");
  assertEquals([r.sent, r.kind], [true, "test"]);
  const m = await until("the test message", async () => received.find((x) => x.body.subject.startsWith("Conga clean-up: test message")));
  assertEquals(m.auth, `Bearer ${KEY}`);
  assertEquals([m.body.from, m.body.to], ["Conga ops <ops@auth.example.com>", ["ops@example.com"]]);
  assert(m.body.text.includes("Emergency stop: select public.mux_cleanup_set_mode('off'"), "the text names the emergency stop");
  const ids = (await sql("select string_agg(coalesce(asset_id, upload_id), ',') from public.mux_cleanup_jobs")).split(",").filter(Boolean);
  for (const id of ids) assert(!m.body.text.includes(id) && !m.body.subject.includes(id), "no Mux id in the message");
});

Deno.test("the answer is collected; a refused message shows in the health check", async () => {
  await until("the delivery answer", async () => (await sql("select count(*) from net._http_response r join public.mux_cleanup_alerts a on a.request_id = r.id where a.kind = 'test'")) !== "0");
  await alert("auto");
  assertEquals(await sql(`select delivery_status from public.mux_cleanup_alerts where kind = 'test' and id > ${firstAlert} order by id desc limit 1`), "200");
  answer = 401;
  const sent = received.length;
  await alert("test");
  await until("the refused message", async () => received.length > sent);
  await until("its answer", async () => (await sql("select count(*) from net._http_response r join public.mux_cleanup_alerts a on a.request_id = r.id where a.id = (select max(id) from public.mux_cleanup_alerts)")) !== "0");
  await alert("auto");
  const h = JSON.parse(await sql("select public.mux_cleanup_health()"));
  assert(h.problems.some((p: { check: string }) => p.check === "alert_not_delivered"), "alert_not_delivered");
  answer = 200;
});

Deno.test("the schedule sends an alert on its own when a problem appears", async () => {
  // A purge failure is an alert; the schedule runs every minute for this test only.
  await sql(`insert into public.account_purge_failures (account_id, last_error) values (${lit(PURGE_ROW)}, 'alert test') on conflict do nothing`);
  await sql("update public.mux_cleanup_alerts set created_at = created_at - interval '2 hours' where kind in ('alert', 'reminder', 'recovery')");
  await sql("select cron.alter_job((select jobid from cron.job where jobname = 'mux-cleanup-alert'), schedule := '* * * * *')");
  const before = received.length;
  const m = await until("a scheduled alert", async () => received.slice(before).find((x) => x.body.subject.includes("purge_failures")), 150_000);
  assert(m.body.subject.startsWith("Conga clean-up: alert"), m.body.subject);
  assert(m.body.text.includes("alert purge_failures:"), "the problem is listed");
  assertEquals(await sql(`select kind from public.mux_cleanup_alerts where id > ${firstAlert} and kind <> 'test' order by id desc limit 1`), "alert");
});

Deno.test("cleanup: secrets, rows and the schedule as they were", async () => {
  await sql(`select cron.alter_job((select jobid from cron.job where jobname = 'mux-cleanup-alert'), schedule := ${lit(schedule)})`);
  await sql(`delete from public.account_purge_failures where account_id = ${lit(PURGE_ROW)}`);
  await sql(`delete from public.mux_cleanup_alerts where id > ${firstAlert}`);
  await sql("delete from vault.secrets where name like 'mux_cleanup_alert_%'");
  assertEquals(await sql("select schedule from cron.job where jobname = 'mux-cleanup-alert'"), schedule);
  await server.shutdown();
});
