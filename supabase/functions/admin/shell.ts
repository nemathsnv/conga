// The admin's one static page: it holds no data. It signs the moderator in (Supabase Auth email
// code, with the public anon key) and then asks the function for each view with the access token
// in an Authorization header, never a cookie. Everything the function sends back is rendered on
// the server and escaped (views.ts); this script only places it in the page and posts the forms.
import { esc } from "./html.ts";

export type ShellConfig = {
  /** The project's public anon key (not a secret: it ships in the app). */
  anonKey: string;
  /** Where Auth lives for the browser; empty = the page's own origin (the project's functions domain). */
  authBase: string;
  /** Where the web player lives; empty = next to this function. */
  webBase: string;
};

function jsonForScript(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1c1c1e;--mut:#6e6e73;--line:#d1d1d6;--card:#f7f7f9;--bad:#b3261e;--warn:#9a6700;--acc:#0a5cd6}
@media (prefers-color-scheme:dark){:root{--bg:#161618;--fg:#f2f2f7;--mut:#a1a1a6;--line:#3a3a3c;--card:#1f1f22;--bad:#ff8a80;--warn:#e0b341;--acc:#6aa5ff}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif}
header{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;padding:10px 20px;border-bottom:1px solid var(--line)}
header b{font-size:16px}
nav a{margin-right:14px;color:var(--fg);text-decoration:none;padding:4px 0;border-bottom:2px solid transparent}
nav a.on{border-bottom-color:var(--fg);font-weight:600}
main{max-width:1000px;margin:0 auto;padding:16px 20px 60px}
h1{font-size:22px;margin:8px 0 14px}h2{font-size:16px;margin:0 0 8px}
a{color:var(--acc)}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{color:var(--mut);font-weight:600;font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:0 0 14px}
dl{display:grid;grid-template-columns:170px 1fr;gap:4px 12px;margin:0 0 10px}dt{color:var(--mut)}dd{margin:0;min-width:0;overflow-wrap:anywhere}
.muted{color:var(--mut)}.quote{white-space:pre-wrap}
.tag{display:inline-block;font-size:12px;font-weight:600;padding:1px 8px;border-radius:10px;border:1px solid var(--line);vertical-align:middle}
.tag.bad{color:var(--bad);border-color:var(--bad)}.tag.warn{color:var(--warn);border-color:var(--warn)}
.notice{border-left:3px solid var(--warn);padding:4px 10px;margin:10px 0;background:rgba(154,103,0,.08)}
.block{margin:10px 0;padding:8px 10px;border:1px solid var(--line);border-radius:8px}
.media{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;margin:8px 0}.thumb{width:135px;height:240px;object-fit:cover;border-radius:8px;background:#000}.player{width:135px;height:240px;background:#000;border-radius:8px}
.media p{flex:1 1 260px;margin:0}
form.act{display:grid;gap:8px;max-width:560px;margin:8px 0 4px}
label{display:grid;gap:3px;font-size:13px;color:var(--mut)}label.check{display:flex;gap:8px;align-items:center;color:var(--fg)}
input,textarea,select,button{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:6px 9px}
textarea{resize:vertical}button{cursor:pointer;background:var(--fg);color:var(--bg);border-color:var(--fg);justify-self:start;padding:6px 14px}button.danger{background:var(--bad);border-color:var(--bad);color:#fff}button[disabled]{opacity:.5;cursor:default}
details{margin:6px 0}summary{cursor:pointer;color:var(--acc)}summary.danger-link{color:var(--bad)}
.actions{margin-top:8px}.search{display:flex;gap:8px;align-items:end;margin-bottom:12px}.search label{flex:1}
.msg{margin:0;padding:8px 20px;min-height:0;position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line)}.msg.ok{color:#1e824c}.msg.bad{color:var(--bad)}.msg:empty{display:none}
.signin{max-width:380px;margin:60px auto;padding:0 20px}.signin form{display:grid;gap:10px;margin-top:12px}
.hidden{display:none!important}
code{font-size:13px;overflow-wrap:anywhere}
`;

const JS = `
(function(){
'use strict';
var CFG=JSON.parse(document.getElementById('cfg').textContent);
var BASE=location.pathname.replace(/\\/+$/,'');
var AUTH=(CFG.authBase||location.origin).replace(/\\/+$/,'')+'/auth/v1';
var KEY='shortcut_admin_session';
var session=null,pendingEmail='';
try{session=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch(e){}
function $(id){return document.getElementById(id)}
function save(s){session=s;try{if(s)sessionStorage.setItem(KEY,JSON.stringify(s));else sessionStorage.removeItem(KEY)}catch(e){}}
function say(t,bad){var m=$('msg');m.textContent=t||'';m.className='msg'+(t?(bad?' bad':' ok'):'')}
function authPost(path,body,token){var h={'apikey':CFG.anonKey,'Content-Type':'application/json'};if(token)h['Authorization']='Bearer '+token;return fetch(AUTH+path,{method:'POST',headers:h,body:JSON.stringify(body),cache:'no-store',credentials:'omit'})}
function refresh(){
  if(!session||!session.refresh_token)return Promise.resolve(false);
  return authPost('/token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(function(r){return r.ok?r.json():null}).then(function(j){
    if(!j||!j.access_token)return false;save({access_token:j.access_token,refresh_token:j.refresh_token});return true}).catch(function(){return false})}
function api(path,opts,retried){
  if(!session)return Promise.reject(new Error('signed_out'));
  opts=opts||{};var h={'Authorization':'Bearer '+session.access_token};
  if(opts.body!==undefined)h['Content-Type']='application/json';
  return fetch(BASE+path,{method:opts.method||'GET',headers:h,body:opts.body!==undefined?JSON.stringify(opts.body):undefined,cache:'no-store',credentials:'omit'}).then(function(r){
    if(r.status===401&&!retried)return refresh().then(function(ok){return ok?api(path,opts,true):r});
    return r})}
function showSignin(){$('app').classList.add('hidden');$('signin').classList.remove('hidden');$('emailForm').classList.remove('hidden');$('codeForm').classList.add('hidden')}
function showApp(){$('signin').classList.add('hidden');$('app').classList.remove('hidden')}
function signOut(quiet){var t=session&&session.access_token;save(null);$('view').textContent='';if(t)authPost('/logout',{scope:'local'},t).catch(function(){});showSignin();if(!quiet)say('')}
function fixLinks(){
  var web=CFG.webBase||(/\\/admin$/.test(BASE)?BASE.replace(/\\/admin$/,'')+'/web':'');
  Array.prototype.forEach.call(document.querySelectorAll('a[data-web]'),function(a){if(web)a.setAttribute('href',web+a.getAttribute('data-web'))})}
function route(){
  if(!session){showSignin();return Promise.resolve()}
  showApp();
  var h=location.hash.replace(/^#\\/?/,'')||'reports';
  if(/\\.\\./.test(h)||!/^[A-Za-z0-9\\/_.@%?=&-]*$/.test(h)){$('view').textContent='Not found.';return Promise.resolve()}
  var top=h.split(/[\\/?]/)[0];
  Array.prototype.forEach.call(document.querySelectorAll('nav a'),function(a){a.className=a.getAttribute('data-nav')===top||(top==='report'&&a.getAttribute('data-nav')==='reports')||(top==='account'&&a.getAttribute('data-nav')==='accounts')?'on':''});
  return api('/v/'+h).then(function(r){
    if(r.status===401){signOut(true);say('Your session ended. Sign in again.',true);return}
    if(r.status===403){signOut(true);say('This account does not have access to the admin.',true);return}
    return r.text().then(function(t){$('view').innerHTML=t;fixLinks();window.scrollTo(0,0)})
  }).catch(function(){say('Could not reach the admin.',true)})}
document.addEventListener('submit',function(e){
  var f=e.target;
  if(f.id==='emailForm'){e.preventDefault();var em=f.elements.email.value.trim().toLowerCase();if(!em)return;pendingEmail=em;
    authPost('/otp',{email:em,create_user:false}).then(function(r){
      if(r.status===429){say('Wait a minute before asking for another code.',true);return}
      say('If that email can sign in here, a code is on its way.');$('emailForm').classList.add('hidden');$('codeForm').classList.remove('hidden');$('codeForm').elements.code.focus()
    }).catch(function(){say('Could not reach sign-in.',true)});return}
  if(f.id==='codeForm'){e.preventDefault();var code=f.elements.code.value.replace(/\\s+/g,'');
    authPost('/verify',{type:'email',email:pendingEmail,token:code}).then(function(r){return r.ok?r.json():null}).then(function(j){
      if(!j||!j.access_token){say('That code did not work.',true);return}
      save({access_token:j.access_token,refresh_token:j.refresh_token});f.reset();
      return api('/me').then(function(r){
        if(r.status!==200){signOut(true);say('This account does not have access to the admin.',true);return}
        return r.json().then(function(me){$('who').textContent=me.identity||'';say('');if(!location.hash)location.hash='#/reports';return route()})})
    }).catch(function(){say('Could not reach sign-in.',true)});return}
  if(f.hasAttribute('data-search')){e.preventDefault();location.hash='#/accounts?q='+encodeURIComponent(f.elements.q.value.trim());return}
  var action=f.getAttribute('data-action');if(!action)return;e.preventDefault();
  var ask=f.getAttribute('data-confirm');if(ask&&!window.confirm(ask))return;
  var body={};Array.prototype.forEach.call(f.elements,function(el){if(!el.name)return;if(el.type==='checkbox')body[el.name]=el.checked;else body[el.name]=el.value});
  body.confirm=true;
  var btn=f.querySelector('button[type=submit]');if(btn)btn.disabled=true;
  api('/a/'+action,{method:'POST',body:body}).then(function(r){return r.json().catch(function(){return{ok:false,message:'Unexpected answer.'}}).then(function(j){return{r:r,j:j}})}).then(function(x){
    if(x.r.status===401){signOut(true);say('Your session ended. Sign in again.',true);return}
    if(x.r.status===403){signOut(true);say('This account does not have access to the admin.',true);return}
    say(x.j.message||(x.j.ok?'Done.':'That did not work.'),!x.j.ok);
    return route()
  }).catch(function(){say('Could not reach the admin.',true)}).then(function(){if(btn)btn.disabled=false})
});
document.addEventListener('click',function(e){
  var t=e.target;if(!t||!t.closest)return;
  if(t.closest('[data-back]')){e.preventDefault();history.back();return}
  if(t.closest('#signout')){e.preventDefault();signOut()}
});
window.addEventListener('hashchange',function(){say('');route()});
if(session){api('/me').then(function(r){if(r.status===200)return r.json().then(function(me){$('who').textContent=me.identity||'';return route()});signOut(true)}).catch(function(){showSignin()})}else{showSignin()}
})();
`;

export function shellPage(cfg: ShellConfig, nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Shortcut moderation</title>
<style nonce="${esc(nonce)}">${CSS}</style>
</head>
<body>
<script type="application/json" id="cfg">${jsonForScript(cfg)}</script>
<p id="msg" class="msg" role="status" aria-live="polite"></p>
<div id="signin" class="signin hidden">
<h1>Shortcut moderation</h1>
<p class="muted">Team only. Sign in with the email of your Shortcut account; a six-digit code is sent to it.</p>
<form id="emailForm"><label>Email<input name="email" type="email" autocomplete="username" required></label><button type="submit">Send code</button></form>
<form id="codeForm" class="hidden"><label>Code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required></label><button type="submit">Sign in</button></form>
</div>
<div id="app" class="hidden">
<header><b>Shortcut moderation</b>
<nav><a href="#/reports" data-nav="reports">Reports</a><a href="#/reviews" data-nav="reviews">Review requests</a><a href="#/suggestions" data-nav="suggestions">Prompt suggestions</a><a href="#/accounts" data-nav="accounts">Accounts</a></nav>
<span class="muted" id="who"></span><a href="#" id="signout">Sign out</a>
</header>
<main id="view"></main>
</div>
<script nonce="${esc(nonce)}">${JS}</script>
</body>
</html>`;
}
