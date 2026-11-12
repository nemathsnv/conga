// Server-rendered fragments for the moderation admin. Plain and functional: a table or a list per
// queue, the content as a moderator needs to see it, and one form per action. All text comes from
// the database through html`` (escaped); the only values built into attributes or URLs are UUIDs
// validated by the caller and Mux playback ids matched against a strict pattern.
import { html, type Raw, trusted, UUID } from "./html.ts";

// deno-lint-ignore no-explicit-any
export type J = Record<string, any>;

export const REPORT_REASONS: Record<string, string> = {
  harassment: "Harassment or bullying",
  hate: "Hate speech or symbols",
  nudity: "Nudity or sexual content",
  violence: "Violence or threats",
  self_harm: "Self-harm or suicide",
  private_info: "Shares private information",
  spam: "Spam or scam",
  under_18: "May be under 18",
  other: "Something else",
};

// SPEC.md Section 12: the fixed decline reasons.
export const DECLINE_REASONS: Record<string, string> = {
  singles_out: "Singles out a person or group",
  too_similar: "Too similar to a live prompt",
  promotion: "Promotion",
  private_details: "Asks for private details",
  unclear: "Unclear",
  other: "Other",
};

const VIDEO_STATUS: Record<string, string> = {
  processing: "Processing",
  live: "Live",
  removed: "Removed by moderation",
  deleted: "Deleted by its author",
  draft: "Draft (private to its author)",
};

const PLAYBACK_ID = /^[A-Za-z0-9]{6,80}$/;

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function kindName(kind: string): string {
  return kind === "reply" ? "video reply" : "response";
}

function seconds(ms: unknown): string {
  return typeof ms === "number" ? `${(ms / 1000).toFixed(1)} s` : "";
}

function link(hash: string, text: unknown): Raw {
  return html`<a href="#/${hash}">${text}</a>`;
}

function person(a: J | null | undefined): Raw {
  if (!a || !a.id) return html`<span class="muted">unknown</span>`;
  const label = a.username ? `@${a.username}` : String(a.id).slice(0, 8);
  return html`<a href="#/account/${a.id}">${label}</a>${a.name ? html` <span class="muted">${a.name}</span>` : ""}`;
}

function statusTag(a: J | null | undefined): Raw {
  if (!a) return html``;
  const parts: Raw[] = [];
  if (a.moderation_status === "suspended") parts.push(html`<span class="tag bad">Suspended</span>`);
  else if (a.moderation_status === "restricted") parts.push(html`<span class="tag warn">Restricted until ${when(a.restricted_until)}</span>`);
  if (a.deleted_at) parts.push(html`<span class="tag">Account deleted ${when(a.deleted_at)}</span>`);
  return html`${parts}`;
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
function actionForm(action: string, hidden: Record<string, string>, fields: Raw, button: string, o: { confirm?: string; danger?: boolean } = {}): Raw {
  return html`<form class="act" data-action="${action}"${o.confirm ? html` data-confirm="${o.confirm}"` : ""}>
${Object.entries(hidden).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
${fields}
<button type="submit" class="${o.danger ? "danger" : ""}">${button}</button>
</form>`;
}

const reasonField = (label: string) =>
  html`<label>${label}<textarea name="reason" required maxlength="500" rows="2"></textarea></label>`;
const noteField = html`<label>Internal note (optional, never shown to the person)<textarea name="note" maxlength="2000" rows="2"></textarea></label>`;

function removeVideoForm(v: J): Raw {
  return html`<details><summary class="danger-link">Remove this ${kindName(v.kind)}</summary>
${actionForm("remove_video", { id: v.id }, html`${reasonField("Reason (shown to the person in the removal notice)")}${noteField}`, "Remove", {
    danger: true,
    confirm: `Remove this ${kindName(v.kind)}? Nobody can watch it any more, and its author is told.`,
  })}</details>`;
}

function restoreVideoForm(v: J): Raw {
  return html`<details><summary>Restore this ${kindName(v.kind)}</summary>
${actionForm("restore_video", { id: v.id }, html`${reasonField("Reason (kept in the log)")}${noteField}`, "Restore", {
    confirm: `Restore this ${kindName(v.kind)}? It becomes watchable again.`,
  })}</details>`;
}

function removeCommentForm(c: J): Raw {
  return html`<details><summary class="danger-link">Remove this comment</summary>
${actionForm("remove_comment", { id: c.id }, html`${reasonField("Reason (shown to the person in the removal notice)")}${noteField}`, "Remove", {
    danger: true,
    confirm: "Remove this comment? Nobody can read it any more, and its author is told.",
  })}</details>`;
}

function accountActions(a: J): Raw {
  const s = a.moderation_status;
  const id = String(a.id);
  const forms: Raw[] = [];
  if (s !== "suspended") {
    forms.push(html`<details><summary>Restrict posting until a date</summary>
${actionForm("restrict", { account: id }, html`<label>Posting is paused until (00:00 UTC on this date)<input type="date" name="until" required></label>
${reasonField("Reason (shown to the person)")}${noteField}`, "Restrict", {
      danger: true,
      confirm: "Restrict this account? They cannot respond, reply, comment or suggest prompts until that date, and they are told.",
    })}</details>`);
    forms.push(html`<details><summary class="danger-link">Suspend this account</summary>
${actionForm("suspend", { account: id }, html`${reasonField("Reason (shown to the person)")}${noteField}`, "Suspend", {
      danger: true,
      confirm: "Suspend this account? They cannot use the app at all, and they are told.",
    })}</details>`);
  }
  if (s !== "active") {
    forms.push(html`<details><summary>Lift the ${s === "suspended" ? "suspension" : "restriction"}</summary>
${actionForm("restore_account", { account: id }, html`${reasonField("Reason (kept in the log)")}${noteField}`, "Restore the account", {
      confirm: "Restore this account to normal?",
    })}</details>`);
  }
  return html`<div class="actions">${forms}</div>`;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
function playbackBlock(v: J): Raw {
  const pb = typeof v.playback_id === "string" && PLAYBACK_ID.test(v.playback_id) ? v.playback_id : null;
  if (v.playback_public && pb) {
    return html`<div class="media">
<img class="thumb" src="https://image.mux.com/${pb}/thumbnail.jpg?time=1&amp;width=270&amp;height=480&amp;fit_mode=crop" alt="Thumbnail">
<video controls preload="none" playsinline src="https://stream.mux.com/${pb}.m3u8" class="player"></video>
<p class="muted">Public playback. The inline player works in Safari; elsewhere open the stream:
<a href="https://stream.mux.com/${pb}.m3u8" rel="noreferrer noopener" target="_blank">https://stream.mux.com/${pb}.m3u8</a> or the
<a data-web="/r/${v.id}" href="#" rel="noreferrer noopener" target="_blank">web player</a>.</p></div>`;
  }
  const why: Record<string, string> = {
    removed: "It was removed, so its public playback is off. Nobody can watch it; the details below are all that is shown.",
    deleted: "Its author deleted it, so it has no playback.",
    draft: "It is a private draft: it has no public playback.",
    processing: "It is still processing: it has no public playback yet.",
    live: "It is live but has no public playback id right now (being restored or still setting up).",
  };
  return html`<p class="notice">No public playback. ${why[v.status] ?? ""}</p>`;
}

function removalBlock(r: J | null | undefined): Raw {
  if (!r) return html``;
  const rv = r.review ? html`<br>Review requested ${when(r.review.requested_at)}: ${r.review.outcome ? (r.review.outcome === "upheld" ? "the decision stands" : "reversed") : "pending"}` : "";
  return html`<div class="block"><b>Removal</b> by ${r.moderator ?? "(anonymised)"} on ${when(r.created_at)}<br>
Reason shown to the person: ${r.reason ?? "(none)"}<br>Internal note: ${r.note ?? "(none)"}${rv}</div>`;
}

export function videoBlock(v: J): Raw {
  const slot = v.status === "removed" && v.kind === "response"
    ? html`<p class="notice">This removed response still occupies its author's response slot for the prompt: they cannot respond to it again. A restore gives them this response back.</p>`
    : "";
  const restore = v.status === "removed"
    ? (v.restorable ? html`<p class="muted">Can be restored (its video is still kept).</p>` : html`<p class="notice">Cannot be restored: its video has been permanently deleted at Mux.</p>`)
    : "";
  const actions = v.status === "processing" || v.status === "live"
    ? removeVideoForm(v)
    : v.status === "removed" && v.restorable ? restoreVideoForm(v) : "";
  return html`<section class="card"><h2>${kindName(v.kind) === "response" ? "Response" : "Video reply"} <span class="tag ${v.status === "removed" ? "bad" : ""}">${VIDEO_STATUS[v.status] ?? v.status}</span></h2>
<dl>
<dt>Id</dt><dd><code>${v.id}</code></dd>
<dt>Author</dt><dd>${person(v.author)} ${statusTag(v.author)}</dd>
<dt>Prompt</dt><dd>${v.prompt?.text ?? ""}</dd>
<dt>Caption</dt><dd>${v.caption ?? html`<span class="muted">none</span>`}</dd>
<dt>Length</dt><dd>${seconds(v.duration_ms)}</dd>
<dt>Created</dt><dd>${when(v.created_at)}${v.live_at ? html`, live ${when(v.live_at)}` : ""}</dd>
<dt>Likes</dt><dd>${v.like_count ?? 0}</dd>
<dt>Reports</dt><dd>${v.open_reports ?? 0} open, ${v.all_reports ?? 0} in all</dd>
${v.reply_to_id ? html`<dt>Replies to</dt><dd>${link(`video/${v.reply_to_id}`, "the video it replies to")}</dd>` : ""}
</dl>
${playbackBlock(v)}${removalBlock(v.removal)}${slot}${restore}${actions}</section>`;
}

export function commentBlock(c: J): Raw {
  const removed = Boolean(c.deleted_at);
  const state = c.removed_by_moderation ? "Removed by moderation" : removed ? "Deleted" : "Visible";
  return html`<section class="card"><h2>Comment <span class="tag ${c.removed_by_moderation ? "bad" : ""}">${state}</span></h2>
<dl>
<dt>Id</dt><dd><code>${c.id}</code></dd>
<dt>Author</dt><dd>${person(c.author)} ${statusTag(c.author)}</dd>
<dt>Text</dt><dd class="quote">${c.body ?? html`<span class="muted">(no text kept)</span>`}</dd>
<dt>On</dt><dd>${c.response ? html`${link(`video/${c.response.id}`, `the ${kindName(c.response.kind)}`)} ${c.response.prompt ? html`<span class="muted">${c.response.prompt}</span>` : ""}` : ""}</dd>
<dt>Written</dt><dd>${when(c.created_at)}${removed ? html`, removed ${when(c.deleted_at)}` : ""}</dd>
<dt>Reports</dt><dd>${c.open_reports ?? 0} open, ${c.all_reports ?? 0} in all</dd>
</dl>
${removalBlock(c.removal)}${removed ? "" : removeCommentForm(c)}</section>`;
}

function accountBlock(o: J, log: J[] | null): Raw {
  const a = o.account;
  return html`<section class="card"><h2>${a.username ? `@${a.username}` : "Account"} ${statusTag(a)} ${o.is_moderator ? html`<span class="tag">Moderator</span>` : ""}</h2>
<dl>
<dt>Name</dt><dd>${a.name ?? html`<span class="muted">no profile</span>`}</dd>
<dt>Account id</dt><dd><code>${a.id}</code></dd>
<dt>Joined</dt><dd>${when(a.joined_at)}</dd>
<dt>Open reports about the account</dt><dd>${o.open_reports_about_account ?? 0}</dd>
</dl>
${accountActions(a)}</section>
<section class="card"><h2>Responses and video replies</h2>${
    (o.videos ?? []).length
      ? html`<table><tr><th>When</th><th>Kind</th><th>State</th><th>Caption</th><th></th></tr>${
        (o.videos as J[]).map((v) => html`<tr><td>${when(v.created_at)}</td><td>${kindName(v.kind)}</td><td>${VIDEO_STATUS[v.status] ?? v.status}</td><td>${v.caption ?? ""}<div class="muted">${v.prompt ?? ""}</div></td><td>${link(`video/${v.id}`, "Inspect")}</td></tr>`)
      }</table>`
      : html`<p class="muted">None.</p>`
  }</section>
<section class="card"><h2>Comments</h2>${
    (o.comments ?? []).length
      ? html`<table><tr><th>When</th><th>Text</th><th></th></tr>${
        (o.comments as J[]).map((c) => html`<tr><td>${when(c.created_at)}</td><td>${c.body ?? ""}${c.deleted_at ? html` <span class="tag">removed or deleted</span>` : ""}</td><td>${link(`comment/${c.id}`, "Inspect")}</td></tr>`)
      }</table>`
      : html`<p class="muted">None.</p>`
  }</section>${log ? logBlock(log) : ""}`;
}

function logBlock(log: J[]): Raw {
  return html`<section class="card"><h2>Moderation log</h2>${
    log.length
      ? html`<table><tr><th>When</th><th>Action</th><th>On</th><th>Reason</th><th>Note</th><th>By</th><th>Review</th></tr>${
        log.map((m) => html`<tr><td>${when(m.created_at)}</td><td>${m.kind}${m.restrict_until ? html`<div class="muted">until ${when(m.restrict_until)}</div>` : ""}</td>
<td>${m.target_kind === "video" ? link(`video/${m.target_id}`, "video") : m.target_kind === "comment" ? link(`comment/${m.target_id}`, "comment") : (m.target_kind ?? "")}</td>
<td>${m.reason ?? ""}</td><td>${m.note ?? ""}</td><td>${m.moderator ?? ""}</td>
<td>${m.review ? (m.review.outcome ?? "pending") : ""}</td></tr>`)
      }</table>`
      : html`<p class="muted">No moderation actions on this account.</p>`
  }</section>`;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
export function reportsView(queue: J[]): Raw {
  if (!queue.length) return html`<h1>Open reports</h1><p class="muted">No open reports.</p>`;
  return html`<h1>Open reports <span class="muted">(${queue.length}, oldest first)</span></h1>
<table><tr><th>Reported</th><th>What</th><th>Reason</th><th>Author</th><th>Reports on it</th><th></th></tr>${
    queue.map((r) => {
      const snippet = r.kind === "comment" ? (r.comment?.body ?? "") : r.kind === "video" ? (r.video?.caption ?? "") : "";
      const what = r.kind === "video" ? "Video" : r.kind === "comment" ? "Comment" : "Profile";
      return html`<tr><td>${when(r.created_at)}</td><td>${what}${snippet ? html`<div class="muted">${String(snippet).slice(0, 120)}</div>` : ""}</td>
<td>${REPORT_REASONS[r.reason] ?? r.reason}</td><td>${person(r.author)}</td><td>${r.reports_on_target}</td><td>${link(`report/${r.id}`, "Open")}</td></tr>`;
    })
  }</table>`;
}

export function reportView(rep: J, target: J | null, targetOverview: J | null, log: J[] | null): Raw {
  const body = rep.kind === "video" && target
    ? videoBlock(target)
    : rep.kind === "comment" && target
    ? commentBlock(target)
    : rep.kind === "profile" && targetOverview
    ? accountBlock(targetOverview, log)
    : html`<section class="card"><p class="muted">The reported content is no longer available.</p></section>`;
  const close = rep.status === "open"
    ? html`<details><summary>Close this report without removing anything</summary>${actionForm("close_report", { id: rep.id }, html``, "Close the report", { confirm: "Close this report? Nothing is removed." })}</details>`
    : html`<p class="muted">Closed ${when(rep.closed_at)} by ${rep.closed_by ?? "(unknown)"}.</p>`;
  return html`<p><a href="#/reports">&larr; Open reports</a></p>
<h1>Report: ${REPORT_REASONS[rep.reason] ?? rep.reason} <span class="tag ${rep.status === "open" ? "warn" : ""}">${rep.status}</span></h1>
<section class="card"><dl>
<dt>Reported</dt><dd>${when(rep.created_at)}</dd>
<dt>Reporter</dt><dd>${rep.reporter ? person(rep.reporter) : html`<span class="muted">not kept</span>`} <span class="muted">(never shown to the person reported)</span></dd>
<dt>Other reports on it</dt><dd>${
    (rep.others ?? []).length
      ? (rep.others as J[]).map((o) => html`<div>${REPORT_REASONS[o.reason] ?? o.reason}, ${when(o.created_at)} (${o.status})</div>`)
      : html`<span class="muted">none</span>`
  }</dd></dl>${close}</section>
${body}`;
}

export function videoView(v: J | null): Raw {
  return v ? html`<p><a href="#" data-back>&larr; Back</a></p>${videoBlock(v)}` : notFound("video");
}

export function commentView(c: J | null): Raw {
  return c ? html`<p><a href="#" data-back>&larr; Back</a></p>${commentBlock(c)}` : notFound("comment");
}

export function accountView(o: J | null, log: J[] | null): Raw {
  return o ? html`<p><a href="#/accounts">&larr; Accounts</a></p>${accountBlock(o, log)}` : notFound("account");
}

export function notFound(what: string): Raw {
  return html`<h1>Not found</h1><p class="muted">There is no ${what} with that id.</p>`;
}

export function accountsView(q: string, results: J[] | null): Raw {
  const form = html`<form class="search" data-search><label>Username or account id<input name="q" value="${q}" maxlength="80" autocomplete="off"></label> <button type="submit">Find</button></form>`;
  if (results === null) return html`<h1>Accounts</h1>${form}<p class="muted">Search by username (the beginning is enough) or paste an account id.</p>`;
  return html`<h1>Accounts</h1>${form}${
    results.length
      ? html`<table><tr><th>Account</th><th>Name</th><th>State</th><th>Joined</th></tr>${
        results.map((a) => html`<tr><td>${person(a)}</td><td>${a.name ?? ""}</td><td>${statusTag(a)}${a.moderation_status === "active" && !a.deleted_at ? "active" : ""}</td><td>${when(a.joined_at)}</td></tr>`)
      }</table>`
      : html`<p class="muted">No account found.</p>`
  }`;
}

export function reviewsView(queue: J[]): Raw {
  if (!queue.length) return html`<h1>Review requests</h1><p class="muted">No pending review requests.</p>`;
  return html`<h1>Review requests <span class="muted">(${queue.length}, oldest first)</span></h1>${
    queue.map((r) => {
      const a = r.action ?? {};
      const target = a.target_kind === "video"
        ? link(`video/${a.target_id}`, "Inspect the video")
        : a.target_kind === "comment"
        ? link(`comment/${a.target_id}`, "Inspect the comment")
        : link(`account/${r.account?.id}`, "Inspect the account");
      const what = a.kind === "remove" ? `Removal of a ${a.target_kind}` : a.kind === "restrict" ? "Restriction" : a.kind === "suspend" ? "Suspension" : a.kind;
      const warn = a.kind === "remove" && a.target_kind === "video" && r.video_restorable === false
        ? html`<p class="notice">Its video has been permanently deleted: reversing this decision will be refused.</p>`
        : "";
      return html`<section class="card"><h2>${what} <span class="muted">review requested ${when(r.requested_at)}</span></h2>
<dl>
<dt>Person</dt><dd>${person(r.account)}</dd>
<dt>Decision</dt><dd>${when(a.created_at)} by ${a.moderator ?? "(anonymised)"}${a.restrict_until ? html`, until ${when(a.restrict_until)}` : ""}</dd>
<dt>Reason shown</dt><dd>${a.reason ?? ""}</dd>
<dt>Internal note</dt><dd>${a.note ?? html`<span class="muted">none</span>`}</dd>
<dt>Look at</dt><dd>${target}</dd>
</dl>${warn}
${actionForm("decide_review", { action: r.action_id }, html`<label>Outcome<select name="outcome" required>
<option value="upheld">The decision stands</option><option value="reversed">Reverse the decision</option></select></label>
<label>Note (optional, internal)<textarea name="note" maxlength="2000" rows="2"></textarea></label>`, "Decide", {
        confirm: "Record this decision? The person is notified of the outcome.",
      })}</section>`;
    })
  }`;
}

export function suggestionsView(queue: J[]): Raw {
  if (!queue.length) return html`<h1>Prompt suggestions</h1><p class="muted">No suggestions in review.</p>`;
  return html`<h1>Prompt suggestions in review <span class="muted">(${queue.length}, oldest first)</span></h1>${
    queue.map((sg) =>
      html`<section class="card"><h2 class="quote">${sg.text}</h2>
<dl>
<dt>Scope</dt><dd>${sg.place ?? "Global"}</dd>
<dt>Author</dt><dd>${person(sg.author)} <span class="muted">${sg.attribution ? "wants their name shown" : "chose to stay unnamed"}</span></dd>
<dt>Sent</dt><dd>${when(sg.created_at)}${sg.has_draft ? " · has a private first-response draft" : ""}</dd>
</dl>
<div class="actions">
${actionForm("approve_suggestion", { id: sg.id }, html`${
        sg.attribution ? html`<label class="check"><input type="checkbox" name="keep_name" checked> Show the author's name on the prompt</label>` : ""
      }${noteField}`, "Approve", { confirm: "Approve this suggestion? It goes live as a prompt." })}
${actionForm("decline_suggestion", { id: sg.id }, html`<label>Reason (fixed list; the person sees a plain sentence for it)<select name="reason" required>${
        Object.entries(DECLINE_REASONS).map(([k, v]) => html`<option value="${k}">${v}</option>`)
      }</select></label>${noteField}`, "Decline", { danger: true, confirm: "Decline this suggestion? The author is told why." })}
</div></section>`
    )
  }`;
}

export { trusted, UUID };
