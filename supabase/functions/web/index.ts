// The web player for shared links (SPEC.md Section 16; boards SF-Web, SF-Web-Signin,
// LV-WebUnavailable, LV-WebEmpty). Server-rendered HTML, no account, no JavaScript framework:
//   /r/{id}   a response or video reply, with "N more responses" and the reply room
//   /p/{id}   a prompt: its newest response, or the empty state
//   /i/{code} an invite link: opens the app (shortcut://i/{code}) or the store page
//   /u/{name} profiles have no web page in v1: the sign-in sheet
// Pages are noindex during the beta and carry link previews (Open Graph). Every interaction
// opens the sign-in sheet. Blocking works only in the app; a visitor can watch public content.
import { adminClient } from "../_shared/supabase.ts";

const APP_SCHEME = "shortcut://";
const STORE_URL = Deno.env.get("STORE_URL") ?? "https://shortcut.app";
const WAITLIST_URL = Deno.env.get("WAITLIST_URL") ?? STORE_URL;

type Card = {
  id: string;
  kind: "response" | "reply";
  playback_id: string | null;
  caption: string | null;
  live_at: string | null;
  author: { id: string; name: string; username: string; photo_path: string | null };
  like_count: number;
  comment_count: number;
  reply_count: number;
};
type Prompt = { id: string; text: string; place: { name: string } | null; response_count: number; published_at: string | null };
type WebVideo = { status: "live"; video: Card; prompt: Prompt; more: Card[]; replies: Card[] } | { status: "unavailable" } | { status: "empty"; prompt: Prompt };

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
function thumb(pb: string | null, w = 540, h = 960): string {
  return pb ? `https://image.mux.com/${pb}/thumbnail.jpg?time=1&width=${w}&height=${h}&fit_mode=crop` : "";
}
function hls(pb: string): string {
  return `https://stream.mux.com/${pb}.m3u8`;
}
function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
function avatar(path: string | null, size: number, extra = ""): string {
  const url = path ? `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/avatars/${path}` : "";
  return url
    ? `<img src="${esc(url)}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;${extra}">`
    : `<span style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;background:#F2F2F7;${extra}"></span>`;
}

const SHEET = `
<div id="dim" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9" onclick="hideSheet()"></div>
<section id="sheet" style="display:none;position:fixed;left:0;right:0;bottom:0;background:#FFFFFF;color:#1C1C1E;border-radius:14px 14px 0 0;padding:6px 16px 34px;z-index:10">
<div style="margin:0 auto;width:36px;height:5px;border-radius:3px;background:#D1D1D6"></div>
<div style="margin-top:18px;text-align:center"><h2 style="margin:0;font:700 22px -apple-system,'SF Pro Display','Helvetica Neue',sans-serif;letter-spacing:-0.4px">Join the conversation</h2><p style="margin:8px 0 0;font-size:15px;line-height:1.42;color:#6E6E73">Anyone can watch. Responding, replying, liking and following need an account in the app.</p></div>
<a id="open-app" href="${APP_SCHEME}" style="margin-top:22px;height:52px;border-radius:26px;background:#1C1C1E;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;text-decoration:none">Open in the app</a>
<a href="${STORE_URL}" style="margin-top:10px;height:52px;border-radius:26px;background:#F2F2F7;color:#1C1C1E;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;text-decoration:none">Get the app</a>
<div style="margin-top:14px;text-align:center;font-size:13px;line-height:1.4;color:#8A8A8E">Shortcut is in closed beta. No invite yet? <a href="${WAITLIST_URL}" style="color:#1C1C1E;font-weight:600;text-decoration:none">Join the waitlist</a></div>
</section>
<script>
function showSheet(){document.getElementById('dim').style.display='block';document.getElementById('sheet').style.display='block';}
function hideSheet(){document.getElementById('dim').style.display='none';document.getElementById('sheet').style.display='none';}
</script>`;

function page(title: string, body: string, og: { title: string; description: string; image?: string; url: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(og.title)}">
<meta property="og:description" content="${esc(og.description)}">
${og.image ? `<meta property="og:image" content="${esc(og.image)}">` : ""}
<meta property="og:url" content="${esc(og.url)}">
<meta property="og:type" content="video.other">
<meta name="twitter:card" content="summary_large_image">
<style>
html,body{margin:0;height:100%;background:#000;color:#fff;font-family:-apple-system,'SF Pro Text','Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}
.frame{position:relative;max-width:430px;min-height:100vh;margin:0 auto;overflow:hidden;background:#000}
.glass{background:rgba(28,28,30,0.38);-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%);border:0.5px solid rgba(255,255,255,0.18)}
.act{width:48px;border:none;background:none;color:#fff;display:flex;flex-direction:column;align-items:center;gap:2px;padding:0;font:600 12px -apple-system,'SF Pro Text',sans-serif;text-shadow:0 1px 2px rgba(0,0,0,0.35);cursor:pointer}
.bar{position:absolute;left:0;right:0;top:0;height:52px;padding:0 12px 0 16px;display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.55);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);z-index:2}
.foot{position:absolute;left:0;right:0;bottom:0;padding:14px 16px 30px;background:rgba(0,0,0,0.78);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);display:flex;align-items:center;gap:12px;z-index:2}
.pillw{flex-shrink:0;height:36px;padding:0 16px;border-radius:18px;background:#fff;color:#000;display:flex;align-items:center;font-size:14px;font-weight:600;text-decoration:none;border:none;cursor:pointer}
video{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;background:#000}
</style>
</head>
<body><div class="frame">${body}${SHEET}</div></body>
</html>`;
}

const BAR = `<div class="bar"><span style="font:700 17px -apple-system,'SF Pro Display','Helvetica Neue',sans-serif;letter-spacing:-0.3px">Shortcut</span><button class="pillw" style="height:32px;padding:0 14px" onclick="showSheet()">Open in app</button></div>`;
const FOOT = `<div class="foot"><span style="flex-grow:1;min-width:0;font-size:13px;line-height:1.35;color:rgba(255,255,255,0.8)">Watch freely. Sign in to respond, reply, like or follow.</span><button class="pillw" onclick="showSheet()">Sign in</button></div>`;

function videoPage(data: Extract<WebVideo, { status: "live" }>, url: string): string {
  const v = data.video;
  const pb = v.playback_id ?? "";
  const faces = data.more.slice(0, 3).map((m, i) => avatar(m.author.photo_path, 24, `border:1.5px solid #1A1A1A;${i ? "margin-left:-7px" : ""}`)).join("");
  const moreCount = data.prompt.response_count - 1;
  const body = `
${BAR}
<div style="position:relative;height:100vh;min-height:640px">
<video id="v" playsinline autoplay muted loop poster="${esc(thumb(pb))}"></video>
<div style="position:absolute;left:0;right:0;top:0;height:200px;background:linear-gradient(rgba(0,0,0,0.5),rgba(0,0,0,0))"></div>
<div style="position:absolute;left:0;right:0;bottom:0;height:420px;background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,0.62) 70%)"></div>
<div class="glass" style="position:absolute;left:16px;top:64px;max-width:286px;padding:9px 14px 10px 12px;border-radius:16px;font-size:14px;font-weight:600;letter-spacing:-0.1px;line-height:1.28">
<span style="display:block">${esc(data.prompt.text)}</span><span style="display:block;margin-top:2px;font-size:12px;font-weight:400;color:rgba(255,255,255,0.72)">${data.prompt.response_count} ${data.prompt.response_count === 1 ? "response" : "responses"}</span></div>
<div style="position:absolute;right:10px;top:380px;display:flex;flex-direction:column;gap:18px;align-items:center">
<button class="act" onclick="showSheet()" aria-label="Like, ${v.like_count}"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.8-7.5 10.4-7.5 10.4z"/></svg>${v.like_count || ""}</button>
<button class="act" onclick="showSheet()" aria-label="Comments, ${v.comment_count}"><svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 4c-4.6 0-8 3-8 6.8 0 2 1 3.9 2.7 5.1L6 20l4-1.8c.6.1 1.3.2 2 .2 4.6 0 8-3 8-6.8S16.6 4 12 4z"/></svg>${v.comment_count || ""}</button>
<button class="act" onclick="showSheet()" aria-label="Video replies, ${v.reply_count}"><svg width="29" height="29" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-2.5v9L16 14z"/></svg>${v.reply_count || ""}</button>
<button class="act" onclick="navigator.share?navigator.share({url:location.href}):showSheet()" aria-label="Share"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11.5"/><path d="m8 7.5 4-4 4 4"/><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></button>
</div>
<div style="position:absolute;left:16px;right:78px;top:516px">
<div style="display:flex;align-items:center;gap:10px"><span style="display:flex;align-items:center;gap:10px">${avatar(v.author.photo_path, 34, "border:1px solid rgba(255,255,255,0.5)")}<span style="font-size:16px;font-weight:600;letter-spacing:-0.2px">${esc(v.author.name)}</span></span>
<button onclick="showSheet()" style="height:28px;padding:0 12px;border-radius:14px;border:1px solid rgba(255,255,255,0.55);background:none;color:#fff;font:600 13px -apple-system,'SF Pro Text',sans-serif;cursor:pointer">Follow</button></div>
<div style="margin-top:8px;font-size:13px;color:rgba(255,255,255,0.82)">${ago(v.live_at)}</div>
${v.caption ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.38;letter-spacing:-0.1px">${esc(v.caption)}</p>` : ""}
</div>
<div style="position:absolute;left:16px;right:16px;top:664px;display:flex;align-items:center;justify-content:space-between">
${moreCount > 0 && data.more.length ? `<a href="/functions/v1/web/r/${data.more[0].id}" style="display:flex;align-items:center;gap:8px;height:44px;font-size:14px;font-weight:500;color:rgba(255,255,255,0.92);text-decoration:none"><span style="display:flex">${faces}</span>${moreCount} more ${moreCount === 1 ? "response" : "responses"}</a>` : "<span></span>"}
<button class="glass" onclick="showSheet()" style="height:36px;padding:0 14px;border-radius:18px;display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:#fff;cursor:pointer">${v.kind === "reply" ? "Reply" : "Respond"}</button>
</div>
<div style="position:absolute;left:0;right:0;top:721px;height:2px;background:rgba(255,255,255,0.22)"><div id="bar" style="width:0;height:2px;background:rgba(255,255,255,0.9)"></div></div>
</div>
${FOOT}
<script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
<script>
(function(){var v=document.getElementById('v'),src=${JSON.stringify(pb ? hls(pb) : "")};if(!src)return;
if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=src;}else if(window.Hls&&Hls.isSupported()){var h=new Hls({maxBufferLength:4});h.loadSource(src);h.attachMedia(v);}
v.addEventListener('timeupdate',function(){if(v.duration)document.getElementById('bar').style.width=(v.currentTime/v.duration*100)+'%';});
v.addEventListener('click',function(){v.muted=false;v.play();});})();
</script>`;
  return page(`${v.author.name} · ${data.prompt.text}`, body, {
    title: `${v.author.name} on Shortcut`,
    description: v.caption ? `${data.prompt.text} — "${v.caption}"` : data.prompt.text,
    image: thumb(pb, 720, 1280),
    url,
  });
}

function unavailablePage(url: string): string {
  const body = `
${BAR}
<div style="position:relative;height:100vh;min-height:640px;background:#0E0E10">
<div style="position:absolute;inset:0;background:rgba(10,10,12,0.6)"></div>
<div style="position:absolute;left:32px;right:32px;top:290px;display:flex;flex-direction:column;align-items:center;text-align:center">
<span class="glass" style="width:56px;height:56px;border-radius:28px;display:flex;align-items:center;justify-content:center"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-2.5v9L16 14z"/></svg></span>
<h1 style="margin:18px 0 0;font:600 22px -apple-system,'SF Pro Display','Helvetica Neue',sans-serif;letter-spacing:-0.4px">This video isn't available</h1>
<p style="margin:8px 0 0;font-size:15px;line-height:1.42;color:rgba(255,255,255,0.75)">It was deleted or removed.</p>
<button class="pillw" style="margin-top:24px;height:44px;padding:0 20px;border-radius:22px;font-size:15px" onclick="showSheet()">See more on Shortcut</button>
</div></div>
${FOOT}`;
  return page("Shortcut", body, { title: "Shortcut", description: "This video isn't available.", url });
}

function emptyPage(prompt: Prompt, url: string): string {
  const body = `
${BAR}
<div style="position:relative;height:100vh;min-height:640px;background:#0E0E10">
<div style="position:absolute;inset:0;background:rgba(10,10,12,0.6)"></div>
<div style="position:absolute;left:28px;right:28px;top:190px;display:flex;flex-direction:column;align-items:center;text-align:center">
<div style="font-size:13px;font-weight:500;color:rgba(255,255,255,0.72)">${prompt.place ? esc(prompt.place.name) + " · " : ""}New prompt</div>
<h1 style="margin:12px 0 0;font:700 32px/1.12 -apple-system,'SF Pro Display','Helvetica Neue',sans-serif;letter-spacing:-0.8px">${esc(prompt.text)}</h1>
<span style="margin-top:34px;display:flex;align-items:center;justify-content:center;width:62px;height:82px;border-radius:12px;border:1.5px dashed rgba(255,255,255,0.75);box-sizing:border-box"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg></span>
<div style="margin-top:14px;font-size:16px;color:rgba(255,255,255,0.86)">No responses yet.</div>
<button class="pillw" style="margin-top:20px;height:50px;padding:0 26px;border-radius:25px;font-size:16px" onclick="showSheet()">Respond in the app</button>
</div></div>
${FOOT}`;
  return page(prompt.text, body, { title: prompt.text, description: "No responses yet. Respond in the app.", url });
}

function invitePage(code: string, url: string): string {
  const body = `
${BAR}
<div style="position:relative;height:100vh;min-height:640px;background:#0E0E10">
<div style="position:absolute;left:28px;right:28px;top:190px;display:flex;flex-direction:column;align-items:center;text-align:center">
<h1 style="margin:12px 0 0;font:700 28px/1.12 -apple-system,'SF Pro Display','Helvetica Neue',sans-serif;letter-spacing:-0.6px">You're invited to Shortcut</h1>
<a href="${APP_SCHEME}i/${esc(code)}" class="pillw" style="margin-top:24px;height:50px;padding:0 26px;border-radius:25px;font-size:16px">Open in the app</a>
<a href="${STORE_URL}" style="margin-top:12px;font-size:15px;color:rgba(255,255,255,0.86)">Get the app</a>
</div></div>
<script>setTimeout(function(){location.href=${JSON.stringify(`${APP_SCHEME}i/${code}`)};},300);</script>`;
  return page("Shortcut invite", body, { title: "You're invited to Shortcut", description: "Open the invite in the app.", url });
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60", "X-Robots-Tag": "noindex" } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/web/, "").replace(/^\/web/, "");
  const m = /^\/(r|p|i|u)\/([^/]+)\/?$/.exec(path);
  if (!m) return html(unavailablePage(url.toString()), 404);
  const [, kind, id] = m;
  const admin = adminClient();
  if (kind === "i") return html(invitePage(decodeURIComponent(id), url.toString()));
  if (kind === "u") return html(unavailablePage(url.toString()));
  const rpc = kind === "r" ? "web_video" : "web_prompt";
  const { data, error } = await admin.rpc(rpc, { p_id: id });
  if (error) return html(unavailablePage(url.toString()), 500);
  const result = data as WebVideo;
  if (result.status === "live") return html(videoPage(result, url.toString()));
  if (result.status === "empty") return html(emptyPage(result.prompt, url.toString()));
  return html(unavailablePage(url.toString()), 404);
});
