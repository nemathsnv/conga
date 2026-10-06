-- pgTAP tests for phase 3: prompts, responses, feeds, follows, disclosure.
begin;
select plan(31);

-- The local seed already publishes prompts; this transaction starts from none (rolled back at the end).
delete from public.responses;
delete from public.prompts;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now()),
  ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'lenahart'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'adam'),
  ('c3333333-3333-3333-3333-333333333333', 'Maya Lindqvist', 'mayalind');

select public.team_create_prompt('Be honest about the place you live.', null, (now() at time zone 'utc')::date);
select public.team_create_prompt('Speak in every language you know.');
select public.team_create_prompt('Newcomers unlearn?', 'canggu');

-- Adam and Maya already have live responses to the featured prompt; Maya's is newer.
insert into public.responses (prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at)
select id, 'b2222222-2222-2222-2222-222222222222', 12000, 'live', 'up-adam', 'as-adam', 'pb-adam', now() - interval '2 hours' from public.prompts where text like 'Be honest%';
insert into public.responses (prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at)
select id, 'c3333333-3333-3333-3333-333333333333', 8000, 'live', 'up-maya', 'as-maya', 'pb-maya', now() - interval '1 hour' from public.prompts where text like 'Be honest%';

-- ---------------------------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.prompts), 0, 'anon reads no prompts');
select is((select count(*)::int from public.responses), 0, 'anon reads no responses');
select throws_ok($$ select public.home_feed() $$, '42501', null, 'anon cannot call home_feed');
reset role;

-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.prompts), 3, 'signed-in people read live prompts');
select throws_ok($$ select public.team_create_prompt('x') $$, '42501', null, 'members cannot create prompts');
select throws_ok($$ select public.mark_response_live('up-x', 'a', 'p', 1000) $$, '42501', null, 'members cannot mark responses live');

-- Home feed: featured prompt first, newest response shown, place prompts left out until phase 6.
select is(jsonb_array_length(public.home_feed()), 2, 'home feed lists the global prompts');
select is((public.home_feed())->0->'prompt'->>'text', 'Be honest about the place you live.', 'featured prompt comes first');
select is((public.home_feed())->0->'response'->'author'->>'username', 'mayalind', 'newest response is shown when following nobody');
select is((public.home_feed())->0->'prompt'->>'response_count', '2', 'response count on the prompt');
select is((public.home_feed())->1->'response', 'null'::jsonb, 'a prompt with no responses is a conversation with no response (Z-Empty)');
select is(jsonb_array_length(public.home_feed(array[(select id from public.prompts where text like 'Be honest%')])), 1, 'seen conversations are excluded');

-- Following: follow Adam, his response is then preferred on Home and appears in the Following feed.
select is(jsonb_array_length(public.following_feed()), 0, 'following feed is empty before following anyone');
select lives_ok($$ select public.follow_user('b2222222-2222-2222-2222-222222222222') $$, 'follow_user');
select throws_ok($$ select public.follow_user('a1111111-1111-1111-1111-111111111111') $$, 'P0001', 'cannot_follow_self', 'cannot follow yourself');
select is((public.home_feed())->0->'response'->'author'->>'username', 'adam', 'a followed person''s response is preferred on Home');
select is((public.following_feed())->0->'response'->'author'->>'username', 'adam', 'following feed shows the followed person''s response');
select is((public.get_profile('b2222222-2222-2222-2222-222222222222'))->>'is_following', 'true', 'profile shows is_following');
select is((public.get_profile('b2222222-2222-2222-2222-222222222222'))->>'follower_count', '1', 'follower count');
select is(jsonb_array_length(public.follow_list('b2222222-2222-2222-2222-222222222222', 'followers')), 1, 'followers list');

-- Player order: entry first, then unseen followed, then newer.
select is((public.prompt_responses((select id from public.prompts where text like 'Be honest%'), (select id from public.responses where mux_upload_id = 'up-maya')))->'responses'->0->'author'->>'username', 'mayalind', 'entry response comes first');
select is((public.prompt_responses((select id from public.prompts where text like 'Be honest%')))->'responses'->0->'author'->>'username', 'adam', 'without an entry, unseen followed people come first');

-- Posting: disclosure first, one response per prompt, limits.
select throws_ok($$ select public.post_response((select id from public.prompts where text like 'Speak%'), 'up-lena', null, 5000) $$, 'P0001', 'disclosure_required', 'no post before the disclosure');
select lives_ok($$ select public.acknowledge_disclosure() $$, 'acknowledge_disclosure');
select throws_ok($$ select public.post_response((select id from public.prompts where text like 'Speak%'), 'up-lena', null, 1000) $$, 'P0001', 'invalid_duration', 'under 2 seconds is refused');
select is((public.post_response((select id from public.prompts where text like 'Speak%'), 'up-lena', '  Berawa traffic  ', 5000))->>'status', 'processing', 'post_response creates a processing response');
select throws_ok($$ select public.post_response((select id from public.prompts where text like 'Speak%'), 'up-lena-2', null, 5000) $$, 'P0001', 'already_responded', 'one primary response per person per prompt');
select is(jsonb_array_length(public.profile_responses('a1111111-1111-1111-1111-111111111111')), 1, 'own processing response shows on own profile (Processing tile)');
reset role;

-- Service role marks it live; it then appears for others.
select is((public.mark_response_live('up-lena', 'as-lena', 'pb-lena', 5200))->>'status', 'live', 'mark_response_live');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((public.get_response((select id from public.responses where mux_upload_id = 'up-lena')))->>'playback_id', 'pb-lena', 'others see the live response with its playback id');
select is((public.get_response((select id from public.responses where mux_upload_id = 'up-adam')))->>'is_own', 'true', 'own response is marked is_own');
reset role;

select * from finish();
rollback;
