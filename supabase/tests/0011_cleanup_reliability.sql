-- pgTAP tests for the stage 3 reliability fixes (20261013000100): an author's deletion after a
-- moderator's restore is immediate (G2); the daily sweep does not queue again what is failed or
-- held by an open moderation case (G5); the health check and the record of the worker's calls
-- (G6). Inside one transaction now() does not move, so "later" is written as moving recorded
-- times back.
begin;
select plan(103);

delete from public.responses;
delete from public.prompts;
delete from public.video_uploads;
delete from public.mux_cleanup_jobs;
delete from public.account_purge_failures;
delete from public.reports;
delete from public.moderation_actions;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now()),
  ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'founder@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam'),
  ('f0000000-0000-0000-0000-000000000001', 'Founder', 'testfounder');
insert into public.prompts (id, text, status, published_at) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Be honest about the place you live.', 'live', now()),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'Speak in every language you know.', 'live', now()),
  ('33333333-aaaa-aaaa-aaaa-333333333333', 'Newcomers unlearn?', 'live', now()),
  ('44444444-aaaa-aaaa-aaaa-444444444444', 'Best sunset spot?', 'live', now());

-- The founder's one live video, as on the hosted project: it must come through untouched.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('f0000000-0000-0000-0000-00000000000a', '11111111-aaaa-aaaa-aaaa-111111111111', 'f0000000-0000-0000-0000-000000000001', 9911, 'live', 'upFounder', 'asFounder', 'pbFounder', now() - interval '1 day');
insert into public.video_uploads (account_id, upload_id, status, created_at, reserved_until, expires_at, activated_at, claimed_at, response_id)
values ('f0000000-0000-0000-0000-000000000001', 'upFounder', 'claimed', now() - interval '1 day', now() - interval '1 day', now() - interval '23 hours', now() - interval '1 day', now() - interval '1 day', 'f0000000-0000-0000-0000-00000000000a');
create temp table founder_before as select md5(r::text) as h from public.responses r where id = 'f0000000-0000-0000-0000-00000000000a';

-- Lena's videos: G1 (removed, restored, then deleted by her), G2 (the same with a pending review
-- and an open report), G3 (deleted while its restore is running at Mux). Adam's A1 stays removed.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-aaaa-aaaa-aaaa-111111111111', 'a1111111-1111-1111-1111-111111111111', 9000, 'live', 'upG1', 'asG1', 'pbG1', now()),
  ('a1000000-0000-0000-0000-000000000002', '22222222-aaaa-aaaa-aaaa-222222222222', 'a1111111-1111-1111-1111-111111111111', 9000, 'live', 'upG2', 'asG2', 'pbG2', now()),
  ('a1000000-0000-0000-0000-000000000003', '33333333-aaaa-aaaa-aaaa-333333333333', 'a1111111-1111-1111-1111-111111111111', 9000, 'live', 'upG3', 'asG3', 'pbG3', now()),
  ('ad000000-0000-0000-0000-000000000001', '11111111-aaaa-aaaa-aaaa-111111111111', 'b2222222-2222-2222-2222-222222222222', 9000, 'live', 'upA1', 'asA1', 'pbA1', now());

create function pg_temp.err(p_sql text) returns text language plpgsql as $$
declare m text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text;
  return m;
end;
$$;
grant execute on function pg_temp.err(text) to authenticated, anon;
create function pg_temp.act(p_account uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_account, 'role', 'authenticated', 'iat', extract(epoch from now())::bigint)::text, true);
$$;
grant execute on function pg_temp.act(uuid) to authenticated;
create function pg_temp.job(p_action text, p_target text) returns public.mux_cleanup_jobs language sql stable as $$
  select * from public.mux_cleanup_jobs where action = p_action and (asset_id = p_target or upload_id = p_target)
   order by (status in ('pending', 'running', 'review')) desc, created_at desc limit 1;
$$;
create function pg_temp.jobs_n(p_target text) returns integer language sql stable as $$
  select count(*)::int from public.mux_cleanup_jobs where action = 'delete_asset' and (asset_id = p_target or upload_id = p_target);
$$;
create function pg_temp.claim_only(p_action text, p_target text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  update public.mux_cleanup_jobs set not_before = not_before + interval '1000 days'
   where status = 'pending' and not (action = p_action and (asset_id is not distinct from p_target or upload_id is not distinct from p_target));
  v := (public.mux_cleanup_claim(50, 120))->'jobs';
  update public.mux_cleanup_jobs set not_before = not_before - interval '1000 days'
   where status = 'pending' and not_before > now() + interval '900 days';
  return v;
end;
$$;
create function pg_temp.claimed(p_claims jsonb, p_action text, p_target text) returns jsonb language sql immutable as $$
  select e from jsonb_array_elements(p_claims) e where e->>'action' = p_action and (e->>'asset_id' = p_target or e->>'upload_id' = p_target);
$$;
create function pg_temp.finish(p_action text, p_target text, p_outcome text, p_detail jsonb default '{}'::jsonb) returns text language sql as $$
  select public.mux_cleanup_finish(j.id, j.lease_id, p_outcome, p_detail)->>'status' from public.mux_cleanup_jobs j
   where j.action = p_action and (j.asset_id = p_target or j.upload_id = p_target) and j.status = 'running';
$$;
select public.mux_cleanup_set_mode('live', 'pgtap');

-- ===========================================================================
-- G2. Removal, restore, then the author's deletion: the asset is deleted at once.
-- ===========================================================================
-- G1: removed with no review, so the case closes at the removal and the asset is kept 30 days.
select lives_ok($$ select public.mod_remove_video('a1000000-0000-0000-0000-000000000001', 'Spam.', 'nemat') $$, 'G1 is removed');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asG1'), 'sync_playback', 'asG1')->>'playback_wanted', 'false', 'its playback is revoked');
select is(pg_temp.finish('sync_playback', 'asG1', 'done', '{"outcome": "revoked", "revoked": ["pbG1"]}'), 'done', 'at Mux');
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asG1'), 'delete_asset', 'asG1'), null, 'the deletion is not leased: the asset is kept');
select ok((pg_temp.job('delete_asset', 'asG1')).not_before > now() + interval '29 days', 'its deletion waits 30 days from the removal');
select lives_ok($$ select public.mod_restore_video('a1000000-0000-0000-0000-000000000001', 'Mistake.', 'nemat') $$, 'G1 is restored');
select is((pg_temp.job('delete_asset', 'asG1')).status, 'skipped', 'the restore closes the removal''s retention');
select is((pg_temp.job('delete_asset', 'asG1')).result->>'outcome', 'kept', 'recorded as kept, not deleted');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asG1'), 'sync_playback', 'asG1')->>'playback_wanted', 'true', 'its playback is restored');
select is(pg_temp.finish('sync_playback', 'asG1', 'done', '{"outcome": "restored", "playback_id": "pbG1new", "asset_status": "ready"}'), 'done', 'with a new playback id');
select is((select status from public.responses where id = 'a1000000-0000-0000-0000-000000000001'), 'live', 'G1 is live again');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.delete_video('a1000000-0000-0000-0000-000000000001') $$, 'Lena deletes G1');
reset role;
select ok((pg_temp.job('delete_asset', 'asG1')).not_before <= now(), 'its asset''s deletion is due now, not 30 days after the old removal');
select is((pg_temp.job('delete_asset', 'asG1')).reason, 'author_deleted', 'as an author''s deletion');
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asG1'), 'delete_asset', 'asG1')->>'reason', 'author_deleted', 'the worker leases it at once');
select is(pg_temp.finish('delete_asset', 'asG1', 'done', '{"outcome": "deleted"}'), 'done', 'and the asset is deleted');

-- G2: removed, a review requested (the case stays open), reversed; then reported again and
-- deleted by its author. The open report does not stop the deletion, and stays open.
select lives_ok($$ select public.mod_remove_video('a1000000-0000-0000-0000-000000000002', 'Spam.', 'nemat') $$, 'G2 is removed');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.request_review((select id from public.moderation_actions where target_id = 'a1000000-0000-0000-0000-000000000002')) $$, 'Lena requests a review');
reset role;
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asG2'), 'delete_asset', 'asG2'), null, 'with the review open the deletion is not leased');
select is((pg_temp.job('delete_asset', 'asG2')).status, 'skipped', 'it is kept (skipped) while the case is open');
select lives_ok($$ select public.mod_decide_review((select id from public.moderation_actions where target_id = 'a1000000-0000-0000-0000-000000000002' and kind = 'remove'), 'reversed', 'nemat') $$, 'the removal is reversed');
select is((select status from public.responses where id = 'a1000000-0000-0000-0000-000000000002'), 'live', 'G2 is live again');
set local role authenticated;
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select lives_ok($$ select public.report_item('video', 'a1000000-0000-0000-0000-000000000002', 'spam') $$, 'Adam reports G2 again');
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.delete_video('a1000000-0000-0000-0000-000000000002') $$, 'Lena deletes G2 with the report open');
reset role;
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asG2' and action = 'delete_asset' and status = 'pending' and reason = 'author_deleted' and not_before <= now()), 1, 'one deletion, due now');
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asG2'), 'delete_asset', 'asG2')->>'reason', 'author_deleted', 'leased at once');
select is(pg_temp.finish('delete_asset', 'asG2', 'done', '{"outcome": "deleted"}'), 'done', 'the asset is deleted');
select is((select status from public.reports where target_id = 'a1000000-0000-0000-0000-000000000002' and status = 'open'), 'open', 'the report stays open');

-- G3: deleted by its author while the restore of its playback is running at Mux.
select lives_ok($$ select public.mod_remove_video('a1000000-0000-0000-0000-000000000003', 'Spam.', 'nemat') $$, 'G3 is removed');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asG3'), 'sync_playback', 'asG3')->>'playback_wanted', 'false', 'revoked');
select is(pg_temp.finish('sync_playback', 'asG3', 'done', '{"outcome": "revoked", "revoked": ["pbG3"]}'), 'done', 'at Mux');
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asG3'), 'delete_asset', 'asG3'), null, 'its deletion waits for the retention');
select lives_ok($$ select public.mod_restore_video('a1000000-0000-0000-0000-000000000003', 'Mistake.', 'nemat') $$, 'G3 is restored');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asG3'), 'sync_playback', 'asG3')->>'playback_wanted', 'true', 'the restore is leased (Mux is creating the id)');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.delete_video('a1000000-0000-0000-0000-000000000003') $$, 'meanwhile Lena deletes G3');
reset role;
select ok((pg_temp.job('delete_asset', 'asG3')).not_before <= now(), 'its deletion is due now');
select is(pg_temp.claimed((public.mux_cleanup_claim(50, 120))->'jobs', 'delete_asset', 'asG3'), null, 'but not leased while the restore runs: one job per asset');
update public.mux_cleanup_jobs set status = 'pending', lease_id = null, locked_until = null, attempts = 0 where status = 'running' and asset_id <> 'asG3';
select is((select (public.mux_cleanup_check(id, lease_id))->>'wanted' from public.mux_cleanup_jobs where asset_id = 'asG3' and status = 'running'), 'false', 'the restore''s last check says: no longer wanted');
select is(pg_temp.finish('sync_playback', 'asG3', 'done', '{"outcome": "revoked", "revoked": ["pbG3new"], "detail": "no longer wanted after creating"}'), 'done', 'so the worker removes the id it created');
select is((select mux_playback_id from public.responses where id = 'a1000000-0000-0000-0000-000000000003'), null, 'no playback id recorded');
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asG3'), 'delete_asset', 'asG3')->>'reason', 'author_deleted', 'then the deletion is leased');
select is((select (public.mux_cleanup_check(id, lease_id))->>'hold' from public.mux_cleanup_jobs where asset_id = 'asG3' and status = 'running'), null, 'with no hold');
select is(pg_temp.finish('delete_asset', 'asG3', 'done', '{"outcome": "deleted"}'), 'done', 'and the asset is deleted');

-- A video that stays removed keeps its asset: the retention is untouched by the others' deletions.
select lives_ok($$ select public.mod_remove_video('ad000000-0000-0000-0000-000000000001', 'Spam.', 'nemat') $$, 'Adam''s A1 is removed');
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asA1'), 'delete_asset', 'asA1'), null, 'its deletion is not leased');
set local role authenticated;
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select is(pg_temp.err($$ select public.delete_video('ad000000-0000-0000-0000-000000000001') $$), 'video_not_found', 'its author cannot delete a removed video');
reset role;
select ok((pg_temp.job('delete_asset', 'asA1')).not_before > now() + interval '29 days', 'it is kept for 30 days after the case closed');
select is((pg_temp.job('delete_asset', 'asA1')).reason, 'moderation_removed', 'as the removal''s retention');

-- ===========================================================================
-- G5. The sweep leaves failed and held assets alone, and does not queue twice.
-- ===========================================================================
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, deleted_at) values
  ('a1000000-0000-0000-0000-000000000004', '44444444-aaaa-aaaa-aaaa-444444444444', 'a1111111-1111-1111-1111-111111111111', 9000, 'deleted', 'upF1', 'asF1', now() - interval '3 days');
insert into public.mux_cleanup_jobs (action, reason, status, dedupe_key, asset_id, upload_id, response_id, owner_id, attempts, finished_at, last_error, result)
values ('delete_asset', 'author_deleted', 'failed', 'delete_asset:asF1', 'asF1', 'upF1', 'a1000000-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', 1, now(), 'passthrough_mismatch', '{"outcome": "not_verified", "detail": "passthrough_mismatch"}');
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ad000000-0000-0000-0000-000000000002', '22222222-aaaa-aaaa-aaaa-222222222222', 'b2222222-2222-2222-2222-222222222222', 9000, 'live', 'upA2', 'asA2', 'pbA2', now());
select lives_ok($$ select public.mod_remove_video('ad000000-0000-0000-0000-000000000002', 'Spam.', 'nemat') $$, 'Adam''s A2 is removed');
set local role authenticated;
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select lives_ok($$ select public.request_review((select id from public.moderation_actions where target_id = 'ad000000-0000-0000-0000-000000000002')) $$, 'and he requests a review');
reset role;
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asA2'), 'delete_asset', 'asA2'), null, 'its deletion is not leased');
select is((pg_temp.job('delete_asset', 'asA2')).status, 'skipped', 'it is skipped while the case is open');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asA2'), 'sync_playback', 'asA2')->>'playback_wanted', 'false', 'its playback is revoked');
select is(pg_temp.finish('sync_playback', 'asA2', 'done', '{"outcome": "revoked", "revoked": ["pbA2"]}'), 'done', 'at Mux');
insert into public.video_uploads (account_id, upload_id, status, created_at, expires_at, activated_at) values
  ('a1111111-1111-1111-1111-111111111111', 'upOrph', 'active', now() - interval '3 days', now() - interval '3 days' + interval '1 hour', now() - interval '3 days');
create temp table sweep_list as select jsonb_build_array(
  jsonb_build_object('id', 'asF1', 'upload_id', 'upF1', 'passthrough', 'a1111111-1111-1111-1111-111111111111', 'created_at', extract(epoch from now() - interval '3 days')::bigint::text),
  jsonb_build_object('id', 'asA2', 'upload_id', 'upA2', 'passthrough', 'b2222222-2222-2222-2222-222222222222', 'created_at', extract(epoch from now() - interval '3 days')::bigint::text),
  jsonb_build_object('id', 'asOrph', 'upload_id', 'upOrph', 'passthrough', 'a1111111-1111-1111-1111-111111111111', 'created_at', extract(epoch from now() - interval '3 days')::bigint::text),
  jsonb_build_object('id', 'asNoOwner', 'upload_id', 'upNobody', 'created_at', extract(epoch from now() - interval '3 days')::bigint::text),
  jsonb_build_object('id', 'asNoUpload', 'passthrough', 'a1111111-1111-1111-1111-111111111111', 'created_at', extract(epoch from now() - interval '3 days')::bigint::text),
  jsonb_build_object('id', 'asFounder', 'upload_id', 'upFounder', 'passthrough', 'f0000000-0000-0000-0000-000000000001', 'created_at', extract(epoch from now() - interval '3 days')::bigint::text)
) as l;
select is(public.mux_cleanup_sweep((select l from sweep_list), 86400, true),
  '{"seen": 6, "young": 0, "in_use": 1, "queued": 1, "review": 2, "held": 1, "unresolved": 1, "dry_run": true, "would_queue": ["asOrph"], "would_review": ["asNoOwner", "asNoUpload"]}'::jsonb,
  'a dry run: the failed asset unresolved, the open case held, the orphan queued, unproven owners for review');
select is(public.mux_cleanup_sweep((select l from sweep_list)),
  '{"seen": 6, "young": 0, "in_use": 1, "queued": 1, "review": 2, "held": 1, "unresolved": 1}'::jsonb, 'the same, live');
select is(pg_temp.jobs_n('asF1'), 1, 'the failed asset is not queued again');
select is((pg_temp.job('delete_asset', 'asF1')).status, 'failed', 'its failure stays for a person');
select is(pg_temp.jobs_n('asA2'), 1, 'the held asset is not queued again');
select is(pg_temp.jobs_n('asNoOwner') + pg_temp.jobs_n('asNoUpload'), 2, 'the two of unproven ownership are recorded for review');
select is(public.mux_cleanup_sweep((select l from sweep_list)),
  '{"seen": 6, "young": 0, "in_use": 1, "queued": 0, "review": 0, "held": 1, "unresolved": 1}'::jsonb, 'a second sweep queues and records nothing new');
select is(pg_temp.jobs_n('asOrph') + pg_temp.jobs_n('asNoOwner') + pg_temp.jobs_n('asNoUpload') + pg_temp.jobs_n('asF1') + pg_temp.jobs_n('asA2'), 5, 'one job per asset, still');
select is((public.mux_cleanup_overview())->'failed'->0->>'asset_id', 'asF1', 'the failure is still listed for a person');
-- Retried once resolved: back in the queue, and the sweep does not add a second job.
select lives_ok($$ select public.mux_cleanup_retry((select id from public.mux_cleanup_jobs where asset_id = 'asF1')) $$, 'the failed job is retried');
select is((public.mux_cleanup_sweep((select l from sweep_list)))->'unresolved', null, 'the sweep no longer counts it unresolved');
select is(pg_temp.jobs_n('asF1'), 1, 'nor queues it twice');
select is((pg_temp.job('delete_asset', 'asF1')).status, 'pending', 'it waits in the queue');
select is(pg_temp.err($$ select public.mux_cleanup_sweep('{}'::jsonb) $$), 'invalid_assets', 'the sweep still takes a list only');

-- ===========================================================================
-- G6. The record of the worker's calls and the health check.
-- ===========================================================================
select has_table('public', 'mux_cleanup_runs', 'the record of the worker''s calls exists');
select is((select relrowsecurity from pg_class where oid = 'public.mux_cleanup_runs'::regclass), true, 'RLS is on');
select is(has_table_privilege('authenticated', 'public.mux_cleanup_runs', 'select') or has_table_privilege('anon', 'public.mux_cleanup_runs', 'select'), false, 'members and anon cannot read it');
select is(has_function_privilege('authenticated', 'public.mux_cleanup_health()', 'execute') or has_function_privilege('anon', 'public.mux_cleanup_health()', 'execute'), false, 'members and anon cannot run the health check');
select is(has_function_privilege('service_role', 'public.mux_cleanup_health()', 'execute'), true, 'the service role can');
select is(has_function_privilege('service_role', 'public.mux_cleanup_collect_runs()', 'execute') or has_function_privilege('authenticated', 'public.mux_cleanup_collect_runs()', 'execute'), false, 'only the schedule collects answers');
select is((select provolatile::text from pg_proc where oid = 'public.mux_cleanup_health()'::regprocedure), 's', 'the health check only reads');
select is((select count(*)::int from cron.job where jobname = 'mux-cleanup-monitor' and schedule = '*/10 * * * *' and active), 1, 'answers are collected every 10 minutes');
select is((select count(*)::int from cron.job where jobname in ('mux-cleanup', 'mux-sweep', 'prune-moderation-records', 'prune-mux-cleanup-jobs', 'purge-deleted-accounts') and active), 5, 'the stage 3 schedules are unchanged');

-- Requests are recorded.
select vault.create_secret('http://127.0.0.1:1/functions/v1/mux-cleanup', 'mux_cleanup_url');
select vault.create_secret('test-cleanup-key', 'mux_cleanup_key');
delete from public.mux_cleanup_runs;
select public.run_mux_cleanup('drain');
select public.run_mux_cleanup('sweep');
select is((select count(*)::int from public.mux_cleanup_runs r join net.http_request_queue q on q.id = r.request_id), 2, 'each request to the worker is recorded with pg_net''s id');
select is((select array_agg(mode order by request_id) from public.mux_cleanup_runs), array['drain', 'sweep'], 'drain and sweep');
select public.mux_cleanup_set_mode('off', 'pgtap');
select public.run_mux_cleanup('drain');
select is((select count(*)::int from public.mux_cleanup_runs), 2, 'off: nothing requested, nothing recorded');
select public.mux_cleanup_set_mode('live', 'pgtap');
-- pg_net answers: the drain fine (with ids the worker might send: not kept), the sweep a 500; a
-- third request never answered.
insert into net._http_response (id, status_code, content_type, content, timed_out, error_msg)
select request_id, 200, 'application/json', '{"ok": true, "mode": "live", "claimed": 2, "done": 1, "retry": 1, "would_queue": ["asSecret"], "playback_id": "pbSecret"}', false, null
  from public.mux_cleanup_runs where mode = 'drain';
insert into net._http_response (id, status_code, content_type, content, timed_out, error_msg)
select request_id, 500, 'text/plain', 'boom', false, null from public.mux_cleanup_runs where mode = 'sweep';
insert into public.mux_cleanup_runs (request_id, mode, requested_at) values (-1, 'drain', now() - interval '20 minutes');
select is(public.mux_cleanup_collect_runs(), 2, 'the collector copies the two answers');
select is((select summary from public.mux_cleanup_runs where mode = 'drain' and request_id > 0), '{"mode": "live", "claimed": 2, "done": 1, "retry": 1}'::jsonb, 'counts only: no ids kept');
select is((select ok from public.mux_cleanup_runs where mode = 'drain' and request_id > 0), true, 'the worker said ok');
select is((select status_code from public.mux_cleanup_runs where mode = 'sweep'), 500, 'the sweep''s error status kept');
select is((select error from public.mux_cleanup_runs where request_id = -1), 'no_response', 'a request with no answer after 15 minutes is marked');
select is(public.mux_cleanup_collect_runs(), 0, 'collecting again copies nothing twice');

-- The health check, on the state above (live; Adam's held deletions, the review items, the
-- retried job, the worker's 500 and the lost request).
create temp table h1 as select public.mux_cleanup_health() as h;
select is((select h->>'status' from h1), 'alert', 'the 500 from the worker is an alert');
select ok((select h->'problems' @> '[{"check": "worker_errors", "level": "alert"}]' from h1), 'worker_errors');
select ok((select h->'problems' @> '[{"check": "worker_no_answer", "level": "warn"}]' from h1), 'the lost request is a warning');
select ok((select h->'problems' @> '[{"check": "review_jobs", "level": "warn"}]' from h1), 'review items are a warning');
select ok((select not (h->'problems' @> '[{"check": "failed_jobs"}]') from h1), 'no failed job now');
select is((select (h->'metrics'->>'review')::int from h1), 2, 'two review items');
select ok((select h->'metrics'->'schedules' ? 'mux-cleanup-monitor' from h1), 'the schedules are reported');
select is((select h->'thresholds'->>'due_live_minutes' from h1), '15', 'with the thresholds');
-- A failure, a stuck lease, an old due job and a purge failure.
update public.mux_cleanup_jobs set status = 'failed', finished_at = now(), last_error = 'mux_403' where asset_id = 'asF1';
update public.mux_cleanup_jobs set status = 'running', lease_id = gen_random_uuid(), locked_until = now() - interval '11 minutes' where asset_id = 'asOrph';
update public.mux_cleanup_jobs set not_before = now() - interval '20 minutes' where asset_id = 'asA1';
insert into public.account_purge_failures (account_id, last_error) values ('d0000000-0000-0000-0000-000000000009', 'test');
create temp table h2 as select public.mux_cleanup_health() as h;
select ok((select h->'problems' @> '[{"check": "failed_jobs", "level": "alert"}]' from h2), 'a failed job is an alert');
select ok((select h->'problems' @> '[{"check": "stuck_jobs", "level": "alert"}]' from h2), 'a lease run out 10 minutes ago is an alert');
select ok((select h->'problems' @> '[{"check": "backlog_age", "level": "alert"}]' from h2), 'live, a job due for over 15 minutes is an alert');
select ok((select h->'problems' @> '[{"check": "purge_failures", "level": "alert"}]' from h2), 'a purge failure is an alert');
-- Not live: a job waiting over a day is a warning (its video is still at Mux), not a backlog alert.
select public.mux_cleanup_set_mode('off', 'pgtap');
update public.mux_cleanup_jobs set created_at = now() - interval '25 hours' where asset_id = 'asA1';
create temp table h3 as select public.mux_cleanup_health() as h;
select ok((select h->'problems' @> '[{"check": "waiting_while_not_live", "level": "warn"}]' from h3), 'off: a job waiting a day is a warning');
select ok((select not (h->'problems' @> '[{"check": "backlog_age"}]') from h3), 'and not a backlog alert');
-- A schedule that stops.
select cron.alter_job((select jobid from cron.job where jobname = 'mux-cleanup'), active := false);
select ok((select (public.mux_cleanup_health())->'problems' @> '[{"check": "schedule_missing", "level": "alert"}]'), 'an inactive drain schedule is an alert');
select cron.alter_job((select jobid from cron.job where jobname = 'mux-cleanup'), active := true);

-- ===========================================================================
-- The founder's video came through untouched.
-- ===========================================================================
select is((select md5(r::text) from public.responses r where id = 'f0000000-0000-0000-0000-00000000000a'), (select h from founder_before), 'the founder''s row is unchanged');
select is(pg_temp.jobs_n('asFounder'), 0, 'and no job ever touched its asset');

select * from finish();
rollback;
