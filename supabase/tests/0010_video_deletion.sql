-- pgTAP tests for security stage 3: deleting videos at Mux, revoking playback, the purge
-- (20261012000200). Everything here is the database's half: which jobs are queued, leased,
-- held, retried and recorded, the tombstones and the anonymised records. The worker's half
-- against a fake Mux, with real concurrent sessions, is supabase/functions/_tests/
-- cleanup_integration_test.ts. Inside one transaction now() does not move, so "later" is
-- written as moving recorded times back.
begin;
select plan(328);

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
  ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya@example.com', '{}', '{}', now(), now()),
  ('d4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sam@example.com', '{}', '{}', now(), now()),
  ('e5555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rita@example.com', '{}', '{}', now(), now()),
  ('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'founder@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam'),
  ('c3333333-3333-3333-3333-333333333333', 'Maya Lind', 'testmaya'),
  ('d4444444-4444-4444-4444-444444444444', 'Sam Reed', 'testsam'),
  ('e5555555-5555-5555-5555-555555555555', 'Rita Gomez', 'testrita'),
  ('f0000000-0000-0000-0000-000000000001', 'Founder', 'testfounder');

insert into public.prompts (id, text, status, published_at) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Be honest about the place you live.', 'live', now()),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'Speak in every language you know.', 'live', now()),
  ('33333333-aaaa-aaaa-aaaa-333333333333', 'Newcomers unlearn?', 'live', now()),
  ('44444444-aaaa-aaaa-aaaa-444444444444', 'Best sunset spot?', 'live', now()),
  ('55555555-aaaa-aaaa-aaaa-555555555555', 'Your first week here?', 'live', now()),
  ('66666666-aaaa-aaaa-aaaa-666666666666', 'What would you change?', 'live', now());
insert into public.suggestions (id, author_id, text) values
  ('5a000000-0000-0000-0000-000000000001', 'b2222222-2222-2222-2222-222222222222', 'What''s one thing you miss from home?'),
  ('5a000000-0000-0000-0000-000000000002', 'e5555555-5555-5555-5555-555555555555', 'Where do you go to be alone?');

-- The founder's one live video, as on the hosted project: it must come through untouched.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('f0000000-0000-0000-0000-00000000000a', '11111111-aaaa-aaaa-aaaa-111111111111', 'f0000000-0000-0000-0000-000000000001', 9911, 'live', 'upFounder', 'asFounder', 'pbFounder', now() - interval '1 day');
insert into public.video_uploads (account_id, upload_id, status, created_at, reserved_until, expires_at, activated_at, claimed_at, response_id)
values ('f0000000-0000-0000-0000-000000000001', 'upFounder', 'claimed', now() - interval '1 day', now() - interval '1 day', now() - interval '23 hours', now() - interval '1 day', now() - interval '1 day', 'f0000000-0000-0000-0000-00000000000a');
create temp table founder_before as select md5(r::text) as h from public.responses r where id = 'f0000000-0000-0000-0000-00000000000a';

insert into public.responses (id, kind, prompt_id, suggestion_id, root_response_id, reply_to_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at, caption) values
  -- Adam
  ('ad000000-0000-0000-0000-000000000001', 'response', '11111111-aaaa-aaaa-aaaa-111111111111', null, null, null, 'b2222222-2222-2222-2222-222222222222', 9000, 'live', 'upA1', 'asA1', 'pbA1', now(), null),
  ('ad000000-0000-0000-0000-000000000002', 'response', '22222222-aaaa-aaaa-aaaa-222222222222', null, null, null, 'b2222222-2222-2222-2222-222222222222', 9000, 'processing', 'upA2', null, null, null, null),
  ('ad000000-0000-0000-0000-000000000003', 'response', '33333333-aaaa-aaaa-aaaa-333333333333', null, null, null, 'b2222222-2222-2222-2222-222222222222', 9000, 'processing', 'upA3', null, null, null, null),
  ('ad000000-0000-0000-0000-000000000004', 'response', '44444444-aaaa-aaaa-aaaa-444444444444', null, null, null, 'b2222222-2222-2222-2222-222222222222', 9000, 'live', 'upA4', 'asA4', 'pbA4', now(), null),
  ('ad000000-0000-0000-0000-000000000005', 'response', null, '5a000000-0000-0000-0000-000000000001', null, null, 'b2222222-2222-2222-2222-222222222222', 9000, 'draft', 'upD1', 'asD1', 'pbD1', null, null),
  -- Lena
  ('a1000000-0000-0000-0000-000000000001', 'response', '11111111-aaaa-aaaa-aaaa-111111111111', null, null, null, 'a1111111-1111-1111-1111-111111111111', 9000, 'live', 'upL1', 'asL1', 'pbL1', now(), null),
  ('a1000000-0000-0000-0000-000000000002', 'response', '22222222-aaaa-aaaa-aaaa-222222222222', null, null, null, 'a1111111-1111-1111-1111-111111111111', 9000, 'live', 'upL2', 'asL2', 'pbL2', now(), null),
  -- Rita
  ('e5000000-0000-0000-0000-000000000001', 'response', '11111111-aaaa-aaaa-aaaa-111111111111', null, null, null, 'e5555555-5555-5555-5555-555555555555', 9000, 'live', 'upR1', 'asR1', 'pbR1', now(), null),
  ('e5000000-0000-0000-0000-000000000002', 'response', null, '5a000000-0000-0000-0000-000000000002', null, null, 'e5555555-5555-5555-5555-555555555555', 9000, 'draft', 'upR2', 'asR2', 'pbR2', null, null),
  -- Maya, to be purged
  ('c3000000-0000-0000-0000-000000000001', 'response', '11111111-aaaa-aaaa-aaaa-111111111111', null, null, null, 'c3333333-3333-3333-3333-333333333333', 9000, 'live', 'upM1', 'asM1', 'pbM1', now(), 'Maya''s caption'),
  ('c3000000-0000-0000-0000-000000000002', 'response', '22222222-aaaa-aaaa-aaaa-222222222222', null, null, null, 'c3333333-3333-3333-3333-333333333333', 9000, 'live', 'upM2', 'asM2', 'pbM2', now(), null),
  ('c3000000-0000-0000-0000-000000000003', 'response', '33333333-aaaa-aaaa-aaaa-333333333333', null, null, null, 'c3333333-3333-3333-3333-333333333333', 9000, 'live', 'upM3', 'asM3', 'pbM3', now(), null),
  ('c3000000-0000-0000-0000-000000000004', 'response', '44444444-aaaa-aaaa-aaaa-444444444444', null, null, null, 'c3333333-3333-3333-3333-333333333333', 9000, 'live', 'upM4', 'asM4', 'pbM4', now(), null),
  ('c3000000-0000-0000-0000-000000000005', 'response', '55555555-aaaa-aaaa-aaaa-555555555555', null, null, null, 'c3333333-3333-3333-3333-333333333333', 9000, 'live', 'upM5', 'asM5', 'pbM5', now(), null),
  ('c3000000-0000-0000-0000-000000000006', 'response', '66666666-aaaa-aaaa-aaaa-666666666666', null, null, null, 'c3333333-3333-3333-3333-333333333333', 9000, 'processing', 'upM6', null, null, null, null),
  -- Sam, whose purge will be made to fail
  ('d4000000-0000-0000-0000-000000000001', 'response', '11111111-aaaa-aaaa-aaaa-111111111111', null, null, null, 'd4444444-4444-4444-4444-444444444444', 9000, 'live', 'upS1', 'asS1', 'pbS1', now(), null);
-- Replies: Lena's to Maya's M1; Maya's own reply to M2, and Adam's reply to that reply.
insert into public.responses (id, kind, prompt_id, root_response_id, reply_to_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('a1000000-0000-0000-0000-000000000011', 'reply', '11111111-aaaa-aaaa-aaaa-111111111111', 'c3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 5000, 'live', 'upLR1', 'asLR1', 'pbLR1', now()),
  ('c3000000-0000-0000-0000-000000000012', 'reply', '22222222-aaaa-aaaa-aaaa-222222222222', 'c3000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000002', 'c3333333-3333-3333-3333-333333333333', 5000, 'live', 'upMR2', 'asMR2', 'pbMR2', now());
insert into public.responses (id, kind, prompt_id, root_response_id, reply_to_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ad000000-0000-0000-0000-000000000012', 'reply', '22222222-aaaa-aaaa-aaaa-222222222222', 'c3000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000012', 'b2222222-2222-2222-2222-222222222222', 5000, 'live', 'upAR2', 'asAR2', 'pbAR2', now());
-- Comments on Adam's A4: Lena's (LC); Maya's MC1 with Lena's reply; Maya's MC2 alone; Maya's
-- reply MC3 under LC with Adam's reply to it. And Lena's comment on Maya's M1.
insert into public.comments (id, response_id, author_id, parent_id, body) values
  ('cc000000-0000-0000-0000-000000000010', 'ad000000-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', null, 'Lena on A4'),
  ('cc000000-0000-0000-0000-000000000011', 'ad000000-0000-0000-0000-000000000004', 'c3333333-3333-3333-3333-333333333333', null, 'Maya on A4'),
  ('cc000000-0000-0000-0000-000000000013', 'ad000000-0000-0000-0000-000000000004', 'c3333333-3333-3333-3333-333333333333', null, 'Maya alone'),
  ('cc000000-0000-0000-0000-000000000020', 'c3000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', null, 'Lena on M1');
insert into public.comments (id, response_id, author_id, parent_id, body) values
  ('cc000000-0000-0000-0000-000000000012', 'ad000000-0000-0000-0000-000000000004', 'a1111111-1111-1111-1111-111111111111', 'cc000000-0000-0000-0000-000000000011', 'Lena replies to Maya'),
  ('cc000000-0000-0000-0000-000000000014', 'ad000000-0000-0000-0000-000000000004', 'c3333333-3333-3333-3333-333333333333', 'cc000000-0000-0000-0000-000000000010', 'Maya replies to Lena');
insert into public.comments (id, response_id, author_id, parent_id, body) values
  ('cc000000-0000-0000-0000-000000000015', 'ad000000-0000-0000-0000-000000000004', 'b2222222-2222-2222-2222-222222222222', 'cc000000-0000-0000-0000-000000000014', 'Adam replies to Maya');
insert into public.likes (user_id, target_kind, target_id) values
  ('a1111111-1111-1111-1111-111111111111', 'video', 'c3000000-0000-0000-0000-000000000001'),
  ('a1111111-1111-1111-1111-111111111111', 'comment', 'cc000000-0000-0000-0000-000000000011');
-- Ledger rows for orphans the sweep and the webhook find.
insert into public.video_uploads (account_id, upload_id, status, created_at, expires_at, activated_at) values
  ('a1111111-1111-1111-1111-111111111111', 'upOrphanL', 'active', now() - interval '3 days', now() - interval '3 days' + interval '1 hour', now() - interval '3 days'),
  ('a1111111-1111-1111-1111-111111111111', 'upNoRowL', 'active', now() - interval '2 hours', now() - interval '1 hour', now() - interval '2 hours'),
  ('a1111111-1111-1111-1111-111111111111', 'upOpenL', 'active', now(), now() + interval '1 hour', now()),
  ('b2222222-2222-2222-2222-222222222222', 'upOrphanA', 'active', now() - interval '3 days', now() - interval '3 days' + interval '1 hour', now() - interval '3 days');

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
-- The job of an action for an asset or an upload: the open one if there is one (now() does not
-- move inside the transaction, so times cannot tell jobs apart).
create function pg_temp.job(p_action text, p_target text) returns public.mux_cleanup_jobs language sql stable as $$
  select * from public.mux_cleanup_jobs where action = p_action and (asset_id = p_target or upload_id = p_target)
   order by (status in ('pending', 'running', 'review')) desc, created_at desc limit 1;
$$;
create function pg_temp.jobs(p_target text) returns integer language sql stable as $$
  select count(*)::int from public.mux_cleanup_jobs where asset_id = p_target or upload_id = p_target;
$$;
-- Claims as the worker would, with every other due job held back, so each test leases only
-- what it is about.
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

-- ===========================================================================
-- 1. Structure and privileges
-- ===========================================================================
select has_table('public', 'mux_cleanup_jobs', 'the queue exists');
select is((select relrowsecurity from pg_class where oid = 'public.mux_cleanup_jobs'::regclass), true, 'RLS is on for the queue');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('mux_cleanup_jobs', 'account_purge_failures')), 0, 'no policies on the queue or the purge failures');
select is(has_table_privilege('authenticated', 'public.mux_cleanup_jobs', 'select'), false, 'members cannot read the queue');
select is(has_table_privilege('authenticated', 'public.mux_cleanup_jobs', 'insert'), false, 'members cannot add to the queue');
select is(has_table_privilege('anon', 'public.mux_cleanup_jobs', 'select'), false, 'nor can anon read it');
select is(has_table_privilege('authenticated', 'public.account_purge_failures', 'select'), false, 'members cannot read the purge failures');
select is(has_function_privilege('authenticated', 'public.mux_cleanup_claim(integer, integer)', 'execute'), false, 'members cannot lease jobs');
select is(has_function_privilege('anon', 'public.mux_cleanup_claim(integer, integer)', 'execute'), false, 'nor can anon');
select is(has_function_privilege('authenticated', 'public.mux_cleanup_finish(uuid, uuid, text, jsonb)', 'execute'), false, 'members cannot record outcomes');
select is(has_function_privilege('authenticated', 'public.mux_cleanup_sweep(jsonb, integer, boolean)', 'execute'), false, 'members cannot sweep');
select is(has_function_privilege('authenticated', 'public.mux_cleanup_retry(uuid)', 'execute'), false, 'members cannot retry jobs');
select is(has_function_privilege('authenticated', 'public.mux_cleanup_overview()', 'execute'), false, 'members cannot see the overview');
select is(has_function_privilege('authenticated', 'public.purge_deleted_accounts()', 'execute'), false, 'members cannot run the purge');
select is(has_function_privilege('authenticated', 'public.prune_moderation_records()', 'execute'), false, 'members cannot prune records');
select is(has_function_privilege('authenticated', 'public.run_mux_cleanup(text)', 'execute'), false, 'members cannot call the worker');
select is(has_function_privilege('service_role', 'public.mux_cleanup_claim(integer, integer)', 'execute')
      and has_function_privilege('service_role', 'public.mux_cleanup_finish(uuid, uuid, text, jsonb)', 'execute')
      and has_function_privilege('service_role', 'public.mux_cleanup_sweep(jsonb, integer, boolean)', 'execute')
      and has_function_privilege('service_role', 'public.mux_cleanup_overview()', 'execute')
      and has_function_privilege('service_role', 'public.mux_cleanup_retry(uuid)', 'execute'), true, 'the service role (the worker) can lease, record, sweep, see and retry');
select is(has_function_privilege('service_role', 'public.mux_cleanup_enqueue(text, text, text, text, uuid, uuid, timestamptz)', 'execute')
       or has_function_privilege('authenticated', 'public.mux_cleanup_enqueue(text, text, text, text, uuid, uuid, timestamptz)', 'execute'), false, 'nobody queues a job directly: only the state changes do');
select is(has_function_privilege('service_role', 'public.purge_account(uuid)', 'execute')
       or has_function_privilege('service_role', 'public.mux_asset_hold(text, text)', 'execute')
       or has_function_privilege('service_role', 'public.mux_playback_wanted(uuid, text)', 'execute'), false, 'the purge of one account and the hold rules are internal');
select is((select count(*)::int from cron.job where jobname in ('mux-cleanup', 'mux-sweep', 'prune-moderation-records', 'prune-mux-cleanup-jobs', 'purge-deleted-accounts') and active), 5, 'the drain, the sweep, the two prunes and the purge are scheduled');
select is(has_function_privilege('authenticated', 'public.mux_cleanup_check(uuid, uuid)', 'execute') or has_function_privilege('authenticated', 'public.mux_cleanup_set_mode(text, text)', 'execute')
       or has_function_privilege('anon', 'public.mux_cleanup_set_mode(text, text)', 'execute'), false, 'members cannot check jobs or turn the worker on');
select is(has_function_privilege('service_role', 'public.mux_cleanup_check(uuid, uuid)', 'execute') and has_function_privilege('service_role', 'public.mux_cleanup_set_mode(text, text)', 'execute'), true, 'the service role can');
select is(has_table_privilege('authenticated', 'public.mux_cleanup_settings', 'select') or has_table_privilege('authenticated', 'public.mux_cleanup_settings', 'update'), false, 'members cannot read or change the switch');
select is((select count(*)::int from public.mux_cleanup_jobs), 0, 'nothing queued for live videos of active accounts');
-- Without the Vault secrets the worker is never called.
select lives_ok($$ select public.run_mux_cleanup('drain') $$, 'run_mux_cleanup without its secrets');
select is(pg_temp.err($$ select public.run_mux_cleanup('purge') $$), 'invalid_mode', 'only drain and sweep');

-- ===========================================================================
-- 1b. The switch: off after the migration; nothing leased or called until it is turned on
-- ===========================================================================
select is(public.mux_cleanup_mode(), 'off', 'the worker is off after the migration');
select is((public.mux_cleanup_overview())->>'mode', 'off', 'and the overview says so');
select public.mux_cleanup_enqueue('delete_asset', 'orphan', 'asSwitch', 'upSwitch', null, 'a1111111-1111-1111-1111-111111111111');
select is((public.mux_cleanup_claim(50, 120))->'jobs', '[]'::jsonb, 'off: a due job is not leased');
select is((public.mux_cleanup_claim(50, 120))->>'mode', 'off', 'and the worker is told why');
select vault.create_secret('http://127.0.0.1:1/functions/v1/mux-cleanup', 'mux_cleanup_url');
select vault.create_secret('test-cleanup-key', 'mux_cleanup_key');
create temp table q0 as select count(*)::int as n from net.http_request_queue;
select public.run_mux_cleanup('drain');
select public.run_mux_cleanup('sweep');
select is((select count(*)::int from net.http_request_queue) - (select n from q0), 0, 'off: run_mux_cleanup calls nothing, even with its secrets');
select is(pg_temp.err($$ select public.mux_cleanup_set_mode('on', 'nemat') $$), 'invalid_mode', 'the switch is off, dry_run or live');
select is(pg_temp.err($$ select public.mux_cleanup_set_mode('live', ' ') $$), 'changed_by_required', 'and says who changed it');
select is((public.mux_cleanup_set_mode('dry_run', 'nemat'))->>'mode', 'dry_run', 'the team turns on a dry run');
select is((select changed_by from public.mux_cleanup_settings), 'nemat', 'recorded with who');
select public.run_mux_cleanup('drain');
select is((select count(*)::int from net.http_request_queue) - (select n from q0), 1, 'dry run: the worker is called when a job is due');
select is((select headers->>'Authorization' from net.http_request_queue order by id desc limit 1), 'Bearer test-cleanup-key', 'with the key from Vault');
select is((select convert_from(body, 'utf8')::jsonb from net.http_request_queue order by id desc limit 1), '{"mode": "drain"}'::jsonb, 'asking it to drain');
select public.run_mux_cleanup('sweep');
select is((select convert_from(body, 'utf8')::jsonb->>'mode' from net.http_request_queue order by id desc limit 1), 'sweep', 'and the daily sweep');
select is(jsonb_array_length((public.mux_cleanup_claim(50, 120))->'jobs'), 1, 'dry run: the job is leased (to be read, not acted on)');
select is(pg_temp.finish('delete_asset', 'asSwitch', 'release', '{"dry_run": true, "would": {"act": "delete"}}'), 'pending', 'the worker releases it with its plan');
select is((pg_temp.job('delete_asset', 'asSwitch')).attempts, 0, 'a dry run uses no attempt');
select is((pg_temp.job('delete_asset', 'asSwitch')).not_before, now() + interval '1 hour', 'and it is looked at again in an hour');
select is((public.mux_cleanup_overview())->'dry_run_planned'->0->'plan'->'would'->>'act', 'delete', 'the overview lists what the dry run would do');
select is((public.mux_cleanup_set_mode('live', 'nemat'))->>'mode', 'live', 'the team goes live');
select is((pg_temp.job('delete_asset', 'asSwitch')).not_before, now(), 'jobs set aside by the dry run are due at once');
select is(pg_temp.err($$ select public.mux_cleanup_finish(gen_random_uuid(), gen_random_uuid(), 'release', '{"not_before": "not a time"}') $$), 'ok', 'an unknown job is stale before its detail is read');
delete from public.mux_cleanup_jobs where asset_id = 'asSwitch';

-- ===========================================================================
-- 2. An author's deletion is immediate (F5)
-- ===========================================================================
set local role authenticated;
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select lives_ok($$ select public.delete_video('ad000000-0000-0000-0000-000000000001') $$, 'Adam deletes his live response');
select is(pg_temp.err($$ select public.delete_video('ad000000-0000-0000-0000-000000000001') $$), 'video_not_found', 'twice is refused');
select lives_ok($$ select public.delete_video('ad000000-0000-0000-0000-000000000002') $$, 'and his processing one, before Mux has an asset');
select lives_ok($$ select public.abandon_response('ad000000-0000-0000-0000-000000000003') $$, 'he abandons another processing one');
select lives_ok($$ select public.discard_draft('5a000000-0000-0000-0000-000000000001') $$, 'and discards his draft');
select is(pg_temp.err($$ select public.delete_video('a1000000-0000-0000-0000-000000000001') $$), 'video_not_found', 'he cannot delete Lena''s video');
reset role;
select is((pg_temp.job('delete_asset', 'asA1')).status, 'pending', 'the live video''s asset is queued for deletion');
select is((pg_temp.job('delete_asset', 'asA1')).reason, 'author_deleted', 'as the author''s deletion');
select is((pg_temp.job('delete_asset', 'asA1')).owner_id, 'b2222222-2222-2222-2222-222222222222'::uuid, 'owned by Adam (the passthrough the worker checks)');
select is((pg_temp.job('delete_asset', 'asA1')).upload_id, 'upA1', 'with its upload id (checked at Mux too)');
select is((pg_temp.job('delete_asset', 'asA1')).not_before, now(), 'due at once');
select is(pg_temp.jobs('asA1'), 1, 'one job, not two');
select is((pg_temp.job('cancel_upload', 'upA2')).reason, 'author_deleted', 'with no asset yet, the upload is queued for cancellation');
select is((pg_temp.job('cancel_upload', 'upA3')).reason, 'abandoned', 'an abandoned post too');
select is((pg_temp.job('delete_asset', 'asD1')).reason, 'abandoned', 'a discarded draft''s asset is queued');
select is(pg_temp.jobs('asL1'), 0, 'nothing for Lena''s video');
select is((public.web_video('ad000000-0000-0000-0000-000000000001'))->>'status', 'unavailable', 'the deleted video is gone from the web at once');

-- A draft re-recorded replaces the old one: the old one is forgotten at Mux.
insert into public.video_uploads (account_id, upload_id, status, expires_at, activated_at) values
  ('e5555555-5555-5555-5555-555555555555', 'upR2b', 'active', now() + interval '1 hour', now());
set local role authenticated;
select pg_temp.act('e5555555-5555-5555-5555-555555555555');
select lives_ok($$ select public.post_draft('5a000000-0000-0000-0000-000000000002', 'upR2b', null, 5000) $$, 'Rita re-records her draft');
reset role;
select is((pg_temp.job('delete_asset', 'asR2')).reason, 'abandoned', 'the replaced draft''s asset is queued');
-- Put Rita's draft back as it was for section 5.
update public.mux_cleanup_jobs set status = 'done', owner_id = null, finished_at = now() where asset_id = 'asR2';
delete from public.responses where mux_upload_id = 'upR2b';
update public.responses set status = 'draft', deleted_at = null where id = 'e5000000-0000-0000-0000-000000000002';
delete from public.mux_cleanup_jobs where asset_id = 'asR2';

-- A retry with a fresh upload cancels the one it replaces.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id) values
  ('a1000000-0000-0000-0000-000000000003', '33333333-aaaa-aaaa-aaaa-333333333333', 'a1111111-1111-1111-1111-111111111111', 9000, 'processing', 'upL3old');
insert into public.video_uploads (account_id, upload_id, status, expires_at, activated_at) values
  ('a1111111-1111-1111-1111-111111111111', 'upL3new', 'active', now() + interval '1 hour', now());
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.retry_response_upload('a1000000-0000-0000-0000-000000000003', 'upL3new') $$, 'Lena retries with a fresh upload');
reset role;
select is((pg_temp.job('cancel_upload', 'upL3old')).reason, 'abandoned', 'the replaced upload is queued for cancellation');
select is(pg_temp.jobs('upL3new'), 0, 'not the new one');

-- A live video without public playback is never shown (between a restore and its new playback id).
update public.responses set mux_playback_id = null where id = 'a1000000-0000-0000-0000-000000000002';
select is((public.web_video('a1000000-0000-0000-0000-000000000002'))->>'status', 'unavailable', 'a live video with no playback id is unavailable on the web');
set local role authenticated;
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select is((public.get_response('a1000000-0000-0000-0000-000000000002'))->>'status', 'unavailable', 'and in the app');
reset role;
update public.responses set mux_playback_id = 'pbL2' where id = 'a1000000-0000-0000-0000-000000000002';
select is((public.web_video('a1000000-0000-0000-0000-000000000002'))->>'status', 'live', 'with it, it plays');

-- ===========================================================================
-- 3. Leasing and recording outcomes
-- ===========================================================================
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asA1'), 'delete_asset', 'asA1')->>'owner_id', 'b2222222-2222-2222-2222-222222222222', 'the worker leases the deletion, with its owner');
select is((pg_temp.job('delete_asset', 'asA1')).status, 'running', 'it is running');
select is((pg_temp.job('delete_asset', 'asA1')).attempts, 1, 'first attempt');
select is((pg_temp.job('delete_asset', 'asA1')).locked_until, now() + interval '120 seconds', 'leased for 120 seconds');
select is(jsonb_array_length(pg_temp.claim_only('delete_asset', 'asA1')), 0, 'a running job is not leased twice');
select is((public.mux_cleanup_finish((pg_temp.job('delete_asset', 'asA1')).id, gen_random_uuid(), 'done', '{}'))->>'status', 'stale', 'only the lease holder records the outcome');
select is(pg_temp.err(format('select public.mux_cleanup_finish(%L, %L, %L)', (pg_temp.job('delete_asset', 'asA1')).id, (pg_temp.job('delete_asset', 'asA1')).lease_id, 'deleted')), 'invalid_outcome', 'outcomes are a fixed list');
select is(((public.mux_cleanup_check((pg_temp.job('delete_asset', 'asA1')).id, (pg_temp.job('delete_asset', 'asA1')).lease_id))->>'hold'), null, 'checked again just before deleting: nothing holds it');
select is((public.mux_cleanup_check((pg_temp.job('delete_asset', 'asA1')).id, gen_random_uuid()))->>'ok', 'false', 'a check without the lease is refused');
select is(pg_temp.finish('delete_asset', 'asA1', 'done', '{"outcome": "deleted", "extra": "not kept"}'), 'done', 'the worker records the deletion');
select is((pg_temp.job('delete_asset', 'asA1')).owner_id, null, 'a finished job no longer names the owner');
select is((pg_temp.job('delete_asset', 'asA1')).response_id, null, 'nor the video');
select is((pg_temp.job('delete_asset', 'asA1')).result, '{"outcome": "deleted"}'::jsonb, 'and keeps only its outcome');
select is((select mux_asset_id from public.responses where id = 'ad000000-0000-0000-0000-000000000001'), null, 'the deleted video forgets its asset');
select is((select mux_playback_id from public.responses where id = 'ad000000-0000-0000-0000-000000000001'), null, 'and its playback id');

-- Retries back off, then fail for good; mux_cleanup_retry puts a failed job back.
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asD1'), 'delete_asset', 'asD1')->>'attempt', '1', 'leased');
select is(pg_temp.finish('delete_asset', 'asD1', 'retry', '{"error": "mux_503"}'), 'pending', 'a temporary failure goes back to the queue');
select is((pg_temp.job('delete_asset', 'asD1')).not_before, now() + interval '1 minute', 'after a minute');
select is((pg_temp.job('delete_asset', 'asD1')).last_error, 'mux_503', 'with the error kept');
select is(jsonb_array_length(pg_temp.claim_only('delete_asset', 'asD1')), 0, 'not before its time');
update public.mux_cleanup_jobs set not_before = now() where asset_id = 'asD1';
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asD1'), 'delete_asset', 'asD1')->>'attempt', '2', 'second attempt');
select is(pg_temp.finish('delete_asset', 'asD1', 'retry', '{"error": "mux_timeout"}'), 'pending', 'retried again');
select is((pg_temp.job('delete_asset', 'asD1')).not_before, now() + interval '2 minutes', 'after two minutes');
update public.mux_cleanup_jobs set not_before = now(), attempts = 9 where asset_id = 'asD1';
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asD1'), 'delete_asset', 'asD1')->>'attempt', '10', 'the tenth attempt');
select is(pg_temp.finish('delete_asset', 'asD1', 'retry', '{"error": "mux_500"}'), 'failed', 'fails for good');
select is((public.mux_cleanup_overview())->'failed'->0->>'last_error', 'mux_500', 'and shows in the overview');
select lives_ok(format('select public.mux_cleanup_retry(%L)', (pg_temp.job('delete_asset', 'asD1')).id), 'the team retries it');
select is((pg_temp.job('delete_asset', 'asD1')).status || ':' || (pg_temp.job('delete_asset', 'asD1')).attempts, 'pending:0', 'pending, attempts reset');

-- A worker that dies: its lease runs out and the job is leased again; the old lease is stale.
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asD1'), 'delete_asset', 'asD1')->>'attempt', '1', 'leased');
create temp table dead_lease as select lease_id from public.mux_cleanup_jobs where asset_id = 'asD1';
update public.mux_cleanup_jobs set locked_until = now() - interval '1 second' where asset_id = 'asD1';
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asD1'), 'delete_asset', 'asD1')->>'attempt', '2', 'leased again after the lease ran out');
select is((public.mux_cleanup_finish((pg_temp.job('delete_asset', 'asD1')).id, (select lease_id from dead_lease), 'done', '{}'))->>'status', 'stale', 'the dead worker''s late answer is ignored');
update public.mux_cleanup_jobs set locked_until = now() - interval '1 second', attempts = 10 where asset_id = 'asD1';
select is(jsonb_array_length(pg_temp.claim_only('delete_asset', 'asD1')), 0, 'out of attempts when its lease runs out');
select is((pg_temp.job('delete_asset', 'asD1')).status || ':' || (pg_temp.job('delete_asset', 'asD1')).last_error, 'failed:lease_expired', 'it fails as lease_expired');

-- cancel_upload: an upload already turned into an asset queues the asset's deletion.
select is(pg_temp.claimed(pg_temp.claim_only('cancel_upload', 'upA2'), 'cancel_upload', 'upA2')->>'owner_id', 'b2222222-2222-2222-2222-222222222222', 'the cancellation is leased');
select is(pg_temp.finish('cancel_upload', 'upA2', 'found_asset', '{"asset_id": "asA2late"}'), 'done', 'Mux had made an asset');
select is((pg_temp.job('delete_asset', 'asA2late')).owner_id, 'b2222222-2222-2222-2222-222222222222'::uuid, 'its deletion is queued for the same owner');
select is((pg_temp.job('delete_asset', 'asA2late')).upload_id, 'upA2', 'and upload');
select is(pg_temp.claimed(pg_temp.claim_only('cancel_upload', 'upA3'), 'cancel_upload', 'upA3')->>'action', 'cancel_upload', 'another cancellation');
select is(pg_temp.err($$ select pg_temp.finish('delete_asset', 'asA2late', 'found_asset', '{}') $$), 'ok', 'found_asset on a job that is not running changes nothing');
select is((public.mux_cleanup_check((pg_temp.job('cancel_upload', 'upA3')).id, (pg_temp.job('cancel_upload', 'upA3')).lease_id))->>'in_use', 'false', 'checked: no video that can still go live uses the upload');
select is(pg_temp.finish('cancel_upload', 'upA3', 'failed', '{"outcome": "not_verified", "detail": "passthrough_mismatch"}'), 'failed', 'an ownership mismatch fails, for a person to look at');
select is((pg_temp.job('cancel_upload', 'upA3')).last_error, 'passthrough_mismatch', 'with the reason');
select is((pg_temp.job('cancel_upload', 'upA3')).owner_id, 'b2222222-2222-2222-2222-222222222222'::uuid, 'and the owner kept, for a retry');

-- ===========================================================================
-- 4. Moderation: playback off at once, the asset kept until 30 days after the case closes
-- ===========================================================================
select lives_ok($$ select public.mod_remove_video('a1000000-0000-0000-0000-000000000001', 'Spam.', 'nemat') $$, 'a moderator removes Lena''s L1');
select is((pg_temp.job('sync_playback', 'asL1')).reason, 'moderation_removed', 'its playback is queued to be revoked');
select is((pg_temp.job('delete_asset', 'asL1')).reason, 'moderation_removed', 'and its asset to be deleted');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asL1'), 'sync_playback', 'asL1')->>'playback_wanted', 'false', 'the worker is told: no playback');
select is(pg_temp.finish('sync_playback', 'asL1', 'done', '{"outcome": "revoked", "revoked": ["pbL1"]}'), 'done', 'revoked at Mux');
select is((select mux_playback_id from public.responses where id = 'a1000000-0000-0000-0000-000000000001'), null, 'the video forgets the dead playback id');
select is((select mux_asset_id from public.responses where id = 'a1000000-0000-0000-0000-000000000001'), 'asL1', 'and keeps its asset');
select is(jsonb_array_length(pg_temp.claim_only('delete_asset', 'asL1')), 0, 'the deletion is not leased while the retention lasts');
select is((pg_temp.job('delete_asset', 'asL1')).not_before, now() + interval '30 days', 'it waits 30 days from the removal (the case closed with it)');
select is((pg_temp.job('delete_asset', 'asL1')).attempts, 0, 'waiting uses no attempt');
-- A review request reopens the case: when the 30 days come, the asset is kept.
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.request_review((select id from public.moderation_actions where target_id = 'a1000000-0000-0000-0000-000000000001')) $$, 'Lena requests a review');
reset role;
update public.mux_cleanup_jobs set not_before = now() where asset_id = 'asL1' and action = 'delete_asset';
select is(jsonb_array_length(pg_temp.claim_only('delete_asset', 'asL1')), 0, 'with the review pending, nothing is leased');
select is((pg_temp.job('delete_asset', 'asL1')).status, 'skipped', 'the deletion is skipped: the case is open');
select lives_ok($$ select public.mod_decide_review((select id from public.moderation_actions where target_id = 'a1000000-0000-0000-0000-000000000001'), 'upheld', 'nemat') $$, 'the removal is upheld');
select is((pg_temp.job('delete_asset', 'asL1')).status, 'pending', 'a deletion is queued again');
select is(jsonb_array_length(pg_temp.claim_only('delete_asset', 'asL1')), 0, 'and waits');
select is((pg_temp.job('delete_asset', 'asL1')).not_before, now() + interval '30 days', '30 days from the decision');
-- 30 days after the decision.
update public.review_requests set decided_at = now() - interval '31 days' where action_id = (select id from public.moderation_actions where target_id = 'a1000000-0000-0000-0000-000000000001');
update public.mux_cleanup_jobs set not_before = now() where asset_id = 'asL1' and status = 'pending';
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asL1'), 'delete_asset', 'asL1')->>'reason', 'review_upheld', 'then the deletion is leased');
select is(pg_temp.err($$ select public.mod_restore_video('a1000000-0000-0000-0000-000000000001', 'x', 'nemat') $$), 'asset_being_deleted', 'a restore while it is being deleted is refused');
select is(pg_temp.finish('delete_asset', 'asL1', 'done', '{"outcome": "deleted"}'), 'done', 'deleted at Mux');
select is((select mux_asset_id from public.responses where id = 'a1000000-0000-0000-0000-000000000001'), null, 'the removed video forgets its asset');
select is(pg_temp.err($$ select public.mod_restore_video('a1000000-0000-0000-0000-000000000001', 'x', 'nemat') $$), 'asset_deleted', 'and once it is gone, can no longer be restored');
select is((select public.mux_video_restorable(r) from public.responses r where id = 'a1000000-0000-0000-0000-000000000001'), false, 'it is not restorable');
select is((select status from public.responses where id = 'a1000000-0000-0000-0000-000000000001'), 'removed', 'it stays removed');

-- Reversed on review: playback back, the asset kept.
select lives_ok($$ select public.mod_remove_video('a1000000-0000-0000-0000-000000000002', 'Spam.', 'nemat') $$, 'L2 is removed');
select is(pg_temp.finish('sync_playback', 'asL2', 'done', '{}'), null, '(nothing running yet)');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asL2'), 'sync_playback', 'asL2')->>'playback_wanted', 'false', 'its playback is revoked');
select is(pg_temp.finish('sync_playback', 'asL2', 'done', '{"outcome": "revoked", "revoked": ["pbL2"]}'), 'done', 'at Mux');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.request_review((select id from public.moderation_actions where target_id = 'a1000000-0000-0000-0000-000000000002')) $$, 'Lena requests a review');
reset role;
select lives_ok($$ select public.mod_decide_review((select id from public.moderation_actions where target_id = 'a1000000-0000-0000-0000-000000000002' and kind = 'remove'), 'reversed', 'nemat') $$, 'the removal is reversed');
select is((select status from public.responses where id = 'a1000000-0000-0000-0000-000000000002'), 'live', 'L2 is live again');
select is((public.web_video('a1000000-0000-0000-0000-000000000002'))->>'status', 'unavailable', 'but not shown until it has playback again');
-- The old deletion comes due first: the video is in use, so it is skipped and the restore runs.
update public.mux_cleanup_jobs set not_before = now() - interval '1 minute' where asset_id = 'asL2' and action = 'delete_asset';
select is(pg_temp.claimed((public.mux_cleanup_claim(50, 120))->'jobs', 'sync_playback', 'asL2')->>'playback_wanted', 'true', 'the worker is told: playback on');
select is((pg_temp.job('delete_asset', 'asL2')).status, 'skipped', 'the deletion is skipped: the video is in use');
select is(pg_temp.finish('sync_playback', 'asL2', 'done', '{"outcome": "restored", "playback_id": "pbL2new", "asset_status": "ready"}'), 'done', 'a new playback id at Mux');
select is((select mux_playback_id from public.responses where id = 'a1000000-0000-0000-0000-000000000002'), 'pbL2new', 'recorded');
select is((public.web_video('a1000000-0000-0000-0000-000000000002'))->'video'->>'playback_id', 'pbL2new', 'and it plays again');
-- Everything else that was due was leased by that claim: put it back.
update public.mux_cleanup_jobs set status = 'pending', lease_id = null, locked_until = null, attempts = 0 where status = 'running';
select is(pg_temp.err($$ select public.mux_cleanup_finish(gen_random_uuid(), gen_random_uuid(), 'done', '{"playback_id": "bad id"}') $$), 'ok', 'an unknown job is stale, not an error');

-- ===========================================================================
-- 5. Deleting an account and signing back in: playback off, then on
-- ===========================================================================
set local role authenticated;
select pg_temp.act('e5555555-5555-5555-5555-555555555555');
select lives_ok($$ select public.delete_account() $$, 'Rita deletes her account');
reset role;
select is((pg_temp.job('sync_playback', 'asR1')).reason, 'account_deleted', 'her live video''s playback is queued to be revoked');
select is((pg_temp.job('sync_playback', 'asR2')).reason, 'account_deleted', 'her draft''s too');
select is(pg_temp.jobs('asR1') + pg_temp.jobs('asR2'), 2, 'and nothing deleted');
-- She signs back in before the worker runs: one job, now asking for playback on.
set local role authenticated;
select pg_temp.act('e5555555-5555-5555-5555-555555555555');
select is((public.get_onboarding_state())->>'has_profile', 'true', 'Rita signs back in at once');
reset role;
select is(pg_temp.jobs('asR1'), 1, 'the restore merges into the pending job');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asR1'), 'sync_playback', 'asR1')->>'playback_wanted', 'true', 'which now asks for playback on');
select is(pg_temp.finish('sync_playback', 'asR1', 'done', '{"outcome": "kept", "playback_id": "pbR1", "asset_status": "ready"}'), 'done', 'it was never revoked');
update public.mux_cleanup_jobs set status = 'done', owner_id = null, finished_at = now() where asset_id = 'asR2';
-- Deleting again; the worker revokes; she signs back in while a revoke is running.
set local role authenticated;
select pg_temp.act('e5555555-5555-5555-5555-555555555555');
select lives_ok($$ select public.delete_account() $$, 'Rita deletes her account again');
reset role;
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asR1'), 'sync_playback', 'asR1')->>'playback_wanted', 'false', 'the revoke is leased');
set local role authenticated;
select pg_temp.act('e5555555-5555-5555-5555-555555555555');
select is((public.get_onboarding_state())->>'has_profile', 'true', 'she signs back in meanwhile');
reset role;
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asR1' and status = 'pending'), 1, 'a restore is queued behind the running revoke');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asR1'), 'sync_playback', 'asR1'), null, 'and is not leased while the revoke runs (one job per asset)');
select is(pg_temp.finish('sync_playback', 'asR1', 'done', '{"outcome": "revoked", "revoked": ["pbR1"]}'), 'done', 'the revoke finishes');
select is((public.web_video('e5000000-0000-0000-0000-000000000001'))->>'status', 'unavailable', 'for a moment her video is not shown (no playback)');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asR1'), 'sync_playback', 'asR1')->>'playback_wanted', 'true', 'then the restore is leased');
select is(pg_temp.finish('sync_playback', 'asR1', 'done', '{"outcome": "restored", "playback_id": "pbR1new", "asset_status": "ready"}'), 'done', 'with a new playback id');
select is((public.web_video('e5000000-0000-0000-0000-000000000001'))->'video'->>'playback_id', 'pbR1new', 'her video plays again');
update public.mux_cleanup_jobs set status = 'done', owner_id = null, finished_at = now() where asset_id = 'asR2' and status in ('pending', 'running');
update public.mux_cleanup_jobs set lease_id = null, locked_until = null where status = 'done';
-- An asset that becomes ready while the account is deleted is queued for revoking.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id) values
  ('e5000000-0000-0000-0000-000000000003', '22222222-aaaa-aaaa-aaaa-222222222222', 'e5555555-5555-5555-5555-555555555555', 9000, 'processing', 'upR3');
update public.accounts set deleted_at = now() where id = 'e5555555-5555-5555-5555-555555555555';
delete from public.mux_cleanup_jobs where asset_id in ('asR1', 'asR2') and status = 'pending';
select is((public.mark_response_live('upR3', 'asR3', 'pbR3', 9000, 'e5555555-5555-5555-5555-555555555555'))->>'status', 'live', 'ready while her account is deleted');
select is((pg_temp.job('sync_playback', 'asR3')).reason, 'account_deleted', 'its playback is queued to be revoked');
update public.accounts set deleted_at = null where id = 'e5555555-5555-5555-5555-555555555555';
delete from public.mux_cleanup_jobs where asset_id = 'asR3';

-- ===========================================================================
-- 6. Ready events for videos that are gone (F8)
-- ===========================================================================
select is((public.mark_response_live('upNoRowL', 'asNoRowL', 'pbNoRowL', 9000, 'a1111111-1111-1111-1111-111111111111'))->>'status', 'unknown_upload', 'an asset from an upload no video took');
select is((pg_temp.job('delete_asset', 'asNoRowL')).owner_id, 'a1111111-1111-1111-1111-111111111111'::uuid, 'is queued for deletion, owned by the member it was minted for');
select is((public.mark_response_live('upOrphanA', 'asForged', 'pbForged', 9000, 'a1111111-1111-1111-1111-111111111111'))->>'status', 'unknown_upload', 'a passthrough that is not the ledger''s owner');
select is(pg_temp.jobs('asForged'), 0, 'is not queued');
select is((public.mark_response_live('upNobody', 'asNobody', 'pbNobody', 9000, 'a1111111-1111-1111-1111-111111111111'))->>'status', 'unknown_upload', 'an upload not in the ledger');
select is(pg_temp.jobs('asNobody'), 0, 'is not queued (ownership unproven)');
select is((public.mark_response_live('upA2', 'asA2', 'pbA2', 9000, 'b2222222-2222-2222-2222-222222222222'))->>'status', 'deleted', 'an asset ready after its video was deleted');
select is((select mux_asset_id from public.responses where id = 'ad000000-0000-0000-0000-000000000002'), 'asA2', 'is recorded on the deleted video');
select is((select mux_playback_id from public.responses where id = 'ad000000-0000-0000-0000-000000000002'), null, 'without playback');
select is((pg_temp.job('delete_asset', 'asA2')).reason, 'abandoned', 'and queued for deletion');
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id) values
  ('a1000000-0000-0000-0000-000000000004', '44444444-aaaa-aaaa-aaaa-444444444444', 'a1111111-1111-1111-1111-111111111111', 9000, 'processing', 'upL4');
select lives_ok($$ select public.mod_remove_video('a1000000-0000-0000-0000-000000000004', 'Spam.', 'nemat') $$, 'a processing video is removed');
select is(pg_temp.jobs('upL4'), 0, 'nothing to do at Mux yet');
select is((public.mark_response_live('upL4', 'asL4', 'pbL4', 9000, 'a1111111-1111-1111-1111-111111111111'))->>'status', 'removed', 'its asset becomes ready');
select is((pg_temp.job('sync_playback', 'asL4')).reason, 'moderation_removed', 'its playback is queued to be revoked');
select is((pg_temp.job('delete_asset', 'asL4')).reason, 'moderation_removed', 'and the asset kept under the retention');
select is((public.mark_response_live('upFounder', 'asOther', 'pbOther', 1, 'a1111111-1111-1111-1111-111111111111'))->>'status', 'owner_mismatch', 'a forged ready event for the founder''s video');
select is((public.mark_response_live('upFounder', 'asFounder', 'pbFounder', 9911, 'f0000000-0000-0000-0000-000000000001'))->>'status', 'live', 'a repeated genuine one');
select is(pg_temp.jobs('asFounder') + pg_temp.jobs('asOther') + pg_temp.jobs('upFounder'), 0, 'queue nothing for the founder');

-- ===========================================================================
-- 7. The purge (F6, F7)
-- ===========================================================================
-- Maya: M4 removed 10 days ago (case closed), M5 removed with a review pending. Reports by her,
-- about her video and about her profile.
select lives_ok($$ select public.mod_remove_video('c3000000-0000-0000-0000-000000000004', 'Spam.', 'nemat', 'internal note about Maya') $$, 'M4 is removed');
update public.moderation_actions set created_at = now() - interval '10 days' where target_id = 'c3000000-0000-0000-0000-000000000004';
select lives_ok($$ select public.mod_remove_video('c3000000-0000-0000-0000-000000000005', 'Spam.', 'nemat') $$, 'M5 is removed');
set local role authenticated;
select pg_temp.act('c3333333-3333-3333-3333-333333333333');
select lives_ok($$ select public.request_review((select id from public.moderation_actions where target_id = 'c3000000-0000-0000-0000-000000000005')) $$, 'Maya requests a review of M5');
select lives_ok($$ select public.report_item('video', 'ad000000-0000-0000-0000-000000000004', 'spam') $$, 'Maya reports Adam''s A4');
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.report_item('video', 'c3000000-0000-0000-0000-000000000003', 'spam') $$, 'Lena reports Maya''s M3');
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select lives_ok($$ select public.report_item('profile', 'c3333333-3333-3333-3333-333333333333', 'spam') $$, 'Adam reports Maya''s profile');
reset role;
delete from public.mux_cleanup_jobs where asset_id in ('asM4', 'asM5');
update public.accounts set deleted_at = now() - interval '31 days' where id in ('c3333333-3333-3333-3333-333333333333', 'd4444444-4444-4444-4444-444444444444');
-- Sam's purge fails (a stand-in for any error): it must not stop Maya's.
create function public.test_block_purge() returns trigger language plpgsql as $$
begin
  if old.id = 'd4444444-4444-4444-4444-444444444444' then raise exception 'test_purge_blocked'; end if;
  return old;
end;
$$;
create trigger test_block_purge before delete on public.profiles for each row execute function public.test_block_purge();
-- An account deleted 29 days ago is not due.
update public.accounts set deleted_at = now() - interval '29 days' where id = 'e5555555-5555-5555-5555-555555555555';

select is(public.purge_deleted_accounts(), 1, 'day 30: Maya is purged, although her response has other people''s video replies');
select is((select count(*)::int from auth.users where id = 'c3333333-3333-3333-3333-333333333333'), 0, 'her Auth user is gone');
select is((select count(*)::int from public.profiles where id = 'c3333333-3333-3333-3333-333333333333'), 0, 'her profile too');
select is((select last_error from public.account_purge_failures where account_id = 'd4444444-4444-4444-4444-444444444444'), 'test_purge_blocked', 'Sam''s failure is recorded');
select is((select count(*)::int from public.responses where author_id = 'd4444444-4444-4444-4444-444444444444'), 1, 'and Sam is untouched');
select is(pg_temp.jobs('asS1'), 0, 'nothing of Sam''s is queued (his purge rolled back)');
select is((select count(*)::int from public.accounts where id = 'e5555555-5555-5555-5555-555555555555'), 1, 'Rita, 29 days in, is not purged');

-- Tombstones.
select is((select author_id::text || status from public.responses where id = 'c3000000-0000-0000-0000-000000000001'), null, 'M1 has no author');
select is((select status from public.responses where id = 'c3000000-0000-0000-0000-000000000001'), 'deleted', 'M1 stays as a deleted tombstone');
select is((select coalesce(caption, '') || coalesce(mux_upload_id, '') || coalesce(mux_asset_id, '') || coalesce(mux_playback_id, '') from public.responses where id = 'c3000000-0000-0000-0000-000000000001'), '', 'with no caption and no Mux ids');
select is((select status || root_response_id::text from public.responses where id = 'a1000000-0000-0000-0000-000000000011'), 'live' || 'c3000000-0000-0000-0000-000000000001', 'Lena''s reply is live, still in M1''s room');
set local role authenticated;
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select is((public.get_video('a1000000-0000-0000-0000-000000000011'))->'context'->>'root_deleted', 'true', 'it shows "Original response deleted"');
select is((public.get_video('a1000000-0000-0000-0000-000000000011'))->'context'->>'prompt_text', 'Be honest about the place you live.', 'with the prompt');
select is((public.get_video('ad000000-0000-0000-0000-000000000012'))->'context'->>'reply_to_deleted', 'true', 'Adam''s reply to Maya''s reply shows "Replying to a deleted video"');
select is((public.reply_room('c3000000-0000-0000-0000-000000000002'))->>'count', '1', 'M2''s room still holds Adam''s reply');
select is(public.get_profile('c3333333-3333-3333-3333-333333333333'), null, 'Maya''s profile is gone');
reset role;
select is((select count(*)::int from public.responses where id in ('c3000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000012') and author_id is null and status = 'deleted'), 2, 'M2 and Maya''s reply to it are tombstones (Adam''s reply points at the reply, which points at M2)');
select is((select count(*)::int from public.responses where id in ('c3000000-0000-0000-0000-000000000003', 'c3000000-0000-0000-0000-000000000004', 'c3000000-0000-0000-0000-000000000005', 'c3000000-0000-0000-0000-000000000006')), 0, 'her videos nobody replied to are gone');
select is((select count(*)::int from public.comments where response_id = 'c3000000-0000-0000-0000-000000000001'), 0, 'the comments on her tombstoned response went with it');
select is((select count(*)::int from public.likes where target_id = 'c3000000-0000-0000-0000-000000000001'), 0, 'and the likes');
select is((select coalesce(author_id::text, '') || coalesce(body, '') || (deleted_at is not null)::text from public.comments where id = 'cc000000-0000-0000-0000-000000000011'), 'true', 'her comment with Lena''s reply is a deleted-parent tombstone, no author, no text');
select is((select body from public.comments where id = 'cc000000-0000-0000-0000-000000000012'), 'Lena replies to Maya', 'Lena''s reply is kept');
select is((select count(*)::int from public.comments where id = 'cc000000-0000-0000-0000-000000000013'), 0, 'her comment nobody replied to is gone');
select is((select coalesce(author_id::text, '') || coalesce(body, '') from public.comments where id = 'cc000000-0000-0000-0000-000000000014'), '', 'her reply under Lena''s comment, which Adam replied to, is a tombstone');
select is((select body from public.comments where id = 'cc000000-0000-0000-0000-000000000015'), 'Adam replies to Maya', 'Adam''s reply is kept');
select is((select count(*)::int from public.likes where target_kind = 'comment' and target_id = 'cc000000-0000-0000-0000-000000000011'), 0, 'likes on her tombstoned comment are gone');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is((select (c->>'deleted')::boolean and c->'author' = 'null'::jsonb and c->'body' = 'null'::jsonb from jsonb_array_elements((public.comments_list('ad000000-0000-0000-0000-000000000004'))->'comments') c where c->>'id' = 'cc000000-0000-0000-0000-000000000011'), true, 'the sheet shows the deleted-parent row');
select is((select jsonb_array_length(c->'replies') from jsonb_array_elements((public.comments_list('ad000000-0000-0000-0000-000000000004'))->'comments') c where c->>'id' = 'cc000000-0000-0000-0000-000000000011'), 1, 'with Lena''s reply under it');
reset role;

-- Mux (F7): every asset and unfinished upload is queued, outliving the rows.
select is((select count(*)::int from public.mux_cleanup_jobs where reason = 'account_purged' and owner_id = 'c3333333-3333-3333-3333-333333333333'
            and asset_id in ('asM1', 'asM2', 'asM3', 'asMR2', 'asM4', 'asM5') and action = 'delete_asset'), 6, 'all six of Maya''s assets are queued for deletion, owned by her id');
select is((pg_temp.job('cancel_upload', 'upM6')).reason, 'account_purged', 'her unfinished upload for cancellation');
select is((pg_temp.job('delete_asset', 'asM1')).not_before, now(), 'her ordinary videos at once');
select is((pg_temp.job('delete_asset', 'asM4')).not_before, now() + interval '20 days', 'M4 30 days after its removal (10 days ago)');
select is((pg_temp.job('delete_asset', 'asM5')).not_before, now() + interval '30 days', 'M5 30 days from now: the purge closed its open case');
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asM1'), 'delete_asset', 'asM1')->>'owner_id', 'c3333333-3333-3333-3333-333333333333', 'the worker leases M1''s deletion with her id, for the ownership check');
select is(pg_temp.finish('delete_asset', 'asM1', 'done', '{"outcome": "deleted"}'), 'done', 'and records it');
select is(jsonb_array_length(pg_temp.claim_only('delete_asset', 'asM4')), 0, 'M4''s is not due');
select is(pg_temp.jobs('asLR1') + pg_temp.jobs('asAR2'), 0, 'nothing of Lena''s or Adam''s replies is queued');

-- Moderation records: anonymised, kept 90 days.
select is((select count(*)::int from public.moderation_actions where target_kind = 'video' and kind = 'remove' and account_id is null and anonymized_at = now()), 2, 'her two removals are kept, anonymised');
select is((select count(*)::int from public.moderation_actions where anonymized_at is not null and (target_id is not null or note is not null)), 0, 'with no target and no note');
select is((select count(*)::int from public.moderation_actions where anonymized_at is not null and reason is null and moderator is null), 2, 'without the free-text reason or the moderator');
select is((select count(*)::int from public.review_requests rr join public.moderation_actions m on m.id = rr.action_id where m.anonymized_at is not null and (rr.account_id is not null or rr.decided_by is not null)), 0, 'decided reviews keep no account and no moderator');
select is((select count(*)::int from public.review_requests where account_id is null and outcome is null), 0, 'her pending review is closed');
select is((select reporter_id::text || status from public.reports where target_id = 'ad000000-0000-0000-0000-000000000004'), null, 'her report on Adam''s video has no reporter');
select is((select status from public.reports where target_id = 'ad000000-0000-0000-0000-000000000004'), 'open', 'and is still open for the team');
select is((select count(*)::int from public.reports where reporter_id is null and target_id is null and status = 'closed' and closed_by = 'account_purged' and anonymized_at is not null), 2, 'Lena''s report on her video and Adam''s on her profile are closed, with no reporter and no target');
select is((select count(*)::int from public.reports where reporter_id in ('a1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222') and target_kind in ('video', 'profile') and status = 'closed'), 0, 'so they no longer link Lena or Adam to her');
select is((select count(*)::int from public.reports where target_id = 'c3333333-3333-3333-3333-333333333333'
           or target_id in ('c3000000-0000-0000-0000-000000000003')), 0, 'no report names her or her videos');
-- 90 days on.
update public.moderation_actions set anonymized_at = now() - interval '91 days' where anonymized_at is not null;
update public.reports set anonymized_at = now() - interval '91 days' where anonymized_at is not null;
select is(public.prune_moderation_records(), 4, 'after 90 days her two removals and the two closed reports are deleted');
select is((select count(*)::int from public.reports where target_id = 'ad000000-0000-0000-0000-000000000004'), 1, 'her open report stays until it is closed');
select is((select count(*)::int from public.moderation_actions where target_id = 'a1000000-0000-0000-0000-000000000002'), 2, 'other people''s records are untouched (L2: removed, restored)');

-- The next day Sam is tried again, still failing; then he is purged.
select is(public.purge_deleted_accounts(), 0, 'Sam still fails');
select is((select attempts from public.account_purge_failures where account_id = 'd4444444-4444-4444-4444-444444444444'), 2, 'attempts are counted');
select is((select jsonb_array_length((public.mux_cleanup_overview())->'purge_failures')), 1, 'and the overview shows it');
drop trigger test_block_purge on public.profiles;
select is(public.purge_deleted_accounts(), 1, 'once the cause is gone, Sam is purged');
select is((select count(*)::int from public.account_purge_failures), 0, 'and his failure row is gone');
select is((pg_temp.job('delete_asset', 'asS1')).reason, 'account_purged', 'his asset is queued');

select is((select count(*)::int from public.responses where author_id is null and status <> 'deleted'), 0, 'every tombstone is deleted');
select throws_ok($$ insert into public.responses (prompt_id, author_id, duration_ms, status) values ('11111111-aaaa-aaaa-aaaa-111111111111', null, 9000, 'live') $$, '23514', null, 'only a deleted video can have no author');
select throws_ok($$ insert into public.comments (response_id, author_id, body) values ('ad000000-0000-0000-0000-000000000004', null, 'x') $$, '23514', null, 'only a deleted comment can have no author');

-- ===========================================================================
-- 8. The sweep: orphans at Mux (F8)
-- ===========================================================================
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, deleted_at) values
  ('ad000000-0000-0000-0000-000000000006', '66666666-aaaa-aaaa-aaaa-666666666666', 'b2222222-2222-2222-2222-222222222222', 9000, 'deleted', 'upA6', 'asA6', now() - interval '5 days');
select is(public.mux_cleanup_sweep(jsonb_build_array(
  jsonb_build_object('id', 'asFounder', 'upload_id', 'upFounder', 'passthrough', 'f0000000-0000-0000-0000-000000000001', 'created_at', extract(epoch from now() - interval '2 days')::bigint::text),
  jsonb_build_object('id', 'asOrphanL', 'upload_id', 'upOrphanL', 'passthrough', 'a1111111-1111-1111-1111-111111111111', 'created_at', extract(epoch from now() - interval '3 days')::bigint::text),
  jsonb_build_object('id', 'asStranger', 'upload_id', 'upStranger', 'passthrough', 'a1111111-1111-1111-1111-111111111111', 'created_at', extract(epoch from now() - interval '3 days')::bigint::text),
  jsonb_build_object('id', 'asMismatch', 'upload_id', 'upOrphanA', 'passthrough', 'a1111111-1111-1111-1111-111111111111', 'created_at', extract(epoch from now() - interval '3 days')::bigint::text),
  jsonb_build_object('id', 'asYoung', 'upload_id', 'upOpenL', 'passthrough', 'a1111111-1111-1111-1111-111111111111', 'created_at', extract(epoch from now() - interval '1 hour')::bigint::text),
  jsonb_build_object('id', 'asA6', 'upload_id', 'upA6', 'passthrough', 'b2222222-2222-2222-2222-222222222222', 'created_at', extract(epoch from now() - interval '6 days')::bigint::text),
  jsonb_build_object('id', 'asLR1', 'upload_id', 'upLR1', 'passthrough', 'a1111111-1111-1111-1111-111111111111', 'created_at', extract(epoch from now() - interval '6 days')::bigint::text),
  jsonb_build_object('id', 'not an id', 'created_at', '1'),
  jsonb_build_object('id', 'asNoDate', 'upload_id', 'upOrphanL', 'passthrough', 'a1111111-1111-1111-1111-111111111111')
)), '{"seen": 8, "young": 2, "in_use": 2, "queued": 2, "review": 2}'::jsonb, 'the sweep sorts what Mux holds');
select is((pg_temp.job('delete_asset', 'asOrphanL')).reason || ':' || (pg_temp.job('delete_asset', 'asOrphanL')).owner_id, 'orphan:a1111111-1111-1111-1111-111111111111', 'an asset from Lena''s unused upload is queued as an orphan, owned by her');
select is((pg_temp.job('delete_asset', 'asA6')).reason, 'sweep', 'a deleted video''s asset that was never queued is queued');
select is((pg_temp.job('delete_asset', 'asStranger')).status, 'review', 'an asset from an upload not in the ledger is only reported');
select is((pg_temp.job('delete_asset', 'asMismatch')).status, 'review', 'so is one whose passthrough is not the upload''s owner');
select is((pg_temp.job('delete_asset', 'asStranger')).owner_id, null, 'with no owner');
select is(pg_temp.jobs('asFounder') + pg_temp.jobs('asLR1') + pg_temp.jobs('asYoung'), 0, 'videos in use and young assets are left alone');
select is((public.mux_cleanup_sweep(jsonb_build_array(
  jsonb_build_object('id', 'asOrphanL', 'upload_id', 'upOrphanL', 'passthrough', 'a1111111-1111-1111-1111-111111111111', 'created_at', extract(epoch from now() - interval '3 days')::bigint::text),
  jsonb_build_object('id', 'asStranger', 'upload_id', 'upStranger', 'passthrough', 'a1111111-1111-1111-1111-111111111111', 'created_at', extract(epoch from now() - interval '3 days')::bigint::text))))->>'queued', '0', 'a second sweep queues nothing twice');
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id in ('asOrphanL', 'asStranger')), 2, 'one row each');
select is(jsonb_array_length(pg_temp.claim_only('delete_asset', 'asStranger')), 0, 'a reported orphan is never leased');
select is(pg_temp.err(format('select public.mux_cleanup_retry(%L)', (pg_temp.job('delete_asset', 'asStranger')).id)), 'job_not_found', 'nor can it be retried into the queue');
select is(pg_temp.err($$ select public.mux_cleanup_sweep('{}'::jsonb) $$), 'invalid_assets', 'the sweep takes a list');
select is(jsonb_array_length((public.mux_cleanup_overview())->'review'), 2, 'the overview lists the two for review');

-- ===========================================================================
-- 8b. Ordering: the database decides at the last moment; a stale job exposes nothing
-- ===========================================================================
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b7777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kim@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now() where id = 'b7777777-7777-7777-7777-777777777777';
insert into public.profiles (id, name, username) values ('b7777777-7777-7777-7777-777777777777', 'Kim Doe', 'testkim');
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('b7000000-0000-0000-0000-000000000001', '11111111-aaaa-aaaa-aaaa-111111111111', 'b7777777-7777-7777-7777-777777777777', 9000, 'live', 'upK1', 'asK1', 'pbK1', now()),
  ('b7000000-0000-0000-0000-000000000002', '22222222-aaaa-aaaa-aaaa-222222222222', 'b7777777-7777-7777-7777-777777777777', 9000, 'live', 'upK2', 'asK2', 'pbK2', now()),
  ('b7000000-0000-0000-0000-000000000003', '33333333-aaaa-aaaa-aaaa-333333333333', 'b7777777-7777-7777-7777-777777777777', 9000, 'live', 'upK3', 'asK3', 'pbK3', now()),
  ('b7000000-0000-0000-0000-000000000004', '44444444-aaaa-aaaa-aaaa-444444444444', 'b7777777-7777-7777-7777-777777777777', 9000, 'live', 'upK4', 'asK4', 'pbK4', now()),
  ('b7000000-0000-0000-0000-000000000005', '55555555-aaaa-aaaa-aaaa-555555555555', 'b7777777-7777-7777-7777-777777777777', 9000, 'live', 'upK5', 'asK5', 'pbK5', now());

-- Delete, then account deletion and recovery: the deleted video is never turned back on.
set local role authenticated;
select pg_temp.act('b7777777-7777-7777-7777-777777777777');
select lives_ok($$ select public.delete_video('b7000000-0000-0000-0000-000000000003') $$, 'Kim deletes K3');
select lives_ok($$ select public.delete_account() $$, 'then her account');
select is((public.get_onboarding_state())->>'has_profile', 'true', 'and signs back in');
reset role;
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asK3' and action = 'sync_playback'), 0, 'recovery queues nothing for the deleted video');
select is((pg_temp.job('delete_asset', 'asK3')).status, 'pending', 'its deletion still stands');
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asK3'), 'delete_asset', 'asK3')->>'reason', 'author_deleted', 'and goes ahead');
select is(pg_temp.finish('delete_asset', 'asK3', 'done', '{"outcome": "deleted"}'), 'done', 'deleted');
update public.mux_cleanup_jobs set status = 'done', owner_id = null, finished_at = now() where asset_id in ('asK1', 'asK2', 'asK4', 'asK5') and status = 'pending';

-- Out of order: account deleted, recovered, then the video deleted, all before the worker runs.
set local role authenticated;
select pg_temp.act('b7777777-7777-7777-7777-777777777777');
select lives_ok($$ select public.delete_account() $$, 'Kim deletes her account');
select is((public.get_onboarding_state())->>'has_profile', 'true', 'signs back in');
select lives_ok($$ select public.delete_video('b7000000-0000-0000-0000-000000000001') $$, 'and deletes K1');
reset role;
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asK1' and status = 'pending'), 2, 'two jobs wait for K1: its playback and its deletion');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asK1'), 'sync_playback', 'asK1')->>'action', 'sync_playback', 'the older, the playback job, is leased first');
select is(jsonb_array_length(pg_temp.claim_only('delete_asset', 'asK1')), 0, 'the deletion waits for it (one job per asset)');
select is((public.mux_cleanup_check((pg_temp.job('sync_playback', 'asK1')).id, (pg_temp.job('sync_playback', 'asK1')).lease_id))->>'wanted', 'false', 'checked now: K1 must not play');
select is(pg_temp.finish('sync_playback', 'asK1', 'done', '{"outcome": "restored", "playback_id": "pbK1stale", "asset_status": "ready"}'), 'done', 'a worker that restored anyway (planned on old state)');
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asK1' and action = 'sync_playback' and result = '{"outcome": "restored", "recorded": false}'::jsonb), 1, 'is not recorded');
select isnt((select mux_playback_id from public.responses where id = 'b7000000-0000-0000-0000-000000000001'), 'pbK1stale', 'the deleted video never gets the new playback id');
select is((public.web_video('b7000000-0000-0000-0000-000000000001'))->>'status', 'unavailable', 'and stays unavailable');
select is(pg_temp.claimed(pg_temp.claim_only('delete_asset', 'asK1'), 'delete_asset', 'asK1')->>'reason', 'author_deleted', 'then the deletion runs (it removes the stray id with the asset)');
select is(pg_temp.finish('delete_asset', 'asK1', 'done', '{"outcome": "deleted"}'), 'done', 'deleted');

-- Removal, restoration, removal: one playback job, which reads the state at the end.
update public.mux_cleanup_jobs set status = 'done', owner_id = null, finished_at = now() where asset_id in ('asK2', 'asK4', 'asK5') and status = 'pending';
select lives_ok($$ select public.mod_remove_video('b7000000-0000-0000-0000-000000000002', 'Spam.', 'nemat') $$, 'K2 is removed');
update public.moderation_actions set created_at = now() - interval '40 days' where target_id = 'b7000000-0000-0000-0000-000000000002';
select lives_ok($$ select public.mod_restore_video('b7000000-0000-0000-0000-000000000002', 'Mistake.', 'nemat') $$, 'restored');
select lives_ok($$ select public.mod_remove_video('b7000000-0000-0000-0000-000000000002', 'Spam again.', 'nemat') $$, 'and removed again');
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asK2' and action = 'sync_playback' and status = 'pending'), 1, 'the three changes share one playback job');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asK2'), 'sync_playback', 'asK2')->>'playback_wanted', 'false', 'which revokes: the last change was a removal');
select is(pg_temp.finish('sync_playback', 'asK2', 'done', '{"outcome": "revoked", "revoked": ["pbK2"]}'), 'done', 'revoked');
select is(jsonb_array_length(pg_temp.claim_only('delete_asset', 'asK2')), 0, 'the deletion is not due');
select is((pg_temp.job('delete_asset', 'asK2')).not_before, now() + interval '30 days', '30 days from the second removal, not the first (40 days ago)');
set local role authenticated;
select pg_temp.act('b7777777-7777-7777-7777-777777777777');
select lives_ok($$ select public.request_review((select id from public.moderation_actions where target_id = 'b7000000-0000-0000-0000-000000000002' and reason = 'Spam again.')) $$, 'Kim requests a review');
reset role;
select is((select (e->>'video_restorable')::boolean from jsonb_array_elements(public.mod_review_queue()) e where e->'action'->>'target_id' = 'b7000000-0000-0000-0000-000000000002'), true, 'the review queue shows the video can still be restored');
select is(public.mux_asset_hold('asK2', 'upK2'), 'infinity'::timestamptz, 'and the review holds the asset');

-- A review after the asset was permanently deleted: the reversal is refused, clearly.
select lives_ok($$ select public.mod_remove_video('b7000000-0000-0000-0000-000000000005', 'Spam.', 'nemat') $$, 'K5 is removed');
set local role authenticated;
select pg_temp.act('b7777777-7777-7777-7777-777777777777');
select lives_ok($$ select public.request_review((select id from public.moderation_actions where target_id = 'b7000000-0000-0000-0000-000000000005')) $$, 'Kim requests a review');
reset role;
insert into public.mux_cleanup_jobs (action, reason, status, dedupe_key, asset_id, upload_id, finished_at, result)
values ('delete_asset', 'moderation_removed', 'done', 'done:asK5', 'asK5', 'upK5', now(), '{"outcome": "deleted"}');
select is((select (e->>'video_restorable')::boolean from jsonb_array_elements(public.mod_review_queue()) e where e->'action'->>'target_id' = 'b7000000-0000-0000-0000-000000000005'), false, 'once its asset is deleted the queue says it cannot be restored');
select is(pg_temp.err($$ select public.mod_decide_review((select id from public.moderation_actions where target_id = 'b7000000-0000-0000-0000-000000000005'), 'reversed', 'nemat') $$), 'asset_deleted', 'reversing it is refused');
select is((select outcome from public.review_requests where action_id = (select id from public.moderation_actions where target_id = 'b7000000-0000-0000-0000-000000000005')), null, 'and the review stays pending for the moderator to decide');

-- Recovery and a new deletion at the same time: a restore running when the account is deleted again.
set local role authenticated;
select pg_temp.act('b7777777-7777-7777-7777-777777777777');
select lives_ok($$ select public.delete_account() $$, 'Kim deletes her account');
reset role;
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asK4'), 'sync_playback', 'asK4')->>'playback_wanted', 'false', 'K4 is revoked');
select is(pg_temp.finish('sync_playback', 'asK4', 'done', '{"outcome": "revoked", "revoked": ["pbK4"]}'), 'done', 'at Mux');
set local role authenticated;
select pg_temp.act('b7777777-7777-7777-7777-777777777777');
select is((public.get_onboarding_state())->>'has_profile', 'true', 'she signs back in');
reset role;
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asK4'), 'sync_playback', 'asK4')->>'playback_wanted', 'true', 'the restore is leased');
set local role authenticated;
select pg_temp.act('b7777777-7777-7777-7777-777777777777');
select lives_ok($$ select public.delete_account() $$, 'and while it runs she deletes her account again');
reset role;
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asK4' and status = 'pending'), 1, 'a revoke is queued behind the running restore');
select is((public.mux_cleanup_check((pg_temp.job('sync_playback', 'asK4')).id, (select lease_id from public.mux_cleanup_jobs where asset_id = 'asK4' and status = 'running')))->>'wanted', 'false', 'the worker''s check after creating the id says: no longer wanted');
select is((select public.mux_cleanup_finish(id, lease_id, 'done', '{"outcome": "restored", "playback_id": "pbK4new", "asset_status": "ready"}')->>'recorded' from public.mux_cleanup_jobs where asset_id = 'asK4' and status = 'running'), 'false', 'a restore finished anyway is not recorded');
select is((select mux_playback_id from public.responses where id = 'b7000000-0000-0000-0000-000000000004'), null, 'K4 has no playback id');
select is((public.web_video('b7000000-0000-0000-0000-000000000004'))->>'status', 'unavailable', 'and is not shown');
select is(pg_temp.claimed(pg_temp.claim_only('sync_playback', 'asK4'), 'sync_playback', 'asK4')->>'playback_wanted', 'false', 'the queued revoke then removes any id at Mux');

-- Duplicates: the same deletion queued twice is one job.
select public.mux_cleanup_enqueue('delete_asset', 'orphan', 'asDup', 'upDup', null, 'a1111111-1111-1111-1111-111111111111');
select public.mux_cleanup_enqueue('delete_asset', 'sweep', 'asDup', 'upDup', null, 'a1111111-1111-1111-1111-111111111111', now() + interval '1 day');
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asDup'), 1, 'one job');
select is((pg_temp.job('delete_asset', 'asDup')).not_before, now() + interval '1 day', 'keeping the later time (a deletion is never brought forward)');

-- Retention of the job log: finished jobs for 30 days; failures and review items until a person acts.
update public.mux_cleanup_jobs set finished_at = now() - interval '31 days' where status in ('done', 'skipped', 'failed') or status = 'review';
create temp table unresolved as select count(*)::int as n from public.mux_cleanup_jobs where status in ('failed', 'review');
select cmp_ok(public.prune_mux_cleanup_jobs(), '>', 0, 'done and skipped jobs older than 30 days are deleted');
select is((select count(*)::int from public.mux_cleanup_jobs where status in ('done', 'skipped')), 0, 'all of them');
select is((select count(*)::int from public.mux_cleanup_jobs where status in ('failed', 'review')), (select n from unresolved), 'failed and review jobs are kept, however old');
select cmp_ok((select n from unresolved), '>', 0, '(there are some)');

-- ===========================================================================
-- 9. The founder's video
-- ===========================================================================
select is(public.mux_asset_hold('asFounder', 'upFounder'), 'infinity'::timestamptz, 'the founder''s asset is in use');
select public.mux_cleanup_enqueue('delete_asset', 'orphan', 'asFounder', 'upFounder', null, 'f0000000-0000-0000-0000-000000000001');
select is(jsonb_array_length(pg_temp.claim_only('delete_asset', 'asFounder')), 0, 'even a deletion queued by mistake is never leased');
select is((pg_temp.job('delete_asset', 'asFounder')).status, 'skipped', 'it is skipped: in use');
select is((select md5(r::text) from public.responses r where id = 'f0000000-0000-0000-0000-00000000000a'), (select h from founder_before), 'the founder''s row is unchanged, every column');
select is((public.web_video('f0000000-0000-0000-0000-00000000000a'))->'video'->>'playback_id', 'pbFounder', 'and it plays');

select * from finish();
rollback;
