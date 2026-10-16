// The moderation admin (SPEC.md Section 17 "Moderator tools"; decision of 8 Oct: a small internal
// web admin is required before the first outside tester). Server-rendered HTML.
//
//   GET  /                 the sign-in page. Public, static, holds no data and no secret.
//   GET  /me               who the verified moderator is
//   GET  /v/<view>         a server-rendered fragment: reports, reviews, suggestions, accounts,
//                          report/<id>, video/<id>, comment/<id>, account/<id>
//   POST /a/<action>       one moderator action (JSON body): the existing mod_* functions
//
// Security model (docs/release/MODERATION.md):
//   - Every route but the sign-in page needs `Authorization: Bearer <access token>`. The token is
//     verified with Auth on every request (auth.getUser), and the account must then be an active
//     moderator (mod_whoami), checked on every request before anything else. No token or a bad
//     one: 401. A valid account that is not an active moderator (never one, switched off,
//     suspended or deleted): 403 with an empty answer. The two never differ in what they reveal.
//   - Authentication never uses cookies, so there is nothing for a cross-site request to ride on
//     (CSRF). Actions are POST only, JSON only (a cross-site form cannot send it), and a request
//     from another site (Sec-Fetch-Site: cross-site) is refused. No CORS headers are sent.
//   - The mod_* functions are called with the service role; the moderator's identity (username and
//     account id, from the database, never from the request) is what they record as p_moderator.
//   - Destructive actions need `confirm: true` in the body, which the page sets after the
//     moderator accepts the confirmation.
//   - Responses are never cached, never framed, and the page runs under a nonce-only CSP.
import { html, Raw, UUID } from "./html.ts";
import { shellPage } from "./shell.ts";
import {
  accountsView,
  accountView,
  commentView,
  DECLINE_REASONS,
  type J,
  notFound,
  reportsView,
  reportView,
  reviewsView,
  suggestionsView,
  videoView,
} from "./views.ts";

export type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
export type Deps = {
  /** Verifies an access token with Auth; the account it belongs to, or null. */
  verifyToken: (token: string) => Promise<{ id: string } | null>;
  /** Calls a database function as the service role. */
  rpc: (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;
  config: { anonKey: string; authBase: string; webBase: string };
  log?: (entry: Record<string, unknown>) => void;
};

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow",
  // Nothing but the sign-in page runs or loads anything; it replaces this with its own policy.
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

const MAX_BODY = 16 * 1024;
const REASON_MAX = 500;
const NOTE_MAX = 2000;

/** What the moderator reads when an action is refused. Only these codes are ever shown. */
const REFUSALS: Record<string, string> = {
  video_not_found: "That video was not found, or it is not in a state this action applies to.",
  comment_not_found: "That comment was not found, or it is already removed.",
  asset_deleted: "Its video has been permanently deleted at Mux, so it cannot be restored.",
  asset_being_deleted: "Mux is deleting its video right now, so it cannot be restored.",
  invalid_until: "The date must be in the future.",
  reason_required: "A reason is required.",
  moderator_required: "No moderator identity.",
  not_found: "No pending review request with that id.",
  invalid_outcome: "The outcome must be upheld or reversed.",
  suggestion_not_found: "That suggestion is not in review any more.",
  invalid_reason: "That reason is not on the fixed list.",
};

function nonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/[^A-Za-z0-9]/g, "");
}

function csp(n: string, cfg: Deps["config"]): string {
  const connect = ["'self'"];
  if (cfg.authBase) connect.push(cfg.authBase);
  return [
    "default-src 'none'",
    `script-src 'nonce-${n}'`,
    `style-src 'nonce-${n}'`,
    "img-src https://image.mux.com",
    "media-src https://stream.mux.com",
    `connect-src ${connect.join(" ")}`,
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function respond(body: string | null, status: number, contentType: string, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...SECURITY_HEADERS, "Content-Type": contentType, ...extra } });
}
const json = (data: unknown, status = 200) => respond(JSON.stringify(data), status, "application/json; charset=utf-8");
const fragment = (h: Raw, status = 200) => respond(h.toString(), status, "text/html; charset=utf-8");
const empty = (status: number) => respond(null, status, "text/plain; charset=utf-8");

function bearer(req: Request): string | null {
  const h = req.headers.get("Authorization") ?? "";
  const m = /^Bearer ([A-Za-z0-9._~+/=-]{20,4096})$/.exec(h);
  return m ? m[1] : null;
}

function refusal(message: string): string {
  return REFUSALS[message] ?? "That did not work.";
}

type Moderator = { id: string; username: string | null; identity: string };

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));

  async function read<T = J>(name: string, args: Record<string, unknown>): Promise<T | null | undefined> {
    const { data, error } = await deps.rpc(name, args);
    if (error) return undefined; // undefined: the read itself failed
    return (data ?? null) as T | null;
  }

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = (url.pathname.replace(/^\/functions\/v1\/admin/, "").replace(/^\/admin/, "").replace(/\/+$/, "")) || "/";

    // The sign-in page: no data, no secret (the anon key is public by design).
    if (path === "/" && (req.method === "GET" || req.method === "HEAD")) {
      const n = nonce();
      return respond(req.method === "HEAD" ? null : shellPage(deps.config, n), 200, "text/html; charset=utf-8", { "Content-Security-Policy": csp(n, deps.config) });
    }

    // 1. Who is asking. Every other route starts here, whatever the method or path.
    const token = bearer(req);
    if (!token) return json({ error: "unauthorized" }, 401);
    let user: { id: string } | null = null;
    try {
      user = await deps.verifyToken(token);
    } catch {
      return json({ error: "unauthorized" }, 401);
    }
    if (!user || !UUID.test(user.id)) return json({ error: "unauthorized" }, 401);

    // 2. Whether they may. Fails closed: if the check cannot be made, nothing is served.
    const who = await deps.rpc("mod_whoami", { p_account: user.id });
    if (who.error) return json({ error: "unavailable" }, 503);
    const w = who.data as J | null;
    if (!w || typeof w.identity !== "string") return empty(403);
    const mod: Moderator = { id: String(w.id), username: w.username ?? null, identity: w.identity };

    // 3. Routing, for a moderator only.
    if (path === "/me") {
      if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return json({ identity: mod.identity, username: mod.username });
    }

    if (path.startsWith("/v/")) {
      if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      try {
        return await view(path.slice(3), url.searchParams);
      } catch {
        // A row that is not the shape the page expects must not become a stack trace.
        return fragment(html`<h1>Could not show this</h1><p class="muted">The data was not in the expected shape.</p>`, 502);
      }
    }

    if (path.startsWith("/a/")) {
      if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return await act(req, path.slice(3), mod);
    }

    return json({ error: "not_found" }, 404);
  };

  // -------------------------------------------------------------------------
  // Views
  // -------------------------------------------------------------------------
  async function view(rest: string, params: URLSearchParams): Promise<Response> {
    const parts = rest.split("/").filter(Boolean);
    const [name, id] = parts;
    const failed = () => fragment(html`<h1>Could not load</h1><p class="muted">The database did not answer. Try again.</p>`, 502);

    if (parts.length === 1 && name === "reports") {
      const q = await read<J[]>("mod_reports_queue", { p_limit: 100 });
      return q === undefined ? failed() : fragment(reportsView(q ?? []));
    }
    if (parts.length === 1 && name === "reviews") {
      const q = await read<J[]>("mod_review_queue", { p_limit: 100 });
      return q === undefined ? failed() : fragment(reviewsView(q ?? []));
    }
    if (parts.length === 1 && name === "suggestions") {
      const q = await read<J[]>("mod_suggestions_queue", { p_limit: 100 });
      return q === undefined ? failed() : fragment(suggestionsView(q ?? []));
    }
    if (parts.length === 1 && name === "accounts") {
      const q = (params.get("q") ?? "").trim().slice(0, 80);
      if (!q) return fragment(accountsView("", null));
      const r = await read<J[]>("mod_account_lookup", { p_query: q });
      return r === undefined ? failed() : fragment(accountsView(q, r ?? []));
    }
    if (parts.length === 2 && id && UUID.test(id)) {
      if (name === "video") {
        const v = await read<J>("mod_video_detail", { p_video: id });
        return v === undefined ? failed() : fragment(videoView(v), v ? 200 : 404);
      }
      if (name === "comment") {
        const c = await read<J>("mod_comment_detail", { p_comment: id });
        return c === undefined ? failed() : fragment(commentView(c), c ? 200 : 404);
      }
      if (name === "account") {
        const [o, log] = await Promise.all([read<J>("mod_account_overview", { p_account: id }), read<J[]>("mod_account_log", { p_account: id })]);
        return o === undefined || log === undefined ? failed() : fragment(accountView(o, log ?? []), o ? 200 : 404);
      }
      if (name === "report") {
        const rep = await read<J>("mod_report_detail", { p_report: id });
        if (rep === undefined) return failed();
        if (!rep) return fragment(notFound("report"), 404);
        let target: J | null = null;
        let overview: J | null = null;
        let log: J[] | null = null;
        if (typeof rep.target_id === "string" && UUID.test(rep.target_id)) {
          if (rep.kind === "video") target = (await read<J>("mod_video_detail", { p_video: rep.target_id })) ?? null;
          else if (rep.kind === "comment") target = (await read<J>("mod_comment_detail", { p_comment: rep.target_id })) ?? null;
          else if (rep.kind === "profile") {
            overview = (await read<J>("mod_account_overview", { p_account: rep.target_id })) ?? null;
            log = (await read<J[]>("mod_account_log", { p_account: rep.target_id })) ?? null;
          }
        }
        return fragment(reportView(rep, target, overview, log));
      }
    }
    return fragment(notFound("page"), 404);
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  async function act(req: Request, action: string, mod: Moderator): Promise<Response> {
    // A request from another site is refused outright (it could not carry the token anyway).
    const site = req.headers.get("Sec-Fetch-Site");
    if (site && site !== "same-origin" && site !== "none") return json({ ok: false, error: "forbidden" }, 403);
    if (!(req.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) return json({ ok: false, error: "unsupported_media_type" }, 415);

    const text = await req.text();
    if (text.length > MAX_BODY) return json({ ok: false, error: "too_large" }, 413);
    let b: J;
    try {
      const parsed = JSON.parse(text);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      b = parsed as J;
    } catch {
      return json({ ok: false, error: "bad_request", message: "Unreadable request." }, 400);
    }

    const bad = (message: string) => json({ ok: false, error: "bad_request", message }, 400);
    const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() !== "" && v.length <= max ? v.trim() : null);
    const optNote = (): string | null | false => {
      if (b.note === undefined || b.note === null || b.note === "") return null;
      const n = str(b.note, NOTE_MAX);
      return n ?? false;
    };
    const id = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);

    const known = new Set(["remove_video", "restore_video", "remove_comment", "close_report", "restrict", "suspend", "restore_account", "decide_review", "approve_suggestion", "decline_suggestion"]);
    if (!known.has(action)) return json({ ok: false, error: "not_found" }, 404);
    // Every action here changes something and asks for the moderator's confirmation.
    if (b.confirm !== true) return bad("Confirmation is required.");

    const note = optNote();
    if (note === false) return bad("The note is too long.");

    let name = "";
    let args: Record<string, unknown> = {};
    let done = "Done.";
    let target: string | null = null;

    switch (action) {
      case "remove_video":
      case "restore_video": {
        const vid = id(b.id), reason = str(b.reason, REASON_MAX);
        if (!vid) return bad("Missing video.");
        if (!reason) return bad("A reason is required (up to 500 characters).");
        name = action === "remove_video" ? "mod_remove_video" : "mod_restore_video";
        args = { p_video: vid, p_reason: reason, p_moderator: mod.identity, p_note: note };
        done = action === "remove_video" ? "Removed. The author has been told." : "Restored.";
        target = vid;
        break;
      }
      case "remove_comment": {
        const cid = id(b.id), reason = str(b.reason, REASON_MAX);
        if (!cid) return bad("Missing comment.");
        if (!reason) return bad("A reason is required (up to 500 characters).");
        name = "mod_remove_comment";
        args = { p_comment: cid, p_reason: reason, p_moderator: mod.identity, p_note: note };
        done = "Removed. The author has been told.";
        target = cid;
        break;
      }
      case "close_report": {
        const rid = id(b.id);
        if (!rid) return bad("Missing report.");
        name = "mod_close_report";
        args = { p_report: rid, p_moderator: mod.identity };
        done = "Report closed.";
        target = rid;
        break;
      }
      case "restrict":
      case "suspend":
      case "restore_account": {
        const acct = id(b.account), reason = str(b.reason, REASON_MAX);
        if (!acct) return bad("Missing account.");
        if (!reason) return bad("A reason is required (up to 500 characters).");
        // A moderator does not act on their own account here.
        if ((action === "restrict" || action === "suspend") && acct === mod.id) return bad("You cannot do that to your own account.");
        target = acct;
        if (action === "restrict") {
          const d = typeof b.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.until) ? b.until : null;
          const when = d ? new Date(`${d}T00:00:00Z`) : null;
          if (!when || Number.isNaN(when.getTime())) return bad("Pick a date.");
          name = "mod_restrict";
          args = { p_account: acct, p_until: when.toISOString(), p_reason: reason, p_moderator: mod.identity, p_note: note };
          done = `Posting is paused until ${d}. The person has been told.`;
        } else if (action === "suspend") {
          name = "mod_suspend";
          args = { p_account: acct, p_reason: reason, p_moderator: mod.identity, p_note: note };
          done = "Suspended. The person has been told.";
        } else {
          name = "mod_restore_account";
          args = { p_account: acct, p_reason: reason, p_moderator: mod.identity, p_note: note };
          done = "Account restored.";
        }
        break;
      }
      case "decide_review": {
        const aid = id(b.action);
        if (!aid) return bad("Missing review request.");
        if (b.outcome !== "upheld" && b.outcome !== "reversed") return bad("Choose an outcome.");
        name = "mod_decide_review";
        args = { p_action: aid, p_outcome: b.outcome, p_moderator: mod.identity, p_note: note };
        done = b.outcome === "upheld" ? "Recorded: the decision stands. The person has been told." : "Recorded: the decision is reversed. The person has been told.";
        target = aid;
        break;
      }
      case "approve_suggestion": {
        const sid = id(b.id);
        if (!sid) return bad("Missing suggestion.");
        name = "mod_approve_suggestion";
        args = { p_id: sid, p_moderator: mod.identity, p_keep_attribution: b.keep_name === undefined ? true : b.keep_name === true, p_note: note };
        done = "Approved. The prompt is live and the author has been told.";
        target = sid;
        break;
      }
      case "decline_suggestion": {
        const sid = id(b.id);
        if (!sid) return bad("Missing suggestion.");
        const reason = typeof b.reason === "string" && Object.hasOwn(DECLINE_REASONS, b.reason) ? b.reason : null;
        if (!reason) return bad("Choose one of the listed reasons.");
        name = "mod_decline_suggestion";
        args = { p_id: sid, p_reason: reason, p_moderator: mod.identity, p_note: note };
        done = "Declined. The author has been told why.";
        target = sid;
        break;
      }
    }

    const { error } = await deps.rpc(name, args);
    if (error) {
      // Only a known refusal code is shown; anything else is "did not work", never database text.
      const code = /^[a-z_]+$/.test(error.message) ? error.message : "";
      log({ at: new Date().toISOString(), moderator: mod.id, action, target, ok: false, code: code || "error" });
      return json({ ok: false, error: code || "failed", message: refusal(code) }, code ? 409 : 500);
    }
    log({ at: new Date().toISOString(), moderator: mod.id, action, target, ok: true });
    return json({ ok: true, message: done });
  }
}
