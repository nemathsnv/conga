# Moderation policy (DRAFT for the Shortcut closed beta)

> **Status: working draft, not legal advice, not published.** It states how moderation works as specified in
> `SPEC.md` sections 12, 17 and 22 and recorded in `docs/DECISIONS.md` (8 and 12 Oct 2026), and as implemented in
> the `mod_*` database functions and `scripts/moderate.sh`. It is written to be published (the "What you
> can expect" parts) and to guide the team (the "How the team works" parts); the team parts may stay internal.
> Placeholders are in square brackets; **[LEGAL REVIEW]** marks claims that depend on law. **Nothing here adds a rule
> to the spec**; where the spec is silent the text says so.

**Effective date:** [PLACEHOLDER: date]

## 1. Principles (from the spec)

- Moderation in the beta is done **by people, case by case**. There are **no automatic thresholds** and **no promised
  review times**.
- **The person who reports is never revealed** to the person reported, in the app or in any notice.
- During the beta the **founder and team** handle all moderation, suggestion reviews and review requests.
  [PLACEHOLDER: who moderates, and the rota; the spec names only "the founder and team".]
- **Every action is logged** with who, when and why.
- Notices never promise an automatic next step.
- Human review is the default for uploads. Whether to add an automatic nudity and violence scanner is an open
  decision (`SPEC.md` section 22); there is none today.

## 2. What you can expect (public summary)

### 2.1 Report

Anyone can report a response, a video reply, a comment or a profile: from the share sheet, the ... menu on a profile, or
a long-press on a comment. Reasons: harassment or bullying; hate speech or symbols; nudity or sexual content; violence
or threats; self-harm or suicide; shares private information; spam or scam; may be under 18; something else.
Afterwards you see: "Thanks for telling us. We'll review it. You won't see this response again." and are offered Block.
"Adam won't know who reported it."

### 2.2 Block

Silent. Both people stop seeing each other's profiles, videos, replies and comments and stop getting notifications about
each other; follows are removed both ways. The blocked person is not told. Unblock in Settings > Blocked accounts. The
confirmation reads: "They won't be able to see your responses, reply to you or follow you, and you won't see theirs.
They won't be told." (`SF-Block`, decided 8 Oct.)

### 2.3 The steps we take

Manual, and severe cases can skip steps.

1. **Remove, with a warning.** The content is removed and the person gets the removal notice (`A-Removed`): what was
   removed, why, and "Nobody can watch it any more. Please treat this as a warning." There is **no separate warning
   action**: a warning *is* the removal notice (DECISIONS 8 Oct). The database function `mod_warn` was dropped in
   `20261008000200_safety_fixes.sql`.
2. **Restrict.** Posting is paused until a date. The person can still watch, but cannot respond, reply, comment or
   suggest prompts (`A-Restricted`: "Posting is paused until 12 October", the reason, "See what was removed").
3. **Suspend.** The person cannot use the app. At sign-in they see why (`LV-Suspended`) and **Request a review**. The
   suspension is enforced on the server for every action: the only things still possible are seeing the notice,
   requesting a review, deleting or recovering the account (the 30-day window applies), updating the time zone and
   removing the push token, and signing out (DECISIONS 8 Oct; function `suspended_allowed_path`).
4. **Under 18.** "May be under 18" is a report reason. Confirmed under-18 accounts are removed. There is no ID check; the
   age is a self-declaration.

The reason text a moderator writes is shown to the person; the note is internal. [PLACEHOLDER: reason-writing
guidance so the text is neutral and accurate.]

### 2.4 Review requests (appeals)

"Request a review" appears on removal, restriction and suspension notices: "We'll review it again." No timing is
promised. **One review request per moderation decision.** The outcome is sent as a notification, with exactly one of two
texts (decided 8 Oct):

- "We reviewed your request. The decision stands."
- "We reviewed your request and reversed the decision."

If the decision is reversed, the content or account is restored. A removed video can be restored only while its file
still exists: a video removed by a moderator is kept privately until 30 days after its case closes (a case closes at the
removal when no review is requested, otherwise at the review decision), and after that it cannot be restored and a
reversing decision cannot bring it back (DECISIONS 12 Oct; `RETENTION-AND-RECOVERY.md`).
[PLACEHOLDER: what the reviewer tells the person when a reversal comes too late to restore the video; the spec text
has no state for it.]

### 2.5 Prompt suggestions

A person reviews every suggested prompt before anyone else sees it. Approve or decline; **moderators do not reword**.
A decline needs a reason from a fixed list, shown to the author as one neutral sentence (accepted 8 Oct):

| Reason | What the author sees |
| --- | --- |
| Singles out a person or group | Not published because it singles out a person or group of people. You can rewrite it and send it again. |
| Too similar to a live prompt | Not published because it is too similar to a prompt that is already live. You can rewrite it and send it again. |
| Promotion | Not published because it promotes something. You can rewrite it and send it again. |
| Asks for private details | Not published because it asks for private details. You can rewrite it and send it again. |
| Unclear | Not published because it is unclear. You can rewrite it and send it again. |
| Other | Not published. You can rewrite it and send it again. |

At most 3 suggestions per member are in review at once. A moderator can remove the author's name on approval. A private
first-response draft is kept when a suggestion is declined or withdrawn.

## 3. How the team works (internal)

### 3.1 Tools

- **Today (development only):** `scripts/moderate.sh` over the `mod_*` functions, which run only as the database
  owner or the service role: `reports`, `reviews`, `log <account>`, `remove-video`, `remove-comment`, `restrict`,
  `suspend`, `restore-account`, `restore-video`, `close-report`, `decide upheld|reversed`, `suggestions`, `approve`,
  `decline`. Run against the hosted project with `LINKED=1`. The moderator name defaults to the git user name.
- **Required before the first outside tester** (Nemat, 8 Oct): a small internal web admin over the same functions, with
  queues, actions, the log and suggestion review, behind team sign-in. **It is not part of the app and must be built
  and checked before Gate 5 can close.** [PLACEHOLDER: link to the admin when it exists.]

### 3.2 Handling a report

1. Read the report queue, oldest first. Look at the content in context (the prompt, the room, the person's history in the
   account log).
2. Decide with the Community Guidelines. Pick the lightest action that fits; severe cases may skip steps. No action is
   automatic and none is applied because of report counts alone.
3. Write the reason the person will read, plain and specific, and an internal note if needed. Do not reveal the reporter.
4. Apply the action (remove, restrict until a date, suspend). The person is notified (a push that ignores Pause all, and
   an entry in Activity) and the action is logged.
5. Close the report once the case is handled (`close-report`).
6. If the person asks for a review, someone **other than the original moderator** looks again where the team has more than
   one person. [PLACEHOLDER: the spec does not require this; confirm.] Decide upheld or reversed; the outcome text is
   one of the two above.

### 3.3 Records

Moderation records for a live account are kept with who, when, why and the note. When an account is permanently deleted
they are anonymised (no account, target, moderator, reason or note) and deleted 90 days later. A period for live accounts
is not decided (`RETENTION-AND-RECOVERY.md`). Who on the team may read them, and how that is logged, is not decided.

### 3.4 What a moderator must not do

Reword a prompt; promise a review time; tell anyone who reported; send a standalone warning; apply a penalty because of a
number of reports; reveal a block; or use the notes field for anything a person could not reasonably be shown if they
asked for their data. [LEGAL REVIEW: access requests may cover internal notes.]

## 4. Open items

1. The web admin does not exist yet (Gate 5).
2. Moderators and rota are not named.
3. Automatic checks on uploads: decision open.
4. The guidelines' definitions need approval (`COMMUNITY-GUIDELINES.md`).
5. Reversal after the video file is deleted has no approved person-facing text.
6. Record retention for live accounts and access rules for the team.
