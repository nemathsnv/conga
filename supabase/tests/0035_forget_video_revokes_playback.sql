-- pgTAP tests for 20261101000100: a video its author deletes, abandons or replaces loses its public
-- playback at Mux even while the deletion cap holds its asset deletion.
begin;
select plan(15);

delete from public.responses;
delete from public.prompts;
delete from public.video_uploads;
delete from public.mux_cleanup_jobs;
delete from public.mux_cleanup_runs;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'founder@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('f0000000-0000-0000-0000-000000000001', 'Founder', 'testfounder');
insert into public.prompts (id, text, status, published_at) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Be honest about the place you live.', 'live', now());

-- Lena has two live responses to the same prompt (L1, L2) and one still processing with an asset
-- (L3); the founder has one live response that nothing here may touch.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('a0000000-0000-0000-0000-0000000000c1', '11111111-aaaa-aaaa-aaaa-111111111111', 'a1111111-1111-1111-1111-111111111111', 9000, 'live', 'upL1', 'asL1', 'pbL1', now() - interval '1 day'),
  ('a0000000-0000-0000-0000-0000000000c2', '11111111-aaaa-aaaa-aaaa-111111111111', 'a1111111-1111-1111-1111-111111111111', 9000, 'live', 'upL2', 'asL2', 'pbL2', now() - interval '1 day'),
  ('f0000000-0000-0000-0000-00000000000a', '11111111-aaaa-aaaa-aaaa-111111111111', 'f0000000-0000-0000-0000-000000000001', 9911, 'live', 'upFounder', 'asFounder', 'pbFounder', now() - interval '1 day');
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id) values
  ('a0000000-0000-0000-0000-0000000000c3', '11111111-aaaa-aaaa-aaaa-111111111111', 'a1111111-1111-1111-1111-111111111111', 9000, 'processing', 'upL3', 'asL3');

create function pg_temp.act(p_account uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_account, 'role', 'authenticated', 'iat', extract(epoch from now())::bigint,
    'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint + 1)))::text, true);
$$;
grant execute on function pg_temp.act(uuid) to authenticated;
create function pg_temp.claimed(p jsonb, p_action text, p_asset text) returns integer language sql as $$
  select count(*)::int from jsonb_array_elements(p->'jobs') j where j->>'action' = p_action and j->>'asset_id' = p_asset;
$$;

-- Live, with the cap already reached and deletions paused (the hosted state after two deletions).
select public.mux_cleanup_set_mode('live', 'pgtap live');
select public.mux_cleanup_set_deletion_cap(2, 'pgtap cap');
update public.mux_cleanup_settings set deletions_paused_at = now() - interval '1 minute';

set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.delete_video('a0000000-0000-0000-0000-0000000000c1') $$, 'Lena deletes one of her two responses to the prompt');
select lives_ok($$ select public.abandon_response('a0000000-0000-0000-0000-0000000000c3') $$, 'and abandons the one still processing');
reset role;

select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asL1' and action = 'sync_playback' and status = 'pending' and reason = 'author_deleted'), 1,
          'the deleted response''s playback is queued for revocation');
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asL1' and action = 'delete_asset' and status = 'pending' and reason = 'author_deleted'), 1,
          'and its asset for deletion, as before');
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asL3' and action = 'sync_playback' and reason = 'abandoned'), 1,
          'an abandoned video with an asset is revoked too');
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id in ('asL2', 'asFounder')), 0,
          'nothing for Lena''s other response or the founder''s');

-- Again: one job of each kind, never two.
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select throws_ok($$ select public.delete_video('a0000000-0000-0000-0000-0000000000c1') $$, 'P0001', 'video_not_found', 'deleting twice is refused');
reset role;
select public.mux_forget_video('a0000000-0000-0000-0000-0000000000c1', 'asL1', 'upL1', 'a1111111-1111-1111-1111-111111111111', 'author_deleted');
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asL1'), 2, 'forgetting again merges into the open jobs');

-- The paused cap holds the deletions but not the revocations, which the worker is told to revoke.
create temp table c1 as select public.mux_cleanup_claim(10, 120) as c;
select is((select pg_temp.claimed(c, 'delete_asset', 'asL1') + pg_temp.claimed(c, 'delete_asset', 'asL3') from c1), 0, 'with deletions paused, no deletion is leased');
select is((select pg_temp.claimed(c, 'sync_playback', 'asL1') from c1), 1, 'the revocation of the deleted response is leased');
select is((select pg_temp.claimed(c, 'sync_playback', 'asL3') from c1), 1, 'and of the abandoned one');
select is((select bool_and((j->>'playback_wanted')::boolean = false) from c1, jsonb_array_elements(c->'jobs') j where j->>'action' = 'sync_playback'), true,
          'both with playback not wanted, so the worker revokes');
select is((select count(*)::int from public.mux_cleanup_jobs where action = 'delete_asset' and asset_id in ('asL1', 'asL3') and status = 'pending'), 2,
          'the deletions wait for the resume');

-- Untouched.
select is((select status || '|' || mux_playback_id from public.responses where id = 'a0000000-0000-0000-0000-0000000000c2'), 'live|pbL2', 'Lena''s other response stays live with its playback');
select is((select status || '|' || mux_playback_id from public.responses where id = 'f0000000-0000-0000-0000-00000000000a'), 'live|pbFounder', 'and so does the founder''s');

select * from finish();
rollback;
