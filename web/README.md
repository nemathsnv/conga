# web/: shared-link pages and the moderation admin on Cloudflare Pages

Option B of [`docs/release/WEB-HOSTING.md`](../docs/release/WEB-HOSTING.md). **Prepared and tested
locally only. Nothing here has been deployed, and no Cloudflare account, domain or DNS exists yet.**

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
straight from `supabase/` with esbuild. There is no build step and nothing in `app/`. This
project holds no service-role key.

## Configuration

| Name | Kind | Value |
|---|---|---|
| `SUPABASE_URL` | var (`wrangler.toml`) | `https://picvoavfxnajfjkqawju.supabase.co` for preview and production. Locally, a local stack. |
| `SUPABASE_ANON_KEY` | secret | The project's publishable key (`sb_publishable_…`), the same one as `EXPO_PUBLIC_SUPABASE_ANON_KEY`. It is public, but it stays out of git. |
| `WEB_PROXY_KEY` | secret | 32 or more random characters, also set as the `web` function's `WEB_PROXY_KEY` secret. It lets the function trust the visitor address this host passes on. Without it, every visitor shares Cloudflare's one Worker address for the `web_event` limit, and `web_link_opened` is not logged. |
| `ADMIN_HOST` | var | For example `admin.<domain>`. When set, the admin is served only on that host and the pages never are. Empty means `/admin` is served on every host (local development). |
| `WEB_BASE_URL` | var | Where the admin's "web player" links point. Empty means the request's origin. |
| `STORE_URL`, `WAITLIST_URL` | var, optional | The same fallbacks as the function (`https://shortcut.app`). |

## Tests (no network, no account)

```bash
cd web
npm ci                 # wrangler 4.146.0 and vitest 5.0.2, pinned in package-lock.json
npm test               # vitest: 21 tests; upstream calls go to a recording fake fetch
npm run build:check    # wrangler pages functions build: bundles functions/ and the shared supabase/ modules
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

You need a Cloudflare account, a domain with its DNS on Cloudflare (needed for the apex; a
subdomain can be a CNAME), and approval to deploy. In order:

```bash
cd web
npx wrangler login
npx wrangler pages project create shortcut-web --production-branch main
# Fill ADMIN_HOST (admin.<domain>) and WEB_BASE_URL (https://<domain>) in wrangler.toml [env.production.vars] and commit.
printf '%s' "<publishable key>" | npx wrangler pages secret put SUPABASE_ANON_KEY --project-name shortcut-web
printf '%s' "<random 64 hex>"   | npx wrangler pages secret put WEB_PROXY_KEY     --project-name shortcut-web
# Supabase side: the same key for the web function, then redeploy it (it also carries render.ts):
supabase secrets set WEB_PROXY_KEY=<random 64 hex> --project-ref picvoavfxnajfjkqawju
supabase functions deploy web --no-verify-jwt --project-ref picvoavfxnajfjkqawju
npx wrangler pages deploy public --project-name shortcut-web --branch main
```

Then, in the Cloudflare dashboard, open Pages, then `shortcut-web`, then Custom domains. Add
`<domain>` (the apex, for `/r/{id}`) and `admin.<domain>`. Check them:

```bash
curl -sI https://<domain>/r/<live response id>        # 200, content-type: text/html; charset=utf-8, x-robots-tag: noindex
curl -sI https://<domain>/.well-known/apple-app-site-association   # 200, application/json, no redirect
curl -sI https://admin.<domain>/admin                  # 200, text/html, content-security-policy with a nonce
curl -sI https://admin.<domain>/r/<id>                 # 404 (no pages on the admin host)
```

After the checks: set `EXPO_PUBLIC_WEB_BASE_URL=https://<domain>` in the EAS environments and
`app/.env`. When the paid Apple team and the Android signing key exist (B-3), replace
`APPLE_TEAM_ID` and the fingerprint in `public/.well-known/`, then add `associatedDomains` and
`intentFilters` in `app.config.ts`.

Rollback: `npx wrangler pages deployment list --project-name shortcut-web`, then roll back in the
dashboard. If needed, remove the custom domains. Nothing on Supabase depends on this project; with
`WEB_PROXY_KEY` unset the `web` function behaves exactly as before.
