# Several responses per prompt, and Pause/Resume recording (19 Oct 2026)

Nemat approved two product changes on 19 Oct: a member may respond to one prompt with any number of
independent videos, and recording supports Pause and Resume. This is the implementation, the
verification, and the one coordinated rollout for testing both on the iPhone 17 Pro.

- **Base:** `e916398`, the tip of `claude/conga-iphone-stability-3988b9` (contains every earlier Conga
  branch and the published founder EAS Update `95dfedbb`). Checked with `git merge-base`.
- **Branch:** `claude/conga-multiple-responses-257d13`.
- **Nothing hosted was touched.** No push, deploy, migration, EAS Update, install, or Mux call. The
  founder's local stack `shortcut`, the installed app and the phone were not used.

| Commit | What |
| --- | --- |
| `e1fd489` | Database: several responses per prompt (`20261019000200`), rollback, pgTAP and Deno tests |
| `cad5ce9` | App: "Respond again" in the + sheet; Respond always opens the camera |
| `5c00aed` | Record: Pause and Resume; interruptions pause and keep what was recorded |
| `0bffcbc` | video-stitcher (iOS): fix a crash when a stitch fails; harness checks Pause/Resume joins |
| `c9e0edf` | SPEC.md and DECISIONS.md |
| (this) | This report, the expected schema fingerprint, screenshots, BETA-READINESS 33 |

## 1. What was built, and the root causes addressed

### 1a. Several responses per prompt

**Where the old rule lived.** It was enforced in three places, nowhere else:

- the unique index `responses_one_per_prompt` on `(prompt_id, author_id)` over processing, live and,
  since `20261016000300`, removed responses;
- an explicit `already_responded` check in `post_response` (and a handler turning the index's
  `unique_violation` into `already_responded`);
- the same check and handler in `publish_draft` (a first-response draft going live).

No trigger enforced it. The app copied it in `lib/responded.ts` and `ui/recordEntry.tsx`: the +
sheet's grey "Responded" pill, and a sheet instead of the camera on every Respond.

**Migration `20261019000200_multiple_responses.sql`:**

- Drops the unique index. A plain index with the same columns and predicate replaces it, so lookups
  keep their plan.
- `post_response` and `publish_draft`: the same bodies without the check and the handler.
- `prompt_card.faces`: the three most recent responders, **each once**. A latent bug the change would
  have exposed: the face strip took the authors of the three newest responses, so one person with
  three responses became one face three times. The app also keys those avatars by profile id, so it
  would have rendered duplicate React keys too.

**Audited and unchanged, because they were already per-response:**

- Feeds: Home shows one conversation per prompt; Following lists each response.
- The player lists every response, in the spec's order.
- `response_count`, profiles and their counts, and the Activity grouping ("Maya, Adam and 2 others"
  counts distinct people).
- Comments, likes and video replies are keyed by response.
- Pins, push notifications ("People you follow respond" is Off by default; each new response is a
  new item), the web player, analytics ("weekly responders" counts distinct people).

**What still stops duplicates and abuse (unchanged, and tested):**

- **One row per submission.** The same recording posted again returns the first row (`replayed`). The
  same submission with any other request is `submission_conflict`. A replay of a removed, deleted or
  abandoned video is `submission_closed`.
- **One row per upload.** An upload can be claimed once, with or without a submission id (older
  builds).
- **Upload limits:** 10 an hour, 30 a day, 3 unused per account. These now also cap how fast anyone
  can add responses.
- **Account enforcement:** suspended, posting paused and deleted accounts cannot post, not even a replay.
- **Moderation:** a removed video stays removed, with its action, reason, note, notice and review.
  It no longer refuses a *different* video. Restores can no longer collide with anything.
- **Data:** no row is changed by the migration.

**App:**

- The + sheet shows **Respond again** (Nemat's wording) on prompts the member has responded to. It
  is a tappable pill, lighter than Respond, so an answered prompt still reads as answered.
- Respond on Home, the player, the end card, Me and Activity opens the camera.
- P7/P8 (a recording still waiting or posting) is unchanged.
- `lib/responded` now only decides that label: the member's own live and processing responses, plus
  responses accepted on this phone.
- The never-deployed `viewer_responded` proposal is withdrawn: it reported the old rule.
- The P2 line for `already_responded` stays, but only an older server would trigger it. That keeps a
  clear message if the app update ever lands before the migration.

### 1b. Pause and Resume

**Reuse.** Recording was already segment-based: a camera flip ends one expo-camera recording, keeps
its file, and starts the next. Post Review joins the segments with the native `video-stitcher`
module, which was already in the installed build. Pause and Resume end and start segments the same
way, so paused time is never in any file.

**The take** (`video/recorder.ts`, pure and unit-tested):

- `idle → recording ⇄ paused`, with `flipping` from either.
- The timer, the ring, the 30-second limit and PR-Short all run on the segments' total. Paused time
  is never counted.
- **Pause** stops the timer at the tap, before the camera hands the file back. Resume waits until
  that file is kept. A Pause in a segment's first 0.5 s is taken at 0.5 s, because a shorter segment
  may hold no frame.
- **Resume** needs at least 1 s of the 30 left, because Android's camera limit is whole seconds. Below
  that, only Stop.
- **Stop** works while recording, while paused, and during a flip.
- **Flip** works while recording (as before) and while paused, without recording anything.
- **Zoom and Light** work in every state. The torch is re-applied at each segment's start, as
  expo-camera drops it.
- **Interruptions now pause instead of ending the take**, with every segment kept: the app going to
  the background, the camera ending a segment by itself (a call), a resume whose camera fails, a
  segment the phone cannot store (full disk), and a camera that does not come back after a flip.
- On iOS, a fresh camera is mounted before Resume is offered again. This is the same remount a flip
  has used since 16 Oct.
- **The 30-second limit:** reaching 30 s of footage ends the take for review. A segment the camera
  ends at its own limit completes the take rather than pausing it.
- **Cancel** (X, or Android Back) during a take pauses it and asks PR-Discard's question ("Discard
  this recording? / It won't be saved anywhere."). The whole take is deleted only on Discard. Post
  Review keeps Re-record and Discard for the whole stitched recording.

**Controls (R-Record and Record-Reply)**, built as a proposal: **not on a board**.

- **Centre button:** Record (red dot), then Pause while recording (red disc with the pause sign),
  then Resume while paused (red dot).
  - The ring shows recorded time of 30 s and holds still while paused.
  - Right thumb on the same spot for Pause and Resume.
- **Stop:** the left button, a red square in a glass circle.
  - It is away from the thumb that pauses, so a Pause does not land on Stop.
  - Stop goes to Post Review, never straight to deletion.
- **Light:** moves top right, so it is reachable in every state. This is the slot the stability
  report's proposal (section 5) suggested.
- **Flip:** stays beside Record. **Zoom** stays above it.
- **Paused state:** the red "● 0:12" timer becomes a grey "‖ Paused · 0:12" pill. Paused never looks
  like recording.

**Root cause fixed on the way: a crash in the native stitcher's failure path** (`0bffcbc`).

- The macOS harness crashed in 2 of 3 runs on the base commit, at its "writer fails mid-encode"
  check.
- The crash report showed SIGTRAP in `CFRelease`, under `-[AVAssetReader cancelReading]`.
- **Cause:** when the writer fails, the video copy and the audio copy both fail, each on its own
  queue, and both called `abortAll`. Two concurrent `cancelReading` calls over-release inside
  AVFoundation.
- **When it happens on a phone:** an encoder iOS invalidates after the app goes to the background
  during Post Review's stitch, or a full disk. The result is an app crash.
- With Pause/Resume, stitching becomes the common path rather than the flip-only path.
- **Fix:** the abort runs once, and the later cancel runs only while still reading.
- **Result:** 10 of 10 harness runs pass all checks.
- **This is native code:** it changes the app's runtime fingerprint (section 4).

## 2. Database changes and compatibility

- **One new migration**, `20261019000200_multiple_responses.sql`. **Rollback:**
  `supabase/rollback/20261019000200_multiple_responses.down.sql`, which restores the old index and
  the three function bodies verbatim.
- **The hosted project is at 24 migrations** (latest `20261016000204`). Batch C was **never
  deployed**:
  - `20261016000300_response_slot_moderation.sql`: the response slot, now superseded;
  - `20261016000301_admin_moderators.sql`: the moderation admin's service-role table and functions.

  `20261019000200` sorts after both, so a normal `supabase db push` applies all three in order.
  Rehearsed (below).
- **Server and app compatibility,** in every order:

  | App | Server | Result |
  | --- | --- | --- |
  | Old (installed) | New | Works. The old app still labels answered prompts "Responded" and stops Respond at its sheet. It never sees a refusal it does not know. |
  | New | Old | Respond again records, and Post is refused with `already_responded`. P2 says "You've already responded to this prompt." Avoid by deploying the database first. |
  | New | New | The intended state. |

- **Old builds without submission ids** (before 13 Oct): a repeated post with the same upload is now
  `upload_already_used` instead of `already_responded`. Still no duplicate.
  - The only installed build sends submission ids.
- **Rollback limits:**
  - Before anyone has two responses on one prompt, the rollback applies cleanly. Verified: the old
    pgTAP suite from `e916398` passes after it.
  - Once someone has two, it refuses with the list and changes nothing. Which response stands is
    then a product decision, not something a rollback may make.
  - The app can always be rolled back on its own.
- **Lock:** the push takes a brief lock on `responses` for the index swap. The table is small.

## 3. Test results

| Check | Where | Result |
| --- | --- | --- |
| Typecheck, lint | Mac | clean |
| Jest | Mac | **41 suites, 527/527** (507 at the base) |
| pgTAP, full suite | isolated stack `shortcut-mr` | **22 files, 1,701/1,701** |
| pgTAP `0030_multiple_responses` | same | 97 cases, listed below the table |
| Deno integration | same stack, fake Mux | all pass: idempotency 13 (with a new case: three recordings posted at once to one prompt make three rows, each replayable), uploads 32, abandon 16, integration 20, clean-up 28 |
| Deno unit | Mac | all pass (abandon 4, admin authz 18, clean-up 11, client 5, mux 21, web links 7) |
| Take state machine (`take.test.ts`) | Mac | **46/46**: 23 existing; 3 interruption cases rewritten (they now pause); 20 new (founder's example 7 s + 5 s + 8 s = 20 s with 15 s and 60 s pauses; ten cycles; timer stops at the tap; double Pause; 0.5 s rule; per-resume camera limit on iOS and Android; 30 s via the timer and via the camera's limit; resume refused under 1 s; flip while paused; failed switch while paused; Stop while pausing and while paused; PR-Short across pauses; Cancel while paused; background while recording and while paused; failed resume; full disk on a later segment; flip/pause collisions) |
| Stitcher harness (the same Swift on macOS AVFoundation) | Mac | **34/34, 10 of 10 runs** (base: crashed 2 of 3). New Pause/Resume case: 10 segments of 0.7 to 3.1 s, cameras alternating, a tone each. Duration 15.800 s = the sum; sound spans 15.800 s; each segment's middle carries its own tone; every tone change lands **within 8 ms** of its video join; 478 frames for 474 recorded (the composition's 30 fps grid adds at most one per join; no gap over 33.3 ms) |
| Rollback | stack | Refuses with the list when two responses exist. On a clean database: applies; the old suite (e916398) passes; the forward migration again passes the new suite |
| Hosted-path rehearsal | stack | 24 migrations plus seed, the batch C pre-check empty, then 0300 → 0301 → 20261019000200 applied on existing data; 1,701/1,701. Schema fingerprint identical to a clean 27-migration build: **866 objects**, `docs/release/mr-expected-27-migrations.fp` |
| iOS simulator build (Debug, all native modules including the stitcher fix) | Mac | BUILD SUCCEEDED |
| Founder Release build | Mac | section 4 |

What `0030_multiple_responses` covers:

- Three independent responses from one account to one prompt, each with its own caption, upload and
  submission.
- Feeds, counts, faces each once, Home once, Following three, profile and count three, Activity
  grouped.
- Likes, comments and replies per response.
- Replay; `submission_conflict`; `upload_already_used`, including for older builds; limits.
- Moderation: removed stays removed, its record intact, a different video allowed, a pending review,
  a reversal, removed-while-processing.
- Author deletion of one response leaves the others.
- Restricted, suspended and deleted accounts refused.
- Drafts publishing beside existing responses; replies; purge and tombstones.

### Simulator walk (iPhone 18 Pro simulator, iOS 27; isolated stack; fake Mux)

The simulator has no camera. A **temporary, never-committed** stand-in replaced only expo-camera's
`recordAsync` and `stopRecording`: each "recording" hands back one of the harness's generated clips.
Everything else was the real app on the real build: the screen, the take logic, the native stitcher,
Post Review, posting and the server. The stand-in was removed before any commit or build
(`git status` clean).

1. **+ sheet, as seed member Adam:** "Respond again" on exactly his two answered prompts, Respond on
   the rest ([01](screenshots/multi-response-pause-19oct/01-plus-sheet-respond-again.jpg)).
2. **Respond again** opened the camera ([02](screenshots/multi-response-pause-19oct/02-record-idle-respond-again.jpg)).
   So did Respond on Home, on a prompt he had answered.
3. **Record:** red "● 0:02", the ring, Pause in the centre, Stop on the left
   ([03](screenshots/multi-response-pause-19oct/03-recording.jpg)).
4. **Pause:** the grey "Paused · 0:11" pill, Resume. The timer and ring were unchanged 8 s later
   ([04](screenshots/multi-response-pause-19oct/04-paused.jpg)).
5. **Flip while paused:** switched to the back camera, still paused, at the same total.
6. **Resume** on the back camera, then Pause at 17.4 s (logged by the take).
7. **X:** PR-Discard's question; **Cancel** kept the take, paused
   ([05](screenshots/multi-response-pause-19oct/05-cancel-asks.jpg)).
8. **Stop:** Post Review played **one stitched file**
   ([06](screenshots/multi-response-pause-19oct/06-review-stitched.jpg)).
   - Measured: 5.500 s, exactly the two clips (3.1 s + 2.4 s); one video and one audio track; sound
     5.500 s; 1080×1920 upright.
   - The segment files were deleted only after the stitched file was kept.
9. **Post:** the server accepted **Adam's second response to the same prompt**, a new processing row
   beside his live one.
   - The upload then failed against the fake Mux, as designed: P1, "didn't post / Retry"
     ([07](screenshots/multi-response-pause-19oct/07-second-response-accepted-upload-fake.jpg)).
   - **Retry made no third row.** The new row has exactly one submission record.
10. **Discard (P4)** removed it and its files.
11. **Home button mid-take, then back:** the take was paused at 0:03 with its segment kept, and
    Resume was available ([08](screenshots/multi-response-pause-19oct/08-back-from-background-paused.jpg)).
12. **X → Discard:** the take folder and the recordings folder were empty.

**Durations on the simulator:** the take recorded 17.4 s by its own timer while the stitched file
was 5.5 s. The stand-in's clips have fixed lengths and are not real camera time. On the phone, each
segment is real camera time.

**Simulator caveat:** in a batch of parallel taps the simulator delivered two taps as one two-finger
touch, which the pinch-to-zoom layer correctly took. Taps sent one at a time all registered.

### Not run, and why

- **Anything with a real camera:**
  - real segment durations and how close the timer is to the file;
  - the torch across segments;
  - zoom while paused and on resume;
  - real audio across joins;
  - the iOS camera remount after backgrounding;
  - a phone call mid-take.
- **The iOS stitcher on iOS hardware.** The harness runs the same Swift on macOS, and the
  simulator ran it on iOS x86/arm simulator frameworks.
- A real Mux upload. Android, which has never run.

**Duration accuracy, a known approximation:**

- The timer counts from the moment Conga asks the camera to record. iOS starts writing a little
  later, so each segment's file can be up to a few hundred ms shorter than the timer.
- Many pauses add that up. The timer can read 0:30 for a slightly shorter video, never a longer one.
- The server takes Mux's measured duration when the video is ready (`mux-webhook`), so the posted
  length is the real one.
- **Measure this on the iPhone (step 4 of section 6).**

## 4. Native build readiness

**Runtime fingerprints** (`expo-updates runtimeversion:resolve`, founder settings):

| Commits | iOS runtime | Delivery |
| --- | --- | --- |
| `cad5ce9` + `5c00aed` (Respond again; Pause/Resume) | `a64bc144e306e405f6845ff316e48968dd83bf84`, **the installed build's** | an EAS Update could carry them |
| plus `0bffcbc` (stitcher fix) | `593205d5b48fd2ed8dd7456ff16a60faecf84634` | **needs a new build** |

**Founder Release build.**

- `founder-ios.sh release` with `INSTALL=0` could not resolve your iPhone as a destination: it is
  "unavailable" (not connected or locked).
- The same prebuilt founder project was then built for `generic/platform=iOS`, signed with the
  Personal Team profile, from `c9e0edf`. Result: see "Founder build result" at the end of this file.
- It was not installed.

**Recommendation: install the new build, not an EAS Update.**

- It carries the stitcher crash fix.
- Pause/Resume makes stitching the normal path. The crash fires in the background and failure path
  that a real tester will hit.
- Installing over `app.shortcut.founder` with the same team keeps your sign-in and data.

## 5. Hosted changes that need your approval

Nothing below has been done. Each item needs your go-ahead when it runs.

1. **Database push:** `20261016000300`, `20261016000301`, `20261019000200` in one push.
   - **Pre-check, read-only, must return no rows:**
     ```sql
     select author_id, prompt_id, array_agg(id) from public.responses
      where kind = 'response' and status in ('processing', 'live', 'removed')
      group by 1, 2 having count(*) > 1;
     ```
   - **Dry run:** `supabase db push --linked --dry-run` from a `git archive` of the approved commit. It
     must list exactly those three files, in that order.
   - **Push:** `supabase db push --linked`.
   - **Verify, read-only:** `scripts/schema-fingerprint.sql` on hosted, line for line equal to
     `docs/release/mr-expected-27-migrations.fp` (866 lines). The founder's response and ledger rows
     unchanged.
   - **Why batch C goes too:**
     - 0300 is fully superseded but must run before 0200 for history.
     - 0301 adds only service-role tables and functions for the not-yet-deployed admin (H7).
     - Leaving them out would force an out-of-order `--include-all` push later.
2. **App, either:**
   - **(a) Recommended:** install the new founder Release build over the current one:
     ```bash
     xcrun devicectl device install app --device 00008150-00095DC03A61401C "<path printed at the end of this file>"
     ```
     The iPhone must be unlocked and connected.
   - **(b)** Publish a JavaScript-only EAS Update to `founder` from a commit **without** `0bffcbc`
     (runtime `a64bc144…`). It reaches the installed app with no reinstall, but without the crash fix.
3. **Git:** push `claude/conga-multiple-responses-257d13` to the remote.
4. **Not needed:** no Edge Function, secret, Mux, Cloudflare or DNS change. No real Mux asset is
   created by any step above. Your own test recordings will create them, as any post does.

**Order:** 1, then 2. The database must accept several responses before the app offers Respond
again. The reverse order shows a refusal on Post, not a crash.

**Rollback:**

- **App (build):** reinstall the current build. It still exists:
  ```bash
  xcrun devicectl device install app --device 00008150-00095DC03A61401C /Users/nemathsnv/Projects/shortcut/.claude/worktrees/conga-iphone-bugs-ux-6cf82a/app/ios/build/Build/Products/Release-iphoneos/Conga.app
  ```
  It is runtime `a64bc144…`, so it picks up the published update `95dfedbb` again. Data is kept.
- **App (if option b was used):** `eas update:roll-back-to-embedded` for runtime `a64bc144…`
  (`IPHONE-STABILITY-19OCT.md` section 9), or republish `95dfedbb`.
- **Database:**
  - While nobody has two responses on one prompt, apply the rollback file as a new forward
    migration.
  - After that it refuses, by design. Decide which responses stand first.
  - The old app works against the new server, so the app can be rolled back alone at any time.

## 6. One coordinated rollout and iPhone test

**Before:**

- The iPhone unlocked, on Wi-Fi.
- Note one prompt you have already responded to.

**Rollout:**

1. Approve and run the database steps (5.1). Check the fingerprint.
2. Approve the app step (5.2a). Install the build, open Conga, check you are still signed in.

**Test on the iPhone 17 Pro**, all on the hosted project. Each Post creates a real Mux asset; delete
test videos from Me afterwards.

1. **+ sheet:** answered prompts show "Respond again"; unanswered show "Respond".
2. **Respond again** on an answered prompt opens the camera, with no "already responded" sheet. Also
   from Home's Respond, the player and the end card.
3. **The founder's example:**
   - Record about 7 s, Pause, wait about 15 s.
   - Resume about 5 s, Pause, Resume about 8 s, Stop.
   - While paused, the pill reads "Paused" and the time does not move. While recording, the red
     timer runs.
4. **Post Review plays one clip of about 20 s** (not 35): no paused time, no black frames, and the
   sound in step with lips at every join. Note the clip length against the timer's 0:20.
5. **Post.** It goes live. The prompt now has two of your responses: the player shows both, Me lists
   both, and your face appears once on the prompt's face strip.
6. **Flip while recording and while paused,** then Resume. Each part comes out upright, the front
   camera mirrored as recorded.
7. **Zoom:** pinch or 1×/2× while paused, then Resume. The zoom holds. A flip starts the other camera
   at 1×.
8. **Light** (back camera), on before Record and then toggled while paused. The torch is on in every
   segment after Resume.
9. **Leave the app mid-take** (home swipe), come back:
   - the take is paused, nothing lost;
   - Resume works after a moment (the camera restarts);
   - Stop gives the whole clip.
10. **A phone call or Siri mid-take** (if convenient): the take pauses and keeps what was recorded.
11. **30-second limit:** record in several parts until the ring is full. It goes to Post Review by
    itself at 0:30 of footage.
12. **Under 2 s:** Record 1 s, Pause, Stop. "Keep going: responses are at least 2 seconds", and
    nothing is reviewed.
13. **Accidental-press checks:**
    - X during a take asks "Discard this recording?"; Cancel keeps it.
    - Pause and Resume quickly several times: no stop, no lost part.
14. **Video reply:** the same Pause/Resume on a reply (Record-Reply).
15. **Discard** on Post Review deletes the whole recording.
16. **Duplicate protection:**
    - Post with mobile data switched off just after tapping Post. Retry when back online.
    - Exactly one new response appears.

Report anything off with the step number. Screenshots or a screen recording of steps 3, 4 and 9
help most.

## 7. Decisions for Nemat

1. Approve 5.1 (the database push, with batch C).
2. Approve 5.2: (a) the new build, recommended; or (b) the EAS Update without the crash fix.
3. **The camera controls as built** (section 1b; screenshots 03 to 05): approve, adjust, or have a
   board drawn. They are not on a board.
4. **Copy not on a board:**
   - "Respond again": your word, but no board yet.
   - "Paused".
   - PR-Discard's words reused for X during a take.
5. **Spam ceiling:** several responses per prompt are now limited only by the upload limits (10 an
   hour, 30 a day). That is enough for the closed beta in my view. Say if you want a per-prompt cap.
   **None was added**, because the spec has no such rule.
6. **SPEC.md** is revised locally (sections 2, 6, 7, 24). The online master spec still says one
   response per prompt; update it before the next export.

## Founder build result (19 Oct, not installed)

- **BUILD SUCCEEDED** from `c9e0edf` (code identical to `0bffcbc`).
  - `founder-ios.sh` prebuild with `.env.founder`.
  - Then `xcodebuild … -configuration Release -destination 'generic/platform=iOS' -allowProvisioningUpdates`.
- **App:** `app/ios/build/Build/Products/Release-iphoneos/Conga.app` in this worktree
  (`/Users/nemathsnv/Projects/shortcut/.claude/worktrees/conga-multiple-responses-257d13/app/...`).
- **Identity:** bundle `app.shortcut.founder`; team `BP7TM32HCQ`, the same as the installed build, so
  installing over it keeps your sign-in and data.
- **Runtime:** `EXUpdates.bundle/fingerprint` is `593205d5b48fd2ed8dd7456ff16a60faecf84634`.
- **Profile:** includes the iPhone `00008150-00095DC03A61401C`. It **expires 24 Oct 2026 16:19 UTC**
  (free Personal Team, 7 days), so install and test before then, or rebuild.
- **Bundle checked** (Hermes, 4.1 MB):
  - hosted project `picvoavfxnajfjkqawju`, an `sb_publishable_` key, links on `conga.churntech.com`;
  - no local-stack address (the one `127.0.0.1` string is inside a library error-message blob, also
    present in the installed build);
  - no simulator stand-in; "Respond again" present.
- **Install, after the database push:**
  ```bash
  xcrun devicectl device install app --device 00008150-00095DC03A61401C "/Users/nemathsnv/Projects/shortcut/.claude/worktrees/conga-multiple-responses-257d13/app/ios/build/Build/Products/Release-iphoneos/Conga.app"
  ```
  ```bash
  xcrun devicectl device process launch --device 00008150-00095DC03A61401C app.shortcut.founder
  ```

## Deployed and installed (19 Oct 2026, Nemat approved)

### Preflight (read-only, before approval)

| Check | Result |
| --- | --- |
| Hosted migrations | 24, latest `20261016000204` |
| Hosted schema fingerprint | `847\|8bddf2614e7c2d55acfcd10d951dddc5`, equal to `h4-expected-24-migrations.fp` |
| 0300 pre-check (members with two counted responses on one prompt) | 0 |
| Objects the migrations create | none present yet; the old unique index present |
| Mux clean-up switch | `off` |
| Dry run | exactly the three files, in order; seeds `[]`, roles `[]` |
| Top-level statements in the three files | no `update`, `delete`, `insert` or `truncate` of existing rows |

**Backups.** The project has no managed backups and no point-in-time recovery (free plan, open since 9 Oct).

- A logical dump was taken instead (`supabase db dump --linked`, schema plus data).
- It was restored into a local stack built from the same 24 migrations: every count and content
  hash equalled the hosted values.
- The three migrations were then applied to that restored copy of the real data. The data was
  unchanged, and the fingerprint was the expected `866|f702387b…`.
- **Restore procedure, tested:**
  1. Truncate the tables named in the dump's `COPY` statements, with cascade.
  2. Load `data.sql` as `supabase_admin` with `session_replication_role = replica`, in one
     transaction.
- The dumps hold personal data and are kept only on Nemat's Mac, owner-only, outside the repository.

### Deployment (14:19 UTC)

1. A fresh dump was taken immediately before the push, and every pre-check was repeated with the same
   results.
2. Pushed from a clean `git archive` of `2da3046` (checksums `a94f421d…`, `e3ec0781…`, `158e392a…`):
   `20261016000300_response_slot_moderation.sql`, `20261016000301_admin_moderators.sql`,
   `20261019000200_multiple_responses.sql`.

### Verification (read-only, all PASS)

| Check | Result |
| --- | --- |
| Migrations | 27, latest `20261019000200` |
| Fingerprint | `866\|f702387b293eeb80b24655fe6efa727d`, equal to `mr-expected-27-migrations.fp` |
| Data baseline | unchanged: responses 5 (`61b1dbe1…`), moderation actions 2 (`c5ed6186…`), uploads 15 (`2202ef1e…`), submissions 1, comments 0, likes 0, accounts 2, analytics 175 |
| `responses_one_per_prompt` | gone |
| `responses_author_prompt_idx` | present, not unique |
| `post_response` | no `already_responded`; still runs `submission_replay`, `claim_video_upload`, `assert_can_post` |
| `post_response` grants | `anon` no, `authenticated` yes |
| `moderators` | empty, no member access |
| Mux clean-up switch | still `off` |

### iPhone

- The signed founder Release build (runtime `593205d5…`, built from `c9e0edf`) was installed over
  `app.shortcut.founder` on the iPhone 17 Pro with `devicectl`, then launched.
- It was still running 8 s later.
- The app's sign-in and data are not visible from here: confirm on the phone.

### Not done

No Mux asset, EAS Update, Git push, Edge Function, secret or other hosted change.

**Next:** the iPhone test in section 6.
