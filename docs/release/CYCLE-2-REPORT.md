# Shortcut: cycle 2 report (16 to 17 Oct 2026)

Follows `FINAL-REPORT.md` (cycle 1, the six-agent integration) and the hosted work of 16 Oct
(BETA-READINESS sections 21 to 28). Everything here is local unless a section says otherwise.
Nothing was pushed (the repository has no remote), deployed, bought, or changed in DNS; no live
provider test ran.

## Integrated HEAD

`claude/shortcut-multi-agent-execution-93fee4`, the commit after the one that adds this report (`git log --oneline -1` on the branch), clean tree. Since 7ca853d (the end of
the hosted day): the failed-post UI merged from `hold/failed-post-ui`, the 14 boards added to the
approved set, the Cloudflare Pages project in `web/`, the web function's rendering shared from
`render.ts`, the provider-session plan, the Stage 4 setup checklist, and the records.

## Decision 1: failed-post UI (P1 to P9), done

- Merged from `hold/failed-post-ui` at 05173b6 into the development branch (3908825): Discard beside
  Retry (P1, P1-R), the "can't be posted" and "no longer on this phone" lines (P2, P3), the Discard
  confirmation with the corrected copy (P4), Discarding (P5), already reached Shortcut (P6), the
  camera-entry block (P7, P8, P8-R), and the sign-out warning on every route (P9). Behaviour follows
  the five decisions of 14 Oct; no copy or behaviour beyond the approved boards.
- Board set: `design/BOARDS.md` lists 100 boards (86 plus the 14 failed-post boards), with
  `design/html/<ID>.html` and `design/boards/<ID>.jpg` for each; X-Upload-Failed, LV-SignOut,
  PR-Posting and A-Offline updated. SPEC.md section 19's status note and `docs/DECISIONS.md` record
  the approval (ed854d7). DESIGN-APPROVALS A2 to A4 and sections B to D are still open.
- Tests: typecheck and lint clean, Jest 25 suites 347/347 on the merged tip.
- Simulator verification and screenshot review (`docs/release/FAILED-POST-REVIEW-SIMULATOR.md`,
  18 screenshots in `docs/release/screenshots/failed-post/`): every state reachable on the iOS
  simulator shows the approved copy word for word: P1, P1-R, P2, P3, P4, P5, P5-R, P6, P7, P8, P8-R,
  and P9 from Settings, from LV-Suspended and from Delete account by email (asked after the code,
  before anything is deleted; Cancel deletes nothing). Not producible on the simulator: P8 on Post
  Review (needs a recorded take), P9 on the Apple and Google deletion paths, A-Offline for a video
  reply, the draft variants. Two defects the review found were fixed and re-verified on the
  simulator: the banner thumbnail was an empty square (the video file had been given to an image
  view; it now shows the recording's first frame through a paused video view) and the confirm-email
  footer sat under the number pad (it now stays above the keyboard, like the sign-in code screen).
  A third finding (a recording whose file is gone showed P1 until Retry) is fixed in
  `memberPosting.ts`: the restored post shows P3 at once (Jest 350/350, not re-walked on the
  simulator). One design question remains for Nemat (N3: P7's "Retry or discard it first." shows while a discard
  is still unconfirmed and neither button is on screen, a consequence of build decision 2).

## Decision 2: domain architecture, compared and prepared (not deployed)

`docs/release/WEB-HOSTING.md` compares the Supabase custom-domain add-on, Cloudflare Pages with
Pages Functions, and a thin proxy. **Recommendation: Cloudflare Pages with Pages Functions**,
Supabase stays the backend:

- The add-on cannot give the link domain SPEC section 4 describes: subdomains only, the
  `/functions/v1/web/` prefix stays in every link, and nothing can serve
  `/.well-known/apple-app-site-association` or `assetlinks.json` at the host root, so universal
  and app links (B-3) could not close on it; Supabase also states custom domains are not meant for
  frontend hosting. The thin proxy depends on undocumented behaviour of the HTML rewrite.
- Prepared in `web/` (its own `package.json`, no change to `app/`): Pages Functions render `/r`,
  `/p`, `/i`, `/u` with the Edge Function's own rendering code (bundled from `supabase/`, so the
  pages are byte-identical apart from the host), forward the analytics events with the visitor's
  address, serve the admin sign-in page with the function's headers and nonce CSP and proxy
  `/admin/*` to the admin function passing only Authorization, Content-Type and Sec-Fetch-Site;
  `.well-known` placeholders; `wrangler.toml`; README with the deploy commands (not run).
- Code changes on the Supabase side, inert until a key is set: `web/render.ts` extracted from
  `index.ts` (output byte-identical, 8/8 equivalence checks); an opt-in `WEB_PROXY_KEY` that lets
  the function trust `x-shortcut-client-ip` from the Pages origin (without it, Cloudflare's fixed
  subrequest address would put every visitor in one rate-limit bucket); admin exports its headers
  and nonce helpers. The deployed `web` function (v2) predates `render.ts` and must be redeployed
  with the Pages rollout.
- Verified locally: vitest 21/21 (twice, G's worktree and the integration worktree); the Pages
  bundle compiles (50 KB, no Deno API, no service-role reference); against an isolated local stack
  with `wrangler pages dev`, 31/31 page checks (`text/html`, `noindex`, no sandbox CSP, same Open
  Graph and app link), admin through the proxy with real Auth tokens 2/2 (moderator 200,
  non-moderator 403 empty, anon 401, cross-site POST 403), per-visitor rate limit 60 of 65 then a
  second address.
- Cost: Cloudflare free tier (Pages and 100,000 Functions requests a day); no Supabase add-on; the
  Supabase Pro plan becomes optional for the domain (still worth it for backups and no pausing).
- Security: the admin keeps bearer-only auth and server-side moderator checks (the Pages layer
  never sees a session cookie); the anon key in the page is public by design; CORS: the browser
  calls Auth on `supabase.co` directly as today; the CSP nonce is generated by the Pages Function
  for the sign-in page and by the Edge Function for the rest.
- Dependencies: the domain (B-3; not a domain of the provisional brand if it sends email), a
  Cloudflare account with DNS, `WEB_PROXY_KEY` as a Pages secret and a Supabase function secret,
  the `web` redeploy, `EXPO_PUBLIC_WEB_BASE_URL` in EAS, and later the Apple team id and Android
  SHA-256 for the `.well-known` files plus `associatedDomains` and `intentFilters` in
  `app.config.ts`. Time to first working deployment once the domain exists: about half a day.

## Decision 3: provider testing, one session planned

`docs/release/PROVIDER-SESSION.md`: C2w (fresh), C2a, E1, E2, E3a in one window, E3b (the purge
and asset deletion) on day 31. 16 approval points, 10 stop rules, two function-secret windows in
all (one in the session, one on day 31) instead of one per live step; the database switch is raised
only inside each guarded drain. The pending job `e48cdb45…` (U5, timed out) is listed alongside
the fresh job and closes as `done`/`timed_out` with a GET only. No asset is created by any step;
E3b deletes T1's asset a. Nemat enters the codes and toggles the secret; the lead runs the rest.
Three choices are Nemat's: the one-window shape, E3b on day 31 (recommended) or same day, and
keeping the C2w-b dry run (recommended).

## Decision 4: Stage 4 setup, one checklist

`docs/release/STAGE-4-SETUP.md`: 63 items grouped as accounts and payments, decisions, Apple,
Google, push, email, domain and web, Mux, devices, Supabase plan; each marked REQUIRED or
OPTIONAL, with the iPhone-only subset, who creates it, where it goes, console steps in order,
dependencies and what it unblocks. Reconciled with the Cloudflare path (3412d7b). No value is asked
for in it; no secret is printed anywhere in the repository.

## Decision 5: other work

- Release build dry run (`BUILD.md` section 7): `npm ci`, typecheck, lint, Jest 347/347,
  `expo prebuild --no-install --platform all` succeeds on the merged tip; `eas.json` needs no
  change; the founder build script matches the config; exact `eas build` and `eas submit`
  commands per profile.
- `RELEASE-CHECKLIST.md` carries the state after 16 Oct (24 migrations, 847-object fingerprint,
  9 functions, 12 secrets, Vault holding the avatar entries only) and the done markers for H1 to
  H6, C1, the failed-post UI and the Cloudflare path for H5b, H7, 3.7 and B-3.
- Notion: the connector is not authorised in this session; `docs/PROGRESS.md` is the record to
  synchronise, with real statuses.

## Tests on the integrated HEAD

Consolidated run 4 (`scripts/full-local-verification.sh`, isolated stack `shortcut-int`, 17 Oct 11:18
to 11:29 local, functions and migrations as at 4966c61, app as at the end of the run):

| Suite | Result |
|---|---|
| pgTAP, 22 files | 1662/1662 |
| Deno unit: mux 21, cleanup 11, abandon 4, admin authz 18, web links 7, client 5 | all pass |
| Deno integration: uploads 32, integration 20, cleanup 28, idempotency 12, abandon 16, admin 7, admin HTTP 4, avatar cleanup 3, sign-in method 3, web beacon 1 | all pass |
| `scripts/idempotency-rollback-check.sh` | passed |
| `scripts/scheduler-integration.sh` | 13/13 |
| `scripts/c1-rehearsal.sh` | passed (29 checks) |
| `scripts/provider-rehearsal.sh` | 8/8 |
| `scripts/auth-integration.mjs` | 52/52 |
| App: `tsc --noEmit`, `expo lint` | clean |
| App: Jest, 25 suites | 348/348 in run 4; 350/350 after the last fix (P3 at launch for a missing file) |
| `web/`: vitest | 21/21; Pages bundle compiles |
| iOS simulator (Agent B): P1 to P9 | every reachable state matches the approved copy word for word (15 screenshots, `FAILED-POST-REVIEW-SIMULATOR.md`); re-check of the two fixes: both work (the banner shows the recording's first frame; Delete account sits above the number pad and submits by touch), three screenshots |

Not run: anything on a phone; Android assembly; the Pages project on Cloudflare; hosted or Mux steps.

## Hosted state (unchanged this cycle)

24 migrations through `20261016000204`. Deployed functions: `abandon-submission`,
`auth-signin-method`, `avatar-cleanup`, `mux-cleanup`, `mux-create-upload`, `mux-upload-status`,
`mux-webhook`, `send-push`, `web` (the `admin` function is not deployed; it waits for the domain).
12 secrets; Vault holds the two avatar entries; both clean-up switches off; one pending clean-up
job (`e48cdb45…`, harmless, closes as timed out at the next drain); Mux: 2 Beta assets, 7 spike
assets on record.

## Remaining launch blockers (beta definition)

1. **Device verification**: nothing has run on a phone since 11 Oct. The 16 Oct code (camera flip
   and stitching, failed-post UI, session rules, link routes) needs the founder iPhone build and
   the device procedures (`CAMERA-FLIP.md`, `SIMULATOR-WALK.md` not-walked list, BETA-READINESS
   19.5 step 8). Android has never run.
2. **Shared links and the admin**: need the domain and the Cloudflare Pages deployment (above),
   then the `web` redeploy and the `admin` deployment (H7) with the first moderator.
3. **Provider session**: C2w, C2a, E1 to E3 as planned; then the clean-up policy (H13).
4. **Credentials and accounts**: `STAGE-4-SETUP.md`; for an iPhone-only beta the Apple Developer
   Program, the EAS project, APNs and Sign in with Apple at least; Google if it ships.
5. **Design answers still open**: DESIGN-APPROVALS A2 to A4, B (two Post Review states), C (14
   items), D (four SPEC lines); the online master spec sync (`SPEC-SYNC.md`).
6. **Policies**: legal review of the seven drafts; the in-app destinations need a board (6.4).

## Minimum decisions needed from Nemat

1. Domain: choose and buy the links domain; approve the Cloudflare path (account, Pages project,
   `WEB_PROXY_KEY`, `web` redeploy, EAS variable), six ordered approvals in RELEASE-CHECKLIST 3.7.
2. Provider session: the one-window shape, E3b timing, the C2w-b dry run; then a date for the
   window.
3. Stage 4: which of the REQUIRED rows to start this week (Apple Developer Program and the EAS
   project unblock the most).
4. DESIGN-APPROVALS A2 to A4, B, C, D in one pass.
5. The founder iPhone build from the integrated tip (H12) and a date for the device pass.
