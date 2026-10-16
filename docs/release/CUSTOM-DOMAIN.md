# H5b follow-up: a domain in front of the Edge Functions (prepared 16 Oct; no DNS or account change made)

## Why this is needed

On the default functions domain, `picvoavfxnajfjkqawju.supabase.co`, the platform rewrites an
HTML response to `text/plain` and adds `content-security-policy: default-src 'none'; sandbox`
(observed 16 Oct 12:18 UTC on `/functions/v1/web/i/CHECK` and `/web/r/<V>`; BETA-READINESS
section 25). Supabase documents it: "Serving of HTML content is only supported with custom
domains. Otherwise GET requests that return text/html will be rewritten to text/plain" (Edge
Functions limits), as abuse prevention on the shared domain (changelog, "HTML responses are only
allowed with a Custom Domain enabled"). So, as deployed, the shared-link pages (`web`, B-3) show
source instead of a page, link previews cannot read the Open Graph tags, and the moderation admin
(`admin`, H7) cannot render. Nothing is wrong with the functions themselves: the body is the right
HTML, `noindex`, with the pinned player and the app link.

A vanity subdomain (`<name>.supabase.co`) does not help: it is still the shared domain.

## Options

| | A. Supabase custom domain add-on | B. Own domain with a small proxy | C. Host the pages elsewhere, functions as JSON |
|---|---|---|---|
| What | `links.<your domain>` (a subdomain; apex not supported) CNAMEd to `picvoavfxnajfjkqawju.supabase.co`, verified by a TXT record, activated with the CLI. Edge Functions, Auth and Storage are then served on it; HTML is allowed there. | `links.<your domain>` on Cloudflare (Worker) or Vercel (rewrite) that fetches the function URL and sets `content-type: text/html` back, dropping the sandbox CSP. | A static host (Cloudflare Pages, Vercel) serves the player and admin pages; `web` and `admin` answer JSON only. Supabase's own recommendation for user-facing UI. |
| Cost | Pro plan (from $25/month, if the project is still on Free) plus $10 per domain per month. | Domain only (Cloudflare free tier covers a Worker at this traffic). | Domain only; static hosting free tiers. |
| Work | DNS: one CNAME, one TXT; CLI: `supabase domains create --custom-hostname links.<domain>`, `reverify`, `activate`. Then `EXPO_PUBLIC_WEB_BASE_URL=https://links.<domain>` in EAS, `ADMIN_AUTH_BASE` for the admin, and the Apple/Google OAuth callback URLs re-entered, because Auth advertises the custom domain once activated. About half a day. | A 30-line Worker, plus the same app and admin settings. Depends on the function's body staying untouched by the rewrite (it is today) and on the proxy adding the security headers the function sets itself. About half a day, plus a small maintenance risk if the platform changes the rewrite. | Two new pages to build and host, a JSON mode for `web` and `admin`, link previews served by the static host. Several days; new code to review and test. |
| Side effects | Auth's OAuth callbacks and SAML entity id move to the custom domain (documented); the `supabase.co` domain keeps working, so nothing breaks on activation. "Custom domains are not intended to enable hosting of frontend applications" (docs): a minimal share page and an internal admin are far from a frontend app, but it is Supabase's stated intent. | None on Supabase. The admin's sign-in page would be served through the proxy too; its bearer-only auth and CSP still come from the function. | None on Supabase. |
| Needs from Nemat | The domain (B-3, stage 0.4; must not be a domain of the provisional brand for email, DECISIONS 9 Oct), the Pro plan if not already on it, approval of the add-on. | The domain and a Cloudflare or Vercel account. | The domain, a static host, and a design pass on the pages. |

## Recommendation

Option A, as soon as the domain exists. It is the documented way to serve HTML from these
functions, it removes the `text/plain` rewrite rather than working around it, it costs about $10 a
month on top of a Pro plan that a public beta needs anyway (daily backups, no project pausing,
support), and it takes one CLI session. Option B is the fallback if the add-on is refused or the
plan stays Free; option C is the right long-term shape if the web pages ever grow beyond a player
and an admin.

Until the domain exists: the app's links keep pointing at the function URL (the page is
unreadable in a browser but the `shortcut://` app link in it still works for a phone with the
app), and the admin cannot be used; moderation stays on `scripts/moderate.sh` (development only,
DECISIONS 8 Oct).

## Steps for option A (each on Nemat's go-ahead; nothing here was run)

1. Decide the domain and the subdomain (`links.<domain>`; keep `api.` free in case Auth is ever
   moved deliberately). Make sure the project is on Pro (dashboard, Billing).
2. DNS: `CNAME links.<domain> -> picvoavfxnajfjkqawju.supabase.co` with a low TTL.
3. `supabase domains create --project-ref picvoavfxnajfjkqawju --custom-hostname links.<domain>`
   prints the `_acme-challenge.links` TXT record; add it.
4. `supabase domains reverify --project-ref picvoavfxnajfjkqawju` until verified (up to 30 min for
   the certificate).
5. Before activation: list the OAuth redirect URLs that will change (Apple Services ID return URL,
   Google OAuth client redirect URI) so they are updated right after; email templates do not
   change (codes, no links).
6. `supabase domains activate --project-ref picvoavfxnajfjkqawju`.
7. Check: `curl -sI https://links.<domain>/functions/v1/web/i/CHECK` returns `content-type:
   text/html`; open `/functions/v1/web/r/<V>` in a phone browser; a link preview shows the
   thumbnail and prompt.
8. Set `EXPO_PUBLIC_WEB_BASE_URL=https://links.<domain>` in the EAS environments and `.env`;
   serve `apple-app-site-association` and `assetlinks.json` from that host when the paid Apple
   team and the Android signing exist (B-3); `ADMIN_AUTH_BASE=https://links.<domain>` for the admin
   at H7.

Sources: Supabase custom domains guide (`supabase.com/docs/guides/platform/custom-domains`), Edge
Functions limits (`supabase.com/docs/guides/functions/limits`), pricing add-ons
(`supabase.com/pricing`), changelog "XHTML responses are only allowed with a Custom Domain
enabled".
