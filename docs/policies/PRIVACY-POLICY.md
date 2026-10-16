# Privacy Policy (DRAFT for the Shortcut closed beta)

> **Status: working draft written from the product as specified and built on 16 Oct 2026. Not legal advice, not
> reviewed by a lawyer, not published.** Nothing in square brackets is decided. Every sentence marked
> **[LEGAL REVIEW]** makes a statement that depends on law, on a contract with a supplier, or on a fact the
> company still has to confirm. Do not publish until each placeholder is filled, each review mark is cleared and
> each item in "Checks before publishing" at the end is true.
>
> **Updated 16 Oct 2026 (integration branch `90eced7`)** for `docs/release/SECURITY.md`, `VIDEO-RELIABILITY.md` and
> `CAMERA-FLIP.md`. **[LOCAL ONLY]** marks behaviour that exists in the repository and passed local tests but is **not
> deployed** to the hosted project (migrations `20261016000200` to `20261016000203`, function `avatar-cleanup`) or is
> in app code no phone has run; do not publish a **[LOCAL ONLY]** sentence as true until it is deployed and checked
> (`RELEASE-CHECKLIST.md`, stage 3).
>
> Sources: `SPEC.md` sections 2, 13 to 18, 21 and 22; `docs/DECISIONS.md` (9 and 12 Oct 2026); the database
> migrations in `supabase/migrations`; the app in `app/src`. Words: a **response** is a video made for a prompt;
> a **video reply** is a video made in reply to a response or another video reply; a **comment** is text.

**Effective date:** [PLACEHOLDER: date]
**Who we are:** [PLACEHOLDER: Company legal name], [PLACEHOLDER: registered address and country], the company that
runs Shortcut ("we", "us"). [PLACEHOLDER: final product name; "Shortcut" is the working name.]
**Contact for privacy questions and requests:** [PLACEHOLDER: privacy contact email address]
(see also `HELP-AND-CONTACT.md`). [PLACEHOLDER: data protection officer or representative, if one is required.
**[LEGAL REVIEW]**]

## 1. What this policy covers

This policy covers the Shortcut app on iOS and Android, the web pages that open when someone shares a link to a
response, a video reply or a prompt, and the closed beta waitlist. Shortcut is in a **closed beta**: you need an
invite from a member, or admission from the waitlist, to make a profile. Shortcut is for people who are **18 or
older**.

## 2. What we collect, and why

### 2.1 What you give us

| What | When | Why | Who can see it |
| --- | --- | --- | --- |
| **Email address** | You sign in with an email code, or Apple or Google gives us your email when you use them. Apple's "Hide my email" relay addresses are treated like any other address. | To create and secure your account, send sign-in codes, and tell you when you are admitted from the waitlist. | Only us and the services that deliver the email (section 4). Never shown to other members. |
| **Your answer to "Are you 18 or older?"** | Onboarding | To keep Shortcut to adults. We record the time you confirmed; we do not check ID. | Us. |
| **Name, username and optional bio** | You choose them when you create your profile. | To show who made a response, video reply, comment or follow. | Every signed-in member. |
| **Profile photo (optional)** | You take one or choose one from your photo library. Only the photo you select is read. | To show on your profile. | Every signed-in member, and anyone who has the photo's web address. |
| **Videos: responses and video replies** | You record in the app and tap Post. Recording happens only inside Shortcut; you cannot upload from your camera roll. | To show them to others. **They are public** (section 3). | Anyone on Shortcut, and anyone with a link (section 3). |
| **First-response drafts** | You record one for a prompt you suggested, while it is in review. | To keep it for you until you publish, re-record or delete it. | Only you, until you publish it. |
| **Captions, comments, bio, prompt suggestions** | You write them. | To show on the product, and for review of suggestions. | Captions and comments: members who can see the video. Suggestions: us until reviewed; then public if approved, with your name unless you turn that off. |
| **Likes, follows, followed places, blocks** | You tap them. | To run the feeds and the Activity list. Followed places are private. Blocks are silent. | You and us. Counts of likes and follows can be seen by others. |
| **Reports, review requests, messages to us** | You send them. | To review them. Reports are anonymous to the person reported. | Us. |
| **Notification choices** | Settings | To send only what you chose. | You and us. |

### 2.2 What the app sends us as you use it

| What | Details | Why |
| --- | --- | --- |
| **Product events** | A short list of first-party events such as: sign-in started or completed, the 18+ answer, invite used, a video played (with how long it was watched), recording started or finished, a video published, notification ask shown, share tapped, report sent, block, deletion requested. The full list is in `SPEC.md` section 21. Each event carries a **pseudonymous id** (a random id linked to your account only inside our own database, never your name or email), your beta cohort, your phone's platform (iOS or Android), the app version, and a time. | To learn whether people who watch go on to respond and reply, and to find bugs in the beta. We do not use advertising or tracking software, and these events are not sent to any analytics company. They stay in our own database. |
| **Phone time zone** | The name of your time zone (for example "Asia/Makassar"), refreshed when the app opens. | To send "Tonight's prompt" at about 18:30 your time. It is not your location; we do not collect GPS location. **[LEGAL REVIEW: a time zone name indicates an approximate region]** |
| **Push token** | If you allow notifications, an identifier for your phone issued through Expo's push service, with whether it is iOS or Android. | To deliver the notifications you chose. It is removed when you delete your account or when the push service says the phone is no longer registered. |
| **Permissions** | The camera and microphone are used only while you record. The photo library is used only when you choose a profile photo. | To record and to set a photo. Recording without sound is not allowed. |
| **Recent searches** | Kept on your phone only, and cleared when the account signs out of that phone **[LOCAL ONLY]**. | To show recent searches. |

### 2.3 What we do not collect

No advertising identifiers, no advertising or tracking software, no GPS or precise location, no contacts, no
camera-roll uploads, no phone number, no payment details (Shortcut has no purchases in the beta), no health or
financial data, and no information from other apps or websites.

### 2.4 On the web

Anyone with a link can watch a shared response, video reply or prompt in a browser without an account. The page we
serve sets no cookies. To play the video the page loads a small open-source video player script from the public
content network jsDelivr (a fixed, integrity-checked version, so the script cannot change without us changing it), and the video and thumbnail from our video provider, so those providers see the visitor's
technical request data (such as the IP address). When a link is opened we also record one event ("web link opened":
a video, a prompt or an invite) with a random id that is different on every visit and is not tied to a person.
**[LEGAL REVIEW: our hosting provider also receives request data such as IP addresses as part of serving the page;
their handling is described in their own notices, section 4.]** The web pages ask search engines not to index them
during the beta.

## 3. What is public

**Your videos are public.** Anyone on Shortcut can watch them, people can reply on video and share them, and
responses can get comments. A shared link works on the web **without an account**. You are shown this in the app
before your first public video ("Your videos are public") and you must accept before anything is published. You can
delete any of your videos at any time (section 7).

Your name, username, photo, bio, follower and following counts and the videos you publish are visible to signed-in
members unless a block hides you from a particular person. Prompts you suggest and which we approve are public, with
your name unless you switched that off. Followed places, blocks, your email address, your notification choices and
your private drafts are not shown to other members.

## 4. Who handles data for us

We use these providers to run Shortcut. They process data on our behalf and under their own terms.
**[LEGAL REVIEW: confirm each contract or terms, data processing terms, locations and sub-processors; this table
states what the product does, not what the contracts say.]**

| Provider | What for | What it receives | Where (as configured, **[LEGAL REVIEW: confirm]**) |
| --- | --- | --- | --- |
| **jsDelivr** (content network) | Serving the video player script on shared web pages | The visitor's request data | [PLACEHOLDER: confirm] |
| **Supabase** | Hosting: database, sign-in (Auth), file storage for profile photos, and the server functions behind the app and the web pages | Everything in section 2 except the video files | Project region ap-southeast-1 (Singapore) |
| **Mux** | Video processing, storage and streaming | Your video files, and the technical data any viewer's phone sends when it plays a video | Mux upload endpoints are in the United States (spike measurements, `spike/REPORT.md`); delivery is through a content network |
| **Resend** | Sending sign-in codes and waitlist emails | Your email address and the message | [PLACEHOLDER: confirm region and terms] |
| **Expo** (push notification service) | Passing notifications to Apple and Google | Your push token and the text of the notification (for example "Sofia replied to your response with a video") | [PLACEHOLDER: confirm] |
| **Apple** and **Google** | Sign in with Apple, Google Sign-In, and delivering notifications to your phone | What you authorise when you use them; the notification text | their own terms |

We do not sell personal information. We do not share it for advertising. **[LEGAL REVIEW: state precisely, in the
words the laws that apply require.]**

## 5. Why we may use your data (legal bases)

[LEGAL REVIEW: choose and state the legal basis for each purpose under the laws that apply to our members, which may
include Indonesia's personal data protection law and the laws of the countries our members live in; the spec names
no jurisdiction and none was assumed here. Typical purposes: providing the service you asked for; keeping it safe
and enforcing the Community Guidelines; product improvement; legal obligations.]

## 6. How long we keep it

Full detail is in `RETENTION-AND-RECOVERY.md`. In short:

- **Your account and everything you made** stay until you delete them or your account.
- **If you delete a video**, it disappears everywhere at once and its file is deleted from our video provider.
- **If you delete your account**, everything you made is hidden immediately and permanently deleted after **30 days**,
  and you are signed out on every phone **[LOCAL ONLY]**. If you sign in again during the 30 days, everything comes
  back (a phone that was already signed in cannot cancel the deletion by itself **[LOCAL ONLY]**). Your username stays
  reserved for the 30 days. Details in `ACCOUNT-DELETION.md`.
- **Profile photos.** A photo you replace or remove, and all photos of a permanently deleted account, are deleted from
  our file storage within minutes **[LOCAL ONLY]** (a queue and the `avatar-cleanup` function). During the 30-day
  window a deleted account's photo can still be opened by anyone who already has its web address.
- **A video we removed** for breaking the guidelines is kept privately, and invisible, until 30 days after the
  moderation case on it closes, so a mistake can be put right; then it is permanently deleted. A case closes when we
  remove the video, or, if you ask for a review in time, when the review is decided.
- **After your account is permanently deleted**, we keep a minimal, anonymous record of moderation decisions (what was
  done, to what kind of thing, and when; no names, no text, no account) for **90 days**.
- **Product events** are not linked to you after your account is permanently deleted, because the link between your
  account and the pseudonymous id is deleted with it. [PLACEHOLDER: how long product events are kept; no retention
  period has been decided.]
- **Backups.** [PLACEHOLDER: describe our database backups and how long deleted data remains in them. At the last
  check (9 Oct) the hosted project had no backups enabled; confirm the current state. **[LEGAL REVIEW]**]

## 7. Your choices and rights

- **Delete a video** you made: from your profile or the video's menu. There is no undo once you confirm.
- **Delete a comment** you wrote: long-press it.
- **Edit** your name, username, bio and photo in Settings and Edit profile.
- **Notifications:** Pause all, or choose each type, in Settings; or turn them off in your phone's settings.
- **Block** a person: it is silent; undo it in Settings > Blocked accounts.
- **Delete your account:** Settings > Delete account (`ACCOUNT-DELETION.md`).
- **What stays on your phone:** an unposted recording and, for a take with camera flips, its segment files until the
  stitched clip is kept (then they are deleted); your sign-in session; and, until you sign out, the app's queue of
  events not yet sent and your recent searches. Signing out removes this phone's notification token and clears the
  queued events and recent searches of the account that leaves **[LOCAL ONLY]**. A recording that could not yet be
  confirmed as discarded stays private on the phone for that account.
- **Ask us:** to see, correct, export or delete personal data, or to object to a use, write to [PLACEHOLDER: privacy
  contact]. We will check it is you. [LEGAL REVIEW: list the rights that apply and the response period; the product
  has no in-app data export today.]
- **Lost access to your sign-in:** there are no passwords; contact us and we verify you by hand
  (`HELP-AND-CONTACT.md`).

## 8. Security

Data is sent over encrypted connections. Access to your data inside the product follows rules enforced on the
server: you can only act as yourself, and database access is restricted by row-level rules. Members can read only
their own rows of the profile, follow and comment tables directly; what they see of other people goes through
functions that apply blocks, reports and the 30-day deletion window **[LOCAL ONLY]** (`SECURITY.md` P1 to P7).
Moderator names and internal moderator notes are not readable by members, including on records about their own
account **[LOCAL ONLY]** (P3). When a session ends, because you sign out or delete the account, its access is refused
on the next request, not after the token would have expired **[LOCAL ONLY]** (L4). Video upload links are
created by our server for your account only, are single-use and expire; no provider secret is stored in the app.
Only our team can read the product events and moderation records. [PLACEHOLDER: who on the team has access, and
how that is logged. **[LEGAL REVIEW]**] No system is perfectly secure, and we cannot promise it is.

## 9. Children

Shortcut is for people **18 or older**, by self-declaration; we do not check ID. "May be under 18" is a report
reason, and an account we confirm is under 18 is removed. If you believe a child has made an account, tell us
(`HELP-AND-CONTACT.md`). **[LEGAL REVIEW: the age threshold and verification duties differ by country.]**

## 10. Moving data between countries

Our providers may store or process data in other countries than yours, including Singapore and the United States.
[LEGAL REVIEW: describe transfer mechanisms and safeguards required by the laws that apply.]

## 11. Changes

We will update this policy when the product changes and show the new effective date. If a change matters to you, such
as a new use of your data, we will tell you in the app or by email before it applies. [PLACEHOLDER: notice period.]

## 12. Contact

[PLACEHOLDER: Company legal name, address, privacy contact email.] To complain to a regulator: [PLACEHOLDER: the
relevant authority, if any.]

---

## Checks before publishing (not part of the policy; delete this section when the policy goes live)

Each line is a statement above that is true of the **design** but not yet verified true of the **running system**.

1. **Deleting a video deletes its file at Mux.** The deletion worker (`mux-cleanup`) is deployed to the hosted project
   but switched to dry-run: no Mux asset has been permanently deleted by the system except one canary
   (BETA-READINESS section 15). The statements in sections 6 and 7 are not yet true on the hosted project until Nemat
   switches the worker to live.
2. **Profile photos.** The fix is local only: the queue in `20261016000203` and the `avatar-cleanup` function. It is
   inert on the hosted project until the function is deployed and the two Vault secrets exist, and then a read-only
   check must show replaced and purged photos gone from the `avatars` bucket (`SECURITY.md` L5, section 6 step 6).
   Until then section 6's photo bullet is not true.
3. **Product events have no retention rule.** `analytics_events` is never pruned. A period must be decided.
   Likewise `push_outbox` rows already sent, `activity` rows, `video_uploads` and `post_submissions` have no
   deletion rule (BETA-READINESS section 4, "Data rules", still open).
4. **Backups** (section 6): confirm what the hosted project actually has.
5. **Where this policy lives in the app.** The approved Settings board has rows for Community guidelines and Help
   and feedback only; there is no Privacy policy or Terms row, and the Welcome line reads "By continuing you agree
   to the Terms and Community Guidelines." with no mention of this policy. Apple and Google require a policy link in
   the store listing and, for Apple, in the app. A board is needed before any link is built (design gate).
6. **Who may read `analytics_events`** (section 8).
7. **Supplier locations and terms** in section 4.
8. **Web player script.** The shared-link page loads `hls.js` 1.7.3 from `cdn.jsdelivr.net`, pinned to that exact
   version with a sha384 integrity hash and `crossorigin="anonymous"` (`supabase/functions/web/links.ts`, 16 Oct).
   The script itself is now fixed, but jsDelivr still receives each visitor's request (IP address, browser,
   referring page), so the third-party disclosure in sections 2.4 and 4 stays true. Self-hosting the file from our own
   function would remove that third party; it is not done. Re-check the hash whenever the version changes.
9. **Hide My Email** (Apple): the waitlist-admission email may not reach those addresses unless the sending domain is
   registered with Apple (`docs/release/IOS.md` section 5).
10. **Sessions and direct reads** (sections 6 and 8) are **[LOCAL ONLY]** until the hosted preflight in
    `SECURITY.md` section 6 passes (`postgres` must be able to read and delete `auth.sessions`) and migrations
    `20261016000200` to `20261016000202` are pushed.
11. **Camera flip** (section 7, on-phone data): built, not run on a phone (`CAMERA-FLIP.md`).
