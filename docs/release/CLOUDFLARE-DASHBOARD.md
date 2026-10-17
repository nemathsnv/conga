# Conga on Cloudflare Pages, from the dashboard only (prepared 17 Oct 2026; nothing run)

This is how Nemat deploys the shared-link pages and the moderation admin from the Cloudflare dashboard,
with no Wrangler login, API token or account access given to anyone else. It replaces the Wrangler
commands of the earlier rollout (`PAGES-ROLLOUT.md` keeps the six approvals and points here for the
Cloudflare steps).

| | |
|---|---|
| Public links | `https://conga.churntech.com` (`/r/{id}`, `/p/{id}`, `/i/{code}`, `/u/{name}`) |
| Moderation admin | `https://admin.conga.churntech.com/admin` |
| Pages project | `conga-web` (Direct Upload) |
| Upload | `web/dist/conga-web-dashboard.zip`, one file |
| Supabase project | `picvoavfxnajfjkqawju` (unchanged) |
| DNS | `churntech.com` is already on Cloudflare (nameservers `owen` and `luciane.ns.cloudflare.com`, read with `dig` on 17 Oct). Neither hostname exists yet. |

Nothing below has been done. Each numbered part is a separate go-ahead, in this order.

## 0. Before you start

**The package.** Build and check it from this branch (no account, no network beyond npm):

```bash
cd web && npm ci && npm test && npm run build:dashboard && npm run verify:dashboard
```

`build:dashboard` prints the five files and the archive's SHA-256. `verify:dashboard` unzips the archive
into an empty folder, serves it with the local Pages runtime (no `wrangler.toml`, so only what the upload
carries counts) against a fake Supabase, and runs 29 checks. The build is reproducible: the same commit
gives the same SHA-256.

What is in `conga-web-dashboard.zip` (files at the root of the archive, about 38 KB):

| File | What it does |
|---|---|
| `_worker.js` | The whole site as one Worker (Pages "advanced mode"): the link pages, the events, the admin sign-in page and the `/admin/*` proxy. Built from `web/src/worker.ts`. Self-contained: no imports, no secret. Not served as a file. |
| `_routes.json` | Sends every path to the Worker except `/.well-known/*`. |
| `_headers` | `application/json`, `nosniff` and `noindex` for the two association files when Pages serves them directly. The Worker sets the same headers if it serves them. |
| `.well-known/apple-app-site-association` | Universal-link placeholder (`APPLE_TEAM_ID.app.shortcut`). Valid JSON, inert until the Apple Team ID is filled in (B-3). |
| `.well-known/assetlinks.json` | Android app-link placeholder (`app.shortcut`, fingerprint not filled in). Inert until B-3. |

Do **not** upload the `web/` folder, `web/public/` or an unzipped copy. A dashboard upload does not
compile `web/functions/` (Cloudflare: "drag and drop deployments … do not currently support compiling a
`functions` folder"), and a browser can skip the hidden `.well-known` folder. Upload the ZIP itself.
Limits for a dashboard upload are 1,000 files and 25 MiB per file; this is 5 files.

**Two values to have ready.** Neither is ever pasted into a chat, a commit or a ticket.

| Value | Where it comes from |
|---|---|
| The publishable key, `sb_publishable_…` | Supabase dashboard, project `picvoavfxnajfjkqawju`, Project Settings, API Keys, Publishable key. It is the same string as `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `app/.env.founder`. Public by design (every app build and the admin sign-in page carry it), but kept out of git. Never the `service_role` or `sb_secret_` key. |
| `WEB_PROXY_KEY`, new | Generate once on the Mac and keep it in a private file: `mkdir -m 700 -p ~/.conga-provider && (umask 077; openssl rand -hex 32 > ~/.conga-provider/web-proxy.key)`. 64 hex characters. It goes into exactly two places: Cloudflare (part 2) and Supabase (part 3). Copy it with `pbcopy < ~/.conga-provider/web-proxy.key` so no newline or space is added. |

## 1. Create the Pages project by uploading the ZIP

1. Cloudflare dashboard, the account that holds the `churntech.com` zone (the custom domains in part 5
   are simplest from the same account).
2. **Workers & Pages**, **Create**, the **Pages** tab, **Upload assets** (Direct Upload).
3. Project name: `conga-web`. **Create project**.
4. Drop `conga-web-dashboard.zip` into the upload area. **Deploy site**.

Result: a production deployment at `https://conga-web.pages.dev` (if Cloudflare adds a suffix to the
`pages.dev` name, use the address it shows; nothing depends on it). It is public from this moment, but
until part 2 it serves nothing except the two association files: every other path answers `503` with an
empty body (the Worker refuses to run without `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `ADMIN_HOST`).

Check:

```bash
curl -sI https://conga-web.pages.dev/r/x                                   # 503, empty
curl -sI https://conga-web.pages.dev/.well-known/apple-app-site-association  # 200, content-type: application/json
```

A Direct Upload project can never be switched to Git integration later (Cloudflare's rule). That is
fine here: every deployment is a ZIP you build and check first.

## 2. Settings, variables and encrypted secrets

In **Workers & Pages**, `conga-web`, **Settings**:

1. **Runtime** (compatibility settings): compatibility date **2026-10-01** (the date the Worker was
   built and tested with). No compatibility flags.
2. **Variables and Secrets**, environment **Production**, **Add** each of these:

| Name | Type | Value | Must match |
|---|---|---|---|
| `SUPABASE_URL` | Text | `https://picvoavfxnajfjkqawju.supabase.co` | The app's `EXPO_PUBLIC_SUPABASE_URL` in `app/.env.founder` and `eas.json`. `https`, no trailing slash, no path. |
| `ADMIN_HOST` | Text | `admin.conga.churntech.com` | The admin custom domain of part 5. Host only: lower case, no `https://`, no slash. With it set, the admin is served only there and the link pages never are. |
| `WEB_BASE_URL` | Text | `https://conga.churntech.com` | The public custom domain of part 5, and later the app's `EXPO_PUBLIC_WEB_BASE_URL` (part 6). No trailing slash. |
| `SUPABASE_ANON_KEY` | Secret (**Encrypt**) | the publishable key `sb_publishable_…` | The app's `EXPO_PUBLIC_SUPABASE_ANON_KEY` and the dashboard's Publishable key, same project. |
| `WEB_PROXY_KEY` | Secret (**Encrypt**) | the 64-hex value from `~/.conga-provider/web-proxy.key` | Byte for byte the Supabase Edge Function secret `WEB_PROXY_KEY` (part 3). At least 32 characters, or the function ignores it. |

   Do not add `STORE_URL` or `WAITLIST_URL` yet: the pages fall back to `https://conga.churntech.com`
   for the store button and to the same address for the waitlist line, exactly as the `web` function
   does. Set them when the store listing and the waitlist destination exist.

   Leave the **Preview** environment empty. Preview uploads then answer `503` like an unconfigured
   project, so nothing but production can serve a page or the admin.

3. Variables apply to the next deployment. **Deployments**, **Create deployment**, environment
   **Production**, upload the same `conga-web-dashboard.zip`, **Save and deploy**.

Check (on the `pages.dev` address, before any custom domain):

```bash
curl -sI https://conga-web.pages.dev/r/52bbaabb-6faa-4bd2-94f9-015e43be791d   # 200 or 404, content-type: text/html; charset=utf-8, x-robots-tag: noindex
curl -sI https://conga-web.pages.dev/i/TEST                                    # 200, text/html
curl -sI https://conga-web.pages.dev/admin                                     # 404: the admin is not on this host
```

A `500` on `/r/…` means the RPC failed: re-check `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the
publishable key of the same project). A `503` everywhere means one of the three required values is
missing or the second deployment did not happen.

## 3. The same proxy key on Supabase (Supabase dashboard; not Cloudflare)

Supabase dashboard, project `picvoavfxnajfjkqawju`, **Edge Functions**, **Secrets**, add `WEB_PROXY_KEY`
with the value from the same file (or, from the integration worktree:
`supabase secrets set WEB_PROXY_KEY="$(cat ~/.conga-provider/web-proxy.key)" --project-ref picvoavfxnajfjkqawju`).
Every function moves up one version with unchanged bundles, as every secret change does. The deployed
`web` v2 ignores the key until part 4.

## 4. Redeploy the `web` Edge Function (CLI; the lead or Nemat)

The dashboard cannot deploy a function from this repository, so this one step is a CLI command, run from
a checkout that contains the rename (this branch or later):

```bash
supabase functions deploy web --no-verify-jwt --project-ref picvoavfxnajfjkqawju
```

This must be the renamed code. The Pages Worker sends the visitor's address in `x-conga-client-ip`,
signed with `x-conga-proxy-key`; a `web` function from before 17 Oct reads other header names and would
put every visitor into one rate-limit bucket. The redeploy also carries `render.ts` (the Conga wording,
the `conga.churntech.com` fallback) and the `web_link_opened` events. Undo: redeploy `web` from `4602169`
(the version deployed on 16 Oct).

## 5. Attach the two hostnames

In `conga-web`, **Custom domains**, **Set up a domain**:

1. `conga.churntech.com`, **Continue**. Because `churntech.com` is a Cloudflare zone, Cloudflare offers to
   create the DNS record (a proxied CNAME `conga` to `conga-web.pages.dev`); confirm it. Add the domain in
   Pages first: a CNAME created by hand before the association can return 522.
2. The same for `admin.conga.churntech.com` (CNAME `admin.conga`).
3. Wait until both show **Active** (certificate issued). If the zone is in a different Cloudflare
   account from the project, Pages shows the CNAME to add; add it in that account's DNS.

Check on the zone before going public (the dashboard, `churntech.com`, read only):

- **Speed**, Optimization: **Rocket Loader off** for these hosts. It rewrites `<script>` tags, which the
  admin's nonce Content-Security-Policy then blocks.
- **Scrape Shield**: **Email Address Obfuscation off** for these hosts. It injects a script into HTML.
- **CAA**: the zone's current CAA records already allow Let's Encrypt, Google Trust Services and
  SSL.com, which Cloudflare uses. Nothing to change.

`admin.conga.churntech.com` is two levels below the zone. The zone's Universal SSL certificate
(`churntech.com`, `*.churntech.com`) does not cover it; Pages issues a certificate for each custom domain
itself. If the admin domain stays in "certificate pending" for more than an hour, stop and tell the lead:
the fallback is a one-level host (for example `conga-admin.churntech.com`), which means changing
`ADMIN_HOST` and redeploying the ZIP.

Checks (the lead runs them read-only, or you do; record the results in BETA-READINESS):

```bash
curl -sI https://conga.churntech.com/r/52bbaabb-6faa-4bd2-94f9-015e43be791d   # 200, text/html; charset=utf-8, x-robots-tag: noindex, no sandbox CSP
curl -sI https://conga.churntech.com/.well-known/apple-app-site-association   # 200, application/json, no redirect
curl -sI https://admin.conga.churntech.com/admin                              # 200, text/html, content-security-policy with a nonce
curl -sI https://admin.conga.churntech.com/r/x                                # 404 (no pages on the admin host)
```

Then send yourself a `https://conga.churntech.com/r/<live id>` link in a messaging app: the preview
shows the thumbnail and the prompt. The admin is not usable yet: the `admin` Edge Function is not
deployed (H7, its own approval, with the first moderator), so `/admin/me` answers 404 from Supabase.

## 6. The app's link base (after part 5 checks pass)

`EXPO_PUBLIC_WEB_BASE_URL=https://conga.churntech.com` in `app/.env.founder` (git-ignored), then a new
founder build; later the same variable in the EAS `preview` and `production` environments when the EAS
project exists. From then on Share, Share profile and invites make `https://conga.churntech.com/…`
links; links already shared keep their old address and keep working.

## Rollback

| Undo | Where |
|---|---|
| A bad upload | `conga-web`, **Deployments**, a previous production deployment, **Rollback to this deployment**. |
| The public hosts | `conga-web`, **Custom domains**, remove each domain; then remove the two CNAMEs in the `churntech.com` DNS if Cloudflare left them. |
| The project | `conga-web`, **Settings**, **Delete project** (only after the custom domains are removed). |
| The Supabase key | Edge Functions, Secrets, delete `WEB_PROXY_KEY`; with it unset the `web` function trusts no proxy and behaves as before. |
| The `web` function | Redeploy from `4602169`. |

Nothing on Supabase depends on the Pages project, and the app keeps making function-URL links until
part 6.

## What this package does not do

- No Supabase change (parts 3 and 4 are their own approvals), no DNS change before part 5, no secret in
  any file in the repository or the ZIP.
- No universal or app links yet: the `.well-known` files are placeholders until the Apple Team ID and the
  Android signing fingerprint exist (B-3, `IOS.md` section 3, `ANDROID.md` section 6). Until then the
  pages' "Open in the app" button uses the `shortcut://` scheme, which the app still registers
  (`CONGA-RENAME.md` section 4).
- Not tested against Cloudflare itself. What ran is the local Pages runtime (workerd, the same runtime
  Cloudflare uses) on the unzipped archive, and the unit tests. The first real check is part 1's `curl`.
