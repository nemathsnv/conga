-- pgTAP tests for phase 5: reports, blocks, deleting videos and accounts, the enforcement ladder,
-- notices and review requests, moderator functions, the web read functions.
begin;
select plan(94);

delete from public.reports;
delete from public.review_requests;
delete from public.moderation_actions;
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
-- Fixed ids so the anon web tests can name the prompts (anon cannot read prompts directly).
insert into public.prompts (id, text, status, published_at, featured_on) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Be honest about the place you live.', 'live', now(), (now() at time zone 'utc')::date),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'Speak in every language you know.', 'live', now(), null);

insert into public.responses (id, prompt_id, author_id, caption, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at)
select 'd4444444-4444-4444-4444-444444444444', id, 'b2222222-2222-2222-2222-222222222222', 'Walk the rice fields.', 12000, 'live', 'up-adam', 'as-adam', 'pb-adam', now() - interval '2 hours' from public.prompts where text like 'Be honest%';
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at)
select 'd5555555-5555-5555-5555-555555555555', id, 'c3333333-3333-3333-3333-333333333333', 8000, 'live', 'up-maya', 'as-maya', 'pb-maya', now() - interval '1 hour' from public.prompts where text like 'Be honest%';
-- Lena's reply in Adam's room, and a comment.
insert into public.responses (id, kind, prompt_id, root_response_id, reply_to_id, author_id, caption, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at)
select 'e6666666-6666-6666-6666-666666666666', 'reply', id, 'd4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111', '7am.', 5000, 'live', 'up-lena-r', 'as-lena-r', 'pb-lena-r', now() - interval '30 minutes' from public.prompts where text like 'Be honest%';
insert into public.comments (id, response_id, author_id, body) values ('f7777777-7777-7777-7777-777777777777', 'd4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111', 'Nobody believes me.');
insert into public.follows (follower_id, followee_id) values
  ('a1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222'),
  ('b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------------
-- Web: anyone can watch, nothing else.
set local role anon;
select is((public.web_video('d4444444-4444-4444-4444-444444444444'))->>'status', 'live', 'the web player reads a live response without an account');
select is((public.web_video('d4444444-4444-4444-4444-444444444444'))->'video'->'author'->>'username', 'testadam', 'with its author');
select is(jsonb_array_length((public.web_video('d4444444-4444-4444-4444-444444444444'))->'replies'), 1, 'and its video replies (no comments)');
select is((public.web_prompt('22222222-aaaa-aaaa-aaaa-222222222222'))->>'status', 'empty', 'a prompt with no responses is the web empty state');
select throws_ok($$ select public.report_item('video', 'd4444444-4444-4444-4444-444444444444', 'spam') $$, '42501', null, 'anon cannot report');
select throws_ok($$ select public.mod_remove_video('d4444444-4444-4444-4444-444444444444', 'x', 'nemat') $$, '42501', null, 'anon cannot moderate');
reset role;

-- The API gate lets a normal account through.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select set_config('request.path', '/rpc/home_feed', true);
select lives_ok($$ select public.pre_request() $$, 'the gate lets a normal account through');
select set_config('request.path', '', true);
reset role;

-- ---------------------------------------------------------------------------
-- Report: anonymous, and what you reported is gone for you.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select throws_ok($$ select public.report_item('video', 'd5555555-5555-5555-5555-555555555555', 'spam') $$, 'P0001', 'cannot_report_self', 'you cannot report your own video');
select throws_ok($$ select public.report_item('video', 'd4444444-4444-4444-4444-444444444444', 'because') $$, '23514', null, 'the reason must be one of the nine');
select is((public.report_item('video', 'd4444444-4444-4444-4444-444444444444', 'harassment'))->>'username', 'testadam', 'report_item returns the author for the Block offer');
select is(jsonb_array_length((public.prompt_responses((select id from public.prompts where text like 'Be honest%')))->'responses'), 1, 'the reported response is gone from the reporter''s player');
select is((public.prompt_responses((select id from public.prompts where text like 'Be honest%'), 'd4444444-4444-4444-4444-444444444444'))->>'entry_status', 'unavailable', 'and unavailable as an entry');
select is((public.get_video('d4444444-4444-4444-4444-444444444444'))->>'status', 'unavailable', 'get_video says unavailable, never why');
select throws_ok($$ select public.mod_reports_queue() $$, '42501', null, 'members cannot read the reports queue');
reset role;
select is((select count(*)::int from public.reports where status = 'open'), 1, 'the report is in the queue');
select is((public.mod_reports_queue())->0->>'reason', 'harassment', 'the queue shows the reason');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(jsonb_array_length((public.prompt_responses((select id from public.prompts where text like 'Be honest%')))->'responses'), 2, 'other people still see it');

-- ---------------------------------------------------------------------------
-- Block: silent, both ways, follows removed.
select lives_ok($$ select public.block_user('b2222222-2222-2222-2222-222222222222') $$, 'Lena blocks Adam');
select is((select count(*)::int from public.follows where follower_id in ('a1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222')), 0, 'follows are removed both ways');
select is(public.get_profile('b2222222-2222-2222-2222-222222222222'), null, 'Lena no longer sees Adam''s profile');
select is(jsonb_array_length((public.prompt_responses((select id from public.prompts where text like 'Be honest%')))->'responses'), 1, 'nor his response');
select is(jsonb_array_length(public.blocked_list()), 1, 'Blocked accounts lists him');
select throws_ok($$ select public.follow_user('b2222222-2222-2222-2222-222222222222') $$, 'P0001', 'not_available', 'and cannot follow him');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(public.get_profile('a1111111-1111-1111-1111-111111111111'), null, 'Adam does not see Lena either');
select is((public.reply_room('d4444444-4444-4444-4444-444444444444'))->>'count', '0', 'Lena''s reply is gone from his room');
select is((public.comments_list('d4444444-4444-4444-4444-444444444444'))->>'count', '0', 'and her comment from his comments');
select throws_ok($$ select public.post_comment('d5555555-5555-5555-5555-555555555555', 'x', 'f7777777-7777-7777-7777-777777777777') $$, 'P0001', 'invalid_parent', 'he cannot reply under her comment on another response either');
select throws_ok($$ select public.follow_user('a1111111-1111-1111-1111-111111111111') $$, 'P0001', 'not_available', 'he cannot follow her');
select is((public.get_profile('c3333333-3333-3333-3333-333333333333'))->>'blocked', 'false', 'profile cards carry whether you blocked them');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$ select public.unblock_user('b2222222-2222-2222-2222-222222222222') $$, 'unblock');
select isnt(public.get_profile('b2222222-2222-2222-2222-222222222222'), null, 'after unblocking the profile is back');

-- ---------------------------------------------------------------------------
-- Delete your own video: comments go with a response, replies stay (A-Orphan).
select throws_ok($$ select public.delete_video('d4444444-4444-4444-4444-444444444444') $$, 'P0001', 'video_not_found', 'you cannot delete someone else''s video');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select lives_ok($$ select public.delete_video('d4444444-4444-4444-4444-444444444444') $$, 'Adam deletes his response');
reset role;
select is((select status from public.responses where id = 'd4444444-4444-4444-4444-444444444444'), 'deleted', 'status deleted');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((public.get_video('e6666666-6666-6666-6666-666666666666'))->'context'->>'root_deleted', 'true', 'her reply now says the original response was deleted');
select is((public.get_video('e6666666-6666-6666-6666-666666666666'))->'context'->>'prompt_text', 'Be honest about the place you live.', 'with the prompt');
select throws_ok($$ select public.comments_list('d4444444-4444-4444-4444-444444444444') $$, 'P0001', 'response_not_found', 'its comments are gone with it');
select is(jsonb_array_length(public.profile_replies('a1111111-1111-1111-1111-111111111111')), 1, 'the reply stays on her profile');
reset role;

-- ---------------------------------------------------------------------------
-- Enforcement: remove with a notice, request a review, decide it; restrict; suspend; restore.
select throws_ok($$ select public.mod_remove_video('d5555555-5555-5555-5555-555555555555', '', 'nemat') $$, 'P0001', 'reason_required', 'every action needs a reason');
select lives_ok($$ select public.mod_remove_video('d5555555-5555-5555-5555-555555555555', 'It shared someone else''s private information.', 'nemat', 'report 1') $$, 'remove Maya''s response');
select is((select status from public.responses where id = 'd5555555-5555-5555-5555-555555555555'), 'removed', 'the response is removed');
select is((select count(*)::int from public.moderation_actions where account_id = 'c3333333-3333-3333-3333-333333333333' and kind = 'remove'), 1, 'the action is logged');
select is((select count(*)::int from public.activity where recipient_id = 'c3333333-3333-3333-3333-333333333333' and kind = 'removed'), 1, 'Maya gets the notice in Activity');
select is((select public.push_text(o) from public.push_outbox o where kind = 'removed'), 'We removed one of your responses', 'and the push, pref or not');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is((public.get_notice((select id from public.moderation_actions where kind = 'remove')))->>'reason', 'It shared someone else''s private information.', 'A-Removed shows the reason');
select is((public.get_notice((select id from public.moderation_actions where kind = 'remove')))->'video'->>'playback_id', 'pb-maya', 'and the removed item');
select is((public.get_video('d5555555-5555-5555-5555-555555555555'))->>'status', 'unavailable', 'nobody can watch it any more');
select lives_ok($$ select public.request_review((select id from public.moderation_actions where kind = 'remove')) $$, 'Request a review');
select throws_ok($$ select public.request_review((select id from public.moderation_actions where kind = 'remove')) $$, 'P0001', 'already_requested', 'one review per decision');
select is((public.get_notice((select id from public.moderation_actions where kind = 'remove')))->>'review_requested', 'true', 'the notice shows Review requested');
reset role;
select is(jsonb_array_length(public.mod_review_queue()), 1, 'the review is in the queue');
select lives_ok($$ select public.mod_decide_review((select id from public.moderation_actions where kind = 'remove'), 'reversed', 'nemat', 'fair point') $$, 'decide: reversed');
select is((select status from public.responses where id = 'd5555555-5555-5555-5555-555555555555'), 'live', 'a reversed removal restores the video');
select is((select count(*)::int from public.activity where recipient_id = 'c3333333-3333-3333-3333-333333333333' and kind = 'review_outcome'), 1, 'the outcome is a notification');
select is((select public.push_text(o) from public.push_outbox o where kind = 'review_outcome'), 'We reviewed your request and reversed the decision.', 'with the decided text');
select is(jsonb_array_length(public.mod_review_queue()), 0, 'the queue is empty again');

select lives_ok($$ select public.mod_restrict('c3333333-3333-3333-3333-333333333333', now() + interval '5 days', 'Two of your responses were removed for harassment.', 'nemat') $$, 'restrict Maya');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select throws_ok($$ select public.post_comment('d5555555-5555-5555-5555-555555555555', 'hi') $$, 'P0001', 'posting_paused', 'a restricted account cannot comment');
select throws_ok($$ select public.post_response((select id from public.prompts where text like 'Speak%'), 'up-x', null, 5000) $$, 'P0001', 'posting_paused', 'nor respond');
select is(jsonb_array_length((public.prompt_responses((select id from public.prompts where text like 'Be honest%')))->'responses'), 1, 'but can still watch');
select is((public.get_onboarding_state())->>'suspended', 'false', 'restricted is not suspended');
reset role;
select is((select public.push_text(o) from public.push_outbox o where kind = 'restricted'), 'Posting is paused until ' || to_char(now() + interval '5 days', 'FMDD Month'), 'restriction push text');

select lives_ok($$ select public.mod_suspend('c3333333-3333-3333-3333-333333333333', 'Repeated harassment in responses and comments.', 'nemat') $$, 'suspend Maya');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is((public.get_onboarding_state())->>'suspended', 'true', 'sign-in state says suspended');
select is((public.get_onboarding_state())->'suspension'->>'reason', 'Repeated harassment in responses and comments.', 'with the reason');
select throws_ok($$ select public.post_comment('d5555555-5555-5555-5555-555555555555', 'hi') $$, 'P0001', 'suspended', 'a suspended account cannot post');
-- The API gate: every PostgREST request is refused except the suspended experience's own paths.
select set_config('request.path', '/rpc/home_feed', true);
select throws_ok($$ select public.pre_request() $$, 'P0001', 'suspended', 'the gate refuses the feed');
select set_config('request.path', '/responses', true);
select throws_ok($$ select public.pre_request() $$, 'P0001', 'suspended', 'and direct table reads');
select set_config('request.path', '/rpc/get_onboarding_state', true);
select lives_ok($$ select public.pre_request() $$, 'but lets the sign-in state through');
select set_config('request.path', '/rpc/request_review', true);
select lives_ok($$ select public.pre_request() $$, 'and the review request');
select set_config('request.path', '/rpc/delete_account', true);
select lives_ok($$ select public.pre_request() $$, 'and account deletion');
select throws_ok($$ select public.home_feed() $$, 'P0001', 'suspended', 'the read functions refuse a suspended viewer too');
select throws_ok($$ select public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111') $$, 'P0001', 'suspended', 'the player too');
select throws_ok($$ select public.get_profile('a1111111-1111-1111-1111-111111111111') $$, 'P0001', 'suspended', 'and profiles with videos');
select throws_ok($$ select public.activity_list() $$, 'P0001', 'suspended', 'and Activity');
select throws_ok($$ select public.open_prompts() $$, 'P0001', 'suspended', 'and the + sheet');
select set_config('request.path', '', true);
select lives_ok($$ select public.request_review(((public.get_onboarding_state())->'suspension'->>'action_id')::uuid) $$, 'Request a review of the suspension');
select is((public.get_onboarding_state())->'suspension'->>'review_requested', 'true', 'LV-ReviewRequested');
reset role;
select lives_ok($$ select public.mod_restore_account('c3333333-3333-3333-3333-333333333333', 'Review: reversed', 'nemat') $$, 'restore');
select is((select moderation_status from public.accounts where id = 'c3333333-3333-3333-3333-333333333333'), 'active', 'active again');
select is(jsonb_array_length(public.mod_account_log('c3333333-3333-3333-3333-333333333333')), 5, 'the log holds every action (remove, restore via review, restrict, suspend, restore)');
select throws_ok($$ select public.mod_warn('c3333333-3333-3333-3333-333333333333', 'x', 'nemat') $$, '42883', null, 'there is no standalone warning action');
select throws_ok($$ insert into public.moderation_actions (moderator, account_id, kind, reason) values ('nemat', 'c3333333-3333-3333-3333-333333333333', 'warn', 'x') $$, '23514', null, 'nor a warn kind in the log');

-- ---------------------------------------------------------------------------
-- Delete your account: a fresh sign-in first, then hidden for 30 days, restored by signing in.
set local role authenticated;
-- The sign-in time is the token's amr timestamp, which a refresh keeps (20261016000202).
select set_config('request.jwt.claims', format('{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated","iat":%s,"amr":[{"method":"otp","timestamp":1000}]}', extract(epoch from now())::bigint), true);
select throws_ok($$ select public.delete_account() $$, 'P0001', 'reauth_required', 'an old session cannot delete the account, even with a freshly refreshed token');
select set_config('request.jwt.claims', format('{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated","iat":%1$s,"amr":[{"method":"otp","timestamp":%1$s}]}', extract(epoch from now())::bigint), true);
select lives_ok($$ select public.delete_account() $$, 'a fresh sign-in can');
reset role;
select is((select deleted_at is not null from public.accounts where id = 'c3333333-3333-3333-3333-333333333333'), true, 'soft deleted');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(public.get_profile('c3333333-3333-3333-3333-333333333333'), null, 'her profile is hidden');
select is(jsonb_array_length((public.prompt_responses((select id from public.prompts where text like 'Be honest%')))->'responses'), 0, 'and her response');
reset role;
select is((public.web_video('d5555555-5555-5555-5555-555555555555'))->>'status', 'unavailable', 'on the web too');
select is((select username from public.profiles where id = 'c3333333-3333-3333-3333-333333333333'), 'testmaya', 'the username stays reserved');
set local role authenticated;
-- A sign-in after the deletion (one second later: now() does not move inside the transaction).
select set_config('request.jwt.claims', format('{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated","amr":[{"method":"otp","timestamp":%s}]}', extract(epoch from now())::bigint + 1), true);
select is((public.get_onboarding_state())->>'has_profile', 'true', 'signing back in restores');
reset role;
select is((select deleted_at from public.accounts where id = 'c3333333-3333-3333-3333-333333333333'), null, 'deleted_at cleared');
update public.accounts set deleted_at = now() - interval '31 days' where id = 'c3333333-3333-3333-3333-333333333333';
select is(public.purge_deleted_accounts(), 1, 'day 30: purged');
select is((select count(*)::int from public.profiles where id = 'c3333333-3333-3333-3333-333333333333'), 0, 'everything cascades');

select * from finish();
rollback;
