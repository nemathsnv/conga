-- pgTAP tests for email sign-in hardening (20261010000300_auth_hardening.sql): no stored passwords,
-- the custom access token hook, and the password-session check in pre_request. The end-to-end
-- behaviour through Auth itself is covered by scripts/auth-integration.mjs.
begin;
select plan(29);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('71111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mail@example.com', 'hash-from-a-password-signup', '{}', '{}', now(), now()),
  ('72222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'goog@example.com', null, '{}', '{}', now(), now()),
  ('73333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'appl@example.com', '', '{}', '{}', now(), now()),
  ('74444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'none@example.com', null, '{}', '{}', now(), now());
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at) values
  (gen_random_uuid(), '71111111-1111-1111-1111-111111111111', '71111111-1111-1111-1111-111111111111', 'email', '{"sub":"71111111-1111-1111-1111-111111111111"}', now(), now(), now()),
  (gen_random_uuid(), '72222222-2222-2222-2222-222222222222', 'google-goog', 'google', '{"sub":"google-goog"}', now(), now(), now()),
  (gen_random_uuid(), '73333333-3333-3333-3333-333333333333', 'apple-appl', 'apple', '{"sub":"apple-appl"}', now(), now(), now());

-- ---------------------------------------------------------------------------
-- 1. No stored passwords.
-- ---------------------------------------------------------------------------
select is((select encrypted_password from auth.users where id = '71111111-1111-1111-1111-111111111111'), null, 'a password given at sign-up is not stored');
update auth.users set encrypted_password = 'hash-from-a-later-change' where id = '71111111-1111-1111-1111-111111111111';
select is((select encrypted_password from auth.users where id = '71111111-1111-1111-1111-111111111111'), null, 'a password set later is not stored');
select is((select encrypted_password from auth.users where id = '73333333-3333-3333-3333-333333333333'), '', 'an empty password is left as it is');
update auth.users set email = 'mail2@example.com' where id = '71111111-1111-1111-1111-111111111111';
select is((select email from auth.users where id = '71111111-1111-1111-1111-111111111111'), 'mail2@example.com', 'other updates to the user still apply');
update auth.users set email = 'mail@example.com' where id = '71111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- 2. The access token hook.
-- ---------------------------------------------------------------------------
create temp table ev (name text primary key, event jsonb);
insert into ev values
  ('password signin', '{"user_id":"71111111-1111-1111-1111-111111111111","authentication_method":"password","claims":{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated","amr":[{"method":"password","timestamp":1}]}}'),
  ('password refresh', '{"user_id":"71111111-1111-1111-1111-111111111111","authentication_method":"token_refresh","claims":{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated","amr":[{"method":"password","timestamp":1}]}}'),
  ('password refresh, string amr', '{"user_id":"71111111-1111-1111-1111-111111111111","authentication_method":"token_refresh","claims":{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated","amr":["password"]}}'),
  ('email code, email account', '{"user_id":"71111111-1111-1111-1111-111111111111","authentication_method":"otp","claims":{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated","aal":"aal1","amr":[{"method":"otp","timestamp":1}],"email":"mail@example.com"}}'),
  ('refresh, email account', '{"user_id":"71111111-1111-1111-1111-111111111111","authentication_method":"token_refresh","claims":{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated","amr":[{"method":"otp","timestamp":1}]}}'),
  ('email code, google account', '{"user_id":"72222222-2222-2222-2222-222222222222","authentication_method":"otp","claims":{"sub":"72222222-2222-2222-2222-222222222222","role":"authenticated","amr":[{"method":"otp","timestamp":1}]}}'),
  ('refresh after email code, google account', '{"user_id":"72222222-2222-2222-2222-222222222222","authentication_method":"token_refresh","claims":{"sub":"72222222-2222-2222-2222-222222222222","role":"authenticated","amr":[{"method":"otp","timestamp":1}]}}'),
  ('recovery code, apple account', '{"user_id":"73333333-3333-3333-3333-333333333333","authentication_method":"recovery","claims":{"sub":"73333333-3333-3333-3333-333333333333","role":"authenticated","amr":[{"method":"recovery","timestamp":1}]}}'),
  ('google sign-in', '{"user_id":"72222222-2222-2222-2222-222222222222","authentication_method":"oauth","claims":{"sub":"72222222-2222-2222-2222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}}'),
  ('google refresh', '{"user_id":"72222222-2222-2222-2222-222222222222","authentication_method":"token_refresh","claims":{"sub":"72222222-2222-2222-2222-222222222222","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}}'),
  ('apple sign-in', '{"user_id":"73333333-3333-3333-3333-333333333333","authentication_method":"oauth","claims":{"sub":"73333333-3333-3333-3333-333333333333","role":"authenticated","amr":[{"method":"oauth","timestamp":1}]}}'),
  ('email code, no identity yet', '{"user_id":"74444444-4444-4444-4444-444444444444","authentication_method":"otp","claims":{"sub":"74444444-4444-4444-4444-444444444444","role":"authenticated","amr":[{"method":"otp","timestamp":1}]}}'),
  ('no amr', '{"user_id":"74444444-4444-4444-4444-444444444444","authentication_method":"otp","claims":{"sub":"74444444-4444-4444-4444-444444444444","role":"authenticated"}}');

create temp table out as select name, public.custom_access_token_hook(event) as result, event from ev;

select is((select result->'error' from out where name = 'password signin'), '{"http_code":403,"message":"password_sign_in_disabled"}'::jsonb, 'a password sign-in gets no token');
select is((select result->'error'->>'message' from out where name = 'password refresh'), 'password_sign_in_disabled', 'nor does a refresh of a password session');
select is((select result->'error'->>'message' from out where name = 'password refresh, string amr'), 'password_sign_in_disabled', 'whichever amr format the claims use');
select is((select result from out where name = 'email code, email account'), (select jsonb_build_object('claims', event->'claims') from out where name = 'email code, email account'), 'an email code on an email account gets its claims back unchanged');
select is((select result from out where name = 'refresh, email account'), (select jsonb_build_object('claims', event->'claims') from out where name = 'refresh, email account'), 'and so does its refresh');
select is((select result->'error' from out where name = 'email code, google account'), '{"http_code":403,"message":"signin_method_conflict:google"}'::jsonb, 'an email code cannot open a Google account');
select is((select result->'error'->>'message' from out where name = 'refresh after email code, google account'), 'signin_method_conflict:google', 'nor keep such a session alive');
select is((select result->'error'->>'message' from out where name = 'recovery code, apple account'), 'signin_method_conflict:apple', 'a recovery code cannot open an Apple account');
select is((select result from out where name = 'google sign-in'), (select jsonb_build_object('claims', event->'claims') from out where name = 'google sign-in'), 'Google sign-in is unchanged');
select is((select result from out where name = 'google refresh'), (select jsonb_build_object('claims', event->'claims') from out where name = 'google refresh'), 'and its refresh');
select is((select result from out where name = 'apple sign-in'), (select jsonb_build_object('claims', event->'claims') from out where name = 'apple sign-in'), 'Apple sign-in is unchanged');
select is((select result from out where name = 'email code, no identity yet'), (select jsonb_build_object('claims', event->'claims') from out where name = 'email code, no identity yet'), 'an email code on an account with no identity row is allowed');
select is((select result from out where name = 'no amr'), (select jsonb_build_object('claims', event->'claims') from out where name = 'no amr'), 'claims without amr are allowed');

-- Who may call it.
select ok(has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'execute'), 'Auth can call the hook');
select ok(not has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'execute'), 'anon cannot');
select ok(not has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'execute'), 'signed-in people cannot');
select ok(not exists (select 1 from aclexplode((select proacl from pg_proc where oid = 'public.custom_access_token_hook(jsonb)'::regprocedure)) a where a.grantee = 0), 'PUBLIC cannot');
select ok(not has_function_privilege('authenticated', 'public.discard_auth_password()', 'execute'), 'the password trigger function is not callable');
select ok((select not prosecdef from pg_proc where oid = 'public.custom_access_token_hook(jsonb)'::regprocedure), 'the hook runs with the caller''s rights, not as a definer');
select is((select count(*)::int from pg_trigger where tgname = 'discard_auth_password' and tgrelid = 'auth.users'::regclass and tgenabled = 'O'), 1, 'the password trigger is on auth.users');

-- ---------------------------------------------------------------------------
-- 3. The product API gate.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.path', '/rpc/home_feed', true);
select set_config('request.jwt.claims', '{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated","amr":[{"method":"password","timestamp":1}]}', true);
select throws_ok($$ select public.pre_request() $$, '42501', 'password_session', 'the API refuses a token from a password session');
select set_config('request.path', '/rpc/get_onboarding_state', true);
select throws_ok($$ select public.pre_request() $$, '42501', 'password_session', 'on every path');
select set_config('request.jwt.claims', '{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated","amr":["password"]}', true);
select throws_ok($$ select public.pre_request() $$, '42501', 'password_session', 'whichever amr format the token uses');
select set_config('request.path', '/rpc/home_feed', true);
select set_config('request.jwt.claims', '{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated","amr":[{"method":"otp","timestamp":1}]}', true);
select lives_ok($$ select public.pre_request() $$, 'an email-code session passes');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok($$ select public.pre_request() $$, 'anonymous requests pass as before');
reset role;

select * from finish();
rollback;
