// Unit tests for abandon-submission's decision from Mux's answer (no network, no database).
//
//   deno test --allow-env supabase/functions/_tests/abandon_unit_test.ts
import { assertEquals } from "./assert.ts";
import { decideAbandon, SETTLE_AFTER_EXPIRY_MS } from "../abandon-submission/handler.ts";

const U = "upUnit1";
const now = Date.parse("2026-10-16T12:00:00Z");
const expiredLongAgo = now - SETTLE_AFTER_EXPIRY_MS - 1;
const expiredJustNow = now - SETTLE_AFTER_EXPIRY_MS + 1;
const stillValid = now + 30 * 60_000;

Deno.test("documented guarantees: cancelled and timed_out retire at once; waiting is cancelled first; an asset is kept", () => {
  assertEquals(decideAbandon({ id: U, url: "", status: "cancelled" }, U, null, now), "abandon");
  assertEquals(decideAbandon({ id: U, url: "", status: "timed_out" }, U, null, now), "abandon");
  assertEquals(decideAbandon({ id: U, url: "", status: "waiting" }, U, null, now), "cancel");
  assertEquals(decideAbandon({ id: U, url: "", status: "asset_created" }, U, null, now), "keep_at_mux");
  for (const status of ["waiting", "errored", "cancelled", "timed_out", "something_new"]) {
    assertEquals(decideAbandon({ id: U, url: "", status, asset_id: "asA" }, U, expiredLongAgo, now), "keep_at_mux", `${status} with an asset`);
  }
});

Deno.test("errored (undocumented): never retired at once; the URL's expiry is needed first", () => {
  assertEquals(decideAbandon({ id: U, url: "", status: "errored" }, U, null, now), "needs_expiry");
  assertEquals(decideAbandon({ id: U, url: "", status: "errored" }, U, stillValid, now), "keep_unverified", "the URL can still take bytes");
  assertEquals(decideAbandon({ id: U, url: "", status: "errored" }, U, now - 1, now), "keep_unverified", "just expired");
  assertEquals(decideAbandon({ id: U, url: "", status: "errored" }, U, expiredJustNow, now), "keep_unverified", "inside the settle margin");
  assertEquals(decideAbandon({ id: U, url: "", status: "errored" }, U, expiredLongAgo, now), "abandon", "bounded: retired once settled");
});

Deno.test("a state Mux does not document is treated like errored", () => {
  assertEquals(decideAbandon({ id: U, url: "", status: "something_new" }, U, null, now), "needs_expiry");
  assertEquals(decideAbandon({ id: U, url: "", status: "something_new" }, U, stillValid, now), "keep_unverified");
  assertEquals(decideAbandon({ id: U, url: "", status: "something_new" }, U, expiredLongAgo, now), "abandon");
});

Deno.test("no ledger expiry, or a malformed answer: kept, never retired", () => {
  assertEquals(decideAbandon({ id: U, url: "", status: "errored" }, U, undefined, now), "keep_unverified");
  assertEquals(decideAbandon({ id: U, url: "", status: "errored" }, U, NaN, now), "keep_unverified");
  assertEquals(decideAbandon(undefined, U, expiredLongAgo, now), "keep_unverified");
  assertEquals(decideAbandon(null, U, expiredLongAgo, now), "keep_unverified");
  assertEquals(decideAbandon({ id: U, url: "" } as never, U, expiredLongAgo, now), "keep_unverified", "no status");
  assertEquals(decideAbandon({ id: "upOther", url: "", status: "cancelled" }, U, expiredLongAgo, now), "keep_unverified", "another upload's answer");
  assertEquals(decideAbandon({ id: "upOther", url: "", status: "errored" }, U, expiredLongAgo, now), "keep_unverified");
});
