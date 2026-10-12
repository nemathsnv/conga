-- pgTAP tests for security stage 2: the upload ownership ledger (20261012000100).
-- Minting reserves a slot under the per-account limits (10 an hour, 30 a day, 3 unused active
-- URLs); posting claims an upload once, and only the member it was minted for. Real concurrency
-- (separate transactions) is covered by supabase/functions/_tests/uploads_integration_test.ts.
begin;
select plan(172);

delete from public.responses;
delete from public.prompts;
delete from public.video_uploads;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now()),
  ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya@example.com', '{}', '{}', now(), now()),
  ('d4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@example.com', '{}', '{}', now(), now()),
  ('e5555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rita@example.com', '{}', '{}', now(), now()),
  ('f6666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'paul@example.com', '{}', '{}', now(), now()),
  ('07777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dee@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
-- Maya has no profile yet. Sam is suspended, Rita's posting is paused, Paul's pause has ended,
-- Dee deleted her account.
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam'),
  ('d4444444-4444-4444-4444-444444444444', 'Sam Reed', 'testsam'),
  ('e5555555-5555-5555-5555-555555555555', 'Rita Gomez', 'testrita'),
  ('f6666666-6666-6666-6666-666666666666', 'Paul Weber', 'testpaul'),
  ('07777777-7777-7777-7777-777777777777', 'Dee Park', 'testdee');
update public.accounts set moderation_status = 'suspended' where id = 'd4444444-4444-4444-4444-444444444444';
update public.accounts set moderation_status = 'restricted', restricted_until = now() + interval '3 days' where id = 'e5555555-5555-5555-5555-555555555555';
update public.accounts set moderation_status = 'restricted', restricted_until = now() - interval '1 day' where id = 'f6666666-6666-6666-6666-666666666666';
update public.accounts set deleted_at = now() where id = '07777777-7777-7777-7777-777777777777';

insert into public.prompts (id, text, status, published_at) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Be honest about the place you live.', 'live', now()),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'Speak in every language you know.', 'live', now()),
  ('33333333-aaaa-aaaa-aaaa-333333333333', 'Newcomers unlearn?', 'live', now()),
  ('44444444-aaaa-aaaa-aaaa-444444444444', 'Best sunset spot?', 'live', now());
insert into public.suggestions (id, author_id, text) values
  ('5a000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'What''s one thing you miss from home?');
-- Adam: a live response (for replies) and a processing one (for retries). Written directly, as
-- older fixtures do; neither has a ledger row.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ad000000-0000-0000-0000-000000000001', '33333333-aaaa-aaaa-aaaa-333333333333', 'b2222222-2222-2222-2222-222222222222', 9000, 'live', 'upAdamLive', 'asAdamLive', 'pbAdamLive', now()),
  ('ad000000-0000-0000-0000-000000000002', '44444444-aaaa-aaaa-aaaa-444444444444', 'b2222222-2222-2222-2222-222222222222', 9000, 'processing', 'upAdamProc', null, null, null);

-- Runs a statement and returns 'ok', or the error's message with its DETAIL after a colon.
create function pg_temp.err(p_sql text) returns text language plpgsql as $$
declare m text; d text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text, d = pg_exception_detail;
  return m || coalesce(':' || nullif(d, ''), '');
end;
$$;
grant execute on function pg_temp.err(text) to authenticated, anon;
create function pg_temp.act(p_account uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_account, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.act(uuid) to authenticated;
create function pg_temp.response_id(p_upload text) returns uuid language sql stable security definer set search_path = '' as $$ select id from public.responses where mux_upload_id = p_upload $$;
grant execute on function pg_temp.response_id(text) to authenticated;
create function pg_temp.upload(p_upload text) returns public.video_uploads language sql stable security definer set search_path = '' as $$ select * from public.video_uploads where upload_id = p_upload $$;
create temp table res (n integer primary key, id uuid);
grant all on res to authenticated;
create function pg_temp.slot(p_n integer) returns public.video_uploads language sql stable security definer set search_path = '' as $$ select u.* from public.video_uploads u join pg_temp.res r on r.id = u.id where r.n = p_n $$;

-- ===========================================================================
-- 1. Structure and privileges
-- ===========================================================================
select has_table('public', 'video_uploads', 'the ledger exists');
select is((select relrowsecurity from pg_class where oid = 'public.video_uploads'::regclass), true, 'RLS is on');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'video_uploads'), 0, 'no policies: deny-all to members');
select is(has_table_privilege('authenticated', 'public.video_uploads', 'select'), false, 'members cannot select the ledger');
select is(has_table_privilege('authenticated', 'public.video_uploads', 'insert'), false, 'members cannot insert into the ledger');
select is(has_table_privilege('authenticated', 'public.video_uploads', 'update'), false, 'members cannot update the ledger');
select is(has_table_privilege('authenticated', 'public.video_uploads', 'delete'), false, 'members cannot delete from the ledger');
select is(has_table_privilege('anon', 'public.video_uploads', 'select'), false, 'anon cannot select the ledger');
select is(has_function_privilege('authenticated', 'public.reserve_video_upload()', 'execute'), true, 'members reserve with their own session');
select is(has_function_privilege('anon', 'public.reserve_video_upload()', 'execute'), false, 'anon cannot reserve');
select is(has_function_privilege('authenticated', 'public.activate_video_upload(uuid, text)', 'execute'), false, 'members cannot register an upload id');
select is(has_function_privilege('anon', 'public.activate_video_upload(uuid, text)', 'execute'), false, 'nor can anon');
select is(has_function_privilege('service_role', 'public.activate_video_upload(uuid, text)', 'execute'), true, 'the service role registers Mux''s upload id');
select is(has_function_privilege('authenticated', 'public.fail_video_upload(uuid)', 'execute'), false, 'members cannot give slots back');
select is(has_function_privilege('service_role', 'public.fail_video_upload(uuid)', 'execute'), true, 'the service role gives back a slot Mux refused');
select is(has_function_privilege('authenticated', 'public.claim_video_upload(uuid, text)', 'execute'), false, 'claim is not callable by members');
select is(has_function_privilege('anon', 'public.claim_video_upload(uuid, text)', 'execute'), false, 'nor by anon');
select is(has_function_privilege('service_role', 'public.claim_video_upload(uuid, text)', 'execute'), false, 'nor by the service role (internal to the posting functions)');
select is(has_function_privilege('authenticated', 'public.mark_response_live(text, text, text, integer, text)', 'execute'), false, 'members cannot mark videos live');
select is(has_function_privilege('service_role', 'public.mark_response_live(text, text, text, integer, text)', 'execute'), true, 'the service role marks videos live');
select is(has_function_privilege('authenticated', 'public.begin_upload_cancellation(uuid)', 'execute'), false, 'members cannot start a cancellation');
select is(has_function_privilege('authenticated', 'public.finish_upload_cancellation(text, text)', 'execute'), false, 'nor record one');
select is(has_function_privilege('anon', 'public.begin_upload_cancellation(uuid)', 'execute'), false, 'nor can anon');
select is(has_function_privilege('service_role', 'public.begin_upload_cancellation(uuid)', 'execute') and has_function_privilege('service_role', 'public.finish_upload_cancellation(text, text)', 'execute'), true, 'the service role cancels abandoned uploads');
select is(has_function_privilege('authenticated', 'public.video_upload_holds_slot(public.video_uploads)', 'execute'), false, 'the slot helper is internal');
select is(to_regprocedure('public.mark_response_live(text, text, text, integer)'), null, 'the old four-argument signature is gone (no ambiguous overload)');
select is((select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace
            and proname in ('reserve_video_upload', 'activate_video_upload', 'fail_video_upload', 'claim_video_upload', 'mark_response_live', 'begin_upload_cancellation', 'finish_upload_cancellation')
            and (not prosecdef or proowner <> 'postgres'::regrole or not coalesce(proconfig @> array['search_path=""'], false))), 0,
          'the ledger functions are SECURITY DEFINER, owned by postgres, with an empty search_path');
-- Guard for the future: any function that puts an upload id on a video must claim it.
select is((select array_agg(proname::text order by proname) from pg_proc
            where pronamespace = 'public'::regnamespace
              and (prosrc ~* 'insert\s+into\s+public\.responses\s*\([^)]*mux_upload_id' or prosrc ~* 'set\s+mux_upload_id')
              and prosrc !~ 'claim_video_upload'), null,
          'every function that writes responses.mux_upload_id claims the upload');
select is((select array_agg(proname::text order by proname) from pg_proc
            where pronamespace = 'public'::regnamespace and prosrc ~ 'claim_video_upload' and proname <> 'claim_video_upload'),
          array['post_draft', 'post_reply', 'post_response', 'retry_response_upload'], 'the four posting paths claim');

-- ===========================================================================
-- 2. Direct access is refused
-- ===========================================================================
set local role anon;
select throws_ok($$ select public.reserve_video_upload() $$, '42501', null, 'anon cannot reserve');
select throws_ok($$ select * from public.video_uploads $$, '42501', null, 'anon cannot read the ledger');
reset role;

set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select throws_ok($$ select * from public.video_uploads $$, '42501', null, 'a member cannot read the ledger');
select throws_ok($$ insert into public.video_uploads (account_id, upload_id, status) values ('a1111111-1111-1111-1111-111111111111', 'upForged', 'active') $$, '42501', null, 'a member cannot register an upload id directly');
select throws_ok($$ select public.activate_video_upload(gen_random_uuid(), 'upForged') $$, '42501', null, 'nor through activate_video_upload');
select throws_ok($$ select public.fail_video_upload(gen_random_uuid()) $$, '42501', null, 'nor give a slot back');
select throws_ok($$ select public.claim_video_upload('a1111111-1111-1111-1111-111111111111', 'upForged') $$, '42501', null, 'nor call claim directly');
select throws_ok($$ select public.mark_response_live('upForged', 'a', 'p', 1000, null) $$, '42501', null, 'nor mark a video live');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upForged', null, 5000) $$), 'upload_not_found', 'an upload id the server never minted cannot be posted');
reset role;

-- ===========================================================================
-- 3. Account state: no URL for suspended, restricted, deleted or profile-less accounts
-- ===========================================================================
set local role authenticated;
select pg_temp.act('c3333333-3333-3333-3333-333333333333');
select is(pg_temp.err('select public.reserve_video_upload()'), 'profile_required', 'no profile: refused');
select pg_temp.act('d4444444-4444-4444-4444-444444444444');
select is(pg_temp.err('select public.reserve_video_upload()'), 'suspended', 'suspended: refused');
select pg_temp.act('e5555555-5555-5555-5555-555555555555');
select is(pg_temp.err('select public.reserve_video_upload()'), 'posting_paused', 'restricted (posting paused): refused');
select pg_temp.act('07777777-7777-7777-7777-777777777777');
select is(pg_temp.err('select public.reserve_video_upload()'), 'account_deleted', 'deleted: refused');
select pg_temp.act('f6666666-6666-6666-6666-666666666666');
select is(pg_temp.err('select public.reserve_video_upload()'), 'ok', 'a restriction that has ended does not block');
reset role;
select is((select count(*)::int from public.video_uploads where account_id in ('c3333333-3333-3333-3333-333333333333', 'd4444444-4444-4444-4444-444444444444', 'e5555555-5555-5555-5555-555555555555', '07777777-7777-7777-7777-777777777777')), 0, 'a refused request takes no slot');

-- ===========================================================================
-- 4. Reserving, activating and the cap of 3 unused active URLs
-- ===========================================================================
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into res values (1, (public.reserve_video_upload()->>'reservation_id')::uuid);
reset role;
select is((pg_temp.slot(1)).account_id, 'a1111111-1111-1111-1111-111111111111'::uuid, 'the slot belongs to the caller (auth.uid(), not an argument)');
select is((pg_temp.slot(1)).status, 'reserved', 'it starts reserved');
select is((pg_temp.slot(1)).upload_id, null, 'with no upload id until Mux answers');
select is((pg_temp.slot(1)).expires_at, now() + interval '3600 seconds', 'the URL''s life is one hour from the reservation');
select is((pg_temp.slot(1)).reserved_until, now() + interval '60 seconds', 'the reservation waits 60 s for Mux');

set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into res values (2, (public.reserve_video_upload()->>'reservation_id')::uuid);
insert into res values (3, (public.reserve_video_upload()->>'reservation_id')::uuid);
select is(pg_temp.err('select public.reserve_video_upload()'), 'upload_limit_active:60', 'a fourth unused URL is refused, with the seconds until a slot frees');
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select is(pg_temp.err('select public.reserve_video_upload()'), 'ok', 'limits are per account: Adam is unaffected');
reset role;
delete from public.video_uploads where account_id = 'b2222222-2222-2222-2222-222222222222';

select is((public.activate_video_upload((select id from res where n = 1), 'upLena1'))->>'upload_id', 'upLena1', 'the service role records Mux''s upload id');
select is((pg_temp.slot(1)).status, 'active', 'and the slot is active');
select is(pg_temp.err(format('select public.activate_video_upload(%L, %L)', (select id from res where n = 1), 'upLena1b')), 'reservation_not_found', 'a slot is activated once');
select is((pg_temp.slot(1)).upload_id, 'upLena1', 'and keeps its first upload id');
select is(pg_temp.err(format('select public.activate_video_upload(%L, %L)', gen_random_uuid(), 'upLenaX')), 'reservation_not_found', 'an unknown reservation is refused');
select throws_ok(format('select public.activate_video_upload(%L, %L)', (select id from res where n = 2), 'upLena1'), '23505', null, 'an upload id is recorded once in the whole ledger');
select is(pg_temp.err(format('select public.activate_video_upload(%L, %L)', (select id from res where n = 2), '../assets/x')), 'invalid_upload_id', 'a malformed upload id is refused');
select is(pg_temp.err(format('select public.activate_video_upload(%L, %L)', (select id from res where n = 2), 'up-lena')), 'invalid_upload_id', 'only letters and digits, as Mux ids are');
select is(pg_temp.err(format('select public.activate_video_upload(%L, %L)', (select id from res where n = 2), '')), 'invalid_upload_id', 'an empty upload id is refused');
select lives_ok(format('select public.activate_video_upload(%L, %L)', (select id from res where n = 2), 'upLena2'), 'a second slot is activated');
select lives_ok(format('select public.fail_video_upload(%L)', (select id from res where n = 3)), 'Mux refused the third: the slot is given back');
select is((pg_temp.slot(3)).status, 'failed', 'and marked failed');
select lives_ok(format('select public.fail_video_upload(%L)', (select id from res where n = 1)), 'fail_video_upload on an active slot');
select is((pg_temp.slot(1)).status, 'active', 'changes nothing');

set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into res values (4, (public.reserve_video_upload()->>'reservation_id')::uuid);
select is(pg_temp.err('select public.reserve_video_upload()'), 'upload_limit_active:60', 'two active and one reserved: the cap is reached again (the failed one does not count)');
reset role;

-- A reservation whose Mux call outlived its 60 s stops counting as active, and can no longer be activated.
update public.video_uploads set reserved_until = now() - interval '1 second' where id = (select id from res where n = 4);
select is(pg_temp.err(format('select public.activate_video_upload(%L, %L)', (select id from res where n = 4), 'upLena4')), 'reservation_not_found', 'a timed-out reservation cannot become a fourth active URL');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into res values (5, (public.reserve_video_upload()->>'reservation_id')::uuid);
select is((select count(*)::int from res where n = 5 and id is not null), 1, 'a timed-out reservation frees its active slot');
select is(pg_temp.err('select public.reserve_video_upload()'), 'upload_limit_active:60', 'and the cap holds at three');
reset role;
-- An active URL past its hour no longer counts as unused and active.
update public.video_uploads set expires_at = now() - interval '1 second' where id = (select id from res where n = 1);
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err('select public.reserve_video_upload()'), 'ok', 'an expired URL frees its slot');
reset role;
select is((select count(*)::int from public.video_uploads where account_id = 'a1111111-1111-1111-1111-111111111111' and status <> 'failed'), 5, 'everything but the refused one still counts towards the hour: 5');

-- ===========================================================================
-- 5. 10 uploads in any rolling hour
-- ===========================================================================
delete from public.video_uploads where account_id = 'a1111111-1111-1111-1111-111111111111';
-- Nine used uploads in the last 45 minutes, and three Mux refused.
insert into public.video_uploads (account_id, upload_id, status, created_at)
select 'a1111111-1111-1111-1111-111111111111', 'upHour' || i, 'claimed', now() - i * interval '5 minutes' from generate_series(1, 9) i;
insert into public.video_uploads (account_id, status, created_at)
select 'a1111111-1111-1111-1111-111111111111', 'failed', now() from generate_series(1, 3);
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err('select public.reserve_video_upload()'), 'ok', 'the tenth upload in an hour is allowed (failed ones do not count)');
select is(pg_temp.err('select public.reserve_video_upload()'), 'upload_limit_hour:900', 'the eleventh is refused until the oldest of the ten is an hour old');
reset role;
update public.video_uploads set created_at = now() - interval '61 minutes' where upload_id = 'upHour9';
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err('select public.reserve_video_upload()'), 'ok', 'an upload older than an hour leaves the hourly window');
select is(pg_temp.err('select public.reserve_video_upload()'), 'upload_limit_hour:1200', 'and the window is full again');
reset role;
-- Unused and abandoned URLs count too: minting without posting cannot get round the limit.
delete from public.video_uploads where account_id = 'a1111111-1111-1111-1111-111111111111';
insert into public.video_uploads (account_id, upload_id, status, created_at, expires_at)
select 'a1111111-1111-1111-1111-111111111111', 'upUnused' || i, 'active', now() - interval '50 minutes', now() - interval '1 minute' from generate_series(1, 7) i;
insert into public.video_uploads (account_id, status, created_at, reserved_until)
select 'a1111111-1111-1111-1111-111111111111', 'reserved', now() - interval '40 minutes', now() - interval '39 minutes' from generate_series(1, 3);
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err('select public.reserve_video_upload()'), 'upload_limit_hour:600', 'expired unused URLs and abandoned reservations count towards the hour');
reset role;

-- ===========================================================================
-- 6. 30 uploads in any rolling 24 hours
-- ===========================================================================
delete from public.video_uploads where account_id = 'a1111111-1111-1111-1111-111111111111';
insert into public.video_uploads (account_id, upload_id, status, created_at)
select 'a1111111-1111-1111-1111-111111111111', 'upDay' || i, 'claimed', now() - interval '2 hours' - i * interval '10 minutes' from generate_series(1, 29) i;
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err('select public.reserve_video_upload()'), 'ok', 'the thirtieth upload in a day is allowed');
select is(pg_temp.err('select public.reserve_video_upload()'), 'upload_limit_day:61800', 'the thirty-first is refused until the oldest of the thirty is a day old');
reset role;
update public.video_uploads set created_at = now() - interval '25 hours' where upload_id = 'upDay29';
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err('select public.reserve_video_upload()'), 'ok', 'an upload older than a day leaves the daily window');
select is(pg_temp.err('select public.reserve_video_upload()'), 'upload_limit_day:62400', 'and the window is full again');
reset role;
select is((select count(*)::int from public.video_uploads where account_id = 'a1111111-1111-1111-1111-111111111111' and created_at > now() - interval '24 hours'), 30, 'no more than 30 in the day');

-- ===========================================================================
-- 7. Claims: once, by the owner, before expiry
-- ===========================================================================
delete from public.video_uploads;
insert into public.video_uploads (account_id, upload_id, status) values
  ('a1111111-1111-1111-1111-111111111111', 'upL1', 'active'),
  ('a1111111-1111-1111-1111-111111111111', 'upL2', 'active'),
  ('a1111111-1111-1111-1111-111111111111', 'upL3', 'active'),
  ('a1111111-1111-1111-1111-111111111111', 'upL4', 'active'),
  ('a1111111-1111-1111-1111-111111111111', 'upL5', 'active'),
  ('b2222222-2222-2222-2222-222222222222', 'upA1', 'active'),
  ('b2222222-2222-2222-2222-222222222222', 'upA2', 'active');
insert into public.video_uploads (account_id, upload_id, status, created_at, expires_at) values
  ('a1111111-1111-1111-1111-111111111111', 'upLExp', 'active', now() - interval '61 minutes', now() - interval '1 minute');

set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upA1', null, 5000) $$), 'upload_not_found', 'another member''s upload cannot be posted');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upNever', null, 5000) $$), 'upload_not_found', 'an unknown upload gives the same answer');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upLExp', null, 5000) $$), 'upload_expired', 'an expired upload cannot be posted');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', '', null, 5000) $$), 'upload_required', 'an empty upload id is refused as before');
select is((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', null, 5000))->>'status', 'processing', 'the member''s own upload is posted');
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'upL1', null, 5000) $$), 'upload_already_used', 'the same upload cannot be posted twice');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL2', null, 5000) $$), 'already_responded', 'one response per prompt is still checked');
select is(pg_temp.err($$ select public.post_response('99999999-aaaa-aaaa-aaaa-999999999999', 'upL5', null, 5000) $$), 'prompt_not_found', 'a post refused for another reason');
select is(pg_temp.err($$ select public.post_reply('ad000000-0000-0000-0000-000000000001', 'upL1', null, 5000) $$), 'upload_already_used', 'a used upload cannot become a video reply');
select is(pg_temp.err($$ select public.post_reply('ad000000-0000-0000-0000-000000000001', 'upA2', null, 5000) $$), 'upload_not_found', 'nor can another member''s');
select is((public.post_reply('ad000000-0000-0000-0000-000000000001', 'upL2', null, 5000))->>'kind', 'reply', 'a video reply claims the member''s own upload');
select is(pg_temp.err($$ select public.post_draft('5a000000-0000-0000-0000-000000000001', 'upA2', null, 9000) $$), 'upload_not_found', 'a draft cannot take another member''s upload');
select is(pg_temp.err($$ select public.post_draft('5a000000-0000-0000-0000-000000000001', 'upL1', null, 9000) $$), 'upload_already_used', 'nor a used one');
select is((public.post_draft('5a000000-0000-0000-0000-000000000001', 'upL3', null, 9000))->>'status', 'draft', 'a draft claims the member''s own upload');
select is(pg_temp.err(format('select public.retry_response_upload(%L, %L)', pg_temp.response_id('upL1'), 'upA2')), 'upload_not_found', 'a retry cannot take another member''s upload');
select is(pg_temp.err(format('select public.retry_response_upload(%L, %L)', pg_temp.response_id('upL1'), 'upL2')), 'upload_already_used', 'nor a used one');
select is(pg_temp.err($$ select public.retry_response_upload('ad000000-0000-0000-0000-000000000002', 'upL4') $$), 'response_not_found', 'nor attach an upload to another member''s response');
select lives_ok(format('select public.retry_response_upload(%L, %L)', pg_temp.response_id('upL1'), 'upL4'), 'a retry claims a fresh upload of the member''s own');
select is((select mux_upload_id from public.responses where author_id = 'a1111111-1111-1111-1111-111111111111' and kind = 'response' and status = 'processing'), 'upL4', 'and the response now uses it');
reset role;

select is((pg_temp.upload('upL1')).status, 'claimed', 'a posted upload is claimed');
select is((pg_temp.upload('upL1')).response_id, (select id from public.responses where prompt_id = '11111111-aaaa-aaaa-aaaa-111111111111' and author_id = 'a1111111-1111-1111-1111-111111111111'), 'with the response it went to');
select isnt((pg_temp.upload('upL1')).claimed_at, null, 'and when');
select is((pg_temp.upload('upL2')).response_id, (select id from public.responses where kind = 'reply' and author_id = 'a1111111-1111-1111-1111-111111111111'), 'the reply''s upload points at the reply');
select is((pg_temp.upload('upL3')).response_id, (select id from public.responses where status = 'draft' and author_id = 'a1111111-1111-1111-1111-111111111111'), 'the draft''s upload points at the draft');
select is((pg_temp.upload('upL4')).response_id, (select id from public.responses where mux_upload_id = 'upL4'), 'the retry''s upload points at the response');
select is((pg_temp.upload('upL5')).status, 'active', 'a post refused for another reason does not use up the upload');
select is((pg_temp.upload('upA1')).status, 'active', 'another member''s attempt leaves Adam''s upload untouched');
select is((pg_temp.upload('upA2')).status, 'active', 'Adam''s second upload too');
select is((select mux_upload_id from public.responses where id = 'ad000000-0000-0000-0000-000000000002'), 'upAdamProc', 'and Adam''s response keeps its upload');

set local role authenticated;
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL5', null, 5000) $$), 'upload_not_found', 'Adam cannot post Lena''s unused upload either');
select is((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upA1', null, 5000))->>'status', 'processing', 'Adam posts his own');
reset role;

-- ===========================================================================
-- 8. Going live: the Mux passthrough and the ledger owner must be the author
-- ===========================================================================
select is((public.mark_response_live('upL4', 'asL4', 'pbL4', 9000, 'b2222222-2222-2222-2222-222222222222'))->>'status', 'owner_mismatch', 'an asset minted for someone else does not go live');
select is((select status || '/' || coalesce(mux_asset_id, '-') from public.responses where mux_upload_id = 'upL4'), 'processing/-', 'and changes nothing');
select is((public.mark_response_live('upL4', 'asL4', 'pbL4', 9000, ''))->>'status', 'owner_mismatch', 'an asset with no passthrough does not go live');
select is((public.mark_response_live('upL4', 'asL4', 'pbL4', 9000, 'a1111111-1111-1111-1111-111111111111'))->>'status', 'live', 'the author''s own asset goes live');
select is((select mux_playback_id from public.responses where mux_upload_id = 'upL4'), 'pbL4', 'with its playback id');
select is((public.mark_response_live(p_upload_id => 'upA1', p_asset_id => 'asA1', p_playback_id => 'pbA1', p_duration_ms => 9000))->>'status', 'live', 'the four named arguments the deployed functions send still work');
select is((public.mark_response_live('upL3', 'asL3', 'pbL3', 9000, 'a1111111-1111-1111-1111-111111111111'))->>'status', 'draft', 'a ready draft stays a draft');
select is((public.mark_response_live('upNever', 'a', 'p', 1000, null))->>'status', 'unknown_upload', 'an unknown upload is answered, not raised');
-- A ledger row owned by someone other than the response's author (only possible by a direct write) blocks it.
insert into public.video_uploads (account_id, upload_id, status) values ('a1111111-1111-1111-1111-111111111111', 'upAdamProc', 'claimed');
select is((public.mark_response_live('upAdamProc', 'asAP', 'pbAP', 9000, null))->>'status', 'owner_mismatch', 'a ledger owner who is not the author blocks going live');
select is((select status from public.responses where id = 'ad000000-0000-0000-0000-000000000002'), 'processing', 'and the response stays processing');
select is((public.mark_response_live('upAdamLive', 'asOther', 'pbOther', 1, 'a1111111-1111-1111-1111-111111111111'))->>'status', 'owner_mismatch', 'a live response cannot be pointed at another asset');
select is((select mux_playback_id from public.responses where id = 'ad000000-0000-0000-0000-000000000001'), 'pbAdamLive', 'its playback id is unchanged');
select is((public.mark_response_live('upAdamLive', 'asOther', 'pbOther', 1, 'b2222222-2222-2222-2222-222222222222'))->>'status', 'live', 'a repeated ready event for a live response');
select is((select mux_playback_id from public.responses where id = 'ad000000-0000-0000-0000-000000000001'), 'pbAdamLive', 'changes nothing');

-- ===========================================================================
-- 9. Deleting an account removes its ledger rows; deleting a video keeps the claim
-- ===========================================================================
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok(format('select public.delete_video(%L)', pg_temp.response_id('upL4')), 'Lena deletes her response');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL4', null, 5000) $$), 'upload_already_used', 'its upload cannot be posted again');
reset role;
insert into public.video_uploads (account_id, upload_id, status) values ('f6666666-6666-6666-6666-666666666666', 'upPaul', 'active');
select is((select count(*)::int from public.video_uploads where account_id = 'f6666666-6666-6666-6666-666666666666'), 1, 'Paul has a ledger row');
delete from auth.users where id = 'f6666666-6666-6666-6666-666666666666';
select is((select count(*)::int from public.video_uploads where account_id = 'f6666666-6666-6666-6666-666666666666'), 0, 'purging an account removes its ledger rows');
select is((select count(*)::int from public.video_uploads where status = 'active' and upload_id is null), 0, 'no active row without an upload id (constraint)');
select throws_ok($$ insert into public.video_uploads (account_id, status) values ('a1111111-1111-1111-1111-111111111111', 'active') $$, '23514', null, 'an active row needs an upload id');
select throws_ok($$ insert into public.video_uploads (account_id, upload_id, status) values ('a1111111-1111-1111-1111-111111111111', 'upX', 'reserved') $$, '23514', null, 'a reserved row has none');
select throws_ok($$ insert into public.video_uploads (account_id, upload_id, status) values ('a1111111-1111-1111-1111-111111111111', 'upX', 'expired') $$, '23514', null, 'expiry is a time, not a status');

-- ===========================================================================
-- 10. Abandoned uploads: retired only when unclaimed, one at a time, slot freed only on confirmation
-- ===========================================================================
delete from public.video_uploads where account_id in ('a1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222');
-- Lena re-recorded twice: three unused URLs, oldest first. Adam has three of his own.
insert into public.video_uploads (account_id, upload_id, status, created_at, expires_at) values
  ('a1111111-1111-1111-1111-111111111111', 'upRe1', 'active', now() - interval '3 minutes', now() + interval '57 minutes'),
  ('a1111111-1111-1111-1111-111111111111', 'upRe2', 'active', now() - interval '2 minutes', now() + interval '58 minutes'),
  ('a1111111-1111-1111-1111-111111111111', 'upRe3', 'active', now() - interval '1 minute', now() + interval '59 minutes'),
  ('b2222222-2222-2222-2222-222222222222', 'upAd1', 'active', now() - interval '10 minutes', now() + interval '50 minutes'),
  ('b2222222-2222-2222-2222-222222222222', 'upAd2', 'active', now() - interval '10 minutes', now() + interval '50 minutes'),
  ('b2222222-2222-2222-2222-222222222222', 'upAd3', 'active', now() - interval '10 minutes', now() + interval '50 minutes');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err('select public.reserve_video_upload()'), 'upload_limit_active:3420', 'a fourth re-record is refused while three URLs are unused');
reset role;
select is(public.begin_upload_cancellation('a1111111-1111-1111-1111-111111111111'), '{"status": "cancelling", "upload_id": "upRe1"}'::jsonb, 'the oldest unclaimed upload is taken out of use for cancelling');
select is((pg_temp.upload('upRe1')).status, 'cancelling', 'it is marked cancelling');
select is((pg_temp.upload('upAd1')).status, 'active', 'another member''s uploads are never touched');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err('select public.reserve_video_upload()'), 'upload_limit_active:3420', 'it keeps its slot until Mux confirms');
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'upRe1', null, 5000) $$), 'upload_cancelled', 'and it can no longer be posted');
reset role;
select is(public.begin_upload_cancellation('a1111111-1111-1111-1111-111111111111'), '{"status": "cancelling", "upload_id": "upRe2"}'::jsonb, 'a concurrent request takes the next one, never the same');
select lives_ok($$ select public.finish_upload_cancellation('upRe2', 'active') $$, 'Mux had not cancelled it');
select is((pg_temp.upload('upRe2')).status, 'active', 'so it is back as it was');
select lives_ok($$ select public.finish_upload_cancellation('upRe1', 'cancelled') $$, 'Mux confirmed the cancellation');
select is((pg_temp.upload('upRe1')).status, 'cancelled', 'the upload is cancelled');
select isnt((pg_temp.upload('upRe1')).cancelled_at, null, 'with the time');
select lives_ok($$ select public.finish_upload_cancellation('upRe1', 'active') $$, 'a late or repeated outcome');
select is((pg_temp.upload('upRe1')).status, 'cancelled', 'changes nothing');
select is(pg_temp.err($$ select public.finish_upload_cancellation('upRe2', 'maybe') $$), 'invalid_outcome', 'only cancelled or active are outcomes');
select lives_ok($$ select public.finish_upload_cancellation('upRe3', 'cancelled') $$, 'cancelled is recorded only for an upload being cancelled');
select is((pg_temp.upload('upRe3')).status, 'active', 'an active upload is not cancelled by it');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'upRe1', null, 5000) $$), 'upload_cancelled', 'a cancelled upload can never be posted');
insert into res values (10, (public.reserve_video_upload()->>'reservation_id')::uuid);
select is((select count(*)::int from res where n = 10 and id is not null), 1, 'the freed slot can be used');
select is(pg_temp.err('select public.reserve_video_upload()'), 'upload_limit_active:60', 'and the cap holds at three');
reset role;
select is((select count(*)::int from public.video_uploads where account_id = 'a1111111-1111-1111-1111-111111111111' and status <> 'failed' and created_at > now() - interval '1 hour'), 4, 'the cancelled one still counts towards the hour and the day');
select is(public.begin_upload_cancellation('a1111111-1111-1111-1111-111111111111'), '{"status": "cancelling", "upload_id": "upRe2"}'::jsonb, 'the oldest unclaimed one again');
select lives_ok($$ select public.finish_upload_cancellation('upRe2', 'active') $$, 'put back');

-- Claimed, expired and reserved rows are never cancelled.
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is((public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'upRe2', null, 5000))->>'status', 'processing', 'Lena posts one of them');
reset role;
update public.video_uploads set expires_at = now() - interval '1 second' where upload_id = 'upRe3';
insert into public.video_uploads (account_id, status) select 'a1111111-1111-1111-1111-111111111111', 'reserved' from generate_series(1, 2);
select is(public.begin_upload_cancellation('a1111111-1111-1111-1111-111111111111'), '{"status": "none"}'::jsonb, 'with only reservations holding slots, nothing is cancelled');
select is((pg_temp.upload('upRe2')).status, 'claimed', 'a claimed upload is never cancelled');
select is((pg_temp.upload('upRe3')).status, 'active', 'nor an expired one (it no longer holds a slot)');
update public.video_uploads set status = 'failed' where account_id = 'a1111111-1111-1111-1111-111111111111' and status = 'reserved';
select is(public.begin_upload_cancellation('a1111111-1111-1111-1111-111111111111'), '{"status": "free"}'::jsonb, 'below the cap nothing is cancelled');
select is((select count(*)::int from public.video_uploads where status = 'cancelling'), 0, 'and nothing is left cancelling');
-- A row stuck cancelling (Mux's answer never came) holds its slot until it expires.
update public.video_uploads set status = 'cancelling' where upload_id = 'upAd1';
select is((select count(*)::int from public.video_uploads u where account_id = 'b2222222-2222-2222-2222-222222222222' and public.video_upload_holds_slot(u)), 3, 'an unconfirmed cancellation keeps its slot');
update public.video_uploads set expires_at = now() - interval '1 second' where upload_id = 'upAd1';
select is((select count(*)::int from public.video_uploads u where account_id = 'b2222222-2222-2222-2222-222222222222' and public.video_upload_holds_slot(u)), 2, 'until its hour is up');

-- A URL minted in the last 15 seconds is not abandoned: it may belong to a screen that has just opened.
delete from public.video_uploads where account_id = 'b2222222-2222-2222-2222-222222222222';
insert into public.video_uploads (account_id, upload_id, status) select 'b2222222-2222-2222-2222-222222222222', 'upNew' || i, 'active' from generate_series(1, 3) i;
select is(public.begin_upload_cancellation('b2222222-2222-2222-2222-222222222222'), '{"status": "none"}'::jsonb, 'three URLs minted moments ago: none is cancelled');
update public.video_uploads set created_at = now() - interval '16 seconds' where upload_id = 'upNew2';
select is(public.begin_upload_cancellation('b2222222-2222-2222-2222-222222222222'), '{"status": "cancelling", "upload_id": "upNew2"}'::jsonb, 'once one is older than 15 seconds it can be');

-- ===========================================================================
-- 11. Publishing an existing draft mints nothing and costs no quota
-- ===========================================================================
insert into public.prompts (id, text, status, published_at) values ('55555555-aaaa-aaaa-aaaa-555555555555', 'What''s one thing you miss from home?', 'live', now());
update public.suggestions set status = 'live', prompt_id = '55555555-aaaa-aaaa-aaaa-555555555555' where id = '5a000000-0000-0000-0000-000000000001';
insert into public.video_uploads (account_id, upload_id, status, created_at)
select 'a1111111-1111-1111-1111-111111111111', 'upFull' || i, 'claimed', now() - interval '5 minutes' from generate_series(1, 30) i;
select is((select count(*)::int from public.video_uploads where account_id = 'a1111111-1111-1111-1111-111111111111'), 36, 'Lena is past both limits');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err('select public.reserve_video_upload()'), 'upload_limit_day:86100', 'no new URL for her today');
select is((public.publish_draft('5a000000-0000-0000-0000-000000000001'))->>'id', (select id::text from public.responses where mux_upload_id = 'upL3'), 'but her existing draft publishes');
reset role;
select is((select status from public.responses where mux_upload_id = 'upL3'), 'live', 'live, with the upload it already had');
select is((select count(*)::int from public.video_uploads where account_id = 'a1111111-1111-1111-1111-111111111111'), 36, 'publishing took no URL and no quota');

select * from finish();
rollback;
