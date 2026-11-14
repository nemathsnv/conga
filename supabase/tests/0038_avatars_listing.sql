-- pgTAP tests for F3 (20261113000100): the avatars bucket cannot be listed or enumerated by anyone
-- but the owner of a folder. Photos stay public by URL (the bucket is public; Storage serves
-- /object/public/ without RLS, which SQL cannot test: see the HTTP probe in the F3 evidence), and the
-- owner's writes keep working. Storage's list endpoint reads through storage.search /
-- list_objects_with_delimiter, which are SECURITY INVOKER, so RLS on storage.objects is what decides.
begin;
select plan(31);

-- A and B are members (profile), C is signed in without a profile. Each has a current session.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f3a@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f3b@example.com', '{}', '{}', now(), now()),
  ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'f3c@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Fa Owner', 'f3owner'),
  ('b2222222-2222-2222-2222-222222222222', 'Fb Other', 'f3other');
insert into auth.sessions (id, user_id, created_at, updated_at)
  select ('5' || substr(id::text, 2))::uuid, id, now(), now() from auth.users where email like 'f3%@example.com';
-- Objects as Storage writes them (rows only; files are not needed here).
insert into storage.objects (bucket_id, name, owner) values
  ('avatars', 'a1111111-1111-1111-1111-111111111111/avatar-1.jpg', 'a1111111-1111-1111-1111-111111111111'),
  ('avatars', 'a1111111-1111-1111-1111-111111111111/avatar-2.jpg', 'a1111111-1111-1111-1111-111111111111'),
  ('avatars', 'b2222222-2222-2222-2222-222222222222/avatar-1.jpg', 'b2222222-2222-2222-2222-222222222222');

create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'role', 'authenticated', 'session_id', ('5' || substr(p_user::text, 2))::uuid,
    'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint)))::text, true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true);
$$;
-- Storage writes with INSERT/UPDATE ... RETURNING; data-modifying statements cannot sit in a
-- subquery, so these run them and count the rows the caller gets back (RLS applies to RETURNING).
create function pg_temp.insert_returning(p_name text, p_owner uuid) returns int language sql as $$
  with i as (insert into storage.objects (bucket_id, name, owner) values ('avatars', p_name, p_owner) returning 1) select count(*)::int from i;
$$;
create function pg_temp.update_returning(p_name text) returns int language sql as $$
  with u as (update storage.objects set metadata = '{"mimetype": "image/jpeg"}' where bucket_id = 'avatars' and name = p_name returning 1) select count(*)::int from u;
$$;
grant execute on function pg_temp.as_user(uuid), pg_temp.as_anon(), pg_temp.insert_returning(text, uuid), pg_temp.update_returning(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Structure: the public read policy is gone; the replacement is owner-only; nothing else changed.
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars: anyone can read'),
          0, 'the policy "avatars: anyone can read" is gone');
select is((select roles::text || '|' || cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars: read your own folder'),
          '{authenticated}|SELECT', 'the new read policy is SELECT for authenticated only');
select ok((select qual from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars: read your own folder') like '%foldername%auth.uid()%',
          'and it is limited to the caller''s own folder');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL')
             and (roles && array['public', 'anon']::name[]) and coalesce(qual, '') like '%avatars%'),
          0, 'no SELECT/ALL policy on storage.objects for public or anon mentions avatars');
select is((select string_agg(policyname, ';' order by policyname) from pg_policies where schemaname = 'storage' and policyname like 'avatars:%'),
          'avatars: delete your own folder;avatars: insert into your own folder;avatars: read your own folder;avatars: update your own folder',
          'the four avatar policies: read, insert, update, delete, each own folder');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars:%'
             and coalesce(with_check, '') like '%avatar_write_allowed%'), 2, 'both avatar write policies still check avatar_write_allowed');
select is((select public::text || '|' || file_size_limit || '|' || array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'avatars'),
          'true|5242880|image/jpeg,image/png,image/webp', 'the bucket is still public (photos load by URL) with the same limits');
select is((select count(*)::int from pg_proc where pronamespace = 'storage'::regnamespace and proname in ('search', 'list_objects_with_delimiter', 'search_v2') and prosecdef),
          0, 'Storage''s list functions are SECURITY INVOKER, so these policies decide what they return');

-- ---------------------------------------------------------------------------
-- Negative: anon cannot list or enumerate.
set local role anon;
select pg_temp.as_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 0, 'anon reads no avatars rows');
select is((select count(*)::int from storage.search('', 'avatars')), 0, 'anon: listing the bucket root returns nothing (no account ids)');
select is((select count(*)::int from storage.search('a1111111-1111-1111-1111-111111111111/', 'avatars')), 0, 'anon: listing A''s folder returns nothing');
select is((select count(*)::int from storage.list_objects_with_delimiter('avatars', '', '/')), 0, 'anon: list_objects_with_delimiter (S3 list) returns nothing');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('avatars', 'a1111111-1111-1111-1111-111111111111/anon.jpg')$$,
                 '42501', null, 'anon still cannot upload');
reset role;

-- Negative: a member who is not the owner cannot list another folder.
set local role authenticated;
select pg_temp.as_user('b2222222-2222-2222-2222-222222222222');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like 'a1111111-%'), 0, 'member B reads none of A''s rows');
select is((select array_agg(name order by name) from storage.search('', 'avatars'))::text, '{b2222222-2222-2222-2222-222222222222}',
          'member B: the bucket root shows only B''s own folder');
select is((select count(*)::int from storage.search('a1111111-1111-1111-1111-111111111111/', 'avatars')), 0, 'member B: listing A''s folder returns nothing');
select is((select count(*)::int from storage.list_objects_with_delimiter('avatars', 'a1111111-1111-1111-1111-111111111111/', '/')), 0,
          'member B: S3 list of A''s folder returns nothing');
select throws_ok($$insert into storage.objects (bucket_id, name, owner) values ('avatars', 'a1111111-1111-1111-1111-111111111111/evil.jpg', 'b2222222-2222-2222-2222-222222222222')$$,
                 '42501', null, 'member B still cannot upload into A''s folder');
select is(pg_temp.update_returning('a1111111-1111-1111-1111-111111111111/avatar-1.jpg'), 0,
          'member B cannot overwrite A''s object (no row matched)');
reset role;

-- Negative: a signed-in account without a profile cannot list either.
set local role authenticated;
select pg_temp.as_user('c3333333-3333-3333-3333-333333333333');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars'), 0, 'non-member C reads no avatars rows');
select is((select count(*)::int from storage.search('', 'avatars')), 0, 'non-member C: the bucket root returns nothing');
reset role;

-- Positive: the owner still lists, uploads (INSERT ... RETURNING, as Storage does) and upserts.
set local role authenticated;
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
select is((select array_agg(name order by name) from storage.objects where bucket_id = 'avatars')::text,
          '{a1111111-1111-1111-1111-111111111111/avatar-1.jpg,a1111111-1111-1111-1111-111111111111/avatar-2.jpg}',
          'owner A reads exactly A''s own two rows');
select is((select array_agg(name order by name) from storage.search('a1111111-1111-1111-1111-111111111111/', 'avatars'))::text, '{avatar-1.jpg,avatar-2.jpg}',
          'owner A lists A''s own folder');
select is((select array_agg(name order by name) from storage.search('', 'avatars'))::text, '{a1111111-1111-1111-1111-111111111111}',
          'owner A: the bucket root shows only A''s own folder');
select is(pg_temp.insert_returning('a1111111-1111-1111-1111-111111111111/avatar-3.jpg', 'a1111111-1111-1111-1111-111111111111'), 1,
          'owner A uploads a new photo, and the RETURNING row is visible (Storage''s upload path)');
select is(pg_temp.update_returning('a1111111-1111-1111-1111-111111111111/avatar-3.jpg'), 1,
          'owner A can overwrite (upsert) their own photo');
select lives_ok($$select public.set_profile_photo('a1111111-1111-1111-1111-111111111111/avatar-3.jpg')$$, 'owner A records the new photo (set_profile_photo)');
reset role;

-- Positive: the service role (avatar-cleanup) still sees every folder; the cleanup queue still works.
set local role service_role;
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like any (array['a1111111-%', 'b2222222-%'])), 4,
          'the service role sees every avatars row');
select is((select count(*)::int from storage.search('', 'avatars') where name in ('a1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222')), 2,
          'the service role lists every folder');
reset role;
-- Account deletion: the trigger that queues a removed account's folder still sees its objects.
delete from auth.users where id = 'b2222222-2222-2222-2222-222222222222';
select is((select array_agg(name order by name) from public.avatar_removals where reason = 'account_removed' and account_id = 'b2222222-2222-2222-2222-222222222222')::text, '{b2222222-2222-2222-2222-222222222222/avatar-1.jpg}',
          'deleting B''s account still queues every object in B''s folder for avatar-cleanup');
select ok(exists (select 1 from public.profiles where id = 'a1111111-1111-1111-1111-111111111111' and photo_path = 'a1111111-1111-1111-1111-111111111111/avatar-3.jpg'),
          'the profile now points at the new photo (public URL is built from this path)');

select * from finish();
rollback;
