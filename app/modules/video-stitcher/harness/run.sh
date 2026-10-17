#!/bin/zsh
# Runs the stitcher's AVFoundation core (../ios/VideoStitcher.swift) on a Mac against generated
# camera-like segments and checks the output (docs/release/CAMERA-FLIP.md, "What is verified").
# Needs Xcode's command-line tools only. Usage: app/modules/video-stitcher/harness/run.sh [out-dir]
set -e
here=${0:A:h}
out=${1:-$(mktemp -d)}
bin=$(mktemp -d)/stitch-harness
swiftc -swift-version 5 -o "$bin" "$here/main.swift" "$here/../ios/VideoStitcher.swift" 2>"$bin.log" || { grep "error:" "$bin.log"; exit 1; }
mkdir -p "$out"
echo "segments and output in $out"
# A 2 MB volume, so the full-disk check can make the writer fail part-way through a stitch.
# File-backed and mounted inside $out; detached on exit. Skipped if hdiutil cannot make it.
full="$out/full-disk"
if hdiutil create -quiet -size 2m -fs HFS+ -volname StitchFull -ov "$out/full.dmg" \
  && mkdir -p "$full" && hdiutil attach -quiet -nobrowse -mountpoint "$full" "$out/full.dmg"; then
  trap 'hdiutil detach -quiet "$full" 2>/dev/null || true' EXIT
  export STITCH_FULL_DISK="$full"
fi
"$bin" "$out"
