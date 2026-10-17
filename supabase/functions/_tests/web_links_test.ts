// Unit tests for web/links.ts: the in-app link of each web page and the pinned hls.js tag.
// No network, no stack:
//   deno test --allow-read supabase/functions/_tests/web_links_test.ts
import { assert, assertEquals } from "./assert.ts";
import { APP_SCHEME, appLink, HLS_JS_INTEGRITY, HLS_JS_URL, HLS_JS_VERSION, hlsScriptTag, LINK_TARGETS, linkEventTarget, parseWebPath } from "../web/links.ts";

const UUID = "5b321c24-1e1e-4393-9ae1-e6503903430d";

Deno.test("parseWebPath reads kind and id, with or without the function prefix", () => {
  assertEquals(parseWebPath(`/functions/v1/web/r/${UUID}`), { kind: "r", id: UUID });
  assertEquals(parseWebPath(`/web/p/${UUID}/`), { kind: "p", id: UUID });
  assertEquals(parseWebPath("/i/PUTU-7K2"), { kind: "i", id: "PUTU-7K2" });
  assertEquals(parseWebPath("/functions/v1/web/u/lena.hart"), { kind: "u", id: "lena.hart" });
  assertEquals(parseWebPath("/functions/v1/web/e/signin"), { kind: "e", id: "signin" });
});

Deno.test("parseWebPath refuses everything else", () => {
  for (const p of ["/", "/functions/v1/web", "/functions/v1/web/", "/x/abc", "/r/", "/r/a/b", "/functions/v1/web/r"]) {
    assertEquals(parseWebPath(p), null, p);
  }
});

Deno.test("appLink opens the matching route of the app", () => {
  assertEquals(appLink("r", UUID), `shortcut://r/${UUID}`);
  assertEquals(appLink("p", UUID), `shortcut://p/${UUID}`);
  assertEquals(appLink("u", "lena.hart"), "shortcut://u/lena.hart");
  assertEquals(appLink("i", "PUTU-7K2"), "shortcut://i/PUTU-7K2");
  assert(appLink("r", UUID).startsWith(APP_SCHEME), "uses the app scheme");
});

Deno.test("appLink encodes once and never lets markup or a script through", () => {
  assertEquals(appLink("i", "PUTU%207K2"), "shortcut://i/PUTU%207K2", "an encoded id is decoded then encoded once, not twice");
  assertEquals(appLink("i", "%E0%A4%A"), "shortcut://i/%25E0%25A4%25A", "a malformed escape is kept as text");
  for (const hostile of ["</script><script>alert(1)</script>", '"><img src=x>', "%3C%2Fscript%3E", "a/b", "a?b=c#d", "a b'"]) {
    const link = appLink("i", hostile);
    assert(/^shortcut:\/\/i\/[A-Za-z0-9\-_.!~*'()%]*$/.test(link), `${hostile} -> ${link}`);
    assert(!link.includes("<") && !link.includes('"') && !link.includes(" ") && !link.slice(APP_SCHEME.length).includes("//"), link);
  }
});

Deno.test("hls.js is pinned to an exact version with an integrity hash and crossorigin", () => {
  assert(/^\d+\.\d+\.\d+$/.test(HLS_JS_VERSION), "exact version, no range or tag");
  assertEquals(HLS_JS_URL, `https://cdn.jsdelivr.net/npm/hls.js@${HLS_JS_VERSION}/dist/hls.min.js`);
  assert(/^sha384-[A-Za-z0-9+/]{64}$/.test(HLS_JS_INTEGRITY), "sha384 base64 digest");
  const tag = hlsScriptTag();
  assert(tag.includes(`src="${HLS_JS_URL}"`) && tag.includes(`integrity="${HLS_JS_INTEGRITY}"`) && tag.includes('crossorigin="anonymous"'), tag);
});

Deno.test("index.ts and render.ts build their links and script tag only through links.ts", async () => {
  const index = await Deno.readTextFile(new URL("../web/index.ts", import.meta.url));
  const src = await Deno.readTextFile(new URL("../web/render.ts", import.meta.url));
  for (const s of [index, src]) {
    assert(!/hls\.js@1\//.test(s) && !s.includes("cdn.jsdelivr.net"), "no unpinned or hard-coded script URL");
    assert(!s.includes('href="${APP_SCHEME}"'), "the sheet's Open in the app link is per page");
    assert(!/\$\{APP_SCHEME\}i\//.test(s), "no hand-built invite link");
  }
  assert(src.includes("${hlsScriptTag()}"), "the player uses the pinned tag");
  assert(!src.includes("Deno.env") && !/(href="|sendBeacon\(')\/functions\//.test(src), "render.ts is pure: no environment, no hard-coded function path");
});

Deno.test("linkEventTarget accepts only the four link-opened targets", () => {
  assertEquals(LINK_TARGETS, { r: "video", p: "prompt", i: "invite", u: "profile" });
  for (const t of ["video", "prompt", "invite", "profile"]) assertEquals(linkEventTarget(`link-${t}`), t);
  for (const bad of ["signin", "link-", "link-video2", "xlink-video", "link-Video", "video"]) assertEquals(linkEventTarget(bad), null, bad);
});
