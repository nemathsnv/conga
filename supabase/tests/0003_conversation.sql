-- pgTAP tests for phase 4: video replies, comments, likes, Activity, notification
-- preferences, the ask state, the push outbox.
begin;
select plan(99);

delete from public.responses;
delete from public.prompts;

-- Fixture lookup by upload id, read as the table owner: members can no longer read other people's
-- responses straight from the table (20261011000100), and these tests look fixtures up while
-- acting as someone else. Rolled back with the transaction.
create function pg_temp.response_id(p_upload text) returns uuid language sql stable security definer set search_path = '' as $$ select id from public.responses where mux_upload_id = p_upload $$;
grant execute on function pg_temp.response_id(text) to authenticated;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now()),
  ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now()
 where id in ('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333333');
update public.accounts set age_confirmed_at = now() where id = 'a1111111-1111-1111-1111-111111111111';
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam'),
  ('c3333333-3333-3333-3333-333333333333', 'Maya Lindqvist', 'testmaya');
-- Upload URLs minted for the posts below (security stage 2: posting claims a ledger upload).
insert into public.video_uploads (account_id, upload_id, status) values
  ('a1111111-1111-1111-1111-111111111111', 'up-lena-r1', 'active'),
  ('c3333333-3333-3333-3333-333333333333', 'up-maya-r1', 'active');

select public.team_create_prompt('Be honest about the place you live.', null, (now() at time zone 'utc')::date);
select public.team_create_prompt('Speak in every language you know.');

-- Adam has a live response; everything below happens in its room.
insert into public.responses (id, prompt_id, author_id, caption, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at)
select 'd4444444-4444-4444-4444-444444444444', id, 'b2222222-2222-2222-2222-222222222222', 'Walk the rice fields at 7am.', 12000, 'live', 'up-adam', 'as-adam', 'pb-adam', now() - interval '2 hours'
  from public.prompts where text like 'Be honest%';

-- ---------------------------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.comments), 0, 'anon reads no comments');
select throws_ok($$ select public.reply_room('d4444444-4444-4444-4444-444444444444') $$, '42501', null, 'anon cannot open a reply room');
reset role;

-- ---------------------------------------------------------------------------
-- Lena: video replies
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((public.reply_room('d4444444-4444-4444-4444-444444444444'))->>'count', '0', 'an empty room has no replies');
select is((public.reply_room('d4444444-4444-4444-4444-444444444444'))->'root'->'author'->>'username', 'testadam', 'the room carries its root response');
select throws_ok($$ select public.post_reply('d4444444-4444-4444-4444-444444444444', 'up-lena-r1', null, 5000) $$, 'P0001', 'disclosure_required', 'the disclosure gates the first video reply too');
select lives_ok($$ select public.acknowledge_disclosure() $$, 'Lena acknowledges the disclosure');
select throws_ok($$ select public.post_reply('d4444444-4444-4444-4444-444444444444', 'up-lena-r1', null, 40000) $$, 'P0001', 'invalid_duration', 'replies keep the 30-second limit');
select is((public.post_reply('d4444444-4444-4444-4444-444444444444', 'up-lena-r1', '7am is my whole personality now.', 19000))->>'kind', 'reply', 'post_reply creates a reply');
select is((select status from public.responses where mux_upload_id = 'up-lena-r1'), 'processing', 'a new reply is processing until Mux reports it ready');
select is((public.reply_room('d4444444-4444-4444-4444-444444444444'))->>'count', '0', 'a processing reply is not in the room yet');
select throws_ok($$ select public.mark_response_live('up-lena-r1', 'as-lena-r1', 'pb-lena-r1', 19000) $$, '42501', null, 'members cannot mark videos live');
reset role;

select is((public.mark_response_live('up-lena-r1', 'as-lena-r1', 'pb-lena-r1', 19000))->>'status', 'live', 'the reply goes live through the same path as a response');
select is((select count(*)::int from public.activity where recipient_id = 'b2222222-2222-2222-2222-222222222222' and kind = 'video_reply' and actor_id = 'a1111111-1111-1111-1111-111111111111'), 1, 'Adam gets a video_reply activity row');
select is((select count(*)::int from public.push_outbox where recipient_id = 'b2222222-2222-2222-2222-222222222222' and kind = 'video_reply'), 1, 'a video reply is queued for push (on by default)');
select is((select public.push_text(o) from public.push_outbox o where kind = 'video_reply'), 'Lena Hart replied to your response with a video', 'the push text matches the spec example');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((public.reply_room('d4444444-4444-4444-4444-444444444444'))->>'count', '1', 'the live reply is in the room');
select is((public.reply_room('d4444444-4444-4444-4444-444444444444'))->'replies'->0->'author'->>'username', 'testlena', 'room lists the reply');
select is((public.get_video(pg_temp.response_id('up-lena-r1')))->'context'->>'reply_to_is_root', 'true', 'a reply to the root says so');
select is((public.get_profile('a1111111-1111-1111-1111-111111111111'))->>'reply_count', '1', 'profile counts replies');
select is(jsonb_array_length(public.profile_responses('a1111111-1111-1111-1111-111111111111')), 0, 'replies are not in the Responses grid');
select is(jsonb_array_length(public.profile_replies('a1111111-1111-1111-1111-111111111111')), 1, 'replies are in the Replies grid');
select is((public.get_prompt((select id from public.prompts where text like 'Be honest%')))->>'response_count', '1', 'replies do not count as responses to the prompt');
select is(jsonb_array_length((public.prompt_responses((select id from public.prompts where text like 'Be honest%')))->'responses'), 1, 'the player shows responses only');
reset role;

-- Maya replies to Lena's reply: flat room, "Replying to Lena".
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is((public.post_reply(pg_temp.response_id('up-lena-r1'), 'up-maya-r1', null, 8000))->>'root_response_id', 'd4444444-4444-4444-4444-444444444444', 'a reply to a reply stays in the root''s room');
reset role;
select public.mark_response_live('up-maya-r1', 'as-maya-r1', 'pb-maya-r1', 8000);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((public.reply_room('d4444444-4444-4444-4444-444444444444'))->>'count', '2', 'two replies in the room');
-- Found by author, not position: both replies are made in this one transaction, so they have the
-- same created_at and their order in the room was a tie that changed between runs.
select is((select r->>'reply_to_name' from jsonb_array_elements((public.reply_room('d4444444-4444-4444-4444-444444444444'))->'replies') r where r->'author'->>'username' = 'testmaya'), 'Lena Hart', 'a reply to a reply carries "Replying to Lena"');
select is((select r->>'reply_to_name' from jsonb_array_elements((public.reply_room('d4444444-4444-4444-4444-444444444444'))->'replies') r where r->'author'->>'username' = 'testlena'), null, 'a reply to the root carries no "Replying to"');
select is((public.get_video(pg_temp.response_id('up-maya-r1')))->'context'->'root'->'author'->>'username', 'testadam', 'a reply to a reply knows its root ("In replies to Adam Novak")');
select is((select count(*)::int from public.activity where recipient_id = 'a1111111-1111-1111-1111-111111111111' and kind = 'video_reply'), 1, 'Lena gets the video_reply row for Maya''s reply');
reset role;
select is((select public.push_text(o) from public.push_outbox o where kind = 'video_reply' and recipient_id = 'a1111111-1111-1111-1111-111111111111'), 'Maya Lindqvist replied to your reply with a video', 'push text for a reply to a reply');

-- ---------------------------------------------------------------------------
-- Comments
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select throws_ok($$ select public.post_comment('d4444444-4444-4444-4444-444444444444', repeat('x', 301)) $$, 'P0001', 'invalid_comment', 'comments stop at 300 characters');
select throws_ok($$ select public.post_comment(pg_temp.response_id('up-lena-r1'), 'hi') $$, 'P0001', 'response_not_found', 'video replies have no comments');
select is((public.post_comment('d4444444-4444-4444-4444-444444444444', '  Pererenan at sunrise, yes.  '))->>'body', 'Pererenan at sunrise, yes.', 'post_comment trims and returns the card');
select is((public.post_comment('d4444444-4444-4444-4444-444444444444', 'The rice fields are disappearing though.'))->>'is_author', 'false', 'a commenter is not the Author');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((public.post_comment('d4444444-4444-4444-4444-444444444444', 'Bring a jacket.', (select id from public.comments where body like 'Pererenan%')))->>'is_author', 'true', 'the response author gets the Author tag');
reset role;
select is((select count(*)::int from public.activity where recipient_id = 'b2222222-2222-2222-2222-222222222222' and kind = 'comment'), 2, 'Adam has one comment row per comment on his response');
select is((select count(*)::int from public.push_outbox where recipient_id = 'b2222222-2222-2222-2222-222222222222' and kind = 'comment' and sent_at is null), 1, 'comments on one response share one pending push');
select is((select count(*)::int from public.activity where recipient_id = 'a1111111-1111-1111-1111-111111111111' and kind = 'comment_reply'), 1, 'Lena gets a comment_reply row');
select is((select public.push_text(o) from public.push_outbox o where kind = 'comment' and recipient_id = 'b2222222-2222-2222-2222-222222222222'), 'Lena Hart commented on your response', 'one commenter: their full name');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is((public.post_comment('d4444444-4444-4444-4444-444444444444', 'Colder than you think at 6.', (select id from public.comments where body = 'Bring a jacket.')))->>'thread_id',
          (select id::text from public.comments where body like 'Pererenan%'), 'a reply to a reply joins the same thread');
select is((public.comments_list('d4444444-4444-4444-4444-444444444444'))->>'count', '4', 'comments_list counts every live comment');
select is(jsonb_array_length((public.comments_list('d4444444-4444-4444-4444-444444444444'))->'comments'), 2, 'two top-level comments');
select is(jsonb_array_length((public.comments_list('d4444444-4444-4444-4444-444444444444'))->'comments'->0->'replies'), 2, 'the thread holds both replies');
select is((public.comments_list('d4444444-4444-4444-4444-444444444444'))->'video_replies'->>'count', '2', 'the sheet carries the reply-room card');
reset role;
select is((select count(*)::int from public.activity where recipient_id = 'b2222222-2222-2222-2222-222222222222' and kind = 'comment_reply'), 1, 'Adam gets a comment_reply row for the reply to his comment');
select is((select count(*)::int from public.activity where recipient_id = 'b2222222-2222-2222-2222-222222222222' and kind = 'comment'), 2, 'a reply to the author''s own comment is not a comment on his response twice over');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select throws_ok($$ select public.delete_comment((select id from public.comments where body like 'Pererenan%')) $$, 'P0001', 'comment_not_found', 'you cannot delete someone else''s comment');
select throws_ok($$ select public.like_comment('00000000-0000-0000-0000-000000000000') $$, 'P0001', 'comment_not_found', 'liking a missing comment fails');
select lives_ok($$ select public.like_comment((select id from public.comments where body like 'Pererenan%')) $$, 'like a comment');
select is((public.comments_list('d4444444-4444-4444-4444-444444444444'))->'comments'->0->>'liked', 'true', 'a liked comment shows liked, with no count');
select is((select count(*)::int from public.activity where kind = 'like'), 0, 'comment likes make no Activity rows');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$ select public.delete_comment((select id from public.comments where body like 'Pererenan%')) $$, 'you can delete your own comment');
select is((public.comments_list('d4444444-4444-4444-4444-444444444444'))->>'count', '3', 'deleting a top-level comment leaves other people''s replies counted');
select is(jsonb_array_length((public.comments_list('d4444444-4444-4444-4444-444444444444'))->'comments'), 2, 'the deleted parent keeps its place while it has replies');
-- (every comment in this transaction shares one created_at, so the row is found by flag, not position)
select is((select count(*)::int from jsonb_array_elements((public.comments_list('d4444444-4444-4444-4444-444444444444'))->'comments') x where x->>'deleted' = 'true'), 1, 'the parent is a deleted-parent row');
select is((select x->'body' from jsonb_array_elements((public.comments_list('d4444444-4444-4444-4444-444444444444'))->'comments') x where x->>'deleted' = 'true'), 'null'::jsonb, 'a deleted parent shows no text');
select is((select jsonb_array_length(x->'replies') from jsonb_array_elements((public.comments_list('d4444444-4444-4444-4444-444444444444'))->'comments') x where x->>'deleted' = 'true'), 2, 'its replies stay under it');
select throws_ok($$ select public.delete_comment((select id from public.comments where body like 'Pererenan%')) $$, 'P0001', 'comment_not_found', 'a deleted comment cannot be deleted again (no undo, no second confirmation)');
reset role;
select is((select public.push_text(o) from public.push_outbox o where kind = 'comment' and recipient_id = 'b2222222-2222-2222-2222-222222222222'), 'Lena Hart commented on your response', 'a reply to the author''s own comment is not a second commenter');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- ---------------------------------------------------------------------------
-- Likes on videos
select is(public.like_video('d4444444-4444-4444-4444-444444444444'), 1, 'like_video returns the count');
select is(public.like_video('d4444444-4444-4444-4444-444444444444'), 1, 'liking twice counts once');
select is((public.get_video('d4444444-4444-4444-4444-444444444444'))->>'liked', 'true', 'the card shows liked');
select is((select count(*)::int from public.push_outbox where kind = 'like'), 0, 'likes are not pushed by default');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is(public.like_video('d4444444-4444-4444-4444-444444444444'), 2, 'a second person likes');
reset role;
select is((select count(*)::int from public.activity where recipient_id = 'b2222222-2222-2222-2222-222222222222' and kind = 'like'), 1, 'likes on one video collapse into one Activity row');

-- ---------------------------------------------------------------------------
-- Activity for Adam: everything is New, then This week after reading.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select ok((public.activity_list())->>'unread_count' > '0', 'Adam has unread activity');
select is((select jsonb_agg(distinct r->>'section') from jsonb_array_elements((public.activity_list())->'rows') r), '["new"]'::jsonb, 'unread rows are in New');
select is((select r->>'actor_count' from jsonb_array_elements((public.activity_list())->'rows') r where r->>'kind' = 'like'), '2', 'the likes line counts the likers');
select is((select jsonb_array_length(r->'actors') from jsonb_array_elements((public.activity_list())->'rows') r where r->>'kind' = 'comment'), 1, 'grouped comment row names its commenter');
select lives_ok($$ select public.mark_activity_read() $$, 'mark_activity_read');
select is((public.activity_list())->>'unread_count', '0', 'nothing unread after reading');
select is((select jsonb_agg(distinct r->>'section') from jsonb_array_elements((public.activity_list())->'rows') r), '["week"]'::jsonb, 'read rows move to This week');

-- Notification preferences and the ask
select is((public.get_notification_state())->>'ask', 'never', 'the ask starts at never');
select is((public.get_notification_state())->'prefs'->>'likes', 'false', 'likes are off by default');
select is((public.update_notification_prefs('{"pause_all": true}'))->'prefs'->>'pause_all', 'true', 'Pause all can be turned on');
select lives_ok($$ select public.set_notification_ask('declined') $$, 'Not now once');
select is((public.get_notification_state())->>'ask', 'declined_once', 'declined once');
select is((public.get_notification_state())->>'ask_due', 'false', 'no second ask due yet');
reset role;
-- Lena comments on Adam's response: the first reply or comment after Not now makes the second ask due.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$ select public.post_comment('d4444444-4444-4444-4444-444444444444', 'One more.') $$, 'a comment arrives for Adam');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((public.get_notification_state())->>'ask_due', 'true', 'the second ask is due');
select lives_ok($$ select public.set_notification_ask('declined') $$, 'Not now twice');
select is((public.get_notification_state())->>'ask', 'declined_twice', 'declined twice: Settings only from here');
select is((public.get_notification_state())->>'ask_due', 'false', 'answering clears the due ask');
select throws_ok($$ select public.set_timezone('Mars/Olympus') $$, 'P0001', 'invalid_timezone', 'timezone must be a real zone');
select throws_ok($$ select public.register_push_token('tok', 'web') $$, 'P0001', 'invalid_token', 'push tokens are ios or android');
select throws_ok($$ select public.push_due() $$, '42501', null, 'members cannot read the outbox');
reset role;

-- Pause all: a follow creates Activity but no push.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$ select public.follow_user('b2222222-2222-2222-2222-222222222222') $$, 'Lena follows Adam');
reset role;
select is((select count(*)::int from public.activity where recipient_id = 'b2222222-2222-2222-2222-222222222222' and kind = 'follow'), 1, 'a follow makes an Activity row');
select is((select count(*)::int from public.push_outbox where recipient_id = 'b2222222-2222-2222-2222-222222222222' and kind = 'follow'), 0, 'Pause all stops the push');

-- "People you follow respond": Adam responds to another prompt, Lena gets the row.
insert into public.responses (prompt_id, author_id, duration_ms, status, mux_upload_id)
select id, 'b2222222-2222-2222-2222-222222222222', 9000, 'processing', 'up-adam-2' from public.prompts where text like 'Speak%';
select public.mark_response_live('up-adam-2', 'as-adam-2', 'pb-adam-2', 9000);
select is((select count(*)::int from public.activity where recipient_id = 'a1111111-1111-1111-1111-111111111111' and kind = 'followed_responded'), 1, 'followers get a followed_responded row');
select is((select count(*)::int from public.push_outbox where recipient_id = 'a1111111-1111-1111-1111-111111111111' and kind = 'followed_responded'), 0, 'people-you-follow pushes are off by default');

-- Tonight's prompt: queued once per local day for accounts with a token, after 18:30 locally.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select lives_ok($$ select public.register_push_token('ExponentPushToken[test]', 'ios') $$, 'register a push token');
select lives_ok($$ select public.set_timezone((select name from pg_catalog.pg_timezone_names where (now() at time zone name)::time >= time '18:30' and name not like 'posix/%' and name not like 'Etc/%' order by name limit 1)) $$, 'set a timezone where it is evening now');
reset role;
update public.prompts set featured_on = (now() at time zone (select timezone from public.accounts where id = 'c3333333-3333-3333-3333-333333333333'))::date where text like 'Be honest%';
select is(public.queue_tonight_prompt(), 1, 'tonight''s prompt is queued for Maya');
select is(public.queue_tonight_prompt(), 0, 'and only once');
select is((select public.push_text(o) from public.push_outbox o where kind = 'tonight_prompt'), 'Tonight: Be honest about the place you live.', 'tonight''s prompt text');
select is((select jsonb_array_length(x->'tokens') from jsonb_array_elements(public.push_due()) x where x->>'kind' = 'tonight_prompt'), 1, 'push_due carries the tokens');
select lives_ok($$ select public.push_mark((select id from public.push_outbox where kind = 'tonight_prompt'), true) $$, 'push_mark');
select is((select sent_at is not null from public.push_outbox where kind = 'tonight_prompt'), true, 'a sent row is marked');

select * from finish();
rollback;
