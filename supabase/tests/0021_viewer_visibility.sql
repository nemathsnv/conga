-- pgTAP tests for the privacy audit (20261016000201 and the read paths it audited): every read
-- path a member can call, as a viewer with someone hidden from them in each way the spec names.
--
-- Lena is the viewer. Hidden from her: Adam (he blocked her), Pia (she blocked Pia), Maya (in her
-- deletion window), Rafi's response (removed by a moderator; Rafi himself is visible), Quinn's
-- video reply and comment (Lena reported both; Quinn is visible). Omar is visible and is the
-- control. A path leaks when its answer contains a hidden person's username, a hidden video's
-- playback id, or a hidden comment's text. With the rollback files of 20261016000200 to 0202
-- applied, 26 of 74 fail (faces on every prompt card, Activity's video and comment, the badge,
-- the follow counts).
begin;
select plan(74);

delete from public.reports;
delete from public.blocks;
delete from public.follows;
delete from public.place_follows;
delete from public.comments;
delete from public.likes;
delete from public.responses;
delete from public.prompts;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email, '{}', '{}', now(), now()
  from (values ('a1111111-1111-1111-1111-111111111111', 'lena@example.com'), ('b2222222-2222-2222-2222-222222222222', 'adam@example.com'),
               ('c3333333-3333-3333-3333-333333333333', 'maya@example.com'), ('d4444444-4444-4444-4444-444444444444', 'omar@example.com'),
               ('e5555555-5555-5555-5555-555555555555', 'pia@example.com'), ('f6666666-6666-6666-6666-666666666666', 'rafi@example.com'),
               ('97777777-7777-7777-7777-777777777777', 'quinn@example.com')) v(id, email);
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now(), beta_cohort = 'canggu';
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'vislena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'visadam'),
  ('c3333333-3333-3333-3333-333333333333', 'Maya Lindqvist', 'vismaya'),
  ('d4444444-4444-4444-4444-444444444444', 'Omar Haddad', 'visomar'),
  ('e5555555-5555-5555-5555-555555555555', 'Pia Sari', 'vispia'),
  ('f6666666-6666-6666-6666-666666666666', 'Rafi Putra', 'visrafi'),
  ('97777777-7777-7777-7777-777777777777', 'Quinn Wu', 'visquinn');

insert into public.prompts (id, text, status, published_at, place_id) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Visibility: the best warung nearby?', 'live', now() - interval '1 day', null),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'Visibility: sunset spot in Canggu?', 'live', now() - interval '2 days', (select id from public.places where slug = 'canggu'));

insert into public.responses (id, prompt_id, author_id, kind, root_response_id, reply_to_id, caption, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at)
select v.id::uuid, v.prompt::uuid, v.author::uuid, v.kind, v.root::uuid, v.root::uuid, v.cap, 9000, v.status, 'up' || v.pb, 'as' || v.pb, v.pb, now() - (v.age || ' minutes')::interval
  from (values
    -- On the global prompt.
    ('f0000000-0000-0000-0000-00000000000a', '11111111-aaaa-aaaa-aaaa-111111111111', 'a1111111-1111-1111-1111-111111111111', 'response', null, 'Lena''s take', 'live', 'pbLena', 60),
    ('f0000000-0000-0000-0000-000000000001', '11111111-aaaa-aaaa-aaaa-111111111111', 'd4444444-4444-4444-4444-444444444444', 'response', null, 'Omar''s take', 'live', 'pbOmar', 50),
    ('f0000000-0000-0000-0000-000000000002', '11111111-aaaa-aaaa-aaaa-111111111111', 'b2222222-2222-2222-2222-222222222222', 'response', null, 'hidden-cap-adam', 'live', 'pbAdam', 5),
    ('f0000000-0000-0000-0000-000000000003', '11111111-aaaa-aaaa-aaaa-111111111111', 'e5555555-5555-5555-5555-555555555555', 'response', null, 'hidden-cap-pia', 'live', 'pbPia', 4),
    ('f0000000-0000-0000-0000-000000000004', '11111111-aaaa-aaaa-aaaa-111111111111', 'c3333333-3333-3333-3333-333333333333', 'response', null, 'hidden-cap-maya', 'live', 'pbMaya', 3),
    ('f0000000-0000-0000-0000-000000000005', '11111111-aaaa-aaaa-aaaa-111111111111', 'f6666666-6666-6666-6666-666666666666', 'response', null, 'hidden-cap-rafi', 'removed', 'pbRafi', 2),
    -- On the Canggu prompt.
    ('f0000000-0000-0000-0000-000000000011', '22222222-aaaa-aaaa-aaaa-222222222222', 'd4444444-4444-4444-4444-444444444444', 'response', null, 'Omar in Canggu', 'live', 'pbOmarC', 40),
    ('f0000000-0000-0000-0000-000000000012', '22222222-aaaa-aaaa-aaaa-222222222222', 'b2222222-2222-2222-2222-222222222222', 'response', null, 'hidden-cap-adam-c', 'live', 'pbAdamC', 6),
    ('f0000000-0000-0000-0000-000000000013', '22222222-aaaa-aaaa-aaaa-222222222222', 'e5555555-5555-5555-5555-555555555555', 'response', null, 'hidden-cap-pia-c', 'live', 'pbPiaC', 7),
    ('f0000000-0000-0000-0000-000000000014', '22222222-aaaa-aaaa-aaaa-222222222222', 'c3333333-3333-3333-3333-333333333333', 'response', null, 'hidden-cap-maya-c', 'live', 'pbMayaC', 8),
    -- Video replies to Omar's response.
    ('f0000000-0000-0000-0000-000000000022', '11111111-aaaa-aaaa-aaaa-111111111111', 'b2222222-2222-2222-2222-222222222222', 'reply', 'f0000000-0000-0000-0000-000000000001', 'hidden-cap-adam-r', 'live', 'pbAdamR', 9),
    ('f0000000-0000-0000-0000-000000000023', '11111111-aaaa-aaaa-aaaa-111111111111', 'e5555555-5555-5555-5555-555555555555', 'reply', 'f0000000-0000-0000-0000-000000000001', 'hidden-cap-pia-r', 'live', 'pbPiaR', 10),
    ('f0000000-0000-0000-0000-000000000024', '11111111-aaaa-aaaa-aaaa-111111111111', 'c3333333-3333-3333-3333-333333333333', 'reply', 'f0000000-0000-0000-0000-000000000001', 'hidden-cap-maya-r', 'live', 'pbMayaR', 11),
    ('f0000000-0000-0000-0000-000000000025', '11111111-aaaa-aaaa-aaaa-111111111111', '97777777-7777-7777-7777-777777777777', 'reply', 'f0000000-0000-0000-0000-000000000001', 'Quinn to Omar', 'live', 'pbQuinnOk', 12),
    -- Video replies to Lena's response.
    ('f0000000-0000-0000-0000-000000000027', '11111111-aaaa-aaaa-aaaa-111111111111', '97777777-7777-7777-7777-777777777777', 'reply', 'f0000000-0000-0000-0000-00000000000a', 'hidden-cap-quinn-r', 'live', 'pbQuinnR', 13),
    ('f0000000-0000-0000-0000-000000000028', '11111111-aaaa-aaaa-aaaa-111111111111', 'e5555555-5555-5555-5555-555555555555', 'reply', 'f0000000-0000-0000-0000-00000000000a', 'hidden-cap-pia-r2', 'live', 'pbPiaR2', 14)
  ) v(id, prompt, author, kind, root, cap, status, pb, age);

insert into public.comments (id, response_id, author_id, body) values
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222', 'hidden-comment-adam'),
  ('c0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', 'e5555555-5555-5555-5555-555555555555', 'hidden-comment-pia'),
  ('c0000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000001', 'c3333333-3333-3333-3333-333333333333', 'hidden-comment-maya'),
  ('c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000001', 'd4444444-4444-4444-4444-444444444444', 'Omar on his own'),
  ('c0000000-0000-0000-0000-000000000011', 'f0000000-0000-0000-0000-00000000000a', 'b2222222-2222-2222-2222-222222222222', 'hidden-comment-adam-2'),
  ('c0000000-0000-0000-0000-000000000012', 'f0000000-0000-0000-0000-00000000000a', '97777777-7777-7777-7777-777777777777', 'hidden-comment-quinn'),
  ('c0000000-0000-0000-0000-000000000013', 'f0000000-0000-0000-0000-00000000000a', 'd4444444-4444-4444-4444-444444444444', 'Omar on Lena''s');

insert into public.follows (follower_id, followee_id) values
  ('a1111111-1111-1111-1111-111111111111', 'd4444444-4444-4444-4444-444444444444'),
  ('a1111111-1111-1111-1111-111111111111', 'f6666666-6666-6666-6666-666666666666'),
  ('a1111111-1111-1111-1111-111111111111', '97777777-7777-7777-7777-777777777777'),
  ('97777777-7777-7777-7777-777777777777', 'd4444444-4444-4444-4444-444444444444'),
  ('c3333333-3333-3333-3333-333333333333', 'd4444444-4444-4444-4444-444444444444'),
  ('b2222222-2222-2222-2222-222222222222', 'd4444444-4444-4444-4444-444444444444'),
  ('d4444444-4444-4444-4444-444444444444', 'c3333333-3333-3333-3333-333333333333');
insert into public.place_follows (account_id, place_id, source)
select 'a1111111-1111-1111-1111-111111111111', id, 'manual' from public.places where slug = 'canggu'
on conflict do nothing;
insert into public.blocks (blocker_id, blocked_id) values
  ('b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111'),
  ('a1111111-1111-1111-1111-111111111111', 'e5555555-5555-5555-5555-555555555555');
insert into public.reports (reporter_id, target_kind, target_id, reason) values
  ('a1111111-1111-1111-1111-111111111111', 'video', 'f0000000-0000-0000-0000-000000000027', 'spam'),
  ('a1111111-1111-1111-1111-111111111111', 'comment', 'c0000000-0000-0000-0000-000000000012', 'spam');
update public.accounts set deleted_at = now() - interval '2 days' where id = 'c3333333-3333-3333-3333-333333333333';

-- Lena's Activity, written here so the expected rows are exact (the triggers' rows are removed).
delete from public.activity;
insert into public.activity (recipient_id, kind, actor_id, video_id, comment_id, prompt_id) values
  ('a1111111-1111-1111-1111-111111111111', 'comment', 'b2222222-2222-2222-2222-222222222222', 'f0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000011', null),
  ('a1111111-1111-1111-1111-111111111111', 'follow', 'c3333333-3333-3333-3333-333333333333', null, null, null),
  ('a1111111-1111-1111-1111-111111111111', 'video_reply', 'e5555555-5555-5555-5555-555555555555', 'f0000000-0000-0000-0000-000000000028', null, null),
  ('a1111111-1111-1111-1111-111111111111', 'followed_responded', 'f6666666-6666-6666-6666-666666666666', 'f0000000-0000-0000-0000-000000000005', null, '11111111-aaaa-aaaa-aaaa-111111111111'),
  ('a1111111-1111-1111-1111-111111111111', 'video_reply', '97777777-7777-7777-7777-777777777777', 'f0000000-0000-0000-0000-000000000027', null, null),
  ('a1111111-1111-1111-1111-111111111111', 'comment', '97777777-7777-7777-7777-777777777777', 'f0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000012', null),
  ('a1111111-1111-1111-1111-111111111111', 'comment', 'd4444444-4444-4444-4444-444444444444', 'f0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000013', null);

-- What must never reach Lena.
create function pg_temp.leaks(j jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(t order by t), '{}') from unnest(array[
    'visadam', 'vispia', 'vismaya',
    'pbAdam', 'pbPia', 'pbMaya', 'pbRafi', 'pbQuinnR', 'pbAdamC', 'pbPiaC', 'pbMayaC', 'pbAdamR', 'pbPiaR', 'pbMayaR', 'pbPiaR2',
    'hidden-cap', 'hidden-comment']) t
   where coalesce(j::text, '') like '%' || t || '%';
$$;
grant execute on function pg_temp.leaks(jsonb) to authenticated;

-- ===========================================================================
-- Every read path, as Lena.
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is(pg_temp.leaks(public.home_feed()), '{}', 'home_feed');
select is(pg_temp.leaks(public.following_feed()), '{}', 'following_feed');
select is(pg_temp.leaks(public.open_prompts()), '{}', 'open_prompts');
select is(pg_temp.leaks(public.get_prompt('11111111-aaaa-aaaa-aaaa-111111111111')), '{}', 'get_prompt (faces)');
select is(pg_temp.leaks(public.get_prompt('22222222-aaaa-aaaa-aaaa-222222222222')), '{}', 'get_prompt, place prompt (faces)');
select is(pg_temp.leaks(public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111')), '{}', 'prompt_responses');
select is(pg_temp.leaks(public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111', 'f0000000-0000-0000-0000-000000000002')), '{}', 'prompt_responses entered from a hidden response');
select is(pg_temp.leaks(public.get_response('f0000000-0000-0000-0000-000000000001')), '{}', 'get_response (Omar''s, with its counts)');
select is(pg_temp.leaks(public.get_video('f0000000-0000-0000-0000-000000000001')), '{}', 'get_video (Omar''s)');
select is(pg_temp.leaks(public.get_video('f0000000-0000-0000-0000-000000000025')), '{}', 'get_video (Quinn''s visible reply, with its context)');
select is(pg_temp.leaks(public.reply_room('f0000000-0000-0000-0000-000000000001')), '{}', 'reply_room (Omar''s)');
select is(pg_temp.leaks(public.reply_room('f0000000-0000-0000-0000-00000000000a')), '{}', 'reply_room (Lena''s)');
select is(pg_temp.leaks(public.comments_list('f0000000-0000-0000-0000-000000000001')), '{}', 'comments_list (Omar''s)');
select is(pg_temp.leaks(public.comments_list('f0000000-0000-0000-0000-00000000000a')), '{}', 'comments_list (Lena''s)');
select is(pg_temp.leaks(public.get_profile('d4444444-4444-4444-4444-444444444444')), '{}', 'get_profile (Omar''s)');
select is(pg_temp.leaks(public.get_profile()), '{}', 'get_profile (her own)');
select is(pg_temp.leaks(public.profile_responses('d4444444-4444-4444-4444-444444444444')), '{}', 'profile_responses (Omar''s)');
select is(pg_temp.leaks(public.profile_replies('97777777-7777-7777-7777-777777777777')), '{}', 'profile_replies (Quinn''s)');
select is(pg_temp.leaks(public.profile_responses('f6666666-6666-6666-6666-666666666666')), '{}', 'profile_responses (Rafi''s; his only one is removed)');
select is(pg_temp.leaks(public.follow_list('d4444444-4444-4444-4444-444444444444', 'followers')), '{}', 'follow_list, Omar''s followers');
select is(pg_temp.leaks(public.follow_list('d4444444-4444-4444-4444-444444444444', 'following')), '{}', 'follow_list, Omar''s following');
select is(pg_temp.leaks(public.follow_suggestions()), '{}', 'follow_suggestions');
select is(pg_temp.leaks(public.follow_suggestions(array['11111111-aaaa-aaaa-aaaa-111111111111'::uuid, '22222222-aaaa-aaaa-aaaa-222222222222'::uuid])), '{}', 'follow_suggestions from watched prompts');
select is(pg_temp.leaks(public.discover()), '{}', 'discover');
select is(pg_temp.leaks(public.search('vis')), '{}', 'search (people and prompts)');
select is(pg_temp.leaks(public.place_page((select id from public.places where slug = 'canggu'))), '{}', 'place_page');
select is(pg_temp.leaks(public.places_screen()), '{}', 'places_screen');
select is(pg_temp.leaks(public.activity_list()), '{}', 'activity_list');
select is(pg_temp.leaks(public.blocked_list()), '{"vispia"}', 'blocked_list names only the person Lena blocked (Settings, Blocked accounts)');
select is(pg_temp.leaks(public.my_invites()), '{}', 'my_invites');

-- The hidden things themselves.
select is(public.get_profile('b2222222-2222-2222-2222-222222222222'), null, 'Adam (blocked her): no profile');
select is(public.get_profile('e5555555-5555-5555-5555-555555555555'), null, 'Pia (she blocked): no profile');
select is(public.get_profile('c3333333-3333-3333-3333-333333333333'), null, 'Maya (deleted): no profile');
select is(public.get_profile(p_username => 'visadam'), null, 'nor by username');
select is(public.profile_responses('b2222222-2222-2222-2222-222222222222'), '[]'::jsonb, 'Adam''s grid is empty');
select is(public.profile_replies('c3333333-3333-3333-3333-333333333333'), '[]'::jsonb, 'Maya''s replies grid is empty');
select is(public.follow_list('b2222222-2222-2222-2222-222222222222', 'followers'), '[]'::jsonb, 'Adam''s follow list is empty');
select is((public.get_response('f0000000-0000-0000-0000-000000000002'))->>'status', 'unavailable', 'Adam''s response is unavailable');
select is((public.get_video('f0000000-0000-0000-0000-000000000003'))->>'status', 'unavailable', 'Pia''s response is unavailable');
select is((public.get_video('f0000000-0000-0000-0000-000000000004'))->>'status', 'unavailable', 'Maya''s response is unavailable');
select is((public.get_video('f0000000-0000-0000-0000-000000000005'))->>'status', 'unavailable', 'Rafi''s removed response is unavailable');
select is((public.get_video('f0000000-0000-0000-0000-000000000027'))->>'status', 'unavailable', 'Quinn''s reported reply is unavailable');
select throws_ok($$ select public.comments_list('f0000000-0000-0000-0000-000000000002') $$, 'P0001', 'response_not_found', 'Adam''s response has no comment sheet for her');
select throws_ok($$ select public.follow_user('b2222222-2222-2222-2222-222222222222') $$, 'P0001', 'not_available', 'she cannot follow Adam');
select throws_ok($$ select public.like_video('f0000000-0000-0000-0000-000000000004') $$, 'P0001', 'video_not_found', 'nor like Maya''s response');
select throws_ok($$ select public.post_comment('f0000000-0000-0000-0000-000000000003', 'hi', null) $$, 'P0001', 'response_not_found', 'nor comment on Pia''s');

-- Counts are what she can open (DECISIONS 8 Oct), and the controls are really there.
select is(jsonb_array_length((public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111'))->'responses'), 2, 'the player has Lena''s and Omar''s responses');
select is((select array_agg(f->>'username' order by f->>'username') from jsonb_array_elements((public.get_prompt('11111111-aaaa-aaaa-aaaa-111111111111'))->'faces') f), array['vislena', 'visomar'], 'the face strip shows only them');
select is((select array_agg(f->>'username' order by f->>'username') from jsonb_array_elements((public.get_prompt('22222222-aaaa-aaaa-aaaa-222222222222'))->'faces') f), array['visomar'], 'on the Canggu prompt only Omar');
select is((public.get_response('f0000000-0000-0000-0000-000000000001'))->>'reply_count', '1', 'Omar''s response: one video reply she can open (Quinn''s)');
select is((public.get_response('f0000000-0000-0000-0000-000000000001'))->>'comment_count', '1', 'and one comment (Omar''s own)');
select is((public.reply_room('f0000000-0000-0000-0000-00000000000a'))->>'count', '0', 'Lena''s room: Quinn''s reported reply and Pia''s are not counted');
select is((public.comments_list('f0000000-0000-0000-0000-00000000000a'))->>'count', '1', 'Lena''s comments: only Omar''s is counted');
-- Follower counts are the same for every viewer, like response counts (a viewer's own blocks do
-- not change public counts, 20261008000100), but no longer count accounts in their deletion window.
select is((public.get_profile('d4444444-4444-4444-4444-444444444444'))->>'follower_count', '3', 'Omar''s follower count: Lena, Quinn and Adam, not Maya (deletion window)');
select is((public.get_profile('d4444444-4444-4444-4444-444444444444'))->>'following_count', '0', 'Omar follows only Maya, who is in her deletion window');
select is(jsonb_array_length(public.follow_list('d4444444-4444-4444-4444-444444444444', 'followers')), 2, 'the followers list Lena opens: Lena and Quinn (Adam is hidden from her)');

-- Activity: rows about hidden people are gone, and the badge agrees with the list.
select is((public.activity_list())->>'unread_count', '4', 'activity_list: four unread rows from people she can see');
select is(public.activity_unread_count(), 4, 'the tab badge counts the same four');
select is((select r->'video'->>'status' from jsonb_array_elements((public.activity_list())->'rows') r where r->>'kind' = 'followed_responded'), 'unavailable', 'Rafi''s row stays, his removed response does not play');
select is((select r->'video'->>'playback_id' from jsonb_array_elements((public.activity_list())->'rows') r where r->>'kind' = 'video_reply'), null, 'Quinn''s reported reply shows no video');
reset role;
-- Row by row (the list groups comment rows by video).
select is((select public.activity_row(a, 'a1111111-1111-1111-1111-111111111111')->'comment' from public.activity a where a.kind = 'comment' and a.actor_id = '97777777-7777-7777-7777-777777777777'),
          '{"id": "c0000000-0000-0000-0000-000000000012", "body": null, "deleted": true}'::jsonb, 'Quinn''s reported comment shows no text');
select is((select public.activity_row(a, 'a1111111-1111-1111-1111-111111111111')->'comment'->>'body' from public.activity a where a.kind = 'comment' and a.actor_id = 'd4444444-4444-4444-4444-444444444444'), 'Omar on Lena''s', 'Omar''s comment does');
select is((select public.activity_row(a, 'a1111111-1111-1111-1111-111111111111')->'video'->>'caption' from public.activity a where a.kind = 'video_reply' and a.actor_id = '97777777-7777-7777-7777-777777777777'), null, 'nor the reported reply''s caption');
select is((select public.activity_row(a, '97777777-7777-7777-7777-777777777777')->'video'->>'playback_id' from public.activity a where a.kind = 'video_reply' and a.actor_id = '97777777-7777-7777-7777-777777777777'), 'pbQuinnR', 'Quinn''s own reply is always shown to Quinn');

-- Adam's Omar-follow is counted for everyone else: blocks hide people from each other only.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"97777777-7777-7777-7777-777777777777","role":"authenticated"}', true);
select is((public.get_profile('d4444444-4444-4444-4444-444444444444'))->>'follower_count', '3', 'Quinn sees three followers of Omar: Lena, Quinn and Adam (not Maya)');
select is((select array_agg(f->>'username' order by f->>'username') from jsonb_array_elements((public.get_prompt('11111111-aaaa-aaaa-aaaa-111111111111'))->'faces') f), array['visadam', 'visomar', 'vispia'], 'and the three newest faces she can watch: Pia, Adam, Omar (no block between them; Maya is in her window)');
reset role;

-- ===========================================================================
-- The web player (no viewer): blocks do not apply (SPEC.md Section 16); deletion and removal do.
-- ===========================================================================
select is((public.web_video('f0000000-0000-0000-0000-000000000004'))->>'status', 'unavailable', 'web: Maya''s response is unavailable');
select is((public.web_video('f0000000-0000-0000-0000-000000000005'))->>'status', 'unavailable', 'web: Rafi''s removed response is unavailable');
select is((public.web_video('f0000000-0000-0000-0000-000000000002'))->>'status', 'live', 'web: Adam''s response is public');
select is((select count(*)::int from jsonb_array_elements((public.web_video('f0000000-0000-0000-0000-000000000001'))->'replies') x where x->'author'->>'username' = 'vismaya'), 0, 'web: Maya''s reply is not in the room');
select is(position('vismaya' in (public.web_prompt('11111111-aaaa-aaaa-aaaa-111111111111'))::text), 0, 'web: Maya appears nowhere on the prompt page');

-- ===========================================================================
-- A suspended viewer gets nothing from any product path (DECISIONS 8 Oct): pre_request refuses
-- every RPC a member can call except the five the suspended experience needs.
-- ===========================================================================
update public.accounts set moderation_status = 'suspended' where id = 'a1111111-1111-1111-1111-111111111111';
create function pg_temp.gate(p_path text) returns text language plpgsql as $$
begin
  perform set_config('request.path', p_path, true);
  perform public.pre_request();
  return 'allowed';
exception when others then
  return sqlerrm;
end;
$$;
grant execute on function pg_temp.gate(text) to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')
      and pg_temp.gate('/rpc/' || p.proname) = 'allowed'),
  array['delete_account', 'get_onboarding_state', 'remove_push_token', 'request_review', 'set_timezone'],
  'suspended: of every RPC a member can call, only these five pass pre_request');
select is(pg_temp.gate('/profiles'), 'suspended', 'suspended: direct table reads are refused too');
select throws_ok($$ select public.home_feed() $$, 'P0001', 'suspended', 'and the read functions refuse even without PostgREST in front');
reset role;

select * from finish();
rollback;
