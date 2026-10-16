# Retention and recovery (DRAFT for the Shortcut closed beta)

> **Status: working draft, not legal advice, not published.** One table of how long each kind of data is kept and
> whether it can be brought back, taken from `SPEC.md` section 18, `docs/DECISIONS.md` (12 Oct 2026 retention rows),
> the migrations (`20261008000100_safety.sql`, `20261012000200_video_deletion_cleanup.sql`,
> `20261013000100_cleanup_reliability.sql`) and `docs/BETA-READINESS.md` section 15. "**Rule exists**" means a
> deletion rule is implemented in the database; "**No rule**" means nothing deletes the data automatically today
> and a period still has to be decided (BETA-READINESS section 4, "Data rules"). Statements marked **[NOT YET
> TRUE]** are intended behaviour the running system does not do yet. Placeholders in square brackets; **[LEGAL
> REVIEW]** marks claims that depend on law. This is also the internal reference the public Privacy Policy and Account
> Deletion pages are checked against.

## 1. Retention table

| Data | Kept for | Rule | Notes and source |
| --- | --- | --- | --- |
| **Your own response or video reply, after you delete it** | Hidden at once everywhere (web links included). The file at the video provider is deleted. | Rule exists; the deleting worker is **[NOT YET TRUE]** on the hosted project (dry-run until Nemat switches it to live) | DECISIONS 12 Oct: "an author's deletion is immediate". Effective even when reports on the video are open. No undo. |
| **A video removed by a moderator** | Kept **privately**, not playable, until **30 days after its moderation case closes**, then the file is deleted for good | Rule exists; worker dry-run, as above | A case closes at the removal when no review is requested. A review requested before the file is permanently deleted pauses the clean-up until the decision, and the case closes at the decision. DECISIONS 12 Oct. |
| **Restoring a removed video** | Until the file is permanently deleted | Rule exists | After deletion a moderator's restore, or a review decision that reverses the removal, is refused (`asset_deleted`); the review queue shows whether a video is still restorable. |
| **An account you deleted: the 30-day window** | 30 days from confirmation | Rule exists | Everything is hidden and playback is disabled **[NOT YET TRUE until the worker is live]**; signing back in restores it. Username reserved. |
| **An account after day 30** | Deleted by the daily job at 03:15 UTC | Rule exists | `purge_deleted_accounts` -> `purge_account`; failures are logged in `account_purge_failures` and retried daily. Sign-in record deleted; profile, follows, likes, blocks, settings, tokens, waitlist entry, notification list cascade. |
| **Empty placeholders ("tombstones")** of responses, video replies and comments that other people's replies sit under | While those replies exist | Rule exists | No author, caption, text or media remains. DECISIONS 12 Oct. |
| **Anonymised moderation records after a purge** | **90 days from the purge**, then deleted | Rule exists (`prune_moderation_records`, daily 03:30 UTC) | Only what was done, to what kind of thing, and when. No account, target, reporter, moderator name, reason text or note. |
| **Moderation records for a live account** (who, when, why; the reason shown in the notice; internal notes) | As long as the account exists | **No rule** for a period | SPEC 17: "Every action is logged with who, when and why." [PLACEHOLDER: decide a period for active accounts, and for people who were suspended and never deleted.] |
| **Reports** about live content and live accounts | Until closed; closed reports are kept | **No rule** for closed reports of live accounts | A reporter's identity is held to run the case and is removed when the reporter's account is purged. [PLACEHOLDER: period.] |
| **Review requests** | With the decision, as above | Same as moderation records | Pending requests close when the requester's account is purged. |
| **Video clean-up job records** | Successful and skipped: **30 days**. Monitoring run history: **14 days**. Failed or orphan records needing a person: kept until resolved. | Rule exists (`prune_mux_cleanup_jobs`, `mux_cleanup_runs`) | They hold video ids so deletion still runs after the rows are gone. |
| **Notifications waiting to be sent** | Until sent, or deleted when the video or your account is deleted | Rule exists | `push_outbox` rows already sent: **No rule**. |
| **Your notification list ("Activity")** | While your account exists | **No rule** for pruning old entries | The list shows recent items; older rows are not deleted. |
| **Push token** | Until you delete the account, or the push service reports the phone unregistered | Rule exists (partial) | The app does not remove the token on sign-out (`docs/release/NOTIFICATIONS.md` gap 2). |
| **Product events** (`analytics_events`) | Unbounded today | **No rule** | Pseudonymous id; unlinked from the person when the account is purged. [PLACEHOLDER: decide a period; DECISIONS 9 Oct fixed the design, not the period.] |
| **Upload records** (`video_uploads`, `post_submissions`) | Unbounded today for completed rows | **No rule** | Per-account ledgers for the upload limits and idempotent posting; they go with the account at a purge. |
| **Profile photo files** | Unbounded today | **No rule [NOT YET TRUE]** | New photo = new file; nothing deletes old ones or deletes at purge. Must be fixed or disclosed. |
| **Sign-in emails (provider logs)** | [PLACEHOLDER: Resend's retention of message logs] | Supplier | **[LEGAL REVIEW]** |
| **Streaming and file-hosting logs, function logs** | [PLACEHOLDER: Mux, Expo, Supabase, jsDelivr log retention] | Supplier | **[LEGAL REVIEW]** |
| **Database backups** | [PLACEHOLDER] | The hosted project had no backups and no point-in-time recovery at the 9 Oct check (BETA-READINESS section 9) | State the real setting before telling anyone deleted data is gone. **[LEGAL REVIEW]** |
| **Unposted recordings on your phone** | Until they post or you discard them | Rule exists | SPEC 19. A recording Shortcut cannot yet confirm as discarded stays private on the phone, out of reach of any other account. |
| **First-response draft on the server** | Until you publish, re-record or delete it; kept when its suggestion is declined or withdrawn; deleted with the account | Rule exists | SPEC 12. |

## 2. Deleting an account outside the app

If an account is deleted any other way than the scheduled purge (the Supabase dashboard, the admin API, SQL), the same
preparation runs first: video files queued for deletion, tombstones created, comments that others reply to kept as
placeholders, moderation records anonymised. A database trigger (`accounts_before_delete`) makes this impossible to skip
(DECISIONS 12 Oct, "stage 3 safeguard").

## 3. Recovery: what can be brought back, and by whom

| Situation | Can it be recovered? | How |
| --- | --- | --- |
| You deleted your own video or comment | **No** | There is no undo after you confirm. |
| You deleted your account, within 30 days | **Yes, everything** | Sign in again with the same method. |
| You deleted your account, after day 30 | **No** | The account and its content are gone. You can join again as a new person with an invite. |
| A moderator removed your video and it is still stored | **Possibly** | Ask for a review. If the review reverses the decision, or a moderator restores it, the video returns, unless the file has already been permanently deleted. |
| Your account is restricted | Time-limited | Posting resumes on the date shown; you can request a review. |
| Your account is suspended | Possibly | Request a review; if reversed, the account is restored. |
| You lost your Apple, Google or email sign-in | **By hand** | Contact us ([PLACEHOLDER: contact]); there are no passwords; we verify you. [PLACEHOLDER: the verification we require.] |
| A recording that did not post | Yes, while on the phone | Retry, or discard it (SPEC 19). |
| Data lost by us (an outage, a mistake) | **Not promised** | The beta is not a backup service. [PLACEHOLDER and **[LEGAL REVIEW]**: see backups above.] |

## 4. Statements the public pages are allowed to make today

Only these are fully supported by the running system without a caveat: the 30-day window and restore-by-sign-in; the
hiding of everything at once; the 90-day anonymised moderation record; tombstones; "no undo" for your own deletions;
that Shortcut is 18+ and invite-only. Everything about a video file being deleted at the video provider, about profile
photos, about how long product events, backups and logs are kept, and about who can read moderation records needs the
checks in `PRIVACY-POLICY.md` and `ACCOUNT-DELETION.md` to be done first.
