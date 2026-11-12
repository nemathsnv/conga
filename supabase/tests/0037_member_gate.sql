-- pgTAP tests for the closed-beta member gate (20261102000100): pre_request refuses every API
-- request from a signed-in account that is not a member, except the onboarding calls the app makes
-- before Home. A member has a profile; create_profile is where the 18+ answer and beta access are
-- enforced.
begin;
select plan(41);

-- Five people, one per onboarding state, each signed in on one phone.
--   new      signed in only            age      18+ answered, nothing else
--   wait     18+ answered, waitlisted  invited  18+ answered, invite redeemed, no profile yet
--   member   18+ answered, invite redeemed, profile
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'new@example.com', '{}', '{}', now(), now()),
  ('a2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'age@example.com', '{}', '{}', now(), now()),
  ('a3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wait@example.com', '{}', '{}', now(), now()),
  ('a4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invited@example.com', '{}', '{}', now(), now()),
  ('a5555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now() where id <> 'a1111111-1111-1111-1111-111111111111';
insert into public.waitlist (account_id, email) values ('a3333333-3333-3333-3333-333333333333', 'wait@example.com');
insert into public.invites (code, cohort, expires_at, redeemed_by, redeemed_at) values
  ('GATE-AAAA', 'canggu', now() + interval '7 days', 'a4444444-4444-4444-4444-444444444444', now()),
  ('GATE-BBBB', 'canggu', now() + interval '7 days', 'a5555555-5555-5555-5555-555555555555', now());
update public.accounts set beta_cohort = 'canggu' where id in ('a4444444-4444-4444-4444-444444444444', 'a5555555-5555-5555-5555-555555555555');
insert into public.profiles (id, name, username) values ('a5555555-5555-5555-5555-555555555555', 'Gate Member', 'gatemember');
insert into auth.sessions (id, user_id, created_at, updated_at)
  select ('5' || substr(id::text, 2))::uuid, id, now(), now() from auth.users where email like '%@example.com' and id::text like 'a%';

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'session_id', ('5' || substr(p_user::text, 2))::uuid,
    'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
$$;
create function pg_temp.gate(p_path text) returns text language plpgsql as $$
begin
  perform set_config('request.path', p_path, true);
  perform public.pre_request();
  return 'allowed';
exception when others then
  return sqlerrm;
end;
$$;
-- Every RPC path the API exposes to a signed-in person, and the ones a non-member may call.
create function pg_temp.member_paths() returns setof text language sql as $$
  select '/rpc/' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute');
$$;
create function pg_temp.allowed_for(p_user uuid) returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.as_user(p_user);
  select string_agg(path, ',' order by path) into v from pg_temp.member_paths() path where pg_temp.gate(path) = 'allowed';
  return v;
end;
$$;
grant execute on function pg_temp.as_user(uuid) to authenticated;
grant execute on function pg_temp.gate(text) to authenticated;
grant execute on function pg_temp.member_paths() to authenticated;
grant execute on function pg_temp.allowed_for(uuid) to authenticated;

-- What a non-member may call: the onboarding steps, analytics, deleting the account, removing a
-- push token, the public web player functions, and the suspended person's calls that return before
-- the member check.
create temp table expected_pre_member as select unnest(array[
  '/rpc/check_invite', '/rpc/confirm_age', '/rpc/create_profile', '/rpc/delete_account',
  '/rpc/get_onboarding_state', '/rpc/invite_preview', '/rpc/join_waitlist', '/rpc/redeem_invite',
  '/rpc/remove_push_token', '/rpc/request_review', '/rpc/set_timezone', '/rpc/track_events',
  '/rpc/username_status', '/rpc/username_suggestions', '/rpc/web_prompt', '/rpc/web_video']) as path;
grant select on expected_pre_member to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Deny by default: in every pre-member state, exactly the onboarding paths are allowed. A
--    function granted to authenticated later is refused to non-members unless listed.
-- ---------------------------------------------------------------------------
set local role authenticated;
select is(pg_temp.allowed_for('a1111111-1111-1111-1111-111111111111'), (select string_agg(path, ',' order by path) from expected_pre_member), 'signed in only: onboarding paths only');
select is(pg_temp.allowed_for('a2222222-2222-2222-2222-222222222222'), (select string_agg(path, ',' order by path) from expected_pre_member), '18+ answered: onboarding paths only');
select is(pg_temp.allowed_for('a3333333-3333-3333-3333-333333333333'), (select string_agg(path, ',' order by path) from expected_pre_member), 'waitlisted: onboarding paths only');
select is(pg_temp.allowed_for('a4444444-4444-4444-4444-444444444444'), (select string_agg(path, ',' order by path) from expected_pre_member), 'invite redeemed, no profile: onboarding paths only');
select is(pg_temp.allowed_for('a5555555-5555-5555-5555-555555555555'), (select string_agg(path, ',' order by path) from pg_temp.member_paths() path), 'member: every path');

-- ---------------------------------------------------------------------------
-- 2. The audit's paths, one by one, for the cheapest state to reach (an email and a code).
-- ---------------------------------------------------------------------------
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.gate('/rpc/home_feed'), 'profile_required', 'home_feed refused');
select is(pg_temp.gate('/rpc/prompt_responses'), 'profile_required', 'prompt_responses refused');
select is(pg_temp.gate('/rpc/get_response'), 'profile_required', 'get_response refused');
select is(pg_temp.gate('/rpc/get_video'), 'profile_required', 'get_video refused');
select is(pg_temp.gate('/rpc/reply_room'), 'profile_required', 'reply_room refused');
select is(pg_temp.gate('/rpc/comments_list'), 'profile_required', 'comments_list refused');
select is(pg_temp.gate('/rpc/get_profile'), 'profile_required', 'get_profile refused');
select is(pg_temp.gate('/rpc/follow_list'), 'profile_required', 'follow_list refused');
select is(pg_temp.gate('/rpc/search'), 'profile_required', 'search refused');
select is(pg_temp.gate('/rpc/web_video'), 'allowed', 'web_video allowed: public without signing in anyway');
select is(pg_temp.gate('/rpc/follow_place'), 'profile_required', 'follow_place refused (wrote a row before)');
select is(pg_temp.gate('/rpc/block_user'), 'profile_required', 'block_user refused (wrote a row before)');
select is(pg_temp.gate('/rpc/register_push_token'), 'profile_required', 'register_push_token refused (wrote a row before)');
select is(pg_temp.gate('/places'), 'profile_required', 'direct read of places refused');
select is(pg_temp.gate('/app_config'), 'profile_required', 'direct read of app_config refused');
select is(pg_temp.gate('/rpc/graphql'), 'profile_required', 'GraphQL refused');
select is(pg_temp.gate(''), 'profile_required', 'no path: refused');

-- ---------------------------------------------------------------------------
-- 3. The onboarding the app runs before Home still works end to end through the gate.
-- ---------------------------------------------------------------------------
select is(pg_temp.gate('/rpc/confirm_age'), 'allowed', 'A-Age');
select lives_ok($$ select public.confirm_age() $$, 'confirm_age runs');
select is(pg_temp.gate('/rpc/check_invite'), 'allowed', 'O-Invite: check');
select is(pg_temp.gate('/rpc/redeem_invite'), 'allowed', 'O-Invite: redeem');
reset role;
insert into public.invites (code, cohort, expires_at) values ('GATE-CCCC', 'canggu', now() + interval '7 days');
set local role authenticated;
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
select is(public.redeem_invite('GATE-CCCC')->>'status', 'valid', 'redeem_invite runs');
select is(pg_temp.gate('/rpc/home_feed'), 'profile_required', 'invite redeemed, still no profile: refused');
select is(pg_temp.gate('/rpc/username_status'), 'allowed', 'O-Profile: live check');
select is(pg_temp.gate('/rpc/create_profile'), 'allowed', 'O-Profile: create');
select lives_ok($$ select public.create_profile('New Person', 'newperson') $$, 'create_profile runs');
select is(pg_temp.gate('/rpc/home_feed'), 'allowed', 'profile created: Home works at once');
select is(pg_temp.gate('/rpc/set_profile_photo'), 'allowed', 'O-Photo works after the profile');
reset role;

-- ---------------------------------------------------------------------------
-- 4. The profile is the member test, whatever happens to the invite or the switch afterwards.
-- ---------------------------------------------------------------------------
update public.invites set cancelled_at = now() where code = 'GATE-BBBB';
set local role authenticated;
select pg_temp.as_user('a5555555-5555-5555-5555-555555555555');
select is(pg_temp.gate('/rpc/home_feed'), 'allowed', 'a member whose invite was cancelled later keeps access');
reset role;
-- Public launch: invite_required off. A profile is enough; no profile is still refused.
update public.app_config set invite_required = false;
set local role authenticated;
select is(pg_temp.gate('/rpc/home_feed'), 'allowed', 'invite_required off: a profile is enough');
select pg_temp.as_user('a2222222-2222-2222-2222-222222222222');
select is(pg_temp.gate('/rpc/home_feed'), 'profile_required', 'invite_required off: no profile, still refused');
reset role;
update public.app_config set invite_required = true;

-- ---------------------------------------------------------------------------
-- 5. The earlier checks keep their order and answers.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select is(pg_temp.gate('/rpc/web_video'), 'allowed', 'no session (the web player): allowed, as before');
select pg_temp.as_user('a2222222-2222-2222-2222-222222222222');
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated', 'session_id', '52222222-2222-2222-2222-222222222222', 'amr', json_build_array('password'))::text, true);
select is(pg_temp.gate('/rpc/get_onboarding_state'), 'password_session', 'a password session is refused first, as before');
select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-2222-2222-222222222222', 'role', 'authenticated', 'session_id', '59999999-9999-9999-9999-999999999999', 'amr', json_build_array('otp'))::text, true);
select is(pg_temp.gate('/rpc/get_onboarding_state'), 'session_revoked', 'a signed-out session is refused first, as before');
reset role;
update public.invites set cancelled_at = null where code = 'GATE-BBBB';
update public.accounts set moderation_status = 'suspended' where id = 'a5555555-5555-5555-5555-555555555555';
set local role authenticated;
select pg_temp.as_user('a5555555-5555-5555-5555-555555555555');
select is(pg_temp.gate('/rpc/home_feed'), 'suspended', 'a suspended member still gets suspended, not profile_required');
reset role;

select ok(not has_function_privilege('authenticated', 'public.pre_member_allowed_path(text)', 'execute')
      and not has_function_privilege('anon', 'public.pre_member_allowed_path(text)', 'execute'), 'the allowlist is not callable from the API');

select * from finish();
rollback;
