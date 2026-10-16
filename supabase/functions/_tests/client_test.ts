// _shared/client.ts (no network): the constant-time bearer check used by send-push and
// avatar-cleanup, and the client address used as a rate-limit key.
//     deno test supabase/functions/_tests/client_test.ts
import { assertEquals } from "./assert.ts";
import { bearerMatches, clientIp } from "../_shared/client.ts";

Deno.test("bearerMatches accepts exactly 'Bearer <key>'", () => {
  assertEquals(bearerMatches("Bearer s3cret-key", "s3cret-key"), true);
  assertEquals(bearerMatches("Bearer s3cret-kez", "s3cret-key"), false, "one character off");
  assertEquals(bearerMatches("Bearer s3cret-key ", "s3cret-key"), false, "trailing space");
  assertEquals(bearerMatches("bearer s3cret-key", "s3cret-key"), false, "scheme is case-sensitive, as before");
  assertEquals(bearerMatches("s3cret-key", "s3cret-key"), false, "no scheme");
  assertEquals(bearerMatches("Bearer s3cret", "s3cret-key"), false, "a prefix of the key");
  assertEquals(bearerMatches(null, "s3cret-key"), false, "no header");
});

Deno.test("bearerMatches refuses everything when no key is configured", () => {
  assertEquals(bearerMatches("Bearer ", undefined), false);
  assertEquals(bearerMatches("Bearer ", ""), false);
  assertEquals(bearerMatches("Bearer undefined", undefined), false);
});

Deno.test("clientIp prefers the edge's headers, first address only", () => {
  const req = (h: Record<string, string>) => new Request("http://local/", { headers: h });
  assertEquals(clientIp(req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" })), "203.0.113.7");
  assertEquals(clientIp(req({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "1.1.1.1" })), "198.51.100.2");
  assertEquals(clientIp(req({ "x-forwarded-for": "192.0.2.1, 10.0.0.1" })), "192.0.2.1");
  assertEquals(clientIp(req({})), "unknown");
});
