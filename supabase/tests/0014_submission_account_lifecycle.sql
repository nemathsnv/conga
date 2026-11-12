-- pgTAP: posting submissions (20261013000200, 20261013000300) across the account lifecycle
-- (security stage 3): deletion, the 30-day recovery, the day-30 purge and a deletion outside the
-- purge (Admin API, Dashboard). Verifies that a submission never outlives its account, never blocks
-- a purge, never posts while the account is deleted, and replays again once the account is back.
-- No migration: these are regression tests of the unreleased migrations with the deployed ones.
begin;
select plan(26);

delete from public.responses;
delete from public.prompts;
delete from public.video_uploads;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('c1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tia@example.com', '{}', '{}', now(), now()),
  ('c2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'omar@example.com', '{}', '{}', now(), now()),
  ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mia@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('c1111111-1111-1111-1111-111111111111', 'Tia Test', 'testtia'),
  ('c2222222-2222-2222-2222-222222222222', 'Omar Test', 'testomar'),
  ('c3333333-3333-3333-3333-333333333333', 'Mia Test', 'testmia');
insert into public.prompts (id, text, status, published_at) values
  ('11111111-cccc-cccc-cccc-111111111111', 'Lifecycle prompt one', 'live', now()),
  ('22222222-cccc-cccc-cccc-222222222222', 'Lifecycle prompt two', 'live', now()),
  ('33333333-cccc-cccc-cccc-333333333333', 'Lifecycle prompt three', 'live', now());
insert into public.video_uploads (account_id, upload_id, status) values
  ('c1111111-1111-1111-1111-111111111111', 'upTia1', 'active'),
  ('c1111111-1111-1111-1111-111111111111', 'upTia2', 'active'),
  ('c3333333-3333-3333-3333-333333333333', 'upMia1', 'active');

-- A token as Auth issues it: amr carries the sign-in time (delete_account needs one within ten
-- minutes, 20261016000202), and session_id names the auth.sessions row when the test made one (a
-- restore needs a session that began after the deletion, so the sign-back-in step creates one).
create function pg_temp.act(p_account uuid, p_session uuid default null) returns void language sql as $$
  select set_config('request.jwt.claims', (json_build_object('sub', p_account, 'role', 'authenticated', 'iat', extract(epoch from now())::bigint,
    'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint)))::jsonb
    || case when p_session is null then '{}'::jsonb else jsonb_build_object('session_id', p_session) end)::text, true);
$$;
grant execute on function pg_temp.act(uuid, uuid) to authenticated;
create function pg_temp.err(p_sql text) returns text language plpgsql as $$
declare m text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text;
  return m;
end;
$$;
grant execute on function pg_temp.err(text) to authenticated;
create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;

-- Tia: a response (S1, live, which Omar replies to), a processing one (S2), and a tombstone (S3).
select pg_temp.act('c1111111-1111-1111-1111-111111111111');
set local role authenticated;
insert into ids select 's1', (public.post_response('11111111-cccc-cccc-cccc-111111111111', 'upTia1', 'Tia caption', 9000, 'd1111111-0000-4000-8000-000000000001')->>'id')::uuid;
insert into ids select 's2', (public.post_response('22222222-cccc-cccc-cccc-222222222222', 'upTia2', null, 9000, 'd1111111-0000-4000-8000-000000000002')->>'id')::uuid;
reset role;
select is((public.begin_submission_abandon('c1111111-1111-1111-1111-111111111111', 'd1111111-0000-4000-8000-000000000003'))->>'reason', 'no_row', 'a tombstone for an id that never made a row');
select is(public.mark_response_live('upTia1', 'asTia1', 'pbTia1', 9000, 'c1111111-1111-1111-1111-111111111111')->>'status', 'live', 'Tia''s first response goes live');
insert into public.responses (id, prompt_id, author_id, duration_ms, status, kind, reply_to_id, root_response_id, mux_upload_id, mux_asset_id, mux_playback_id, live_at)
values ('ee000000-0000-0000-0000-000000000001', '11111111-cccc-cccc-cccc-111111111111', 'c2222222-2222-2222-2222-222222222222', 5000, 'live', 'reply',
        (select id from ids where k = 's1'), (select id from ids where k = 's1'), 'upOmarR', 'asOmarR', 'pbOmarR', now());
select is((select count(*)::int from public.post_submissions where account_id = 'c1111111-1111-1111-1111-111111111111'), 3, 'Tia has three submissions');

-- E1: Tia deletes her account. Her submissions stay (the account can come back), but none posts.
select pg_temp.act('c1111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ select public.delete_account() $$, 'Tia deletes her account (fresh sign-in)');
select is(pg_temp.err($$ select public.post_response('22222222-cccc-cccc-cccc-222222222222', 'upTia2', null, 9000, 'd1111111-0000-4000-8000-000000000002') $$),
  'account_deleted', 'during the window a replay of a submission is refused: account_deleted, not her row');
select is(pg_temp.err($$ select public.post_response('33333333-cccc-cccc-cccc-333333333333', 'upTia2', null, 9000, gen_random_uuid()) $$),
  'account_deleted', 'and nothing new is posted');
reset role;
select is((select count(*)::int from public.post_submissions where account_id = 'c1111111-1111-1111-1111-111111111111'), 3, 'her submissions are kept for the 30-day window');
select is((select count(*)::int from public.mux_cleanup_jobs where response_id = (select id from ids where k = 's1') and action = 'sync_playback' and reason = 'account_deleted'), 1,
  'her live video gets its playback switched off (sync_playback, account_deleted)');

-- E2: she signs back in within 30 days: restored; the same submission replays her own row.
-- Signing in makes a new session, which began after the deletion (clock_timestamp, not the
-- transaction's now()); only such a session restores (20261016000202).
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('5c111111-0000-4000-8000-000000000001', 'c1111111-1111-1111-1111-111111111111', clock_timestamp(), clock_timestamp());
select pg_temp.act('c1111111-1111-1111-1111-111111111111', '5c111111-0000-4000-8000-000000000001');
set local role authenticated;
select lives_ok($$ select public.get_onboarding_state() $$, 'Tia signs back in');
reset role;
select is((select deleted_at from public.accounts where id = 'c1111111-1111-1111-1111-111111111111'), null, 'the account is restored');
-- The job queued at the deletion is still pending, so the restore joins it (one job per video; the
-- worker decides revoke or restore when it runs, from mux_playback_wanted).
select ok((select count(*) = 1 from public.mux_cleanup_jobs where response_id = (select id from ids where k = 's1') and action = 'sync_playback' and status = 'pending')
          and public.mux_playback_wanted((select id from ids where k = 's1'), 'asTia1'),
  'one pending playback job for her video, which now wants playback back on');
select pg_temp.act('c1111111-1111-1111-1111-111111111111');
set local role authenticated;
select is((public.post_response('22222222-cccc-cccc-cccc-222222222222', 'upTia2', null, 9000, 'd1111111-0000-4000-8000-000000000002')->>'id')::uuid,
  (select id from ids where k = 's2'), 'after the restore, the replay returns her own row again');
select is(pg_temp.err($$ select public.post_response('33333333-cccc-cccc-cccc-333333333333', 'upTia2', null, 9000, 'd1111111-0000-4000-8000-000000000003') $$),
  'submission_closed', 'the tombstone still closes its id');
reset role;

-- E3: deleted again, and nobody signs in for 30 days: the purge.
select pg_temp.act('c1111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ select public.delete_account() $$, 'Tia deletes her account again');
reset role;
update public.accounts set deleted_at = now() - interval '31 days' where id = 'c1111111-1111-1111-1111-111111111111';
select is(public.purge_deleted_accounts(), 1, 'day 30: Tia is purged, with submissions, a tombstone and a held-open video');
select is((select count(*)::int from public.account_purge_failures where account_id = 'c1111111-1111-1111-1111-111111111111'), 0, 'no purge failure');
select is((select count(*)::int from public.post_submissions where account_id = 'c1111111-1111-1111-1111-111111111111'), 0, 'every submission of hers is gone, the tombstone too');
select is((select count(*)::int from public.post_submissions where id in ('d1111111-0000-4000-8000-000000000001', 'd1111111-0000-4000-8000-000000000002', 'd1111111-0000-4000-8000-000000000003')), 0,
  'no submission id survives the purge (no caption or upload id kept)');
select is((select author_id from public.responses where id = (select id from ids where k = 's1')), null, 'her video with Omar''s reply stays as an anonymous tombstone');
select is((select caption from public.responses where id = (select id from ids where k = 's1')), null, 'with no caption');
select is((select status from public.responses where id = 'ee000000-0000-0000-0000-000000000001'), 'live', 'Omar''s reply is untouched');
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asTia1' and action = 'delete_asset' and reason = 'account_purged'), 1, 'her asset is queued for deletion at Mux');

-- Mia: a submission held mid-check (the abandon-submission function asking Mux), then her Auth user is
-- deleted outside the purge (Admin API, Dashboard).
select pg_temp.act('c3333333-3333-3333-3333-333333333333');
set local role authenticated;
insert into ids select 'm1', (public.post_response('11111111-cccc-cccc-cccc-111111111111', 'upMia1', null, 9000, 'd3333333-0000-4000-8000-000000000001')->>'id')::uuid;
reset role;
select is((public.begin_submission_abandon('c3333333-3333-3333-3333-333333333333', 'd3333333-0000-4000-8000-000000000001'))->>'status', 'checking', 'Mia''s submission is held while Mux is asked');
select lives_ok($$ delete from auth.users where id = 'c3333333-3333-3333-3333-333333333333' $$, 'her Auth user is deleted mid-check');
select is((select count(*)::int from public.post_submissions where account_id = 'c3333333-3333-3333-3333-333333333333'), 0, 'her submissions are gone');
select is(public.finish_submission_abandon('d3333333-0000-4000-8000-000000000001', gen_random_uuid(), 'abandon')->>'reason', 'busy',
  'the function finishing late changes nothing (no submission, no row)');

select * from finish();
rollback;
