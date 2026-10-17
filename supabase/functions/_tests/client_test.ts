// _shared/client.ts (no network): the constant-time bearer check used by send-push and
// avatar-cleanup, and the client address used as a rate-limit key.
//     deno test supabase/functions/_tests/client_test.ts
import { assertEquals } from "./assert.ts";
import { bearerMatches, clientIp, PROXY_CLIENT_HEADER, PROXY_KEY_HEADER, proxiedClientIp, proxyKeyMatches } from "../_shared/client.ts";

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

Deno.test("proxiedClientIp trusts the proxy's address only with the proxy's key", () => {
  const KEY = "k".repeat(40);
  const req = (h: Record<string, string>) => new Request("http://local/", { headers: { "cf-connecting-ip": "2a06:98c0:3600::103", ...h } });
  assertEquals(proxiedClientIp(req({ [PROXY_KEY_HEADER]: KEY, [PROXY_CLIENT_HEADER]: "203.0.113.9" }), KEY), "203.0.113.9");
  assertEquals(proxiedClientIp(req({ [PROXY_KEY_HEADER]: KEY, [PROXY_CLIENT_HEADER]: "2001:db8::1" }), KEY), "2001:db8::1");
  assertEquals(proxiedClientIp(req({ [PROXY_KEY_HEADER]: KEY + "x", [PROXY_CLIENT_HEADER]: "203.0.113.9" }), KEY), "2a06:98c0:3600::103", "wrong key");
  assertEquals(proxiedClientIp(req({ [PROXY_CLIENT_HEADER]: "203.0.113.9" }), KEY), "2a06:98c0:3600::103", "no key header");
  assertEquals(proxiedClientIp(req({ [PROXY_KEY_HEADER]: KEY, [PROXY_CLIENT_HEADER]: "x'; drop" }), KEY), "2a06:98c0:3600::103", "not an address");
  assertEquals(proxiedClientIp(req({ [PROXY_KEY_HEADER]: KEY }), KEY), "2a06:98c0:3600::103", "no address passed");
});

Deno.test("proxyKeyMatches refuses everything when no key, or a short one, is configured", () => {
  const req = (k: string) => new Request("http://local/", { headers: { [PROXY_KEY_HEADER]: k } });
  assertEquals(proxyKeyMatches(req(""), undefined), false);
  assertEquals(proxyKeyMatches(req(""), ""), false);
  assertEquals(proxyKeyMatches(req("short"), "short"), false, "under 32 characters");
  assertEquals(proxyKeyMatches(req("a".repeat(32)), "a".repeat(32)), true);
  assertEquals(proxiedClientIp(new Request("http://local/", { headers: { "x-forwarded-for": "192.0.2.1", [PROXY_CLIENT_HEADER]: "203.0.113.9" } }), undefined), "192.0.2.1", "unset key: as before");
});
