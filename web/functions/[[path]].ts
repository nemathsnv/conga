// Cloudflare Pages Functions entry: every path except /.well-known/* (public/_routes.json) comes
// here; src/handler.ts does the routing. See web/README.md.
import { type Env, handle } from "../src/handler.ts";

type PagesContext = { request: Request; env: Env; waitUntil(p: Promise<unknown>): void };

export const onRequest = (context: PagesContext): Promise<Response> =>
  handle(context.request, context.env, { waitUntil: (p) => context.waitUntil(p) });
