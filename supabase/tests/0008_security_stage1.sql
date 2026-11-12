-- pgTAP tests for security stage 1, F1: direct reads of public.responses (20261011000100).
-- Members read only their own rows straight from the table; other people's videos reach them
-- only through the read functions, which apply blocks and the other visibility rules.
begin;
select plan(36);

delete from public.blocks;
delete from public.responses;
delete from public.prompts;

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
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Be honest about the place you live.', 'live', now(), (now() at time zone 'utc')::date),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'Speak in every language you know.', 'live', now(), null),
  ('33333333-aaaa-aaaa-aaaa-333333333333', 'Newcomers unlearn?', 'live', now(), null);

-- Adam: one row in every status. Lena: one live response.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('d1111111-0000-0000-0000-000000000001', '11111111-aaaa-aaaa-aaaa-111111111111', 'b2222222-2222-2222-2222-222222222222', 12000, 'live', 'upAdamLive', 'asAdamLive', 'pbAdamLive', now() - interval '2 hours'),
  ('d1111111-0000-0000-0000-000000000002', '22222222-aaaa-aaaa-aaaa-222222222222', 'b2222222-2222-2222-2222-222222222222', 9000, 'processing', 'upAdamProc', null, null, null),
  ('d1111111-0000-0000-0000-000000000003', '33333333-aaaa-aaaa-aaaa-333333333333', 'b2222222-2222-2222-2222-222222222222', 9000, 'removed', 'upAdamRem', 'asAdamRem', 'pbAdamRem', now() - interval '3 hours'),
  ('d1111111-0000-0000-0000-000000000004', '33333333-aaaa-aaaa-aaaa-333333333333', 'b2222222-2222-2222-2222-222222222222', 9000, 'deleted', 'upAdamDel', 'asAdamDel', 'pbAdamDel', now() - interval '4 hours'),
  ('d1111111-0000-0000-0000-000000000005', null, 'b2222222-2222-2222-2222-222222222222', 9000, 'draft', 'upAdamDraft', 'asAdamDraft', 'pbAdamDraft', null),
  ('d2222222-0000-0000-0000-000000000001', '11111111-aaaa-aaaa-aaaa-111111111111', 'a1111111-1111-1111-1111-111111111111', 8000, 'live', 'upLenaLive', 'asLenaLive', 'pbLenaLive', now() - interval '1 hour');

-- ---------------------------------------------------------------------------
-- The assumptions the fix relies on: the read functions bypass RLS only because they are
-- SECURITY DEFINER functions owned by the table owner, and no view re-exposes the table.
select policies_are('public', 'responses', array['responses: signed-in users read only their own directly'], 'responses has exactly one policy, the own-rows read');
select is((select relowner::regrole::text from pg_class where oid = 'public.responses'::regclass), 'postgres', 'responses is owned by postgres');
select is((select relrowsecurity and not relforcerowsecurity from pg_class where oid = 'public.responses'::regclass), true, 'RLS is on and not forced on the owner');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prosrc ~ '\mresponses\M' and p.proowner <> 'postgres'::regrole), 0, 'every SECURITY DEFINER function that reads responses is owned by postgres');
select is((select count(*)::int from pg_depend d join pg_rewrite rw on rw.oid = d.objid where d.refobjid = 'public.responses'::regclass and rw.ev_class <> 'public.responses'::regclass), 0, 'no view reads responses');

-- ---------------------------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.responses), 0, 'anon reads no responses directly');
reset role;

-- ---------------------------------------------------------------------------
-- Maya has no videos: she reads nothing directly, including other people's live ones.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is((select count(*)::int from public.responses), 0, 'a member with no videos reads no rows directly');
select is((select count(*)::int from public.responses where status = 'live'), 0, 'other people''s live responses are not readable directly');
select is((select count(*)::int from public.responses where id = 'd1111111-0000-0000-0000-000000000001'), 0, 'not even by id');
select is((select count(*)::int from public.responses where mux_upload_id = 'upAdamLive'), 0, 'not by upload id (mux-upload-status looks rows up this way)');
select is((select count(*)::int from public.responses where author_id = 'b2222222-2222-2222-2222-222222222222'), 0, 'not by author');
select is((select count(*)::int from public.responses where status in ('processing', 'removed', 'deleted', 'draft')), 0, 'other people''s processing, removed, deleted and draft rows stay hidden');
-- The read functions still serve other people's live videos.
select is((public.get_response('d1111111-0000-0000-0000-000000000001'))->>'playback_id', 'pbAdamLive', 'get_response still serves another member''s live response');
select is((public.get_response('d1111111-0000-0000-0000-000000000001'))->>'is_own', 'false', 'and marks it as not own');
select is((public.get_response('d1111111-0000-0000-0000-000000000002'))->>'status', 'unavailable', 'get_response does not serve another member''s processing response');
select is((public.get_response('d1111111-0000-0000-0000-000000000003'))->>'status', 'unavailable', 'nor a removed one');
select is(jsonb_array_length((public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111'))->'responses'), 2, 'the response player still lists both live responses');
select is(jsonb_array_length(public.profile_responses('b2222222-2222-2222-2222-222222222222')), 1, 'another member''s profile grid still shows their live response');
select is((public.home_feed())->0->'response'->>'playback_id', 'pbLenaLive', 'Home still shows the newest live response');
reset role;

-- ---------------------------------------------------------------------------
-- Adam reads every one of his own rows directly, and nobody else's.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.responses), 5, 'the author reads all five of their own rows');
select is((select array_agg(status order by status) from public.responses), array['deleted', 'draft', 'live', 'processing', 'removed'], 'in every status');
select is((select mux_playback_id from public.responses where mux_upload_id = 'upAdamProc'), null, 'the own processing row is found by upload id (mux-upload-status)');
select is((select status from public.responses where mux_upload_id = 'upAdamProc'), 'processing', 'with its status');
select is((select count(*)::int from public.responses where mux_upload_id = 'upLenaLive'), 0, 'another member''s live row is not found by upload id');
select is((select count(*)::int from public.responses where author_id <> 'b2222222-2222-2222-2222-222222222222'), 0, 'no rows by anyone else');
-- Direct writes stay closed: there is no insert, update or delete policy.
select throws_ok($$ insert into public.responses (prompt_id, author_id, duration_ms, status, mux_upload_id) values ('22222222-aaaa-aaaa-aaaa-222222222222', 'b2222222-2222-2222-2222-222222222222', 9000, 'live', 'upForged') $$, '42501', null, 'members cannot insert responses directly');
select lives_ok($$ update public.responses set status = 'live' where id = 'd1111111-0000-0000-0000-000000000002' $$, 'a direct update runs');
select lives_ok($$ delete from public.responses where id = 'd1111111-0000-0000-0000-000000000001' $$, 'a direct delete runs');
reset role;
select is((select status from public.responses where id = 'd1111111-0000-0000-0000-000000000002'), 'processing', 'but changes nothing');
select is((select count(*)::int from public.responses where id = 'd1111111-0000-0000-0000-000000000001'), 1, 'and deletes nothing');

-- ---------------------------------------------------------------------------
-- Blocks: before the fix a blocked member could still read the blocker's live rows directly.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$ select public.block_user('b2222222-2222-2222-2222-222222222222') $$, 'Lena blocks Adam');
select is((public.get_response('d1111111-0000-0000-0000-000000000001'))->>'status', 'unavailable', 'the read function hides the blocked author''s response');
select is((select count(*)::int from public.responses where author_id = 'b2222222-2222-2222-2222-222222222222'), 0, 'and so does the table');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.responses where author_id = 'a1111111-1111-1111-1111-111111111111'), 0, 'the blocked member cannot read the blocker''s live response directly');
select is((public.get_response('d2222222-0000-0000-0000-000000000001'))->>'status', 'unavailable', 'nor through get_response');
reset role;

-- Service role (the Edge Functions' admin client) still marks a processing response live.
select is((public.mark_response_live('upAdamProc', 'asAdamProc', 'pbAdamProc', 9100))->>'status', 'live', 'mark_response_live still works');

select * from finish();
rollback;
