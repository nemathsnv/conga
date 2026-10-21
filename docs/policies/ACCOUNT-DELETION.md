# Account deletion (DRAFT for the Conga closed beta)

> **Updated 16 Oct 2026 (integration branch `90eced7`)** for the account-lifecycle fixes in `docs/release/SECURITY.md`
> (sessions, profile photos, sign-out on the phone). Those fixes are built and tested on a local stack and are **not
> deployed** to the hosted project: statements that depend on them are marked **[LOCAL ONLY]** until the migrations
> `20261016000200` to `20261016000203` and the `avatar-cleanup` function are live (`RELEASE-CHECKLIST.md`, stage 3).
>
> **Status: working draft, not legal advice, not reviewed, not published.** This describes what the product does,
> from `SPEC.md` section 18, the board `SF-DeleteAccount`, `docs/DECISIONS.md` (12 Oct 2026, two rows on video
> retention and the safeguard on deletion outside the scheduled purge) and the functions `delete_account`,
> `get_onboarding_state`, `purge_account`, `prepare_account_removal` and `prune_moderation_records` in
> `supabase/migrations`. Statements marked **[NOT YET TRUE]** describe the intended behaviour that the running system
> does not do yet; they must be true, or reworded, before this is published. Square brackets are placeholders;
> **[LEGAL REVIEW]** marks claims that depend on law.
>
> This page is also the URL the app stores ask for where a person can learn how to delete their account and what
> happens to their data. Google Play additionally asks for a way to request deletion from outside the app: see
> "If you cannot use the app".

**Effective date:** [PLACEHOLDER: date]

## How to delete your account

1. Open **Settings** and choose **Delete account** (at the bottom).
2. Read the screen. It says: "Delete your account? Your responses, video replies and comments are hidden now and
   permanently deleted after 30 days. Your profile disappears. Your username stays reserved for the 30 days, then
   becomes available. Prompts you suggested stay live, without your name. You have 30 days to change your mind. Sign
   back in to cancel."
3. Choose **Delete account**. You are asked to confirm it is you first, **with the same sign-in method** you use for
   the account (Apple, Google, or an email code). The confirmation must be recent: a sign-in older than 10 minutes is
   refused and you are asked again. (The age is measured from the sign-in time, which a background token refresh does
   not renew **[LOCAL ONLY]**: `delete_account`, `SECURITY.md` L3. Before this fix any session refreshed in the last
   ten minutes passed the check.)
4. If you have a recording that has not posted, you are warned before you are signed out (`LV-SignOut`).

## What happens at once

- Your account is marked deleted. Your profile, responses, video replies and comments are **hidden from everyone**,
  including on shared web links. Nothing has been erased yet.
- **You are signed out everywhere.** Every session of the account, on every phone, is ended and its refresh tokens
  are deleted **[LOCAL ONLY]** (`delete_account` deletes the account's `auth.sessions`, `SECURITY.md` L1). A phone that
  still holds a short-lived access token gets a "session revoked" answer on its next request and signs itself out;
  that token can keep appearing valid for up to an hour on the phone but the server refuses it **[LOCAL ONLY]**
  (`pre_request`, L4).
- Your **push notification tokens are removed** and notifications waiting to be sent to you are cancelled, so your
  phone stops receiving them.
- Videos stop being playable [NOT YET TRUE: playback of the account's videos is disabled at the video provider during
  the 30 days; the worker that does this is built and tested but switched to dry-run on the hosted project].

## The 30 days: changing your mind

For **30 days** from the moment you confirm, **signing in again with the same method restores everything**: profile,
videos, replies, comments, followers and settings. There is nothing else to do. It has to be a **new sign-in**: a phone
that was already signed in before you deleted cannot cancel the deletion just by opening the app **[LOCAL ONLY]**
(restoring needs a session that began after the deletion, `get_onboarding_state`, `SECURITY.md` L2). Before that fix,
opening the app on any other phone that was still signed in cancelled the deletion without anyone signing in. Your
username is held for you for the same 30 days so no one else can take it. Your profile photo is not removed during the
30 days (it is part of what is restored); anyone who already has its web address can still open it until the permanent
deletion.

## Permanent deletion (day 30)

A daily job runs at 03:15 UTC (11:15 in Bali) and permanently deletes every account whose 30 days are over, so
deletion usually completes within a day after day 30. [LEGAL REVIEW: confirm this meets any deletion period promised in
the Privacy Policy.] If the job fails for one account, it is recorded and tried again the next day.

**Deleted for good**

| What | How |
| --- | --- |
| Your sign-in identity (email address, Apple/Google link) | The sign-in record is deleted. |
| Your profile (name, username, bio, photo record), follows, followed places, likes, blocks, notification choices, push tokens, waitlist entry, notifications list | Deleted with the account. |
| Your responses, video replies and first-response drafts | The video files at our video provider are queued for deletion [NOT YET TRUE for the hosted project until the clean-up worker is switched to live]; the database rows are deleted. |
| Your comments | Deleted. |
| Suggestions you sent | The suggestion record and any private draft are deleted. A prompt we already approved **stays live without your name**. |
| Your username | Released and available to others. |
| Unused invite slots | Invites you sent remain valid as invites, without your name as the inviter. [PLACEHOLDER: confirm intended behaviour.] |

**What stays, and why**

| What | What exactly | How long | Why |
| --- | --- | --- | --- |
| **Empty "deleted" placeholders** | If other people's video replies or comments sit under something you made, that item stays as an anonymous "deleted" placeholder (no video, no caption, no text, no author) so their replies still make sense. Replies to a deleted response keep the label "Original response deleted". | As long as those replies exist | Other people's content depends on it. |
| **Anonymised moderation records** | A minimal record of any moderation action or report involving you: what was done, to what kind of thing, and when. It has **no** name, account, target, reporter, moderator name, free-text reason or note. Open reports about other people's content are kept for those cases. | **90 days from the day your account is permanently deleted**, then deleted | To run the safety process, answer review requests and spot repeated abuse. |
| **The invite you joined with** | The invite record stays marked as used, with when it was used, its code, its cohort and who sent it. It no longer points to your account, and the code can never be used again. **[LOCAL ONLY]** until `20261021000100` is deployed; before that, permanent deletion of an invited member fails. | [PLACEHOLDER: no retention period is defined] | So a used invite cannot be reused, and the invite history stays accurate (Nemat, 21 Oct). |
| **Clean-up job records** | Successful video clean-up records, minimal. Failures that need a person are kept until resolved. | 30 days for successful ones | To prove and repair video deletion. |
| **Product events** | Events carry a random pseudonymous id. Once your account is deleted nothing links that id to you. [PLACEHOLDER: retention period, none is defined yet.] | [PLACEHOLDER] | Beta measurement. |
| **Copies others made** | Anything others have saved or recorded of your videos, such as screen recordings. | Not in our control | |
| **Backups** | [PLACEHOLDER: describe backups and how long deleted data remains; confirm the hosted project's backup setting. **[LEGAL REVIEW]**] | [PLACEHOLDER] | |
| **Profile photo files** | **[LOCAL ONLY]** Photos are files in a public storage folder named after your account id. A photo you replace or remove is queued for deletion in the same database change; any other file in your folder older than an hour that is not your photo is queued too; at permanent deletion the whole folder is queued. The `avatar-cleanup` function removes the queued files through the Storage API, run every 10 minutes; it does nothing until its two Vault secrets exist on the hosted project (`20261016000203`, `SECURITY.md` L5). Nothing is queued during the 30-day window. **Until that is deployed and its secrets are set, no system deletes photos and the earlier gap stands.** | Minutes after the permanent deletion once deployed (the queue, not the 03:15 job, removes the files) | Closes the 16 Oct gap. |

**Videos we removed before you deleted your account.** A video removed for breaking the guidelines is kept privately for up
to 30 days after its moderation case closes. If its case is still open when your account is permanently deleted, the
case closes at that moment, and the video file is deleted 30 days after that. (`prepare_account_removal`; see
`RETENTION-AND-RECOVERY.md`.)

## What stays on your phone

Deleting the account on the server does not by itself empty everything on the phone. From the code:

- **An unposted recording** stays on the phone until it posts or you discard it (`SPEC.md` section 19). One that
  Conga could not yet confirm as discarded stays private on the phone, out of reach of any other account, and is
  discarded the next time that account signs in on that phone. For a take with camera flips, the segment files are kept
  in the app's storage until the stitched clip is kept, and then deleted; leftovers from an interrupted take are swept
  when the next take starts (`docs/release/CAMERA-FLIP.md`).
- **When you sign out** (including after you delete the account), the app first removes this phone's push token and
  sends the app's queued events, then clears the queued events and the recent searches of the account that left the
  phone **[LOCAL ONLY]** (`accountCleanup`, `SECURITY.md` A2). The recent searches were never sent to us.
- The phone also holds the sign-in session until you sign out or it is revoked.

## What deletion does not do

- It does not remove content other people made about you or in reply to you, other than the placeholder rule above.
- It cannot be undone after day 30. Content deleted by the permanent job cannot be restored by anyone.
- You cannot merge, transfer or rename accounts. If you come back after day 30 you start a new account and need a new
  invite or waitlist admission.

## If you cannot use the app

If you cannot sign in (lost access to your Apple, Google or email), contact [PLACEHOLDER: support contact]. There are no
passwords, so we cannot reset one; we verify you by hand before acting. [PLACEHOLDER: describe exactly what we ask for.
**[LEGAL REVIEW]**] **[PLACEHOLDER: a web form or address that accepts account deletion requests without the app; Google
Play requires a link for this, and none exists yet.]** We will tell you when the request is done.

## For the team: what the checks must show before this is published

1. A test account, deleted and restored within 30 days, gets everything back.
2. A test account, deleted and then purged, has no profile, no responses, no comments, no push token, no waitlist row
   and no sign-in record; its tombstones, if any, have no author, caption, body or media; moderation records have no
   identifying column; clean-up jobs for its videos reach "done" with the worker live.
3. Profile photos: after the hosted deployment, a replaced photo and a purged account's folder are gone from the
   `avatars` bucket (read-only check of `public.avatar_removals`: rows `done_at` set, and a request for an old photo's
   address answers 404).
4. The deletion request path for people without the app exists.
