// Local rehearsal of the T2 tooling for E1 to E3 (docs/release/PROVIDER-TESTS.md section 6): a new
// disposable account made and onboarded with scripts/provider-member.mjs, its one response uploaded
// as the app does (including partial, lost and refused transfers), the protected-account guards, and
// E1, E2 and both E3 outcomes through scripts/provider-drain.sh. Read-only checks go through
// scripts/provider-check.mjs. LOCAL STACK ONLY; run with scripts/provider-rehearsal.sh, which serves
// the functions with fake-only settings (MUX_API_BASE pointing at this test's fake Mux).
//
// Local accounts are made with the real T1 and founder ids, so the guards built into the scripts are
// what is tested, not an override. The fake Mux makes an asset from a complete transfer of an MP4
// (bytes 4..8 "ftyp"), keeps an upload waiting after a cut transfer (Mux documents both), and can be
// told to fail once in the two ambiguous ways the tooling must survive: Mux makes the upload but its
// answer is an error, and Mux takes the whole file but the PUT's answer is lost.
import { assert, assertEquals } from "./assert.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DB = Deno.env.get("DB_CONTAINER") ?? "";
const STACK = Deno.env.get("STACK_DIR") ?? "";
const PORT = Number(Deno.env.get("FAKE_MUX_PORT") ?? "55713");
const KEY = Deno.env.get("CLEANUP_KEY") ?? "provider-rehearsal-cleanup-key";
const CLIP = Deno.env.get("T2_CLIP") ?? "";
const REPO = new URL("../../../", import.meta.url).pathname;
if (!API || !ANON || !SERVICE || !DB || !STACK || !CLIP) throw new Error("set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DB_CONTAINER, STACK_DIR and T2_CLIP");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error("local stack only");
const GATEWAY = DB.replace("supabase_db_", "supabase_kong_");
const run = Date.now().toString(36);
const scratch = await Deno.makeTempDir();
const T1_ID = "b0c14e38-4e89-4dbd-a9a3-8a8c01872a78";
const FOUNDER_ID = "70046556-4209-4471-b5bb-a770aee12466";

// ---------------------------------------------------------------------------
// Fake Mux
type Upload = { id: string; status: string; asset_id?: string; passthrough: string; bytes: number; puts: number };
type Asset = { id: string; status: string; passthrough: string; upload_id: string; playback_ids: { id: string; policy: string }[]; created_at: string; duration: number };
const uploads = new Map<string, Upload>();
const assets = new Map<string, Asset>();
const calls: { method: string; path: string }[] = [];
const fault = { createUploadAnswerFails: false, putAnswerLost: false };
let seq = 0;
const server = Deno.serve({ hostname: "0.0.0.0", port: PORT, onListen: () => {} }, async (req) => {
  const url = new URL(req.url);
  const p = url.pathname;
  calls.push({ method: req.method, path: p });
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\/upload\/([A-Za-z0-9]+)$/)) && req.method === "PUT") {
    const u = uploads.get(m[1]);
    const declared = Number(req.headers.get("content-length") ?? "0");
    const parts: Uint8Array[] = [];
    let got = 0;
    try {
      for await (const chunk of req.body ?? []) { parts.push(chunk); got += chunk.length; }
    } catch {
      // The transfer was cut.
    }
    if (!u) return new Response(null, { status: 404 });
    u.puts += 1;
    u.bytes += got;
    if (got < declared || u.status !== "waiting") return new Response(null, { status: 400 }); // cut, or not waiting: nothing kept
    const head = new TextDecoder().decode(parts[0]?.subarray(4, 8) ?? new Uint8Array());
    if (head !== "ftyp") { u.status = "errored"; return new Response(null, { status: 200 }); }
    const a: Asset = { id: `ast2${run}n${++seq}`, status: "ready", passthrough: u.passthrough, upload_id: u.id, playback_ids: [{ id: `pbt2${run}n${++seq}`, policy: "public" }], created_at: String(Math.floor(Date.now() / 1000)), duration: 6 };
    assets.set(a.id, a);
    u.status = "asset_created";
    u.asset_id = a.id;
    if (fault.putAnswerLost) { fault.putAnswerLost = false; return new Response("bad gateway", { status: 502 }); }
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
    const id = `upt2${run}n${++seq}`;
    uploads.set(id, { id, status: "waiting", passthrough: body?.new_asset_settings?.passthrough ?? "", bytes: 0, puts: 0 });
    if (fault.createUploadAnswerFails) { fault.createUploadAnswerFails = false; return Response.json({ error: { type: "server_error" } }, { status: 500 }); }
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
    if (req.method === "DELETE") { assets.delete(a.id); return new Response(null, { status: 204 }); }
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
    const id = `pbt2${run}n${++seq}`;
    a.playback_ids.push({ id, policy: "public" });
    return Response.json({ data: { id, policy: "public" } }, { status: 201 });
  }
  return Response.json({ error: "fake: no route" }, { status: 404 });
});
/** Mux calls that change something (not reads, not transfers, not new upload URLs). */
const changes = () => calls.filter((c) => c.method !== "GET" && !c.path.startsWith("/upload/") && c.path !== "/video/v1/uploads");
const assetsOf = (owner: string) => [...assets.values()].filter((a) => a.passthrough === owner);
const uploadsOf = (owner: string) => [...uploads.values()].filter((u) => u.passthrough === owner);

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
  // The caller's environment minus any PT_* or PROVIDER_* setting, so no hosted flag or other
  // member's file can leak in; only what this call passes is set.
  const keep = Object.fromEntries(Object.entries(Deno.env.toObject()).filter(([k]) => !/^(PT_|PROVIDER_)/.test(k)));
  const out = await new Deno.Command(cmd, { args, cwd: REPO, env: { ...keep, ...env }, clearEnv: true, stdout: "piped", stderr: "piped" }).output();
  const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
  let json: Record<string, unknown> | null = null;
  const start = text.indexOf("{");
  try { json = start >= 0 ? JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) : null; } catch { json = null; }
  return { code: out.code, out: text, json };
}
function noSecrets(r: Run, label: string) {
  assert(!/storage\.example|sig=secret|eyJ|sb_secret|rehearsal-secret|@example\.com|[A-Z0-9]{2,12}-[A-Z0-9]{2,8}"/.test(r.out), `${label}: no upload URL, token, key, address or invite code in the output:\n${r.out}`);
}

/** One test account's files, as provider-env.sh lays them out (here in a scratch folder). */
type Member = { name: string; email: string; id: string; dir: string; env: Record<string, string> };
function files(name: string, email: string): Member {
  const dir = `${scratch}/${name}`;
  Deno.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const env = {
    PT_SUPABASE_URL: API, PT_ANON_KEY: ANON, PT_LOCAL_UPLOAD_BASE: `http://127.0.0.1:${PORT}`,
    PT_TOKEN_FILE: `${dir}/token`, PT_ID_FILE: `${dir}/id`, PT_JOURNAL_FILE: `${dir}/respond.json`, PT_SETTLE_MS: "500",
  };
  return { name, email, id: "", dir, env };
}
const pm = (m: Member, ...args: string[]) => script("node", ["scripts/provider-member.mjs", ...args], { ...m.env, ...(m.id ? { PT_EXPECT_USER: m.id } : {}) });
const otpOf = async (email: string) => ((await http("/auth/v1/admin/generate_link", { method: "POST", body: { type: "magiclink", email } })).json as { email_otp: string }).email_otp;
/** A fresh sign-in (delete_account wants one from the last 10 minutes). */
async function signIn(m: Member) {
  const v = await pm(m, "verify", m.email, await otpOf(m.email));
  assertEquals([v.code, v.json?.token_saved], [0, true], v.out);
}
async function newInvite(m: Member) {
  const code = await sql("select public.team_create_invite(null, 'canggu', null, null)");
  await Deno.writeTextFile(`${m.dir}/invite`, code, { mode: 0o600 });
}
/** A new test account the way CP0'-a makes T2: otp --create, verify --new, then onboard. */
async function createMember(name: string): Promise<Member> {
  const m = files(name, `t2-${name}-${run}@example.com`);
  const o = await pm(m, "otp", m.email, "--create");
  assertEquals([o.code, o.json?.http], [0, 200], o.out);
  noSecrets(o, "otp --create");
  const v = await pm(m, "verify", m.email, await otpOf(m.email), "--new");
  assertEquals([v.code, v.json?.new_account, v.json?.id_recorded], [0, true, true], v.out);
  m.id = (await Deno.readTextFile(m.env.PT_ID_FILE)).trim();
  assertEquals(m.id, v.json?.user);
  disposable.push(m.id);
  assertEquals((await Deno.stat(m.env.PT_ID_FILE)).mode! & 0o777, 0o600, "id file mode 600");
  await newInvite(m);
  const ob = await pm(m, "onboard", "--invite-file", `${m.dir}/invite`, "--name", `test ${name}`, "--username", `t2${name}${run}`.slice(0, 20));
  assertEquals([ob.code, ob.json?.reason], [0, "onboarded"], ob.out);
  noSecrets(ob, "onboard");
  return m;
}
const journal = async (m: Member) => JSON.parse(await Deno.readTextFile(m.env.PT_JOURNAL_FILE));
const rowsOf = async (id: string) => (await http(`/rest/v1/responses?author_id=eq.${id}&select=id,status,mux_upload_id,mux_asset_id,mux_playback_id&order=created_at`)).json as { id: string; status: string; mux_upload_id: string; mux_asset_id: string | null; mux_playback_id: string | null }[];
type Job = { id: string; action: string; reason: string; status: string; result: Record<string, unknown> | null; upload_id: string | null; asset_id: string | null; owner_id: string | null };
const jobs = async (where: string) => (await http(`/rest/v1/mux_cleanup_jobs?${where}&select=id,action,reason,status,result,upload_id,asset_id,owner_id&order=created_at`)).json as Job[];
const due = async () => (await http(`/rest/v1/mux_cleanup_jobs?status=eq.pending&not_before=lte.${encodeURIComponent(new Date().toISOString())}&select=id`)).json as { id: string }[];
const drain = (mode: "dry_run" | "live", ids: string[]) =>
  script("bash", ["scripts/provider-drain.sh", `local:${STACK}`, mode, `t2 rehearsal ${run} ${mode}`, ids.length ? ids.join(",") : "none"]);
const muxEnvFile = `${scratch}/mux-fake.env`;
await Deno.writeTextFile(muxEnvFile, `MUX_TOKEN_ID=rehearsal-id\nMUX_TOKEN_SECRET=rehearsal-secret\nMUX_API_BASE=http://127.0.0.1:${PORT}\nMUX_STREAM_BASE=http://127.0.0.1:${PORT}\nMUX_IMAGE_BASE=http://127.0.0.1:${PORT}\n`, { mode: 0o600 });
const check = (...args: string[]) => script("node", ["scripts/provider-check.mjs", ...args], {});
const muxRead = (...args: string[]) => script("node", [`--env-file=${muxEnvFile}`, "scripts/provider-mux-read.mjs", ...args], {});
const baseline = `${scratch}/baseline.json`;
/** Every disposable account this run made (T2 and the extra ones for the upload cases). */
const disposable: string[] = [];
const saveBaseline = async () => assertEquals((await check("save", `local:${STACK}`, baseline, ...(disposable.length ? ["--t2", disposable.join(",")] : []), "--mux", muxEnvFile)).code, 0);
/** Nothing protected changed since the last baseline: T1, the founder, and every asset that is not a
 *  disposable account's. A fresh baseline is taken before each operation, as on hosted. */
async function unchanged(label: string) {
  const c = await check("compare", `local:${STACK}`, baseline, ...(disposable.length ? ["--t2", disposable.join(",")] : []), "--mux", muxEnvFile);
  assertEquals(c.code, 0, `${label}: protected state changed:\n${c.out}`);
}

// ---------------------------------------------------------------------------
// Clean start (this local database only), as provider_rehearsal_test.ts.
await http("/rest/v1/mux_cleanup_jobs?status=in.(pending,running)", { method: "PATCH", body: { status: "skipped", lease_id: null, locked_until: null, result: { outcome: "set_aside_by_rehearsal", run } } });
await sql(`select public.mux_cleanup_set_mode('off', ${lit(`t2-rehearsal-${run}`)})`);
await sql("delete from vault.secrets where name in ('mux_cleanup_url', 'mux_cleanup_key')");
await sql(`select vault.create_secret(${lit(`http://${GATEWAY}:8000/functions/v1/mux-cleanup`)}, 'mux_cleanup_url')`);
await sql(`select vault.create_secret(${lit(KEY)}, 'mux_cleanup_key')`);
const inviteRequiredBefore = await sql("select invite_required from public.app_config");
await sql("update public.app_config set invite_required = true");
const promptId = (((await http("/rest/v1/prompts", { method: "POST", body: { text: `T2 rehearsal ${run}`, status: "live", published_at: new Date().toISOString() } })).json) as { id: string }[])[0].id;

/** Local stand-ins with the REAL T1 and founder ids, each with one live video at the fake Mux. */
async function protectedMember(id: string, name: string) {
  const email = `protected-${name}-${run}@example.com`;
  await http(`/auth/v1/admin/users/${id}`, { method: "DELETE" }); // a leftover from an earlier run
  const created = await http("/auth/v1/admin/users", { method: "POST", body: { id, email, email_confirm: true } });
  assertEquals(created.status, 200, JSON.stringify(created.json));
  await http("/rest/v1/profiles", { method: "POST", body: { id, name, username: `pr${name}${run}`.slice(0, 20) } });
  const now = new Date().toISOString();
  await http(`/rest/v1/accounts?id=eq.${id}`, { method: "PATCH", body: { age_confirmed_at: now, public_disclosure_ack_at: now } });
  const a: Asset = { id: `aspt${name}${run}`, status: "ready", passthrough: id, upload_id: `uppt${name}${run}`, playback_ids: [{ id: `pbpt${name}${run}`, policy: "public" }], created_at: String(Math.floor(Date.now() / 1000)), duration: 6 };
  assets.set(a.id, a);
  await http("/rest/v1/video_uploads", { method: "POST", body: { account_id: id, upload_id: a.upload_id, status: "claimed" } });
  const r = await http("/rest/v1/responses", { method: "POST", body: { prompt_id: promptId, author_id: id, duration_ms: 6000, status: "live", mux_upload_id: a.upload_id, mux_asset_id: a.id, mux_playback_id: a.playback_ids[0].id, live_at: now } });
  assertEquals(r.status, 201);
  // A real session, as the iPhone holds for T1.
  const v = await http("/auth/v1/verify", { method: "POST", key: ANON, body: { type: "email", email, token: await otpOf(email) } });
  return { id, email, token: (v.json as { access_token: string }).access_token, asset: a };
}
const T1 = await protectedMember(T1_ID, "t1");
const FOUNDER = await protectedMember(FOUNDER_ID, "founder");
await saveBaseline();
let T2: Member;

// ---------------------------------------------------------------------------
Deno.test("guards: no acting command runs as T1 or the founder, whatever PT_EXPECT_USER says", async () => {
  calls.length = 0;
  for (const who of [T1, FOUNDER]) {
    const m = files(`guard-${who.id.slice(0, 4)}`, who.email);
    await Deno.writeTextFile(m.env.PT_TOKEN_FILE, who.token, { mode: 0o600 });
    for (const expect of [who.id, crypto.randomUUID(), ""]) {
      const env = { ...m.env, PT_EXPECT_USER: expect, PT_PROTECTED_IDS: "" };
      for (const args of [["delete-account"], ["sign-in-state"], ["abandon", crypto.randomUUID()], ["c2", "--reply-to", crypto.randomUUID()], ["onboard", "--invite-file", "x", "--name", "x", "--username", "x"], ["respond", "--prompt", promptId, "--file", CLIP], ["status"]]) {
        const r = await script("node", ["scripts/provider-member.mjs", ...args], env);
        assertEquals(r.code, 2, `${args[0]} as ${who.id.slice(0, 8)} (expect ${expect.slice(0, 8) || "unset"}) must be refused:\n${r.out}`);
      }
    }
    // A sign-in as a protected account is refused before anything is sent.
    const v = await script("node", ["scripts/provider-member.mjs", "verify", who.email, "123456"], { ...m.env, PT_EXPECT_USER: who.id });
    assertEquals(v.code, 2, v.out);
  }
  assertEquals(await sql(`select count(*) from public.accounts where id in (${lit(T1.id)}, ${lit(FOUNDER.id)}) and deleted_at is null`), "2", "neither was deleted");
  assertEquals(calls.length, 0, "nothing reached Mux");
  await unchanged("guards");
});

Deno.test("T2 creation: --create refuses an address that has an account; a new address gets one code; verify --new records the id", async () => {
  const before = await sql(`select count(*) from auth.one_time_tokens where user_id = ${lit(T1.id)}`);
  const taken = files("taken", T1.email);
  const r = await pm(taken, "otp", T1.email, "--create");
  assertEquals(r.code, 2, r.out);
  assertEquals(await sql(`select count(*) from auth.one_time_tokens where user_id = ${lit(T1.id)}`), before, "no code was sent to T1");
  T2 = await createMember("main");
  assertEquals(await sql(`select count(*) from public.invites where redeemed_by = ${lit(T2.id)}`), "1");
  assertEquals(await sql(`select username like 't2main%' from public.profiles where id = ${lit(T2.id)}`), "t");
});

Deno.test("T2 creation refuses: an id already recorded, an old account, an onboarded account, another account than expected", async () => {
  // 1. The id file exists: verify --new sends nothing.
  const again = await pm({ ...T2, id: "" }, "verify", T2.email, "123456", "--new");
  assertEquals(again.code, 2, again.out);
  // 2. An account made long ago.
  const old = files("old", `t2-old-${run}@example.com`);
  const oldUser = (await http("/auth/v1/admin/users", { method: "POST", body: { email: old.email, email_confirm: true } })).json as { id: string };
  await sql(`update auth.users set created_at = now() - interval '2 hours' where id = ${lit(oldUser.id)}`);
  const o = await pm(old, "verify", old.email, await otpOf(old.email), "--new");
  assertEquals(o.code, 3, o.out);
  assert(!(await exists(old.env.PT_TOKEN_FILE)) && !(await exists(old.env.PT_ID_FILE)), "token removed, no id written");
  // 3. A new account that is already onboarded.
  const ob = files("onboarded", `t2-onb-${run}@example.com`);
  const obUser = (await http("/auth/v1/admin/users", { method: "POST", body: { email: ob.email, email_confirm: true } })).json as { id: string };
  await http("/rest/v1/profiles", { method: "POST", body: { id: obUser.id, name: "x", username: `onb${run}`.slice(0, 20) } });
  await http(`/rest/v1/accounts?id=eq.${obUser.id}`, { method: "PATCH", body: { age_confirmed_at: new Date().toISOString() } });
  const b = await pm(ob, "verify", ob.email, await otpOf(ob.email), "--new");
  assertEquals(b.code, 3, b.out);
  assert(!(await exists(ob.env.PT_TOKEN_FILE)) && !(await exists(ob.env.PT_ID_FILE)), "token removed, no id written");
  // 4. A later sign-in that turns out to be another account than T2.
  const other = files("other", ob.email);
  const w = await script("node", ["scripts/provider-member.mjs", "verify", ob.email, await otpOf(ob.email)], { ...other.env, PT_EXPECT_USER: T2.id });
  assertEquals(w.code, 3, w.out);
  assert(!(await exists(other.env.PT_TOKEN_FILE)), "token removed");
  // 5. onboard with another username than T2's profile is refused.
  const u = await pm(T2, "onboard", "--invite-file", `${T2.dir}/invite`, "--name", "x", "--username", "someoneelse");
  assertEquals(u.code, 2, u.out);
  await unchanged("creation refusals");
});
async function exists(p: string) {
  try { await Deno.stat(p); return true; } catch { return false; }
}

Deno.test("respond: a transfer cut part-way leaves Mux waiting; --resume asks Mux first, then sends the file again to the same URL; one asset", async () => {
  calls.length = 0;
  const r = await pm(T2, "respond", "--prompt", promptId, "--file", CLIP, "--cut-after", "65536");
  assertEquals(r.code, 1, r.out);
  noSecrets(r, "respond");
  const j = await journal(T2);
  assertEquals(j.phase, "put_uncertain");
  assertEquals((await Deno.stat(T2.env.PT_JOURNAL_FILE)).mode! & 0o777, 0o600, "journal mode 600");
  assertEquals([uploads.get(j.uploadId)?.status, uploads.get(j.uploadId)?.bytes, assetsOf(T2.id).length], ["waiting", 65536, 0]);
  const s = await pm(T2, "status");
  assertEquals([s.code, (s.json?.mux as Record<string, unknown>).uploadStatus], [0, "waiting"], s.out);
  noSecrets(s, "status");
  const puts = uploads.get(j.uploadId)!.puts;
  assertEquals(puts, 1, "status sent nothing");
  const done = await pm(T2, "respond", "--resume");
  assertEquals([done.code, done.json?.reason], [0, "live"], done.out);
  noSecrets(done, "resume");
  const steps = done.json?.steps as Record<string, unknown>[];
  assertEquals(steps.map((x) => x.step), ["inspect", "inspect again", "put", "until live"], "inspected twice before sending");
  assertEquals(steps.filter((x) => x.step === "mint").length, 0, "no new URL");
  assertEquals(uploadsOf(T2.id).length, 1, "one upload");
  assertEquals(assetsOf(T2.id).length, 1, "one asset");
  const rows = await rowsOf(T2.id);
  assertEquals(rows.map((x) => [x.status, x.mux_upload_id, x.mux_asset_id]), [["live", j.uploadId, assetsOf(T2.id)[0].id]]);
  assertEquals((await journal(T2)).phase, "live");
  // Resuming a live response sends nothing.
  const n = calls.length;
  assertEquals((await pm(T2, "respond", "--resume")).json?.reason, "already live; nothing sent");
  assertEquals(calls.length, n);
  await unchanged("respond");
});

Deno.test("respond: a second video for the same account is refused, by the journal and by the account's rows", async () => {
  const again = await pm(T2, "respond", "--prompt", promptId, "--file", CLIP);
  assertEquals(again.code, 2, again.out);
  const kept = await Deno.readTextFile(T2.env.PT_JOURNAL_FILE);
  await Deno.remove(T2.env.PT_JOURNAL_FILE);
  const noJournal = await pm(T2, "respond", "--prompt", promptId, "--file", CLIP);
  assertEquals(noJournal.code, 2, noJournal.out);
  assert(/already has 1 response/.test(noJournal.out), noJournal.out);
  await Deno.writeTextFile(T2.env.PT_JOURNAL_FILE, kept, { mode: 0o600 });
  assertEquals(uploadsOf(T2.id).length, 1, "no new URL");
});

Deno.test("ambiguous: Mux took the whole file but the PUT's answer was lost: --resume finds the asset and sends nothing again", async () => {
  const m = await createMember("lostput");
  fault.putAnswerLost = true;
  const r = await pm(m, "respond", "--prompt", promptId, "--file", CLIP);
  assertEquals([r.code, (await journal(m)).phase], [1, "put_uncertain"], r.out);
  assertEquals(assetsOf(m.id).length, 1, "Mux made the asset although the answer was an error");
  const done = await pm(m, "respond", "--resume");
  assertEquals([done.code, done.json?.reason], [0, "live"], done.out);
  const steps = done.json?.steps as Record<string, unknown>[];
  assertEquals(steps.filter((x) => x.step === "put" || x.step === "mint").length, 0, "no second transfer, no new URL");
  assertEquals([uploadsOf(m.id).length, uploadsOf(m.id)[0].puts, assetsOf(m.id).length], [1, 1, 1]);
});

Deno.test("ambiguous: Mux made an upload but answered with an error: no row, no bytes, no asset; --resume mints once", async () => {
  const m = await createMember("mintfail");
  fault.createUploadAnswerFails = true;
  const r = await pm(m, "respond", "--prompt", promptId, "--file", CLIP);
  assertEquals([r.code, (await journal(m)).phase], [1, "mint_failed"], r.out);
  assertEquals((await rowsOf(m.id)).length, 0, "no row");
  const orphan = uploadsOf(m.id);
  assertEquals(orphan.map((u) => [u.status, u.bytes]), [["waiting", 0]], "the upload Mux made holds nothing, so it can make no asset");
  const done = await pm(m, "respond", "--resume");
  assertEquals([done.code, done.json?.reason], [0, "live"], done.out);
  assertEquals(uploadsOf(m.id).length, 2, "one more URL");
  assertEquals(assetsOf(m.id).length, 1, "one asset");
  assertEquals(uploads.get(orphan[0].id)?.bytes, 0, "nothing ever sent to the failed one");
});

Deno.test("idempotent: the answer to post_response was lost: --resume asks again with the same submission and gets the same row", async () => {
  const m = await createMember("replay");
  const r = await pm(m, "respond", "--prompt", promptId, "--file", CLIP, "--cut-after", "4096");
  assertEquals(r.code, 1, r.out);
  const j = await journal(m);
  const first = j.responseId;
  delete j.responseId;
  j.phase = "post_unknown";
  await Deno.writeTextFile(m.env.PT_JOURNAL_FILE, JSON.stringify(j), { mode: 0o600 });
  const done = await pm(m, "respond", "--resume");
  assertEquals([done.code, done.json?.reason], [0, "live"], done.out);
  const post = (done.json?.steps as Record<string, unknown>[]).find((x) => x.step === "post_response")!;
  assertEquals([post.responseId, post.replayed], [first, true], "the same row, replayed");
  assertEquals((await rowsOf(m.id)).length, 1, "one row");
  assertEquals(await sql(`select count(*) from public.post_submissions where account_id = ${lit(m.id)}`), "1", "one submission");
  assertEquals([uploadsOf(m.id).length, assetsOf(m.id).length], [1, 1]);
});

Deno.test("refused: an upload Mux reports cancelled or errored is never retried blindly; --new-upload only after Mux proves it empty", async () => {
  const m = await createMember("cancelled");
  const r = await pm(m, "respond", "--prompt", promptId, "--file", CLIP, "--cut-after", "4096");
  assertEquals(r.code, 1, r.out);
  const old = (await journal(m)).uploadId;
  uploads.get(old)!.status = "cancelled"; // as after a cancel or a timeout at Mux
  const n = uploadsOf(m.id).length;
  const stop = await pm(m, "respond", "--resume");
  assertEquals(stop.code, 1, stop.out);
  assert(/--new-upload/.test(String(stop.json?.reason)), stop.out);
  assertEquals([uploadsOf(m.id).length, uploads.get(old)!.puts], [n, 1], "no new URL and nothing sent");
  const go = await pm(m, "respond", "--resume", "--new-upload");
  assertEquals([go.code, go.json?.reason], [0, "live"], go.out);
  assertEquals(assetsOf(m.id).length, 1, "one asset");
  const queued = await jobs(`upload_id=eq.${old}&status=eq.pending`);
  assertEquals(queued.map((x) => [x.action, x.reason]), [["cancel_upload", "abandoned"]], "the row's old upload gets the usual cancel job");
  // That job closes with a GET only: Mux already reports the upload cancelled.
  calls.length = 0;
  const closing = await drain("live", [queued[0].id]);
  assertEquals(closing.code, 0, `${closing.out}\n${JSON.stringify(await jobs(`id=eq.${queued[0].id}`))}`);
  assertEquals([(await jobs(`id=eq.${queued[0].id}`))[0].status, changes().length], ["done", 0], `closed with no change at Mux: ${JSON.stringify(await jobs(`id=eq.${queued[0].id}`))}`);

  const e = await createMember("errored");
  assertEquals((await pm(e, "respond", "--prompt", promptId, "--file", CLIP, "--cut-after", "4096")).code, 1);
  const eu = (await journal(e)).uploadId;
  uploads.get(eu)!.status = "errored";
  const es = await pm(e, "respond", "--resume", "--new-upload");
  assertEquals(es.code, 1, es.out);
  assertEquals([uploadsOf(e.id).length, uploads.get(eu)!.puts, assetsOf(e.id).length], [1, 1, 0], "errored: nothing sent, no new URL, no asset");
  await unchanged("upload cases");
});

// ---------------------------------------------------------------------------
Deno.test("E1: T2 deletes the account: one playback job; dry run plans the revocation; live revokes; the asset stays", async () => {
  await saveBaseline(); // a fresh baseline per operation
  calls.length = 0;
  const V2 = (await rowsOf(T2.id))[0];
  await signIn(T2);
  const d = await pm(T2, "delete-account");
  assertEquals(d.json?.http, 204, d.out);
  assertEquals((await pm(T2, "sign-in-state")).json?.error, "session_revoked", "the deletion ended the session");
  assertEquals(await sql(`select deleted_at is not null from public.accounts where id = ${lit(T2.id)}`), "t", "a refused call restores nothing");
  const queued = await jobs(`response_id=eq.${V2.id}&status=eq.pending`);
  assertEquals(queued.map((j) => [j.action, j.reason]), [["sync_playback", "account_deleted"]]);
  assertEquals((await due()).map((x) => x.id), [queued[0].id], "exactly this job is due");
  assertEquals((await drain("dry_run", [queued[0].id])).code, 0);
  const plan = (await jobs(`id=eq.${queued[0].id}`))[0].result as Record<string, unknown>;
  assertEquals([(plan.would as Record<string, unknown>)?.direction, (plan.would as Record<string, unknown>)?.would_revoke], ["revoke", [V2.mux_playback_id]]);
  assertEquals(changes(), []);
  assertEquals((await drain("live", [queued[0].id])).code, 0);
  assertEquals((await jobs(`id=eq.${queued[0].id}`))[0].result?.outcome, "revoked");
  assertEquals(changes().map((c) => `${c.method} ${c.path}`), [`DELETE /video/v1/assets/${V2.mux_asset_id}/playback-ids/${V2.mux_playback_id}`]);
  assertEquals((await muxRead("playback", V2.mux_playback_id!)).json?.hls, 404);
  assertEquals((await muxRead("asset", V2.mux_asset_id!)).json?.http, 200, "the asset is kept");
  const st = await check("state", `local:${STACK}`, "--t2", T2.id);
  assertEquals([st.code, (st.json as Record<string, unknown>).mode, ((st.json as Record<string, unknown>).open_jobs as unknown[]).length], [0, "off", 0], st.out);
  await unchanged("E1");
});

Deno.test("E2: the old session is refused; a new sign-in restores T2; a live drain gives V2 a new public id on the same asset", async () => {
  await saveBaseline();
  calls.length = 0;
  const V2 = (await rowsOf(T2.id))[0];
  const stale = await pm(T2, "sign-in-state");
  assertEquals(stale.json?.error, "session_revoked", stale.out);
  await signIn(T2);
  const s = await pm(T2, "sign-in-state");
  assertEquals(s.json?.http, 200, s.out);
  assertEquals(await sql(`select deleted_at is null from public.accounts where id = ${lit(T2.id)}`), "t");
  const queued = await jobs(`response_id=eq.${V2.id}&status=eq.pending`);
  assertEquals(queued.map((j) => [j.action, j.reason]), [["sync_playback", "account_restored"]]);
  assertEquals((await drain("dry_run", [queued[0].id])).code, 0);
  assertEquals(((await jobs(`id=eq.${queued[0].id}`))[0].result?.would as Record<string, unknown>)?.direction, "restore");
  assertEquals((await drain("live", [queued[0].id])).code, 0);
  assertEquals((await jobs(`id=eq.${queued[0].id}`))[0].result?.outcome, "restored");
  const now = (await rowsOf(T2.id))[0];
  assert(now.mux_playback_id && now.mux_playback_id !== V2.mux_playback_id, "a new playback id");
  assertEquals([now.mux_asset_id, assets.get(now.mux_asset_id!)!.playback_ids.map((p) => p.id)], [V2.mux_asset_id, [now.mux_playback_id]], "same asset, exactly the new id");
  assertEquals((await muxRead("playback", now.mux_playback_id!)).json?.hls, 200);
  await unchanged("E2");
});

// KNOWN DEFECT, found by this rehearsal (21 Oct; reported to Nemat, not fixed here): an account that
// redeemed an invite cannot be removed. invites.redeemed_by is `on delete set null` but redeemed_at
// stays, so the check invites_redeemed_pair refuses the row and the whole deletion rolls back: the
// 03:15 purge records a failure for it every day, and the Dashboard's "Delete user" answers 500. Every
// closed-beta member redeemed an invite, T2 included. Each E3 test below first asserts the defect as it
// is, then clears that one account's redemption BY HAND, locally, as a stand-in for a fix, so the rest
// of the E3 tooling (jobs, drains, Mux calls) is still rehearsed. The stand-in is not a fix and proves
// nothing about the eventual one.
const standIn = (id: string) => sql(`update public.invites set redeemed_by = null, redeemed_at = null where redeemed_by = ${lit(id)}`);

Deno.test("E3 outcome (i), the automatic purge: deleted again and revoked; on day 31 the purge FAILS on the invite (known defect); with the stand-in it queues delete_asset/account_purged and a live drain deletes the asset", async () => {
  await saveBaseline();
  const V2 = (await rowsOf(T2.id))[0];
  await signIn(T2);
  assertEquals((await pm(T2, "delete-account")).json?.http, 204);
  const e3a = await jobs(`response_id=eq.${V2.id}&status=eq.pending`);
  assertEquals(e3a.map((j) => [j.action, j.reason]), [["sync_playback", "account_deleted"]]);
  assertEquals((await drain("dry_run", [e3a[0].id])).code, 0);
  assertEquals((await drain("live", [e3a[0].id])).code, 0);
  assertEquals((await jobs(`id=eq.${e3a[0].id}`))[0].result?.outcome, "revoked");
  // Day 31, locally only: the deletion moved back; the 03:15 job's function itself runs.
  await sql(`update public.accounts set deleted_at = now() - interval '31 days' where id = ${lit(T2.id)}`);
  assertEquals(await sql("select public.purge_deleted_accounts()"), "0", "the defect: nothing purged");
  assert((await sql(`select last_error from public.account_purge_failures where account_id = ${lit(T2.id)}`)).includes("invites_redeemed_pair"), "the failure is recorded, with the constraint named");
  assertEquals(await jobs(`asset_id=eq.${V2.mux_asset_id}&status=eq.pending`), [], "nothing queued: the asset would stay at Mux");
  assertEquals(await sql(`select count(*) from public.accounts where id = ${lit(T2.id)}`), "1", "the account stays, deleted but not purged");
  await standIn(T2.id);
  assertEquals(await sql("select public.purge_deleted_accounts()"), "1");
  assertEquals(await sql(`select count(*) from public.account_purge_failures where account_id = ${lit(T2.id)}`), "0", "the failure row is cleared on success");
  const e3b = await jobs(`asset_id=eq.${V2.mux_asset_id}&status=eq.pending`);
  assertEquals(e3b.map((j) => [j.action, j.reason, j.owner_id]), [["delete_asset", "account_purged", T2.id]]);
  calls.length = 0;
  assertEquals((await drain("dry_run", [e3b[0].id])).code, 0);
  assertEquals(changes(), []);
  assertEquals((await drain("live", [e3b[0].id])).code, 0);
  assertEquals((await jobs(`id=eq.${e3b[0].id}`))[0].result?.outcome, "deleted");
  assertEquals(changes().map((c) => `${c.method} ${c.path}`), [`DELETE /video/v1/assets/${V2.mux_asset_id}`]);
  assertEquals((await muxRead("asset", V2.mux_asset_id!)).json?.http, 404);
  assertEquals(await sql(`select count(*) from public.accounts where id = ${lit(T2.id)}`), "0", "the account is gone");
  await unchanged("E3 (i)");
});

Deno.test("E3 outcome (ii), deleting the Auth user by hand: FAILS on the invite too (known defect); with the stand-in it is a different path (delete_asset/account_removed, no purge) that does not stand in for (i)", async () => {
  const m = await createMember("manual");
  assertEquals((await pm(m, "respond", "--prompt", promptId, "--file", CLIP)).json?.reason, "live");
  await saveBaseline();
  const V = (await rowsOf(m.id))[0];
  // What the Dashboard's "Delete user" does: the Auth user is removed at once, with no 30 days.
  assertEquals((await http(`/auth/v1/admin/users/${m.id}`, { method: "DELETE" })).status, 500, "the defect: the deletion is refused");
  assertEquals(await sql(`select count(*) from auth.users where id = ${lit(m.id)}`), "1", "nothing was removed");
  assertEquals(await jobs(`asset_id=eq.${V.mux_asset_id}&status=eq.pending`), [], "nothing queued");
  await standIn(m.id);
  assertEquals((await http(`/auth/v1/admin/users/${m.id}`, { method: "DELETE" })).status, 200);
  const queued = await jobs(`asset_id=eq.${V.mux_asset_id}&status=eq.pending`);
  assertEquals(queued.map((j) => [j.action, j.reason]), [["delete_asset", "account_removed"]], "account_removed, not account_purged: purge_deleted_accounts() never ran");
  calls.length = 0;
  assertEquals((await drain("dry_run", [queued[0].id])).code, 0);
  assertEquals((await drain("live", [queued[0].id])).code, 0);
  assertEquals((await jobs(`id=eq.${queued[0].id}`))[0].result?.outcome, "deleted");
  assertEquals(changes().map((c) => `${c.method} ${c.path}`), [`DELETE /video/v1/assets/${V.mux_asset_id}`]);
  await unchanged("E3 (ii)");
});

Deno.test("protected at the end: T1's and the founder's accounts, videos, sessions and assets are as at the start", async () => {
  for (const who of [T1, FOUNDER]) {
    assertEquals(await sql(`select deleted_at is null from public.accounts where id = ${lit(who.id)}`), "t");
    assertEquals(assets.get(who.asset.id)?.playback_ids.map((p) => p.id), [who.asset.playback_ids[0].id]);
    assertEquals((await rowsOf(who.id)).map((r) => [r.status, r.mux_playback_id]), [["live", who.asset.playback_ids[0].id]]);
    assertEquals(await sql(`select count(*) from auth.sessions where user_id = ${lit(who.id)}`), "1", "its session is untouched");
  }
  assertEquals(await sql("select public.mux_cleanup_mode()"), "off");
});

Deno.test("cleanup: switch off, secrets removed, invite rule restored, this run's accounts and rows removed", async () => {
  await sql(`select public.mux_cleanup_set_mode('off', ${lit(`t2-rehearsal-${run} done`)})`);
  await sql("delete from vault.secrets where name in ('mux_cleanup_url', 'mux_cleanup_key')");
  await sql(`update public.app_config set invite_required = ${inviteRequiredBefore === "t" ? "true" : "false"}`);
  const ids = (await sql(`select coalesce(string_agg(id::text, ','), '') from auth.users where email like '%-${run}@example.com'`)).split(",").filter(Boolean);
  for (const id of ids) {
    await standIn(id); // the known defect would refuse the removal otherwise
    await http(`/rest/v1/responses?author_id=eq.${id}`, { method: "DELETE" });
    await http(`/auth/v1/admin/users/${id}`, { method: "DELETE" });
  }
  await http(`/rest/v1/mux_cleanup_jobs?status=eq.pending`, { method: "PATCH", body: { status: "skipped", result: { outcome: "set_aside_by_rehearsal", run } } });
  await http(`/rest/v1/prompts?id=eq.${promptId}`, { method: "DELETE" });
  await Deno.remove(scratch, { recursive: true });
  await server.shutdown();
});
