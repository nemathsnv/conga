// Hosted email sign-in smoke test (docs/BETA-READINESS.md section 10). Run by Nemat, in a
// terminal, with Nemat's own address: it signs that address up on the HOSTED project, so it
// creates a real account there. Nothing secret is printed: the code is typed without echo, and
// tokens, keys and passwords stay in memory. Only the public anon key is used (read from the
// Supabase CLI); no service role key.
//
//   node scripts/hosted-auth-smoke.mjs
//
// Steps: request a code (new account, confirmation email) -> Nemat checks the email -> verify the
// code -> session issued through the access token hook (method otp) -> refresh -> one product
// RPC -> password sign-in refused -> a password set through the Auth API is not stored and cannot
// sign in -> sign out.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

const PROJECT_REF = 'picvoavfxnajfjkqawju';
const URL_BASE = `https://${PROJECT_REF}.supabase.co`;

const keys = JSON.parse(
  execFileSync('supabase', ['projects', 'api-keys', '--project-ref', PROJECT_REF, '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
);
const ANON = keys.find((k) => k.name === 'anon' && k.type === 'legacy')?.api_key;
if (!ANON) throw new Error('anon key not found');

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

async function call(path, { method = 'POST', body, token } = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token ?? ANON}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json };
}

// Auth error fields only: never echo a response body that could carry a token.
const authError = (r) =>
  `HTTP ${r.status}${r.json?.error_code ? ` ${r.json.error_code}` : ''}${r.json?.msg ? `: ${r.json.msg}` : ''}`;

const claims = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
const methods = (c) => (c.amr ?? []).map((e) => (typeof e === 'string' ? e : e.method));

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));
function askHidden(q) {
  return new Promise((resolve) => {
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => {
      if (s.startsWith(q)) write.call(rl, q);
    };
    rl.question(q, (answer) => {
      rl._writeToOutput = write;
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const email = (await ask('Your own email address: ')).trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('not an email address');

// 1. New-account code (the app's sendEmailCode: shouldCreateUser true).
const otp = await call('/auth/v1/otp', { body: { email, create_user: true } });
check(otp.status === 200, 'code requested', authError(otp));
if (otp.status !== 200) process.exit(1);

// 2. Delivery, checked by eye.
console.log('\nCheck the email now. Expected: from no-reply@auth.churntech.com (Shortcut), subject');
console.log('"Your Shortcut sign-in code", heading, a 6-digit code, "The code expires in one hour.",');
console.log('"If you didn\'t ask for this code, you can ignore this email.", and no link.');
const looks = (await ask('Does the email match exactly? (y/n): ')).trim().toLowerCase();
check(looks === 'y', 'email delivered with the approved content (checked by Nemat)');

// 3-5. Verify the code (the app's verifyEmailCode: type email). A token is only issued when the
// access token hook accepts the session.
const code = await askHidden('Code from the email (not shown): ');
check(/^\d{6}$/.test(code), 'code is 6 digits');
const verify = await call('/auth/v1/verify', { body: { email, token: code, type: 'email' } });
const session = verify.json?.access_token ? verify.json : null;
check(verify.status === 200 && !!session, 'code signs in, session issued', authError(verify));
if (!session) {
  rl.close();
  process.exit(1);
}
const c1 = claims(session.access_token);
check(methods(c1).includes('otp') && !methods(c1).includes('password'), 'hook accepted: session method otp', methods(c1).join(','));
check(c1.role === 'authenticated' && c1.aal === 'aal1', 'role authenticated, aal1');
console.log(`      user id ${c1.sub}`);

// 6. Refresh (the hook runs again; amr keeps the original method).
const refresh = await call('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } });
const refreshed = refresh.json?.access_token ? refresh.json : null;
check(refresh.status === 200 && !!refreshed, 'refresh issues a new token', authError(refresh));
const token = refreshed?.access_token ?? session.access_token;
if (refreshed) {
  const c2 = claims(refreshed.access_token);
  check(methods(c2).includes('otp') && c2.sub === c1.sub, 'refreshed token keeps method otp', methods(c2).join(','));
}

// 7. One product API call through PostgREST (pre_request runs first).
const state = await call('/rest/v1/rpc/get_onboarding_state', { body: {}, token });
check(state.status === 200, 'product API: get_onboarding_state', `HTTP ${state.status}`);
if (state.status === 200) {
  const s = state.json ?? {};
  console.log(
    `      age_confirmed ${s.age_confirmed}, has_beta_access ${s.has_beta_access}, waitlisted ${s.waitlisted}, has_profile ${s.has_profile}, suspended ${s.suspended}`,
  );
}

// 8. Passwords: sign-in with any password is refused; a password set through the Auth API is
// discarded by the trigger and cannot sign in.
const pw1 = randomBytes(18).toString('base64url');
const signin1 = await call('/auth/v1/token?grant_type=password', { body: { email, password: pw1 } });
check(signin1.status === 400 && !signin1.json?.access_token, 'password sign-in refused', authError(signin1));
const pw2 = randomBytes(18).toString('base64url');
const setpw = await call('/auth/v1/user', { method: 'PUT', body: { password: pw2 }, token });
console.log(`      PUT /auth/v1/user with a password: ${authError(setpw)}`);
const signin2 = await call('/auth/v1/token?grant_type=password', { body: { email, password: pw2 } });
check(signin2.status === 400 && !signin2.json?.access_token, 'password set through the API cannot sign in', authError(signin2));

// Sign out: revokes this session's refresh tokens. The account stays.
const logout = await call('/auth/v1/logout?scope=global', { token });
check(logout.status === 204, 'signed out', `HTTP ${logout.status}`);

rl.close();
console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}. The account for this address stays on the hosted project.`);
process.exit(failures === 0 ? 0 : 1);
