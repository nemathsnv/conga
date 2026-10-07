-- pgTAP tests for phase 6: places and follows, cohort auto-follow, feeds by scope, Discover,
-- search, suggestions and their review, private drafts.
begin;
select plan(60);

delete from public.suggestions;
delete from public.responses;
delete from public.prompts;
delete from public.place_follows;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam');
-- Lena is in the Canggu beta cohort; Adam is not in any cohort.
update public.accounts set beta_cohort = 'canggu' where id = 'a1111111-1111-1111-1111-111111111111';

insert into public.prompts (id, text, status, published_at, featured_on) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Be honest about the place you live.', 'live', now(), (now() at time zone 'utc')::date);
insert into public.prompts (id, text, place_id, status, published_at, topic_id)
select '22222222-aaaa-aaaa-aaaa-222222222222', 'Where do you actually get work done?', id, 'live', now() - interval '1 hour', null from public.places where slug = 'canggu';
insert into public.prompts (id, text, place_id, status, published_at)
select '33333333-aaaa-aaaa-aaaa-333333333333', 'Best wave for a beginner around here?', id, 'live', now() - interval '2 hours' from public.places where slug = 'uluwatu';

-- ---------------------------------------------------------------------------
-- Cohort auto-follow and scope
select is((select count(*)::int from public.place_follows where account_id = 'a1111111-1111-1111-1111-111111111111' and source = 'cohort'), 1, 'a Canggu beta invite follows Canggu');
select is((select count(*)::int from public.place_follows where account_id = 'b2222222-2222-2222-2222-222222222222'), 0, 'no cohort, no place');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(jsonb_array_length(public.home_feed()), 2, 'Lena''s feed has the global prompt and the Canggu prompt');
select is((public.home_feed())->1->'prompt'->'place'->>'name', 'Canggu', 'with the pin label');
select is(jsonb_array_length(public.open_prompts()), 2, 'the + sheet lists the same prompts');
select is((public.places_screen())->'following'->0->>'name', 'Canggu', 'P-Places: following Canggu');
select is((public.places_screen())->'following'->0->>'from_cohort', 'true', 'from the beta invite');
select is(jsonb_array_length((public.places_screen())->'suggested'), 2, 'suggested: Canggu''s open neighbours');
select throws_ok($$ select public.follow_place((select id from public.places where slug = 'ubud')) $$, 'P0001', 'place_not_open', 'a place that is not open yet cannot be followed');
select lives_ok($$ select public.follow_place((select id from public.places where slug = 'uluwatu')) $$, 'follow Uluwatu');
select is(jsonb_array_length(public.home_feed()), 3, 'the Uluwatu prompt joins the feed');
select is((public.place_page((select id from public.places where slug = 'uluwatu')))->'place'->>'following', 'true', 'P-Place says Following');
select is(jsonb_array_length((public.place_page((select id from public.places where slug = 'uluwatu')))->'prompts'), 1, 'with its prompts');
select lives_ok($$ select public.unfollow_place((select id from public.places where slug = 'uluwatu')) $$, 'unfollow');
select is(jsonb_array_length(public.home_feed()), 2, 'its prompts leave the feed');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(jsonb_array_length(public.home_feed()), 1, 'Adam, following no place, sees only global prompts');
select is(jsonb_array_length((public.place_page((select id from public.places where slug = 'canggu')))->'prompts'), 1, 'a place page can still be opened without following it');
select is(jsonb_array_length((public.search('canggu'))->'places'), 1, 'search finds the place');
select is(jsonb_array_length((public.search('work done'))->'prompts'), 1, 'and prompts by a few words');
select is((public.search('ubud'))->'places'->0->>'open', 'false', 'a place not open yet is listed without Follow');
select is(jsonb_array_length((public.search('len'))->'people'), 1, 'search finds people');
select is((public.discover())->'tonight'->>'text', 'Be honest about the place you live.', 'Discover shows tonight''s prompt');
select ok(((public.discover())->'tonight'->>'hours_left')::int between 0 and 24, 'with the hours left until local midnight');
reset role;

-- ---------------------------------------------------------------------------
-- Suggestions
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select throws_ok($$ select public.suggest_prompt(repeat('x', 121)) $$, 'P0001', 'invalid_text', '120 characters at most');
select throws_ok($$ select public.suggest_prompt('Best wave?', (select id from public.places where slug = 'uluwatu')) $$, 'P0001', 'place_not_followed', 'only Global or a place you follow');
select is((public.suggest_prompt('What''s one thing you''d change about Canggu tomorrow?', (select id from public.places where slug = 'canggu')))->>'status', 'in_review', 'a suggestion goes into review');
select is((public.suggest_prompt('Two'))->>'status', 'in_review', 'second');
select is((public.suggest_prompt('Three'))->>'status', 'in_review', 'third');
select throws_ok($$ select public.suggest_prompt('Four') $$, 'P0001', 'too_many_in_review', 'at most 3 in review');
select is((public.my_suggestions())->>'in_review_count', '3', 'Your suggestions · 3 in review');
select lives_ok($$ select public.withdraw_suggestion((select id from public.suggestions where text = 'Three')) $$, 'withdraw one');
select is((public.my_suggestions())->>'in_review_count', '2', 'two in review');
select is((public.edit_suggestion((select id from public.suggestions where text = 'Two'), 'Two, edited', null, false))->>'attribution', 'false', 'edit while in review');
-- A private draft while in review.
select is((public.post_draft((select id from public.suggestions where text like 'What''s one thing%'), 'up-draft', 'My first take.', 9000))->>'status', 'draft', 'a draft is saved privately');
select is(jsonb_array_length(public.profile_responses('a1111111-1111-1111-1111-111111111111')), 0, 'a draft is not on the profile');
select is(((public.my_suggestions())->'suggestions'->0->'draft'->>'ready'), 'false', 'the draft waits for Mux');
select throws_ok($$ select public.publish_draft((select id from public.suggestions where text like 'What''s one thing%')) $$, 'P0001', 'prompt_not_live', 'a draft cannot be published before the prompt is live');
select throws_ok($$ select public.mod_approve_suggestion((select id from public.suggestions where text like 'What''s one thing%'), 'nemat') $$, '42501', null, 'members cannot approve');
reset role;

-- Mux reports the draft ready: it stays a draft.
select is((public.mark_response_live('up-draft', 'as-draft', 'pb-draft', 9000))->>'status', 'draft', 'a ready draft stays a draft');

-- Review: decline one, approve one.
select throws_ok($$ select public.mod_decline_suggestion((select id from public.suggestions where text = 'Two, edited'), 'because', 'nemat') $$, 'P0001', 'invalid_reason', 'decline needs a reason from the list');
select lives_ok($$ select public.mod_decline_suggestion((select id from public.suggestions where text = 'Two, edited'), 'unclear', 'nemat') $$, 'decline: unclear');
select is((select count(*)::int from public.activity where recipient_id = 'a1111111-1111-1111-1111-111111111111' and kind = 'suggestion_declined'), 1, 'the author gets the outcome');
select is((select public.push_text(o) from public.push_outbox o where kind = 'suggestion_declined'), 'Your prompt wasn''t published. Not published because it is unclear. You can rewrite it and send it again.', 'with the reason');
select is(jsonb_array_length(public.mod_suggestions_queue()), 1, 'one left in the queue');
select lives_ok($$ select public.mod_approve_suggestion((select id from public.suggestions where text like 'What''s one thing%'), 'nemat', true) $$, 'approve with the name');
select is((select status from public.suggestions where text like 'What''s one thing%'), 'live', 'the suggestion is live');
select is((select count(*)::int from public.prompts where text like 'What''s one thing%' and status = 'live' and source = 'member' and attribution), 1, 'and a live member prompt exists with attribution');
select is((select public.push_text(o) from public.push_outbox o where kind = 'suggestion_live'), 'Your prompt is live in Canggu', 'the author is told');
select is((select count(*)::int from public.moderation_actions where kind = 'approve_suggestion'), 1, 'the approval is logged');
select is((select count(*)::int from public.activity where kind = 'place_prompt'), 0, 'the author is the only Canggu follower, so no place-prompt row');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((public.get_prompt((select prompt_id from public.suggestions where text like 'What''s one thing%')))->'suggested_by'->>'username', 'testlena', 'the prompt says who suggested it');
select is((public.get_prompt((select prompt_id from public.suggestions where text like 'What''s one thing%')))->>'is_own_suggestion', 'true', 'and that it is yours');
select is((select x->>'decline_text' from jsonb_array_elements((public.my_suggestions())->'suggestions') x where x->>'status' = 'live'), null, 'the live card has no decline text');
select is((select x->>'decline_text' from jsonb_array_elements((public.my_suggestions())->'suggestions') x where x->>'status' = 'not_published'), 'Not published because it is unclear. You can rewrite it and send it again.', 'the declined card explains why');
select is((public.edit_suggestion((select id from public.suggestions where text = 'Two, edited'), 'Two, rewritten'))->>'status', 'in_review', 'rewrite and resend goes back into review');
-- Publish the draft now that the prompt is live.
select is((public.publish_draft((select id from public.suggestions where text like 'What''s one thing%')))->>'status', 'live', 'C-Draft: Publish response');
select is(jsonb_array_length(public.profile_responses('a1111111-1111-1111-1111-111111111111')), 1, 'it is a response now');
select throws_ok($$ select public.publish_draft((select id from public.suggestions where text like 'What''s one thing%')) $$, 'P0001', 'draft_not_found', 'and the draft is gone');
reset role;

-- A team prompt in Canggu tells its followers.
select public.team_create_prompt('What did Canggu look like when you first got here?', 'canggu');
select is((select count(*)::int from public.activity where recipient_id = 'a1111111-1111-1111-1111-111111111111' and kind = 'place_prompt'), 1, 'a new place prompt reaches the place''s followers');
select is((select count(*)::int from public.push_outbox where kind = 'place_prompt'), 0, 'but is not pushed without a token');

select * from finish();
rollback;
