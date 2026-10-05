<!-- Exported from the locked Claude Docs spec (rev 110, 5 Oct 2026):
https://claude.ai/code/artifact/eee59791-f711-4dac-bc44-d24dfaae2018
The online doc is the master. If it changes, re-export this file. Diagrams were converted to text. -->

# Shortcut v1 — Product and Build Specification

Oct 5, 2026 · @Nemat

## Status and how to use this spec

**Locked — approved for implementation (5 Oct 2026).** This is the single build source of truth for Shortcut v1, together with the final A1 Native canvas (version 26, approved 5 Oct 2026). Every v1 screen and state is drawn and approved.

- **Designs:** the [A1 Native canvas](https://claude.ai/artifact/AUxUiU1muSm6Z61SP2wCUP), 86 boards in 12 rows. Screen IDs below (e.g. `R-Player-2`) are its board names.
- **Precedence:** where this spec and a canvas note disagree, this spec wins. Where a screen shows different behaviour, the screen gets fixed.
- **Locked vs proposed:** everything is a decision made in design review (3–5 Oct 2026) unless marked **Proposed**. Proposed items are recommendations awaiting your yes or no, and all of them are collected in the last section.
- **Changing a locked decision:** change it here first, then on the canvas.

**Design gate:** no user-facing page or state is built until you have seen and approved it in Claude Design. This covers every screen in section 3, including the lightweight variants. Nothing is composed for the first time during coding.

## 1. Product definition

Shortcut is a social video app where people respond to prompts with short videos and talk back with video replies. It is a global product; the closed beta is seeded in Canggu, Bali.

- **Core loop:** a prompt → people record video responses (up to 30 seconds) → others watch, reply on video, comment and follow → the next prompt.
- **A prompt** is any sentence that invites a response: a question, a statement, an instruction or a challenge. Main example: "Be honest about the place you live."
- **Responses are never classified.** No polls, votes, sides or stance labels.
- **Location belongs to content, not identity.** Prompts can be global or tied to a place. Profiles never show where someone lives or how long they have been there.
- **Beta audience:** adults (18+) who join with an invite from a member or are admitted from the waitlist. The data model and copy assume any city or country.
- **Platforms:** iOS and Android from one Expo / React Native app, plus a minimal web player for shared links.
- **Design language:** A1 Native: system type, glass controls over full-bleed video, light grouped lists elsewhere, black primary buttons.

**Words used everywhere, in the app and in this spec:** people *respond* to a prompt, and the video is a *response*. People *reply* to a response or to another reply, and that video is a *video reply*. A *comment* is text. The product never says "answer".

## 2. v1 scope and non-goals

v1 ships the full prompt → response → conversation loop, the safety tooling a public video app needs, and a removable closed-beta gate. Nothing else.

**In v1**

- Home feed (For you, Following), Discover with search, response player, Activity, profiles, Settings
- Recording responses and video replies in the app: front/back camera, light, 1× zoom, up to 30 seconds
- Video replies in flat rooms, including replies to replies
- Text comments on responses (not on video replies)
- Likes on responses and video replies
- Following people (public) and places (private)
- Prompt suggestions by members, published only after human review
- Report, block, delete response, delete account, enforcement notices, review requests
- Closed-beta invites and waitlist, behind one switch
- Push notifications for a limited set of events
- Public web player for shared links, watch-only
- Analytics events listed in section 21

**Not in v1**

- Polls, votes, sides, stance labels, response classification
- Direct messages
- Business or creator accounts, monetisation, ads
- Videos without a prompt; members publishing prompts without review
- Comments on video replies; nested reply trees; visible like counts on comments
- Location on profiles, GPS, a place step in onboarding
- Phone-number sign-in or verification
- Streaks, milestones, badges, leaderboards
- Interacting or signing up on the web
- Background uploads that survive closing the app
- Uploading from the camera roll, filters, effects and editing beyond re-record

## 3. Screen inventory

The canvas has 86 boards in 12 rows: the core screens and states in the first table below (including the Android Welcome variant), and the 22 boards from the final design pass in the second. Build every screen from its board.

| ID | Screen or state | Area |
| --- | --- | --- |
| Main | Home feed, For you | Core |
| R-Discover | Discover | Core |
| R-Player-2 | Response player, 2 of 23 | Core |
| R-Player-3 | Response player after swiping up | Core |
| R-Player-End | End of responses | Core |
| R-Profile | Someone else's profile | Core |
| R-Record | Recording a response | Core |
| Comments | Comments sheet over a playing response | Conversation |
| Replies | Video reply room for one response | Conversation |
| Reply-Watch | Watching a video reply | Conversation |
| Reply-Watch-2 | Watching a reply to a reply | Conversation |
| Record-Reply | Recording a video reply | Conversation |
| Activity | Activity | Conversation |
| O-Welcome | Welcome and sign in, iOS order (Android order: `O-Welcome-Android`) | Onboarding |
| O-Email | Email code sign-in | Onboarding |
| A-Age | 18+ confirmation | Onboarding |
| O-Invite | Invite step (closed beta only) | Onboarding |
| O-Profile | Name and username | Onboarding |
| O-Photo | Optional photo | Onboarding |
| Z-Empty | Prompt with no responses | Prompts |
| Z-First | After the first response | Prompts |
| C-Plus | + sheet: respond or suggest | Prompts |
| C-Write | Suggest a prompt: write | Prompts |
| C-Scope | Suggest: Global or a place | Prompts |
| C-Preview | Suggest: preview, name on or off | Prompts |
| C-Submitted | Sent for review | Prompts |
| C-Pending | Your suggestions | Prompts |
| C-Live | Suggestion approved, no draft | Prompts |
| C-Draft | Suggestion approved: publish your draft? | Prompts |
| P-Places | Places you follow | Places |
| P-Unfollow | Unfollow a place | Places |
| P-Place | Place page | Places |
| S-Settings | Settings | Settings |
| N-Prime | Notification ask | Notifications |
| N-Settings | Notification settings | Notifications |
| W-Link | Opening an invite link | Beta |
| W-Invalid | Invite code already used | Beta |
| W-Waitlist | On the waitlist | Beta |
| S-Invites | Invite people | Beta |
| E-Code | Email code did not work | Sign-in edge |
| E-Linked | Email already uses Apple sign-in | Sign-in edge |
| E-Username | Username taken | Sign-in edge |
| A-Disclosure | One-time public disclosure | Safety |
| SF-Menu | Share sheet with Report and Block | Safety |
| SF-Report | Report: reason | Safety |
| SF-Reported | Report sent, block offered | Safety |
| SF-Block | Block confirmation | Safety |
| SF-Delete | Delete your response | Safety |
| SF-DeleteAccount | Delete account | Safety |
| A-Removed | Your response was removed | Enforcement |
| A-Restricted | Posting paused | Enforcement |
| SF-Web | Shared link on the web, signed out | Web |
| SF-Web-Signin | Web: sign-in needed to interact | Web |
| X-Loading | Home loading | States |
| X-Upload-Failed | Response failed to post | States |
| A-Offline | Offline | States |
| X-Unavailable | Response deleted or removed | States |
| A-Orphan | Reply whose original was deleted | States |
| X-Following-Empty | Following feed, empty | States |
| X-Activity-Empty | Activity, empty | States |
| X-Me-Empty | Own profile before any response | States |
| A-Camera | Camera access off | States |
| A-Mic | Microphone access off | States |

**Final design pass (5 Oct): drawn and approved.** Eleven screens and states, drawn as 20 boards, plus two pre-lock boards (Review requested, own-comment Delete). All are in v1. Full design meant open design work; a lightweight A1 variant reuses approved A1 parts with no new visual exploration.

| # | Screen | Type | Boards | Notes |
| --- | --- | --- | --- | --- |
| 1 | Post review (record → review → post) | Full design | `PR-Review`, `PR-Caption`, `PR-Reply`, `PR-Draft`, `PR-Discard`, `PR-Posting`, `PR-Short` | Discard, Re-record or Post; optional caption; disclosure before the first public video; foreground posting banner; Upload failed on failure; notification ask after the first post; video-reply and private-draft variants; under-2-second toast. |
| 2 | Search results | Full design | `SR-Recent`, `SR-Results`, `SR-People`, `SR-None` | One grouped list (Places, Prompts, People), no tabs; recent searches on this phone only; places not open yet shown without Follow. |
| 3 | Edit profile | Lightweight A1 variant | `LV-EditProfile` | Cancel / Save; photo, name, username, bio with counter. |
| 4 | Followers and following | Lightweight A1 variant | `LV-Followers` | Two tabs; Follow back / Following pills. |
| 5 | My populated profile | Lightweight A1 variant | `LV-MyProfile` | Pinned response; Processing tile; no view counts. |
| 6 | Blocked accounts | Lightweight A1 variant | `LV-Blocked` | Grey Unblock pill. |
| 7 | Permanent suspended account | Lightweight A1 variant | `LV-Suspended`, `LV-ReviewRequested` | States the suspension is permanent; Request a review, then "Review requested" (one per decision); Sign out. |
| 8 | Sign-out warning | Lightweight A1 variant | `LV-SignOut` | Only when an unposted recording would be deleted. |
| 9 | Comment actions | Lightweight A1 variant | `LV-CommentActions`, `LV-CommentOwn` | Someone else's comment: Report, Block. Your own: Delete only, which can't be undone. |
| 10 | Web video unavailable | Lightweight A1 variant | `LV-WebUnavailable` | The unavailable message inside the web frame. |
| 11 | Web empty prompt | Lightweight A1 variant | `LV-WebEmpty` | The prompt, "No responses yet", Respond in the app. |

Nothing is deferred. Followers and following lists stay in v1.

The proposed "Not posted yet" row in section 19 is withdrawn. It would be a new element, and the approved Upload failed banner already handles an unposted recording.

## 4. Navigation

Five tabs, with + in the centre. The player, recording, comments, reply rooms and every flow open on top of the tabs and hide the tab bar.

| Tab | Opens | Notes |
| --- | --- | --- |
| Home | Full-screen feed, For you or Following | Search icon top right. Dark tab bar over video. |
| Discover | Search, topic chips, featured prompt, busy prompts | Light screen. |
| + | The `C-Plus` sheet | Respond to an open prompt, or suggest a prompt. Never a blank camera. |
| Activity | Activity list | Filled bell when active. |
| Me | Your own profile | Settings through the icon top right. |

**Home feed and swiping**

- Home shows one conversation at a time: a prompt and one response to it, full screen. The response shown is the most relevant one: someone you follow first, otherwise a popular one.
- **Swipe up on Home → the next conversation**, which means a different prompt. Swiping up on Home never steps through more responses to the same prompt.
- To watch more responses to that prompt, tap the prompt label or "22 more responses". That opens the response player, where swipe up means the next response to the same prompt, and the end card leads to the next conversation.
- Closing the player returns to Home at the same conversation.
- A conversation already seen in this session doesn't come back unless it has new responses.
- **Following tab:** swipe up → the next response from someone you follow, newest first. Each shows its prompt label and opens that prompt's player the same way.
- **Playback:** a video plays with sound once it fills the screen. On Home it loops; in the response player it moves on to the next response when it ends.

**Ordering, with no machine-learned ranking**

- **For you:** simple rules: the featured global prompt, then fresh conversations from global prompts and followed places, weighted lightly by engagement.
- **Response player:** the response you entered from comes first, then unseen responses from people you follow, then newer responses.

**Entry points**

- Prompt label on Home → the player for that prompt, at that response.
- "N more responses" or a face in the strip → the player, at that response.
- Swipe up in the player → the next response. The end card leads to the next conversation.
- Author name or photo → their profile.
- Pin label on a prompt (e.g. "Canggu") → that place's page.
- Comment icon → comments sheet. Video icon → reply room.
- Share icon → share sheet: Copy link, Share to…, Report, Block.
- … on your own video → Delete.
- Respond or Reply buttons → recording, with the prompt or reply context shown on screen.

**Links (Proposed URL patterns)**

| Link | Installed app | No app |
| --- | --- | --- |
| shortcut.app/r/{id} | Opens the response or video reply in the player | Web player |
| shortcut.app/p/{id} | Opens the prompt's first response | Web player |
| shortcut.app/i/{code} | Invite welcome (`W-Link`) | Store page, then the invite on first open |

There are no web profile pages in v1. Share profile creates an app link: it opens the profile in the app, or the store page if the app isn't installed.

## 5. Prompt model

Every video in v1 starts from a prompt: a short text people respond to. The team publishes prompts directly; members can only suggest them (section 12).

| Field | Rule |
| --- | --- |
| text | Up to 120 characters. Any form: question, statement, instruction, challenge. |
| scope | Global, or exactly one place (section 10). |
| topic | Optional, one from a team-managed list (Food, Work, Surf, Fitness, Nights…). Set by the team, used by the Discover chips. |
| source | Team, or member suggestion. |
| suggested\_by | The member, for suggestions. Shown as "Suggested by \[name\]" only when attribution is on. |
| attribution | On by default. The member can turn it off before submitting; moderators can remove it. |
| status | Suggested prompts: in review, live, not published, withdrawn. Team prompts start live. Any prompt can be archived by the team. |
| featured | The team picks one global prompt as "Tonight's prompt". It is featured from about 18:30 until midnight in each person's local time: it leads Discover and the + sheet, shows time left, and gets the daily notification when the window opens. After midnight it stays open like any other prompt. |
| counts | Response count, shown as "23 responses". |

**Display rules**

- Global prompts carry no badge.
- Place prompts carry a quiet pin label with the place name wherever the prompt appears: Home, the player, Discover, the + sheet and recording.
- A prompt with no responses shows its empty state (`Z-Empty`): an empty slot and "Be the first to respond".
- A prompt stays open for responses after its featured window ends, until the team archives it. The team never archives the last open prompt of an open place, so a place page always has at least one prompt.

## 6. Response model

A response is a public video of up to 30 seconds made in response to exactly one prompt. It is recorded in the app and published only after the person taps Post.

| Field | Rule |
| --- | --- |
| prompt | Exactly one. |
| video | Between 2 and 30 seconds, recorded in the app. |
| caption | Optional text under the name**,** up to 150 characters. |
| status | Processing, live, removed by moderation, deleted by author. |
| likes | Visible count on the rail. |
| comments, video replies | Visible counts on the rail. |
| views | Not shown on profiles in v1. |
| pinned | One response per profile can be pinned (approved design). |

**Recording** (`R-Record`)

- The prompt is shown on screen while recording, with "Responding · up to 30 seconds".
- Controls: cancel, camera flip, light, 1× zoom, record and stop with a progress ring, red timer.
- After stopping → post review: watch, Re-record, add a caption, Post.
- The first public video of any kind shows the disclosure first (section 16).
- Camera or microphone access off → `A-Camera` or `A-Mic`. Recording without sound is not allowed.

**Watching** (`R-Player-2`, `R-Player-3`, `R-Player-End`)

- Swipe up for the next response in the same prompt. Order: the response you entered from, then unseen responses from people you follow, then newer responses. The face strip jumps straight to anyone.
- The selected face, the playback bar and the "2 of 23" counter follow along.
- Buttons: Reply to the author, Respond to the prompt.
- At the end: "You've seen all 23 responses.", Add your response, Watch again, then the next conversation.

**One primary response per person per prompt.** To change it, the person deletes it and records again. Video replies are not limited.

## 7. Video reply model

A video reply is a public video of up to 30 seconds that replies to a response, or to another reply, inside one flat room. Any reply can be replied to; nothing is ever shown as a tree.

| Field | Rule |
| --- | --- |
| root\_response | The response whose room this reply lives in. Always set. |
| reply\_to | The video it replies to directly: the root response or another reply in the same room. |
| prompt | Copied from the root response. Never changes, even if the root is deleted. |
| video, caption | Same rules as a response. |
| likes | Visible count. |
| comments | None. Video replies have no comment section in v1. |

**Presentation**

- **Reply room** (`Replies`): "N video replies", the root response's author and caption at the top, a two-column grid, and a "Reply to \[root author\]" tile last.
- A reply to a reply shows "Replying to \[name\]" on its tile.
- **Watching a reply** (`Reply-Watch`, `Reply-Watch-2`): a card at the top shows what it replies to. Tapping the card opens that video. A reply to a reply adds "In replies to \[root author\]".
- **Buttons:** "\[Root author\]'s response" and "Reply to \[this reply's author\]". "x of N" counts within the room.
- **Recording a reply** (`Record-Reply`): the card shows "Replying to \[name\]", their caption and "In replies to \[root author\] · up to 30 seconds".

**When the video it replies to is deleted**

- Root response deleted: replies stay on their authors' profiles, still tied to the prompt. They show "Original response deleted" with the prompt text, and "All responses" replaces the root author's button (`A-Orphan`). The room can no longer be reached from the root.
- A reply deleted: replies to it show "Replying to a deleted video" and stay in the room.

## 8. Comments

Text comments are lightweight and secondary, and exist only on responses. Video stays the primary way to respond and reply.

- **Sheet** (`Comments`): opens over the response, which keeps playing in the top third. Title "N comments".
- **Top of the sheet:** a card linking to the reply room: "5 video replies · Sofia, Putu and 3 others", with thumbnails.
- **Threads:** one level. Replies to a comment sit under it, indented, with "View N replies" when collapsed. A reply to a reply joins the same thread.
- **Author tag:** the response's author gets an "Author" tag next to their name.
- **Likes:** allowed. The heart fills when you like it, but no counts are shown to anyone.
- **Input bar:** your photo, "Add a comment", and a black **Video** button that records a video reply to the response's author.
- Up to 300 characters, text only: no links or images.
- You can delete your own comments. A response's author can't delete other people's comments; they can report them. A long-press on a comment opens the Comment actions sheet: Report and Block on someone else's comment; on your own, only Delete, and deleting can't be undone (section 3).

## 9. Profiles and follows

A profile is a person's face, name and videos. It never carries location, and the places someone follows are private.

| Element | Rule |
| --- | --- |
| Photo | Optional; a placeholder until added. |
| Name | Required, up to 40 characters. |
| Username | Required and unique, shown as @username. 3–24 characters; lowercase letters, digits, dot and underscore. Stays reserved while its account is in the 30-day deletion window. |
| Bio | Optional, set in Edit profile, up to 150 characters. |
| Counts | Responses, followers, following. |
| Social proof | "Followed by Putu, Wayan and 4 others" (people you follow). |
| Tabs | Responses and Replies, as a grid. One pinned response. No view counts. |
| Actions on others | Follow and Share; … menu with Report, Block, Copy link. |
| Actions on your own | Edit profile, Share profile, Settings icon. |

**Follows**

- One-way and public, with no approval and no private accounts in v1.
- The Following feed shows responses from people you follow, newest first. Video replies are not in the Following feed in v1.
- When someone has no follows yet, the Following feed suggests people from prompts they watched (`X-Following-Empty`).
- Blocking removes follows in both directions and hides each person from the other.

## 10. Global and place scope

Scope is a property of a prompt, never of a person. Anyone can respond to any prompt they can open, without proving a connection to the place.

- **Scopes:** every prompt is Global or tied to one place. Places have a type (city, region, country or community), so later scopes need no new model. In v1 the app offers only Global and the places a person follows.
- **What a person's feed draws from:** global prompts, plus prompts tied to places they follow.
- **Reaching other places' prompts:** a place prompt the person doesn't follow can still be opened from a link, search, someone's profile or the place page, and anyone can respond to it.
- **Labels:** Global gets no badge. A place prompt gets a pin and the place name, e.g. "Canggu · New prompt".
- **Copy:** says "places you follow" and never names Canggu, except where Canggu is the beta cohort (the invite screens).
- Discover browses global prompts and prompts from followed places. Search lists any place; only open places can be opened and followed.

## 11. Places

Following a place is a private feed preference. It adds that place's prompts to your feed, and nobody else can see it.

- **Place record:** name, region line ("Bali, Indonesia"), type, image, open or not yet open. Places are created by the team; members can't add them.
- **Beta cohort:** an invite from the Canggu beta follows Canggu automatically. The invite welcome says so: "You'll start with prompts from Canggu as well as global ones." The invite stores a cohort, and the cohort maps to starting places, so other cities reuse the same system.
- **No GPS, ever in v1.** People choose places; suggestions come from places they already follow (a team-kept list of neighbouring places). Nearby suggestions may come later as an opt-in.
- **Places screen** (`P-Places`, from Settings): search, the places you follow, a fixed "Global prompts · Always in your feed" row that can't be turned off, suggestions, and "Following a place never shows on your profile."
- **Unfollow** (`P-Unfollow`): "Canggu prompts will stop appearing in your feed. Global prompts and people you follow stay."
- **Place page** (`P-Place`, from any pin label): image, name, region, Following or Follow, Share, and the place's open prompts. It notes that global prompts live in Home.
- **No onboarding step.** Places are never asked for at sign-up.
- **Notifications:** one switch, "New prompts in places you follow", covers every followed place.
- Searching for places, including places that aren't open yet, is part of the Search results design (section 3).

## 12. Prompt suggestion and review

Members can suggest prompts, and a person reviews every suggestion before anyone else sees it. The app never says how long review takes.

```text
Suggestion lifecycle: nothing goes public until a person approves it.

Suggest (write, place, preview)
  --submit--> In review (can edit or withdraw)
      --withdraw--> Withdrawn
      --reviewed: approved--> Live (author gets a notification)
             --if a draft was recorded--> Draft response (publish, re-record, delete)
      --reviewed: declined--> Not published (with a reason)
             --rewrite and resend--> Suggest
```

A declined suggestion can be rewritten and sent again. A draft response is only published if its author chooses to.

**Flow**

1. **+ sheet** (`C-Plus`): "Suggest a prompt · Reviewed before anyone sees it". Below it: "Your suggestions · N in review".
2. **Write** (`C-Write`): up to 120 characters with a live counter. One line on what works, and one on what won't be published: aimed at a person or group, ads, or asking for private details.
3. **Scope** (`C-Scope`): Global, or one of the places you follow.
4. **Preview** (`C-Preview`): exactly as it will appear, plus a "Show my name on this prompt" switch, on by default. Copy: "A person reviews every prompt before it goes live. We'll let you know when it's reviewed."
5. **Sent for review** (`C-Submitted`), with an optional "Record the first response".
6. **Your suggestions** (`C-Pending`): in review (Edit, Withdraw, and the saved draft if there is one), live (with response count), not published (with the reason, and an option to rewrite and resend).
7. **Outcome:**
   - Live: a notification, then `C-Draft` if there is a draft, or `C-Live` if not.
   - Not published: a notification with the reason.

**First-response draft**

- Optional, recorded while the suggestion is in review. Saved privately with the suggestion, so only the author can see it.
- Never published automatically. When the prompt goes live, the author is asked: Publish response, Re-record, or Delete draft.
- Publishing it counts as a first public video, so the disclosure appears first if it hasn't been shown.
- If the suggestion is withdrawn or not published, the draft is kept, still private, with the suggestion. The author can delete it at any time, or keep it for a rewritten suggestion. It is deleted with the account.

**Review rules for moderators**

- Approve or decline. Declining needs a reason from a fixed list: singles out a person or group, too similar to a live prompt, promotion, asks for private details, unclear, other.
- Moderators can remove attribution on approval.
- Moderators don't reword a suggestion; they decline it with a reason.
- At most 3 suggestions in review per member at once.

## 13. Auth, onboarding and the 18+ rule

Onboarding runs in this order: sign in (Welcome, plus the email-code screen for email) → 18+ → invite (beta only) → name and username → optional photo → Home. That is five steps before Home during the beta, and four once the invite step is switched off at public launch. The list below goes screen by screen.

1. **Welcome** (`O-Welcome`): "One prompt. Everyone's take, on video." / "Watch people respond, then add yours." Button order on iOS: Apple, Google, email. On Android: Google, Apple, email. No phone sign-in.
2. **Email** (`O-Email`): enter email, then a 6-digit one-time code, with "Resend code in 0:24". No passwords.
3. **18+** (`A-Age`): "Are you 18 or older?" Yes continues. No signs the person out and returns to Welcome; no profile is created. It comes before the invite step, so under-18s never use up an invite.
4. **Invite** (`O-Invite`, beta only): see section 14.
5. **Name and username** (`O-Profile`): live availability check.
6. **Photo** (`O-Photo`): take one or choose from the library. Optional; "Start watching" works without one.
7. **Home**, on the featured global prompt.

**Edge cases**

- **Wrong or expired code** (`E-Code`): the boxes turn red, with "That code didn't work. It may have expired, so use the newest email." and "Send a new code".
- **Email already linked to Apple or Google** (`E-Linked`): "Continue with Apple to keep your responses and followers", or use a different email. Accounts can't be merged in v1.
- **Username taken** (`E-Username`): "@lena is taken" with three suggestions; Continue stays disabled.
- **Apple "Hide my email" addresses** are treated like any other email.

**Account records**

- The sign-in identity is created at sign-in.
- The profile is created only after the 18+ step and beta access is approved, either through a valid invite or waitlist admission.
- Waitlisted people have an identity and a waitlist entry, but no profile.

**The 18+ rule**

- The closed beta is 18+, by self-declaration. There is no ID check.
- "May be under 18" stays a report reason. Confirmed under-18 accounts are removed.
- Store age ratings must match. Which ones to pick is in section 24.

## 14. Closed beta invites and waitlist

During the beta, creating a profile needs either a valid invite or admission from the waitlist. One server switch (`invite_required`) turns the whole step off at public launch without changing any other screen.

- **Invite step** (`O-Invite`): "Closed beta" label, "Shortcut is in closed beta." / "Access is limited while we're testing. Use an invite if you have one, or join the waitlist." (same wording on the invalid-invite state, W-Invalid), a code field showing "Invited by Putu Ayu" once the code is valid, and "Opened an invite link? You're already in."
- **Invite links** (`W-Link`): open the welcome screen with the inviter's card and the cohort line, then skip the code step.
- **Codes:** single use, readable (e.g. PUTU-7K2). The team can create codes at any time.
- **Code errors** (`W-Invalid`): not found, expired or already used. Inline red message plus Join waitlist; Continue stays disabled.
- **Members' invites** (`S-Invites`): a personal link with Copy and Share, "4 of 5 left", and a list of sent invites (joined, or opened and not yet joined, with expiry). Cancelling an unused invite returns it.
- **Cohort:** an invite carries the inviter's beta cohort, and the cohort sets the invitee's starting places (Canggu in this beta).
- **Waitlist** (`W-Waitlist`): "We'll email you when there's room." No queue number. Also "I have an invite code" and Sign out.
- **Admission:** the team admits people from the waitlist by hand, and an email tells them.
- 5 invites per member, each valid for 7 days. Both are server settings that can change without an app update.

## 15. Notifications

Notifications cover replies, comments, follows and prompts, and nothing that exists to drive usage for its own sake. The permission is never asked on first launch.

**When to ask**

1. First ask: right after the person's first public video posts. The sheet (`N-Prime`) shows a labelled EXAMPLE notification, Turn on notifications, and Not now.
2. After Not now, ask once more, only when their first reply or comment arrives. After that, only from Settings.
3. If the phone's permission is off, Settings → Notifications opens the approved N-Prime sheet instead, and its button goes to the phone's settings. There is no separate banner state.

**What is sent**

| Event | Default | Example text |
| --- | --- | --- |
| Video reply to your response or reply | On | Sofia Marín replied to your response with a video |
| Comment on your response | On | Putu and Hana commented on your response |
| Reply to your comment | On | Adam Novak replied to your comment |
| New follower | On | Wayan Adi started following you |
| Tonight's prompt (once a day at about 18:30 local time, global) | On | Tonight: Be honest about the place you live. |
| New prompt in a place you follow | On | New prompt in Canggu: What should every newcomer unlearn? |
| Your suggested prompt was reviewed | Always | Your prompt is live in Canggu |
| Moderation notice | Always | We removed one of your responses |
| People you follow respond | Off | Maya responded to Be honest about the place you live. |
| Likes | Off | Shown in Activity as one line either way |

- **Settings** (`N-Settings`): Pause all, then the switches above, grouped as Your responses, People, Prompts and Likes. One switch covers all followed places.
- **Activity** (`Activity`, `X-Activity-Empty`): shows the same events in the app. Video replies come first and largest. Likes collapse into one quiet line. No milestones.
- Tonight's prompt is sent at about 18:30 local time, when its featured window opens; the window closes at local midnight. Comments arriving within about 10 minutes of each other are grouped into one notification.

## 16. Public shared links and the visibility disclosure

Every response and video reply is public: anyone with a link can watch it in a browser without an account. Doing anything other than watching needs the app.

**Web player** (`SF-Web`)

- A slim top bar with Shortcut and "Open in app". The video is full height, with the prompt label, name, caption and rail counts.
- "N more responses" lets a visitor watch the prompt's other responses.
- A footer: "Watch freely. Sign in to respond, reply, like or follow."
- Respond, Reply, Like, Follow, Comment and Open in app all open `SF-Web-Signin`: "Join the conversation · Anyone can watch…", Open in the app, Get the app, and during the beta "No invite yet? Join the waitlist".
- Deleted or removed videos show a web version of the unavailable state, drawn as LV-WebUnavailable (section 3). A shared prompt with no responses yet shows the web empty-prompt state, drawn as LV-WebEmpty (section 3).
- The web shows video replies but not text comments. Pages are kept out of search engines during the beta. Shared video and prompt links show a link preview (thumbnail, prompt, name).
- Blocking works only in the app. A logged-out visitor can still watch, because the content is public.

**One-time disclosure** (`A-Disclosure`)

- Shown once, before the person's first public video of any kind: a response, a video reply, or a published draft.
- Titled "Your videos are public". It says: anyone on Shortcut can watch; people can reply on video and share, and responses can also get comments; shared links work on the web without an account; you can delete any of your videos at any time.
- Buttons: Post, Go back. It is not tucked away in the Terms.
- Enforced on the server: a video can't be published until the account has acknowledged the disclosure (`public_disclosure_ack_at`).

## 17. Moderation, report, block, enforcement and appeals

Moderation in the beta is done by people, case by case. No automatic thresholds, no promised review times, and the reporter is never revealed.

**Report** (`SF-Menu` → `SF-Report` → `SF-Reported`)

- From the share sheet on any response or reply, the … menu on a profile, or a long-press on a comment.
- Reasons: harassment or bullying; hate speech or symbols; nudity or sexual content; violence or threats; self-harm or suicide; shares private information; spam or scam; may be under 18; something else.
- Afterwards: "Thanks for telling us. We'll review it. You won't see this response again." Block is offered on the same screen.
- Reports are anonymous: "Adam won't know who reported it."

**Block** (`SF-Block`)

- Silent: the blocked person is not told.
- Both people stop seeing each other's profiles, videos, replies and comments, and stop getting notifications about each other. Follows are removed both ways.
- Unblock from Settings → Blocked accounts.

**Enforcement ladder** (manual; severe cases can skip steps)

1. **First ordinary violation:** the content is removed and the person gets a warning (`A-Removed`).
2. **Repeated similar violation:** posting is paused until a date, but watching still works (`A-Restricted`). While paused they can't respond, reply, comment or suggest prompts.
3. **Further, repeated or severe abuse:** suspension. They can't use the app; at sign-in they see the reason and Request a review.

**Notices and copy**

- Removal: shows the removed item and the reason, and "Nobody can watch it any more. Please treat this as a warning."
- Restriction: "Posting is paused until 12 October", the reason, and "See what was removed".
- No notice promises an automatic next step.

**Review requests (appeals)**

- "Request a review" appears on removal, restriction and suspension notices. Copy: "We'll review it again." No timing.
- One review request per moderation decision. The outcome is sent as a notification. During the beta, the founder and team handle all moderation, suggestion reviews and review requests, with no public response-time promise.

**Moderator tools (internal)**

- Queues for reports, prompt suggestions and review requests.
- Actions: remove content, warn, restrict until a date, suspend, restore, remove attribution, approve or decline a suggestion with a reason.
- Every action is logged with who, when and why.

## 18. Deletion and account recovery

People can delete anything they posted at any time, and deleting an account has a 30-day window to change your mind.

**Deleting content**

- **Own response** (`SF-Delete`): "Delete your response?" Its comments go with it. Other people's video replies stay on their profiles and show "Original response deleted".
- **Own video reply:** same confirmation. Replies to it show "Replying to a deleted video".
- **Own comment:** delete from a long-press.
- Deleted content disappears everywhere at once, web included. There is no undo once a deletion is confirmed.

**Deleting an account** (`SF-DeleteAccount`, from Settings)

- The screen says what happens: responses, video replies and comments are hidden at once and permanently deleted after 30 days; the profile disappears; the username stays reserved for the 30 days and is released only after permanent deletion; suggested prompts stay live without your name.
- Confirm with the same sign-in method first.
- For the first 30 days this is a soft delete: the account and everything it posted are hidden from everyone, but nothing is erased. Signing back in during those 30 days restores everything. Permanent deletion happens only after day 30.

**Account recovery**

- There are no passwords. Recovery means signing in again with the same Apple, Google or email.
- Someone who has lost access to that sign-in contacts Help and feedback, and the team verifies them by hand.
- One sign-in method per account in v1. Linking a second method is not included.

## 19. Offline and local drafts

A recording is never lost because of a bad connection. It stays saved on the phone until it posts or the person deletes it. There is no background upload that survives closing the app.

- **Upload:** starts when Post is tapped and runs while the app is open.
- **Upload fails** (`X-Upload-Failed`): "Your response didn't post. It's saved on this phone. Check your connection." and Retry.
- **App closed mid-upload:** the recording stays saved. Next time the app opens, the same banner offers Retry.
- **Offline** (`A-Offline`): "You're offline. Your response stays saved on this phone. Post when you're back online." Already loaded videos keep playing. No offline downloads.
- **Recording offline:** allowed. Post waits for the connection.
- **Two kinds of draft:**
  - An **unposted recording** lives only on the phone.
  - A **first-response draft** for a suggested prompt is uploaded privately to the server, so it survives reinstalls (section 12).
- Unposted recordings are deleted from the phone on sign-out, after a warning (below). They show up only through the Upload failed banner (`X-Upload-Failed`); there is no separate list.

**Signing out with unposted recordings:** a warning comes first: "You have 1 recording that hasn't posted. Signing out deletes it from this phone." Sign out anyway, or Cancel. Drawn as LV-SignOut (section 3).

## 20. Empty, error and loading states

Every state below is designed on the canvas. No state shows fake content or blames the person.

| State | Screen | Behaviour |
| --- | --- | --- |
| Home loading | `X-Loading` | Placeholder shapes in the real layout and a spinner. |
| Posting failed | `X-Upload-Failed` | Saved on the phone, Retry. |
| Offline | `A-Offline` | Keep watching what's loaded; post later. |
| Video unavailable | `X-Unavailable` | "This response isn't available. It was deleted or removed." Next response. "If it just didn't load: Try again." Never gives a reason. |
| Original deleted | `A-Orphan` | "Original response deleted" and the prompt. |
| Prompt with no responses | `Z-Empty` | Empty slot, "Be the first to respond", next conversation. |
| After the first response | `Z-First` | "You're the first response. We'll let you know when people respond." Ask someone. |
| Following empty | `X-Following-Empty` | Suggested people from prompts you watched; Back to For you. |
| Activity empty | `X-Activity-Empty` | "Nothing here yet" and Respond to tonight's prompt. |
| Own profile empty | `X-Me-Empty` | Photo placeholder, empty slot, Respond to tonight's prompt. |
| Camera off | `A-Camera` | Explains why, Open Settings, Not now. |
| Microphone off | `A-Mic` | Camera preview stays, record disabled, Open Settings. |
| Invite, code, username errors | `W-Invalid`, `E-Code`, `E-Username` | Inline, with the next step. |
| Search, no results | SR-None | Matching places still show; "No people or prompts match"; Suggest a prompt. |
| Place with no prompts | Can't happen | The team never archives a place's last open prompt. |
| Your video processing | PR-Posting, LV-MyProfile | Your own tile shows Processing; others don't see the video yet. |
| Phone notifications off | Reuses `N-Prime` | Settings → Notifications opens the sheet; its button goes to the phone's settings. |
| Sign-out with unposted recordings | LV-SignOut | Warns before deleting them from the phone. |
| Comment actions | LV-CommentActions, LV-CommentOwn | Someone else's comment: Report, Block. Your own comment: Delete only, which can't be undone. |
| Web video unavailable | LV-WebUnavailable | Same message as the app, with Open in app. |
| Web prompt with no responses | LV-WebEmpty | The prompt, "No responses yet", and Respond in the app. |

## 21. Analytics events

The beta has to settle one question: do people who watch go on to respond and reply? These events are enough to settle it. No ad or tracking SDKs.

**Beta metrics (Proposed definitions)**

- **Weekly responders:** people who published at least one response or reply in the week.
- **Response rate:** responders ÷ people who watched at least one response to that prompt.
- **Reply rate:** share of responses that get at least one video reply.
- **Day-7 return:** share of new members active again 7 days after joining.

**Events**

| Event | When | Key properties |
| --- | --- | --- |
| signup\_started, signup\_completed | Sign-in begins; profile created | method |
| age\_confirmed, age\_declined | 18+ step | none |
| invite\_redeemed, invite\_failed | Invite step or link | source (link, code), reason |
| waitlist\_joined | Join waitlist | none |
| onboarding\_photo | Photo step | added or skipped |
| prompt\_viewed | Prompt shown | prompt\_id, scope, surface |
| response\_viewed | Response plays | response\_id, prompt\_id, position, surface, watch\_ms, completed |
| player\_jump, player\_end\_reached | Face strip tap; end card | prompt\_id |
| record\_started, record\_completed | Camera | kind (response, reply, draft), duration\_s |
| disclosure\_shown, disclosure\_accepted, disclosure\_back | First public video | kind |
| video\_published | Post succeeds | kind, duration\_s, is\_first, has\_caption |
| upload\_failed, upload\_retried | Posting | reason |
| reply\_room\_opened, comments\_opened | Rooms and sheets | response\_id |
| comment\_posted, like\_added | Interactions | target\_type |
| follow\_user, unfollow\_user | Profiles | source |
| place\_followed, place\_unfollowed | Places | place\_id, source (invite, manual, suggestion) |
| suggestion\_submitted, suggestion\_withdrawn | Suggestions | scope, attribution |
| suggestion\_reviewed | Moderator decision | outcome, reason |
| draft\_published, draft\_rerecorded, draft\_deleted | C-Draft | prompt\_id |
| notif\_ask\_shown, notif\_ask\_accepted, notif\_ask\_declined | N-Prime | ask\_number |
| push\_opened | Notification tapped | type |
| share\_tapped, web\_link\_opened, web\_signin\_sheet\_shown | Sharing and web | target, logged\_in |
| report\_submitted, user\_blocked | Safety | reason, target\_type |
| content\_deleted, account\_deletion\_requested, account\_deletion\_cancelled | Ownership | target\_type |
| permission\_denied | Camera or mic | permission |
| offline\_shown | Offline banner | none |

Every event carries an anonymous user id, cohort, platform and app version.

## 22. Unresolved technical choices

The stack is fixed: Expo / React Native / TypeScript / Expo Router, and Supabase, starting from clean migrations. The old database is a reference only. The choices below are still open, and the video pipeline is the one that decides cost and feel.

| Choice | Options | How to decide |
| --- | --- | --- |
| Video hosting and playback | Mux, Cloudflare Stream, Supabase Storage plus our own transcoding | A short spike: record, upload and play 30-second videos on a mid-range Android over Bali mobile data; compare start time, quality and cost per minute |
| Camera library | expo-camera, react-native-vision-camera | Same spike: front camera quality, 30-second limit, light, zoom |
| Upload | Direct signed upload, resumable upload | Resumable if the spike shows frequent failures; foreground only either way |
| Auth | Supabase Auth (Apple, Google, email code) | Confirm Sign in with Apple on Android and the email provider for codes |
| Push | Expo push service, or Firebase and Apple directly | Expo unless a needed feature is missing |
| Feed order | Decided: simple rules (freshness, followed places, engagement), no ML ranking | Implement as database queries |
| Search | Postgres full-text, external search | Postgres for the beta |
| Web player | A small Next.js site, Expo web | Whichever plays the chosen video format best with link previews |
| Links | Universal and app links on one domain | Domain to buy and set up |
| Analytics | PostHog, Amplitude, our own events table | Prefer one that can run without ad tracking |
| Moderation tools | Supabase dashboard plus a small internal web admin | Admin needed before the first outside tester |
| Automated checks on uploads | None, or a nudity and violence scanner | Decide after the spike; human review stays the default |
| Email | Supabase built-in, Resend, Postmark | Deliverability for codes and waitlist emails |

## 23. Implementation order

Build in seven phases, riskiest first. Video quality and cost are the biggest unknowns, so a short spike comes before anything else. Nobody outside the team uses the app until safety is complete.

```text
Implementation order: video risk first; safety must be done before anyone outside the team joins.

1. Video spike: record, upload and play 30-second videos on a mid-range Android over Bali mobile data.
   Compare Mux, Cloudflare Stream and Supabase Storage on start time, quality and cost.
   GATE: the founder picks the video provider.
2. Foundations: repo, Expo app with the five tabs, clean Supabase migrations, Apple, Google and email sign-in.
   18+ step, invite step behind its switch, name, username and photo.
   GATE: the founder can sign up on iOS and Android.
3. Core loop: team-created prompts, recording, post review, the public disclosure, posting with local save and Retry.
   Home, the response player and end card, profiles, follows, Following feed.
4. Conversation: video reply rooms and replies to replies, comments sheet, likes, Activity.
   Push notifications with the ask timing and settings.
5. Safety and web: report, block, delete, account deletion, enforcement notices, review requests, moderator tools.
   Web player for shared links and the sign-in sheet.
   GATE: safety complete; required before any outside tester.
6. Places and suggestions: places, place pages, cohort auto-follow, Discover and search.
   Prompt suggestions with review, Your suggestions, first-response drafts.
7. Beta readiness: every empty, error, offline and permission state; analytics events; store builds.
   Store age ratings, privacy policy, terms and community guidelines in place.
   GATE: the closed beta opens in Canggu.
```

Each phase ends with a working build on iOS and Android. Phases 3 and 4 can overlap. Phase 5 can't be skipped or shortened to reach the beta sooner.

## 24. Open decisions for you

Most open questions were settled in the spec review on 5 Oct. The decisions are listed first; what still needs your decision is below them.

**Design gate met (5 Oct):** every v1 screen and state is drawn in Claude Design and approved, including the final design pass and the pre-lock additions. The spec was locked on 5 Oct 2026 and is approved for implementation.

**Decided in the spec review (5 Oct)**

- One primary response per person per prompt; video replies are not limited.
- Prompts stay open after being featured, until archived. Tonight's prompt is featured from about 18:30 until local midnight.
- 5 invites per member, each valid for 7 days; both configurable.
- At most 3 suggestions in review per member. Moderators decline rather than rewrite.
- A private draft response is kept when its suggestion is declined or withdrawn.
- Limits: caption 150, comment 300, bio 150, name 40, username 3–24 characters. Videos 2–30 seconds.
- Comments are text only. Response authors can't delete other people's comments.
- The pinned response stays; profiles show no view counts.
- No camera-roll upload, filters or editing in v1.
- Web: video replies yes, text comments no, link previews on shared video and prompt links, no search indexing during the beta, no web profile pages.
- The Following feed shows responses only, not video replies.
- For you uses simple freshness, followed-place and engagement rules; no ML ranking. The response player plays the entry response, then unseen followed people, then newer responses.
- Sound on; Home loops; the response player auto-advances.
- Discover browses global prompts and followed places; Search lists any place; only open places can be opened and followed.
- Accounts are soft-deleted for 30 days (hidden, restorable by signing in), permanently deleted after day 30. Usernames stay reserved during those 30 days.
- No undo once a content deletion is confirmed.
- One review request per moderation decision. The founder and team moderate during the beta, with no public response-time promise.
- Comment notifications arriving within about 10 minutes are grouped.
- Sign-in order: Apple, Google, email on iOS; Google, Apple, email on Android.
- No weekly waitlist promise. Unposted recordings are deleted on sign-out, after a warning.

**Still open**

- [ ] Store age ratings, privacy policy, terms, community guidelines and data rules. Needed before the beta, not before coding.
