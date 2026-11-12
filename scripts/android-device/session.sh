#!/usr/bin/env bash
# Drives one Android device (emulator or a streamed remote phone) against the isolated backend
# (scripts/android-device/backend.sh up first). Buttons are found by their accessibility labels, so it works
# at any screen size. Results go to $CONGA_ANDROID_WORK/device-<serial>/.
#   SERIAL=<adb serial> scripts/android-device/session.sh <step> [args]
# Steps, in session order:
#   info                 model, Android, chipset, RAM, screen, the phone's AVC encoders
#   setup                adb reverse 8081, 55801, 55698; install the debug APK with permissions granted
#   reverse-check        the phone itself asks Metro and the stack through the reversed ports
#   launch               cold start the dev client on Metro; close its first-run menu, hide its Tools button
#   signin               email code sign-in as dev-maya@example.com (code read from the stack's Mailpit)
#   respond              + (position cached at sign-in), then the first prompt offered
#   take <name> [plan]   record by plan (r<s> record or resume, p<s> pause, f flip, w<s> wait), then Stop
#   stitchwait           waits for Media3 Transformer; prints its timing and the codecs it used
#   pull <name>          the stitched clip, the take's segments (and the screen recording with SCREENREC=1)
#   probe <name> [secs]  tracks, audio continuity and frames of the stitched clip
#   discard              Post Review: Back, then the sheet's Discard
#   tap <label> [exact]  tap by accessibility label;  ui  list labels;  shot <name>  screenshot
#   logs-start | logs-stop   full logcat to file
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${CONGA_ANDROID_WORK:-$HOME/Library/Caches/conga-android}"
APK="$REPO/app/android/app/build/outputs/apk/debug/app-debug.apk"
: "${SERIAL:?set SERIAL to the adb serial}"
OUT="$WORK/device-$(echo "$SERIAL" | tr -c 'A-Za-z0-9\n' '_')"
mkdir -p "$OUT"
A() { adb -s "$SERIAL" "$@"; }
now() { date +%H:%M:%S; }

dump() { # retries: uiautomator gives up while the screen animates (and always while a video plays)
  for _ in 1 2 3; do
    A shell rm -f /sdcard/ui.xml >/dev/null 2>&1
    A shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
    A shell cat /sdcard/ui.xml > "$OUT/ui.xml" 2>/dev/null
    grep -q '<hierarchy' "$OUT/ui.xml" 2>/dev/null && return 0
    sleep 1
  done
  return 1
}
# find_xy <label> [exact|sub] [first|lowest] -> "x y" of a node whose text or content-desc matches
find_xy() {
  python3 -I - "$OUT/ui.xml" "$1" "${2:-sub}" "${3:-first}" <<'PY'
import re, sys, xml.etree.ElementTree as ET
try: tree = ET.parse(sys.argv[1])
except Exception: sys.exit(0)
want, mode, pick = sys.argv[2], sys.argv[3], sys.argv[4]
hits = []
for n in tree.iter('node'):
    vals = [n.get('text') or '', n.get('content-desc') or '']
    if any((v == want) if mode == 'exact' else (want in v) for v in vals):
        b = list(map(int, re.findall(r'\d+', n.get('bounds'))))
        hits.append(((b[1] + b[3]) // 2, (b[0] + b[2]) // 2, n.get('clickable') == 'true'))
if pick == 'lowest':
    hits = [h for h in hits if h[2]] or hits
    hits.sort(reverse=True)
if hits: print(hits[0][1], hits[0][0])
PY
}
tap_label() { # tap_label <label> [exact|sub] [first|lowest]
  dump || { echo "$(now) no UI dump (video playing?)"; return 1; }
  local xy; xy=$(find_xy "$1" "${2:-sub}" "${3:-first}")
  if [ -n "$xy" ]; then A shell input tap $xy; echo "$(now) tap '$1' at $xy"; else echo "$(now) NOT FOUND '$1'"; return 1; fi
}
shot() { A exec-out screencap -p > "$OUT/$1.png"; sips -Z 900 "$OUT/$1.png" --out "$OUT/small-$1.png" >/dev/null 2>&1; echo "$OUT/small-$1.png"; }

case "${1:-}" in
  info)
    { echo "serial $SERIAL  $(date)"
      for p in ro.product.manufacturer ro.product.model ro.product.device ro.build.version.release ro.build.version.sdk \
               ro.soc.manufacturer ro.soc.model ro.board.platform ro.hardware ro.product.cpu.abi; do
        echo "$p=$(A shell getprop "$p" | tr -d '\r')"; done
      A shell grep MemTotal /proc/meminfo; A shell wm size; A shell wm density
      echo "-- AVC/HEVC encoders declared:"
      for f in $(A shell 'ls /vendor/etc/media_codecs*.xml /odm/etc/media_codecs*.xml /apex/com.android.media.swcodec/etc/media_codecs*.xml 2>/dev/null' | tr -d '\r'); do
        A shell cat "$f" 2>/dev/null; done | grep -ioE 'name="[^"]*(avc|hevc|h264|h265)[^"]*encoder[^"]*"' | sort -u
    } | tee "$OUT/info.txt" ;;
  setup)
    for p in 8081 55801 55698; do A reverse tcp:$p tcp:$p >/dev/null; done; A reverse --list
    t0=$(date +%s); A install -r -g "$APK" && echo "install took $(( $(date +%s) - t0 ))s" ;;
  reverse-check)
    # From the phone's side: GET through each reversed port (curl if the phone has it, else toybox nc).
    A shell 'for p in 8081 55801; do
      if command -v curl >/dev/null 2>&1; then echo "$p: $(curl -s -m 8 -o /dev/null -w %{http_code} http://127.0.0.1:$p/status)";
      else (printf "GET /status HTTP/1.0\r\n\r\n"; sleep 3) | nc -w 5 127.0.0.1 $p 2>&1 | head -1 | sed "s/^/$p: /"; fi; done' ;;
  launch)
    A logcat -c; A shell am force-stop app.shortcut
    A shell am start -W -a android.intent.action.VIEW -d "exp+conga://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" app.shortcut | grep -E "Status|TotalTime"
    for _ in $(seq 1 90); do A logcat -d | grep -q 'Running "main"' && break; sleep 1; done
    echo "JS running: $(A logcat -d | grep -m1 'Running "main"' | cut -c1-18)"
    for _ in $(seq 1 12); do
      sleep 2; dump || continue
      if [ -n "$(find_xy 'This is the developer menu')" ]; then A shell input tap $(find_xy Continue exact); continue; fi
      if [ -n "$(find_xy 'Toggle performance monitor')" ]; then
        # The floating Tools button sits over the recorder's Light button: turn it off, close the menu.
        A shell input swipe 540 1800 540 600 400; sleep 1; dump
        [ -n "$(find_xy 'Tools button' exact)" ] && A shell input tap $(find_xy 'Tools button' exact) && echo "$(now) tools button off"
        sleep 1; A shell input keyevent 4; continue
      fi
      [ -n "$(find_xy 'Continue with email')$(find_xy 'Respond or suggest a prompt')" ] && { echo "$(now) app ready"; break; }
    done ;;
  signin)
    tap_label "Continue with email" || exit 1; sleep 1.5
    A shell input text "dev-maya@example.com"; A shell input keyevent 66; sleep 4
    id=$(curl -s "http://127.0.0.1:55804/api/v1/messages" | python3 -c "import json,sys; m=json.load(sys.stdin)['messages']; print(m[0]['ID'] if m else '')")
    code=$(curl -s "http://127.0.0.1:55804/api/v1/message/$id" | python3 -c "import json,sys,re; print(re.search(r'\b(\d{6})\b', json.load(sys.stdin)['Text']).group(1))")
    A shell input text "$code"; sleep 1; A shell input keyevent 66
    for _ in $(seq 1 25); do
      sleep 1
      if dump && [ -n "$(find_xy 'Respond or suggest a prompt')" ]; then
        find_xy 'Respond or suggest a prompt' > "$OUT/plus.xy"; echo "$(now) signed in (code $code)"; exit 0
      fi
    done
    echo "$(now) sign-in not confirmed"; exit 1 ;;
  respond)
    [ -s "$OUT/plus.xy" ] || { echo "no cached + position (sign in first)"; exit 1; }
    A shell input tap $(cat "$OUT/plus.xy"); echo "$(now) + at $(cat "$OUT/plus.xy")"; sleep 2.5
    tap_label "Respond again:" || tap_label "Respond to " ;;
  take)
    name="$2"; plan="${3:-r5,p2,r4,f,r5}"
    rec=""; flip=""
    for _ in $(seq 1 15); do dump && rec=$(find_xy Record exact) && flip=$(find_xy "Flip camera" exact); [ -n "$rec" ] && [ -n "$flip" ] && break; sleep 1; done
    [ -n "$rec" ] && [ -n "$flip" ] || { echo "recorder not ready"; exit 1; }
    set -- $rec; rx=$1; ry=$2; set -- $flip; fx=$1
    sx=$(( 2 * rx - fx )) # Stop sits mirrored to Flip around Record
    A logcat -c
    # SCREENREC=1: also record the screen (large: 126 MB for a 30 s take took 4 min to pull from a streamed phone).
    [ "${SCREENREC:-0}" = 1 ] && (A shell screenrecord --time-limit 75 /sdcard/take.mp4 >/dev/null 2>&1 &)
    sleep 1; echo "$(now) record"; A shell input tap $rx $ry
    paused=0
    IFS=, read -ra steps <<< "$plan"
    for st in "${steps[@]}"; do
      case "$st" in
        r*) [ "$paused" = 1 ] && { echo "$(now) resume"; A shell input tap $rx $ry; paused=0; }; sleep "${st#r}" ;;
        p*) echo "$(now) pause"; A shell input tap $rx $ry; paused=1; sleep "${st#p}" ;;
        f) echo "$(now) flip"; A shell input tap $fx $ry ;;
        w*) sleep "${st#w}" ;;
      esac
    done
    echo "$(now) stop"; A shell input tap $sx $ry
    sleep 1; A logcat -d > "$OUT/$name-logcat.txt"
    grep -E "Recorder: Transitioning Recorder internal state: (PENDING_RECORDING --> RECORDING|RECORDING --> STOPPING)|Received video keyframe" "$OUT/$name-logcat.txt" | cut -c7-18,60-140 ;;
  stitchwait)
    for _ in $(seq 1 180); do A logcat -d | grep -q "TransformerInternal: Release" && break; sleep 1; done
    A logcat -d > "$OUT/stitch-logcat.txt"
    grep -E "TransformerInternal: (Init|Release)" "$OUT/stitch-logcat.txt" | cut -c7-18,40-120
    grep -ioE "(c2\.[a-z0-9._-]*|OMX\.[A-Za-z0-9._-]*)" "$OUT/stitch-logcat.txt" | grep -iE "avc|h264|aac|hevc" | sort | uniq -c | sort -rn | head -8 ;;
  pull)
    A shell pkill -INT screenrecord >/dev/null 2>&1; sleep 1
    f=$(A shell run-as app.shortcut ls -t files/recordings 2>/dev/null | tr -d '\r' | grep '\.mp4$' | head -1)
    [ -n "$f" ] && A exec-out run-as app.shortcut cat "files/recordings/$f" > "$OUT/$2-stitched.mp4" && echo "stitched: files/recordings/$f"
    for seg in $(A shell run-as app.shortcut ls files/recordings/take 2>/dev/null | tr -d '\r'); do
      A exec-out run-as app.shortcut cat "files/recordings/take/$seg" > "$OUT/$2-seg-$seg"; done
    [ "${SCREENREC:-0}" = 1 ] && A pull /sdcard/take.mp4 "$OUT/$2-screen.mp4" >/dev/null 2>&1
    ls -la "$OUT" | grep -- "$2" ;;
  probe)
    [ -x "$WORK/probe" ] || swiftc -O "$REPO/scripts/android-device/probe.swift" -o "$WORK/probe" 2>&1 | grep -v warning
    "$WORK/probe" "$OUT/$2-stitched.mp4" "${@:3}" ;;
  discard)
    A shell input keyevent 4; sleep 1.5
    tap_label Discard exact lowest && sleep 2 ;;
  tap) tap_label "$2" "${3:-sub}" ;;
  shot) shot "$2" ;;
  ui)
    dump || { echo "DUMP FAILED (UI not idle)"; exit 1; }
    python3 -I - "$OUT/ui.xml" <<'PY'
import re, sys, xml.etree.ElementTree as ET
for n in ET.parse(sys.argv[1]).iter('node'):
    txt, desc = n.get('text') or '', n.get('content-desc') or ''
    if txt or desc:
        b = list(map(int, re.findall(r'\d+', n.get('bounds'))))
        print(f"{(b[0]+b[2])//2:4d},{(b[1]+b[3])//2:4d} {'C' if n.get('clickable')=='true' else ' '} {txt!r} {desc!r}"[:150])
PY
    ;;
  logs-start) (A logcat -v threadtime > "$OUT/full-logcat.txt" 2>&1 &); echo "logging to $OUT/full-logcat.txt" ;;
  logs-stop) pkill -f "adb -s $SERIAL logcat -v threadtime"; wc -l "$OUT/full-logcat.txt" ;;
  *) sed -n '2,23p' "$0"; exit 2 ;;
esac
