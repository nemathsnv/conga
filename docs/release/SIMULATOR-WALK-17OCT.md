# Simulator walk (17 Oct 2026)

**What this is:** one pass through the beta journeys on the iOS simulator, to check today's fixes
(code paste, D1/D2 session fixes, players stopping under other screens, the player sheet stack,
SF-Reported dismissal, Home tab switching). **What it isn't:** a device test. Nothing was recorded or
posted (no camera feed on the simulator, no Mux on the local stack), and no push, Android or
VoiceOver check was made. No product code was changed.

## Setup

| | |
| --- | --- |
| Code | `bdfb749` ("Me → Replies: regression test…"), branch `worktree-agent-a20cc8079ad742974` |
| Build | `npm ci`, `expo prebuild -p ios --clean`, `xcodebuild … -scheme Conga -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator'`: **BUILD SUCCEEDED**. Installed fresh as `app.shortcut` (old copy uninstalled, privacy permissions reset) |
| Simulator | iPhone 18 Pro, iOS 27.0; development build with Metro (`expo start --dev-client --port 8090`) |
| Backend | `supabase start` on a scratch copy of `supabase/` as project `shortcut-walk` (API 55601, DB 55602, Mailpit 55604, shadow 55600, pooler 55609, analytics 55608, inspector 55610; studio, analytics, realtime off). All 26 migrations and `seed.sql` applied. The worktree's own `app/.env` (git-ignored, not committed) pointed at `http://127.0.0.1:55601` with that stack's anon key and `EXPO_PUBLIC_DEV_TOOLS=0`. Stack stopped at the end (`supabase stop --project-id shortcut-walk --no-backup`). The founder stack `shortcut` was not touched |
| Account | new account `walkerc@example.com`; codes read from the stack's Mailpit; invite `TEST-OK1` by link |
| Links | **`app.shortcut://…`, not `shortcut://…`.** The founder Release build (`app.shortcut.founder`) on the same simulator also registers `shortcut` (and `exp+conga`), so `shortcut://` asks "Open in Conga?" and may open the founder build, which talks to the hosted project. `app.shortcut` is registered only by this Debug build, and expo-router reads the path the same way. The founder app's running process was ended once (not uninstalled or changed) |
| Input | taps and typing through the iOS Simulator MCP tool. Taps sent while the app animates are often lost; each step was checked by screenshot and repeated where needed. Typing with no field focused reaches the development key commands (one reload and the performance monitor, both undone; not product behaviour). The development "Tools" button covered the sheets' ✕ and was switched off in the dev menu |
| Playback checks | a small script read the progress line and a grid of pixels from 3 to 6 screenshots taken 0.4 to 1.3 s apart: a moving line and changing pixels mean playing. The first screenshot after a quiet spell always shows the clip at 0 (the headless simulator doesn't render while nobody looks); only later frames were used |

Screens are compared with the boards' html (copy) and jpg (layout) in `design/`. "Matches" means
same copy, same controls, same order; not pixel-checked. The seed's clips are 3.6 to 5.5 s long, which
matters for row 3.

## Walk

| # | Step | Board | Seen | Result | Shot |
| --- | --- | --- | --- | --- | --- |
| 1a | Welcome | O-Welcome | Copy word for word | matches | [01](screenshots/walk-17oct/01-welcome.jpg) |
| 1b | Email, code | O-Email | Code sent; 6 boxes, "Sent to …", "Resend code in 0:51" counting down | matches | [02](screenshots/walk-17oct/02-email-code.jpg) |
| 1c | **Paste the code** (`688 941` with a space, through `simctl pbcopy`, long-press the first box) | O-Email | Long-press offers **Paste** (and AutoFill). Paste fills all six boxes `6 8 8 9 4 1`; Continue enabled and signs in | **fixed** (6a30b91) | [03](screenshots/walk-17oct/03-code-paste-menu.jpg), [04](screenshots/walk-17oct/04-code-pasted.jpg) |
| 1d | Age | A-Age | Copy word for word | matches | [05](screenshots/walk-17oct/05-age.jpg) |
| 1e | Invite gate, then `app.shortcut://i/TEST-OK1` | O-Invite | Gate matches; the link goes straight to O-Profile | matches; works | [06](screenshots/walk-17oct/06-invite.jpg) |
| 1f | Name and username, photo skipped | O-Profile, O-Photo | "Available" check; step 2 of 2; Start watching | matches | [07](screenshots/walk-17oct/07-profile-step.jpg), [08](screenshots/walk-17oct/08-photo-step.jpg) |
| 1g | Home | Main | For you, Maya's response playing (progress line moving, frames changing) | works | [09](screenshots/walk-17oct/09-home.jpg) |
| 2a | For you → Following → For you | X-Following-Empty | Following shows the empty state word for word; For you comes back with the same response, playing. Three switches, each ~1 s apart, always the right list | works (see Not covered: a sub-second switch) | [10](screenshots/walk-17oct/10-following-empty.jpg) |
| 2b | Home button, 5 s, back | — | Same process (pid unchanged); video plays again (line 419 → 921 → loops) | works | [11](screenshots/walk-17oct/11-home-after-background.jpg) |
| 3a | "3 more responses" → player, Adam's face → Comments | Comments | At open: Adam's response in the top third, chrome hidden, "3 comments", the video-replies card, comments | matches at open | [12](screenshots/walk-17oct/12-player.jpg), [13](screenshots/walk-17oct/13-comments.jpg) |
| 3b | Comments left open | Comments, SPEC 8 ("keeps playing in the top third") | **When Adam's clip ends (≈0.5 s after the shot above), the player moves on to Sofia (3 of 4) under the sheet.** Sofia's page is paused (frames frozen), and the player chrome (prompt header, face strip, "3 of 4") comes back on top of the sheet's "Adam Novak · …" line, overlapping it. Reproduced three times | **defect D-A** | [14](screenshots/walk-17oct/14-comments-player-advanced.jpg) |
| 3c | Comments → video-replies card | Replies | Replies opens ("3 video replies", "Replies to Adam Novak", grid, "Reply to Adam · On video, up to 30 seconds"); the video behind pauses and dims. **The top strip shows the Comments line and the player's prompt header and "2 of 4" drawn over each other**; the board shows only the dimmed video | pause/dim works; **defect D-B** (overlap) | [15](screenshots/walk-17oct/15-replies-from-comments.jpg) |
| 3d | Close Replies (✕) | Comments | Back to the Comments state: chrome hidden, Adam playing (pixels change). Then D-A again when the clip ends | **fixed** (5bff5e7) | [16](screenshots/walk-17oct/16-comments-after-replies-closed.jpg) |
| 3e | Close Comments | R-Player | Chrome back, playing | works | [17](screenshots/walk-17oct/17-comments-closed-chrome-back.jpg) |
| 4 | Player (Sofia, 3 of 4) → tap "Sofia Marín" → profile, 22 s, Back | R-Profile | **How checked:** audio can't be heard on this setup. If the player kept playing under the profile it would have moved on to Putu (5.5 s) and the end card within 10.5 s, as it does when left alone. After 22 s on the profile, Back showed the player **still on Sofia, 3 of 4, progress line at 0** (pausing rewinds), then it played on. So the player stopped while covered | **fixed** (8ec3c51) | [18](screenshots/walk-17oct/18-profile-from-player.jpg), [19](screenshots/walk-17oct/19-player-after-profile-back.jpg) |
| 5a | Putu's response → share → Report response → Spam or scam | SF-Menu, SF-Report, SF-Reported | Copy word for word on all three; the report row is in `public.reports` (`spam`, `open`) | matches; works | [20](screenshots/walk-17oct/20-share-menu.jpg), [21](screenshots/walk-17oct/21-report-reasons.jpg), [22](screenshots/walk-17oct/22-reported.jpg) |
| 5b | Close "Thanks for telling us" by tapping the backdrop | SF-Reported | **Lands on Home (For you)**, not on the reported item | **fixed** (8c20a93) | [23](screenshots/walk-17oct/23-after-reported-backdrop.jpg) |
| 5c | Player after the report | R-Player-2, R-Player-End | Putu's face is gone (3 faces), but the counter says "1 of 4", the end card "You've seen all 4 responses" with 3 faces, Home "3 more responses" | hidden: works; **counts: defect D-C** | [24](screenshots/walk-17oct/24-player-after-report.jpg), [25](screenshots/walk-17oct/25-end-card-count-after-report.jpg) |
| 5d | Sofia → share → Block Sofia Marín → Block | SF-Block (they/their copy, DECISIONS 8 Oct) | Copy matches the decided wording. Back on Home; `public.blocks` has the row. Sofia's response is gone from the face strip; Adam's counts drop from 3 comments / 3 video replies to 2 / 2 | works; counts again D-C ("1 of 4" with 2 faces, "3 more responses" with 2 faces) | [26](screenshots/walk-17oct/26-block-confirm.jpg), [27](screenshots/walk-17oct/27-after-block.jpg), [28](screenshots/walk-17oct/28-player-after-block.jpg), [29](screenshots/walk-17oct/29-adam-counts-after-block.jpg), [30](screenshots/walk-17oct/30-home-counts-after-block.jpg) |
| 5e | Me → Settings → Blocked accounts → Unblock | LV-Blocked | Sofia listed; footer copy word for word; Unblock removes her at once (no confirmation, none on the board); `blocks` empty; her face is back on Home after the next load | matches; works | [31](screenshots/walk-17oct/31-me.jpg), [32](screenshots/walk-17oct/32-settings.jpg), [33](screenshots/walk-17oct/33-blocked-accounts.jpg), [34](screenshots/walk-17oct/34-unblocked.jpg) |
| 6 | Kill (`simctl terminate`) and relaunch | — | Still signed in, lands on Home | works | [35](screenshots/walk-17oct/35-relaunch.jpg) |
| 7a | **D1:** kill; `docker stop supabase_kong_shortcut-walk` (API answers nothing); launch at 17:12:24 | — | Black splash (17:12:48) | as designed | [36](screenshots/walk-17oct/36-api-down-launch.jpg) |
| 7b | Start the gateway again at 17:12:54 | — | **Home by 17:13:08** (≤ 14 s after the API came back), same process (pid 38485), not killed or relaunched | **fixed** (8d6a3e3) | [37](screenshots/walk-17oct/37-api-back-home.jpg) |
| 7c | **D2:** gateway stopped again, Settings → Sign out (17:13:41) | O-Welcome | **Welcome within 5 s.** Relaunched with the API back: still signed out | **fixed** (8d6a3e3). The token was fresh, so the ~25 s refresh-retry path wasn't exercised | [38](screenshots/walk-17oct/38-signout-offline-tapped.jpg), [39](screenshots/walk-17oct/39-relaunch-after-offline-signout.jpg) |
| 7d | Server side of the offline sign-out | — | `auth.sessions` for the account stayed at 1 after the offline sign-out (the server was unreachable). The next online sign-out (row 10) removed both sessions (2 → 0) | expected; see note N1 | — |
| 8a | `app.shortcut://u/sofiamarin` from Home, Back | R-Profile | Sofia's profile; Back → Home. "1 responses" (M2 of 16 Oct, still open) | works | [40](screenshots/walk-17oct/40-link-u.jpg) |
| 8b | `app.shortcut://r/<Adam's response>`, Back | R-Player | Response player on Adam, 1 of 4; Back → Home | works | [41](screenshots/walk-17oct/41-link-r.jpg) |
| 8c | `app.shortcut://p/<"Speak in every language">`, Back | R-Player | Player for that prompt, 1 of 1, Adam; Back → Home | works | [42](screenshots/walk-17oct/42-link-p.jpg) |
| 8d | `app.shortcut://nothing-here` from Home | (+not-found → Home) | Stays on Home | works | [43](screenshots/walk-17oct/43-link-unknown.jpg) |
| 8e | `app.shortcut://nothing-here` while Adam's profile (opened by `u/`) is on screen, twice | (+not-found → Home) | **Stays on the profile**; never reaches Home | **defect D-D** | [44](screenshots/walk-17oct/44-link-unknown-from-profile.jpg) |
| 8f | App ended, `app.shortcut://u/adamnovak` (cold), Back | — | Development launcher first (tap the recent project), then Adam's profile; Back → Home. No crash | works (development build) | [45](screenshots/walk-17oct/45-cold-link-u.jpg), [46](screenshots/walk-17oct/46-cold-link-back-home.jpg) |
| 9a | Respond (permissions reset at install) | R-Record | System camera prompt over the record screen, then the microphone prompt straight after; both allowed; no restart needed | works | [47](screenshots/walk-17oct/47-record-camera-prompt.jpg), [48](screenshots/walk-17oct/48-record-mic-prompt.jpg) |
| 9b | Record screen, both allowed | R-Record | Cancel, flip, prompt card "Responding · up to 30 seconds", Light, record, 1×, "Up to 0:30"; black preview (no camera feed) | matches | [49](screenshots/walk-17oct/49-record-idle.jpg) |
| 9c | Tap Record | — | `recordAsync` rejects with `SimulatorNotSupported`; the screen stays idle. **Nothing is shown to the user**; only the development LogBox toast for the `console.error`. Cancel → Home | as 16 Oct; see note N2 | [50](screenshots/walk-17oct/50-record-tapped.jpg) |
| 10 | Settings → Sign out (online) | S-Settings, O-Welcome | Settings copy matches (the board's "1 place" / "4 left" values don't show for this account, as on 16 Oct). Sign out → Welcome; `auth.sessions` 2 → 0 | works | [52](screenshots/walk-17oct/52-signed-out-welcome.jpg) |

Nothing crashed. The only red toasts were development LogBox entries: `expo-notifications` keychain
access (no entitlement in this unsigned simulator build) and the recorder error in 9c.

## Defects (none fixed during the walk; D-A, D-B and D-D fixed and re-walked afterwards, see Re-walk)

| | Severity | Step | Expected (board / SPEC) | Seen | Shot | Likely cause / suggestion |
| --- | --- | --- | --- | --- | --- | --- |
| **D-A** | **Medium** | 3b | SPEC 8: Comments "opens over the response, which keeps playing in the top third"; Comments board shows that response with no player chrome | When the response ends, the player auto-advances underneath the open sheet. The next response is paused (the sheet entry belongs to the previous one), the player chrome reappears and overlaps the sheet's author line, and the comments no longer match the video above them. Any response shorter than the time someone spends in Comments hits this (beta responses are up to 30 s) | [13](screenshots/walk-17oct/13-comments.jpg) → [14](screenshots/walk-17oct/14-comments-player-advanced.jpg) | `app/src/app/player/[promptId].tsx`: `ResponsePage` gets `loop={false}` and `onEnd={advance}` even when `sheet === 'comments'`. Loop (or hold) the current response while Comments is over it. Whether it loops or stops at the end isn't in SPEC: Nemat to decide |
| **D-B** | Low | 3c | Replies board: the response above the sheet is dimmed, with no text | With Replies opened from Comments, the Comments author line ("Adam Novak · Be honest…") and the player's prompt header and "2 of 4" are drawn on top of each other above the sheet | [15](screenshots/walk-17oct/15-replies-from-comments.jpg) | `chrome={!(i === index && sheet === 'comments')}` shows the chrome again when the top sheet is Replies, while the Comments header stays rendered underneath. Hide the chrome for any sheet over the page |
| **D-C** | Low | 5c, 5d | R-Player "2 of 23", R-Player-End "You've seen all 23 responses", Home "N more responses" count what you can watch | After a report or a block the hidden responses still count: "1 of 4" with 3 (then 2) faces; "You've seen all 4 responses" with 2 faces; Home "3 more responses" with 2 faces | [24](screenshots/walk-17oct/24-player-after-report.jpg), [25](screenshots/walk-17oct/25-end-card-count-after-report.jpg), [30](screenshots/walk-17oct/30-home-counts-after-block.jpg) | Counts come from the prompt's server count, the faces from the viewer's filtered list. Count the viewer's list (or have the server count per viewer). Needs a decision only if the total is meant to be global |
| **D-D** | Low-medium | 8e | An unknown link lands on Home (`+not-found.tsx` comment; brief) | From a pushed screen (a profile opened by link) an unknown link does nothing visible; the profile stays | [44](screenshots/walk-17oct/44-link-unknown-from-profile.jpg) | `+not-found.tsx` uses `<Redirect href="/" />`. The 16 Oct Back fix found that `replace('/')` from a pushed screen leaves that screen up and `replace('/(tabs)')` works; the same probably applies here (`href="/(tabs)"`). Check in a Release build too |

Still open from 16 Oct: **M2** ("1 responses" on profiles; needs singular copy).

### Notes (not defects)

- **N1.** Signing out offline removes the session on the phone only. The server session and its refresh
  token stay valid until they expire or the account signs out again online (which removed both here).
  Expected for an offline sign-out; worth knowing for a lost-phone story.
- **N2.** A recording that fails to start shows nothing to the person (on the simulator it's
  `SimulatorNotSupported`; on a device it could be a camera error). There is no board for it, so this is
  for Nemat to decide, not a bug.
- **Environment.** `shortcut://` links are ambiguous on this simulator while the founder build is
  installed (see Setup). On a phone with one build installed this doesn't arise.

## Not covered

- **Recording, posting, playback of your own video.** No camera feed on the simulator; no Mux on the local stack.
- **A sub-second For you / Following switch** (the race d60eee1 fixes). The MCP tool can't send two taps
  closer than about a second; when sent in parallel the second tap was dropped. Switches about a second
  apart always showed the right list. A unit test covers the race (`latest.test.ts`); a device check would settle it.
- **D2 with an expired access token** (the ~25 s refresh-retry path). The token was minutes old.
- **Audio.** Not observable here; row 4 relies on the player's position (method in the row).
- **A Release-build cold start from a link.** Only the development build, which puts its launcher in front.
- **Android, push, VoiceOver.**

## Re-walk of D-A, D-B and D-D (17 Oct, after the fixes)

Same simulator, Debug build and isolated stack setup as above (stack `shortcut-walk` restarted from the
same scratch copy; a fresh account `walkerd@example.com` signed in by a Mailpit code; Metro on port 8090 from
the integration worktree, with file watching on). Code: `c12724e` (D-A) plus the D-B and D-D commits that
follow it. Nothing else was walked again.

| Defect | Fix | Seen | Result | Shot |
| --- | --- | --- | --- | --- |
| D-D | Unknown links redirect to `/(tabs)` instead of `/` (`links.ts` `systemPathRedirect`, `+native-intent.tsx`) | Reproduced first with the old bundle: `app.shortcut://u/adamnovak`, then `app.shortcut://nothing-here`, the profile stays. With the fix the same two links pop the profile and land on Home (For you) | **fixed** | [53](screenshots/walk-17oct/53-dd-unknown-link-from-profile-home.jpg) |
| D-A | The response loops while Comments is over it and does not advance (`endsToNext`, `VideoSurface` applies `loop` changes) | Adam's 4.4 s response opened with Comments (`player/<prompt>?entry=<id>&openComments=1`); eight screenshots over about 12 s: the sheet stays on Adam's 3 comments, and the video area differs in every frame (playing, not stopped at the end). Closing Comments shows the chrome on Adam, 1 of 4 | **fixed** | [54](screenshots/walk-17oct/54-da-comments-after-12s-still-adam.jpg), [57](screenshots/walk-17oct/57-comments-closed-chrome-back.jpg) |
| D-B | The player draws no chrome under any sheet opened for the page (`pageShowsChrome`); the Comments line above its sheet shows only while Comments is the focused screen | Comments → "3 video replies": above the Replies sheet only the dimmed video, as on the Replies board. Closing Replies: the "Adam Novak · Be honest about the place you live." line is back above Comments | **fixed** | [55](screenshots/walk-17oct/55-db-replies-from-comments.jpg), [56](screenshots/walk-17oct/56-db-comments-after-replies-closed.jpg) |

Still open: D-C (hidden responses counted) and M2. Taps sometimes land on the page shown a moment
earlier when the seed's 3.6 to 5.5 s clips advance; an early tap here opened Comments for Sofia's response
instead of Adam's (the app did what was tapped). Not a defect.
