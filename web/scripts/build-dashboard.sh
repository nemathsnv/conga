#!/usr/bin/env bash
# Builds the Cloudflare Pages upload for a dashboard (drag-and-drop) deployment, with no Wrangler
# deployment and no Cloudflare account (docs/release/CLOUDFLARE-DASHBOARD.md):
#   dist/conga-web/                   the folder Pages serves
#     _worker.js                      src/worker.ts and everything it imports, as one ES module
#     _routes.json, _headers          from public/
#     .well-known/apple-app-site-association, .well-known/assetlinks.json   from public/
#   dist/conga-web-dashboard.zip      the same files at the root of the archive
# Nothing else goes in: every file in the upload except _worker.js is served publicly.
#
#   cd web && npm ci && npm run build:dashboard
set -euo pipefail
cd "$(dirname "$0")/.."
export WRANGLER_SEND_METRICS=false

OUT=dist/conga-web
ZIP=dist/conga-web-dashboard.zip
rm -rf dist
mkdir -p "$OUT/.well-known" dist/.bundle

# wrangler deploy --dry-run only bundles (esbuild) and checks the Worker; it uploads nothing.
npx wrangler deploy --config wrangler.dashboard.toml --dry-run --outdir dist/.bundle >/dev/null
cp dist/.bundle/worker.js "$OUT/_worker.js"
cp public/_routes.json public/_headers "$OUT/"
cp public/.well-known/apple-app-site-association public/.well-known/assetlinks.json "$OUT/.well-known/"
rm -rf dist/.bundle

# The Worker must be self-contained: a dashboard upload does not bundle or resolve imports.
if grep -Eq '^[[:space:]]*import[[:space:]]|require\(' "$OUT/_worker.js"; then
  echo "build-dashboard: _worker.js still imports a module" >&2
  exit 1
fi
grep -q '^export {' "$OUT/_worker.js" || { echo "build-dashboard: _worker.js has no module export" >&2; exit 1; }

# Fixed timestamps and no extra attributes, so the same source gives the same archive.
find "$OUT" -exec touch -t 202610010000 {} +
(cd "$OUT" && zip -q -X -r "../$(basename "$ZIP")" _worker.js _routes.json _headers .well-known)

echo "built $ZIP"
(cd "$OUT" && find . -type f | sort | while read -r f; do printf '  %-45s %7s bytes\n' "${f#./}" "$(wc -c < "$f" | tr -d ' ')"; done)
shasum -a 256 "$ZIP"
