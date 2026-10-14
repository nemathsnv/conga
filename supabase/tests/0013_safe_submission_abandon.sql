-- pgTAP tests for the Mux-checked abandonment (20261013000300; review of 13 Oct, B3). The database
-- half: begin_submission_abandon holds a row that is still waiting for its video, and
-- finish_submission_abandon retires it only if it is still waiting, under its lock. The Mux half
-- (the abandon-submission function) is covered by supabase/functions/_tests/abandon_integration_test.ts.
begin;
select plan(53);

delete from public.responses;
delete from public.prompts;
delete from public.video_uploads;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam');
insert into public.prompts (id, text, status, published_at) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Be honest about the place you live.', 'live', now()),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'Speak in every language you know.', 'live', now()),
  ('33333333-aaaa-aaaa-aaaa-333333333333', 'Newcomers unlearn?', 'live', now()),
  ('44444444-aaaa-aaaa-aaaa-444444444444', 'Best sunset spot?', 'live', now());
insert into public.suggestions (id, author_id, text) values
  ('5a000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'What''s one thing you miss from home?');
-- Adam's live response, for replies.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ad000000-0000-0000-0000-000000000001', '33333333-aaaa-aaaa-aaaa-333333333333', 'b2222222-2222-2222-2222-222222222222', 9000, 'live', 'upAdamLive', 'asAdamLive', 'pbAdamLive', now());
-- Unused URLs minted for each member.
insert into public.video_uploads (account_id, upload_id, status)
select 'a1111111-1111-1111-1111-111111111111', 'upL' || n, 'active' from generate_series(1, 14) n;
insert into public.video_uploads (account_id, upload_id, status) values
  ('b2222222-2222-2222-2222-222222222222', 'upA1', 'active'),
  ('b2222222-2222-2222-2222-222222222222', 'upA2', 'active');

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
grant execute on function pg_temp.err(text) to authenticated, anon;
create function pg_temp.act(p_account uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_account, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.act(uuid) to authenticated;
-- Superuser views of rows a member cannot read, for the checks.
create function pg_temp.rows_for(p_author uuid, p_where text) returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  execute format('select count(*)::int from public.responses where author_id = %L and %s', p_author, p_where) into n;
  return n;
end;
$$;
grant execute on function pg_temp.rows_for(uuid, text) to authenticated;
create function pg_temp.sub(p_id uuid) returns public.post_submissions language sql stable security definer set search_path = '' as $$ select * from public.post_submissions where id = p_id $$;
grant execute on function pg_temp.sub(uuid) to authenticated;
create function pg_temp.upload(p_upload text) returns public.video_uploads language sql stable security definer set search_path = '' as $$ select * from public.video_uploads where upload_id = p_upload $$;
grant execute on function pg_temp.upload(text) to authenticated;
create function pg_temp.status_of(p_id uuid) returns text language sql stable security definer set search_path = '' as $$ select status from public.responses where id = p_id $$;
grant execute on function pg_temp.status_of(uuid) to authenticated;
create function pg_temp.jobs() returns integer language sql stable security definer set search_path = '' as $$ select count(*)::int from public.mux_cleanup_jobs $$;
grant execute on function pg_temp.jobs() to authenticated;
create function pg_temp.ledger_rows() returns integer language sql stable security definer set search_path = '' as $$ select count(*)::int from public.video_uploads $$;
grant execute on function pg_temp.ledger_rows() to authenticated;
create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;
create temp table counts (k text primary key, n integer);
grant all on counts to authenticated;


create function pg_temp.begin(p_sub uuid, p_account uuid default 'a1111111-1111-1111-1111-111111111111') returns jsonb language sql as $$
  select public.begin_submission_abandon(p_account, p_sub) $$;
create function pg_temp.finish(p_sub uuid, p_outcome text) returns jsonb language sql as $$
  select public.finish_submission_abandon(p_sub, (select abandon_token from public.post_submissions where id = p_sub), p_outcome) $$;

-- ===========================================================================
-- 1. Structure and privileges
-- ===========================================================================
select is(has_function_privilege('authenticated', 'public.begin_submission_abandon(uuid, uuid)', 'execute')
       or has_function_privilege('anon', 'public.begin_submission_abandon(uuid, uuid)', 'execute')
       or has_function_privilege('authenticated', 'public.finish_submission_abandon(uuid, uuid, text)', 'execute')
       or has_function_privilege('anon', 'public.finish_submission_abandon(uuid, uuid, text)', 'execute'), false,
       'members and anon cannot begin or finish an abandonment (only the function, as the service role)');
select is(has_function_privilege('service_role', 'public.begin_submission_abandon(uuid, uuid)', 'execute')
      and has_function_privilege('service_role', 'public.finish_submission_abandon(uuid, uuid, text)', 'execute'), true, 'the service role can');
select is(has_function_privilege('authenticated', 'public.video_still_waiting(public.responses)', 'execute'), false, 'the helper is internal');
select is(to_regprocedure('public.abandon_submission(uuid)'), null, 'the database-only abandon_submission is gone');
select is((select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace
            and proname in ('begin_submission_abandon', 'finish_submission_abandon', 'submission_replay', 'retry_response_upload')
            and (not prosecdef or proowner <> 'postgres'::regrole or not coalesce(proconfig @> array['search_path=""'], false))), 0,
          'SECURITY DEFINER, owned by postgres, empty search_path');
select throws_ok($$ insert into public.post_submissions (id, account_id, kind) values (gen_random_uuid(), 'a1111111-1111-1111-1111-111111111111', 'response') $$, '23514', null, 'a submission is a whole request or a tombstone, nothing in between');

-- Fixtures: Lena posts four times with submissions (the rows the app would hold).
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into ids select 'p1', ((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', null, 5000, 'd0000000-0000-0000-0000-000000000001'))->>'id')::uuid;
insert into ids select 'p2', ((public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'upL2', null, 5000, 'd0000000-0000-0000-0000-000000000002'))->>'id')::uuid;
insert into ids select 'v1', ((public.post_reply('ad000000-0000-0000-0000-000000000001', 'upL3', null, 5000, 'd0000000-0000-0000-0000-000000000003'))->>'id')::uuid;
insert into ids select 'd1', ((public.post_draft('5a000000-0000-0000-0000-000000000001', 'upL4', null, 9000, 'd0000000-0000-0000-0000-000000000004'))->>'id')::uuid;
reset role;

-- ===========================================================================
-- 2. An id that never made a row: closed at once, so a late copy cannot make one
-- ===========================================================================
select is(pg_temp.begin('d0000000-0000-0000-0000-0000000000a1'), '{"status": "abandoned", "reason": "no_row"}'::jsonb, 'no row was made with it: abandoned, nothing to ask Mux');
select is((pg_temp.sub('d0000000-0000-0000-0000-0000000000a1')).abandoned_at is not null and (pg_temp.sub('d0000000-0000-0000-0000-0000000000a1')).kind is null, true, 'a tombstone closes the id');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('33333333-aaaa-aaaa-aaaa-333333333333', 'upL5', null, 5000, 'd0000000-0000-0000-0000-0000000000a1') $$), 'submission_closed', 'the request arriving late is refused: no row');
select is((pg_temp.upload('upL5')).status, 'active', 'and its upload is not claimed');
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select is(pg_temp.err($$ select public.post_response('33333333-aaaa-aaaa-aaaa-333333333333', 'upA1', null, 5000, 'd0000000-0000-0000-0000-0000000000a1') $$), 'submission_conflict', 'another member with that id: conflict (the tombstone is Lena''s)');
reset role;
select is(pg_temp.begin('d0000000-0000-0000-0000-0000000000a1', 'b2222222-2222-2222-2222-222222222222'), '{"status": "not_found"}'::jsonb, 'another member cannot abandon Lena''s id: not_found');
select is(pg_temp.begin('d0000000-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222'), '{"status": "not_found"}'::jsonb, 'nor her post');
select is(pg_temp.status_of((select id from ids where k = 'p1')), 'processing', 'which is untouched');
select is((pg_temp.sub('d0000000-0000-0000-0000-000000000001')).abandoning_until, null, 'and not held');

-- ===========================================================================
-- 3. A row still waiting for its video: held while Mux is asked
-- ===========================================================================
select is((pg_temp.begin('d0000000-0000-0000-0000-000000000001'))->>'status', 'checking', 'processing with no asset: only Mux can say');
select is((pg_temp.begin('d0000000-0000-0000-0000-000000000002'))->>'upload_id', 'upL2', 'the function is told the row''s upload, to ask Mux about');
select is((pg_temp.sub('d0000000-0000-0000-0000-000000000001')).abandoning_until > now(), true, 'the submission is held');
select is((pg_temp.begin('d0000000-0000-0000-0000-000000000001'))->>'reason', 'busy', 'a second abandonment meanwhile: kept, busy');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', null, 5000, 'd0000000-0000-0000-0000-000000000001') $$), 'submission_busy', 'a replay meanwhile: submission_busy (the app tries again later)');
select is(pg_temp.err(format('select public.retry_response_upload(%L, %L)', (select id from ids where k = 'p1'), 'upL6')), 'submission_busy', 'a Retry putting a new upload on the row meanwhile: submission_busy');
select is((pg_temp.upload('upL6')).status, 'active', 'and its upload is not claimed');
reset role;

-- keep: released, as it was.
select is((pg_temp.finish('d0000000-0000-0000-0000-000000000001', 'keep'))->>'status', 'kept', 'Mux has it, or could not be verified: kept');
select is(pg_temp.status_of((select id from ids where k = 'p1')), 'processing', 'the row is untouched');
select is((pg_temp.sub('d0000000-0000-0000-0000-000000000001')).abandoning_until, null, 'the hold is released');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', null, 5000, 'd0000000-0000-0000-0000-000000000001'))->>'id', (select id from ids where k = 'p1')::text, 'the replay works again');
reset role;

-- abandon: only now, the row retired.
insert into counts values ('jobs', pg_temp.jobs());
select is((pg_temp.finish('d0000000-0000-0000-0000-000000000002', 'abandon'))->>'status', 'abandoned', 'Mux confirmed it has nothing: abandoned');
select is(pg_temp.status_of((select id from ids where k = 'p2')), 'deleted', 'the row is deleted');
select is((pg_temp.upload('upL2')).status, 'claimed', 'the ledger keeps the claim (no slot freed)');
select is((pg_temp.upload('upL2')).cancelled_at is not null, true, 'and records the cancellation');
select is(pg_temp.jobs(), (select n from counts where k = 'jobs'), 'nothing queued for the clean-up worker');
select is((pg_temp.sub('d0000000-0000-0000-0000-000000000002')).abandoned_at is not null, true, 'the submission is closed');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'upL2', null, 5000, 'd0000000-0000-0000-0000-000000000002') $$), 'submission_closed', 'it cannot be replayed');
select is((public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'upL7', null, 5000, 'd0000000-0000-0000-0000-000000000005'))->>'status', 'processing', 'and the prompt is free for a new recording');
reset role;
select is(pg_temp.begin('d0000000-0000-0000-0000-000000000002'), '{"status": "abandoned", "reason": "already"}'::jsonb, 'abandoning again: already done');

-- ===========================================================================
-- 4. Never abandoned: settled rows, and rows that became settled during the check
-- ===========================================================================
-- A webhook makes the video live between the question to Mux and the finish.
select is((pg_temp.begin('d0000000-0000-0000-0000-000000000005'))->>'status', 'checking', 'held');
update public.responses set status = 'live', mux_asset_id = 'asL7', mux_playback_id = 'pbL7', live_at = now() where id = (select response_id from public.post_submissions where id = 'd0000000-0000-0000-0000-000000000005');
select is((pg_temp.finish('d0000000-0000-0000-0000-000000000005', 'abandon'))->>'status', 'kept', 'live by the time of the finish: kept, even when told to abandon');
select is(pg_temp.status_of((select response_id from public.post_submissions where id = 'd0000000-0000-0000-0000-000000000005')), 'live', 'the published video is untouched');
select is(pg_temp.begin('d0000000-0000-0000-0000-000000000005'), jsonb_build_object('status', 'kept', 'reason', 'live', 'response_id', (select response_id from public.post_submissions where id = 'd0000000-0000-0000-0000-000000000005')), 'a live video: kept, Mux not asked');
-- An asset recorded (Mux has the video).
update public.responses set mux_asset_id = 'asL3' where id = (select id from ids where k = 'v1');
select is(pg_temp.begin('d0000000-0000-0000-0000-000000000003') ->> 'reason', 'at_mux', 'processing with an asset: kept (at_mux), Mux not asked');
select is((pg_temp.sub('d0000000-0000-0000-0000-000000000003')).abandoning_until, null, 'and not held');
-- Removed by a moderator.
update public.responses set status = 'removed' where id = (select id from ids where k = 'v1');
select is(pg_temp.begin('d0000000-0000-0000-0000-000000000003') ->> 'reason', 'removed', 'removed by a moderator: kept; the removal stands');
select is(pg_temp.status_of((select id from ids where k = 'v1')), 'removed', 'still removed');

-- ===========================================================================
-- 5. Drafts: a draft still waiting for its video is abandoned like a response
-- ===========================================================================
select is((pg_temp.begin('d0000000-0000-0000-0000-000000000004'))->>'status', 'checking', 'a draft with no asset: held');
select is((pg_temp.finish('d0000000-0000-0000-0000-000000000004', 'abandon'))->>'status', 'abandoned', 'and abandoned once Mux confirms');
select is(pg_temp.status_of((select id from ids where k = 'd1')), 'deleted', 'the draft is deleted');

-- ===========================================================================
-- 6. Tokens and expired holds
-- ===========================================================================
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into ids select 'p3', ((public.post_response('33333333-aaaa-aaaa-aaaa-333333333333', 'upL8', null, 5000, 'd0000000-0000-0000-0000-000000000006'))->>'id')::uuid;
reset role;
insert into ids select 'tok', ((pg_temp.begin('d0000000-0000-0000-0000-000000000006'))->>'token')::uuid;
update public.post_submissions set abandoning_until = now() - interval '1 second' where id = 'd0000000-0000-0000-0000-000000000006';
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is((public.post_response('33333333-aaaa-aaaa-aaaa-333333333333', 'upL8', null, 5000, 'd0000000-0000-0000-0000-000000000006'))->>'id', (select id from ids where k = 'p3')::text, 'an expired hold no longer blocks a replay');
reset role;
select is((pg_temp.begin('d0000000-0000-0000-0000-000000000006'))->>'status', 'checking', 'an expired hold can be taken again');
select is((public.finish_submission_abandon('d0000000-0000-0000-0000-000000000006', (select id from ids where k = 'tok'), 'abandon'))->>'reason', 'busy', 'the first, expired holder''s finish does nothing');
select is(pg_temp.status_of((select id from ids where k = 'p3')), 'processing', 'the row is untouched');
select is((public.finish_submission_abandon('d0000000-0000-0000-0000-000000000006', gen_random_uuid(), 'abandon'))->>'reason', 'busy', 'nor does a made-up token');
select throws_ok($$ select public.finish_submission_abandon('d0000000-0000-0000-0000-000000000006', gen_random_uuid(), 'delete') $$, 'P0001', 'invalid_outcome', 'only abandon or keep');
select is((pg_temp.finish('d0000000-0000-0000-0000-000000000006', 'keep'))->>'status', 'kept', 'the current holder releases it');

select * from finish();
rollback;
