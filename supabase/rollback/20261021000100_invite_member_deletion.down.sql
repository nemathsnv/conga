-- ROLLBACK for 20261021000100_invite_member_deletion.sql. NOT a migration: nothing applies this file.
--
-- Copy it to a new forward migration and push that (or apply it on a local stack to test).
--
-- It restores the check of 20261006000100 (redeemed_by and redeemed_at both null or both set) and the
-- columns' missing comments. Rows are never changed.
--
-- It cannot be applied once any member who redeemed an invite has been permanently deleted: that
-- invite has redeemed_by null and redeemed_at set, and the old check would refuse it. It then stops
-- with the list and changes nothing. Clearing redeemed_at to satisfy the old check would make the
-- invite usable again (an unexpired one would answer 'valid'), and deleting the row loses the history
-- Nemat decided to keep, so neither is done here. Once rolled back, removing such a member fails
-- again, as before the fix.
--   select id, code, redeemed_at from public.invites where redeemed_by is null and redeemed_at is not null;

do $$
declare
  v_rows text;
begin
  select string_agg(format('%s (%s, used %s)', id, code, redeemed_at), '; ') into v_rows
    from public.invites where redeemed_by is null and redeemed_at is not null;
  if v_rows is not null then
    raise exception 'deleted_members_invites_exist: % - the old check cannot be restored while these exist', v_rows;
  end if;
end;
$$;

alter table public.invites drop constraint invites_redeemer_has_time;
alter table public.invites add constraint invites_redeemed_pair check ((redeemed_by is null) = (redeemed_at is null));
comment on column public.invites.redeemed_at is null;
comment on column public.invites.redeemed_by is null;
