// The member's side of the provider tests (docs/release/PROVIDER-TESTS.md), acting as the
// disposable test account T1 through the same endpoints the app uses. Prints ids, statuses and
// timings only: never an upload URL (a bearer credential for that upload), a token or a key.
//
//   PT_SUPABASE_URL=...        the project (local: http://127.0.0.1:<port>)
//   PT_ANON_KEY=...            its anon (publishable) key
//   PT_TOKEN_FILE=...          where the member's access token is kept (mode 600; never printed)
//   node scripts/provider-member.mjs <command>
//
// Commands:
//   otp <email>                       sends the member a sign-in code (one Auth email)
//   verify <email> <6-digit code>     signs in with it; the token goes to PT_TOKEN_FILE
//   c2 --reply-to <live video id> [--submission yes|no] [--bytes none|partial|invalid] [--discard abandon-submission|abandon-response|none]
//                                     mints one URL, makes a video reply row with it (no Post screen),
//                                     optionally starts and cuts a transfer, then discards it
//   abandon <submission id>           asks abandon-submission again (reconciliation)
//   delete-account                    delete_account() (needs a sign-in, from `verify`, in the last
//                                     10 minutes; with 20261016000202 it ends every session of the
//                                     account, so the saved token stops working)
//   sign-in-state                     get_onboarding_state(), as the app does at launch. It restores a
//                                     deleted account inside its 30 days only on a session that began
//                                     after the deletion: run `otp` and `verify` again first. The old
//                                     token is answered `session_revoked` (printed as error)
//
// Local stacks only (127.0.0.1, localhost). The hosted project needs PT_HOSTED_REF=<project ref>
// matching the URL and PT_APPROVED_BY_NEMAT=yes; no script in this repository sets either.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import http from 'node:http';

const URL_ = (process.env.PT_SUPABASE_URL ?? '').replace(/\/$/, '');
const ANON = process.env.PT_ANON_KEY ?? '';
const TOKEN_FILE = process.env.PT_TOKEN_FILE ?? '';
const refuse = (m) => {
  console.error(`refused: ${m}`);
  process.exit(2);
};
if (!URL_ || !ANON || !TOKEN_FILE) refuse('set PT_SUPABASE_URL, PT_ANON_KEY and PT_TOKEN_FILE');
const host = new URL(URL_).hostname;
const local = ['127.0.0.1', 'localhost'].includes(host);
if (!local) {
  const ref = process.env.PT_HOSTED_REF ?? '';
  if (!ref || host !== `${ref}.supabase.co` || process.env.PT_APPROVED_BY_NEMAT !== 'yes') refuse(`${host} is not a local stack, and the hosted run is not enabled`);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const token = () => readFileSync(TOKEN_FILE, 'utf8').trim();
const out = (o) => console.log(JSON.stringify({ target: local ? 'local' : 'hosted', ...o }, null, 2));

async function call(path, { method = 'POST', body, auth = true } = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: { apikey: ANON, 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token()}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json };
}
const code = (r) => (typeof r.json?.message === 'string' ? r.json.message : typeof r.json?.error === 'string' ? r.json.error : null);

/** Starts a PUT of `declared` bytes and cuts it after `send` bytes (partial), or sends `send`
 *  bytes completely. Never prints the URL. Returns what was sent and how it ended. */
function put(uploadUrl, { send, declared, cut }) {
  return new Promise((resolve) => {
    let u = new URL(uploadUrl);
    // Local rehearsal only: the fake Mux hands out https URLs on a reserved name (mux-create-upload
    // accepts only https); its upload endpoint is on this machine.
    const rewrite = process.env.PT_LOCAL_UPLOAD_BASE;
    if (rewrite && local) {
      const b = new URL(rewrite);
      if (b.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(b.hostname) || !u.hostname.endsWith('.invalid')) refuse('PT_LOCAL_UPLOAD_BASE is for the local rehearsal only');
      u = new URL(u.pathname + u.search, b.origin);
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(declared) } });
    let done = false;
    const finish = (r) => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    req.on('response', (res) => {
      res.resume();
      finish({ sent: send, declared, http: res.statusCode, cut: false });
    });
    req.on('error', (e) => finish({ sent: send, declared, http: null, cut, error: cut ? 'cut' : e.code ?? 'error' }));
    req.write(randomBytes(send), () => {
      if (cut) {
        setTimeout(() => {
          req.destroy();
          finish({ sent: send, declared, http: null, cut: true });
        }, 500);
      } else req.end();
    });
  });
}

const [command, ...rest] = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : dflt;
};

if (command === 'otp') {
  const email = rest[0];
  if (!/^[^@\s]+@[^@\s]+$/.test(email ?? '')) refuse('an email address is required');
  const r = await call('/auth/v1/otp', { body: { email, create_user: false }, auth: false });
  out({ command, http: r.status, error: r.status === 200 ? null : code(r) });
} else if (command === 'verify') {
  const [email, otp] = rest;
  if (!/^\d{6}$/.test(otp ?? '')) refuse('the 6-digit code is required');
  const r = await call('/auth/v1/verify', { body: { type: 'email', email, token: otp }, auth: false });
  if (r.status === 200 && typeof r.json?.access_token === 'string') writeFileSync(TOKEN_FILE, r.json.access_token, { mode: 0o600 });
  out({ command, http: r.status, user: r.json?.user?.id ?? null, token_saved: r.status === 200, error: r.status === 200 ? null : code(r) });
} else if (command === 'c2') {
  const replyTo = flag('reply-to');
  const withSubmission = flag('submission', 'yes') === 'yes';
  const bytes = flag('bytes', 'partial');
  const discard = flag('discard', 'abandon-submission');
  if (!UUID.test(replyTo ?? '')) refuse('--reply-to <live video id> is required');
  if (!['none', 'partial', 'invalid'].includes(bytes)) refuse('--bytes none|partial|invalid');
  if (!['abandon-submission', 'abandon-response', 'none'].includes(discard)) refuse('--discard abandon-submission|abandon-response|none');
  if (discard === 'abandon-submission' && !withSubmission) refuse('abandon-submission needs --submission yes');
  const steps = [];
  const stop = (ok, reason) => {
    out({ command, ok, reason, steps });
    process.exit(ok ? 0 : 1);
  };
  // 1. One URL, as Post Review would mint it.
  const m = await call('/functions/v1/mux-create-upload');
  const uploadId = typeof m.json?.uploadId === 'string' ? m.json.uploadId : null;
  const uploadUrl = typeof m.json?.uploadUrl === 'string' ? m.json.uploadUrl : null;
  steps.push({ step: 'mint', http: m.status, uploadId, error: m.status === 200 ? null : code(m) });
  if (m.status !== 200 || !uploadId || !uploadUrl) stop(false, 'no upload URL');
  // 2. The row, as Post makes it (claims the upload before any byte, as the app does).
  const submission = withSubmission ? randomUUID() : null;
  const body = { p_reply_to: replyTo, p_upload_id: uploadId, p_caption: null, p_duration_ms: 6000, ...(submission ? { p_submission: submission } : {}) };
  const row = await call('/rest/v1/rpc/post_reply', { body });
  const responseId = typeof row.json?.id === 'string' ? row.json.id : null;
  steps.push({ step: 'post_reply', http: row.status, responseId, submission, error: row.status === 200 ? null : code(row) });
  if (row.status !== 200 || !responseId) stop(false, 'no row');
  // 3. A transfer: none; cut after 256 KiB of 8 MiB (Mux keeps waiting); or a small complete file
  //    that is not a video (what Mux reports for it is the open question of errored uploads).
  if (bytes === 'partial') steps.push({ step: 'put', ...(await put(uploadUrl, { send: 256 * 1024, declared: 8 * 1024 * 1024, cut: true })) });
  if (bytes === 'invalid') steps.push({ step: 'put', ...(await put(uploadUrl, { send: 64 * 1024, declared: 64 * 1024, cut: false })) });
  // 4. The discard.
  if (discard === 'abandon-submission') {
    const a = await call('/functions/v1/abandon-submission', { body: { submissionId: submission } });
    steps.push({ step: 'abandon-submission', http: a.status, answer: a.json });
  } else if (discard === 'abandon-response') {
    const a = await call('/rest/v1/rpc/abandon_response', { body: { p_response: responseId } });
    steps.push({ step: 'abandon_response', http: a.status, error: a.status === 204 || a.status === 200 ? null : code(a) });
  }
  stop(true, 'verify with the read-only checks');
} else if (command === 'abandon') {
  if (!UUID.test(rest[0] ?? '')) refuse('a submission id is required');
  const a = await call('/functions/v1/abandon-submission', { body: { submissionId: rest[0] } });
  out({ command, http: a.status, answer: a.json });
} else if (command === 'delete-account') {
  const r = await call('/rest/v1/rpc/delete_account', { body: {} });
  out({ command, http: r.status, error: r.status === 204 || r.status === 200 ? null : code(r) });
} else if (command === 'sign-in-state') {
  const r = await call('/rest/v1/rpc/get_onboarding_state', { body: {} });
  const s = r.json ?? {};
  out({ command, http: r.status, deleted: s.deleted ?? s.account_deleted ?? null, keys: r.status === 200 && s && typeof s === 'object' ? Object.keys(s).sort() : null, error: r.status === 200 ? null : code(r) });
} else {
  console.error('commands: otp, verify, c2, abandon, delete-account, sign-in-state (see the top of this file)');
  process.exit(2);
}
