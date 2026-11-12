# Renaming Shortcut to Conga (17 Oct 2026)

Conga is the only current product name (Nemat, 17 Oct 2026; `docs/DECISIONS.md`). The public link
domain is `conga.churntech.com`, the moderation admin `admin.conga.churntech.com`, and the Cloudflare
Pages project `conga-web`. This file records what was renamed, what keeps the old name on purpose and
why, and what changing those identifiers later would take. Everything here is local: nothing was pushed,
deployed or changed on Supabase, Cloudflare, Mux, Apple, Google or DNS.

## 1. Renamed

| Area | Now |
|---|---|
| App name and copy | Expo `name` "Conga", `slug` "conga" (no EAS project exists yet, so the slug was free to change). Every user-facing string in `app/src`, the iOS permission strings, the Android notification channel name. Prebuild now generates `ios/Conga.xcodeproj` (display name Conga); `app/scripts/founder-ios.sh` builds `Conga.xcworkspace` and installs `Conga.app`. |
| Boards | The product name in `design/html/*.html`, the canvas notes in `design/BOARDS.md` and the failed-post proposal files, so "the board's copy word for word" stays true. The `design/boards/*.jpg` renders are images and still show "Shortcut"; the HTML is the copy source (`BOARDS.md` note). |
| Spec | `SPEC.md`: the product name and the link domain `conga.churntech.com/r/{id}`, `/p/{id}`, `/i/{code}` (Section 4). No behaviour, limit or flow changed. The online master still says Shortcut: `SPEC-SYNC.md`. |
| Web and admin | The link pages (`supabase/functions/web/render.ts`), the admin (`admin/shell.ts`, its browser storage key `conga_admin_session`), the store-URL fallback `https://conga.churntech.com` (was the unowned `https://shortcut.app`), the Pages project `conga-web` (`web/package.json`, `wrangler.toml`). |
| Proxy headers | `x-conga-proxy-key`, `x-conga-client-ip` between the Pages Worker and the `web` function. Neither side was deployed with the old names, so nothing breaks; both deploy together (`CLOUDFLARE-DASHBOARD.md` parts 2 to 4). |
| Email | Local Auth subjects in `supabase/config.toml` and `supabase/templates/sign_in_code.html`: "Your Conga sign-in code". The hosted template is separate (section 5). |
| Package names | `app/package.json` "conga", `web/package.json` "conga-web" (and their lockfiles' own name only). |
| Docs | `CLAUDE.md`, `README.md`, the app, Supabase and web READMEs, the policy drafts and the current release docs (`STAGE-4-SETUP`, `IOS`, `ANDROID`, `BUILD`, `RELEASE-CHECKLIST`, `PAGES-ROLLOUT`, `WEB-HOSTING`, `SECURITY`, `MODERATION`, `NOTIFICATIONS`, `PROVIDER-*`, `VIDEO-RELIABILITY`, `DESIGN-APPROVALS`, `UI-REVIEW`, `SPEC-SYNC`, `CAMERA-FLIP`, `CUSTOM-DOMAIN`, `FAILED-POST-UI-HOLD`). |
| Local paths | The provider scripts find the main checkout through git (no hard-coded `/Users/nemathsnv/Projects/shortcut`) and default to `~/.conga-provider` (the old `~/.shortcut-provider` was empty on 17 Oct); the environment override is `CONGA_APP_ENV`. |

Left as written (historical evidence): `docs/BETA-READINESS.md`, `docs/PHASE-*-REPORT.md`, `docs/PROGRESS.md`
entries before 17 Oct, `docs/DECISIONS.md` rows before 17 Oct, `docs/release/FINAL-REPORT.md`,
`CYCLE-2-REPORT.md`, `H1-REPORT.md`, `H1-PREFLIGHT.md`, `H2-DEPLOY.md`, `H4-DEPLOY.md`,
`SIMULATOR-WALK.md`, `FAILED-POST-REVIEW-SIMULATOR.md`, the `h*-results` and `c1-results` files, the
screenshots, `spike/` and `prompts/`.

## 2. Kept on purpose

| Identifier | Value | Why it stays |
|---|---|---|
| iOS bundle id | `app.shortcut` (founder build `app.shortcut.founder`) | The founder iPhone build is installed under it: the same id updates that app in place and keeps its sign-in and any unposted recording. Changing it is a one-time decision best made with the App Store Connect record (section 4). |
| Android package | `app.shortcut` | Same decision as the bundle id; never published, never assembled. |
| Kotlin module namespace | `app.shortcut.videostitcher` | Follows the Android package; internal. |
| URL scheme | `shortcut://` (plus `app.shortcut`; the dev client's became `exp+conga`) | Hosted Auth's `site_url` and redirect allow-list, the installed founder app and the deployed `web` v2 pages all use it. Section 4. |
| Association placeholders | `APPLE_TEAM_ID.app.shortcut`, `package_name: app.shortcut` | Must name the real bundle id and package; they follow section 4. |
| On-device storage keys | `shortcut.pendingPost.<member>`, `shortcut.pendingInvite`, `shortcut.recentSearches`, `shortcut.events` | Renaming without a migration would lose an unposted recording on update. Never shown to anyone. |
| Local Supabase `project_id` | `shortcut` (containers `supabase_*_shortcut`, isolated stacks `shortcut-<id>`) | Docker volumes are keyed by it: a new id would start an empty founder stack beside the old one. Change only when the founder stack's data is disposable. |
| Deployed migrations | `shortcut.purging_account` setting, a `shortcut.app` comment | Applied on hosted (24 migrations, fingerprinted); migration files are never edited. |
| Hosted Supabase project | `picvoavfxnajfjkqawju` | An id, not a name. |
| Mux environment | "Shortcut Beta" | Its real name at Mux; docs refer to it by that name. Renaming it at Mux changes no id or token (section 5). |
| Git branches and worktree folders | `claude/shortcut-…`, `.claude/worktrees/shortcut-…` | Active sessions and every report refer to them. Kept unchanged. |

## 3. Brand check (not done)

An established software company already trades as Conga (contract and document software). The
earlier records called Conga "provisional, not cleared" (DECISIONS 9 Oct). Before the App Store Connect
record, the Play listing or any outside build, a trademark and store-name check is still needed. The
icon also still waits for the brand (DECISIONS 9 Oct).

## 4. Migration requirements if the identifiers change

Recommendation: decide the bundle id, the Android package and the scheme **together, once, before** the
first App Store Connect app, Play Console app, Apple App ID with capabilities, Google OAuth client or
Firebase app is created. After those exist the bundle id cannot change (it would be a new store app). If
they change, `com.churntech.conga` follows the domain Nemat owns.

**Bundle id and Android package** (`app.shortcut` to, for example, `com.churntech.conga`):

- `app/app.config.ts` (`ios.bundleIdentifier` with the founder variant, `android.package`), the
  launch id in `app/scripts/founder-ios.sh`, the Kotlin namespace if wanted.
- `supabase/.env` and `.env.example`: `SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID`; then hosted Auth.
- `web/public/.well-known/*` and `web/test/handler.test.ts`, then a new ZIP.
- Docs: `IOS.md`, `ANDROID.md`, `STAGE-4-SETUP.md`, `SECURITY.md`, `NOTIFICATIONS.md`, `CAMERA-FLIP.md`.
- On the founder iPhone it is a new app: the old one stays installed with its own data. Post or discard
  any unposted recording in the old app first, then sign in again in the new one. A free Personal Team
  can register at most 10 App IDs per 7 days.

**URL scheme** (`shortcut://` to `conga://`):

- `app/app.config.ts` `scheme`; `app/src/lib/auth.ts` `APPLE_REDIRECT`; `supabase/config.toml`
  `site_url` and `additional_redirect_urls`, and the same on hosted Auth (URL Configuration), which is a
  hosted change.
- `supabase/functions/web/links.ts` `APP_SCHEME`, its tests, the web tests; redeploy `web` and upload
  a new ZIP.
- Order, so no "Open in the app" button points at a scheme the installed app lacks: ship an app that
  registers both schemes (Expo accepts `scheme: ['conga', 'shortcut']`) and add `conga://auth/callback`
  to the hosted redirect list; then switch the web pages to `conga://`; drop `shortcut` a release later.

**Universal and app links** (B-3, not set up yet): `associatedDomains: ['applinks:conga.churntech.com']`
and Android `intentFilters` for host `conga.churntech.com` only (never the admin host), with the
association files naming the final bundle id and package. Nothing to migrate today, because none exist.
Links already shared point at the function URL (`…supabase.co/functions/v1/web/r/{id}`) and keep working
as long as the `web` function stays deployed: do not remove it after the move to Pages.

**Storage keys**: only with a one-time move in app code (read the old key, write the new, then delete
the old), released before anything depends on the new names. Not recommended: no one ever sees them.

## 5. External names still saying Shortcut (Nemat, dashboards; not done)

| Where | What | Visible to members? |
|---|---|---|
| Supabase, Authentication, Emails (hosted) | The sign-in code template subject and heading "Your Shortcut sign-in code" | **Yes**: every sign-in email. The local files now say Conga; the hosted template must be changed by hand or by a reviewed `supabase config push`. |
| Supabase, Authentication, SMTP settings (hosted) | Sender name "Shortcut" for `no-reply@auth.churntech.com` | **Yes**: the From line. |
| Supabase project settings | The project's display name (if it is "Shortcut") | No. |
| Mux | The environment name "Shortcut Beta" | No. Optional; ids and tokens unchanged. If renamed, update the docs that name it. |
| The online spec and the canvas | SPEC master (Claude Docs) and the A1 Native canvas | Team only. `SPEC-SYNC.md` lists the re-export. |

## 6. Moving the local folder

The main checkout is `/Users/nemathsnv/Projects/shortcut`, with 20 worktrees under
`.claude/worktrees/`. It was not moved on 17 Oct: sessions (including the one that did this rename)
were running inside it and the founder Supabase stack mounts files from it, and moving it under them
would break both. `scripts/move-project-folder.sh` moves it safely when nothing is using it:

```bash
scripts/move-project-folder.sh /Users/nemathsnv/Projects/conga          # checks only
scripts/move-project-folder.sh /Users/nemathsnv/Projects/conga --move   # the move
```

It refuses while any process has its working directory inside the folder or any container mounts files
from it, moves the folder with every worktree inside, runs `git worktree repair` with each new path
(both directions of each link), and checks that every worktree's HEAD and status are unchanged. Branch
and worktree names stay as they are. Tested on a scratch replica (a worktree inside and one outside the
checkout, uncommitted files in both): both repaired, nothing lost. The dry run on the real folder on
17 Oct refused, as it should: the founder stack's containers and open sessions use it.

Before the move: archive or finish the Claude sessions on these worktrees, stop the local stacks
(`supabase stop` keeps the data), close Xcode and Metro. After it: Claude Code keys its per-folder
memory by path, so copy `~/.claude/projects/-Users-nemathsnv-Projects-shortcut/memory/` to the new
folder's entry if you want it carried over; the scripts in this repository need no change.
