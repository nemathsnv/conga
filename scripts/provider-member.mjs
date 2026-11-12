// The member's side of the provider tests (docs/release/PROVIDER-TESTS.md), acting as a disposable
// test account through the same endpoints the app uses: T1 for C1 and C2 (closed), T2 for E1 to E3.
// Prints ids, statuses and timings only: never an upload URL (a bearer credential for that upload),
// an invite code, an email address, a token or a key.
//
//   PT_SUPABASE_URL=...        the project (local: http://127.0.0.1:<port>)
//   PT_ANON_KEY=...            its anon (publishable) key
//   PT_TOKEN_FILE=...          where the member's access token is kept (mode 600; never printed)
//   PT_EXPECT_USER=<uuid>      the account every acting command must be signed in as (T2's id, from
//                              PT_ID_FILE). The token's user is compared with it before each call.
//   PT_ID_FILE=...             where `verify --new` records the new account's id (mode 600)
//   PT_JOURNAL_FILE=...        `respond`'s journal (mode 600; holds the upload URL, never printed)
//   PT_PROTECTED_IDS=a,b       more accounts to refuse (local rehearsal); it can only add to the
//                              two built in (T1 and the founder), never remove them
//   node scripts/provider-member.mjs <command>
//
// Commands (an "acting" command needs PT_EXPECT_USER and refuses T1 and the founder unconditionally):
//   otp <email> [--create]            sends a sign-in code (one Auth email). --create: for a new
//                                     account; refused if the address already has one
//   verify <email> <6-digit code> [--new]
//                                     signs in; the token goes to PT_TOKEN_FILE. Without --new the
//                                     user must be PT_EXPECT_USER. With --new it must be a brand-new,
//                                     not onboarded account (created in the last 30 minutes, one email
//                                     identity, the address asked for, no profile, no beta access),
//                                     and PT_ID_FILE must not exist yet; its id is written there.
//                                     Any mismatch removes the token and writes nothing.
//   c2 --reply-to <live video id> [--submission yes|no] [--bytes none|partial|invalid] [--discard abandon-submission|abandon-response|none]
//                                     (acting) mints one URL, makes a video reply row with it (no Post
//                                     screen), optionally starts and cuts a transfer, then discards it
//   abandon <submission id>           (acting) asks abandon-submission again (reconciliation)
//   onboard --invite-file <f> --name <n> --username <u>
//                                     (acting) as the app's sign-up: confirm_age, redeem_invite,
//                                     create_profile, acknowledge_disclosure. Skips what is already
//                                     done; refuses a profile with another username
//   respond --prompt <id> --file <mp4> [--duration-ms 6000]
//                                     (acting) the account's one disposable response, as the app posts
//                                     it: mint, post_response with a submission id, PUT the file, then
//                                     mux-upload-status until live. Refused if the account already has
//                                     any response or a journal exists. Local only: --cut-after <bytes>
//   respond --resume [--new-upload]   (acting) finishes it from the journal. It first asks the server
//                                     what Mux holds (mux-upload-status) and acts only on that answer:
//                                     asset made -> wait for live, nothing sent; waiting -> the same
//                                     file to the same URL (one upload makes at most one asset);
//                                     cancelled or timed out with no asset -> stop, unless
//                                     --new-upload (a new URL; the old one is proven empty);
//                                     errored, unknown or no answer -> stop. Never mints otherwise.
//   status                            (acting, read-only) the journal's phase and mux-upload-status
//   delete-account                    (acting) delete_account() (needs a sign-in, from `verify`, in
//                                     the last 10 minutes; with 20261016000202 it ends every session of
//                                     the account, so the saved token stops working)
//   sign-in-state                     (acting) get_onboarding_state(), as the app does at launch. It
//                                     restores a deleted account inside its 30 days only on a session
//                                     that began after the deletion: run `otp` and `verify` again
//                                     first. The old token is answered `session_revoked` (an error)
//
// Local stacks only (127.0.0.1, localhost). The hosted project needs PT_HOSTED_REF=<project ref>
// matching the URL and PT_APPROVED_BY_NEMAT=yes; no script in this repository sets either.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
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

// Accounts no acting command may ever act as: T1 (its four videos and the iPhone's sign-in are kept)
// and the founder. Built in, so no environment can lift them; PT_PROTECTED_IDS can only add.
const PROTECTED = new Set([
  'b0c14e38-4e89-4dbd-a9a3-8a8c01872a78', // T1
  '70046556-4209-4471-b5bb-a770aee12466', // the founder
  ...(process.env.PT_PROTECTED_IDS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => UUID.test(s)),
]);
/** The user the saved token belongs to (its `sub`; the server checks the signature, this only reads it). */
function tokenUser() {
  if (!existsSync(TOKEN_FILE)) return null;
  try {
    const sub = JSON.parse(Buffer.from(token().split('.')[1], 'base64url').toString('utf8')).sub;
    return typeof sub === 'string' && UUID.test(sub) ? sub.toLowerCase() : null;
  } catch {
    return null;
  }
}
/** Every acting command: the token must be PT_EXPECT_USER's, and never a protected account's. */
function actingAs() {
  const expected = (process.env.PT_EXPECT_USER ?? '').toLowerCase();
  const user = tokenUser();
  if (!user) refuse('no signed-in token in PT_TOKEN_FILE');
  if (PROTECTED.has(user)) refuse('the token belongs to a protected account (T1 or the founder); nothing sent');
  if (!UUID.test(expected)) refuse('PT_EXPECT_USER (the test account\'s id) is required');
  if (PROTECTED.has(expected)) refuse('PT_EXPECT_USER names a protected account (T1 or the founder)');
  if (user !== expected) refuse('the token belongs to another account than PT_EXPECT_USER; nothing sent');
  return user;
}
function dropToken() {
  try { unlinkSync(TOKEN_FILE); } catch { /* none */ }
}

async function call(path, { method = 'POST', body, auth = true } = {}) {
  try {
    const res = await fetch(`${URL_}${path}`, {
      method,
      headers: { apikey: ANON, 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token()}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, json };
  } catch (e) {
    // No answer at all (network): the caller must treat the outcome as unknown.
    return { status: null, json: null, network: e?.cause?.code ?? e?.code ?? 'network' };
  }
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

/** PUTs a whole file as the app does (Content-Type video/mp4), or, locally, cuts it after `cutAfter`
 *  bytes. Never prints the URL. The answer is `http` (the status, or null when none came back). */
function putFile(uploadUrl, data, { cutAfter = null } = {}) {
  return new Promise((resolve) => {
    let u = new URL(uploadUrl);
    const rewrite = process.env.PT_LOCAL_UPLOAD_BASE;
    if (rewrite && local) {
      const b = new URL(rewrite);
      if (b.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(b.hostname) || !u.hostname.endsWith('.invalid')) refuse('PT_LOCAL_UPLOAD_BASE is for the local rehearsal only');
      u = new URL(u.pathname + u.search, b.origin);
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(data.length) } });
    let done = false;
    const finish = (r) => { if (!done) { done = true; resolve(r); } };
    req.setTimeout(10 * 60_000, () => req.destroy(new Error('timeout')));
    req.on('response', (res) => { res.resume(); finish({ http: res.statusCode, sent: cutAfter ?? data.length, declared: data.length, cut: false }); });
    req.on('error', (e) => finish({ http: null, sent: cutAfter ?? data.length, declared: data.length, cut: cutAfter !== null, error: cutAfter !== null ? 'cut' : e.code ?? 'error' }));
    if (cutAfter !== null) {
      req.write(data.subarray(0, cutAfter), () => setTimeout(() => { req.destroy(); finish({ http: null, sent: cutAfter, declared: data.length, cut: true }); }, 500));
    } else req.end(data);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const JOURNAL = process.env.PT_JOURNAL_FILE ?? '';
const readJournal = () => JSON.parse(readFileSync(JOURNAL, 'utf8'));
const writeJournal = (j) => writeFileSync(JOURNAL, JSON.stringify(j), { mode: 0o600 });
/** The journal without the upload URL, for printing. */
const shown = (j) => { const { uploadUrl, ...rest } = j; return { ...rest, uploadUrl: uploadUrl ? '(kept, not shown)' : null }; };
/** What the server reads at Mux for this upload (mux-upload-status, the app's own check). */
async function inspect(uploadId) {
  const r = await call(`/functions/v1/mux-upload-status?uploadId=${encodeURIComponent(uploadId)}`, { method: 'GET' });
  const j = r.json ?? {};
  return { http: r.status, network: r.network ?? null, uploadStatus: j.uploadStatus ?? null, assetStatus: j.assetStatus ?? null, responseStatus: j.responseStatus ?? null, playbackId: j.playbackId ?? null, error: j.error ?? null };
}
/** Polls until the response is live, Mux reports a failure, or `ms` pass. */
async function untilLive(uploadId, ms) {
  const end = Date.now() + ms;
  let s;
  for (;;) {
    s = await inspect(uploadId);
    if (s.responseStatus === 'live') return { outcome: 'live', last: s };
    if (s.http !== 200 || ['errored', 'cancelled', 'timed_out'].includes(s.uploadStatus) || s.assetStatus === 'errored') return { outcome: 'stopped', last: s };
    if (Date.now() > end) return { outcome: 'not_live_yet', last: s };
    await sleep(3000);
  }
}

const [command, ...rest] = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : dflt;
};

if (command === 'otp') {
  const email = (rest[0] ?? '').trim().toLowerCase();
  const create = rest.includes('--create');
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) refuse('an email address is required');
  if (create) {
    // The app's own question before sign-up: which sign-in methods does this address have?
    const m = await call('/functions/v1/auth-signin-method', { body: { email }, auth: false });
    if (m.status !== 200 || !Array.isArray(m.json?.providers)) { out({ command, ok: false, reason: 'could not check the address first; nothing sent', http: m.status }); process.exit(1); }
    if (m.json.providers.length > 0) refuse('this address already has an account; --create sends nothing');
  }
  const r = await call('/auth/v1/otp', { body: { email, create_user: create }, auth: false });
  out({ command, create, http: r.status, error: r.status === 200 ? null : code(r) });
} else if (command === 'verify') {
  const [emailArg, otp] = rest;
  const email = (emailArg ?? '').trim().toLowerCase();
  const isNew = rest.includes('--new');
  if (!/^\d{6}$/.test(otp ?? '')) refuse('the 6-digit code is required');
  const idFile = process.env.PT_ID_FILE ?? '';
  const expected = (process.env.PT_EXPECT_USER ?? '').toLowerCase();
  if (isNew && (!idFile || existsSync(idFile))) refuse('verify --new needs PT_ID_FILE, and it must not exist yet (a test account is already recorded)');
  if (!isNew && (!UUID.test(expected) || PROTECTED.has(expected))) refuse('PT_EXPECT_USER (the test account\'s id, not T1 or the founder) is required; a first sign-in uses --new');
  const r = await call('/auth/v1/verify', { body: { type: 'email', email, token: otp }, auth: false });
  const user = r.json?.user ?? null;
  const id = typeof user?.id === 'string' ? user.id.toLowerCase() : null;
  if (r.status !== 200 || typeof r.json?.access_token !== 'string' || !id) {
    out({ command, http: r.status, token_saved: false, error: code(r) ?? r.network ?? null });
    process.exit(1);
  }
  writeFileSync(TOKEN_FILE, r.json.access_token, { mode: 0o600 });
  const mismatch = (reason) => {
    dropToken();
    out({ command, http: r.status, user: id, token_saved: false, refused: reason });
    process.exit(3);
  };
  if (PROTECTED.has(id)) mismatch('the code signed in a protected account (T1 or the founder); token removed');
  if ((user.email ?? '').toLowerCase() !== email) mismatch('the signed-in user is not the address asked for; token removed');
  if (!isNew) {
    if (id !== expected) mismatch('the signed-in user is not PT_EXPECT_USER; token removed');
    out({ command, http: r.status, user: id, token_saved: true });
  } else {
    const ageMin = (Date.now() - Date.parse(user.created_at ?? '')) / 60_000;
    const identities = Array.isArray(user.identities) ? user.identities.map((i) => i.provider) : [];
    if (!(ageMin >= 0 && ageMin <= 30)) mismatch('not a new account (created more than 30 minutes ago); token removed');
    if (identities.length !== 1 || identities[0] !== 'email') mismatch('the account has other identities than one email identity; token removed');
    const s = await call('/rest/v1/rpc/get_onboarding_state', { body: {} });
    if (s.status !== 200) mismatch(`could not read the account's state (${s.status}); token removed`);
    if (s.json.has_profile || s.json.has_beta_access || s.json.age_confirmed) mismatch('the account is already (partly) onboarded, so it is not new; token removed');
    writeFileSync(idFile, id, { mode: 0o600, flag: 'wx' });
    out({ command, http: r.status, user: id, token_saved: true, new_account: true, id_recorded: true });
  }
} else if (command === 'c2') {
  actingAs();
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
  actingAs();
  if (!UUID.test(rest[0] ?? '')) refuse('a submission id is required');
  const a = await call('/functions/v1/abandon-submission', { body: { submissionId: rest[0] } });
  out({ command, http: a.status, answer: a.json });
} else if (command === 'delete-account') {
  const user = actingAs();
  const r = await call('/rest/v1/rpc/delete_account', { body: {} });
  out({ command, user, http: r.status, error: r.status === 204 || r.status === 200 ? null : code(r) ?? r.network ?? null });
} else if (command === 'sign-in-state') {
  const user = actingAs();
  const r = await call('/rest/v1/rpc/get_onboarding_state', { body: {} });
  const s = r.json ?? {};
  out({ command, user, http: r.status, deleted: s.deleted ?? s.account_deleted ?? null, keys: r.status === 200 && s && typeof s === 'object' ? Object.keys(s).sort() : null, error: r.status === 200 ? null : code(r) ?? r.network ?? null });
} else if (command === 'onboard') {
  const user = actingAs();
  const inviteFile = flag('invite-file');
  const name = flag('name');
  const username = flag('username');
  if (!inviteFile || !name || !username) refuse('--invite-file, --name and --username are required');
  const steps = [];
  const stop = (ok, reason) => { out({ command, user, ok, reason, steps }); process.exit(ok ? 0 : 1); };
  const state = async () => (await call('/rest/v1/rpc/get_onboarding_state', { body: {} })).json ?? {};
  let s = await state();
  if (s.profile && s.profile.username !== username) refuse('the account already has a profile with another username');
  if (!s.age_confirmed) {
    const r = await call('/rest/v1/rpc/confirm_age', { body: {} });
    steps.push({ step: 'confirm_age', http: r.status, error: r.status === 204 || r.status === 200 ? null : code(r) });
    if (r.status !== 204 && r.status !== 200) stop(false, 'confirm_age failed');
  }
  s = await state();
  if (!s.has_beta_access) {
    const inviteCode = readFileSync(inviteFile, 'utf8').trim();
    const r = await call('/rest/v1/rpc/redeem_invite', { body: { p_code: inviteCode } });
    steps.push({ step: 'redeem_invite', http: r.status, status: r.json?.status ?? null, error: r.status === 200 ? null : code(r) });
    if (r.status !== 200 || r.json?.status !== 'valid') stop(false, 'the invite was not redeemed');
  }
  s = await state();
  if (!s.has_profile) {
    const r = await call('/rest/v1/rpc/create_profile', { body: { p_name: name, p_username: username } });
    steps.push({ step: 'create_profile', http: r.status, error: r.status === 200 ? null : code(r) });
    if (r.status !== 200) stop(false, 'create_profile failed');
  }
  const ack = await call('/rest/v1/rpc/acknowledge_disclosure', { body: {} });
  steps.push({ step: 'acknowledge_disclosure', http: ack.status, error: ack.status === 204 || ack.status === 200 ? null : code(ack) });
  s = await state();
  const ok = s.age_confirmed && s.has_beta_access && s.has_profile && s.profile?.username === username && (ack.status === 204 || ack.status === 200);
  stop(Boolean(ok), ok ? 'onboarded' : 'not fully onboarded');
} else if (command === 'respond' || command === 'status') {
  const user = actingAs();
  if (!JOURNAL) refuse('PT_JOURNAL_FILE is required');
  const steps = [];
  const stop = (ok, reason, extra = {}) => {
    out({ command, user, ok, reason, ...extra, journal: existsSync(JOURNAL) ? shown(readJournal()) : null, steps });
    process.exit(ok ? 0 : 1);
  };
  if (command === 'status') {
    if (!existsSync(JOURNAL)) stop(true, 'no journal');
    const j = readJournal();
    stop(true, 'read only', { mux: j.uploadId ? await inspect(j.uploadId) : null });
  }
  const resume = rest.includes('--resume');
  const newUpload = rest.includes('--new-upload');
  const waitMs = Number(flag('wait-seconds', '180')) * 1000;
  let j;
  if (!resume) {
    const promptId = flag('prompt');
    const file = flag('file');
    const durationMs = Number(flag('duration-ms', '6000'));
    const cutAfter = flag('cut-after') === undefined ? null : Number(flag('cut-after'));
    if (!UUID.test(promptId ?? '') || !file) refuse('--prompt <id> and --file <mp4> are required');
    if (cutAfter !== null && !local) refuse('--cut-after is for the local rehearsal only');
    if (existsSync(JOURNAL)) refuse('a journal exists: this account already started its one response (use --resume, or status)');
    const mine = await call(`/rest/v1/responses?select=id,status&author_id=eq.${user}`, { method: 'GET' });
    if (mine.status !== 200 || !Array.isArray(mine.json)) stop(false, 'could not read the account\'s rows; nothing sent');
    if (mine.json.length > 0) refuse(`the account already has ${mine.json.length} response row(s); exactly one disposable video is allowed`);
    const data = readFileSync(file);
    if (data.subarray(4, 8).toString('latin1') !== 'ftyp') refuse('the file is not an MP4');
    j = { phase: 'minting', submission: randomUUID(), promptId, durationMs, file, sha256: createHash('sha256').update(data).digest('hex'), cutAfter, startedAt: new Date().toISOString() };
    writeJournal(j);
  } else {
    if (!existsSync(JOURNAL)) refuse('no journal to resume');
    j = readJournal();
    if (j.phase === 'live') stop(true, 'already live; nothing sent');
    if (j.cutAfter !== null && j.cutAfter !== undefined) j.cutAfter = null; // a resume sends the whole file
  }
  const data = readFileSync(j.file);
  if (createHash('sha256').update(data).digest('hex') !== j.sha256) refuse('the file changed since the journal was written');

  // 1. The URL. Only when the journal holds none, or with --new-upload once Mux has proven the old
  //    one made nothing (checked in step 3 below).
  const mint = async () => {
    const m = await call('/functions/v1/mux-create-upload');
    const uploadId = typeof m.json?.uploadId === 'string' ? m.json.uploadId : null;
    const uploadUrl = typeof m.json?.uploadUrl === 'string' ? m.json.uploadUrl : null;
    steps.push({ step: 'mint', http: m.status, uploadId, error: m.status === 200 ? null : code(m) ?? m.network ?? null });
    if (m.status !== 200 || !uploadId || !uploadUrl) {
      j.phase = j.uploadId ? j.phase : 'mint_failed';
      writeJournal(j);
      stop(false, 'no upload URL (no bytes were sent, so Mux holds no asset for it); --resume mints again');
    }
    return { uploadId, uploadUrl, mintedAt: new Date().toISOString() };
  };
  if (!j.uploadId) {
    Object.assign(j, await mint(), { phase: 'minted' });
    writeJournal(j);
  }
  // 2. The row: the same submission id every time, so a retry after a lost answer gets the same row.
  if (!j.responseId) {
    const body = { p_prompt: j.promptId, p_upload_id: j.uploadId, p_caption: null, p_duration_ms: j.durationMs, p_submission: j.submission };
    const row = await call('/rest/v1/rpc/post_response', { body });
    const responseId = typeof row.json?.id === 'string' ? row.json.id : null;
    steps.push({ step: 'post_response', http: row.status, responseId, replayed: row.json?.replayed ?? false, error: row.status === 200 ? null : code(row) ?? row.network ?? null });
    if (row.status !== 200 || !responseId) {
      j.phase = 'post_unknown';
      writeJournal(j);
      stop(false, 'the row is not confirmed; --resume asks again with the same submission id');
    }
    j.responseId = responseId;
    j.phase = 'posted';
    writeJournal(j);
  }
  // 3. Before any (re)transfer on a resume: what does Mux hold? Act only on a definite answer.
  if (resume) {
    let s = await inspect(j.uploadId);
    steps.push({ step: 'inspect', ...s });
    if (s.http === 200 && s.uploadStatus === 'waiting') {
      // A transfer that just ended may still be turning into an asset: look again before sending.
      await sleep(Number(process.env.PT_SETTLE_MS ?? '10000'));
      s = await inspect(j.uploadId);
      steps.push({ step: 'inspect again', ...s });
    }
    if (s.http !== 200 || s.network) stop(false, 'no definite answer from the server about Mux; nothing sent');
    if (s.responseStatus === 'live' || s.uploadStatus === 'asset_created') {
      j.phase = 'uploaded';
      writeJournal(j);
    } else if (s.uploadStatus === 'waiting') {
      if (Date.now() - Date.parse(j.mintedAt) > 55 * 60_000) stop(false, 'the URL is within 5 minutes of its expiry; nothing sent (status again after it times out)');
      // Same URL: one direct upload makes at most one asset, so this cannot make a second.
    } else if (['cancelled', 'timed_out'].includes(s.uploadStatus) && !s.assetStatus) {
      if (!newUpload) stop(false, `Mux reports the upload ${s.uploadStatus} with no asset; a new URL needs --new-upload`);
      const fresh = await mint();
      const r = await call('/rest/v1/rpc/retry_response_upload', { body: { p_response: j.responseId, p_upload_id: fresh.uploadId } });
      steps.push({ step: 'retry_response_upload', http: r.status, error: r.status === 204 || r.status === 200 ? null : code(r) ?? r.network ?? null });
      if (r.status !== 204 && r.status !== 200) stop(false, 'the row did not take the new upload; the new URL holds nothing and expires');
      j.previousUploads = [...(j.previousUploads ?? []), { uploadId: j.uploadId, status: s.uploadStatus }];
      Object.assign(j, fresh, { phase: 'posted' });
      writeJournal(j);
    } else {
      stop(false, `Mux reports upload ${s.uploadStatus ?? 'unknown'}, asset ${s.assetStatus ?? 'none'}${s.error ? ` (${s.error})` : ''}; nothing sent`);
    }
  }
  // 4. The transfer (not when Mux already made the asset).
  if (j.phase !== 'uploaded') {
    const p = await putFile(j.uploadUrl, data, { cutAfter: j.cutAfter ?? null });
    steps.push({ step: 'put', ...p });
    if (p.http !== 200 && p.http !== 201) {
      j.phase = 'put_uncertain';
      writeJournal(j);
      stop(false, 'the transfer has no confirmed end; --resume asks Mux first');
    }
    j.phase = 'uploaded';
    writeJournal(j);
  }
  // 5. Until live (mux-upload-status also marks the row live, as the app's poll does).
  const w = await untilLive(j.uploadId, waitMs);
  steps.push({ step: 'until live', outcome: w.outcome, ...w.last });
  if (w.outcome === 'live') {
    Object.assign(j, { phase: 'live', playbackId: w.last.playbackId, liveAt: new Date().toISOString() });
    writeJournal(j);
    stop(true, 'live');
  }
  stop(false, w.outcome === 'not_live_yet' ? 'not live yet: status, then --resume' : 'Mux reports a failure; nothing more sent');
} else {
  console.error('commands: otp, verify, c2, abandon, onboard, respond, status, delete-account, sign-in-state (see the top of this file)');
  process.exit(2);
}
