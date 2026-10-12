// Unit tests for the mux-cleanup worker's safety logic (no network, no database): the fake-Mux
// override is local-only, the two switches, the change guard, dry runs, and the last-moment
// database check.
//
//   deno test --allow-env supabase/functions/_tests/cleanup_unit_test.ts
import { assert, assertEquals, assertRejects, assertThrows } from "./assert.ts";
import { mux, muxBase } from "../_shared/mux.ts";
import { assetMismatch, changer, type Check, effectiveMode, envMode, type Job, runJob } from "../mux-cleanup/handler.ts";

Deno.env.set("MUX_TOKEN_ID", "unit-id");
Deno.env.set("MUX_TOKEN_SECRET", "unit-secret");

type Call = { method: string; url: string };
const calls: Call[] = [];
let answer: (method: string, url: URL) => Response = () => Response.json({ error: "no route" }, { status: 404 });
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  calls.push({ method: init?.method ?? "GET", url: url.toString() });
  return Promise.resolve(answer(init?.method ?? "GET", url));
}) as typeof fetch;
const mutations = () => calls.filter((c) => c.method !== "GET");

const job = (over: Partial<Job> = {}): Job => ({
  id: "j1", lease: "l1", action: "delete_asset", reason: "author_deleted", attempt: 1,
  asset_id: "asset1", upload_id: "upload1", response_id: "r1", owner_id: "owner-1", playback_wanted: null, ...over,
});
const asset = { id: "asset1", status: "ready", passthrough: "owner-1", upload_id: "upload1", playback_ids: [{ id: "pb1", policy: "public" }] };
function muxWith(a: Record<string, unknown> | null) {
  answer = (method, url) => {
    if (method === "GET" && url.pathname === "/video/v1/assets/asset1") return a ? Response.json({ data: a }) : Response.json({}, { status: 404 });
    if (method === "DELETE") return new Response(null, { status: 204 });
    if (method === "POST") return Response.json({ data: { id: "pbNew", policy: "public" } }, { status: 201 });
    return Response.json({}, { status: 404 });
  };
}
const neverCheck = () => Promise.reject(new Error("check must not be called"));

Deno.test("MUX_API_BASE: unset is api.mux.com; only a local http fake is accepted", () => {
  Deno.env.delete("MUX_API_BASE");
  assertEquals(muxBase(), "https://api.mux.com");
  for (const ok of ["http://127.0.0.1:55690", "http://localhost:1", "http://host.docker.internal:55690/ignored/path"]) {
    Deno.env.set("MUX_API_BASE", ok);
    assertEquals(muxBase(), new URL(ok).origin, ok);
  }
  for (const bad of ["https://evil.example", "http://10.0.0.5:80", "https://localhost:1", "http://127.0.0.1.evil.example", "ftp://127.0.0.1"]) {
    Deno.env.set("MUX_API_BASE", bad);
    assertThrows(() => muxBase(), Error, "invalid_mux_api_base", bad);
  }
  Deno.env.delete("MUX_API_BASE");
});

Deno.test("mux(): with a local fake, a path still cannot leave it", async () => {
  Deno.env.set("MUX_API_BASE", "http://127.0.0.1:55690");
  calls.length = 0;
  await assertRejects(() => mux("@evil.example/x"), Error, "invalid_mux_path");
  assertEquals(calls, []);
  Deno.env.delete("MUX_API_BASE");
});

Deno.test("switches: the function's is dry_run unless exactly live; the stricter of the two applies", () => {
  Deno.env.delete("MUX_CLEANUP_MODE");
  assertEquals(envMode(), "dry_run");
  Deno.env.set("MUX_CLEANUP_MODE", "LIVE");
  assertEquals(envMode(), "dry_run");
  Deno.env.set("MUX_CLEANUP_MODE", "off");
  assertEquals(envMode(), "off");
  Deno.env.set("MUX_CLEANUP_MODE", "live");
  assertEquals([effectiveMode("live"), effectiveMode("dry_run"), effectiveMode("off"), effectiveMode(undefined), effectiveMode("bogus")], ["live", "dry_run", "off", "off", "off"]);
  Deno.env.set("MUX_CLEANUP_MODE", "dry_run");
  assertEquals([effectiveMode("live"), effectiveMode("dry_run"), effectiveMode("off")], ["dry_run", "dry_run", "off"]);
  Deno.env.delete("MUX_CLEANUP_MODE");
  assertEquals(effectiveMode("live"), "dry_run", "the database alone cannot make it live");
});

Deno.test("the change guard refuses every change outside live mode, before any request", async () => {
  calls.length = 0;
  for (const mode of ["dry_run", "off", undefined] as const) {
    await assertRejects(() => changer(mode)("/video/v1/assets/asset1", { method: "DELETE" }), Error, "change_refused_outside_live_mode");
  }
  assertEquals(calls, []);
  muxWith(asset);
  await changer("live")("/video/v1/assets/asset1", { method: "DELETE" });
  assertEquals(mutations().length, 1);
});

Deno.test("dry run: every job only reads Mux and is released with its plan", async () => {
  for (const j of [job(), job({ action: "sync_playback", playback_wanted: false }), job({ action: "sync_playback", playback_wanted: true })]) {
    muxWith({ ...asset, playback_ids: [] });
    calls.length = 0;
    const r = await runJob(j, "dry_run", neverCheck);
    assertEquals(r.outcome, "release", j.action);
    assertEquals(r.detail.dry_run, true);
    assertEquals(mutations(), []);
  }
});

Deno.test("live: the database's last-moment answer decides", async () => {
  muxWith(asset);
  const cases: [Check, string][] = [
    [{ ok: false }, "stale"],
    [{ ok: true, mode: "dry_run", hold: null }, "release"],
    [{ ok: true, mode: "live", hold: "infinity" }, "skipped"],
    [{ ok: true, mode: "live", hold: "2030-01-01T00:00:00Z" }, "release"],
  ];
  for (const [c, expected] of cases) {
    calls.length = 0;
    const r = await runJob(job(), "live", () => Promise.resolve(c));
    assertEquals(r.outcome, expected, JSON.stringify(c));
    assertEquals(mutations(), [], `no DELETE when ${JSON.stringify(c)}`);
  }
  calls.length = 0;
  const go = await runJob(job(), "live", () => Promise.resolve({ ok: true, mode: "live", hold: null }));
  assertEquals([go.outcome, go.detail.outcome], ["done", "deleted"]);
  assertEquals(mutations().map((m) => m.method), ["DELETE"]);
});

Deno.test("live: a restore re-checks after creating the id and removes it if no longer wanted", async () => {
  muxWith({ ...asset, playback_ids: [] });
  let n = 0;
  calls.length = 0;
  const r = await runJob(job({ action: "sync_playback", playback_wanted: true }), "live",
    (): Promise<Check> => Promise.resolve(++n === 1 ? { ok: true, mode: "live", wanted: true } : { ok: true, mode: "live", wanted: false }));
  assertEquals([r.outcome, r.detail.outcome], ["done", "revoked"]);
  assertEquals(mutations().map((m) => `${m.method} ${new URL(m.url).pathname}`), ["POST /video/v1/assets/asset1/playback-ids", "DELETE /video/v1/assets/asset1/playback-ids/pbNew"]);
  // A revoke planned while the video was wanted, but checked when it is not: revoked.
  muxWith(asset);
  const r2 = await runJob(job({ action: "sync_playback", playback_wanted: true }), "live", () => Promise.resolve({ ok: true, mode: "live", wanted: false }));
  assertEquals([r2.outcome, r2.detail.revoked], ["done", ["pb1"]]);
});

Deno.test("ownership: a mismatch fails before the database is asked or Mux is changed", async () => {
  for (const [a, reason] of [[{ ...asset, passthrough: "someone-else" }, "passthrough_mismatch"], [{ ...asset, passthrough: undefined }, "passthrough_mismatch"], [{ ...asset, upload_id: "other" }, "upload_id_mismatch"], [{ ...asset, id: "asset2" }, "asset_id_mismatch"]] as const) {
    assertEquals(assetMismatch(a as never, job()), reason);
    muxWith(a);
    calls.length = 0;
    const r = await runJob(job(), "live", neverCheck);
    assertEquals([r.outcome, r.detail.detail], ["failed", reason]);
    assertEquals(mutations(), []);
  }
  const noOwner = await runJob(job({ owner_id: null }), "live", neverCheck);
  assertEquals(noOwner.outcome, "failed");
  assert(true);
});
