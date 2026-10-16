// The web player's event beacon against the LOCAL stack's served functions (20261016000204, rule
// web_event): at most that many events per client address per window; the rest are dropped and
// the beacon still answers 204. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY of a local stack
// whose Edge runtime serves this checkout's `web` function; refuses any other host.
//     deno test --allow-env --allow-net supabase/functions/_tests/web_beacon_integration_test.ts
import { assertEquals } from "./assert.ts";

const API = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!API || !SERVICE) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
if (!["127.0.0.1", "localhost"].includes(new URL(API).hostname)) throw new Error("local stack only");

const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
async function events(): Promise<number> {
  const res = await fetch(`${API}/rest/v1/analytics_events?name=eq.web_signin_sheet_shown&select=id`, { headers: { ...admin, Prefer: "count=exact", Range: "0-0" } });
  await res.body?.cancel();
  return Number((res.headers.get("content-range") ?? "*/0").split("/")[1]);
}
const beacon = async (ip: string) => {
  const res = await fetch(`${API}/functions/v1/web/e/signin`, { method: "POST", headers: { "cf-connecting-ip": ip } });
  await res.body?.cancel();
  return res.status;
};

Deno.test("one address records at most web_event events per window", async () => {
  const max = ((await (await fetch(`${API}/rest/v1/rate_limit_rules?rule=eq.web_event&select=max_hits`, { headers: admin })).json()) as { max_hits: number }[])[0].max_hits;
  const ip = `192.0.2.${Date.now() % 250}`;
  const before = await events();
  for (let i = 0; i < max + 5; i++) assertEquals(await beacon(ip), 204, `beacon ${i + 1}`);
  assertEquals(await events() - before, max, "only the allowed ones were recorded");
  assertEquals(await beacon(`198.51.100.${Date.now() % 250}`), 204);
  assertEquals(await events() - before, max + 1, "another address is recorded");
});
