// Pure helpers for the web player (no Deno APIs, no network), so they can be unit tested:
//   deno test supabase/functions/_tests/web_links_test.ts
// The app's routes are app/src/app/r/[id].tsx, p/[id].tsx, u/[username].tsx and i/[code].tsx; the
// scheme is `shortcut` (app.config.ts). The same paths are used on the web, so a page at
// /functions/v1/web/r/{id} opens shortcut://r/{id}.

export const APP_SCHEME = "shortcut://";

export type LinkKind = "r" | "p" | "i" | "u";

/** Splits a request path (with or without the function prefix) into a page kind and its id. */
export function parseWebPath(pathname: string): { kind: LinkKind | "e"; id: string } | null {
  const path = pathname.replace(/^\/functions\/v1\/web/, "").replace(/^\/web/, "");
  const m = /^\/(r|p|i|u|e)\/([^/]+)\/?$/.exec(path);
  return m ? { kind: m[1] as LinkKind | "e", id: m[2] } : null;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The in-app route for a page: shortcut://r/{id}, p/{id}, u/{username} or i/{code}. The id is
 *  decoded then encoded once, so the result contains only URL-safe characters. */
export function appLink(kind: LinkKind, id: string): string {
  return `${APP_SCHEME}${kind}/${encodeURIComponent(safeDecode(id))}`;
}

/** hls.js, pinned to an exact version with a subresource integrity hash (sha384 of
 *  dist/hls.min.js, identical from cdn.jsdelivr.net and unpkg.com on 16 Oct 2026). Change the
 *  version and the hash together. */
export const HLS_JS_VERSION = "1.7.3";
export const HLS_JS_URL = `https://cdn.jsdelivr.net/npm/hls.js@${HLS_JS_VERSION}/dist/hls.min.js`;
export const HLS_JS_INTEGRITY = "sha384-cciJ0zi8d1uMKC2zJd7jvPY4HQt7W4ByUI/FlMkltvBi31aW61rcpVBhpmW8/NwX";

export function hlsScriptTag(): string {
  return `<script src="${HLS_JS_URL}" integrity="${HLS_JS_INTEGRITY}" crossorigin="anonymous"></script>`;
}

export type LinkTarget = "video" | "prompt" | "invite" | "profile";

/** The `target` of web_link_opened for each page kind (SPEC.md Section 21). */
export const LINK_TARGETS: Record<LinkKind, LinkTarget> = { r: "video", p: "prompt", i: "invite", u: "profile" };

/** A link-opened event forwarded by the Pages host (web/, docs/release/WEB-HOSTING.md) arrives
 *  at /e/link-<target>. The target it names, or null for anything else. */
export function linkEventTarget(id: string): LinkTarget | null {
  const m = /^link-(video|prompt|invite|profile)$/.exec(id);
  return m ? (m[1] as LinkTarget) : null;
}
