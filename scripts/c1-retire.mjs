// Test C1 (BETA-READINESS.md section 17.4): the stage 2 retirement of an unused upload URL, driven
// directly through mux-create-upload as one member. No app, no recording, no Post Review, and no
// byte is ever sent to an upload URL, so Mux creates no asset.
//
//   C1_SUPABASE_URL=...   the project (local: http://127.0.0.1:<port>)
//   C1_ANON_KEY=...       its anon key (the apikey header)
//   C1_ACCESS_TOKEN=...   the member's (T1's) session; never printed
//   [C1_GAP_SECONDS=20]   wait before the retiring call; at least 16 (the server's minimum age is 15 s)
//   node scripts/c1-retire.mjs
//
// Sequence (the member must hold no unused URL, reservation or cancellation at the start):
//   1-3. three URLs, back to back: 200 each (U1, U2, U3 now hold the member's 3 slots);
//   4.   at once, while all three are under 15 s old: 429 upload_limit_active (none is old enough to
//        retire, so Mux is not called);
//   wait until U1 is C1_GAP_SECONDS old;
//   5.   200 with U4: U1, the oldest, was retired (Mux asked for its status, then to cancel it,
//        only if it was still waiting), and its slot went to U4.
// It stops at the first answer that differs and exits 1. It never prints an upload URL (a bearer
// credential for that upload), the token or any key: only upload ids, statuses and timings.
//
// Local stacks only (127.0.0.1, localhost). A hosted project needs C1_HOSTED_REF=<project ref>
// matching the URL and C1_APPROVED_BY_NEMAT=yes; neither is set by any script in this repository.

const URL_ = process.env.C1_SUPABASE_URL ?? '';
const ANON = process.env.C1_ANON_KEY ?? '';
const TOKEN = process.env.C1_ACCESS_TOKEN ?? '';
const GAP_S = Number(process.env.C1_GAP_SECONDS ?? '20');

function fail(message) {
  console.error(`C1 refused: ${message}`);
  process.exit(2);
}
if (!URL_ || !ANON || !TOKEN) fail('set C1_SUPABASE_URL, C1_ANON_KEY and C1_ACCESS_TOKEN');
if (!Number.isFinite(GAP_S) || GAP_S < 16) fail('C1_GAP_SECONDS must be at least 16 (the server retires only URLs over 15 s old)');
const host = new URL(URL_).hostname;
const local = ['127.0.0.1', 'localhost'].includes(host);
if (!local) {
  const ref = process.env.C1_HOSTED_REF ?? '';
  if (!ref || host !== `${ref}.supabase.co` || process.env.C1_APPROVED_BY_NEMAT !== 'yes') fail(`${host} is not a local stack, and the hosted run is not enabled`);
}

const endpoint = `${URL_.replace(/\/$/, '')}/functions/v1/mux-create-upload`;
const calls = [];
const t0 = Date.now();

/** One mint. Returns what may be printed: status, upload id, error code, timing. */
async function mint(n) {
  const started = Date.now();
  let res;
  try {
    res = await fetch(endpoint, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${TOKEN}` } });
  } catch (e) {
    const call = { n, status: 0, error: `network: ${e?.name ?? 'error'}`, at_ms: started - t0, ms: Date.now() - started };
    calls.push(call);
    return call;
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const call = { n, status: res.status, at_ms: started - t0, ms: Date.now() - started };
  if (res.status === 200) {
    call.uploadId = typeof body?.uploadId === 'string' ? body.uploadId : null;
    // Checked, then dropped: the URL itself is never kept or printed.
    call.urlShape = typeof body?.uploadUrl === 'string' && body.uploadUrl.startsWith('https://') ? 'https' : 'unexpected';
    call.keys = body && typeof body === 'object' ? Object.keys(body).sort().join(',') : '';
  } else {
    call.error = typeof body?.error === 'string' ? body.error : 'unknown';
    call.retryAfter = res.headers.get('Retry-After');
  }
  calls.push(call);
  return call;
}

function report(ok, reason) {
  console.log(JSON.stringify({ test: 'C1', ok, reason, target: local ? 'local' : 'hosted', gap_s: GAP_S, calls }, null, 2));
  process.exit(ok ? 0 : 1);
}
const okMint = (c) => c.status === 200 && typeof c.uploadId === 'string' && /^[A-Za-z0-9]{1,128}$/.test(c.uploadId) && c.urlShape === 'https' && c.keys === 'uploadId,uploadUrl';

const minted = [];
for (const n of [1, 2, 3]) {
  const c = await mint(n);
  if (!okMint(c)) report(false, `call ${n}: expected 200 with an upload id and an https URL`);
  minted.push(c);
}
if (new Set(minted.map((c) => c.uploadId)).size !== 3) report(false, 'calls 1-3 did not give three different uploads');

// 4. Within the minimum age: refused without touching Mux. Skipped (not run) if the first three took
//    so long that U1 might already be old enough, so this step can never cause a cancellation.
const firstAt = minted[0].at_ms;
if (Date.now() - t0 - firstAt < 12_000) {
  const c = await mint(4);
  if (c.status !== 429 || c.error !== 'upload_limit_active') report(false, 'call 4: expected 429 upload_limit_active (three unused URLs, none old enough to retire)');
} else {
  calls.push({ n: 4, skipped: 'calls 1-3 took over 12 s; the no-retirement check was not run' });
}

// Wait until U1 is GAP_S old (counted from before its request, so the server's age is at least that).
const waitMs = firstAt + GAP_S * 1000 - (Date.now() - t0);
if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

const fifth = await mint(5);
if (!okMint(fifth)) report(false, 'call 5: expected 200 (U1 retired, its slot given to a new URL)');
if (minted.some((c) => c.uploadId === fifth.uploadId)) report(false, 'call 5 returned an upload already handed out');
report(true, 'U1 should now be cancelled (ledger and Mux), U2 to U4 active; verify with the read-only checks');
