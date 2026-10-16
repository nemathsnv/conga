// avatar-cleanup against the LOCAL stack only (20261016000203): real Storage uploads by a member,
// the photo replaced through set_profile_photo, the account purged, and the files really gone from
// the public bucket. Needs SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY of a local
// stack; refuses any other host.
//     deno test --allow-env --allow-net supabase/functions/_tests/avatar_cleanup_integration_test.ts
import { assert, assertEquals } from "./assert.ts";
import { handleAvatarCleanup } from "../avatar-cleanup/handler.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!API || !ANON || !SERVICE) throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error("local stack only");
const KEY = `avatar-test-${crypto.randomUUID()}`;
Deno.env.set("AVATAR_CLEANUP_KEY", KEY);
const run = Date.now().toString(36);

async function http(path: string, opts: { method?: string; key?: string; token?: string; body?: unknown; raw?: BodyInit; type?: string } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? "GET",
    headers: { apikey: opts.key ?? SERVICE, Authorization: `Bearer ${opts.token ?? opts.key ?? SERVICE}`, "Content-Type": opts.type ?? "application/json" },
    body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

async function member(name: string): Promise<{ id: string; token: string }> {
  const email = `avatar-${run}-${name}@example.com`;
  const created = await http("/auth/v1/admin/users", { method: "POST", body: { email, email_confirm: true } });
  const id = (created.json as { id: string }).id;
  const link = await http("/auth/v1/admin/generate_link", { method: "POST", body: { type: "magiclink", email } });
  const verified = await http("/auth/v1/verify", { method: "POST", key: ANON, body: { type: "email", email, token: (link.json as { email_otp: string }).email_otp } });
  assertEquals((await http("/rest/v1/profiles", { method: "POST", body: { id, name, username: `av${name}${run}`.slice(0, 24) } })).status, 201, "profile");
  return { id, token: (verified.json as { access_token: string }).access_token };
}

// A tiny JPEG-typed body; Storage checks the declared type against the bucket's allowed types.
const upload = (m: { token: string }, path: string) =>
  http(`/storage/v1/object/avatars/${path}`, { method: "POST", key: ANON, token: m.token, raw: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), type: "image/jpeg" });
const publicStatus = async (path: string) => (await fetch(`${API}/storage/v1/object/public/avatars/${path}`)).status;
const cleanup = (auth = `Bearer ${KEY}`) => handleAvatarCleanup(new Request("http://local/avatar-cleanup", { method: "POST", headers: { Authorization: auth } }));

Deno.test("avatar-cleanup refuses callers without the key", async () => {
  assertEquals((await cleanup("Bearer wrong")).status, 401);
  assertEquals((await cleanup("")).status, 401);
  assertEquals((await handleAvatarCleanup(new Request("http://local/avatar-cleanup", { method: "GET" }))).status, 405);
});

Deno.test("a replaced photo is removed from the public bucket; the current one stays", async () => {
  const lena = await member("lena");
  const first = `${lena.id}/avatar-1.jpg`, second = `${lena.id}/avatar-2.jpg`;
  assertEquals((await upload(lena, first)).status, 200, "upload 1");
  assertEquals((await http("/rest/v1/rpc/set_profile_photo", { method: "POST", key: ANON, token: lena.token, body: { p_path: first } })).status, 204);
  assertEquals((await upload(lena, second)).status, 200, "upload 2");
  assertEquals((await http("/rest/v1/rpc/set_profile_photo", { method: "POST", key: ANON, token: lena.token, body: { p_path: second } })).status, 204);
  assertEquals(await publicStatus(first), 200, "before the worker runs, the old photo is still public");
  const res = await cleanup();
  assertEquals(res.status, 200);
  assert(((await res.json()) as { removed: number }).removed >= 1, "removed");
  assert((await publicStatus(first)) >= 400, "the old photo is gone");
  assertEquals(await publicStatus(second), 200, "the current photo stays");
});

Deno.test("a purged account's photos are removed from the public bucket", async () => {
  const adam = await member("adam");
  const photo = `${adam.id}/avatar-1.jpg`, stray = `${adam.id}/avatar-0.jpg`;
  assertEquals((await upload(adam, stray)).status, 200);
  assertEquals((await upload(adam, photo)).status, 200);
  assertEquals((await http("/rest/v1/rpc/set_profile_photo", { method: "POST", key: ANON, token: adam.token, body: { p_path: photo } })).status, 204);
  assertEquals((await http(`/rest/v1/accounts?id=eq.${adam.id}`, { method: "PATCH", body: { deleted_at: new Date(Date.now() - 31 * 86_400_000).toISOString() } })).status, 204);
  assertEquals((await http("/rest/v1/rpc/purge_deleted_accounts", { method: "POST", body: {} })).status, 200);
  assertEquals((await http(`/auth/v1/admin/users/${adam.id}`)).status, 404, "purged");
  assertEquals(await publicStatus(photo), 200, "before the worker runs, it is still public");
  assertEquals((await cleanup()).status, 200);
  assert((await publicStatus(photo)) >= 400, "his photo is gone");
  assert((await publicStatus(stray)) >= 400, "and the stray upload");
});
