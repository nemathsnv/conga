// Unit tests for _shared/mux.ts (security stage 1: F3 Mux ids and paths, F12 webhook signature).
// No network: fetch is replaced for every test that would reach Mux.
//   deno test --allow-env supabase/functions/_tests/mux_test.ts
import { assert, assertEquals, assertRejects, assertThrows } from "./assert.ts";
import { isMuxId, mux, muxSegment, prewarm, timingSafeEqual, verifyMuxSignature } from "../_shared/mux.ts";

// Real ids from the hosted Shortcut Beta environment (docs/BETA-READINESS.md section 12).
const REAL_UPLOAD = "ka5YEhFH6gsMlReKkWOrfWN2xPkSKxceKqvzAqZxIs00";
const REAL_ASSET = "L7KxG29AtA7rEZ2JXF02QWw3GcR12F00NK3A1eTsu02UVc";
const REAL_PLAYBACK = "8UqSCXiojU36lJn802TM00UF6ehuCB5Q5NF8kZh502J6JU";

const HOSTILE = [
  "", "../assets/abc", "..", "abc/def", "abc?limit=100", "abc#x", "abc%2F..%2Fassets", "%2e%2e",
  "abc def", " abc", "abc\n", "abc\u0000", "abc.m3u8", "abc-def", "abc_def", "абв", "a".repeat(129),
  "@evil.example", "//evil.example/x", "https://evil.example",
];

function withFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

Deno.test("isMuxId accepts real Mux upload, asset and playback ids", () => {
  for (const id of [REAL_UPLOAD, REAL_ASSET, REAL_PLAYBACK, "a", "A1", "a".repeat(128)]) assert(isMuxId(id), id);
});

Deno.test("isMuxId rejects anything that is not 1 to 128 letters and digits", () => {
  for (const id of HOSTILE) assert(!isMuxId(id), JSON.stringify(id));
  for (const v of [null, undefined, 123, {}, ["abc"]]) assert(!isMuxId(v), String(v));
});

Deno.test("muxSegment returns a valid id unchanged and throws on everything else", () => {
  assertEquals(muxSegment(REAL_UPLOAD), REAL_UPLOAD);
  for (const id of HOSTILE) assertThrows(() => muxSegment(id), Error, "invalid_mux_id", JSON.stringify(id));
  assertThrows(() => muxSegment(undefined), Error, "invalid_mux_id");
});

Deno.test("mux() calls exactly https://api.mux.com plus the path, with Basic auth", async () => {
  Deno.env.set("MUX_TOKEN_ID", "test-id");
  Deno.env.set("MUX_TOKEN_SECRET", "test-secret");
  const f = withFetch(() => Response.json({ data: { id: REAL_UPLOAD, status: "waiting" } }));
  try {
    const data = await mux<{ id: string }>(`/video/v1/uploads/${muxSegment(REAL_UPLOAD)}`);
    assertEquals(data.id, REAL_UPLOAD);
    assertEquals(f.calls.length, 1);
    assertEquals(f.calls[0].url, `https://api.mux.com/video/v1/uploads/${REAL_UPLOAD}`);
    assertEquals((f.calls[0].init?.headers as Record<string, string>).Authorization, "Basic " + btoa("test-id:test-secret"));
  } finally {
    f.restore();
  }
});

Deno.test("mux() refuses a path that would leave api.mux.com, before any request", async () => {
  Deno.env.set("MUX_TOKEN_ID", "test-id");
  Deno.env.set("MUX_TOKEN_SECRET", "test-secret");
  const f = withFetch(() => Response.json({ data: {} }));
  try {
    for (const path of ["@evil.example/video/v1/uploads", ".evil.example/x", ":8443/x"]) {
      await assertRejects(() => mux(path), Error, "invalid_mux_path", path);
    }
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

Deno.test("prewarm() makes no request for an invalid playback id", async () => {
  const f = withFetch(() => new Response(""));
  try {
    for (const id of ["../x", "abc/def", "abc?x", "https://evil.example/a"]) await prewarm(id);
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

Deno.test("prewarm() fetches only stream.mux.com for a valid playback id", async () => {
  const f = withFetch((url) => new Response(url.endsWith(`${REAL_PLAYBACK}.m3u8`) ? "#EXTM3U\nrendition.m3u8\n" : "#EXTM3U\nseg0.ts\n"));
  try {
    await prewarm(REAL_PLAYBACK);
    assert(f.calls.length >= 1);
    for (const c of f.calls) assertEquals(new URL(c.url).origin, "https://stream.mux.com");
    assertEquals(f.calls[0].url, `https://stream.mux.com/${REAL_PLAYBACK}.m3u8`);
  } finally {
    f.restore();
  }
});

Deno.test("timingSafeEqual", () => {
  const a = new Uint8Array([1, 2, 3, 4]);
  assert(timingSafeEqual(a, new Uint8Array([1, 2, 3, 4])));
  assert(!timingSafeEqual(a, new Uint8Array([0, 2, 3, 4])), "first byte differs");
  assert(!timingSafeEqual(a, new Uint8Array([1, 2, 3, 5])), "last byte differs");
  assert(!timingSafeEqual(a, new Uint8Array([1, 2, 3])), "shorter");
  assert(!timingSafeEqual(a, new Uint8Array([1, 2, 3, 4, 5])), "longer");
  assert(timingSafeEqual(new Uint8Array(), new Uint8Array()));
});

// ---------------------------------------------------------------------------
// Webhook signatures. sign() is an independent implementation of Mux's scheme.
const SECRET = "whsec-test-0123456789";
const BODY = JSON.stringify({ type: "video.asset.ready", data: { id: REAL_ASSET, upload_id: REAL_UPLOAD } });
const NOW = 1_791_700_000_000;
const T = Math.floor(NOW / 1000);

async function sign(t: number, body: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("verifyMuxSignature accepts a correct signature", async () => {
  assert(await verifyMuxSignature(`t=${T},v1=${await sign(T, BODY)}`, BODY, SECRET, NOW));
});

Deno.test("verifyMuxSignature accepts the edges of the 300 s window", async () => {
  assert(await verifyMuxSignature(`t=${T - 300},v1=${await sign(T - 300, BODY)}`, BODY, SECRET, NOW));
  assert(await verifyMuxSignature(`t=${T + 300},v1=${await sign(T + 300, BODY)}`, BODY, SECRET, NOW));
});

Deno.test("verifyMuxSignature rejects stale and future timestamps", async () => {
  assert(!(await verifyMuxSignature(`t=${T - 301},v1=${await sign(T - 301, BODY)}`, BODY, SECRET, NOW)));
  assert(!(await verifyMuxSignature(`t=${T + 301},v1=${await sign(T + 301, BODY)}`, BODY, SECRET, NOW)));
});

Deno.test("verifyMuxSignature fails closed without a secret", async () => {
  const header = `t=${T},v1=${await sign(T, BODY)}`;
  assert(!(await verifyMuxSignature(header, BODY, undefined, NOW)));
  assert(!(await verifyMuxSignature(header, BODY, "", NOW)));
});

Deno.test("verifyMuxSignature rejects a wrong secret, a changed body and a changed timestamp", async () => {
  assert(!(await verifyMuxSignature(`t=${T},v1=${await sign(T, BODY, "other-secret")}`, BODY, SECRET, NOW)));
  assert(!(await verifyMuxSignature(`t=${T},v1=${await sign(T, BODY)}`, BODY + " ", SECRET, NOW)));
  assert(!(await verifyMuxSignature(`t=${T - 1},v1=${await sign(T, BODY)}`, BODY, SECRET, NOW)));
});

Deno.test("verifyMuxSignature rejects a signature that differs in any single byte", async () => {
  const good = await sign(T, BODY);
  for (let i = 0; i < 32; i++) {
    const byte = parseInt(good.slice(i * 2, i * 2 + 2), 16) ^ 0x01;
    const bad = good.slice(0, i * 2) + byte.toString(16).padStart(2, "0") + good.slice(i * 2 + 2);
    assert(!(await verifyMuxSignature(`t=${T},v1=${bad}`, BODY, SECRET, NOW)), `byte ${i}`);
  }
});

Deno.test("verifyMuxSignature rejects malformed headers and wrong-length signatures", async () => {
  const good = await sign(T, BODY);
  for (const header of [
    "", `t=${T}`, `v1=${good}`, `t=,v1=${good}`, `t=${T},v1=`, `t=${T},v1=${good.slice(0, 62)}`,
    `t=${T},v1=${good.slice(0, 63)}`, `t=${T},v1=${good}00`, `t=${T},v1=${good.toUpperCase()}`,
    `t=${T},v1=${"0".repeat(64)}`, `t=${T},v0=${good}`,
  ]) {
    assert(!(await verifyMuxSignature(header, BODY, SECRET, NOW)), header);
  }
});

Deno.test("verifyMuxSignature accepts an invalid first v1 followed by a valid second v1", async () => {
  const good = await sign(T, BODY);
  const forged = await sign(T, BODY, "other-secret");
  assert(await verifyMuxSignature(`t=${T},v1=${forged},v1=${good}`, BODY, SECRET, NOW), "forged then valid");
  assert(await verifyMuxSignature(`t=${T},v1=${"0".repeat(64)},v1=${good}`, BODY, SECRET, NOW), "zeros then valid");
  assert(await verifyMuxSignature(`t=${T},v1=${good.slice(0, 63)},v1=${good}`, BODY, SECRET, NOW), "malformed then valid");
  assert(await verifyMuxSignature(`t=${T},v1=${good.toUpperCase()},v1=${good}`, BODY, SECRET, NOW), "uppercase then valid");
});

Deno.test("verifyMuxSignature accepts a valid first v1 followed by others, in any position", async () => {
  const good = await sign(T, BODY);
  const forged = await sign(T, BODY, "other-secret");
  assert(await verifyMuxSignature(`t=${T},v1=${good},v1=${forged}`, BODY, SECRET, NOW), "valid then forged");
  assert(await verifyMuxSignature(`v1=${forged},t=${T},v1=${forged},v1=${good}`, BODY, SECRET, NOW), "valid third, t in the middle");
});

Deno.test("verifyMuxSignature rejects headers where no v1 signature is valid", async () => {
  const good = await sign(T, BODY);
  const forged = await sign(T, BODY, "other-secret");
  const forged2 = await sign(T, BODY, "third-secret");
  for (const header of [
    `t=${T},v1=${forged},v1=${forged2}`,
    `t=${T},v1=${good.toUpperCase()},v1=${good.slice(0, 62)}`,
    `t=${T},v1=,v1=${forged}`,
    `t=${T},v0=${good},v2=${good},v1=${forged}`,
    `t=${T},v1=${good}x`,
  ]) {
    assert(!(await verifyMuxSignature(header, BODY, SECRET, NOW)), header);
  }
});

Deno.test("verifyMuxSignature with several v1 values still checks the body and the window", async () => {
  const forged = await sign(T, BODY, "other-secret");
  assert(!(await verifyMuxSignature(`t=${T},v1=${forged},v1=${await sign(T, BODY)}`, BODY + " ", SECRET, NOW)), "changed body");
  const stale = T - 301;
  assert(!(await verifyMuxSignature(`t=${stale},v1=${forged},v1=${await sign(stale, BODY)}`, BODY, SECRET, NOW)), "stale");
});

Deno.test("verifyMuxSignature rejects a missing, repeated or non-numeric timestamp", async () => {
  const good = await sign(T, BODY);
  for (const header of [`v1=${good},v1=${good}`, `t=${T},t=${T},v1=${good}`, `t=${T}abc,v1=${good}`, `t=-${T},v1=${good}`, `t=${T}.5,v1=${good}`]) {
    assert(!(await verifyMuxSignature(header, BODY, SECRET, NOW)), header);
  }
});

Deno.test("verifyMuxSignature tolerates spaces after commas, as the previous parser did", async () => {
  assert(await verifyMuxSignature(`t=${T}, v1=${await sign(T, BODY)}`, BODY, SECRET, NOW));
});
