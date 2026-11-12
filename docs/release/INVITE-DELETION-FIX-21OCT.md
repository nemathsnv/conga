# Invite-linked account deletion fix (21 Oct 2026)

Branch `claude/invite-account-deletion-fix-693183`, on `claude/provider-t2-tooling` (`c0d0ba8`).
**Deployed to hosted 21 Oct 07:06:52 UTC (Nemat's approval) and verified:** `docs/BETA-READINESS.md`
section 40. Nothing else was deployed, pushed or merged; no Mux call or real deletion was made.

## The defect

Every member who redeemed an invite (every closed-beta member) could not be removed.

- `invites.redeemed_by` references `accounts (id) on delete set null`. `redeemed_at` has no such
  action, so it stays set.
- `invites_redeemed_pair` (`20261006000100`) required both to be null or both set:
  `CHECK ((redeemed_by IS NULL) = (redeemed_at IS NULL))`.
- So the cascade from `auth.users` to `accounts` set `redeemed_by` to null on the member's invite, the
  check refused the row, and the whole deletion rolled back.
- **The purge:** `purge_deleted_accounts()` caught the error per account, wrote an
  `account_purge_failures` row, and queued nothing. It would have failed again every day, and the
  member's videos would never have been queued for deletion at Mux.
- **A manual deletion:** the Dashboard's "Delete user" (Auth Admin API) answered 500.
- Hosted today: no account is deleted, so nothing has failed yet.

## Nemat's decision (21 Oct)

Keep the invite's redemption history after the member is permanently deleted, unlink the deleted
person, and make sure the invite can never be redeemed again.

## The change: `supabase/migrations/20261021000100_invite_member_deletion.sql`

```sql
alter table public.invites drop constraint invites_redeemed_pair;
alter table public.invites add constraint invites_redeemer_has_time
  check (redeemed_by is null or redeemed_at is not null);

comment on column public.invites.redeemed_at is 'When the invite was used. Set means used, for good: it stays after the member is permanently deleted (redeemed_by is then null), so the code is never valid again.';
comment on column public.invites.redeemed_by is 'Who used the invite. Null with redeemed_at set: that member was permanently deleted (on delete set null).';
```

The three states it allows:

| State | `redeemed_by` | `redeemed_at` |
| --- | --- | --- |
| Unused | null | null |
| Redeemed, member exists | set | set |
| Redeemed, member permanently deleted | null | kept |

`redeemed_by` set with `redeemed_at` null stays impossible. No function, grant, index, foreign key or
row changes. Every existing row satisfies the new check, because the old one was stricter.

### Why `redeemed_at` alone marks an invite used

- `invite_lookup_unlimited` (behind `invite_lookup`, `check_invite`, `invite_preview` and
  `redeem_invite`) answers `used` when `redeemed_at is not null`, before it looks at anything else
  except `cancelled_at`.
- No database function treats `redeemed_by is null` as "unused".
- `has_beta_access`, `invites_left`, `my_invites` and `cancel_invite` read `redeemed_by` only to find a
  member. A null there matches no one, so a deleted member's invite gives no one access.
- **One script did:** `scripts/provider-t2-invite.sh` (CP0′-a) looked for an "unused" invite with
  `redeemed_by is null`. It now uses `redeemed_at is null`, in its guard and in its read-back. With the
  old predicate, a deleted member's invite would have counted as unused: the guard would have refused
  CP0′-a, and the read-back would have found two rows.

## Not changed; both decided by Nemat on 21 Oct (`docs/DECISIONS.md`)

1. **The inviter's slot comes back.** `invites_left` counts an invite against its inviter while
   `expires_at > now()`, or while its redeemer still has a profile. Once the invitee is permanently
   deleted, `redeemed_by` is null, so the invite stops counting as soon as it has also expired. Invites
   are valid for 7 days and the purge runs after 30, so in practice the inviter gets the slot back at
   the purge. `my_invites` also stops listing it under "Joined". SPEC Section 14 says only "Cancelling
   an unused invite returns it". It does not say what happens when the invitee is deleted. The code
   was already written this way; the defect just meant the state never occurred. **Decision: keep it.**
2. **What the kept row still holds.** It keeps `code`, `cohort`, `inviter_id`, `created_at`,
   `expires_at`, `redeemed_at` and `cancelled_at`, with no account id, name, email or username.
   - The approved decision keeps exactly this history, so the row is not changed further.
   - **Indirect link:** the inviter, or the team, may know whom a given code was for. A team code can
     be a chosen word: `scripts/create-invite.sh PUTU-7K2` makes the code `PUTU-7K2`.
   - **No retention period is defined** for invite rows.
   - `docs/policies/ACCOUNT-DELETION.md` now lists the kept row.
   - **Decision:** a provisional 90-day retention target after permanent deletion, subject to privacy
     and legal review, implemented separately later. Nothing in this migration enforces it.

## Tests

All on the isolated stack `shortcut-inv`, with all 28 migrations applied from a reset and a fake Mux.
Results are in `docs/BETA-READINESS.md` section 39.

- **pgTAP `supabase/tests/0033_invite_member_deletion.sql`:** 62 assertions.
  - **The check:** the new definition; the old one is gone; "redeemer set without a time" is still
    refused; both foreign keys are still `set null`.
  - **The automatic purge:** `delete_account` queues `sync_playback/account_deleted`. On day 31,
    `purge_deleted_accounts()` returns 1, and the failure row the defect had left is cleared. The Auth
    user, account, profile and response are gone. The invite keeps every field except
    `redeemed_by`. One `delete_asset/account_purged` is queued, owned by the member.
  - **The used code stays used:** `invite_preview` (anonymous), `check_invite` and `redeem_invite` all
    answer `used`. The refused attempt changes nothing and gives no access or cohort.
  - **Repeats:** a second purge returns 0, `purge_account` returns false, and a second Auth deletion is
    harmless. No new jobs and no failure rows.
  - **A manual Auth deletion** (`delete from auth.users`, which the Dashboard and Admin API do), for a
    member who joined through a personal link: it lives. The invite keeps its time and inviter, one
    `delete_asset/account_removed` job is queued, and the code answers `used`. The inviter's sent list
    shows nothing of the deleted member. Repeating it is harmless.
  - **Other members:** two deleted members' invites coexist. The other members' accounts, profiles,
    videos and invites, and the unused invite, are byte-identical, with no jobs on their videos.
  - **Normal redemption:** a team code, `already_in`, a code becoming `used` for others, a personal
    link making a child invite. No invite anywhere has a redeemer without a time.
- **Deno `provider_t2_rehearsal_test.ts`:** both E3 tests now assert the fix instead of the defect, and
  the hand-made "stand-in" is removed.
  - **E3(i):** the purge returns 1 with no failure row, and a second run returns 0. T2's invite stays
    used. `delete_asset/account_purged` is queued, then drained live against the fake.
  - **E3(ii):** the Auth Admin API `DELETE` answers 200. The invite stays used and one
    `delete_asset/account_removed` is queued. A second `DELETE` is refused and queues nothing more.
- **The real-provider leak in rehearsals.** `prewarm()` always fetched `https://stream.mux.com`, so a
  rehearsal's made-up playback ids were sent there in an unauthenticated GET.
  - `_shared/mux.ts` `muxStreamBase()`: `MUX_STREAM_BASE` may name a local http fake (the same rule as
    `MUX_API_BASE`, refused otherwise).
  - When `MUX_API_BASE` names a fake and `MUX_STREAM_BASE` is unset, prewarm fetches nothing. So every
    fake-Mux run (full verification, scheduler, C1, simulator) stops contacting `stream.mux.com`
    without any change to its settings.
  - `provider-rehearsal.sh` sets `MUX_STREAM_BASE` to the fake, and the T2 rehearsal asserts the fake
    received the prewarm GET.
  - `mux_test.ts` covers it: no fetch with a fake API and no stream base; only the fake when one is
    given; nothing for a non-local base.
  - **Hosted is unchanged:** neither variable is set there, so the result is `https://stream.mux.com`
    as before. The function change does not need deploying.
  - Unchanged and still out of scope: the in-process integration suites stub `fetch`, so they never
    reached the network.

## Hosted deployment (approved and done 21 Oct; the record is in `BETA-READINESS.md` section 40)

### Preflight (read-only)

1. Migrations: exactly 27 applied, the latest `20261019000200`. `supabase db push --dry-run` lists
   only `20261021000100_invite_member_deletion.sql`.
2. In a READ ONLY transaction:
   - `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.invites'::regclass and contype = 'c'`:
     `invites_redeemed_pair` with `CHECK ((redeemed_by IS NULL) = (redeemed_at IS NULL))`, plus the
     code format check.
   - `select count(*) from public.invites where (redeemed_by is null) <> (redeemed_at is null)`: 0.
   - `select count(*) from public.invites`, `… where redeemed_at is null`: expected 2 and 0 before
     CP0′-a (3 and 0 after it, T2's redeemed).
   - `select count(*) from public.accounts where deleted_at is not null`: expected 0.
   - `select count(*) from public.account_purge_failures`: expected 0.
   - The schema fingerprint (`scripts/schema-fingerprint.sql`) saved as "before".
3. Clean-up switch `off`, health `ok`, no open job: as every provider step.

### Backup

- **Write first:** confirm the project's plan and its backup setting. The policy table still has a
  placeholder for this. A Free project has no point-in-time recovery.
- **Data:** before the push, take a data-only dump of `public.invites`, for example
  `pg_dump --data-only -t public.invites`. Keep it with mode 600 outside the repository. It holds live
  invite codes.
- **Schema:** the "before" fingerprint is enough to prove what changed.

### Push and postflight

- **Push:** `supabase db push`, one migration. It takes an ACCESS EXCLUSIVE lock on `invites` for the
  validation of 2 or 3 rows, which takes milliseconds. A concurrent `check_invite` or `redeem_invite`
  waits for it.
- **Postflight fingerprint:** the diff against "before" must be exactly
  `constraint|invites.invites_redeemed_pair` removed and `constraint|invites.invites_redeemer_has_time`
  added. Column comments are not fingerprinted. The migration count is 28.
- **Postflight data:** the counts from the preflight are unchanged.
- **E3:** E3(i) or E3(ii) can then run as planned.

### Rollback limitations

- `supabase/rollback/20261021000100_invite_member_deletion.down.sql` restores the old check.
- **It only works before any invited member is deleted.** Afterwards it refuses, listing the rows,
  and changes nothing. The old check cannot hold a deleted member's invite, and the only ways to make
  it fit are to clear `redeemed_at` (the code could become valid again) or to delete the row (the
  history Nemat chose to keep is lost).
- **Rolling back brings the defect back:** deletions fail again.
- **A purge cannot be undone** by any rollback. The account, profile and videos are gone, and their
  asset deletions are queued.

### Deployment risk

- **Low for the schema:** it relaxes one check on a 2- to 3-row table, with no function changes.
- **The behaviour change is intended:** deletions that used to fail now succeed.
  - On hosted, no account is deleted or pending, so nothing is purged at the next 03:15 run.
  - From then on, a member who deletes their account is really removed on day 31.
  - Their `delete_asset` jobs queue as designed. While clean-up is `off`, they wait, and no Mux call
    is made.
- The two open questions above (the inviter's slot, and what the kept row holds) take effect once the
  first invited member is deleted.
