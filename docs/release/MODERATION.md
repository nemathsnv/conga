# Moderation admin and the response slot

Local work only, 16 Oct 2026. Nothing here is deployed, pushed or linked. Decision of 8 Oct
(`docs/DECISIONS.md`): a small internal moderation web admin is required before the first outside
tester; `scripts/moderate.sh` stays for development. This document covers the admin, how it is
secured, how to put it on the hosted project later, how a moderator uses it, what it does not
cover, and the response-slot fix that ships with it.

## 1. What was built

| Piece | Where |
|---|---|
| The admin (Edge Function `admin`, server-rendered HTML, no framework, no dependency) | `supabase/functions/admin/` (`handler.ts` routes and security, `views.ts` pages, `shell.ts` the one static page, `html.ts` escaping, `index.ts` wiring) |
| `moderators` table, membership check, read functions | `supabase/migrations/20261016000301_admin_moderators.sql` (rollback in `supabase/rollback/`) |
| Response-slot fix | `supabase/migrations/20261016000300_response_slot_moderation.sql` (rollback in `supabase/rollback/`) |
| Adding a moderator | `scripts/moderate.sh add-moderator <account-id or username>` (also `deactivate-moderator`, `moderators`) |
| Tests | `supabase/tests/0030_response_slot.sql`, `0031_admin_moderators.sql`, `0032_removed_privacy.sql`; `supabase/functions/_tests/admin_authz_test.ts`, `admin_integration_test.ts` |

The admin is an internal tool, not a product screen: no board, no app change, no member-facing
copy. Every action is one of the existing `mod_*` functions, so the log (who, when, why) is the
one the CLI already writes. There is no second moderation backend, and `mod_warn` does not exist
(dropped 8 Oct; a warning is the removal notice, `A-Removed`), so the admin cannot warn.

## 2. How it works

```
browser ──GET /functions/v1/admin──────────────► sign-in page (static, no data)
browser ──POST <project>/auth/v1/otp, /verify──► Supabase Auth (email code, anon key)
browser ──GET  .../admin/v/reports  ───────────► token checked → moderator checked → HTML fragment
          Authorization: Bearer <access token>
browser ──POST .../admin/a/remove_video ───────► same checks → mod_remove_video(service role)
```

- **Sign-in** is the same Supabase Auth email code as the app (six digits, no password). The page
  asks Auth for the code with `create_user: false`, so the admin never creates an account, then
  verifies it. The anon key is on the page; it is public by design (it ships in the app). The
  custom access token hook and `pre_request` apply exactly as for the app: an account that uses
  Apple or Google gets no token from an email code, so **a moderator needs an account that signs
  in with email**.
- **The token** is kept in `sessionStorage` (this tab only, gone when it closes) and sent as an
  `Authorization` header on every request. It is refreshed through Auth when it expires.
- **Views** (`/v/...`) are rendered on the server and escaped; the page puts them in place.
  **Actions** (`/a/...`) are JSON POSTs from the page's forms.
- Queues show 100 items at a time, oldest first.

### Routes (all but the first need a moderator)

| Route | What |
|---|---|
| `GET /` | The sign-in page. Public, static, no data, no secret. |
| `GET /me` | Who the verified moderator is. |
| `GET /v/reports`, `/v/report/<id>` | Open reports; one report with its reporter, the other reports on the same target, the content and the actions. |
| `GET /v/reviews` | Review requests (appeals) with the decision under review. |
| `GET /v/suggestions` | Prompt suggestions in review. |
| `GET /v/accounts?q=`, `/v/account/<id>` | Account lookup; an account with its responses, video replies, comments and its moderation log. |
| `GET /v/video/<id>`, `/v/comment/<id>` | Content inspection. |
| `POST /a/<action>` | `remove_video`, `restore_video`, `remove_comment`, `close_report`, `restrict`, `suspend`, `restore_account`, `decide_review`, `approve_suggestion`, `decline_suggestion`. Nothing else. |

## 3. Security model

1. **Authentication on every request.** Everything except the sign-in page needs a bearer token,
   verified with Auth on that request (`auth.getUser`; the token is never trusted by decoding it).
   No token, a malformed header, a forged or expired token: **401**.
2. **Authorization on every request.** The verified account id goes to `mod_whoami`, which answers
   only for an **active** moderator whose own account is not suspended and not deleted. Nothing is
   cached: switching a moderator off (`deactivate-moderator`), suspending or deleting their account
   takes effect on their next request. Not a moderator for any reason: **403 with an empty body**
   (a member learns nothing, not even whether the route exists). If the check itself fails,
   **503**: the admin fails closed.
3. **The mod_* layer stays closed.** They remain executable by the service role only
   (`pgTAP 0031`: no `mod_*` function is executable by `anon` or `authenticated`). The
   `moderators` table has RLS on, no policy and no privileges for `anon` or `authenticated`; only
   the service role writes it (`scripts/moderate.sh add-moderator`, or SQL). The service-role key
   exists only in the function's environment; it is never on a page.
4. **Identity in the log.** The `p_moderator` the `mod_*` functions record is
   `@username (account id)`, taken from the database for the verified token, never from the
   request body (test: a body that names another moderator is ignored).
5. **CSRF.** Authentication is never a cookie, so there is nothing for another site to ride on:
   the function ignores cookies entirely and sets none. Actions are POST only and JSON only (a
   cross-site form or `text/plain` request is refused with 415), a request the browser marks
   `Sec-Fetch-Site: cross-site` is refused, and no CORS header is ever sent, so another site can
   neither preflight nor read an answer.
6. **Confirmation.** Every action needs `confirm: true`, which the page sets only after the
   moderator accepts the confirmation dialog; a request without it is refused before the database.
7. **Escaping.** Every value from the database goes through `html\`\``, which escapes it; there is
   no other way to put text in a page (`html.ts`). Ids in URLs are validated UUIDs; a Mux playback
   id is used only if it is plain letters and digits. Tests inject script and attribute payloads
   into every view.
8. **Browser hardening.** Nonce-only CSP (no `unsafe-inline`, no `unsafe-eval`, no inline handlers,
   no `javascript:` links; images only from `image.mux.com`, media only from `stream.mux.com`,
   connections only to the page's own origin), no framing, no referrer, `nosniff`, `no-store`
   everywhere, `noindex`.
9. **Errors.** A refusal from the database is shown as a plain sentence for a small list of known
   codes; anything else is "That did not work." Database text is never shown.
10. **No self-service.** A moderator cannot suspend or restrict their own account from the admin.
    The admin cannot add, remove or list moderators; that is `scripts/moderate.sh` (service
    role / SQL editor).
11. **Not a secret.** Nothing in the page is secret: the anon key and the project URL are public.
    No provider key, no service-role key and no Mux credential is read by the page or the views
    (the function reads only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
    which the Edge runtime already provides).

## 4. How a moderator works

Sign in with the email of your Shortcut account; a six-digit code arrives; the nav is Reports,
Review requests, Prompt suggestions, Accounts.

- **Reports** (`mod_reports_queue`): oldest first, with what was reported, the reason as the app
  words it, the author and how many reports the target has. Open one: you see the reporter (never
  shown to the person reported), the other reports on it, and the content. For a video: its
  state, author, prompt, caption, reports, and, **while it is live**, a thumbnail, an inline
  player (Safari plays HLS natively), the stream address `https://stream.mux.com/<id>.m3u8` and a
  link to the web player. **A removed video has no public playback**: the page says so and shows
  its metadata and the removal only. Actions: remove (reason shown to the person in `A-Removed`,
  plus an internal note), restore, close the report without action. Removing closes the open
  reports on the target, as before.
- **Review requests** (`mod_review_queue`): the decision under review, who made it, the reason
  and note, a link to the content or account. Decide **The decision stands** (upheld) or
  **Reverse the decision** (reversed, which restores the content or lifts the restriction). The
  person is told with the decided texts (docs/DECISIONS.md, 8 Oct). If a removed video's asset is
  permanently deleted, the queue says so and a reversal is refused.
- **Prompt suggestions** (`mod_suggestions_queue`): approve (with or without the author's name;
  the box is shown only if the author wanted their name shown) or decline with one of the six
  fixed reasons (SPEC.md Section 12). Moderators do not reword a suggestion.
- **Accounts**: search by username (the beginning is enough) or paste an account id. The account
  page lists its recent responses, video replies and comments (to inspect and remove), and its
  moderation log. Actions: restrict until a date (posting is paused from 00:00 UTC on that date;
  the person is told), suspend, lift a restriction or suspension. Never an email address.
- Everything destructive asks for confirmation. The reason is shown to the person; the note is
  internal.

A sample of the rendered HTML (a removed response, as a moderator sees it) is in section 9.

## 5. The response slot

SPEC.md Section 6: one primary response per person per prompt; to change it the person deletes it
and records again. Before this fix a response removed by a moderator stopped counting, so its
author could respond to the prompt again. Decision (Nemat, 16 Oct): **a moderator's removal does
not reopen the slot.**

| What happens to the primary response | Slot |
|---|---|
| Processing or live | taken |
| Removed by a moderator | **taken** (new) |
| Restored (a moderator's restore, or a review that reverses the removal) | taken: it is their primary response again |
| Deleted by its author, or abandoned | free (as before) |
| A first-response draft | not on a prompt yet; checked when it is published |

How: `responses_one_per_prompt` is a unique index; it now also covers `removed` (so every path,
including any future one, is stopped by the database, and `post_response` answers the unique
violation as `already_responded`). `post_response` and `publish_draft` check explicitly too and
refuse with `already_responded` before claiming an upload. Nothing is rewritten: the removed row,
its removal action, the reason, note and the log stay as they were. Video replies are not limited.
Purge and tombstones do not interact (a purged account's slot goes with the account; a tombstone
is `deleted`).

Consequences to know:

- The author cannot delete a response a moderator removed (it is not on their profile and
  `delete_video` finds no live response), so they cannot free the slot themselves. The slot comes
  back only if a moderator restores it, which also restores the response. If Nemat wants a way to
  release a slot while keeping the removal, that is a new rule.
- A removed video whose asset has been permanently deleted (30 days after the case closes) cannot
  be restored, so its slot is held for good. This follows from the decision.
- The app reads no "already responded" state: **Respond** and **Add your response** are shown for
  any prompt, and the server refuses at Post (`already_responded`), as it already did for a live
  response. No app file was changed. Refusals that Retry cannot fix, `already_responded`
  included, are designed in the failed-post proposals as **P2**, "This recording can't be
  posted." with Discard (`design/proposals/FAILED-POST-UX.md`), which still awaits final approval
  and is not built. Until it is, a member in this state records, taps Post and sees nothing
  (`docs/BETA-READINESS.md` section 1, "Post refused while creating the row"). Hiding Respond for
  a held slot would need a server field and a board; none exists.

**Before applying the migration on a project with real data**, run this; it must return no rows
(the migration stops with the list if it does not, and changes nothing):

```sql
select author_id, prompt_id, array_agg(id) from public.responses
 where kind = 'response' and status in ('processing', 'live', 'removed')
 group by 1, 2 having count(*) > 1;
```

A row means a member responded again after a removal; decide by hand which response stands.

`post_response` is redefined in `20261016000300` (the 20261013000200 body with `'removed'` added to
its slot check). Any later migration that redefines it must keep that check, or lean on the index,
which still refuses (with the clean `already_responded` answer from the unique-violation handler).

## 6. Deploying (later, on Nemat's go-ahead)

Nothing in this section has been run. Order:

1. **Migrations**, in order, with the rest of the pending ones (`supabase db push --dry-run`
   first): `20261016000300_response_slot_moderation.sql` (run the check above first), then
   `20261016000301_admin_moderators.sql`.
2. **Function**: `supabase functions deploy admin --no-verify-jwt`. `verify_jwt` is **off** (set in
   `supabase/config.toml`) because the function checks the token and moderator membership itself,
   on every request; the sign-in page must be reachable without a token. With `verify_jwt` on, the
   gateway would refuse the sign-in page and every request would still need the same checks.
3. **First moderator** on the hosted project, once the person has an email-code account:

   ```bash
   LINKED=1 MODERATOR="Nemat" scripts/moderate.sh add-moderator <their username or account id>
   LINKED=1 scripts/moderate.sh moderators        # confirm
   ```

   Turn access off with `deactivate-moderator`. Or in the SQL editor (service role):
   `select public.mod_add_moderator('<account id>', 'Nemat');`
4. **Environment** (all optional): `ADMIN_AUTH_BASE` (where Auth lives for the browser, only if the
   admin is served from a different origin than the project), `ADMIN_WEB_PLAYER_BASE` (where the
   web player lives, only if it is not next to the function).
5. **Open** `https://<ref>.supabase.co/functions/v1/admin`.

**Check this before relying on it.** As far as I know, Supabase serves HTML from an Edge Function
on the default `*.supabase.co` domain as plain text (with a sandbox policy) unless a custom domain
is used. Not verifiable locally (the local runtime serves HTML normally) and not tested on the
hosted project. The existing `web` function (shared links) would have the same limit. If it
applies, the admin needs a custom domain in front of the functions (then set `ADMIN_AUTH_BASE` to
the project URL), or the page served from somewhere else; the function's views and actions are
unchanged.

Rollback: `supabase/rollback/20261016000301_admin_moderators.down.sql` and
`20261016000300_response_slot_moderation.down.sql` (copy to a forward migration). Undeploy the
function first: without its database side it answers 403 to everyone.

## 7. What was verified, and what was not

Run on an isolated local stack (never the founder's, never hosted); exact commands are in the
hand-off report of this work.

| Check | Result |
|---|---|
| All migrations from scratch on a clean local database, both new ones included | applied |
| `supabase test db`: the 13 existing files plus 0030, 0031, 0032 | 16 files, 1403 tests, all pass |
| 0030 against the old behaviour (rollback applied) | fails where the bug was: a second response after a removal, restore refused with a raw unique violation, upload claimed by the refused post |
| Slot migration's guard: a member with a removed and a processing response on one prompt | migration stops with the list and changes nothing (rolled back transaction) |
| Both rollbacks, then both forward migrations again | clean |
| Deno `admin_authz_test.ts` (mocked Auth and database) | 18 tests pass |
| Deno `admin_integration_test.ts` (real Auth sessions, real `mod_*` functions, handler in-process) | 7 tests pass |
| Deno `admin_http_test.ts` (the function served by the local Edge runtime, through the gateway) | 4 tests pass |
| The page in a real browser (the app's built-in browser pane) against the local function: email code sign-in, report queue, open a report, remove with confirmation, queue and account views, sign out clears the session | worked |
| `scripts/moderate.sh add-moderator`, `deactivate-moderator`, `moderators` (by id and username; hostile input refused) | worked on the local stack |

Not covered or not run:

- **The hosted project, a real device, a real email provider and real Mux.** Nothing was deployed
  or pushed. The confirmation dialogs were stubbed in the browser run (the pane cannot drive
  native dialogs), so what was exercised is that the form posts after the confirmation returns
  true and that the confirmation text is the one the form carries.
- **Safari and other browsers** (the inline HLS player in particular); the thumbnails and the
  player were shown against fake playback ids, so they showed as empty boxes.
- No scheduled alerts: nothing tells a moderator that a report is waiting. Check the queues.
- No pagination beyond the oldest 100 per queue; no search of content; no filtering.
- No add/remove of moderators or listing them in the admin (CLI only, by design).
- The admin never calls Mux. Removing and restoring queue the Mux clean-up as before
  (`mux-cleanup`), which stays off until Nemat switches it on (`supabase/README.md`).
- Block management, deleting an account on someone's behalf and any change of a person's
  profile are not available; they are not part of the moderator tools in SPEC.md Section 17.
- No rate limit on the admin; access is limited to named moderators.
- The local gateway adds `Access-Control-Allow-Origin: *` to function responses. It does not
  matter here (nothing is authenticated by the browser's own credentials, so another site cannot
  make a request that carries a token), and the function sets no CORS header itself.
- Noticed in passing, not changed: `report_item` accepts a report on any existing video, comment or
  profile id, including content the reporter cannot see (the privacy audit's to judge); and
  `like_video` and `follow_user` have no suspension check of their own, relying on the API gate
  (`pre_request`), which every request from the app and the Edge Functions passes.

## 8. Remaining rollout requirements

1. Nemat's go-ahead to apply the two migrations and deploy `admin`; check the HTML-on-Supabase
   point in section 6 on the hosted project and decide on a custom domain if needed.
2. Make the first moderator an email-code account (see section 3).
3. Walk the admin once on the hosted project with a test report before the first outside tester
   (and in Safari, for the inline player).
4. Decide whether the app should say something to a member whose recording was refused with
   `already_responded` (P2 awaits approval; section 5).
5. The CLI remains available for emergencies; the admin does not replace the SQL editor for
   anything outside the moderator tools.

## 9. Sample of the rendered HTML

A removed response, as `GET /v/video/<id>` returns it (a fragment the page puts in place; styling
is in the page):

```html
<p><a href="#" data-back>&larr; Back</a></p><section class="card"><h2>Response <span class="tag bad">Removed by moderation</span></h2>
<dl>
<dt>Id</dt><dd><code>d5555555-5555-4555-8555-555555555555</code></dd>
<dt>Author</dt><dd><a href="#/account/c3333333-3333-4333-8333-333333333333">@maya</a> <span class="muted">Maya Lindqvist</span> </dd>
<dt>Prompt</dt><dd>What would you tell a new arrival?</dd>
<dt>Caption</dt><dd>Best villas in Canggu, DM me</dd>
<dt>Length</dt><dd>12.0 s</dd>
<dt>Reports</dt><dd>0 open, 2 in all</dd>
</dl>
<p class="notice">No public playback. It was removed, so its public playback is off. Nobody can watch it; the details below are all that is shown.</p>
<div class="block"><b>Removal</b> by @nemat (a1111111-1111-4111-8111-111111111111) on 2026-10-16 10:00 UTC<br>
Reason shown to the person: Promotion that is not allowed.<br>Internal note: Two reports in an hour</div>
<p class="notice">This removed response still occupies its author's response slot for the prompt: they cannot respond to it again. A restore gives them this response back.</p>
<p class="muted">Can be restored (its video is still kept).</p>
<details><summary>Restore this response</summary>
<form class="act" data-action="restore_video" data-confirm="Restore this response? It becomes watchable again.">
<input type="hidden" name="id" value="d5555555-5555-4555-8555-555555555555">
<label>Reason (kept in the log)<textarea name="reason" required maxlength="500" rows="2"></textarea></label>
<label>Internal note (optional, never shown to the person)<textarea name="note" maxlength="2000" rows="2"></textarea></label>
<button type="submit" class="">Restore</button>
</form></details></section>
```

The report queue, for one open report:

```html
<h1>Open reports <span class="muted">(1, oldest first)</span></h1>
<table><tr><th>Reported</th><th>What</th><th>Reason</th><th>Author</th><th>Reports on it</th><th></th></tr>
<tr><td>2026-10-16 09:30 UTC</td><td>Video<div class="muted">Best villas in Canggu, DM me</div></td>
<td>Spam or scam</td><td><a href="#/account/c333…">@maya</a> <span class="muted">Maya Lindqvist</span></td><td>2</td>
<td><a href="#/report/9100…">Open</a></td></tr></table>
```
