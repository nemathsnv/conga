-- pgTAP tests for the account lifecycle audit's L1 to L4 (20261016000202): deletion ends every
-- session, only a sign-in after the deletion cancels it, the deletion needs a recent sign-in
-- (not a recent refresh), signed-out sessions are refused by the API gate, and avatar writes need
-- a current, active account. Sessions are rows in auth.sessions, as Auth writes them; the token's
-- session_id and amr are what Auth puts in every access token.
begin;
select plan(46);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'lifelena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'lifeadam');
-- Lena is signed in on two phones (an old sign-in and a new one); Adam on one.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('51111111-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', now() - interval '3 days', now()),
  ('51111111-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', now() - interval '1 minute', now()),
  ('52222222-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222', now() - interval '1 minute', now());
insert into public.push_tokens (token, account_id, platform) values ('ExponentPushToken[lena]', 'a1111111-1111-1111-1111-111111111111', 'ios');

-- A token: who, which session, when that session signed in (seconds before now()), when the token
-- was issued (a refresh issues a new one; amr stays).
create function pg_temp.as_token(p_user uuid, p_session uuid, p_signed_in_ago integer, p_issued_ago integer default 0) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'session_id', p_session,
    'iat', extract(epoch from now())::bigint - p_issued_ago,
    'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint - p_signed_in_ago)))::text, true);
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
grant execute on function pg_temp.as_token(uuid, uuid, integer, integer) to authenticated;
grant execute on function pg_temp.gate(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Shape: the helpers are not API functions; postgres can manage sessions (the hosted check).
select is(has_function_privilege('authenticated', 'public.session_is_current()', 'execute'), false, 'session_is_current is not callable by members');
select is(has_function_privilege('anon', 'public.jwt_signed_in_at()', 'execute'), false, 'jwt_signed_in_at is not callable by anon');
select is(has_function_privilege('authenticated', 'public.avatar_write_allowed()', 'execute'), true, 'avatar_write_allowed is callable by members (Storage policies run as them)');
select is(has_function_privilege('anon', 'public.avatar_write_allowed()', 'execute'), false, 'but not by anon');
select is((select count(*)::int from pg_proc where proname in ('session_is_current', 'jwt_signed_in_at', 'session_started_at', 'avatar_write_allowed') and prosecdef
             and proconfig @> array['search_path=""'] and proowner = 'postgres'::regrole), 4, 'all four are SECURITY DEFINER, owned by postgres, with an empty search_path');
select is(has_function_privilege('authenticated', 'public.session_started_at()', 'execute'), false, 'session_started_at is not callable by members');
select ok(has_table_privilege('postgres', 'auth.sessions', 'select') and has_table_privilege('postgres', 'auth.sessions', 'delete'), 'postgres can read and delete auth.sessions');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars:%'
             and coalesce(with_check, '') like '%avatar_write_allowed%'), 2, 'both avatar write policies check avatar_write_allowed');

-- ---------------------------------------------------------------------------
-- L4: the gate refuses a token whose session is gone.
set local role authenticated;
select pg_temp.as_token('a1111111-1111-1111-1111-111111111111', '51111111-0000-0000-0000-000000000001', 3 * 86400);
select is(pg_temp.gate('/rpc/home_feed'), 'allowed', 'a current session passes the gate');
select is(pg_temp.gate('/rpc/get_onboarding_state'), 'allowed', 'including the sign-in state');
select pg_temp.as_token('a1111111-1111-1111-1111-111111111111', '59999999-0000-0000-0000-000000000009', 60);
select is(pg_temp.gate('/rpc/home_feed'), 'session_revoked', 'a session Auth no longer has is refused');
select is(pg_temp.gate('/rpc/get_onboarding_state'), 'session_revoked', 'even for the sign-in state (it cannot cancel a deletion)');
select is(pg_temp.gate('/profiles'), 'session_revoked', 'and for direct table reads');
select pg_temp.as_token('a1111111-1111-1111-1111-111111111111', '52222222-0000-0000-0000-000000000001', 60);
select is(pg_temp.gate('/rpc/home_feed'), 'session_revoked', 'another person''s session id does not count');
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"not-a-uuid"}', true);
select is(pg_temp.gate('/rpc/home_feed'), 'allowed', 'a malformed session id is not looked up (Auth never issues one)');
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"51111111-0000-0000-0000-000000000002","amr":[{"method":"password","timestamp":1}]}', true);
select is(pg_temp.gate('/rpc/home_feed'), 'password_session', 'a password session is still refused first');
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(pg_temp.gate('/rpc/home_feed'), 'allowed', 'no user (anon or service role): the gate does nothing');

-- ---------------------------------------------------------------------------
-- L3: deleting needs a sign-in from the last ten minutes, not a refresh.
set local role authenticated;
select pg_temp.as_token('a1111111-1111-1111-1111-111111111111', '51111111-0000-0000-0000-000000000001', 3 * 86400, 0);
select throws_ok($$ select public.delete_account() $$, 'P0001', 'reauth_required', 'a three-day-old sign-in with a token refreshed just now cannot delete');
select pg_temp.as_token('a1111111-1111-1111-1111-111111111111', '51111111-0000-0000-0000-000000000002', 601, 0);
select throws_ok($$ select public.delete_account() $$, 'P0001', 'reauth_required', 'nor one from just over ten minutes ago');
select set_config('request.jwt.claims', format('{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"51111111-0000-0000-0000-000000000002","iat":%s,"amr":["otp"]}', extract(epoch from now())::bigint), true);
select throws_ok($$ select public.delete_account() $$, 'P0001', 'reauth_required', 'nor a token whose amr has no time');
select is((select deleted_at from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'), null, 'nothing was deleted');

-- L1: a fresh sign-in deletes, and every session of the account ends.
select pg_temp.as_token('a1111111-1111-1111-1111-111111111111', '51111111-0000-0000-0000-000000000002', 30, 0);
reset role;
select is(public.jwt_signed_in_at(), to_timestamp(extract(epoch from now())::bigint - 30), 'jwt_signed_in_at reads the amr time');
set local role authenticated;
select lives_ok($$ select public.delete_account() $$, 'a sign-in from 30 seconds ago deletes the account');
reset role;
select ok((select deleted_at is not null from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'), 'soft deleted');
select is((select count(*)::int from auth.sessions where user_id = 'a1111111-1111-1111-1111-111111111111'), 0, 'both of Lena''s sessions are gone (both phones)');
select is((select count(*)::int from auth.sessions where user_id = 'b2222222-2222-2222-2222-222222222222'), 1, 'Adam''s session is untouched');
select is((select count(*)::int from public.push_tokens where account_id = 'a1111111-1111-1111-1111-111111111111'), 0, 'her push tokens are gone, as before');

-- L2: the old phones cannot cancel the deletion.
set local role authenticated;
select pg_temp.as_token('a1111111-1111-1111-1111-111111111111', '51111111-0000-0000-0000-000000000001', 3 * 86400);
select is(pg_temp.gate('/rpc/get_onboarding_state'), 'session_revoked', 'the old phone''s token is refused at the gate');
-- Even called directly (no gate), a session from before the deletion does not restore.
select is((public.get_onboarding_state())->>'has_profile', 'true', 'the state still reads');
reset role;
select ok((select deleted_at is not null from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'), 'but the account stays deleted');
set local role authenticated;
select pg_temp.as_token('a1111111-1111-1111-1111-111111111111', '51111111-0000-0000-0000-000000000002', 30);
select is((public.get_onboarding_state())->>'has_profile', 'true', 'the session that deleted reads its state');
reset role;
select ok((select deleted_at is not null from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'), 'and does not cancel the deletion either');
select is((select count(*)::int from public.mux_cleanup_jobs where owner_id = 'a1111111-1111-1111-1111-111111111111' and reason = 'account_restored'), 0, 'no playback restore was queued');

-- Signing in again in the same second as the deletion: the session's own start time decides
-- (amr has whole seconds only). A session that began just before the deletion does not restore.
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('51111111-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', now() - interval '1 millisecond', now()),
  ('51111111-0000-0000-0000-000000000003', 'a1111111-1111-1111-1111-111111111111', now() + interval '1 millisecond', now());
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"51111111-0000-0000-0000-000000000004","amr":[{"method":"otp","timestamp":%s}]}', extract(epoch from now())::bigint), true);
select is((public.get_onboarding_state())->>'has_profile', 'true', 'a session from a millisecond before the deletion reads its state');
reset role;
select ok((select deleted_at is not null from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'), 'and does not restore');
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"51111111-0000-0000-0000-000000000003","amr":[{"method":"otp","timestamp":%s}]}', extract(epoch from now())::bigint), true);
select is(pg_temp.gate('/rpc/get_onboarding_state'), 'allowed', 'the new session passes the gate');
select is((public.get_onboarding_state())->>'has_profile', 'true', 'signing back in restores');
reset role;
select is((select deleted_at from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'), null, 'deleted_at cleared');
-- After the window the same sign-in does not restore (the purge takes it).
update public.accounts set deleted_at = now() - interval '31 days' where id = 'a1111111-1111-1111-1111-111111111111';
set local role authenticated;
select is((public.get_onboarding_state())->>'has_profile', 'true', 'a sign-in after day 30 reads the state');
reset role;
select ok((select deleted_at is not null from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'), 'but does not restore');
update public.accounts set deleted_at = null where id = 'a1111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- L4: avatar writes.
set local role authenticated;
select pg_temp.as_token('b2222222-2222-2222-2222-222222222222', '52222222-0000-0000-0000-000000000001', 60);
select is(public.avatar_write_allowed(), true, 'an active member on a current session may write their avatar');
select pg_temp.as_token('b2222222-2222-2222-2222-222222222222', '59999999-0000-0000-0000-000000000009', 60);
select is(public.avatar_write_allowed(), false, 'not on a signed-out session');
reset role;
update public.accounts set moderation_status = 'suspended' where id = 'b2222222-2222-2222-2222-222222222222';
set local role authenticated;
select pg_temp.as_token('b2222222-2222-2222-2222-222222222222', '52222222-0000-0000-0000-000000000001', 60);
select is(public.avatar_write_allowed(), false, 'not while suspended (Storage does not pass pre_request)');
reset role;
update public.accounts set moderation_status = 'active', deleted_at = now() where id = 'b2222222-2222-2222-2222-222222222222';
set local role authenticated;
select is(public.avatar_write_allowed(), false, 'not in the deletion window');
reset role;
delete from public.profiles where id = 'b2222222-2222-2222-2222-222222222222';
update public.accounts set deleted_at = null where id = 'b2222222-2222-2222-2222-222222222222';
set local role authenticated;
select is(public.avatar_write_allowed(), false, 'not without a profile (as before)');
reset role;

-- The purge ends any session left (auth.users cascades), so its tokens are refused too.
insert into auth.sessions (id, user_id, created_at, updated_at) values ('52222222-0000-0000-0000-000000000002', 'b2222222-2222-2222-2222-222222222222', now(), now());
delete from auth.users where id = 'b2222222-2222-2222-2222-222222222222';
set local role authenticated;
select pg_temp.as_token('b2222222-2222-2222-2222-222222222222', '52222222-0000-0000-0000-000000000002', 60);
select is(pg_temp.gate('/rpc/home_feed'), 'session_revoked', 'a removed Auth user''s token is refused');
reset role;

select * from finish();
rollback;
