-- pgTAP tests for phase 7: analytics events and members' invites.
begin;
select plan(37);

delete from public.suggestions;
delete from public.invites;
delete from public.analytics_events;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'newcomer@example.com', '{}', '{}', now(), now()),
  ('d4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'second@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now();
insert into public.profiles (id, name, username) values ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena');
update public.accounts set beta_cohort = 'canggu' where id = 'a1111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Analytics
select isnt((select analytics_id from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'), null, 'every account has an anonymous analytics id');
select isnt((select analytics_id from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111'::uuid, 'which is not the account id');

set local role anon;
select throws_ok($$select public.track_events('ios', '0.1.0', '[]'::jsonb)$$, 42501, null, 'anon cannot write events');
select throws_ok($$select * from public.analytics_events$$, 42501, null, 'anon cannot read events');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(public.track_events('ios', '0.1.0', '[{"name":"prompt_viewed","props":{"prompt_id":"x","surface":"home"},"ts":"2026-10-07T10:00:00Z"},{"name":"BAD NAME","props":{}},{"name":"record_started","props":{"kind":"response"},"ts":"not a time"}]'::jsonb), 2, 'a batch lands; a bad name is skipped; a bad timestamp does not lose the row');
select throws_ok($$select public.track_events('server', '0.1.0', '[]'::jsonb)$$, 'P0001', 'bad_platform', 'the app cannot claim to be the server');
select throws_ok($$select * from public.analytics_events$$, 42501, null, 'a signed-in person cannot read events either');

reset role;
select is((select count(*)::int from public.analytics_events), 2, 'two rows');
select is((select cohort from public.analytics_events where name = 'prompt_viewed'), 'canggu', 'the cohort comes from the account');
select is((select anon_id from public.analytics_events where name = 'prompt_viewed'), (select analytics_id from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'), 'keyed by the anonymous id');
select is((select client_ts from public.analytics_events where name = 'record_started'), null, 'the bad timestamp is dropped, not the event');
select is((select props->>'surface' from public.analytics_events where name = 'prompt_viewed'), 'home', 'properties kept');

-- suggestion_reviewed is written by the server when a moderator decides
insert into public.suggestions (id, author_id, place_id, text, attribution, status)
select 'eeeeeeee-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', id, 'Best coffee after a surf?', true, 'in_review' from public.places where slug = 'canggu';
select public.mod_decline_suggestion('eeeeeeee-0000-0000-0000-000000000001', 'unclear', 'tester');
select is((select props->>'outcome' from public.analytics_events where name = 'suggestion_reviewed'), 'declined', 'a decline is logged as suggestion_reviewed');
select is((select props->>'reason' from public.analytics_events where name = 'suggestion_reviewed'), 'unclear', 'with the reason');
select is((select platform from public.analytics_events where name = 'suggestion_reviewed'), 'server', 'from the server');

-- a restore within 30 days is logged by the server
update public.accounts set deleted_at = now() where id = 'a1111111-1111-1111-1111-111111111111';
update public.accounts set deleted_at = null where id = 'a1111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.analytics_events where name = 'account_deletion_cancelled'), 1, 'restoring an account logs account_deletion_cancelled');

-- ---------------------------------------------------------------------------
-- Members' invites
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select matches((public.my_invites())->>'code', '^LENA-[A-Z2-9]{4}$', 'a readable personal code from the first name');
select is((public.my_invites())->>'code', (public.my_invites())->>'code', 'the same code every time');
select is(((public.my_invites())->>'left')::int, 5, '5 of 5 left');
select is(((public.my_invites())->>'total')::int, 5, 'the total comes from app_config');
select is((public.my_invites())->>'cohort_name', 'Canggu', 'the cohort line');
select is(jsonb_array_length((public.my_invites())->'sent'), 0, 'nothing sent yet');

-- A newcomer opens the link and signs in (the code is kept in a setting: the newcomer cannot read Lena's account row)
reset role;
select set_config('test.code', (select invite_code from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c3333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is((public.check_invite(current_setting('test.code')))->>'status', 'valid', 'the personal code is valid');
select is((public.check_invite(current_setting('test.code')))->>'inviter_first_name', 'Lena', 'Invited by Lena');
select is((public.redeem_invite(lower(current_setting('test.code'))))->>'status', 'valid', 'redeeming the personal code (lower case too)');
select is((select beta_cohort from public.accounts where id = 'c3333333-3333-3333-3333-333333333333'), 'canggu', 'the newcomer gets the inviter''s cohort');
reset role;
select ok(public.has_beta_access('c3333333-3333-3333-3333-333333333333'), 'and beta access');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(((public.my_invites())->>'left')::int, 4, '4 of 5 left');
select is((public.my_invites())->'sent'->0->>'status', 'opened', 'Link opened, not joined yet');

-- The newcomer joins
reset role;
insert into public.profiles (id, name, username) values ('c3333333-3333-3333-3333-333333333333', 'Hana Iwasaki', 'testhana');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((public.my_invites())->'sent'->0->>'status', 'joined', 'Joined');
select is((public.my_invites())->'sent'->0->'profile'->>'name', 'Hana Iwasaki', 'with the name');
select throws_ok(format('select public.cancel_invite(%L)', (select id from public.invites where redeemed_by = 'c3333333-3333-3333-3333-333333333333')), 'P0001', 'already_joined', 'a joined invite cannot be cancelled');

-- A second person opens the link; Lena cancels before they join
select set_config('request.jwt.claims', '{"sub":"d4444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select is((public.redeem_invite(current_setting('test.code')))->>'status', 'valid', 'second opener');
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(((public.my_invites())->>'left')::int, 3, '3 of 5 left');
select lives_ok(format('select public.cancel_invite(%L)', (select id from public.invites where redeemed_by = 'd4444444-4444-4444-4444-444444444444')), 'cancelling the unused one');
select is(((public.my_invites())->>'left')::int, 4, 'Cancelling gives the invite back');
reset role;
select ok(not public.has_beta_access('d4444444-4444-4444-4444-444444444444'), 'the cancelled opener is back at the invite step');

select * from finish();
rollback;
