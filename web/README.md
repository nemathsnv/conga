# web/: shared-link pages and the moderation admin on Cloudflare Pages

Option B of [`docs/release/WEB-HOSTING.md`](../docs/release/WEB-HOSTING.md), for Conga's link domain
`conga.churntech.com` and the admin on `admin.conga.churntech.com` (Pages project `conga-web`).
**Prepared and tested locally only. Nothing here has been deployed.** It is deployed by uploading
`dist/conga-web-dashboard.zip` in the Cloudflare dashboard
([`docs/release/CLOUDFLARE-DASHBOARD.md`](../docs/release/CLOUDFLARE-DASHBOARD.md)); no Wrangler login.

Supabase stays the backend. This project only serves HTML on a domain that is allowed to serve it.

| Path | What | Upstream |
|---|---|---|
| `/r/{id}`, `/p/{id}` | The web player, the unavailable page and the empty prompt | `POST <SUPABASE_URL>/rest/v1/rpc/web_video` or `web_prompt`, called with the anon (publishable) key |
| `/i/{code}`, `/u/{name}` | The invite page and the profile sign-in sheet | none |
| `/e/signin` | The sign-in sheet beacon (204) | forwarded to `<SUPABASE_URL>/functions/v1/web/e/signin` |
| (every page) | `web_link_opened` | forwarded to `<SUPABASE_URL>/functions/v1/web/e/link-<target>` |
| `/admin` | The admin sign-in page: the function's own `shellPage`, headers and nonce CSP | none |
| `/admin/*` | `me`, views and actions | proxied to `<SUPABASE_URL>/functions/v1/admin/*` (Authorization, Content-Type and Sec-Fetch-Site only) |
| `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json` | Placeholders, served as static JSON (no Function call) | none |
| anything else | The unavailable page, 404, as the function does | none |

The pages come from `supabase/functions/web/render.ts`, the same module the `web` Edge Function
uses. They have the same words, Open Graph tags, `noindex` and app link. The admin sign-in page
comes from `supabase/functions/admin/shell.ts` and `handler.ts`. Wrangler bundles those files
straight from `supabase/` with esbuild. Two entries share `src/handler.ts`: `functions/[[path]].ts`
(Pages Functions, for `wrangler pages dev` and any future Wrangler deployment) and `src/worker.ts`
(advanced mode, bundled into the ZIP's `_worker.js`, because a dashboard upload compiles no
`functions/` folder). Nothing in `app/`. This project holds no service-role key.

## Configuration

| Name | Kind | Value |
|---|---|---|
| `SUPABASE_URL` | variable (dashboard; `wrangler.toml` locally) | `https://picvoavfxnajfjkqawju.supabase.co` in production. Locally, a local stack. |
| `SUPABASE_ANON_KEY` | secret | The project's publishable key (`sb_publishable_…`), the same one as `EXPO_PUBLIC_SUPABASE_ANON_KEY`. It is public, but it stays out of git. |
| `WEB_PROXY_KEY` | secret | 32 or more random characters, also set as the `web` function's `WEB_PROXY_KEY` secret. It lets the function trust the visitor address this host passes on. Without it, every visitor shares Cloudflare's one Worker address for the `web_event` limit, and `web_link_opened` is not logged. |
| `ADMIN_HOST` | variable | `admin.conga.churntech.com`. When set, the admin is served only on that host and the pages never are. Empty means `/admin` is served on every host (local development only: the dashboard entry, `src/worker.ts`, serves nothing but the association files until `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `ADMIN_HOST` are set). |
| `WEB_BASE_URL` | variable | `https://conga.churntech.com`. Where the admin's "web player" links point. Empty means the request's origin. |
| `STORE_URL`, `WAITLIST_URL` | variable, optional | The same fallbacks as the function (`https://conga.churntech.com`). |

## Tests (no network, no account)

```bash
cd web
npm ci                 # wrangler 4.146.0 and vitest 5.0.2, pinned in package-lock.json
npm test               # vitest: 25 tests; upstream calls go to a recording fake fetch
npm run build:check    # wrangler pages functions build: bundles functions/ and the shared supabase/ modules
npm run build:dashboard   # dist/conga-web-dashboard.zip: _worker.js, _routes.json, _headers, .well-known/ (prints SHA-256)
npm run verify:dashboard  # unzips that archive, serves it with the local Pages runtime against a fake Supabase: 29 checks
```

## Local run against a LOCAL stack

```bash
# 1. A local stack whose edge runtime serves this checkout's functions, with WEB_PROXY_KEY in the env file:
openssl rand -hex 32                                   # paste into both files below
printf 'WEB_PROXY_KEY=<value>\n' > /tmp/web-fn.env
supabase start && supabase functions serve --no-verify-jwt --env-file /tmp/web-fn.env
# 2. web/.dev.vars (git-ignored; see .dev.vars.example): SUPABASE_URL, SUPABASE_ANON_KEY from `supabase status -o env`, WEB_PROXY_KEY
cd web && npm run dev                                  # http://127.0.0.1:8788/r/<live response id>
```

## Deploy (NOT run; each step needs Nemat's go-ahead)

By dashboard upload only, in six approvals: [`docs/release/PAGES-ROLLOUT.md`](../docs/release/PAGES-ROLLOUT.md)
for the order, [`docs/release/CLOUDFLARE-DASHBOARD.md`](../docs/release/CLOUDFLARE-DASHBOARD.md) for every
click, setting and check. In short: create `conga-web` by uploading the ZIP; set the variables and the two
encrypted secrets and upload it again; the same `WEB_PROXY_KEY` on Supabase and a redeploy of the `web`
function; then the custom domains `conga.churntech.com` and `admin.conga.churntech.com`.

When the paid Apple team and the Android signing key exist (B-3), replace `APPLE_TEAM_ID` and the
fingerprint in `public/.well-known/`, rebuild the ZIP, then add `associatedDomains` and `intentFilters`
in `app.config.ts` (the bundle id decision first: `docs/release/CONGA-RENAME.md` section 4).

Rollback: in the dashboard, Deployments, roll back to an earlier deployment; if needed, remove the
custom domains. Nothing on Supabase depends on this project; with `WEB_PROXY_KEY` unset the `web`
function behaves exactly as before.
