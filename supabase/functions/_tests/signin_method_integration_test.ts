// auth-signin-method against the LOCAL stack only (20261016000204, rules signin_address and
// signin_client): the handler in-process, the database for real. Needs SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY of a local stack; refuses any other host.
//     deno test --allow-env --allow-net supabase/functions/_tests/signin_method_integration_test.ts
import { assertEquals } from "./assert.ts";
import { handleSigninMethod } from "../auth-signin-method/handler.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!API || !ANON || !SERVICE) throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error("local stack only");
const run = Date.now().toString(36);

async function service(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
async function rule(name: string): Promise<number> {
  return ((await service(`/rest/v1/rate_limit_rules?rule=eq.${name}&select=max_hits`)).json as { max_hits: number }[])[0].max_hits;
}
async function lookup(email: string, ip: string, apikey = ANON): Promise<{ status: number; providers: string[] | null }> {
  const res = await handleSigninMethod(new Request("http://local/auth-signin-method", {
    method: "POST",
    headers: { apikey, "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email }),
  }));
  const json = await res.json();
  return { status: res.status, providers: json.providers ?? null };
}
// A fresh client address per test (the TEST-NET-3 range, plus a per-run octet).
let n = 0;
const ip = () => `203.0.113.${(Date.now() + n++) % 250}`;

Deno.test("only the public key is accepted", async () => {
  assertEquals((await lookup("a@example.com", ip(), "wrong")).status, 401);
});

Deno.test("an address is answered, then answered as unknown once its lookups are used up", async () => {
  const email = `signin-${run}-a@example.com`;
  const created = await service("/auth/v1/admin/users", "POST", { email, email_confirm: true });
  assertEquals(created.status, 200);
  const max = await rule("signin_address");
  for (let i = 0; i < max; i++) assertEquals((await lookup(email, ip())).providers, ["email"], `lookup ${i + 1}`);
  const over = await lookup(email.toUpperCase(), ip());
  assertEquals(over.status, 200, "no error status: nothing says it was limited");
  assertEquals(over.providers, [], "the same answer as an address with no account");
  assertEquals((await lookup(`signin-${run}-nobody@example.com`, ip())).providers, [], "which is what an unknown address gets");
  await service(`/auth/v1/admin/users/${(created.json as { id: string }).id}`, "DELETE");
});

Deno.test("one client is answered as unknown once its lookups are used up", async () => {
  const email = `signin-${run}-b@example.com`;
  const created = await service("/auth/v1/admin/users", "POST", { email, email_confirm: true });
  const client = `198.51.100.${Date.now() % 250}`;
  const max = await rule("signin_client");
  for (let i = 0; i < max; i++) await lookup(`signin-${run}-x${i}@example.com`, client);
  assertEquals((await lookup(email, client)).providers, [], "that client: no providers, even for an account");
  assertEquals((await lookup(email, ip())).providers, ["email"], "another client is served");
  await service(`/auth/v1/admin/users/${(created.json as { id: string }).id}`, "DELETE");
});
