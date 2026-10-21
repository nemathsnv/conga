-- pgTAP tests for 20261021000100: a member who redeemed an invite can be removed, by the daily purge
-- or by deleting the Auth user, and the invite stays used for good (Nemat, 21 Oct 2026).
-- Lena invites; Adam (team code) is purged on day 31; Maya (Lena's personal link) is removed by
-- deleting her Auth user; Zed is an untouched member; Nia redeems normally; Late tries the used codes.
begin;
select plan(62);

delete from public.reports;
delete from public.review_requests;
delete from public.moderation_actions;
delete from public.activity;
delete from public.likes;
delete from public.comments;
delete from public.follows;
delete from public.responses;
delete from public.prompts;
delete from public.invites;
delete from public.mux_cleanup_jobs;
delete from public.account_purge_failures;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now()),
  ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya@example.com', '{}', '{}', now(), now()),
  ('d4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zed@example.com', '{}', '{}', now(), now()),
  ('e5555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nia@example.com', '{}', '{}', now(), now()),
  ('f6666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'late@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
update public.accounts set beta_cohort = 'canggu' where id in ('a1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333333', 'd4444444-4444-4444-4444-444444444444');
update public.accounts set invite_code = 'LENA-4F9K' where id = 'a1111111-1111-1111-1111-111111111111';
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam'),
  ('c3333333-3333-3333-3333-333333333333', 'Maya Reyes', 'testmaya'),
  ('d4444444-4444-4444-4444-444444444444', 'Zed Stone', 'testzed');
insert into public.invites (code, cohort, inviter_id, created_at, expires_at, redeemed_by, redeemed_at) values
  ('TEAM-ADAM', 'canggu', null, '2026-10-01 09:00+00', '2026-10-08 09:00+00', 'b2222222-2222-2222-2222-222222222222', '2026-10-02 10:00+00'),
  ('SC-MAYA22', 'canggu', 'a1111111-1111-1111-1111-111111111111', '2026-10-03 09:00+00', '2026-10-10 09:00+00', 'c3333333-3333-3333-3333-333333333333', '2026-10-03 09:00+00'),
  ('TEAM-ZED', 'canggu', null, '2026-10-01 09:00+00', '2026-10-08 09:00+00', 'd4444444-4444-4444-4444-444444444444', '2026-10-04 10:00+00'),
  ('TEAM-LENA', 'canggu', null, '2026-09-30 09:00+00', '2026-10-07 09:00+00', 'a1111111-1111-1111-1111-111111111111', '2026-09-30 10:00+00'),
  ('TEAM-NEW', 'canggu', null, now(), now() + interval '7 days', null, null);
insert into public.prompts (id, text, status, published_at) values ('11111111-aaaa-aaaa-aaaa-111111111111', 'P1', 'live', now());
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ee000000-0000-0000-0000-00000000000a', '11111111-aaaa-aaaa-aaaa-111111111111', 'b2222222-2222-2222-2222-222222222222', 5000, 'live', 'upA', 'asA', 'pbA', now()),
  ('ee000000-0000-0000-0000-00000000000c', '11111111-aaaa-aaaa-aaaa-111111111111', 'c3333333-3333-3333-3333-333333333333', 5000, 'live', 'upM', 'asM', 'pbM', now()),
  ('ee000000-0000-0000-0000-00000000000d', '11111111-aaaa-aaaa-aaaa-111111111111', 'd4444444-4444-4444-4444-444444444444', 5000, 'live', 'upZ', 'asZ', 'pbZ', now()),
  ('ee000000-0000-0000-0000-0000000000a1', '11111111-aaaa-aaaa-aaaa-111111111111', 'a1111111-1111-1111-1111-111111111111', 5000, 'live', 'upL', 'asL', 'pbL', now());

-- What must not change for the members who stay.
create temp table before_rows as
  select 'account:' || id as k, to_jsonb(a) as v from public.accounts a where id in ('a1111111-1111-1111-1111-111111111111', 'd4444444-4444-4444-4444-444444444444')
  union all select 'profile:' || id, to_jsonb(p) from public.profiles p where id in ('a1111111-1111-1111-1111-111111111111', 'd4444444-4444-4444-4444-444444444444')
  union all select 'response:' || id, to_jsonb(r) from public.responses r where author_id in ('a1111111-1111-1111-1111-111111111111', 'd4444444-4444-4444-4444-444444444444')
  union all select 'invite:' || code, to_jsonb(i) from public.invites i where code in ('TEAM-ZED', 'TEAM-LENA', 'TEAM-NEW');
create temp table before_invites as select * from public.invites;
grant all on before_rows, before_invites to authenticated, anon;

create function pg_temp.act(p_account uuid) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","session_id":"5c000000-0000-0000-0000-000000000001","amr":[{"method":"otp","timestamp":%s}]}', p_account, extract(epoch from now())::bigint - 30), true);
$$;
grant execute on function pg_temp.act(uuid) to authenticated;
create function pg_temp.inv(p_code text) returns public.invites language sql stable security definer set search_path = '' as $$ select * from public.invites where code = p_code $$;
grant execute on function pg_temp.inv(text) to authenticated, anon;

-- ===========================================================================
-- 1. The check
-- ===========================================================================
select is((select count(*)::int from pg_constraint where conrelid = 'public.invites'::regclass and conname = 'invites_redeemed_pair'), 0, 'the both-or-neither check is gone');
select is((select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.invites'::regclass and conname = 'invites_redeemer_has_time'),
          'CHECK (((redeemed_by IS NULL) OR (redeemed_at IS NOT NULL)))', 'a redeemer needs a redemption time');
select throws_ok($$ insert into public.invites (code, cohort, expires_at, redeemed_by) values ('BAD-1', 'canggu', now() + interval '1 day', 'd4444444-4444-4444-4444-444444444444') $$,
                 '23514', null, 'redeemed_by without redeemed_at is still refused');
select throws_ok($$ update public.invites set redeemed_at = null where code = 'TEAM-ZED' $$, '23514', null, 'and cannot be made by clearing the time of a live member''s invite');
select is((select count(*)::int from pg_constraint where conrelid = 'public.invites'::regclass and contype = 'f' and confdeltype = 'n'), 2,
          'both foreign keys to accounts are still on delete set null (inviter_id, redeemed_by)');

-- ===========================================================================
-- 2. The automatic purge (Adam, team code)
-- ===========================================================================
set local role authenticated;
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select lives_ok($$ select public.delete_account() $$, 'Adam deletes his account');
reset role;
select is((select array_agg(action || '/' || reason) from public.mux_cleanup_jobs where asset_id = 'asA'), array['sync_playback/account_deleted'], 'his playback is queued for revocation');
update public.accounts set deleted_at = now() - interval '31 days' where id = 'b2222222-2222-2222-2222-222222222222';
-- What the purge left on every day the defect stood.
insert into public.account_purge_failures (account_id, attempts, last_error)
values ('b2222222-2222-2222-2222-222222222222', 3, 'new row for relation "invites" violates check constraint "invites_redeemed_pair"');
select is(public.purge_deleted_accounts(), 1, 'day 31: the purge removes Adam');
select is((select count(*)::int from public.account_purge_failures), 0, 'his earlier failure row is cleared');
select is((select count(*)::int from auth.users where id = 'b2222222-2222-2222-2222-222222222222'), 0, 'his Auth user is gone');
select is((select count(*)::int from public.accounts where id = 'b2222222-2222-2222-2222-222222222222'), 0, 'his account is gone');
select is((select count(*)::int from public.profiles where id = 'b2222222-2222-2222-2222-222222222222'), 0, 'his profile is gone');
select is((select count(*)::int from public.responses where id = 'ee000000-0000-0000-0000-00000000000a'), 0, 'his response row is gone');
select is((pg_temp.inv('TEAM-ADAM')).redeemed_by, null, 'his invite no longer names him');
select is((pg_temp.inv('TEAM-ADAM')).redeemed_at, '2026-10-02 10:00+00'::timestamptz, 'and keeps when it was used');
select is(to_jsonb(pg_temp.inv('TEAM-ADAM')) - 'redeemed_by', (select to_jsonb(b) - 'redeemed_by' from before_invites b where code = 'TEAM-ADAM'), 'nothing else about it changed');
select is((select array_agg(action || '/' || reason || '/' || owner_id order by action) from public.mux_cleanup_jobs where asset_id = 'asA' and status = 'pending'),
          array['delete_asset/account_purged/b2222222-2222-2222-2222-222222222222', 'sync_playback/account_deleted/b2222222-2222-2222-2222-222222222222'],
          'his asset is queued for deletion as account_purged, owned by him');
select is((select count(*)::int from public.mux_cleanup_jobs where action = 'delete_asset'), 1, 'one asset deletion, no other');

-- The used code stays used, whoever asks.
set local role anon;
select is(public.invite_preview('TEAM-ADAM')->>'status', 'used', 'the invite link answers used');
set local role authenticated;
select pg_temp.act('f6666666-6666-6666-6666-666666666666');
select is(public.check_invite('team-adam')->>'status', 'used', 'O-Invite answers used');
select is(public.redeem_invite('TEAM-ADAM')->>'status', 'used', 'and redeeming it is refused');
reset role;
select is(to_jsonb(pg_temp.inv('TEAM-ADAM')) - 'redeemed_by', (select to_jsonb(b) - 'redeemed_by' from before_invites b where code = 'TEAM-ADAM'), 'the refused attempt changed nothing');
select is((pg_temp.inv('TEAM-ADAM')).redeemed_by, null, 'and took no one in');
select is(public.has_beta_access('f6666666-6666-6666-6666-666666666666'), false, 'Late has no access from it');
select is((select beta_cohort from public.accounts where id = 'f6666666-6666-6666-6666-666666666666'), null, 'and no cohort');

-- ===========================================================================
-- 3. The purge again
-- ===========================================================================
create temp table jobs_then as select id, status from public.mux_cleanup_jobs;
select is(public.purge_deleted_accounts(), 0, 'a second purge finds nothing');
select is(public.purge_account('b2222222-2222-2222-2222-222222222222'), false, 'purging Adam again answers false');
select lives_ok($$ delete from auth.users where id = 'b2222222-2222-2222-2222-222222222222' $$, 'deleting his Auth user again is harmless');
select is((select count(*)::int from public.account_purge_failures), 0, 'and records no failure');
select is((select count(*)::int from public.mux_cleanup_jobs), (select count(*)::int from jobs_then), 'and queues nothing new');

-- ===========================================================================
-- 4. Deleting the Auth user by hand (Maya, Lena's personal link): Dashboard, Admin API or SQL
-- ===========================================================================
select lives_ok($$ delete from auth.users where id = 'c3333333-3333-3333-3333-333333333333' $$, 'Maya''s Auth user is deleted at once');
select is((select count(*)::int from public.accounts where id = 'c3333333-3333-3333-3333-333333333333'), 0, 'her account is gone');
select is((select count(*)::int from public.responses where id = 'ee000000-0000-0000-0000-00000000000c'), 0, 'her response row is gone');
select is((pg_temp.inv('SC-MAYA22')).redeemed_by, null, 'her invite no longer names her');
select is(to_jsonb(pg_temp.inv('SC-MAYA22')) - 'redeemed_by', (select to_jsonb(b) - 'redeemed_by' from before_invites b where code = 'SC-MAYA22'), 'it keeps its time and its inviter');
select is((select array_agg(action || '/' || reason || '/' || owner_id) from public.mux_cleanup_jobs where asset_id = 'asM'),
          array['delete_asset/account_removed/c3333333-3333-3333-3333-333333333333'], 'her asset is queued for deletion as account_removed (not the purge)');
set local role authenticated;
select pg_temp.act('f6666666-6666-6666-6666-666666666666');
select is(public.check_invite('SC-MAYA22')->>'status', 'used', 'her code answers used');
select is(public.redeem_invite('SC-MAYA22')->>'status', 'used', 'and cannot be redeemed');
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is((select count(*)::int from jsonb_array_elements(public.my_invites()->'sent') e where e->'profile'->>'id' = 'c3333333-3333-3333-3333-333333333333'), 0,
          'Lena''s sent list shows nothing of Maya');
reset role;

-- Again.
delete from jobs_then;
insert into jobs_then select id, status from public.mux_cleanup_jobs;
select lives_ok($$ delete from auth.users where id = 'c3333333-3333-3333-3333-333333333333' $$, 'deleting her again is harmless');
select is((select count(*)::int from public.mux_cleanup_jobs), (select count(*)::int from jobs_then), 'and queues nothing new');
select is(public.purge_deleted_accounts(), 0, 'the purge has nothing to do');
select is((select count(*)::int from public.account_purge_failures), 0, 'and no failure');

-- Two deleted members' invites side by side (the unique index ignores nulls).
select is((select count(*)::int from public.invites where redeemed_by is null and redeemed_at is not null), 2, 'two invites of deleted members coexist');

-- ===========================================================================
-- 5. Everyone else is unchanged
-- ===========================================================================
select is((select count(*)::int from before_rows b where b.k like 'account:%'
            and b.v <> (select to_jsonb(a) from public.accounts a where 'account:' || a.id = b.k)), 0, 'Lena''s and Zed''s accounts are unchanged');
select is((select count(*)::int from before_rows b where b.k like 'profile:%'
            and b.v is distinct from (select to_jsonb(p) from public.profiles p where 'profile:' || p.id = b.k)), 0, 'their profiles are unchanged');
select is((select count(*)::int from before_rows b where b.k like 'response:%'
            and b.v is distinct from (select to_jsonb(r) from public.responses r where 'response:' || r.id = b.k)), 0, 'their videos are unchanged');
select is((select count(*)::int from before_rows b where b.k like 'invite:%'
            and b.v is distinct from (select to_jsonb(i) from public.invites i where 'invite:' || i.code = b.k)), 0, 'their invites and the unused one are unchanged');
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id in ('asZ', 'asL')), 0, 'no job touches their videos');
select is(public.has_beta_access('d4444444-4444-4444-4444-444444444444'), true, 'Zed keeps his access');
select is(public.has_beta_access('a1111111-1111-1111-1111-111111111111'), true, 'Lena keeps hers');

-- ===========================================================================
-- 6. Normal redemption is unchanged
-- ===========================================================================
set local role authenticated;
select pg_temp.act('e5555555-5555-5555-5555-555555555555');
select is(public.check_invite('TEAM-NEW')->>'status', 'valid', 'an unused team code is valid');
select is(public.redeem_invite('TEAM-NEW')->>'status', 'valid', 'Nia redeems it');
select is(public.redeem_invite('TEAM-NEW')->>'status', 'already_in', 'a second try answers already_in');
reset role;
select is((pg_temp.inv('TEAM-NEW')).redeemed_by, 'e5555555-5555-5555-5555-555555555555'::uuid, 'it names her');
select isnt((pg_temp.inv('TEAM-NEW')).redeemed_at, null, 'with the time');
select is(public.has_beta_access('e5555555-5555-5555-5555-555555555555'), true, 'she has access');
select is((select beta_cohort from public.accounts where id = 'e5555555-5555-5555-5555-555555555555'), 'canggu', 'and the cohort');
set local role authenticated;
select pg_temp.act('f6666666-6666-6666-6666-666666666666');
select is(public.check_invite('TEAM-NEW')->>'status', 'used', 'the code is now used for anyone else');
select is(public.redeem_invite('LENA-4F9K')->>'status', 'valid', 'Late joins through Lena''s personal link');
reset role;
select is((select count(*)::int from public.invites where inviter_id = 'a1111111-1111-1111-1111-111111111111' and redeemed_by = 'f6666666-6666-6666-6666-666666666666'), 1,
          'which makes one of Lena''s invites his, as before');
select is((select count(*)::int from public.invites where redeemed_by is not null and redeemed_at is null), 0, 'no invite anywhere names a redeemer without a time');

select * from finish();
rollback;
