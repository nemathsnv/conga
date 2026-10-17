# Web hosting for the shared-link pages and the moderation admin (decision 2, prepared 17 Oct)

**For Nemat to decide.** Nothing has been deployed. No DNS, domain, account, Supabase setting or
hosted resource was created or changed. The hosted project was not contacted.

**Recommendation: option B.** Cloudflare Pages, with Pages Functions serving `/r`, `/p`, `/i`, `/u`
and the admin. Supabase stays the backend API. B is prepared and tested locally in `web/`.

## 1. The problem, and what the vendors say

- **The rewrite.** On `picvoavfxnajfjkqawju.supabase.co`, the `web` and `admin` functions'
  HTML is served as `content-type: text/plain` with `content-security-policy: default-src 'none';
  sandbox`. This was observed on 16 Oct (BETA-READINESS section 25).
  - Supabase documents it in the Edge Functions limits: "Serving of HTML content is only
    supported with custom domains", and `GET` requests that return `text/html` "will be rewritten
    to `text/plain`".
  - The changelog entry "XHTML responses are only allowed with a Custom Domain enabled" gives the
    reason: abuse prevention on the shared project domains. A paid custom domain is the stated
    way to lift it.
- **The catch on custom domains.** The custom-domains guide also says: "Custom domains are not
  intended to enable hosting of frontend applications through Edge Functions." It supports
  subdomains only ("only subdomains are supported"), and it documents only the Auth, Functions
  (`/functions/v1/`), Storage and REST paths.
- **A link domain needs more than HTML.** SPEC.md Section 4 proposes `shortcut.app/r/{id}`,
  `/p/{id}` and `/i/{code}`. B-3 also needs `apple-app-site-association` and `assetlinks.json` at
  `https://<link host>/.well-known/`.
  - Universal links and Android app links are bound to the host that serves those files.
  - The app's own link router only accepts known first path segments: `r`, `p`, `i`, `u` and
    others (`KNOWN_LINK_ROOTS` in `app/src/lib/links.ts`). A link to `/functions/v1/web/r/{id}`
    opened in the app would go to Home.

## 2. The three options side by side

| | A. Supabase custom-domain add-on (`CUSTOM-DOMAIN.md`) | B. Cloudflare Pages + Pages Functions (**recommended, prepared**) | C. Thin Worker proxy in front of the functions |
|---|---|---|---|
| Public link | `https://links.<domain>/functions/v1/web/r/{id}` | `https://<domain>/r/{id}` (the apex works) | `https://<domain>/r/{id}` |
| Matches SPEC Section 4 and the app's link router | No: no apex, and the `/functions/v1/web` prefix stays | Yes | Yes |
| `/.well-known` files for universal and app links | Not documented as possible on a Supabase custom domain, so B-3 cannot close with A alone | Static files, free, no Function call (prepared as placeholders) | The Worker can answer them |
| Supported by both vendors for this use | Supabase says custom domains are not intended for frontend hosting | Yes: Pages is Cloudflare's frontend host, and Supabase is used as an API, which is its intended use | No. It works around the rewrite and relies on Supabase leaving the body untouched (observed, not documented) |
| Code | None | Done: a shared `render.ts`, two small opt-in adaptations, and `web/` (section 3) | About 60 lines, plus base-path handling and admin CSP reconstruction (section 5) |
| Running cost | Paid plan (Pro from $25/month) plus $10/month per domain, billed hourly and not covered by the spend cap | $0 on Cloudflare's free plan at beta traffic; the domain only | Same as B |
| Client address for rate limits | Unchanged | The proxy's subrequests carry Cloudflare's one Worker address, so the visitor address is passed with a shared key (`WEB_PROXY_KEY`), prepared and tested | Same problem, same fix needed |
| Auth side effects | Auth advertises the custom domain for OAuth callbacks; Apple and Google redirect URLs must be added before activation | None. Auth stays on `supabase.co` | None |
| Time to first working deployment, once domain and account exist | About half a day, plus up to about 30 minutes for the certificate | About 2 to 3 hours of steps (README), plus DNS propagation | About half a day, plus the admin CSP question |

## 3. Option B in detail (prepared)

### Code changes

**Supabase side.** Every change below is behind the existing behaviour. With `WEB_PROXY_KEY`
unset, the function's answers are identical.

| File | Change | Size |
|---|---|---|
| `supabase/functions/web/render.ts` (new) | The page functions moved out of `index.ts` unchanged, with only the path prefix and the three URLs taken from a `RenderConfig`. Output for the function's config is byte-identical to before: checked against the pre-move code for 7 page variants and the response headers, with and without `STORE_URL`/`WAITLIST_URL`. | 214 lines (moved) |
| `supabase/functions/web/index.ts` | Uses `render.ts`. With a matching `WEB_PROXY_KEY` it takes the visitor address from `x-shortcut-client-ip` and logs `web_link_opened` posted to `/e/link-<target>`. Without the key, both headers and that path are ignored (204, nothing logged). | 240 to 64 lines |
| `supabase/functions/web/links.ts` | `LINK_TARGETS`, `linkEventTarget()` | +12 |
| `supabase/functions/_shared/client.ts` | `proxyKeyMatches()` (constant time; refuses keys under 32 characters) and `proxiedClientIp()`, which falls back to `clientIp()` | +25 |
| `supabase/functions/admin/handler.ts` | `export` on `SECURITY_HEADERS`, `nonce`, `csp`. No behaviour change. | 3 words, 2 comment lines |
| `_tests/client_test.ts`, `_tests/web_links_test.ts` | New cases for the above; the source-scan test now also reads `render.ts` | +40 |

**`web/` (new; its own `package.json`; nothing in `app/`).**

| File | What it does |
|---|---|
| `src/handler.ts` | 103 lines. Routing, the anon RPC calls, event forwarding. |
| `src/admin.ts` | 66 lines. The sign-in page from the function's own `shellPage`, `SECURITY_HEADERS` and `csp`. The `/admin/*` proxy forwards only Authorization, Content-Type and Sec-Fetch-Site, and restores the content type. |
| `functions/[[path]].ts` | 8 lines. The Pages entry point. |
| `public/_routes.json`, `_headers`, two `.well-known` placeholders | Static files. |
| `wrangler.toml`, `README.md` | Config, and the exact deploy commands (not run). |
| `test/handler.test.ts` | 21 tests. |

`render.ts`, `shell.ts` and `handler.ts` are imported straight from `supabase/`, and wrangler's
esbuild bundles them (50 KB). There is no copy and no build step that touches `app/`.

### What keeps working unchanged

- The function URLs, and the Edge Functions' own output.
- The app, which builds links from `EXPO_PUBLIC_WEB_BASE_URL`, so the function URL keeps working
  until it is set.
- The RPCs `web_video` and `web_prompt`, already granted to `anon`.
- Auth, and the database.
- The admin's whole security model: the token is checked with Auth and the moderator membership on
  every request, in the function.
- The rate-limit rules.

### Cost

- **Cloudflare free plan.**
  - Pages Functions requests count against the Workers free allowance: 100,000 requests a day,
    reset at midnight UTC, 10 ms CPU per request, 50 subrequests.
  - Static assets, including the `.well-known` files, are free and unlimited.
  - Over the daily limit, Workers return error 1027. The Pages pricing page does not say what
    Pages Functions do when the limit is passed.
- **Per page view:** 1 Function request, 1 PostgREST call and 1 Edge Function invocation (the
  event). Today it is 1 Edge Function invocation, so the Supabase-side function count is the same.
  Each sign-in sheet opened adds 1 Function request and 1 Edge Function invocation.
- **Headroom.** At closed-beta traffic in Canggu this is far below the limits. If it ever grows,
  the Workers Paid plan is the next step (check current pricing).
- **Plans.** No Supabase plan change is needed for B. Whether the beta needs Pro for backups and
  no pausing is a separate question.

### Authentication and security

- **Admin, bearer only.**
  - The proxy forwards `Authorization`, `Content-Type` and `Sec-Fetch-Site` and nothing else, so
    no cookie ever goes up.
  - The function still refuses a request whose `Sec-Fetch-Site` is not same-origin. This was
    checked through `wrangler pages dev` with a real moderator token: a cross-site POST got 403
    `forbidden`.
  - Cloudflare terminates TLS for the Pages domain, so it handles moderator tokens in transit, as
    any CDN or proxy does.
- **CSP nonces.** The sign-in page is rendered at the Pages edge with a fresh nonce on every
  request (the function's own `nonce()` and `csp()`).
  - `connect-src` is `'self' <SUPABASE_URL>`: the views and actions are same-origin through the
    proxy, and Auth is direct.
  - Every proxied answer gets the function's `SECURITY_HEADERS`, including
    `default-src 'none'; frame-ancestors 'none'`. Any upstream (sandbox) CSP is dropped.
- **Admin origin.** With `ADMIN_HOST=admin.<domain>`, the admin is served only on that host, and
  the public pages (inline scripts, no CSP) never are.
  - So nothing else runs on the admin's origin.
  - On a Supabase custom domain (A), by contrast, the admin would share its origin with every
    function and with public Storage.
- **Anon key in pages.** The admin sign-in page carries the project's publishable key, as it does
  today. It is the same public key the app ships. In Cloudflare it is a secret binding only so
  that it stays out of git, like `app/.env`. This project holds no service-role key: events still
  go through the `web` function, which is the only place `web_event_allowed` can run. Anon gets 401
  on it; checked locally.
- **CORS.** None is needed for the server-side calls: Pages to PostgREST and Pages to the
  functions. The browser talks cross-origin only to Auth at `supabase.co`, the normal
  supabase-js browser pattern. It has not been tested from a deployed Pages origin, because there
  is none.
- **Rate limits and client IP.**
  - Cloudflare documents that on a cross-zone Worker subrequest, `CF-Connecting-IP` "will be set to
    the Worker client IP address `2a06:98c0:3600::103`". It also says that an existing
    `X-Forwarded-For` gets the proxy's address appended.
  - `clientIp()` in `_shared/client.ts` and `request_client_ip()` (migration `20261016000204`)
    read `cf-connecting-ip` first. So, behind any Cloudflare proxy, every visitor would land in
    one `web_event` bucket: 60 events an hour for everyone, then silence.
  - B passes the visitor's `CF-Connecting-IP` in `x-shortcut-client-ip` with `x-shortcut-proxy-key`.
    The function trusts it only when the key matches.
  - Checked locally: 65 beacons from one address recorded 60, and a second address still
    recorded 1.
  - The database's `request_client_ip()` is not reached by anything B calls: `web_video` and
    `web_prompt` do not use it. Invite lookups come from the app, not the pages, and Auth is called
    by the browser directly. So nothing there changes.
  - `SECURITY.md` risk 2 (which header the hosted gateway really carries) is still open and is
    independent of this choice.

### Deployment dependencies

- A domain. Its DNS must be on Cloudflare to serve the apex; a subdomain can be a CNAME. It must
  not be a domain of the provisional brand if it will also send email (DECISIONS 9 Oct).
- A Cloudflare account, and `wrangler` (in `web/`, pinned at 4.146.0).
- Secrets: `SUPABASE_ANON_KEY` and `WEB_PROXY_KEY` on Pages. The same `WEB_PROXY_KEY` as a
  Supabase function secret, then a redeploy of `web`, which also ships `render.ts`.
- `EXPO_PUBLIC_WEB_BASE_URL=https://<domain>` in the EAS environments.
- The real `apple-app-site-association` (the Apple team id) and `assetlinks.json` (the Play
  signing SHA-256), plus `associatedDomains` and `intentFilters` in `app.config.ts`, once the paid
  Apple team and the Android signing exist (B-3).
- The exact commands are in `web/README.md`.

### Operational risks

- Two vendors to watch instead of one.
- `WEB_PROXY_KEY` lives in two places and has to be rotated together. A mismatch silently drops
  `web_link_opened` and pools the beacon's limit; the pages themselves keep working.
- A page change in `render.ts` needs both the Pages deploy and the `web` function deploy to stay
  aligned. The function URL is only a fallback, though.
- If PostgREST is unreachable, visitors get the unavailable page with a 500, as the function does
  today.
- The free-plan daily cap: watch it in the Cloudflare dashboard.
- Pages Function answers are not cached at the edge. `Cache-Control: public, max-age=60` applies
  to browsers, as today.

### Time to first working deployment

The code is done and tested locally. With the domain and the account, the README steps take about
2 to 3 hours, plus DNS:

- A domain bought through Cloudflare Registrar is on Cloudflare DNS at once.
- A nameserver move from another registrar can take up to a day.

## 4. Option A in detail

- **Code changes:** none. Set `EXPO_PUBLIC_WEB_BASE_URL=https://links.<domain>/functions/v1/web`.
  `ADMIN_AUTH_BASE` can stay empty, since Auth is then same-origin.
- **What keeps working:** everything, with no extra hop. Client addresses are unchanged.
- **Cost:** a paid plan (Pro from $25/month if the project is on Free), plus $10/month per domain.
  It is billed hourly and is not covered by the spend cap.
- **Security:** the admin and the pages share an origin with every function, Auth and public
  Storage on that domain. Storage may then serve HTML too (changelog). The avatars bucket accepts
  only JPEG, PNG or WebP, so the practical risk is low, but the origin is not isolated.
- **Deployment dependencies:** DNS (one CNAME, one TXT), then the CLI `domains create`,
  `reverify` and `activate`. Apple and Google OAuth redirect URLs are re-entered (both are off on
  hosted today).
- **Operational risks:**
  - Supabase's stated intent ("not intended to enable hosting of frontend applications").
  - No apex.
  - No documented way to serve `/.well-known` at the host root, so universal and app links (B-3)
    cannot close on this host.
  - Its URLs fail the app's link router (section 1).
- **Time:** about half a day once the domain exists.

## 5. Option C in detail

- **Code changes:** a Worker of about 60 lines that maps `/r/*` and the others to
  `/functions/v1/web/*`, sets `text/html` back, drops the sandbox CSP and re-adds the function's
  headers. It also has to expose `/functions/v1/web/*` (the function's beacon and "more responses"
  links use that prefix) or rewrite the bodies.
- **The admin's nonce CSP.** It is either replaced by the platform's sandbox policy or sent next
  to it. That is unknown: the `web` function sets no CSP of its own, so the 16 Oct observation
  cannot tell. If it is replaced, the proxy has to rebuild the policy from the nonce in the body
  (fragile) or render the shell itself, which is B.
- **Client address:** the same Worker address problem as B, and it needs the same `WEB_PROXY_KEY`
  adaptation.
- **Cost:** the same as B.
- **Operational risk.** It depends on Supabase leaving the rewritten body untouched. That is
  observed, not documented, and it deliberately works around an abuse control. Supabase could
  block or strip it at any time, and both the links and the admin would break together.
- **Time:** a few hours of code, then the same deployment steps as B.

## 6. Why B

- **Supported:** Pages is Cloudflare's frontend host, and Supabase is used only as an API.
- **It closes B-3:** apex links that match SPEC Section 4 and the app's router, and `.well-known`
  served as static JSON.
- **No Supabase plan change** and no OAuth callback changes.
- **Better isolation:** the admin gets an origin of its own.
- **It is already built and checked locally,** so the only remaining work is the account, the
  domain and the deploy commands.

A is fewer moving parts, but it cannot deliver the link domain the spec describes. C is the
quickest hack, but it is unsupported, and B costs no more.

## 7. What was run (17 Oct, local only)

- **Byte-equivalence.** `render.ts` was compared with the pre-move `index.ts` (Deno), with the
  three environment variations: 8/8 tests each.
- **Deno unit tests.** `deno test --allow-env --allow-read
  supabase/functions/_tests/web_links_test.ts supabase/functions/_tests/client_test.ts`: 12/12.
  `_tests/admin_authz_test.ts`: 18/18.
- **Type checks.** `deno check` passed on `web/index.ts`, `web/render.ts` and `admin/index.ts`.
- **`web/` tests.** `cd web && npx vitest run`: 21/21. `npx wrangler pages functions build`
  compiled, and the bundle has no `Deno.` and no service-role reference.
- **An isolated local stack `shortcut-g`** (ports 557xx; studio, analytics and realtime off),
  with `supabase functions serve` (`WEB_PROXY_KEY` set) and `wrangler pages dev` on
  `127.0.0.1:8788`:
  - **Pages and admin checks: 31/31.** `/r/<live response>` returns 200 `text/html; charset=utf-8`
    with `x-robots-tag: noindex` and no CSP header. The body has the meta noindex, `og:title`, the
    Mux `og:image`, `shortcut://r/<id>`, the pinned hls.js with SRI and the beacon on `/e/signin`.
    After normalising the path prefix, `og:url` and the avatar host, it is identical to the local
    Edge Function's page.
  - The same holds for `/p/<prompt>`. A video reply shows Reply. An unknown id gives 404 and a
    non-UUID gives 500, both the unavailable page, as the function does. `/i` renders, and the
    hostile code is escaped (X1). `/u` renders, and `/` gives 404.
  - Both `.well-known` files return 200 `application/json`.
  - `/admin` returns the sign-in page with a nonce CSP. `/admin/me` without a token, or with a bad
    one, returns 401.
  - `/e/signin` returns 204 and logged one event. `web_link_opened` was logged for invite and
    profile, which only Pages produced; video and prompt rows also came from direct function
    fetches.
  - **Admin through the proxy, with real Auth tokens: 2/2.** A moderator gets `/me` and the
    reports view as `text/html` with the security headers. A non-moderator gets 403 with an empty
    body, and the anon key gets 401. A cross-site POST is refused with 403 `forbidden`, and a
    same-origin POST reaches the action (404 `not_found` for a made-up id).
  - **Per-visitor limit through the proxy:** 60 of 65 recorded from one address, then 1 from
    another.
  - **The existing `_tests/web_beacon_integration_test.ts`** against the function directly: 1/1.
  - **Publishable-key request shape** (apikey header only) for `web_video`: 200. Anon on
    `web_event_allowed`: 401.
  - The stack was stopped afterwards, and the local key files were deleted.
- **Not run:**
  - Any deployment, Cloudflare login, DNS or domain step.
  - Anything against the hosted project or Mux.
  - A real browser rendering the page.
  - Link-preview crawlers.
  - Universal links on a device (they need the paid Apple team and a real domain).
  - Cross-origin Auth from a deployed Pages origin.
  - The `x-forwarded-for`/`cf-connecting-ip` behaviour of the hosted gateway (SECURITY risk 2).
  - Whether `*.supabase.co` is itself a Cloudflare zone. The fix does not depend on it: a proxy's
    subrequest never carries the visitor's address either way.

## 8. Needs Nemat

1. The choice: B (recommended), A or C.
2. The domain name, and the admin subdomain (for example `admin.<domain>`).
3. A Cloudflare account, ideally with the domain on Cloudflare DNS or Registrar.
4. The approval to deploy:
   - the Pages project and its secrets;
   - `WEB_PROXY_KEY` as a Supabase function secret;
   - a redeploy of the `web` function (it now carries `render.ts`);
   - then `EXPO_PUBLIC_WEB_BASE_URL` in EAS.

## Sources

- Supabase, Edge Functions limits: `https://supabase.com/docs/guides/functions/limits`. Says HTML
  is only supported with custom domains, and `text/html` is rewritten to `text/plain`.
- Supabase changelog: `https://supabase.com/changelog/29633-xhtml-responses-are-only-allowed-with-a-custom-domain-enabled`.
- Supabase, custom domains: `https://supabase.com/docs/guides/platform/custom-domains`. Says they
  are not intended for frontend hosting, are subdomains only, cover Auth, Functions and Storage,
  and that OAuth advertises the custom domain.
- Supabase, custom domain billing: `https://supabase.com/docs/guides/platform/manage-your-usage/custom-domains`.
  $0.0137 an hour ($10 a month), not covered by the spend cap.
- Cloudflare, HTTP request headers: `https://developers.cloudflare.com/fundamentals/reference/http-headers/`.
  `CF-Connecting-IP` on same-zone and cross-zone Worker subrequests, and how `X-Forwarded-For` is
  appended.
- Cloudflare, Pages Functions pricing: `https://developers.cloudflare.com/pages/functions/pricing/`.
  Billed as Workers requests; static assets are free and unlimited.
- Cloudflare, Workers limits: `https://developers.cloudflare.com/workers/platform/limits/`. 100,000
  requests a day, 10 ms CPU, 50 subrequests, error 1027.
- Cloudflare, Pages limits: `https://developers.cloudflare.com/pages/platform/limits/`. 500 builds a
  month, 20,000 files, 25 MiB per file, 100 custom domains, `_headers` and `_redirects` limits.
