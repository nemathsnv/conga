# Integrated simulator walk (16 Oct 2026)

**What this is:** one pass through the integrated app on the iOS simulator, against an isolated local
Supabase stack. **What it isn't:** a device test. The simulator has no camera feed for expo-camera,
so no response was recorded or posted, and no push, Android or VoiceOver check was made.

## Setup

| | |
| --- | --- |
| Code | integration tip `90eced7` (Agents A, B, C, E, F) plus `06a6879` (flip guard), branch `worktree-agent-a9916f0138f4d4f98` |
| Build | `expo prebuild -p ios --clean`, `pod install`, `xcodebuild … Debug -sdk iphonesimulator` for the simulator below: **BUILD SUCCEEDED** (one build) |
| Simulator | iPhone 18 Pro, iOS 27.0, Xcode 27.1; development build with Metro (`expo start --dev-client`) |
| Backend | `supabase start` on a scratch copy of `supabase/` as project `shortcut-b` (API 55401, DB 55402, Mailpit 55404; studio, analytics, realtime off). All migrations and `seed.sql` applied. The app's local `.env` pointed at `http://127.0.0.1:55401` with that stack's anon key (not committed; restored afterwards). Stack stopped at the end (`supabase stop --no-backup`). |
| Account | new account `walkerb@example.com`, sign-in code read from the stack's Mailpit, invite `TEST-OK1` (seed) through `shortcut://i/TEST-OK1` |
| Fixtures | added on the local stack only, for two rows the seed can't reach: a video reply by the walk account (to Adam's response), and a live response with a playback id Mux doesn't know (to make playback fail) |
| Input | taps and typing through the iOS Simulator MCP tool. Typing drops every character after one that isn't on the keyboard's first layer (`-` on the email keyboard), so the email was typed without a hyphen and the invite came in by link. Taps were sometimes lost while the simulator was busy; those were repeated. |

Screens are compared with the boards' html (copy) and jpg (layout) in `design/`. "Matches" means
same copy, same controls, same order. It doesn't mean pixel-checked.

## Walk

| # | Step | Board | Seen | Result | Shot |
| --- | --- | --- | --- | --- | --- |
| 1 | Launch, signed out | O-Welcome | Collage, prompt card "What's something everybody loves that you hate? · 19 responses", Apple / Google / email, terms line | matches | [01](screenshots/01-welcome.png) |
| 2 | Continue with email, code | O-Email | "We'll send a code. No password to remember.", Change, 6 boxes, "Sent to …", "Resend code in 0:40" counting down; the code arrived in Mailpit and signed in | matches | [02](screenshots/02-email-code.png) |
| 3 | Age | A-Age | Copy word for word; Yes / No; under-18 note | matches | [03](screenshots/03-age.png) |
| 4 | Invite gate | O-Invite | "Closed beta", invite field, "Opened an invite link? You're already in.", Join waitlist, "Signed in as walkerb@example.com · Not you?" | matches | — |
| 5 | Invite link `shortcut://i/TEST-OK1` | (link) | Went straight to O-Profile | works | — |
| 6 | Name and username | O-Profile | Step bar 1 of 2, "Available" check, "You can change both later." | matches | [04](screenshots/04-profile-step.png) |
| 7 | Photo | O-Photo | Step 2 of 2, Take a photo / Choose from library / Start watching. Take a photo asked for camera access, opened the system camera (grey on the simulator), Cancel came back | matches, no crash | [05](screenshots/05-photo-step.png) |
| 8 | Home | Main | For you feed playing Maya's response, prompt card, Follow, rail, "3 more responses", Respond, tab bar | matches; rail counts not shown because the seed's counts on that response are 0 | [06](screenshots/06-home.png) |
| 9 | Respond → R-Record, mic **denied** | A-Mic | Prompt card, "Responding · up to 30 seconds", mic card copy word for word, Open Settings, record dimmed | copy matches; **icon mismatch** (M3, M4) | [07](screenshots/07-record-mic-off.png) |
| 10 | Mic **allowed** (permission reset; iOS ends the app on a permission change, so it was reopened) | R-Record | Cancel, flip, prompt card, Light, record, 1×, "Up to 0:30". Black preview: expo-camera has no camera feed on the simulator | matches (apart from M4) | [08](screenshots/08-record-idle.png) |
| 11 | Tap Record | R-Record | expo-camera rejects with `SimulatorNotSupported`; the take ends as `failed`, the screen goes back to idle, nothing is kept, no crash. The red box is the development-only LogBox for the `console.error` | as designed | — |
| 12 | Flip and Light while idle | R-Record | Flip switches camera (no feed to show it); Light on the front camera fills the screen white and fills the bolt; off again restores | works | [09](screenshots/09-record-front-light.png) |
| 13 | Cancel | R-Record | Back to Home | works | — |
| 14 | Me | X-Me-Empty | Name, @username, 0 / 0 / 0, Edit profile, Share profile, Responses / Replies, "Your responses show up here.", "Respond to tonight's prompt". The two "dev:" labels are `EXPO_PUBLIC_DEV_TOOLS=1` in the local `.env` | matches | [10](screenshots/10-me-empty.png) |
| 15 | **walk:** playback fails, then Try again | X-Unavailable | Response player (opened at the broken response): prompt header, "1 of 2", "This response isn't available", "It was deleted or removed.", Next response, "If it just didn't load: Try again". Try again requests the video again (Metro shows a new 404 for each tap) and lands on the same state | matches; works | [11](screenshots/11-playback-failed.png) |
| 16 | **walk:** link `r/<response id>` | (link) | **Opens the video reply player** for a response: "Video reply", an empty "Replying to" card, a "'s response" button with no name | **bug B1** | [12](screenshots/12-r-link-opens-reply-player.png) |
| 17 | **walk:** link `p/<prompt id>` | (link) | Response player for "Be honest about the place you live.", but at **2 of 4** (Adam), not the first | **mismatch M1** | [13](screenshots/13-p-link.png) |
| 18 | **walk:** link `u/<username>` | (link) | Sofia's profile: Follow, share, Responses 1 / Replies 1 | works; "1 responses" (M2) | [14](screenshots/14-u-link.png) |
| 19 | **walk:** back from a link that opened the app | — | With the app ended, `shortcut://u/adamnovak` opened the development launcher. After the project loaded, the app opened Adam's profile with nothing under it. **Back did nothing** (three taps; other taps on the screen worked) | **bug B2** (see the note on the development build) | [15](screenshots/15-back-stuck-after-link.png) |
| 20 | Back from a link opened while the app was running (`u/sofiamarin` from Home) | — | Back returned to Home | works | — |
| 21 | Unknown link `shortcut://nothing-here` | (+not-found → Home) | **A blank grey screen**, not Home; the app had to be ended and reopened | **bug B3** | [16](screenshots/16-unknown-link-blank.png) |
| 22 | **walk:** background and return | — | Home video playing; Home button; reopened after 5 s: the video plays (frames change, progress line moves) | works | — |
| 23 | **walk:** delete your own video reply | SF-Delete (no board for a reply) | Me → Replies 1 → the reply → More → "Delete your reply? It's removed from the conversation along with its comments. Video replies people sent stay on their own profiles." → Delete reply → the app goes to the Home tab; Me → Replies is empty; the row is `deleted` on the server | works; copy M5 | [17](screenshots/17-own-reply.png), [18](screenshots/18-delete-reply-sheet.png) |
| 24 | Settings | S-Settings | Name, Username, Email; Your feed: Places, Notifications; Closed beta: Invite people; Safety and help: Blocked accounts, Community guidelines, Help and feedback; Sign out; Delete account. The board's "1 place" and "4 left" values don't show for this new account | matches | — |
| 25 | Sign out (no unposted recording, so no LV-SignOut) | O-Welcome | Back to Welcome; the account's server session is gone (`auth.sessions`: 1 before, 0 after) | works | — |

## Crashes

| | What | Cause | Product code? |
| --- | --- | --- | --- |
| C1 | Twice (13:55 and 14:13), the app ended (`EXC_BREAKPOINT`) right after it was launched and then sent the development-client URL | `fatalError(AppContextLost)` in ExpoModulesCore `ExpoFabricView.injectInitializer`: the development launcher reloaded the bundle while native views were mounting | No. A development-client reload race (launch plus a second "open project" URL). It didn't recur when the app was launched once and left to reconnect. It can't happen in a release build, which has no launcher. Reports: `~/Library/Logs/DiagnosticReports/Shortcut-2026-10-16-135533.ips`, `…-141334.ips` |

Nothing in the product flows above crashed.

## Bugs and mismatches (none fixed here: the files are not mine)

| | Where | What | Suggested fix |
| --- | --- | --- | --- |
| **B1** | `app/src/app/r/[id].tsx` | Every `r/` link goes to the video reply route. `'status' in v ? null : v` treats every video as unavailable, because every video card has a `status` field (`live`). So `videoLinkTarget` gets `null` and falls back to `/reply/[id]`. Shared response links open the wrong player. | `v && !('status' in v && v.status === 'unavailable') ? v : null`, i.e. test `v.status === 'unavailable'`, as the record screen does. Add a test for `videoLinkTarget` with a live response card. |
| **B2** | link-opened screens, seen on `profile/[id]` via `u/` | Opened by a link with nothing under it, Back did nothing. `useGoBack` looks right (`canGoBack() ? back() : replace('/')`). The likely cause is that the redirect-only `u/[username]` route stays in the stack and `<Redirect>` sends you to the profile again when it regains focus, so Back loops. | Use `router.replace` for these link routes and test Back after a cold start in a **release** build. The development launcher gets in the way of a true cold start (see note). The same pattern applies to `r/`, `p/` and `i/`. |
| **B3** | `app/src/app/+not-found.tsx` | An unknown link shows a blank grey screen instead of going Home. | Check the redirect to `/` from an unmatched route while signed in (probably the same redirect/focus issue as B2). |
| M1 | `p/[id].tsx` → player | `p/` opened at "2 of 4" (Adam), not the prompt's first response as UI-REVIEW and the file's comment say. With no `entry`, the player starts at whatever its own order puts first. | Decide what "first" means for `p/` (SPEC 4), then pass it as `entry` or start at index 0. |
| M2 | `app/src/ui/ProfileView.tsx` | "1 responses", "1 following". The boards only show plural counts. | Needs a copy decision (singular forms aren't on a board). |
| M3 | `app/src/app/record/[promptId].tsx` (mine), `app/src/ui/Icons.tsx` | The A-Mic card shows the Light (bolt) icon; A-Mic draws a crossed-out microphone. | Add a mic-off icon to `Icons.tsx` (not mine) and use it in the mic card. Left alone to avoid touching `Icons.tsx`. |
| M4 | `app/src/ui/Icons.tsx` `FlipIcon` | The flip control is a camera with arrows; R-Record and A-Mic draw two circular arrows (the board's SVG path is in `design/html/R-Record.html`). | Use the board's path. |
| M5 | video reply delete sheet | "It's removed from the conversation along with its comments." Video replies have no comments (SPEC 7). UI-REVIEW already lists this sheet under "Needs a design". | Needs board copy. |
| — | profile Replies tab, empty | No empty-state text (none on a board). | Design decision, if wanted. |

## Not walked

- **Recording, flipping and posting.** There is no camera feed on the simulator, and no Mux on the local stack. See `docs/release/CAMERA-FLIP.md` for the device procedure.
- **A true cold start from a link.** With the development build, a link that launches an ended app opens the Expo launcher first. Rows 19 and 21 need a Release build to be conclusive.
- **Notification taps, VoiceOver and Android.** These are the other "walk" rows of UI-REVIEW, all marked "on devices" or "with VoiceOver".
- **The sign-out cleanup's push-token and analytics steps.** No push token is registered on the simulator without an EAS project id, and the analytics flush wasn't measured. Only the session removal was checked.

## Re-walk after Agent E's fixes (16 Oct 2026, evening)

**Setup.** Code at `a181f0c`. No native change since the first walk (no package, config, plugin or
module change), so the same simulator build was used, with a fresh Metro bundle. Stack `shortcut-b`
was rebuilt from a new copy of `supabase/` (fresh database, seed applied; same ports) and stopped
at the end. The account was signed up again the same way (email code from Mailpit, invite link).

| Check | Seen | Result | Shot |
| --- | --- | --- | --- |
| `r/<response id>` (Sofia's response) | Response player, "Be honest about the place you live.", **1 of 4** on Sofia, Reply to Sofia, Respond | **B1 fixed** | [20](screenshots/20-r-link-response.png) |
| `r/<video reply id>` (Sofia's reply to Adam) | Video reply player, "Replying to Adam Novak" card with his caption, "2 of 3", Adam's response, Reply to Sofia | works | [21](screenshots/21-r-link-reply.png) |
| `p/<prompt id>` | Response player at **1 of 4** (Maya), captured 1.5 s after opening | works. **M1 from the first walk was my error**: I captured 7 s after opening, and by then Maya's 3.6 s clip had ended and the player had moved on to Adam ("2 of 4"). | [22](screenshots/22-p-link-first.png) |
| `u/adamnovak` at launch, then Back | App ended; the link opened the development launcher; after the project loaded, Adam's profile with nothing under it. Back (two taps; the Replies tab responded to a tap) did nothing | **B2 not fixed** | [23](screenshots/23-back-still-stuck.png) |
| `u/sofiamarin` from Home (app running), then Back | Back did nothing (two taps). This worked in the first walk. | **regression** | [25](screenshots/25-warm-back-stuck.png) |
| `shortcut://nothing-here` from Home | Stayed on Home; no blank screen | **B3 fixed** (from Home) | [24](screenshots/24-unknown-link-home.png) |
| `shortcut://nothing-here` from the stuck profile (row 4) | Nothing changed; the profile stayed | not conclusive (the screen was already stuck) | — |
| A-Camera icons (camera revoked) | Centre icon: crossed-out video camera; flip control: two circular arrows | **matches A-Camera.jpg**. One small difference: the app draws the flip control dimmed (it's disabled there), the board draws it white. | [26](screenshots/26-a-camera.png) |
| A-Mic icons (mic revoked) | Card icon: crossed-out microphone; flip: circular arrows | **matches A-Mic.jpg** | [27](screenshots/27-a-mic.png) |
| R-Record flip icon (both allowed) | Circular arrows | **matches R-Record.jpg** | [28](screenshots/28-r-record-flip-icon.png) |

**Why Back is stuck (B2).** A temporary log in `useGoBack`, not committed and reverted, printed this
on the warm profile's Back:

```
goBack routeCount 1 ["__root"] canGoBack true
```

`useRootNavigationState().routes` is always the single wrapper route `__root`; the app's stack is
nested inside it (`routes[0].state.routes`). So `hasScreenBeneath(routeCount)` is false on every
screen, and Back always takes the `router.replace('/')` branch. From the profile, that call didn't
visibly navigate (the profile stayed). Two things to fix in `app/src/ui/navigation.ts` /
`hasScreenBeneath` (not my files):

1. Count the routes of the nested stack, not the root wrapper.
2. Find out why `replace('/')` from a pushed screen doesn't land on Home. `router.dismissTo('/')`
   or `router.navigate('/(tabs)')` may be what's wanted; this needs checking.

Test it with a link at launch in a Release build too, where there's no development launcher.

## Back fix (16 Oct 2026, late)

Lead-authorised change to Agent E's `app/src/ui/navigation.ts`, `hasScreenBeneath` in
`app/src/lib/links.ts` and its test. Code at `8debdd8` plus this change. Same simulator build (no
native change), stack `shortcut-b` brought up fresh and stopped at the end.

**What the state looks like.** Logged from `useRootNavigationState()` with a temporary dump (removed):

```
pushed from Home:      {"type":"stack","index":0,"routes":[{"name":"__root","state":{"type":"stack","index":1,"routes":[{"name":"(tabs)"},{"name":"profile/[id]"}]}}]}
u/<name> at launch:    {"type":"stack","index":0,"routes":[{"name":"__root","state":{"type":"stack","index":0,"routes":[{"name":"profile/[id]"}]}}]}
```

The root is expo-router's one-route `__root` wrapper, so the old `routes.length > 1` was always false.

**Fix.**
- `hasScreenBeneath(state)` walks the focused path (`routes[index].state` level by level). A stack
  level whose focused route isn't its first is a screen beneath; tab navigators don't count.
- With nothing beneath, Back calls `router.replace('/(tabs)')`. Tried empirically: `replace('/')`
  from the link-opened profile left the profile on screen, and `replace('/(tabs)')` landed on Home.
- The two logged shapes are now the test fixtures, along with a push chain, link-then-push, a
  non-first tab and no state (`linkRoutes.test.ts`).

| Check | Seen | Result | Shot |
| --- | --- | --- | --- |
| `u/adamnovak` at launch, then Back | Adam's profile with nothing beneath; Back lands on Home (For you) | **fixed** | [29](screenshots/29-cold-link-profile.png), [30](screenshots/30-cold-back-home.png) |
| Home, then Maya's name (pushed profile), then Back | Back returns to Home | **fixed** (was stuck at `a181f0c`) | — |
| Home, then "3 more responses" (player), then comments, then ✕ | The sheet closes back onto the player (which had played on to "You've seen all 4 responses"); one more Back returns to Home | push chain pops one at a time | [31](screenshots/31-comments-closed-back-to-player.png) |

Not checked: a Release-build cold start (the development launcher sits in front of it), and Android.
