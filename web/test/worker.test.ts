// The advanced-mode entry of the dashboard upload (src/worker.ts): the association files come from
// the static assets with JSON headers; everything else is src/handler.ts. No network: upstream
// calls go to a stubbed global fetch, the assets to a fake ASSETS binding.   cd web && npm test
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { ASSOCIATION_FILES, missingSettings, type WorkerEnv } from "../src/worker.ts";

const SB = "https://ref.supabase.co";
const ID = "5b321c24-1e1e-4393-9ae1-e6503903430d";

function env(assets: (req: Request) => Response): { env: WorkerEnv; served: string[] } {
  const served: string[] = [];
  return {
    served,
    env: {
      SUPABASE_URL: SB,
      SUPABASE_ANON_KEY: "sb_publishable_test",
      ADMIN_HOST: "admin.conga.churntech.com",
      ASSETS: { fetch: async (req: Request) => { served.push(new URL(req.url).pathname); return assets(req); } },
    },
  };
}
function ctx() {
  const pending: Promise<unknown>[] = [];
  return { pending, ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) } };
}

afterEach(() => vi.unstubAllGlobals());

describe("dashboard worker", () => {
  it("serves both association files from the assets as JSON, noindex and nosniff", async () => {
    const { env: e, served } = env(() => new Response('{"applinks":{}}', { headers: { "content-type": "application/octet-stream" } }));
    for (const path of ASSOCIATION_FILES) {
      const res = await worker.fetch(new Request(`https://conga.churntech.com${path}`), e, ctx().ctx);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/json");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
      expect(await res.text()).toBe('{"applinks":{}}');
    }
    expect(served).toEqual([...ASSOCIATION_FILES]);
  });

  it("a missing association file stays a 404 from the assets", async () => {
    const { env: e } = env(() => new Response("not found", { status: 404 }));
    const res = await worker.fetch(new Request("https://conga.churntech.com/.well-known/assetlinks.json"), e, ctx().ctx);
    expect(res.status).toBe(404);
  });

  it("every other path goes to the handler, never to the assets", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { env: e, served } = env(() => new Response("asset"));
    const c = ctx();
    const invite = await worker.fetch(new Request("https://conga.churntech.com/i/PUTU-7K2"), e, c.ctx);
    expect(invite.status).toBe(200);
    expect(await invite.text()).toContain("You're invited to Conga");
    const other = await worker.fetch(new Request("https://conga.churntech.com/.well-known/security.txt"), e, c.ctx);
    expect(other.status).toBe(404);
    const admin = await worker.fetch(new Request("https://admin.conga.churntech.com/admin"), e, c.ctx);
    expect(admin.status).toBe(200);
    expect(await admin.text()).toContain("<title>Conga moderation</title>");
    const pageOnAdmin = await worker.fetch(new Request(`https://admin.conga.churntech.com/r/${ID}`), e, c.ctx);
    expect(pageOnAdmin.status).toBe(404);
    await Promise.all(c.pending);
    expect(served).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(`${SB}/functions/v1/web/e/link-invite`, expect.anything());
  });

  it("before the dashboard settings exist, only the association files are served; the rest is 503", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    for (const missing of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "ADMIN_HOST"] as const) {
      const { env: e } = env(() => new Response("{}"));
      const partial = { ...e, [missing]: missing === "ADMIN_HOST" ? " " : undefined } as WorkerEnv;
      expect(missingSettings(partial)).toEqual([missing]);
      for (const url of ["https://conga-web.pages.dev/admin", `https://conga-web.pages.dev/r/${ID}`, "https://conga-web.pages.dev/i/PUTU-7K2"]) {
        const res = await worker.fetch(new Request(url), partial, ctx().ctx);
        expect(res.status).toBe(503);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(await res.text()).toBe("");
      }
      const aasa = await worker.fetch(new Request("https://conga-web.pages.dev/.well-known/apple-app-site-association"), partial, ctx().ctx);
      expect(aasa.status).toBe(200);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
