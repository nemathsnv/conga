# Shared links and the admin on Cloudflare Pages: the six approvals (revised 17 Oct; nothing run)

The rollout of `web/` (option B of `WEB-HOSTING.md`) as six separate go-aheads, in order. Revised on
17 Oct for the rename (`CONGA-RENAME.md`) and for a **dashboard-only** Cloudflare deployment: Nemat
does every Cloudflare step in the dashboard, with no `wrangler login`, API token or account access for
anyone else. The click-by-click steps, settings and checks are in `CLOUDFLARE-DASHBOARD.md`; this file
is the approval sequence. Nothing below has been executed.

| | |
|---|---|
| Links | `https://conga.churntech.com` |
| Admin | `https://admin.conga.churntech.com` |
| Pages project | `conga-web`, Direct Upload of `web/dist/conga-web-dashboard.zip` |
| DNS | `churntech.com` is already a Cloudflare zone; no purchase, no nameserver move |

The first revision (17 Oct, before the rename) assumed a domain still to be bought and Wrangler
commands; both are superseded. The order is unchanged.

## Inputs, before approval 1

| Input | Secret? |
|---|---|
| The ZIP built and checked from this branch: `cd web && npm ci && npm test && npm run build:dashboard && npm run verify:dashboard` (prints the SHA-256) | no |
| The publishable key `sb_publishable_…` of `picvoavfxnajfjkqawju` (Supabase dashboard, API Keys; same as `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `app/.env.founder`) | public, kept out of git |
| A new `WEB_PROXY_KEY` in `~/.conga-provider/web-proxy.key` (`CLOUDFLARE-DASHBOARD.md` section 0) | yes |
| `STORE_URL` and `WAITLIST_URL` stay unset for now | no |

## The six approvals

| # | What | Who, where | Check | Undo |
|---|---|---|---|---|
| 1 | Create Pages project `conga-web` by uploading the ZIP | Nemat, Cloudflare dashboard (`CLOUDFLARE-DASHBOARD.md` part 1) | `conga-web.pages.dev/r/x` is 503 (unconfigured, by design); the AASA file is 200 JSON | Delete the project |
| 2 | Compatibility date 2026-10-01; variables `SUPABASE_URL`, `ADMIN_HOST`, `WEB_BASE_URL`; encrypted `SUPABASE_ANON_KEY`, `WEB_PROXY_KEY`; upload the same ZIP again | Nemat, dashboard (part 2) | `pages.dev/r/<id>` text/html with noindex; `pages.dev/admin` 404 | Delete the variables; roll back the deployment |
| 3 | The same `WEB_PROXY_KEY` as a Supabase function secret (13 names) | Nemat, Supabase dashboard or `supabase secrets set` (part 3) | `supabase secrets list` shows the name | Delete the secret |
| 4 | Redeploy the `web` function from this branch or later (the renamed `x-conga-*` headers, `render.ts`) | Lead or Nemat, CLI: `supabase functions deploy web --no-verify-jwt --project-ref picvoavfxnajfjkqawju` (part 4) | `functions list`: `web` ACTIVE, others unchanged; the function URL still answers 200 | Redeploy from `4602169` |
| 5 | Custom domains `conga.churntech.com` and `admin.conga.churntech.com` | Nemat, dashboard (part 5); Cloudflare creates the two CNAMEs in the zone | The four `curl` checks of part 5 and one link preview by hand; results into BETA-READINESS | Remove the domains |
| 6 | `EXPO_PUBLIC_WEB_BASE_URL=https://conga.churntech.com` in `app/.env.founder`, later EAS | Nemat (git-ignored file), then a founder build | A shared link opens `https://conga.churntech.com/r/<id>` and renders; "Open in the app" opens the app | Unset; the app falls back to the function URL |

Approvals 3 and 4 come before 5: with the key in place the `web` function trusts the visitor address
the Worker passes, so the 60-events-an-hour limit stays per visitor. Without them every visitor would
share Cloudflare's one subrequest address. Approvals 1 and 2 only expose `conga-web.pages.dev`, which
nothing links to.

## After the six (not part of this package)

- H7: deploy the `admin` function (`--no-verify-jwt`), `LINKED=1 scripts/moderate.sh add-moderator
  <username>` for the first moderator (an email-code account), one walk on `admin.conga.churntech.com`.
- Universal and app links (B-3): the Apple Team ID into `apple-app-site-association` and the Android
  signing SHA-256 into `assetlinks.json` (both public values), a new ZIP, then `associatedDomains` and
  `intentFilters` in `app.config.ts`; the bundle id decision first (`CONGA-RENAME.md` section 4).
- `STORE_URL` and `WAITLIST_URL` when the store listing and the waitlist destination exist (two more
  variables, then upload the ZIP again).
- The hosted sign-in email still says Shortcut (`CONGA-RENAME.md` section 5).
