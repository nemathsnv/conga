// Local fake Mux for Android device sessions (scripts/android-device/README.md). Never talks to Mux.
//   http  :55699  the Mux API subset the Edge functions call (via host.docker.internal)
//   https :55698  the direct-upload PUT target handed to the app (reached through adb reverse)
// <work>/fakemux/mode: "ok" (default), "fail500" (the PUT answers 500) or "hang" (it never answers).
// A finished upload becomes a ready asset whose playback id is one of the seed's spike assets, so the
// response plays from stream.mux.com and no Mux asset is ever created.
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

const dir = process.argv[2];
const uploads = new Map();
const PLAYBACK = '25Vygqw8O8RgkH6nYYN7wFiX002mo01keZAL5EAj7eHfE';
let n = 0;
const mode = () => {
  try {
    return fs.readFileSync(path.join(dir, 'mode'), 'utf8').trim();
  } catch {
    return 'ok';
  }
};
const log = (...a) => console.log(new Date().toISOString(), ...a);
const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    log('API', req.method, req.url);
    let m;
    if (req.method === 'POST' && req.url === '/video/v1/uploads') {
      const id = `fakeup${Date.now()}${n++}`;
      const passthrough = JSON.parse(body || '{}')?.new_asset_settings?.passthrough ?? '';
      uploads.set(id, { id, status: 'waiting', passthrough });
      return send(res, 201, { data: { id, url: `https://127.0.0.1:55698/put/${id}`, status: 'waiting' } });
    }
    if ((m = req.url.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)\/cancel$/))) {
      const u = uploads.get(m[1]);
      if (u) u.status = 'cancelled';
      return send(res, 200, { data: u ?? {} });
    }
    if ((m = req.url.match(/^\/video\/v1\/uploads\/([A-Za-z0-9]+)$/))) {
      const u = uploads.get(m[1]);
      if (!u) return send(res, 404, { error: { type: 'not_found' } });
      return send(res, 200, { data: { id: u.id, status: u.status, url: '', ...(u.asset_id ? { asset_id: u.asset_id } : {}) } });
    }
    if ((m = req.url.match(/^\/video\/v1\/assets\/([A-Za-z0-9]+)$/))) {
      const u = [...uploads.values()].find((x) => x.asset_id === m[1]);
      if (!u) return send(res, 404, { error: { type: 'not_found' } });
      return send(res, 200, { data: { id: u.asset_id, status: 'ready', duration: 5, passthrough: u.passthrough, playback_ids: [{ id: PLAYBACK, policy: 'public' }] } });
    }
    if (req.method === 'DELETE') return send(res, 204, {});
    send(res, 404, { error: { type: 'not_found' } });
  });
}).listen(55699, () => log('api on 55699'));

https.createServer({ key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem')) }, (req, res) => {
  const m = req.url.match(/^\/put\/([A-Za-z0-9]+)$/);
  const md = mode();
  log('PUT', req.method, req.url, 'mode', md, 'length', req.headers['content-length']);
  if (md === 'hang') return;
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (md === 'fail500') {
      res.writeHead(500);
      return res.end('fake failure');
    }
    const u = m && uploads.get(m[1]);
    if (!u) {
      res.writeHead(404);
      return res.end();
    }
    const file = path.join(dir, 'uploads', `${u.id}.mp4`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.concat(chunks));
    u.status = 'asset_created';
    u.asset_id = `fakeasset${u.id.slice(6)}`;
    log('saved', file, fs.statSync(file).size, 'bytes');
    res.writeHead(200);
    res.end();
  });
}).listen(55698, () => log('upload on 55698'));
