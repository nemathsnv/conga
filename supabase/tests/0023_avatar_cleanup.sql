-- pgTAP tests for L5 (20261016000203): profile photos are queued for removal from the public
-- avatars bucket when replaced or removed, and with the account when it is purged; never during
-- the 30-day window; never while a profile uses them. The files themselves are removed by the
-- avatar-cleanup function through the Storage API (not testable in SQL; see docs/release/SECURITY.md).
begin;
select plan(26);

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'avlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'avadam');
-- Objects as Storage writes them (rows in storage.objects; the files are not needed here).
insert into storage.objects (bucket_id, name, owner, created_at) values
  ('avatars', 'a1111111-1111-1111-1111-111111111111/avatar-1.jpg', 'a1111111-1111-1111-1111-111111111111', now() - interval '3 days'),
  ('avatars', 'a1111111-1111-1111-1111-111111111111/avatar-2.jpg', 'a1111111-1111-1111-1111-111111111111', now() - interval '2 days'),
  ('avatars', 'a1111111-1111-1111-1111-111111111111/avatar-stray.jpg', 'a1111111-1111-1111-1111-111111111111', now() - interval '2 hours'),
  ('avatars', 'a1111111-1111-1111-1111-111111111111/avatar-uploading.jpg', 'a1111111-1111-1111-1111-111111111111', now()),
  ('avatars', 'b2222222-2222-2222-2222-222222222222/avatar-1.jpg', 'b2222222-2222-2222-2222-222222222222', now() - interval '1 day'),
  ('avatars', 'b2222222-2222-2222-2222-222222222222/avatar-2.jpg', 'b2222222-2222-2222-2222-222222222222', now() - interval '1 day');
create function pg_temp.queued() returns text[] language sql as $$
  select coalesce(array_agg(name || ':' || reason order by name), '{}') from public.avatar_removals where done_at is null;
$$;

-- ---------------------------------------------------------------------------
select is(has_table_privilege('authenticated', 'public.avatar_removals', 'select'), false, 'members cannot read the queue');
select is(has_table_privilege('anon', 'public.avatar_removals', 'select'), false, 'nor anon');
select is(has_function_privilege('authenticated', 'public.avatar_cleanup_due(integer)', 'execute'), false, 'members cannot take names from it');
select is(has_function_privilege('authenticated', 'public.avatar_cleanup_finish(text[], text[], text)', 'execute'), false, 'nor mark them done');
select is(has_function_privilege('authenticated', 'public.queue_avatar_removal(text, uuid, text)', 'execute'), false, 'nor queue someone else''s photo');
select is(has_function_privilege('service_role', 'public.avatar_cleanup_due(integer)', 'execute'), true, 'the service role can (the worker)');
select is((select schedule from cron.job where jobname = 'avatar-cleanup'), '*/10 * * * *', 'scheduled every 10 minutes');
select lives_ok($$ select public.run_avatar_cleanup() $$, 'without its Vault secrets the schedule does nothing');

-- ---------------------------------------------------------------------------
-- Replacing and removing a photo (set_profile_photo, as the app does).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$ select public.set_profile_photo('a1111111-1111-1111-1111-111111111111/avatar-1.jpg') $$, 'Lena sets her first photo');
reset role;
select is(pg_temp.queued(), array['a1111111-1111-1111-1111-111111111111/avatar-2.jpg:stray', 'a1111111-1111-1111-1111-111111111111/avatar-stray.jpg:stray'],
          'nothing of hers in use is queued; uploads older than an hour that never became her photo are');
set local role authenticated;
select lives_ok($$ select public.set_profile_photo('a1111111-1111-1111-1111-111111111111/avatar-2.jpg') $$, 'she replaces it with avatar-2');
reset role;
select ok('a1111111-1111-1111-1111-111111111111/avatar-1.jpg:replaced' = any (pg_temp.queued()), 'the old photo is queued as replaced');
select ok(not ('a1111111-1111-1111-1111-111111111111/avatar-uploading.jpg:stray' = any (pg_temp.queued())), 'an upload from the last hour is left alone (its set_profile_photo may be on the way)');
select is(public.avatar_cleanup_due(), array['a1111111-1111-1111-1111-111111111111/avatar-1.jpg', 'a1111111-1111-1111-1111-111111111111/avatar-stray.jpg'],
          'the worker gets the stray and the replaced photo, never the one now in use (avatar-2, queued earlier as stray)');
set local role authenticated;
select lives_ok($$ select public.set_profile_photo(null) $$, 'she removes her photo');
reset role;
select ok('a1111111-1111-1111-1111-111111111111/avatar-2.jpg' = any (public.avatar_cleanup_due()), 'now avatar-2 is handed out too');

-- The worker's answer.
select is(public.avatar_cleanup_finish(array['a1111111-1111-1111-1111-111111111111/avatar-1.jpg', 'a1111111-1111-1111-1111-111111111111/avatar-2.jpg'],
                                       array['a1111111-1111-1111-1111-111111111111/avatar-stray.jpg'], 'timeout'), 2, 'two removed');
select is((select attempts from public.avatar_removals where name = 'a1111111-1111-1111-1111-111111111111/avatar-stray.jpg'), 1, 'a failure is counted');
select is(public.avatar_cleanup_due(), array['a1111111-1111-1111-1111-111111111111/avatar-stray.jpg'], 'and tried again');
update public.avatar_removals set attempts = 10 where name = 'a1111111-1111-1111-1111-111111111111/avatar-stray.jpg';
select is(public.avatar_cleanup_due(), '{}'::text[], 'at most ten times');

-- ---------------------------------------------------------------------------
-- Account deletion: nothing during the window; everything when the account is removed.
update public.profiles set photo_path = 'b2222222-2222-2222-2222-222222222222/avatar-2.jpg' where id = 'b2222222-2222-2222-2222-222222222222';
delete from public.avatar_removals where account_id = 'b2222222-2222-2222-2222-222222222222';
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated","amr":[{"method":"otp","timestamp":%s}]}', extract(epoch from now())::bigint), true);
select lives_ok($$ select public.delete_account() $$, 'Adam deletes his account');
reset role;
select is((select count(*)::int from public.avatar_removals where account_id = 'b2222222-2222-2222-2222-222222222222'), 0, 'nothing is queued in the window (signing back in restores his photo)');
update public.accounts set deleted_at = now() - interval '31 days' where id = 'b2222222-2222-2222-2222-222222222222';
select is(public.purge_account('b2222222-2222-2222-2222-222222222222'), true, 'day 30: purged');
select is((select array_agg(name || ':' || reason order by name) from public.avatar_removals where account_id = 'b2222222-2222-2222-2222-222222222222'),
          array['b2222222-2222-2222-2222-222222222222/avatar-1.jpg:account_removed', 'b2222222-2222-2222-2222-222222222222/avatar-2.jpg:account_removed'],
          'every object in his folder is queued, the photo in use included');
select ok(array['b2222222-2222-2222-2222-222222222222/avatar-1.jpg', 'b2222222-2222-2222-2222-222222222222/avatar-2.jpg'] <@ public.avatar_cleanup_due(), 'and handed to the worker (no profile uses them now)');
select is((select count(*)::int from public.avatar_removals where name like 'a1111111%' and reason = 'account_removed'), 0, 'nobody else''s photos');

select * from finish();
rollback;
