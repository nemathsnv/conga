#!/usr/bin/env node
// Checks the dashboard upload itself (dist/conga-web-dashboard.zip), not the source: the archive is
// unzipped into an empty folder and served by the local Pages runtime (`wrangler pages dev`, workerd,
// no account, no deployment), with no wrangler.toml, so only what the upload carries counts: its
// _worker.js, _routes.json, _headers and .well-known files. The project settings the dashboard holds
// are passed as bindings. Supabase is a fake on 127.0.0.1 that records every call; nothing leaves
// this machine.
//   cd web && npm run build:dashboard && npm run verify:dashboard
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const ZIP = join(WEB, "dist", "conga-web-dashboard.zip");
const WRANGLER = join(WEB, "node_modules", ".bin", "wrangler");
const ID = "5b321c24-1e1e-4393-9ae1-e6503903430d";
const PROXY_KEY = "k".repeat(64);
const PUBLIC_HOST = "conga.churntech.com";
const ADMIN_HOST = "admin.conga.churntech.com";

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : `: ${detail}`}`);
  if (!ok) failures++;
}

// 1. The archive: exactly the five files, at its root.
const dir = mkdtempSync(join(tmpdir(), "conga-web-upload-"));
execFileSync("unzip", ["-q", ZIP, "-d", dir]);
const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    statSync(p).isDirectory() ? walk(p) : files.push(relative(dir, p));
  }
})(dir);
const expected = [".well-known/apple-app-site-association", ".well-known/assetlinks.json", "_headers", "_routes.json", "_worker.js"];
check("archive holds exactly the five upload files at its root", JSON.stringify(files.sort()) === JSON.stringify(expected), files.join(", "));
const worker = readFileSync(join(dir, "_worker.js"), "utf8");
check("_worker.js is one module with no imports", !/^\s*import\s/m.test(worker) && /^export \{/m.test(worker));
check("_worker.js carries no secret or service-role key", !/service_role|sb_secret_|eyJhbGci/.test(worker));

// 2. A fake Supabase that records calls.
const calls = [];
const card = (id) => ({
  id, kind: "response", playback_id: "PB" + id, caption: "a caption", live_at: "2026-10-16T10:00:00Z",
  author: { id: "a" + id, name: "Putu", username: "putu", photo_path: "a/p.jpg" }, like_count: 2, comment_count: 1, reply_count: 0,
});
const prompt = { id: "p1", text: "Best sunset spot?", place: { name: "Canggu" }, response_count: 0, published_at: null };
const upstream = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls.push({ method: req.method, url: req.url, headers: req.headers, body });
    const send = (status, value) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(value === undefined ? "" : JSON.stringify(value));
    };
    if (req.url === "/rest/v1/rpc/web_video") return send(200, { status: "live", video: card(ID), prompt, more: [], replies: [] });
    if (req.url === "/rest/v1/rpc/web_prompt") return send(200, { status: "empty", prompt });
    if (req.url.startsWith("/functions/v1/web/e/")) return send(204);
    if (req.url === "/functions/v1/admin/me") return send(200, { ok: true, moderator: "fake" });
    return send(404, { error: "fake: unknown path" });
  });
});
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
const SB = `http://127.0.0.1:${upstream.address().port}`;

// 3. The upload, served by the local Pages runtime from a folder with no wrangler.toml.
let port = 0;
let dev = null;
let devLog = "";
function startDev(bindings) {
  port = 18000 + Math.floor(Math.random() * 1000);
  devLog = "";
  const args = ["pages", "dev", dir, "--port", String(port), "--ip", "127.0.0.1", "--compatibility-date", "2026-10-01"];
  if (bindings.length > 0) args.push("--binding", ...bindings);
  dev = spawn(WRANGLER, args, { cwd: dirname(dir), env: { ...process.env, WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] });
  dev.stdout.on("data", (c) => (devLog += c));
  dev.stderr.on("data", (c) => (devLog += c));
}
async function stopDev() {
  if (!dev) return;
  const exited = new Promise((r) => dev.once("exit", r));
  dev.kill("SIGTERM");
  await exited;
  dev = null;
}

function get(host, path, headers = {}, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method, headers: { host, ...headers } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}
async function ready() {
  for (let i = 0; i < 120; i++) {
    try {
      await get(PUBLIC_HOST, "/.well-known/assetlinks.json");
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}
const settle = () => new Promise((r) => setTimeout(r, 300));

try {
  // 3a. Before the dashboard settings exist (a new project's first upload): association files only.
  startDev([]);
  check("unconfigured: the local Pages runtime starts on the unzipped upload", await ready(), devLog.slice(-800));
  const bare = await Promise.all([get(PUBLIC_HOST, `/r/${ID}`), get(PUBLIC_HOST, "/admin"), get(ADMIN_HOST, "/admin")]);
  check("unconfigured: pages and admin answer 503 with nothing in them", bare.every((x) => x.status === 503 && x.body === ""), bare.map((x) => x.status).join(","));
  const bareAasa = await get(PUBLIC_HOST, "/.well-known/apple-app-site-association");
  check("unconfigured: the association files are still served", bareAasa.status === 200 && bareAasa.headers["content-type"] === "application/json");
  check("unconfigured: nothing was sent to Supabase", calls.length === 0, String(calls.length));
  await stopDev();

  // 3b. With the dashboard settings.
  startDev([`SUPABASE_URL=${SB}`, "SUPABASE_ANON_KEY=sb_publishable_test", `WEB_PROXY_KEY=${PROXY_KEY}`, `ADMIN_HOST=${ADMIN_HOST}`, `WEB_BASE_URL=https://${PUBLIC_HOST}`]);
  check("configured: the local Pages runtime starts on the unzipped upload", await ready(), devLog.slice(-800));

  const aasa = await get(PUBLIC_HOST, "/.well-known/apple-app-site-association");
  check("AASA: 200 application/json, no redirect, the file as uploaded",
    aasa.status === 200 && aasa.headers["content-type"] === "application/json" && aasa.body === readFileSync(join(dir, ".well-known/apple-app-site-association"), "utf8"),
    `${aasa.status} ${aasa.headers["content-type"]}`);
  check("AASA: nosniff and noindex", aasa.headers["x-content-type-options"] === "nosniff" && aasa.headers["x-robots-tag"] === "noindex");
  const links = await get(PUBLIC_HOST, "/.well-known/assetlinks.json");
  check("assetlinks.json: 200 application/json", links.status === 200 && links.headers["content-type"] === "application/json", `${links.status} ${links.headers["content-type"]}`);

  calls.length = 0;
  const r = await get(PUBLIC_HOST, `/r/${ID}`, { "cf-connecting-ip": "203.0.113.7" });
  await settle();
  check("/r/{id}: 200 text/html; charset=utf-8", r.status === 200 && r.headers["content-type"] === "text/html; charset=utf-8", `${r.status} ${r.headers["content-type"]}`);
  check("/r/{id}: x-robots-tag noindex", /noindex/.test(r.headers["x-robots-tag"] ?? ""));
  check("/r/{id}: Conga Open Graph title and the shortcut:// app link", r.body.includes('content="Putu on Conga"') && r.body.includes(`href="shortcut://r/${ID}"`));
  check("/r/{id}: no old public name in the page", !/Shortcut|shortcut\.app/.test(r.body));
  const rpc = calls.find((c) => c.url === "/rest/v1/rpc/web_video");
  check("/r/{id}: web_video called with the publishable key only", rpc?.headers.apikey === "sb_publishable_test" && !rpc?.headers.authorization && rpc?.body === JSON.stringify({ p_id: ID }));
  const ev = calls.find((c) => c.url.startsWith("/functions/v1/web/e/link-"));
  check("/r/{id}: web_link_opened forwarded with x-conga-proxy-key and the visitor address",
    ev?.headers["x-conga-proxy-key"] === PROXY_KEY && typeof ev?.headers["x-conga-client-ip"] === "string" && ev.headers["x-conga-client-ip"].length > 0,
    JSON.stringify(ev?.headers ?? null));

  const p = await get(PUBLIC_HOST, "/p/p1");
  check("/p/{id}: 200, the empty prompt page", p.status === 200 && p.body.includes("Best sunset spot?"));
  const i = await get(PUBLIC_HOST, "/i/PUTU-7K2");
  check("/i/{code}: 200, You're invited to Conga", i.status === 200 && i.body.includes("You're invited to Conga") && i.body.includes('href="shortcut://i/PUTU-7K2"'));
  const u = await get(PUBLIC_HOST, "/u/lena.hart");
  check("/u/{name}: the profile sheet with its app link", u.body.includes('href="shortcut://u/lena.hart"'));
  const sig = await get(PUBLIC_HOST, "/e/signin", {}, "POST");
  check("/e/signin: 204", sig.status === 204);
  const none = await get(PUBLIC_HOST, "/nothing-here");
  check("unknown path: 404 unavailable page", none.status === 404 && none.headers["content-type"] === "text/html; charset=utf-8");
  const adminOnPublic = await get(PUBLIC_HOST, "/admin");
  check("/admin on the public host: not the admin (unavailable page, 404)", adminOnPublic.status === 404 && !adminOnPublic.body.includes("Conga moderation"));

  const shell = await get(ADMIN_HOST, "/admin");
  check("admin host /admin: 200 text/html, Conga moderation", shell.status === 200 && /^text\/html/.test(shell.headers["content-type"] ?? "") && shell.body.includes("<title>Conga moderation</title>"));
  check("admin host /admin: nonce CSP", /script-src[^;]*'nonce-/.test(shell.headers["content-security-policy"] ?? ""), shell.headers["content-security-policy"]);
  check("admin host /admin: the sign-in page talks to the configured Supabase URL", shell.body.includes(SB));
  calls.length = 0;
  const me = await get(ADMIN_HOST, "/admin/me", { authorization: "Bearer test-token", cookie: "a=b", "x-other": "1" });
  const meCall = calls.find((c) => c.url === "/functions/v1/admin/me");
  check("admin host /admin/me: proxied to the admin function, JSON back", me.status === 200 && /^application\/json/.test(me.headers["content-type"] ?? ""));
  check("admin host /admin/me: only Authorization goes up (no cookie, no other header)", meCall?.headers.authorization === "Bearer test-token" && !meCall?.headers.cookie && !meCall?.headers["x-other"]);
  const pageOnAdmin = await get(ADMIN_HOST, `/r/${ID}`);
  check("admin host /r/{id}: 404 (no pages on the admin host)", pageOnAdmin.status === 404);
} finally {
  await stopDev();
  upstream.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nverify-dashboard-package: all checks passed" : `\nverify-dashboard-package: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
