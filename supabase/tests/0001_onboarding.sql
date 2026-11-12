-- pgTAP tests for the phase 2 schema: RLS and the onboarding functions.
begin;
select plan(50);

-- ---------------------------------------------------------------------------
-- Fixtures: three auth users (the trigger creates their accounts).
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'putu@example.com', '{"provider":"apple","providers":["apple"]}', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya@example.com', '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'email', '{"sub":"11111111-1111-1111-1111-111111111111","email":"lena@example.com"}', now(), now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'apple-putu', 'apple', '{"sub":"apple-putu","email":"putu@example.com"}', now(), now(), now());

select is((select count(*)::int from public.accounts where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333')), 3, 'the auth trigger creates one account per user');

-- Putu already has a profile and an invite code; one expired code exists too.
update public.accounts set age_confirmed_at = now() where id = '22222222-2222-2222-2222-222222222222';
insert into public.profiles (id, name, username) values ('22222222-2222-2222-2222-222222222222', 'Putu Ayu', 'putu');
select public.team_create_invite('PUTU-7K2', 'canggu', '22222222-2222-2222-2222-222222222222');
select public.team_create_invite('MAYA-2QX', 'canggu', '22222222-2222-2222-2222-222222222222');
select public.team_create_invite('OLD-ONE', 'canggu', null, 1);
update public.invites set expires_at = now() - interval '1 hour' where code = 'OLD-ONE';

select is(public.signin_providers_for_email('Putu@Example.com'), array['apple'], 'signin_providers_for_email finds the Apple identity case-insensitively');
select is(public.signin_providers_for_email('nobody@example.com'), '{}'::text[], 'signin_providers_for_email returns an empty array for unknown emails');

-- One sign-in method per account: a second provider on the same account is refused.
select throws_ok(
  $$ insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
     values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'google-putu', 'google', '{"sub":"google-putu","email":"putu@example.com"}', now(), now(), now()) $$,
  'P0001', 'signin_method_conflict:apple', 'a second sign-in method is refused server-side');
select lives_ok(
  $$ insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
     values (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333', 'email', '{"sub":"33333333-3333-3333-3333-333333333333","email":"maya@example.com"}', now(), now(), now()) $$,
  'the first identity of an account is accepted');

-- ---------------------------------------------------------------------------
-- Anonymous: nothing is readable or callable.
-- ---------------------------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.accounts), 0, 'anon reads no accounts');
select is((select count(*)::int from public.profiles), 0, 'anon reads no profiles');
select is((select count(*)::int from public.invites), 0, 'anon reads no invites');
select is((select count(*)::int from public.app_config), 0, 'anon reads no config');
select throws_ok($$ select public.get_onboarding_state() $$, '42501', null, 'anon cannot call get_onboarding_state');
select throws_ok($$ select public.team_create_invite('X-1') $$, '42501', null, 'anon cannot create invites');
select throws_ok($$ select public.signin_providers_for_email('a@b.co') $$, '42501', null, 'anon cannot look up sign-in providers');
select is(public.invite_preview('PUTU-7K2'), '{"status":"valid","inviter_name":"Putu Ayu","inviter_photo_path":null,"cohort_name":"Canggu"}'::jsonb, 'anon can preview a valid invite link (W-Link)');
select is(public.invite_preview('NOPE-000'), '{"status":"not_found"}'::jsonb, 'an unknown link previews as not_found');
reset role;

-- ---------------------------------------------------------------------------
-- Lena signs in: state before anything else.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","email":"lena@example.com","role":"authenticated"}', true);

select throws_ok($$ select public.team_create_invite('X-1') $$, '42501', null, 'a signed-in person cannot create invites');
select throws_ok($$ select public.signin_providers_for_email('a@b.co') $$, '42501', null, 'a signed-in person cannot look up sign-in providers');
select is((select count(*)::int from public.accounts), 1, 'a person reads only their own account');
-- Other people's profiles reach a member only through the read functions (20261016000200).
select is((select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 0, 'other people''s profiles are not readable directly');
select is((select count(*)::int from public.invites), 0, 'invites of other people are not readable');

select is(
  public.get_onboarding_state() - 'profile' - 'suspended' - 'suspension' - 'restriction',
  '{"email":"lena@example.com","age_confirmed":false,"invite_required":true,"has_beta_access":false,"waitlisted":false,"has_profile":false}'::jsonb,
  'initial onboarding state'
);

-- Invite and profile steps are refused before the 18+ step.
select throws_ok($$ select public.redeem_invite('PUTU-7K2') $$, 'P0001', 'age_not_confirmed', 'redeem_invite needs the 18+ step first');
select throws_ok($$ select public.join_waitlist() $$, 'P0001', 'age_not_confirmed', 'join_waitlist needs the 18+ step first');
select throws_ok($$ select public.create_profile('Lena Hart', 'lenahart') $$, 'P0001', 'age_not_confirmed', 'create_profile needs the 18+ step first');

-- 18+
select lives_ok($$ select public.confirm_age() $$, 'confirm_age');
select is((public.get_onboarding_state())->>'age_confirmed', 'true', 'age is confirmed');
select throws_ok($$ select public.create_profile('Lena Hart', 'lenahart') $$, 'P0001', 'beta_access_required', 'create_profile needs beta access while invite_required is on');

-- Invite checks
select is((public.check_invite('nope-000'))->>'status', 'not_found', 'unknown code is not_found');
select is((public.check_invite('OLD-ONE'))->>'status', 'expired', 'expired code is expired');
select is(public.check_invite(' putu-7k2 '), '{"status":"valid","cohort":"canggu","inviter_name":"Putu Ayu","inviter_first_name":"Putu","inviter_photo_path":null}'::jsonb, 'valid code is normalised and names the inviter');

-- Redeem
select is((public.redeem_invite('putu-7k2'))->>'status', 'valid', 'redeem_invite redeems a valid code');
select is((public.check_invite('PUTU-7K2'))->>'status', 'used', 'the code is now used');
select is((public.redeem_invite('MAYA-2QX'))->>'status', 'already_in', 'a second invite is not consumed by someone who is already in');
select is((public.get_onboarding_state())->>'has_beta_access', 'true', 'beta access granted');
select is((select beta_cohort from public.accounts where id = '11111111-1111-1111-1111-111111111111'), 'canggu', 'cohort recorded on the account');
select is((select count(*)::int from public.invites), 1, 'the redeemed invite is now readable by the redeemer');

-- Username rules
select is(public.username_status('putu'), 'taken', 'taken username');
select is(public.username_status('Lena'), 'invalid', 'uppercase is invalid');
select is(public.username_status('ab'), 'invalid', 'too short is invalid');
select is(public.username_status('lena.hart_1'), 'available', 'dots, underscores and digits are allowed');
select is(public.username_suggestions('Lena Hart', 'lena'), array['lenahart', 'lena.hart', 'lena_h'], 'three suggestions built from the name (E-Username)');
select throws_ok($$ select public.create_profile('Lena Hart', 'putu') $$, 'P0001', 'username_taken', 'create_profile reports a taken username');
select throws_ok($$ select public.create_profile('', 'lenahart') $$, 'P0001', 'invalid_name', 'create_profile needs a name');
select throws_ok($$ select public.create_profile('Lena Hart', 'Lena Hart') $$, 'P0001', 'invalid_username', 'create_profile validates the username');

-- Profile
select is(public.create_profile('  Lena Hart ', 'lenahart'), '{"name":"Lena Hart","username":"lenahart","photo_path":null}'::jsonb, 'create_profile trims and returns the profile');
select throws_ok($$ select public.create_profile('Lena', 'lena2') $$, 'P0001', 'profile_exists', 'only one profile per account');
select throws_ok($$ select public.set_profile_photo('22222222-2222-2222-2222-222222222222/photo.jpg') $$, 'P0001', 'invalid_photo_path', 'photo path must be inside your own folder');
select lives_ok($$ select public.set_profile_photo('11111111-1111-1111-1111-111111111111/photo.jpg') $$, 'set_profile_photo inside your own folder');
select is((public.get_onboarding_state())->'profile', '{"name":"Lena Hart","username":"lenahart","photo_path":"11111111-1111-1111-1111-111111111111/photo.jpg"}'::jsonb, 'state carries the profile');

-- Direct writes are closed: only the functions write.
update public.profiles set name = 'Hacked' where id = '22222222-2222-2222-2222-222222222222';
select is((public.get_profile('22222222-2222-2222-2222-222222222222'))->>'name', 'Putu Ayu', 'profiles cannot be updated directly');
update public.accounts set age_confirmed_at = null where id = '11111111-1111-1111-1111-111111111111';
select is((public.get_onboarding_state())->>'age_confirmed', 'true', 'accounts cannot be updated directly');
reset role;

select * from finish();
rollback;
