# Phase 1 spike: run checklist (iPhone)

Do this alone, on **mobile data with Wi-Fi off**. Each line is one tap unless it says otherwise.

## Round 1 (done 6 Oct 2026): 7 front-camera 1080p runs, default encoder. See REPORT.md.

## Round 2 (done 6 Oct 2026). See REPORT.md.

## Round 3 (done 6 Oct 2026). See REPORT.md.

## Round 4 (short)

New build. Flip is now enabled during recording. The quality button shows the current value.

1. **Flip while recording**: front camera, Record, after 3 s tap **Flip**, keep going 3 s, Stop. Say in chat what happened: did the preview switch, did the recording stop by itself, did the clip in Preview contain both cameras?
2. **Torch**: back camera, **Light on**, Record 5 s. Say whether the torch stayed on for the whole recording (it is re-applied automatically 0.7 s after start).
3. **Zoom 0 screenshots**: back camera, zoom 0, take an iPhone screenshot of the spike. Open the Camera app at 1×, same scene, screenshot. AirDrop both to the Mac or describe the difference.
4. **Export log** → AirDrop into `spike/logs/`. Tell Claude the file name.

## Round 3 steps (for reference)

New build. **Fast start** now cycles off / nowait / smallbuffer. Home has **Free Mux slots** to delete all assets on Mux when the 10-asset cap hits; measurements stay in the log.

1. Tap **Free Mux slots** first so you start with 10 free.
2. **Light, back**: Record, Flip to back, **Light on**, record 5 s. The torch must be on. Post it. Say in chat whether it was.
3. **Zoom 0 check**: back camera, zoom 0. Compare with the iPhone Camera app at 1×. Say in chat whether it is the same framing.
4. **Encoder 2Mbps**, front, record 15 s, Post. Then from Home open it with **Fast start: off**, watch 8 s, Back. Set **Fast start: nowait**, open it again, watch 8 s, Back. Set **Fast start: smallbuffer**, open it again, 8 s, Back. Say in chat if any mode showed no picture.
5. Repeat step 4's playback part on two more ready clips (3 modes each).
6. **Play all ready** once with Fast start: off and once with smallbuffer.
7. **Offline upload**: Airplane mode on, record 5 s, Post. Let it fail. Airplane mode off, Retry.
8. **Export log** → AirDrop into `spike/logs/`. Tell Claude the file name.

## Round 2 steps (for reference)

Home has two new toggles: **Encoder** (default / 4Mbps / 2Mbps) and **Fast start** (off / on). Both are shown in every run's label and log line.

### Back camera (the Flip bug is fixed)

1. Wi-Fi off. Open the app. Tap **Record**, tap **Flip** to back. The Record button should go live within a second.
2. Record 5 clips of 10 to 15 s on the back camera, default encoder. Post each one. Let each loop 3 times, then Back.
3. **Light, back**: Flip to back, **Light on**, record 5 s. The torch must be on while recording. Post it.
4. **Light, front**: Flip to front, **Light on**, record 5 s. Note what happens (expected: nothing visible). Post it.
5. **Zoom**: back camera, tap **Zoom** to 0.1 then 0.25, 3 s each, post both. Say in chat whether 0 looks like the normal 1× camera or the ultra-wide.

### Encoder bitrate (this decides upload time)

6. On Home set **Encoder: 4Mbps**. Record a 30 s front clip (hold until it stops itself). Post it.
7. Set **Encoder: 2Mbps**. Record a 30 s front clip. Post it. Say in chat whether the preview looks noticeably worse than the default.
8. Set quality to **720p** (button on the record screen), Encoder default. Record 15 s front. Post it.

### Playback start time

9. On Home, **Fast start: off**. Open 3 different ready clips with **Play (Home loop)**, 10 s each.
10. Set **Fast start: on**. Open the same 3 clips again, 10 s each.
11. **Play all ready** once with Fast start on.

### Failure cases (skip any you already did in round 1)

12. **Re-record**: record 3 s, in Preview tap **Re-record**. Run must disappear from Home.
13. **Interrupted upload**: record 25 s, Post, kill the app at about 30 %. Reopen, tap **Retry** once. Wait for it to finish.
14. **Offline upload**: Airplane mode on, record 5 s, Post. Let it fail. Airplane mode off, Retry.

### Export

15. **Export log** → AirDrop into `spike/logs/`. Tell Claude the file name, and the answers to steps 5 and 7.
