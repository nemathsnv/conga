// Advanced-mode entry for a dashboard (drag-and-drop) upload: Cloudflare compiles no `functions/`
// folder for those, but it runs a `_worker.js` at the root of the upload. `npm run build:dashboard`
// bundles this file into that single `_worker.js` (docs/release/CLOUDFLARE-DASHBOARD.md). The routing
// is the same as functions/[[path]].ts with public/_routes.json:
//   the two association files  served from the static assets, with the JSON headers of public/_headers
//                              set here too (_headers is not applied to a Worker's responses)
//   everything else            src/handler.ts
import { type Env, handle } from "./handler.ts";

type Assets = { fetch(request: Request): Promise<Response> };
export type WorkerEnv = Env & { ASSETS: Assets };
type ExecutionContext = { waitUntil(p: Promise<unknown>): void };

export const ASSOCIATION_FILES = new Set(["/.well-known/apple-app-site-association", "/.well-known/assetlinks.json"]);

const ASSOCIATION_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
};

async function associationFile(request: Request, assets: Assets): Promise<Response> {
  const res = await assets.fetch(request);
  if (!res.ok) return res;
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(ASSOCIATION_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

/** A dashboard project is live on <project>.pages.dev from its first upload, before its variables
 *  can be set. Until these three are set, nothing but the association files is served: no page
 *  pointing at an undefined Supabase URL, and no admin on every host (an empty ADMIN_HOST means
 *  "/admin anywhere", which only local development wants). */
export const REQUIRED_SETTINGS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "ADMIN_HOST"] as const;

export function missingSettings(env: WorkerEnv): string[] {
  return REQUIRED_SETTINGS.filter((name) => !(env[name] ?? "").trim());
}

export default {
  fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    if (ASSOCIATION_FILES.has(new URL(request.url).pathname)) return associationFile(request, env.ASSETS);
    if (missingSettings(env).length > 0) {
      return Promise.resolve(new Response(null, { status: 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } }));
    }
    return handle(request, env, { waitUntil: (p) => ctx.waitUntil(p) });
  },
};
