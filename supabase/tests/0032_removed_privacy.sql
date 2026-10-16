-- pgTAP tests: a video removed by moderation is private (the web read functions and every app
-- read function return nothing of it, to anyone but its author's own removal notice), and a
-- suspended account is refused on every product path. Complements 0004 (which covers the notice,
-- get_video, the player lists and the main suspended reads) and 0010 (deletion and playback).
begin;
select plan(40);

delete from public.reports;
delete from public.review_requests;
delete from public.moderation_actions;
delete from public.responses;
delete from public.prompts;
delete from public.video_uploads;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now()),
  ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam'),
  ('c3333333-3333-3333-3333-333333333333', 'Maya Lindqvist', 'testmaya');
insert into public.prompts (id, text, status, published_at, featured_on) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Only Maya answered this one.', 'live', now(), (now() at time zone 'utc')::date),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'Both answered this one.', 'live', now(), null);
-- Maya: a removed response on prompt 1 (alone there), a live one on prompt 2.
insert into public.responses (id, prompt_id, author_id, caption, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('d5555555-5555-5555-5555-555555555555', '11111111-aaaa-aaaa-aaaa-111111111111', 'c3333333-3333-3333-3333-333333333333', 'Secret caption', 8000, 'live', 'up-maya', 'as-maya', 'pb-maya-secret', now() - interval '1 hour'),
  ('d6666666-6666-6666-6666-666666666666', '22222222-aaaa-aaaa-aaaa-222222222222', 'c3333333-3333-3333-3333-333333333333', 'Fine one', 8000, 'live', 'up-maya2', 'as-maya2', 'pb-maya2', now() - interval '50 minutes'),
  ('d4444444-4444-4444-4444-444444444444', '22222222-aaaa-aaaa-aaaa-222222222222', 'b2222222-2222-2222-2222-222222222222', 'Adam', 9000, 'live', 'up-adam', 'as-adam', 'pb-adam', now() - interval '40 minutes');
-- A reply to the response that will be removed, and a comment on it.
insert into public.responses (id, kind, prompt_id, root_response_id, reply_to_id, author_id, caption, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('e7777777-7777-7777-7777-777777777777', 'reply', '11111111-aaaa-aaaa-aaaa-111111111111', 'd5555555-5555-5555-5555-555555555555', 'd5555555-5555-5555-5555-555555555555', 'a1111111-1111-1111-1111-111111111111', 'reply', 5000, 'live', 'up-lena-r', 'as-lena-r', 'pb-lena-r', now() - interval '30 minutes');
insert into public.comments (id, response_id, author_id, body) values
  ('f8888888-8888-8888-8888-888888888888', 'd5555555-5555-5555-5555-555555555555', 'b2222222-2222-2222-2222-222222222222', 'Nice one, Maya');
insert into public.follows (follower_id, followee_id) values ('a1111111-1111-1111-1111-111111111111', 'c3333333-3333-3333-3333-333333333333');

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

-- Before the removal: everything is visible, so the checks below mean something.
set local role anon;
select is((public.web_video('d5555555-5555-5555-5555-555555555555'))->>'status', 'live', 'before: the web player has it');
select is((public.web_prompt('11111111-aaaa-aaaa-aaaa-111111111111'))->>'status', 'live', 'before: the web prompt page has it');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(jsonb_array_length((public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111'))->'responses'), 1, 'before: the player lists it');
reset role;

select lives_ok($$ select public.mod_remove_video('d5555555-5555-5555-5555-555555555555', 'Spam.', 'nemat', 'internal') $$, 'a moderator removes Maya''s response on prompt 1');

-- ===========================================================================
-- Removed video: the web
-- ===========================================================================
set local role anon;
select is((public.web_video('d5555555-5555-5555-5555-555555555555'))->>'status', 'unavailable', 'web_video: unavailable');
select is(public.web_video('d5555555-5555-5555-5555-555555555555')::text !~ 'pb-maya-secret|Secret caption', true, 'and says nothing of it (no playback id, no caption)');
select is((public.web_video('e7777777-7777-7777-7777-777777777777'))->>'status', 'live', 'a video reply to it is still public');
select is(public.web_video('e7777777-7777-7777-7777-777777777777')::text !~ 'pb-maya-secret|Secret caption', true, 'without any of the removed response');
select is((public.web_prompt('11111111-aaaa-aaaa-aaaa-111111111111'))->>'status', 'empty', 'web_prompt: a prompt whose only response was removed is the empty state');
select is(public.web_prompt('11111111-aaaa-aaaa-aaaa-111111111111')::text !~ 'pb-maya-secret|Secret caption', true, 'with no trace of it');
select is(public.web_prompt('22222222-aaaa-aaaa-aaaa-222222222222')::text !~ 'pb-maya-secret|Secret caption', true, 'and another prompt''s page does not mention it');
select is((public.web_video('d6666666-6666-6666-6666-666666666666'))->'more' @> '[]'::jsonb, true, 'the "more responses" of a live one');
select is(public.web_video('d6666666-6666-6666-6666-666666666666')::text !~ 'pb-maya-secret', true, 'never include the removed one');
reset role;

-- ===========================================================================
-- Removed video: the app's read functions, for other members
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((public.get_video('d5555555-5555-5555-5555-555555555555'))->>'status', 'unavailable', 'get_video: unavailable');
select is((public.get_response('d5555555-5555-5555-5555-555555555555'))->>'status', 'unavailable', 'get_response: unavailable');
select is(jsonb_array_length((public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111'))->'responses'), 0, 'prompt_responses: not listed');
select is(public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111')::text !~ 'pb-maya-secret|Secret caption', true, 'and no playback id or caption anywhere in it');
select is((public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111', 'd5555555-5555-5555-5555-555555555555'))->>'entry_status', 'unavailable', 'as the entry: unavailable');
select is(jsonb_array_length(public.profile_responses('c3333333-3333-3333-3333-333333333333')), 1, 'profile_responses: only her live one');
select is(public.profile_responses('c3333333-3333-3333-3333-333333333333')::text !~ 'pb-maya-secret|Secret caption', true, 'without the removed one');
select is(public.home_feed()::text !~ 'pb-maya-secret|Secret caption', true, 'home_feed: no trace');
select is(public.get_profile('c3333333-3333-3333-3333-333333333333')::text !~ 'pb-maya-secret|Secret caption', true, 'get_profile: no trace');
select is((public.get_prompt('11111111-aaaa-aaaa-aaaa-111111111111'))->>'response_count', '0', 'the prompt''s response count does not count it');
select is(jsonb_array_length((public.get_prompt('11111111-aaaa-aaaa-aaaa-111111111111'))->'faces'), 0, 'nor show her face');
select is(pg_temp.err($$ select public.post_comment('d5555555-5555-5555-5555-555555555555', 'hello') $$) in ('ok'), false, 'a comment cannot be added to it');
select is(pg_temp.err($$ select public.like_video('d5555555-5555-5555-5555-555555555555') $$) in ('ok'), false, 'it cannot be liked');
select is(pg_temp.err($$ select public.post_reply('d5555555-5555-5555-5555-555555555555', 'x', null, 5000) $$) in ('ok'), false, 'it cannot be replied to');
select is(public.activity_list()::text !~ 'pb-maya-secret|Secret caption', true, 'activity_list: Lena''s own Activity has no trace of it');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((select count(*)::int from public.responses where id = 'd5555555-5555-5555-5555-555555555555'), 0, 'the table: another member reads no row of it');
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((public.get_video('d5555555-5555-5555-5555-555555555555'))->>'status', 'unavailable', 'the person who commented on it cannot watch it either');
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is((select count(*)::int from public.responses where id = 'd5555555-5555-5555-5555-555555555555'), 1, 'its author keeps the row (their own notice and review request need it)');
select is(pg_temp.err($$ select public.get_notice((select id from public.moderation_actions where kind = 'remove')) $$), 'ok', 'and their removal notice');
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(pg_temp.err($$ select public.get_notice((select id from public.moderation_actions where kind = 'remove')) $$) = 'ok', false, 'another member cannot read that notice');
reset role;

-- ===========================================================================
-- Suspension: every product path
-- ===========================================================================
select lives_ok($$ select public.mod_suspend('b2222222-2222-2222-2222-222222222222', 'Severe abuse.', 'nemat') $$, 'suspend Adam');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
-- The gate (PostgREST's pre_request) refuses every function a member can call, except the few the
-- suspended experience needs. Checked against the actual list of callable functions.
create function pg_temp.gate_lets_through() returns text[] language plpgsql as $$
declare
  r record;
  out text[] := '{}';
begin
  for r in select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute') and p.proname <> 'pre_request' group by p.proname loop
    perform set_config('request.path', '/rpc/' || r.proname, true);
    begin
      perform public.pre_request();
      out := out || r.proname::text;
    exception when others then null;
    end;
  end loop;
  perform set_config('request.path', '', true);
  return (select coalesce(array_agg(x order by x), '{}') from unnest(out) x);
end;
$$;
grant execute on function pg_temp.gate_lets_through() to authenticated;
select is(pg_temp.gate_lets_through(),
          (select array_agg(x order by x) from unnest(array['get_onboarding_state', 'request_review', 'delete_account', 'remove_push_token', 'set_timezone']) x
            where exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = x)),
          'the gate refuses every callable function but the five a suspended person needs');
-- The functions most likely to be called directly refuse too, even without the gate. (The others,
-- like_video and follow_user for example, have no check of their own: the gate above is their
-- guard, and every request from the app and the Edge Functions passes it.)
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'x', null, 5000) $$), 'suspended', 'post_response');
select is(pg_temp.err($$ select public.post_reply('d6666666-6666-6666-6666-666666666666', 'x', null, 5000) $$), 'suspended', 'post_reply');
select is(pg_temp.err($$ select public.reserve_video_upload() $$), 'suspended', 'reserve_video_upload');
select is(pg_temp.err($$ select public.suggest_prompt('Something to ask everyone') $$) = 'ok', false, 'suggest_prompt');
reset role;
select is((select count(*)::int from public.responses where author_id = 'b2222222-2222-2222-2222-222222222222' and id <> 'd4444444-4444-4444-4444-444444444444'), 0, 'and nothing was made');

select * from finish();
rollback;
