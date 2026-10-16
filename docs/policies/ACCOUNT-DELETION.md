# Account deletion (DRAFT for the Shortcut closed beta)

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
   refused and you are asked again.
4. If you have a recording that has not posted, you are warned before you are signed out (`LV-SignOut`).

## What happens at once

- Your account is marked deleted. Your profile, responses, video replies and comments are **hidden from everyone**,
  including on shared web links. Nothing has been erased yet.
- Your **push notification tokens are removed** and notifications waiting to be sent to you are cancelled, so your
  phone stops receiving them.
- Videos stop being playable [NOT YET TRUE: playback of the account's videos is disabled at the video provider during
  the 30 days; the worker that does this is built and tested but switched to dry-run on the hosted project].

## The 30 days: changing your mind

For **30 days** from the moment you confirm, **signing back in with the same method restores everything**: profile,
videos, replies, comments, followers and settings. There is nothing else to do. Your username is held for you for the
same 30 days so no one else can take it.

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
| **Clean-up job records** | Successful video clean-up records, minimal. Failures that need a person are kept until resolved. | 30 days for successful ones | To prove and repair video deletion. |
| **Product events** | Events carry a random pseudonymous id. Once your account is deleted nothing links that id to you. [PLACEHOLDER: retention period, none is defined yet.] | [PLACEHOLDER] | Beta measurement. |
| **Copies others made** | Anything others have saved or recorded of your videos, such as screen recordings. | Not in our control | |
| **Backups** | [PLACEHOLDER: describe backups and how long deleted data remains; confirm the hosted project's backup setting. **[LEGAL REVIEW]**] | [PLACEHOLDER] | |
| **Profile photo file** | **[NOT YET TRUE]** Profile photos are files in a public storage folder named after your account id. No system deletes them today, on photo change or on account deletion, so a deleted account's photo can stay reachable by its web address. This must be fixed (or this row kept and disclosed) before publication. | Unbounded today | Gap found 16 Oct 2026. |

**Videos we removed before you deleted your account.** A video removed for breaking the guidelines is kept privately for up
to 30 days after its moderation case closes. If its case is still open when your account is permanently deleted, the
case closes at that moment, and the video file is deleted 30 days after that. (`prepare_account_removal`; see
`RETENTION-AND-RECOVERY.md`.)

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
3. Profile photo behaviour is decided and matches the table above.
4. The deletion request path for people without the app exists.
