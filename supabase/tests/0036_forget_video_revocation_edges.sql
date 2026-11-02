-- pgTAP tests for 20261101000100, the cases 0035 leaves out (preflight of 2 Nov): a draft replaced by
-- re-recording or discarded; the claim's order and its one-job-per-asset rule; the cap reached in this
-- very claim (not paused before); a deletion already due earlier than the revocation; a revocation
-- that fails, is retried and runs out of attempts, with its owner and video kept for every retry.
begin;
select plan(30);

delete from public.responses;
delete from public.prompts;
delete from public.suggestions;
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
insert into public.suggestions (id, author_id, text) values
  ('5a000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'What''s one thing you miss from home?'),
  ('5a000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'Where do you go to be alone?');

-- Lena: a draft with an asset and playback (D1, to be replaced by re-recording), another (D2, to be
-- discarded), a live response (L1, deleted with a deletion already queued and due earlier) and a
-- live response (L2, kept). The founder's live response must never be touched.
insert into public.responses (id, kind, prompt_id, suggestion_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('a0000000-0000-0000-0000-0000000000d1', 'response', null, '5a000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 9000, 'draft', 'upD1', 'asD1', 'pbD1', null),
  ('a0000000-0000-0000-0000-0000000000d2', 'response', null, '5a000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 9000, 'draft', 'upD2', 'asD2', 'pbD2', null),
  ('a0000000-0000-0000-0000-0000000000c1', 'response', '11111111-aaaa-aaaa-aaaa-111111111111', null, 'a1111111-1111-1111-1111-111111111111', 9000, 'live', 'upL1', 'asL1', 'pbL1', now() - interval '1 day'),
  ('a0000000-0000-0000-0000-0000000000c2', 'response', '11111111-aaaa-aaaa-aaaa-111111111111', null, 'a1111111-1111-1111-1111-111111111111', 9000, 'live', 'upL2', 'asL2', 'pbL2', now() - interval '1 day'),
  ('f0000000-0000-0000-0000-00000000000a', 'response', '11111111-aaaa-aaaa-aaaa-111111111111', null, 'f0000000-0000-0000-0000-000000000001', 9911, 'live', 'upFounder', 'asFounder', 'pbFounder', now() - interval '1 day');
insert into public.video_uploads (account_id, upload_id, status) values
  ('a1111111-1111-1111-1111-111111111111', 'upD1new', 'active');

create function pg_temp.act(p_account uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_account, 'role', 'authenticated', 'iat', extract(epoch from now())::bigint,
    'amr', json_build_array(json_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint + 1)))::text, true);
$$;
grant execute on function pg_temp.act(uuid) to authenticated;
create function pg_temp.claimed(p jsonb, p_action text, p_asset text) returns integer language sql as $$
  select count(*)::int from jsonb_array_elements(p->'jobs') j where j->>'action' = p_action and j->>'asset_id' = p_asset;
$$;
create function pg_temp.job(p_action text, p_asset text) returns public.mux_cleanup_jobs language sql as $$
  select * from public.mux_cleanup_jobs where action = p_action and asset_id = p_asset order by created_at desc limit 1;
$$;
-- The lease the claim gave a job, from the claim's answer.
create function pg_temp.lease(p jsonb, p_action text, p_asset text) returns uuid language sql as $$
  select (j->>'lease')::uuid from jsonb_array_elements(p->'jobs') j where j->>'action' = p_action and j->>'asset_id' = p_asset;
$$;

-- Live, cap 2, nothing deleted yet in this window and not paused. (The window starts an hour back:
-- inside this one transaction now() never moves, and a deletion finished "now" must count.)
select public.mux_cleanup_set_mode('live', 'pgtap live');
select public.mux_cleanup_set_deletion_cap(2, 'pgtap cap');
update public.mux_cleanup_settings set deletions_paused_at = null, deletions_resumed_at = now() - interval '1 hour';

-- 1. Replaced by re-recording (post_draft) and discarded (discard_draft).
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is((public.post_draft('5a000000-0000-0000-0000-000000000001', 'upD1new', null, 9000))->>'status', 'draft', 're-recording replaces Lena''s draft');
select lives_ok($$ select public.discard_draft('5a000000-0000-0000-0000-000000000002') $$, 'and she discards her other draft');
reset role;
select is((pg_temp.job('sync_playback', 'asD1')).reason, 'abandoned', 'the replaced draft''s playback is queued for revocation');
select is((pg_temp.job('delete_asset', 'asD1')).reason, 'abandoned', 'and its asset for deletion');
select is((pg_temp.job('sync_playback', 'asD2')).reason, 'abandoned', 'the discarded draft''s playback is queued for revocation');
select ok((pg_temp.job('sync_playback', 'asD1')).not_before < (pg_temp.job('delete_asset', 'asD1')).not_before, 'the revocation is due before the deletion');
select is((select count(*)::int from public.mux_cleanup_jobs where upload_id = 'upD1new' or asset_id in ('asL1', 'asL2', 'asFounder')), 0,
          'nothing for the new draft, the live responses or the founder''s');

-- 2. One claim: the revocation is leased; its asset's deletion is not, in the same batch.
create temp table c1 as select public.mux_cleanup_claim(10, 120) as c;
select is((select pg_temp.claimed(c, 'sync_playback', 'asD1') + pg_temp.claimed(c, 'sync_playback', 'asD2') from c1), 2, 'both revocations are leased');
select is((select pg_temp.claimed(c, 'delete_asset', 'asD1') + pg_temp.claimed(c, 'delete_asset', 'asD2') from c1), 0, 'never their deletions beside them');
-- While a revocation runs, its asset's deletion is not leased either.
create temp table c2 as select public.mux_cleanup_claim(10, 120) as c;
select is((select jsonb_array_length(c->'jobs') from c2), 0, 'nothing more while both revocations run');

-- 3. A revocation that fails: retried with its owner and video kept, then out of attempts it fails
-- and is never recorded as done.
select is(public.mux_cleanup_finish((pg_temp.job('sync_playback', 'asD2')).id, (select pg_temp.lease(c, 'sync_playback', 'asD2') from c1), 'retry', '{"error": "mux_503"}')->>'status',
          'pending', 'a failed revocation goes back to pending');
select is((select status || '|' || attempts || '|' || last_error || '|' || owner_id || '|' || response_id from public.mux_cleanup_jobs where action = 'sync_playback' and asset_id = 'asD2'),
          'pending|1|mux_503|a1111111-1111-1111-1111-111111111111|a0000000-0000-0000-0000-0000000000d2', 'with its owner and video, for the next attempt''s checks');
select is((select mux_playback_id from public.responses where id = 'a0000000-0000-0000-0000-0000000000d2'), 'pbD2', 'the video does not forget its playback id until Mux confirms');
update public.mux_cleanup_jobs set attempts = max_attempts - 1, not_before = now() - interval '1 minute' where action = 'sync_playback' and asset_id = 'asD2';
-- Finish D1's revocation so its deletion may go; D2's deletion still waits for its revocation.
select is(public.mux_cleanup_finish((pg_temp.job('sync_playback', 'asD1')).id, (select pg_temp.lease(c, 'sync_playback', 'asD1') from c1), 'done', '{"outcome": "revoked", "revoked": ["pbD1"]}')->>'status',
          'done', 'D1''s revocation is done');
select is((select mux_playback_id from public.responses where id = 'a0000000-0000-0000-0000-0000000000d1'), null, 'and its video forgets the playback id');
create temp table c3 as select public.mux_cleanup_claim(10, 120) as c;
select is((select pg_temp.claimed(c, 'sync_playback', 'asD2') from c3), 1, 'D2''s revocation is leased again');
select is((select pg_temp.claimed(c, 'delete_asset', 'asD2') from c3), 0, 'and its deletion still is not');
select is((select pg_temp.claimed(c, 'delete_asset', 'asD1') from c3), 1, 'D1''s deletion runs once its revocation is done');
select is(public.mux_cleanup_finish((pg_temp.job('sync_playback', 'asD2')).id, (select pg_temp.lease(c, 'sync_playback', 'asD2') from c3), 'retry', '{"error": "mux_503"}')->>'status',
          'failed', 'out of attempts, the revocation fails');
select is((select status || '|' || coalesce(result->>'outcome', 'none') from public.mux_cleanup_jobs where action = 'sync_playback' and asset_id = 'asD2'), 'failed|none',
          'and is not recorded as revoked');
select ok(((public.mux_cleanup_health())->'metrics'->>'failed')::int >= 1, 'the health check counts it as failed');
-- D1's deletion: Mux deleted it, so it counts towards the cap.
select is(public.mux_cleanup_finish((pg_temp.job('delete_asset', 'asD1')).id, (select pg_temp.lease(c, 'delete_asset', 'asD1') from c3), 'done', '{"outcome": "deleted"}')->>'status',
          'done', 'D1''s asset deleted at Mux (one of two for the cap)');

-- 4. A deletion already queued and due earlier: mux_forget_video still puts the revocation first.
-- Then the worst order anyway (the deletion due first) with the cap reached in this claim, not
-- paused before: the claim pauses deletions and still leases the revocation.
select public.mux_cleanup_enqueue('delete_asset', 'abandoned', 'asL1', 'upL1', 'a0000000-0000-0000-0000-0000000000c1', 'a1111111-1111-1111-1111-111111111111', now() - interval '1 hour');
update public.mux_cleanup_jobs set status = 'done', finished_at = now(), result = '{"outcome": "deleted"}', owner_id = null, response_id = null
 where action = 'delete_asset' and asset_id = 'asD2';
select is(public.mux_cleanup_deletions_counted(), 2, 'two deletions done in this window: the cap is reached');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.delete_video('a0000000-0000-0000-0000-0000000000c1') $$, 'Lena deletes L1, whose deletion was already queued');
reset role;
select ok((pg_temp.job('sync_playback', 'asL1')).not_before < (pg_temp.job('delete_asset', 'asL1')).not_before, 'the revocation is still due first');
update public.mux_cleanup_jobs set not_before = now() - interval '1 hour' where action = 'delete_asset' and asset_id = 'asL1';
create temp table c4 as select public.mux_cleanup_claim(10, 120) as c;
select is((select pg_temp.claimed(c, 'delete_asset', 'asL1') from c4), 0, 'the cap holds the deletion');
select is((select pg_temp.claimed(c, 'sync_playback', 'asL1') from c4), 1, 'and the revocation is leased all the same');
select ok((select deletions_paused_at is not null from public.mux_cleanup_settings), 'the claim paused deletions for a person');

-- Untouched.
select is((select status || '|' || mux_playback_id from public.responses where id = 'a0000000-0000-0000-0000-0000000000c2'), 'live|pbL2', 'Lena''s other response stays live with its playback');
select is((select status || '|' || mux_playback_id from public.responses where id = 'f0000000-0000-0000-0000-00000000000a'), 'live|pbFounder', 'and so does the founder''s');

select * from finish();
rollback;
