// Local rehearsal of Test C1 (scripts/c1-retire.mjs) against a fake Mux. LOCAL STACK ONLY.
// Run it through scripts/c1-rehearsal.sh, which serves the Edge Functions with fake-only settings
// (MUX_API_BASE pointing here, fake Mux credentials) and sets the environment below.
//
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (the local stack), FAKE_MUX_PORT
//
// For each scenario: a fresh member, the C1 script run as that member, then the ledger (service
// role, local) and every call the fake Mux received are checked:
//   waiting    Mux reports the oldest URL still waiting: it is cancelled and a fourth URL minted;
//   timed_out  Mux reports it timed out: its slot is freed without a cancel call;
//   asset      Mux reports bytes arrived (asset_created): nothing is cancelled, the script stops.
// In every scenario: no asset is created, nothing is ever sent to an upload URL, at most 3 unused
// URLs are held, and the script's output contains no upload URL, token or key.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PORT = Number(process.env.FAKE_MUX_PORT ?? '55691');
if (!API || !ANON || !SERVICE) throw new Error('set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY');
if (!['127.0.0.1', 'localhost'].includes(new URL(API).hostname)) throw new Error('local stack only');
const run = Date.now().toString(36);

// ---------------------------------------------------------------------------
// Fake Mux: uploads are created waiting; the first upload of a scenario reports `oldest`.
const mux = { calls: [], uploads: new Map(), seq: 0, oldest: 'waiting', first: null, assetsCreated: 0, bytesSent: 0 };
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const { pathname } = new URL(req.url, 'http://fake');
    mux.calls.push({ method: req.method, path: pathname });
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (!/^Basic /.test(req.headers.authorization ?? '')) return send(401, { error: 'no auth' });
    if (req.method === 'POST' && pathname === '/video/v1/uploads') {
      const id = `upc1${run}n${++mux.seq}`;
      mux.uploads.set(id, 'waiting');
      if (!mux.first) mux.first = id;
      return send(201, { data: { id, url: `https://storage.example.invalid/upload/${id}?sig=secret${id}`, status: 'waiting', timeout: 3600 } });
    }
    const read = pathname.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)$/);
    if (req.method === 'GET' && read && mux.uploads.has(read[1])) {
      const id = read[1];
      const status = id === mux.first && mux.oldest !== 'waiting' && mux.uploads.get(id) === 'waiting'
        ? (mux.oldest === 'asset' ? 'asset_created' : mux.oldest)
        : mux.uploads.get(id);
      return send(200, { data: { id, status, ...(status === 'asset_created' ? { asset_id: `as${id}` } : {}) } });
    }
    const cancel = pathname.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)\/cancel$/);
    if (req.method === 'PUT' && cancel && mux.uploads.has(cancel[1])) {
      if (mux.uploads.get(cancel[1]) !== 'waiting') return send(400, { error: { type: 'invalid_parameters' } });
      mux.uploads.set(cancel[1], 'cancelled');
      return send(200, { data: { id: cancel[1], status: 'cancelled' } });
    }
    if (pathname.startsWith('/upload/')) mux.bytesSent += 1; // an upload URL: must never happen
    if (req.method === 'POST' && pathname === '/video/v1/assets') mux.assetsCreated += 1;
    return send(404, { error: 'fake mux: no route' });
  });
});
await new Promise((r) => server.listen(PORT, '0.0.0.0', r));

// ---------------------------------------------------------------------------
async function rest(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: { apikey: opts.key ?? SERVICE, Authorization: `Bearer ${opts.token ?? opts.key ?? SERVICE}`, 'Content-Type': 'application/json', ...(opts.prefer ? { Prefer: opts.prefer } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}
const created = [];
async function member(name) {
  const email = `c1-${run}-${name}@example.com`;
  const u = await rest('/auth/v1/admin/users', { method: 'POST', body: { email, email_confirm: true } });
  if (u.status !== 200) throw new Error(`create member: ${u.status}`);
  const id = u.json.id;
  created.push(id);
  const link = await rest('/auth/v1/admin/generate_link', { method: 'POST', body: { type: 'magiclink', email } });
  const v = await rest('/auth/v1/verify', { method: 'POST', key: ANON, body: { type: 'email', email, token: link.json.email_otp } });
  if (v.status !== 200) throw new Error(`sign in: ${v.status}`);
  await rest('/rest/v1/profiles', { method: 'POST', body: { id, name, username: `c1${name}${run}`.slice(0, 24) } });
  const now = new Date().toISOString();
  await rest(`/rest/v1/accounts?id=eq.${id}`, { method: 'PATCH', body: { age_confirmed_at: now, public_disclosure_ack_at: now } });
  return { id, token: v.json.access_token };
}
const ledger = async (id) => (await rest(`/rest/v1/video_uploads?account_id=eq.${id}&select=upload_id,status,cancelled_at,expires_at&order=created_at`)).json;

function runC1(token) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'c1-retire.mjs')], {
      env: { ...process.env, C1_SUPABASE_URL: API, C1_ANON_KEY: ANON, C1_ACCESS_TOKEN: token, C1_GAP_SECONDS: '16' },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
}

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures += 1;
};

async function scenario(name, oldest, expect) {
  console.log(`\n== ${name}`);
  Object.assign(mux, { calls: [], oldest, first: null });
  const m = await member(name);
  const { code, out } = await runC1(m.token);
  const report = (() => { try { return JSON.parse(out.slice(out.indexOf('{'))); } catch { return null; } })();
  const rows = await ledger(m.id);
  const ids = rows.map((r) => r.upload_id);
  const [u1, u2, u3, u4] = ids;
  const mutating = mux.calls.filter((c) => c.method !== 'GET');
  const reads = mux.calls.filter((c) => c.method === 'GET').map((c) => c.path.split('/').pop());
  const cancels = mux.calls.filter((c) => c.method === 'PUT').map((c) => c.path.split('/')[4]);
  const holding = rows.filter((r) => ['active', 'cancelling'].includes(r.status) && Date.parse(r.expires_at) > Date.now()).length;

  check('the output has no upload URL, token or key', !/storage\.example|sig=|https:\/\/|eyJ|sb_secret|sb_publishable/.test(out) && !out.includes(m.token));
  check('no byte was sent to any upload URL, and no asset was created', mux.bytesSent === 0 && mux.assetsCreated === 0);
  check('at most 3 unused URLs are held', holding <= 3);
  check('call 4 (all URLs under 15 s old): 429 upload_limit_active, with no Mux call for it', report?.calls?.[3]?.status === 429 && report.calls[3].error === 'upload_limit_active' && reads.length <= 1);
  if (expect === 'retired') {
    check('the script passes', code === 0 && report?.ok === true);
    check('ledger: U1 cancelled with cancelled_at; U2 to U4 active', rows.length === 4 && rows[0].status === 'cancelled' && !!rows[0].cancelled_at && rows.slice(1).every((r) => r.status === 'active'));
    check('Mux was asked about U1 only, before any change', reads.length === 1 && reads[0] === u1);
    check(oldest === 'waiting' ? 'exactly one cancel, of U1' : 'no cancel call (Mux already reported it ended)', oldest === 'waiting' ? cancels.length === 1 && cancels[0] === u1 : cancels.length === 0);
    check('Mux: 4 uploads created, nothing else changed', mutating.filter((c) => c.method === 'POST').length === 4 && mutating.length === 4 + cancels.length);
    check('the fifth call returned U4', report?.calls?.[4]?.uploadId === u4 && ![u1, u2, u3].includes(u4));
  } else {
    check('the script stops and fails at call 5 (nothing retired)', code === 1 && report?.ok === false && report.calls?.[4]?.status === 429);
    check('ledger: U1 back to active, nothing cancelled, no fourth URL', rows.length === 3 && rows.every((r) => r.status === 'active'));
    check('no cancel call', cancels.length === 0);
  }
}

try {
  await scenario('waiting', 'waiting', 'retired');
  await scenario('timedout', 'timed_out', 'retired');
  await scenario('asset', 'asset', 'kept');
  // A call outside the rules is refused before anything is sent.
  const refused = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'c1-retire.mjs')], {
      env: { ...process.env, C1_SUPABASE_URL: 'https://picvoavfxnajfjkqawju.supabase.co', C1_ANON_KEY: 'x', C1_ACCESS_TOKEN: 'x', C1_HOSTED_REF: '', C1_APPROVED_BY_NEMAT: '' },
    });
    let out = '';
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
  });
  console.log('\n== guards');
  check('a hosted URL without the explicit approval flags is refused before any request', refused.code === 2 && /not a local stack/.test(refused.out));
  const short = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'c1-retire.mjs')], {
      env: { ...process.env, C1_SUPABASE_URL: API, C1_ANON_KEY: 'x', C1_ACCESS_TOKEN: 'x', C1_GAP_SECONDS: '10' },
    });
    child.on('close', (code) => resolve(code));
  });
  check('a wait shorter than the server\'s 15 s minimum is refused', short === 2);
} finally {
  for (const id of created) {
    await rest(`/rest/v1/profiles?id=eq.${id}`, { method: 'DELETE' });
    await rest(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
  }
  server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nC1 rehearsal passed');
process.exit(failures ? 1 : 0);
