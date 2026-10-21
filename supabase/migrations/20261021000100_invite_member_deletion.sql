-- An account that redeemed an invite can be removed (found 21 Oct 2026 by the T2 rehearsal;
-- docs/BLOCKERS.md). Nemat's decision, 21 Oct: the invite keeps its redemption history, loses the
-- link to the deleted person, and can never be redeemed again.
--
-- The defect: invites.redeemed_by is `on delete set null`, but redeemed_at stayed set, and the check
-- invites_redeemed_pair required both to be null or both set. Every removal of a member who had
-- redeemed an invite (the 03:15 purge, or the Auth user deleted in the Dashboard or the Admin API)
-- therefore failed on that row and rolled back: the purge recorded an account_purge_failures row
-- every day and never queued the member's videos for deletion at Mux.
--
-- The three states an invite can be in after this migration:
--   unused                              redeemed_by null, redeemed_at null
--   redeemed, the member exists         redeemed_by set,  redeemed_at set
--   redeemed, the member was deleted    redeemed_by null, redeemed_at kept (set by the foreign key)
-- redeemed_by set with redeemed_at null stays impossible.
--
-- redeemed_at not null is what marks an invite used: invite_lookup answers 'used' for it, so
-- check_invite, invite_preview and redeem_invite refuse it whoever asks. No function treats
-- redeemed_by null as unused. Nothing else changes: no function, grant, index or row.

alter table public.invites drop constraint invites_redeemed_pair;
alter table public.invites add constraint invites_redeemer_has_time
  check (redeemed_by is null or redeemed_at is not null);

comment on column public.invites.redeemed_at is 'When the invite was used. Set means used, for good: it stays after the member is permanently deleted (redeemed_by is then null), so the code is never valid again.';
comment on column public.invites.redeemed_by is 'Who used the invite. Null with redeemed_at set: that member was permanently deleted (on delete set null).';
