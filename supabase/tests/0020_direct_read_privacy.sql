-- pgTAP tests for the privacy audit's P1 to P3 (20261016000200): direct table reads.
-- Lena is the viewer. Adam blocked Lena; Lena blocked Pia; Maya is in her deletion window;
-- Omar is anyone. With the rollback file applied (the old policies), 42 of 47 fail.
begin;
select plan(47);

delete from public.blocks;
delete from public.follows;
delete from public.comments;
delete from public.responses;
delete from public.prompts;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now()),
  ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya@example.com', '{}', '{}', now(), now()),
  ('d4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'omar@example.com', '{}', '{}', now(), now()),
  ('e5555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pia@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam'),
  ('c3333333-3333-3333-3333-333333333333', 'Maya Lindqvist', 'testmaya'),
  ('d4444444-4444-4444-4444-444444444444', 'Omar Haddad', 'testomar'),
  ('e5555555-5555-5555-5555-555555555555', 'Pia Sari', 'testpia');
update public.accounts set deleted_at = now() - interval '1 day' where id = 'c3333333-3333-3333-3333-333333333333';
insert into public.blocks (blocker_id, blocked_id) values
  ('b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111'),
  ('a1111111-1111-1111-1111-111111111111', 'e5555555-5555-5555-5555-555555555555');
insert into public.follows (follower_id, followee_id) values
  ('a1111111-1111-1111-1111-111111111111', 'd4444444-4444-4444-4444-444444444444'),
  ('d4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111'),
  ('b2222222-2222-2222-2222-222222222222', 'd4444444-4444-4444-4444-444444444444'),
  ('c3333333-3333-3333-3333-333333333333', 'd4444444-4444-4444-4444-444444444444');
insert into public.prompts (id, text, status, published_at, source, suggested_by, attribution) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Team prompt.', 'live', now(), 'team', null, true),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'Adam suggested this without his name.', 'live', now(), 'member', 'b2222222-2222-2222-2222-222222222222', false),
  ('33333333-aaaa-aaaa-aaaa-333333333333', 'Maya suggested this, then deleted her account.', 'live', now(), 'member', 'c3333333-3333-3333-3333-333333333333', true);
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('f1111111-0000-0000-0000-000000000001', '11111111-aaaa-aaaa-aaaa-111111111111', 'd4444444-4444-4444-4444-444444444444', 9000, 'live', 'upOmar', 'asOmar', 'pbOmar', now());
insert into public.comments (id, response_id, author_id, body) values
  ('c1111111-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'Lena here.'),
  ('c1111111-0000-0000-0000-000000000002', 'f1111111-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222', 'Adam, who blocked Lena.'),
  ('c1111111-0000-0000-0000-000000000003', 'f1111111-0000-0000-0000-000000000001', 'c3333333-3333-3333-3333-333333333333', 'Maya, deleted.'),
  ('c1111111-0000-0000-0000-000000000004', 'f1111111-0000-0000-0000-000000000001', 'e5555555-5555-5555-5555-555555555555', 'Pia, blocked by Lena.'),
  ('c1111111-0000-0000-0000-000000000005', 'f1111111-0000-0000-0000-000000000001', 'd4444444-4444-4444-4444-444444444444', 'Omar.');
-- Lena's own moderation history, with the moderator's name and an internal note.
insert into public.moderation_actions (id, moderator, account_id, kind, target_kind, target_id, reason, note) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'nemat', 'a1111111-1111-1111-1111-111111111111', 'remove', 'comment', 'c1111111-0000-0000-0000-000000000001', 'It was spam.', 'reported by Omar');
insert into public.review_requests (action_id, account_id, outcome, decided_at, decided_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'upheld', now(), 'nemat');
insert into public.suggestions (id, author_id, text, status, decline_reason, reviewed_at, reviewed_by) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'Lena''s suggestion.', 'not_published', 'unclear', now(), 'nemat');

-- ---------------------------------------------------------------------------
-- The shape of the fix.
select policies_are('public', 'profiles', array['profiles: signed-in users read only their own directly'], 'profiles: one policy, own row');
select policies_are('public', 'follows', array['follows: signed-in users read only their own follows directly'], 'follows: one policy, own follows');
select policies_are('public', 'comments', array['comments: signed-in users read only their own directly'], 'comments: one policy, own comments');
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
             and (has_table_privilege('anon', c.oid, 'truncate') or has_table_privilege('authenticated', c.oid, 'truncate'))), 0,
          'no API role can truncate any public table');
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
             and (has_table_privilege('anon', c.oid, 'references') or has_table_privilege('authenticated', c.oid, 'references')
                  or has_table_privilege('anon', c.oid, 'trigger') or has_table_privilege('authenticated', c.oid, 'trigger'))), 0,
          'nor hold REFERENCES or TRIGGER on one');
select is(has_column_privilege('authenticated', 'public.prompts', 'suggested_by', 'select'), false, 'prompts.suggested_by is not readable by members');
select is(has_column_privilege('authenticated', 'public.prompts', 'text', 'select'), true, 'prompt text still is');
select is(has_column_privilege('authenticated', 'public.moderation_actions', 'moderator', 'select'), false, 'moderation_actions.moderator is not readable');
select is(has_column_privilege('authenticated', 'public.moderation_actions', 'note', 'select'), false, 'moderation_actions.note is not readable');
select is(has_column_privilege('authenticated', 'public.review_requests', 'decided_by', 'select'), false, 'review_requests.decided_by is not readable');
select is(has_column_privilege('authenticated', 'public.suggestions', 'reviewed_by', 'select'), false, 'suggestions.reviewed_by is not readable');

-- ---------------------------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.profiles), 0, 'anon reads no profiles');
select is((select count(*)::int from public.follows), 0, 'anon reads no follows');
select is((select count(*)::int from public.comments), 0, 'anon reads no comments');
select is((select count(*)::int from public.prompts), 0, 'anon reads no prompts');
reset role;

-- ---------------------------------------------------------------------------
-- Lena reads only her own rows directly.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((select count(*)::int from public.profiles), 1, 'Lena reads one profile directly');
select is((select username from public.profiles), 'testlena', 'her own');
select is((select count(*)::int from public.profiles where id = 'b2222222-2222-2222-2222-222222222222'), 0, 'not the profile of Adam, who blocked her');
select is((select count(*)::int from public.profiles where id = 'e5555555-5555-5555-5555-555555555555'), 0, 'not the profile of Pia, whom she blocked');
select is((select count(*)::int from public.profiles where id = 'c3333333-3333-3333-3333-333333333333'), 0, 'not the profile of Maya, in her deletion window');
select is((select count(*)::int from public.profiles where username = 'testomar'), 0, 'not anyone else''s, even by username');
select is((select count(*)::int from public.follows), 1, 'Lena reads one follow directly');
select is((select followee_id::text from public.follows), 'd4444444-4444-4444-4444-444444444444', 'the one she made');
select is((select count(*)::int from public.follows where followee_id = 'a1111111-1111-1111-1111-111111111111'), 0, 'not her followers');
select is((select count(*)::int from public.follows where follower_id in ('b2222222-2222-2222-2222-222222222222', 'c3333333-3333-3333-3333-333333333333')), 0, 'not Adam''s or Maya''s follows');
select is((select count(*)::int from public.comments), 1, 'Lena reads one comment directly');
select is((select body from public.comments), 'Lena here.', 'her own');
select is((select count(*)::int from public.comments where author_id <> 'a1111111-1111-1111-1111-111111111111'), 0, 'none by Adam, Maya, Pia or Omar');
select is((select count(*)::int from public.comments where response_id = 'f1111111-0000-0000-0000-000000000001'), 1, 'not even by response');
select is((select count(*)::int from public.prompts), 3, 'live prompts are still readable directly');
select is((select count(*)::int from public.prompts where attribution = false), 1, 'with their attribution flag');
select throws_ok($$ select suggested_by from public.prompts $$, '42501', null, 'but not who suggested them (Adam asked for no name; Maya is deleted)');
select throws_ok($$ select * from public.prompts $$, '42501', null, 'nor through select *');
select is((select reason from public.moderation_actions where id = 'aaaaaaaa-0000-0000-0000-000000000001'), 'It was spam.', 'Lena reads the reason of her own moderation action');
select throws_ok($$ select moderator from public.moderation_actions $$, '42501', null, 'but not the moderator''s name');
select throws_ok($$ select note from public.moderation_actions $$, '42501', null, 'nor the internal note');
select is((select outcome from public.review_requests), 'upheld', 'she reads her review''s outcome');
select throws_ok($$ select decided_by from public.review_requests $$, '42501', null, 'not who decided it');
select is((select decline_reason from public.suggestions), 'unclear', 'she reads her suggestion''s decline reason');
select throws_ok($$ select reviewed_by from public.suggestions $$, '42501', null, 'not who reviewed it');

-- The read functions are unchanged.
select is((public.get_profile('d4444444-4444-4444-4444-444444444444'))->>'username', 'testomar', 'get_profile still shows Omar');
select is(public.get_profile('b2222222-2222-2222-2222-222222222222'), null, 'and still hides Adam');
select is((public.comments_list('f1111111-0000-0000-0000-000000000001'))->>'count', '2', 'comments_list shows Lena''s and Omar''s comments');
select is(jsonb_array_length(public.follow_list('d4444444-4444-4444-4444-444444444444', 'followers')), 1, 'follow_list shows Omar''s one follower Lena can see');
select is((public.get_prompt('22222222-aaaa-aaaa-aaaa-222222222222'))->'suggested_by', 'null'::jsonb, 'and prompt cards still name no one for an unattributed prompt');
select is((public.get_notice('aaaaaaaa-0000-0000-0000-000000000001'))->>'reason', 'It was spam.', 'the removal notice still shows the reason');
reset role;

-- Omar cannot read Lena's comment directly either.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d4444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select is((select count(*)::int from public.comments where author_id = 'a1111111-1111-1111-1111-111111111111'), 0, 'Omar reads none of Lena''s comments directly, even on his own response');
reset role;

select * from finish();
rollback;
