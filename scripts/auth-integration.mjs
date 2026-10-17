#!/usr/bin/env node
// Email sign-in integration test against the LOCAL Supabase stack only (Auth over HTTP,
// codes read from Mailpit, database checks through the local db container). Never point it at
// the hosted project: it creates and deletes throwaway accounts.
//
//   node scripts/auth-integration.mjs                 # expects the fixed behaviour
//   PHASE=before node ...                             # documents the behaviour without the fix
//                                                     # (migration 20261010000300 and the hook absent)
//   PHASE=legacy-setup LEGACY_FILE=/tmp/x.json node … # hook OFF: makes a pre-fix password account
//                                                     # and session and saves them
//   LEGACY_FILE=/tmp/x.json node ...                  # hook ON: also checks that account and session
//
// Needs: `supabase start` with supabase/config.toml (confirmations on, 60 s between emails).
// Takes about 2.5 minutes because of the 60 s gap between emails to one address.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PHASE = process.env.PHASE === 'before' ? 'before' : 'after';
const LEGACY_FILE = process.env.LEGACY_FILE ?? '';
const DB_CONTAINER = process.env.DB_CONTAINER ?? 'supabase_db_shortcut';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

const status = Object.fromEntries(
  execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split('\n')
    .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const API = status.API_URL;
const ANON = status.ANON_KEY;
const SERVICE = status.SERVICE_ROLE_KEY;
if (!API || !ANON || !SERVICE) throw new Error('supabase status did not return API_URL, ANON_KEY and SERVICE_ROLE_KEY');
const host = new URL(API).hostname;
if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error(`refusing to run against ${host}: local stack only`);

const run = Date.now().toString(36);
const addr = (role) => `authtest-${run}-${role}@example.com`;
const ATTACKER_PASSWORD = `Attacker-${run}-Pass!9`;
const results = [];
const createdEmails = [];
const keep = new Set();

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function auth(path, { method = 'POST', body, token, key = ANON } = {}) {
  const res = await fetch(`${API}/auth/v1${path}`, {
    method,
    headers: { apikey: key, 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? key}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function rest(path, token, body = {}) {
  const res = await fetch(`${API}/rest/v1${path}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function sql(query) {
  return execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], {
    input: query,
    encoding: 'utf8',
  }).trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

function amrOf(accessToken) {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
  return (payload.amr ?? []).map((e) => (typeof e === 'string' ? e : e.method));
}

async function latestMail(to, after) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const list = (await res.json()).messages ?? [];
    const fresh = list.filter((m) => new Date(m.Created).getTime() >= after);
    if (fresh.length) {
      const m = await (await fetch(`${MAILPIT}/api/v1/message/${fresh[0].ID}`)).json();
      return { subject: m.Subject, html: m.HTML ?? '', text: m.Text ?? '' };
    }
    await sleep(500);
  }
  return null;
}

function codeFrom(mail) {
  const m = /\b(\d{6})\b/.exec(mail.text || mail.html.replace(/<[^>]+>/g, ' '));
  return m ? m[1] : null;
}

async function requestCode(email) {
  const sentAt = Date.now() - 1000;
  const r = await auth('/otp', { body: { email, create_user: true } });
  const mail = r.status === 200 ? await latestMail(email, sentAt) : null;
  return { r, mail, code: mail ? codeFrom(mail) : null };
}

function checkMail(label, mail) {
  check(`${label}: email arrives`, !!mail);
  if (!mail) return;
  check(`${label}: subject is "Your Conga sign-in code"`, mail.subject === 'Your Conga sign-in code', mail.subject);
  check(`${label}: carries a 6-digit code`, !!codeFrom(mail));
  check(`${label}: carries no link`, !/href=|https?:\/\//i.test(mail.html), 'code only');
  check(`${label}: states the one-hour expiry`, /expires in one hour/i.test(mail.html));
}

const passwordLogin = (email, password) => auth('/token?grant_type=password', { body: { email, password } });
const pwStored = (email) => sql(`select coalesce(encrypted_password, '') <> '' from auth.users where email = ${lit(email)}`) === 't';

async function main() {
  console.log(`phase: ${PHASE}; local API ${API}\n`);
  const expectFixed = PHASE === 'after';

  // 1. Pre-registration: someone signs up a victim's address with their own password.
  const victim = addr('victim');
  createdEmails.push(victim);
  const signup = await auth('/signup', { body: { email: victim, password: ATTACKER_PASSWORD } });
  check('password sign-up for another address returns no session', signup.status === 200 && !signup.json.access_token, `HTTP ${signup.status}`);
  check(
    expectFixed ? 'the password is not stored' : 'the password is stored (vulnerable)',
    pwStored(victim) === !expectFixed,
  );
  const early = await passwordLogin(victim, ATTACKER_PASSWORD);
  check('password sign-in before confirmation is refused', early.status >= 400, `HTTP ${early.status} ${early.json.error_code ?? ''}`);

  // 2. The real owner signs up with an email code later (60 s gap between emails to one address).
  console.log('… waiting 61 s (minimum gap between emails to one address)');
  await sleep(61_000);
  const v = await requestCode(victim);
  check('new account: code requested', v.r.status === 200, `HTTP ${v.r.status}`);
  checkMail('new account (confirmation template)', v.mail);
  const vVerify = await auth('/verify', { body: { type: 'email', email: victim, token: v.code } });
  check('new account: code signs in', !!vVerify.json.access_token, `HTTP ${vVerify.status}`);
  const vSession = vVerify.json;
  if (vSession.access_token) check('new account: session method is otp', amrOf(vSession.access_token).join(',') === 'otp', amrOf(vSession.access_token).join(','));

  // 3. The attacker's password after the owner confirmed.
  const late = await passwordLogin(victim, ATTACKER_PASSWORD);
  if (expectFixed) check('attacker password after confirmation is refused', late.status >= 400, `HTTP ${late.status} ${late.json.error_code ?? ''}`);
  else check('attacker password after confirmation SIGNS IN (vulnerability reproduced)', !!late.json.access_token, `HTTP ${late.status}`);

  // 4. The owner's session keeps working: refresh and a product API call.
  if (vSession.refresh_token) {
    const refreshed = await auth('/token?grant_type=refresh_token', { body: { refresh_token: vSession.refresh_token } });
    check('owner token refresh works', !!refreshed.json.access_token, `HTTP ${refreshed.status}`);
    if (refreshed.json.access_token) {
      check('refreshed token keeps method otp', amrOf(refreshed.json.access_token).join(',') === 'otp');
      const api = await rest('/rpc/get_onboarding_state', refreshed.json.access_token);
      check('owner can call the product API', api.status === 200, `HTTP ${api.status}`);
      vSession.access_token = refreshed.json.access_token;
    }
  }

  // 5. A signed-in person sets a password through the Auth API.
  if (vSession.access_token) {
    const newPassword = `Later-${run}-Pass!7`;
    const upd = await auth('/user', { method: 'PUT', token: vSession.access_token, body: { password: newPassword } });
    const pwLogin = await passwordLogin(victim, newPassword);
    if (expectFixed) {
      check('a password set later is not stored', !pwStored(victim), `PUT /user HTTP ${upd.status}`);
      check('a password set later cannot sign in', pwLogin.status >= 400, `HTTP ${pwLogin.status}`);
    } else check('a password set later SIGNS IN (vulnerable)', !!pwLogin.json.access_token, `HTTP ${pwLogin.status}`);
  }

  // 6. An existing email account signs in again (magic link template).
  const returning = addr('returning');
  createdEmails.push(returning);
  const created = await auth('/admin/users', { key: SERVICE, body: { email: returning, email_confirm: true } });
  check('existing account created (admin)', created.status === 200, `HTTP ${created.status}`);
  const rc = await requestCode(returning);
  check('existing account: code requested', rc.r.status === 200, `HTTP ${rc.r.status}`);
  checkMail('existing account (magic link template)', rc.mail);
  const rVerify = await auth('/verify', { body: { type: 'email', email: returning, token: rc.code } });
  check('existing account: code signs in', !!rVerify.json.access_token, `HTTP ${rVerify.status}`);
  const wrong = await auth('/verify', { body: { type: 'email', email: returning, token: rc.code === '000000' ? '111111' : '000000' } });
  check('wrong code is refused (E-Code)', wrong.status >= 400 && !wrong.json.access_token, `HTTP ${wrong.status}`);
  const tooSoon = await auth('/otp', { body: { email: returning, create_user: true } });
  check('second code within 60 s is refused', tooSoon.status === 429, `HTTP ${tooSoon.status}`);

  // 6b. Anyone can ask Auth for a "recovery" email; it must be the same code email, with no link.
  if (expectFixed) {
    const rec = addr('recovery');
    createdEmails.push(rec);
    await auth('/admin/users', { key: SERVICE, body: { email: rec, email_confirm: true } });
    const sentAt = Date.now() - 1000;
    const rr = await auth('/recover', { body: { email: rec } });
    check('recovery request accepted', rr.status === 200, `HTTP ${rr.status}`);
    checkMail('recovery email', await latestMail(rec, sentAt));
  }

  // 7. One sign-in method per account: an account that uses Google, reached with an email code.
  const google = addr('google');
  createdEmails.push(google);
  const g = await auth('/admin/users', { key: SERVICE, body: { email: google, email_confirm: true } });
  sql(`update auth.identities set provider = 'google', provider_id = ${lit(`google-${run}`)} where user_id = ${lit(g.json.id)};`);
  const lookup = await fetch(`${API}/functions/v1/auth-signin-method`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: google }),
  });
  const providers = (await lookup.json().catch(() => ({}))).providers ?? [];
  check('auth-signin-method reports google for that address (E-Linked)', providers.join(',') === 'google', `HTTP ${lookup.status} ${JSON.stringify(providers)}`);
  const gc = await requestCode(google);
  check('google account: a code is still emailed (Auth cannot be stopped from sending)', gc.r.status === 200 && !!gc.code, `HTTP ${gc.r.status}`);
  const gVerify = await auth('/verify', { body: { type: 'email', email: google, token: gc.code } });
  if (expectFixed) {
    check('google account: email code is refused', !gVerify.json.access_token, `HTTP ${gVerify.status} ${gVerify.json.msg ?? gVerify.json.message ?? ''}`);
    check('google account: no email identity was added', sql(`select count(*) from auth.identities where user_id = ${lit(g.json.id)} and provider = 'email'`) === '0');
  } else check('google account: email code SIGNS IN (one-method gap reproduced)', !!gVerify.json.access_token, `HTTP ${gVerify.status}`);

  // 9. Sessions and the account lifecycle (20261016000202): signing out ends a token on the API,
  //    deletion ends every session, only a new sign-in cancels it, suspension is enforced.
  //    Sign-ins use the Admin API's one-time code (no email, so no 60 s wait).
  if (expectFixed) await lifecycle();

  // 8. A password account and session from before the fix (made by PHASE=legacy-setup).
  if (expectFixed && LEGACY_FILE && existsSync(LEGACY_FILE)) {
    const legacy = JSON.parse(readFileSync(LEGACY_FILE, 'utf8'));
    createdEmails.push(legacy.email);
    check('old account still has its stored password (the fix blocks it, it does not erase it)', pwStored(legacy.email));
    const lr = await auth('/token?grant_type=refresh_token', { body: { refresh_token: legacy.refresh_token } });
    check('old password session cannot refresh (refused by the hook)', !lr.json.access_token && /password_sign_in_disabled/.test(JSON.stringify(lr.json)), `HTTP ${lr.status} ${lr.json.msg ?? lr.json.message ?? ''}`);
    const la = await rest('/rpc/get_onboarding_state', legacy.access_token);
    check('old password access token is refused by the product API', la.status === 403 && /password_session/.test(JSON.stringify(la.json)), `HTTP ${la.status} ${la.json.message ?? ''}`);
    const lp = await passwordLogin(legacy.email, legacy.password);
    check('old stored password cannot sign in (refused by the hook)', !lp.json.access_token && /password_sign_in_disabled/.test(JSON.stringify(lp.json)), `HTTP ${lp.status} ${lp.json.msg ?? lp.json.message ?? ''}`);
  }
}

async function signInWithAdminCode(email) {
  const link = await auth('/admin/generate_link', { key: SERVICE, body: { type: 'magiclink', email } });
  const otp = link.json.email_otp;
  const v = await auth('/verify', { body: { type: 'email', email, token: otp } });
  return v.json;
}

const accountRow = (id) => sql(`select coalesce(deleted_at::text, 'null') || '|' || moderation_status from public.accounts where id = ${lit(id)}`);

async function lifecycle() {
  const email = addr('lifecycle');
  createdEmails.push(email);
  const created = await auth('/admin/users', { key: SERVICE, body: { email, email_confirm: true } });
  const id = created.json.id;
  const phoneA = await signInWithAdminCode(email);
  const phoneB = await signInWithAdminCode(email);
  check('lifecycle: signed in on two phones', !!phoneA.access_token && !!phoneB.access_token);
  if (!phoneA.access_token || !phoneB.access_token) return;
  const claims = JSON.parse(Buffer.from(phoneA.access_token.split('.')[1], 'base64url').toString('utf8'));
  check('lifecycle: the token carries session_id and a timestamped amr (what pre_request and delete_account read)',
    typeof claims.session_id === 'string' && Array.isArray(claims.amr) && Number.isInteger(claims.amr[0]?.timestamp));
  check('lifecycle: phone A reads its state', (await rest('/rpc/get_onboarding_state', phoneA.access_token)).status === 200);

  // Phone B signs out (this phone only): its access token stops working at once.
  const out = await auth('/logout?scope=local', { token: phoneB.access_token });
  const bAfter = await rest('/rpc/get_onboarding_state', phoneB.access_token);
  check('lifecycle: a signed-out token is refused by the product API', bAfter.status === 403 && /session_revoked/.test(JSON.stringify(bAfter.json)), `logout HTTP ${out.status}; API HTTP ${bAfter.status} ${bAfter.json.message ?? ''}`);
  check('lifecycle: phone A is unaffected', (await rest('/rpc/get_onboarding_state', phoneA.access_token)).status === 200);

  // Phone A deletes the account (signed in moments ago); phone C was signed in too.
  const phoneC = await signInWithAdminCode(email);
  const del = await rest('/rpc/delete_account', phoneA.access_token);
  check('lifecycle: a fresh sign-in deletes the account', del.status === 204, `HTTP ${del.status} ${del.json.message ?? ''}`);
  check('lifecycle: every session of the account is gone', sql(`select count(*) from auth.sessions where user_id = ${lit(id)}`) === '0');
  const cAfter = await rest('/rpc/get_onboarding_state', phoneC.access_token);
  check("lifecycle: another phone's token cannot cancel the deletion", cAfter.status === 403 && /session_revoked/.test(JSON.stringify(cAfter.json)), `HTTP ${cAfter.status}`);
  const cRefresh = await auth('/token?grant_type=refresh_token', { body: { refresh_token: phoneC.refresh_token } });
  check('lifecycle: nor refresh it', !cRefresh.json.access_token, `HTTP ${cRefresh.status}`);
  check('lifecycle: the account stays deleted', !accountRow(id).startsWith('null'));

  // Signing in again during the window restores it.
  const back = await signInWithAdminCode(email);
  const state = await rest('/rpc/get_onboarding_state', back.access_token);
  check('lifecycle: signing back in cancels the deletion', state.status === 200 && accountRow(id).startsWith('null|'), `HTTP ${state.status} ${accountRow(id)}`);

  // Suspension: the API refuses everything but the suspended paths; refresh still works so the
  // person can see the notice.
  sql(`update public.accounts set moderation_status = 'suspended' where id = ${lit(id)}`);
  const feed = await rest('/rpc/home_feed', back.access_token);
  check('lifecycle: a suspended account is refused on the product API', feed.status >= 400 && /suspended/.test(JSON.stringify(feed.json)), `HTTP ${feed.status}`);
  const st = await rest('/rpc/get_onboarding_state', back.access_token);
  check('lifecycle: and still reads its suspension state', st.status === 200 && st.json.suspended === true, `HTTP ${st.status}`);
  const rf = await auth('/token?grant_type=refresh_token', { body: { refresh_token: back.refresh_token } });
  check('lifecycle: a suspended session still refreshes (LV-Suspended needs it)', !!rf.json.access_token, `HTTP ${rf.status}`);
  sql(`update public.accounts set moderation_status = 'active' where id = ${lit(id)}`);

  // Signing out everywhere ends the remaining token too.
  const token = rf.json.access_token ?? back.access_token;
  const all = await auth('/logout', { token });
  const after = await rest('/rpc/get_onboarding_state', token);
  check('lifecycle: after signing out everywhere the last token is refused', after.status === 403, `logout HTTP ${all.status}; API HTTP ${after.status}`);
}

// Run with the access token hook switched OFF in config.toml (and Auth restarted): makes an account
// with a stored password, the way one could exist before the fix, and saves its password session.
async function legacySetup() {
  if (!LEGACY_FILE) throw new Error('LEGACY_FILE is required');
  const email = addr('legacy');
  const password = `Legacy-${run}-Pass!3`;
  const created = await auth('/admin/users', { key: SERVICE, body: { email, email_confirm: true } });
  // The discard_auth_password trigger would remove the password, so set it as the local superuser
  // with triggers off, as a row written before the migration would be.
  execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: `set session_replication_role = replica; update auth.users set encrypted_password = extensions.crypt(${lit(password)}, extensions.gen_salt('bf')) where id = ${lit(created.json.id)};`,
    encoding: 'utf8',
  });
  const login = await passwordLogin(email, password);
  check('legacy setup: password sign-in works with the hook off', !!login.json.access_token, `HTTP ${login.status} ${login.json.msg ?? ''}`);
  if (login.json.access_token) check('legacy setup: session method is password', amrOf(login.json.access_token).join(',') === 'password');
  writeFileSync(LEGACY_FILE, JSON.stringify({ email, password, access_token: login.json.access_token, refresh_token: login.json.refresh_token }));
  keep.add(email);
  createdEmails.push(email);
}

try {
  if (process.env.PHASE === 'legacy-setup') await legacySetup();
  else await main();
} finally {
  for (const email of createdEmails.filter((e) => !keep.has(e))) {
    const id = sql(`select id from auth.users where email = ${lit(email)}`);
    if (id) await auth(`/admin/users/${id}`, { method: 'DELETE', key: SERVICE });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed (${PHASE}); test accounts removed: ${createdEmails.length - keep.size}, kept for the next phase: ${keep.size}`);
  process.exitCode = failed.length ? 1 : 0;
}
