# Shared links and the admin on Cloudflare Pages: the six approvals (prepared 17 Oct; nothing run)

The rollout of `web/` (option B of `WEB-HOSTING.md`), as six separate go-aheads in order. Each one
says what runs, who runs it, what Nemat has to provide, how it is checked, and how it is undone.
Nothing below has been executed. No DNS, Cloudflare, Supabase or EAS change happens before the
matching approval. `<domain>` is the links domain Nemat chooses (apex, for example `example.app`,
so `/r/{id}` reads as SPEC section 4 wants); the admin lives on `admin.<domain>`.

Who runs what: the lead's shell may not write secret stores (the permission classifier refuses
`supabase secrets set`; `wrangler login` and `wrangler pages secret put` are likely to be refused
too). So Nemat runs the account, login and secret commands himself from the integration worktree
(`cd /Users/nemathsnv/Projects/shortcut/.claude/worktrees/shortcut-multi-agent-execution-93fee4`);
the lead runs the deploys and the read-only checks, or Nemat does if a command is refused. Every
command is in `web/README.md`.

## Before approval 1: inputs from Nemat

| Input | Why | Secret? |
|---|---|---|
| The domain name (`<domain>`), bought, with its DNS on Cloudflare (bought through Cloudflare Registrar, or the nameservers moved to Cloudflare: up to a day). A subdomain of a domain you already own also works if the apex stays elsewhere; then `<domain>` is that subdomain and a CNAME is enough. Not a domain of the provisional brand if it will ever send email (DECISIONS 9 Oct). | Pages custom domains need the DNS zone on Cloudflare for the apex | no |
| The Cloudflare account (free plan) that owns the zone, logged in on the Mac with `npx wrangler login` (opens the browser) | Pages project and secrets | the login token stays in wrangler's own store, never in the repository |
| Confirmation that `STORE_URL` and `WAITLIST_URL` stay unset for now (the pages fall back to the same placeholders as the Edge Function) | optional vars | no |

## Approval 1: Cloudflare Pages project

- **What runs (Nemat):** `cd web && npx wrangler login && npx wrangler pages project create shortcut-web --production-branch main`.
- **What it changes:** a Pages project in the Cloudflare account. Nothing public yet.
- **Need from Nemat:** the login; the go-ahead.
- **Check (lead, read-only):** `npx wrangler pages project list` shows `shortcut-web`.
- **Undo:** `npx wrangler pages project delete shortcut-web`.

## Approval 2: Pages configuration

- **What runs (lead, committed):** fill `web/wrangler.toml` `[env.production.vars]` with
  `ADMIN_HOST = "admin.<domain>"` and `WEB_BASE_URL = "https://<domain>"` (and the same in
  `[env.preview.vars]`); commit.
- **What runs (Nemat, secrets):** generate the proxy key once and keep it in a private file
  (`umask 077; openssl rand -hex 32 > ~/.shortcut-provider/web-proxy.key`), then
  `printf '%s' "$(sed -n 's/^EXPO_PUBLIC_SUPABASE_ANON_KEY=//p' /Users/nemathsnv/Projects/shortcut/app/.env.founder)" | npx wrangler pages secret put SUPABASE_ANON_KEY --project-name shortcut-web`
  and `printf '%s' "$(cat ~/.shortcut-provider/web-proxy.key)" | npx wrangler pages secret put WEB_PROXY_KEY --project-name shortcut-web`.
  Neither value is printed. The publishable key is public by design (it is in every app build);
  the proxy key exists only in the two secret stores and that file.
- **Need from Nemat:** the two commands above; confirm the domain string for the vars.
- **Check (lead):** `npx wrangler pages secret list --project-name shortcut-web` shows the two
  names; `git diff` shows only the two vars.
- **Undo:** `npx wrangler pages secret delete <NAME> --project-name shortcut-web`; revert the commit.

## Approval 3: the same proxy key on the Supabase side

- **What runs (Nemat):** `supabase secrets set WEB_PROXY_KEY="$(cat ~/.shortcut-provider/web-proxy.key)" --project-ref picvoavfxnajfjkqawju`.
- **What it changes:** one function secret (13 names). Every function moves up one version
  (bundles unchanged), as every secret change does. The deployed `web` v2 ignores the key until
  approval 4, so nothing changes in behaviour yet.
- **Need from Nemat:** the command; the go-ahead.
- **Check (lead, read-only):** `supabase secrets list` shows `WEB_PROXY_KEY` by name.
- **Undo:** `supabase secrets unset WEB_PROXY_KEY --project-ref picvoavfxnajfjkqawju`.

## Approval 4: redeploy the `web` function

- **What runs (lead):** `supabase functions deploy web --no-verify-jwt --project-ref picvoavfxnajfjkqawju`
  from the integration tip. It carries `render.ts` (output byte-identical to today's pages, 8/8
  equivalence checks), the trusted-proxy address and the `web_link_opened` events (both active only
  with the key), and the beacon limit and XSS fix already deployed.
- **What it changes:** `web` v3. On the default domain the pages stay `text/plain` (the platform
  rewrite); nothing public is reachable yet.
- **Need from Nemat:** the go-ahead.
- **Check (lead, read-only):** `functions list` shows `web` `ACTIVE`, the others unchanged;
  `curl -sI …/functions/v1/web/r/<V>` still 200; a GET with a forged `x-shortcut-client-ip` and no
  key is ignored (the function logs nothing for it).
- **Undo:** redeploy `web` from 4602169 (the version deployed on 16 Oct).

## Approval 5: deploy the Pages project and attach the two hostnames

- **What runs (lead, or Nemat if refused):** `cd web && npm ci && npm test && npx wrangler pages deploy public --project-name shortcut-web --branch main`.
- **What runs (Nemat, dashboard):** Cloudflare → Pages → `shortcut-web` → Custom domains → add
  `<domain>` and `admin.<domain>` (Cloudflare creates the DNS records in the zone).
- **What it changes:** the first public pages: `https://<domain>/r/{id}`, `/p/{id}`, `/i/{code}`,
  `/u/{name}`, the `.well-known` placeholders, and the admin sign-in page on `admin.<domain>`. The
  admin becomes usable only when the `admin` function is deployed (H7, its own approval) and a
  moderator exists; until then `/admin/me` answers 404 from Supabase and the page shows nothing
  moderators can act on.
- **Need from Nemat:** the dashboard step; the go-ahead.
- **Check (lead, read-only), the four from `web/README.md`:**
  `curl -sI https://<domain>/r/52bbaabb-6faa-4bd2-94f9-015e43be791d` → 200, `text/html; charset=utf-8`,
  `x-robots-tag: noindex`, no sandbox CSP; `curl -sI https://<domain>/.well-known/apple-app-site-association`
  → 200 `application/json`; `curl -sI https://admin.<domain>/admin` → 200 `text/html` with a nonce
  CSP; `curl -sI https://admin.<domain>/r/x` → 404. Then one link preview in a messaging app shows
  the thumbnail and prompt (Nemat, by hand). Record the results in BETA-READINESS.
- **Undo:** remove the custom domains in the dashboard; `npx wrangler pages deployment list` and
  roll back in the dashboard. Supabase is untouched by this step.

## Approval 6: the app's link base

- **What runs (lead, committed; Nemat in EAS when the project exists):**
  `EXPO_PUBLIC_WEB_BASE_URL=https://<domain>` in `app/.env.founder` and the EAS `preview` and
  `production` environments (EAS does not exist yet: stage 4.1; until then the founder build reads
  `.env.founder`). From then on the share sheet, Share profile and invite links the app makes point
  at `<domain>`; nothing already shared changes.
- **Need from Nemat:** the go-ahead; later the EAS variable when `eas init` has run.
- **Check:** a founder build shares a link that opens `https://<domain>/r/<id>` in a browser and
  renders; the `shortcut://` button on it opens the app.
- **Undo:** unset the variable; the app falls back to the function URL.

## After the six (not part of this package)

- H7: deploy the `admin` function (`--no-verify-jwt`), `LINKED=1 scripts/moderate.sh add-moderator
  <username>` for the first moderator (an email-code account), one walk on `admin.<domain>`.
- Universal and app links (B-3): the Apple Team ID into `apple-app-site-association` and the
  Android signing SHA-256 into `assetlinks.json` (both public values), redeploy Pages, then
  `associatedDomains` and `intentFilters` in `app.config.ts`. Needs the paid Apple team.
- `STORE_URL` and `WAITLIST_URL` when the store listing and the waitlist destination exist.

## Rate-limit note

With the key in place the `web` function trusts the visitor address the Pages Function passes, so
the 60-events-an-hour limit stays per visitor. Without approval 3 and 4 every visitor would share
Cloudflare's one subrequest address and the limit would hit after 60 events in total; that is why
3 and 4 come before 5.
