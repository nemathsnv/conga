# Phase 1 spike: run checklist (iPhone)

Do this alone, on **mobile data with Wi-Fi off**. Each line is one tap unless it says otherwise.

## Before the runs

1. Settings → Wi-Fi → off. Confirm the status bar shows 4G/5G.
2. Open **Shortcut Spike**. The top line must show `net CELLULAR 4G` (or 5G) and your carrier.
3. Tap **Clear all** if the list has old runs from a previous session.

## One recording (repeat 5 times per camera)

4. Tap **Record**. Grant camera and microphone the first time.
5. Tap **Flip** to pick the camera. Run 5 with **front**, then 5 with **back**.
6. Tap **Record**, talk for 10 to 15 seconds, tap **Stop**. For one run per camera, hold until it stops itself at 30 s.
7. Preview plays looping with sound. Read the pill: duration, resolution, MB, kbps. Tap **Post**.
8. Watch the progress bar fill. Don't leave the screen. When Mux is ready the Home loop opens automatically.
9. Let it loop at least 3 times. Read the pill: first frame ms, stalls, loops. Tap **Back**.

## Extra runs (once each)

10. **Light test, front**: Record → Flip to front → **Light on** → record 5 s. Note whether anything changes (expected: nothing, iPhone front has no torch).
11. **Light test, back**: same with back camera. The torch must come on while recording.
12. **Zoom test**: tap **Zoom** to 0.1, then 0.25, record 3 s each on the back camera. Note what the preview shows versus 1×.
13. **Too short**: tap Record then Stop within 1 s. Expect the "Too short" message, no run created.
14. **Re-record**: record 3 s, in Preview tap **Re-record**. Expect the camera again, run gone from Home.
15. **Interrupted upload**: record 25 s, tap Post, and when the bar is around 30 % swipe the app away (kill it). Reopen. Expect the yellow "didn't post, saved on this phone" banner with the run and **Retry**. Tap Retry and let it finish.
16. **Offline upload**: turn on Airplane mode, record 5 s, tap Post. Expect failure after the automatic retries, banner, run kept. Turn Airplane mode off, tap Retry.
17. **720p**: tap the quality button to 720p, record one 15 s front clip, post it.

## Playback runs

18. On Home tap **Play all ready**. Clips play one after another, sound on. Note first-frame per clip from the pill and any stalls. Use **Next** / **Prev** once each.
19. Open any ready clip with **Play (Home loop)** again after 10 minutes. This measures a cold CDN start.

## Export

20. Tap **Export log** → AirDrop to the Mac. Save the file into `spike/logs/`.
21. Tell Claude the file name. The report is built from it with `npm run summarize -- logs/<file>.jsonl`.
