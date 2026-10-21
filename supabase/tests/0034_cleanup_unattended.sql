-- pgTAP tests for 20261021000200 (clean-up left on unattended): the deletion cap and its pause
-- (U1), the added health checks (U2) and the alert messages (U3). Inside one transaction now() does
-- not move, so "later" is written as moving recorded times back. pg_net requests made here are
-- rolled back with the transaction and never sent.
begin;
select plan(105);

delete from public.responses;
delete from public.prompts;
delete from public.video_uploads;
delete from public.mux_cleanup_jobs;
delete from public.mux_cleanup_runs;
delete from public.account_purge_failures;
delete from vault.secrets where name like 'mux_cleanup_%';

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
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Be honest about the place you live.', 'live', now());

-- The founder's live video: it must come through untouched, also by a forged job.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('f0000000-0000-0000-0000-00000000000a', '11111111-aaaa-aaaa-aaaa-111111111111', 'f0000000-0000-0000-0000-000000000001', 9911, 'live', 'upFounder', 'asFounder', 'pbFounder', now() - interval '1 day');
create temp table founder_before as select md5(r::text) as h from public.responses r where id = 'f0000000-0000-0000-0000-00000000000a';

-- Lena deleted five videos (D1 to D5); Adam has one live video, A1, whose account is deleted.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at, deleted_at)
select ('d000000' || n || '-0000-0000-0000-000000000000')::uuid, '11111111-aaaa-aaaa-aaaa-111111111111', 'a1111111-1111-1111-1111-111111111111', 9000,
       'deleted', 'upD' || n, 'asD' || n, null, now() - interval '2 days', now()
  from generate_series(1, 5) n;
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('a0000000-0000-0000-0000-0000000000a1', '11111111-aaaa-aaaa-aaaa-111111111111', 'b2222222-2222-2222-2222-222222222222', 9000, 'live', 'upA1', 'asA1', 'pbA1', now() - interval '2 days');
select public.mux_cleanup_enqueue('delete_asset', 'author_deleted', 'asD' || n, 'upD' || n, ('d000000' || n || '-0000-0000-0000-000000000000')::uuid, 'a1111111-1111-1111-1111-111111111111')
  from generate_series(1, 4) n;
update public.accounts set deleted_at = now() where id = 'b2222222-2222-2222-2222-222222222222';
select public.mux_sync_account_playback('b2222222-2222-2222-2222-222222222222', 'account_deleted');
update public.mux_cleanup_jobs set not_before = now() - interval '1 minute', created_at = now() - interval '2 minutes';

create function pg_temp.claimed(p jsonb, p_action text) returns integer language sql as $$
  select count(*)::int from jsonb_array_elements(p->'jobs') j where j->>'action' = p_action;
$$;
create function pg_temp.finish_all(p jsonb, p_detail jsonb) returns void language sql as $$
  select public.mux_cleanup_finish((j->>'id')::uuid, (j->>'lease')::uuid, 'done',
                                   case when j->>'action' = 'delete_asset' then p_detail else '{"outcome": "revoked", "revoked": []}'::jsonb end)
    from jsonb_array_elements(p->'jobs') j;
$$;
create function pg_temp.problem(p_check text, p_level text) returns boolean language sql as $$
  select (public.mux_cleanup_health())->'problems' @> jsonb_build_array(jsonb_build_object('check', p_check, 'level', p_level));
$$;
create function pg_temp.has_problem(p_check text) returns boolean language sql as $$
  select (public.mux_cleanup_health())->'problems' @> jsonb_build_array(jsonb_build_object('check', p_check));
$$;

-- ===========================================================================
-- Privileges and defaults
-- ===========================================================================
select is(has_function_privilege('authenticated', 'public.mux_cleanup_set_deletion_cap(integer, text)', 'execute') or has_function_privilege('anon', 'public.mux_cleanup_set_deletion_cap(integer, text)', 'execute'), false, 'members cannot set the cap');
select is(has_function_privilege('authenticated', 'public.mux_cleanup_resume_deletions(text)', 'execute') or has_function_privilege('anon', 'public.mux_cleanup_resume_deletions(text)', 'execute'), false, 'members cannot resume deletions');
select is(has_function_privilege('authenticated', 'public.mux_cleanup_alert(text)', 'execute') or has_function_privilege('anon', 'public.mux_cleanup_alert(text)', 'execute'), false, 'members cannot send alerts');
select is(has_function_privilege('authenticated', 'public.mux_cleanup_health()', 'execute') or has_function_privilege('anon', 'public.mux_cleanup_health()', 'execute'), false, 'members cannot run the health check');
select ok(has_function_privilege('service_role', 'public.mux_cleanup_set_deletion_cap(integer, text)', 'execute')
          and has_function_privilege('service_role', 'public.mux_cleanup_resume_deletions(text)', 'execute')
          and has_function_privilege('service_role', 'public.mux_cleanup_alert(text)', 'execute')
          and has_function_privilege('service_role', 'public.mux_cleanup_health()', 'execute'), 'the service role can use all four');
select is(has_function_privilege('service_role', 'public.mux_cleanup_health_base()', 'execute'), false, 'the old checks are reached only through mux_cleanup_health()');
select is(has_function_privilege('service_role', 'public.mux_cleanup_deletions_counted()', 'execute'), false, 'the count is internal');
select is(has_function_privilege('service_role', 'public.mux_cleanup_claim(integer, integer)', 'execute'), true, 'the worker can still claim');
select is(has_function_privilege('authenticated', 'public.mux_cleanup_claim(integer, integer)', 'execute'), false, 'members still cannot');
select is(has_function_privilege('anon', 'public.run_mux_cleanup(text)', 'execute') or has_function_privilege('authenticated', 'public.run_mux_cleanup(text)', 'execute'), false, 'members still cannot call the scheduler''s function');
select ok((select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('public.mux_cleanup_settings_log'::regclass, 'public.mux_cleanup_alerts'::regclass)), 'the new tables have RLS on');
select is(has_table_privilege('authenticated', 'public.mux_cleanup_settings_log', 'select') or has_table_privilege('anon', 'public.mux_cleanup_alerts', 'select'), false, 'and no member can read them');
select is((select provolatile::text from pg_proc where oid = 'public.mux_cleanup_health()'::regprocedure), 's', 'the health check only reads');
select is((select deletion_cap from public.mux_cleanup_settings), null, 'after the migration there is no cap (as before)');
select is((select count(*)::int from cron.job where jobname in ('mux-cleanup-alert', 'mux-cleanup-weekly') and active), 2, 'the alert and weekly schedules are active');
select is((select schedule from cron.job where jobname = 'mux-cleanup-alert'), '5-59/10 * * * *', 'alerts every 10 minutes, after the monitor');

-- ===========================================================================
-- U1. The cap
-- ===========================================================================
select throws_ok($$select public.mux_cleanup_set_deletion_cap(-1, 'pgtap')$$, 'P0001', 'invalid_cap', 'a negative cap is refused');
select throws_ok($$select public.mux_cleanup_set_deletion_cap(1001, 'pgtap')$$, 'P0001', 'invalid_cap', 'so is one over 1000');
select throws_ok($$select public.mux_cleanup_set_deletion_cap(2, ' ')$$, 'P0001', 'changed_by_required', 'who must be said');
select throws_ok($$select public.mux_cleanup_resume_deletions(null)$$, 'P0001', 'changed_by_required', 'also to resume');
select public.mux_cleanup_set_mode('live', 'pgtap live');
select ok(pg_temp.problem('no_deletion_cap', 'warn'), 'live with no cap is a warning');
select ok(pg_temp.problem('alerts_not_configured', 'warn'), 'live with no alert channel is a warning');
select is((select (public.mux_cleanup_set_deletion_cap(2, 'pgtap cap'))->>'deletion_cap'), '2', 'the cap is set to 2');
select ok(not pg_temp.has_problem('no_deletion_cap'), 'and the warning goes');
select is((select changed_by || '|' || coalesce(cap_before::text, 'null') || '|' || cap_after from public.mux_cleanup_settings_log order by id desc limit 1), 'pgtap cap|null|2', 'the change is logged with who made it');
select is((select changed_by || '|' || mode_before || '|' || mode_after from public.mux_cleanup_settings_log where mode_before is distinct from mode_after order by id desc limit 1), 'pgtap live|off|live', 'and so was going live');

-- Four deletions and one revocation are due; the cap lets two deletions through.
create temp table c1 as select public.mux_cleanup_claim(10, 120) as c;
select is((select pg_temp.claimed(c, 'delete_asset') from c1), 2, 'two deletions are leased (the cap)');
select is((select pg_temp.claimed(c, 'sync_playback') from c1), 1, 'the revocation is leased as well');
select isnt((select deletions_paused_at from public.mux_cleanup_settings), null, 'the third deletion paused deletions');
select is((select changed_by from public.mux_cleanup_settings_log order by id desc limit 1), 'deletion cap', 'the pause is logged as the cap''s');
select is((select count(*)::int from public.mux_cleanup_jobs where action = 'delete_asset' and status = 'pending' and attempts = 0), 2, 'the other two wait, with no attempt used');
select ok(pg_temp.problem('deletions_paused', 'alert'), 'paused deletions are an alert');
select is(((public.mux_cleanup_health())->'metrics'->>'deletions_counted')::int, 2, 'the two leased deletions count');
select pg_temp.finish_all(c, '{"outcome": "deleted"}') from c1;
select is(((public.mux_cleanup_health())->'metrics'->>'deletions_counted')::int, 2, 'and still count once done');
update public.mux_cleanup_jobs set finished_at = now() - interval '10 minutes' where action = 'delete_asset' and status = 'done';

-- While paused: no deletion is leased, other jobs are, and the scheduler does not call the worker
-- for the deletions alone.
select vault.create_secret('http://127.0.0.1:1/functions/v1/mux-cleanup', 'mux_cleanup_url');
select vault.create_secret('test-cleanup-key', 'mux_cleanup_key');
select public.run_mux_cleanup('drain');
select is((select count(*)::int from public.mux_cleanup_runs), 0, 'paused deletions alone do not make the scheduler call the worker');
insert into public.video_uploads (account_id, upload_id, status, created_at, reserved_until, expires_at, activated_at)
values ('a1111111-1111-1111-1111-111111111111', 'upC1', 'active', now() - interval '1 hour', now() - interval '1 hour', now() + interval '1 hour', now() - interval '1 hour');
select public.mux_cleanup_enqueue('cancel_upload', 'abandoned', null, 'upC1', null, 'a1111111-1111-1111-1111-111111111111', now() - interval '1 minute');
select public.run_mux_cleanup('drain');
select is((select count(*)::int from public.mux_cleanup_runs), 1, 'a cancellation due does');
create temp table c2 as select public.mux_cleanup_claim(10, 120) as c;
select is((select pg_temp.claimed(c, 'delete_asset') from c2), 0, 'paused: no deletion is leased');
select is((select pg_temp.claimed(c, 'cancel_upload') from c2), 1, 'the cancellation is');
select public.mux_cleanup_finish((j->>'id')::uuid, (j->>'lease')::uuid, 'done', '{"outcome": "cancelled"}') from c2, jsonb_array_elements(c->'jobs') j;

-- A forged deletion of the founder's live asset, with the right owner: kept, and it neither counts
-- nor trips anything.
update public.mux_cleanup_settings set deletions_paused_at = null where id;
select public.mux_cleanup_set_deletion_cap(0, 'pgtap hold');
select public.mux_cleanup_enqueue('delete_asset', 'orphan', 'asFounder', 'upFounder', null, 'f0000000-0000-0000-0000-000000000001', now() - interval '1 minute');
create temp table c3 as select public.mux_cleanup_claim(10, 120) as c;
select is((select status || '|' || (result->>'outcome') from public.mux_cleanup_jobs where asset_id = 'asFounder'), 'skipped|kept', 'a deletion of an asset a live video uses is kept, even forged with the right owner');
select is((select pg_temp.claimed(c, 'delete_asset') from c3), 0, 'cap 0: no deletion is leased');
select isnt((select deletions_paused_at from public.mux_cleanup_settings), null, 'cap 0 pauses at the first deletion that could go ahead');

-- A dry run is not limited: it only plans.
select public.mux_cleanup_set_mode('dry_run', 'pgtap dry');
create temp table c4 as select public.mux_cleanup_claim(10, 120) as c;
select is((select pg_temp.claimed(c, 'delete_asset') from c4), 2, 'in a dry run paused deletions are still leased, to be planned');
select public.mux_cleanup_finish((j->>'id')::uuid, (j->>'lease')::uuid, 'release', '{"dry_run": true, "would": {"act": "delete"}}') from c4, jsonb_array_elements(c->'jobs') j;
select is((select count(*)::int from public.mux_cleanup_jobs where action = 'delete_asset' and status = 'pending' and attempts = 0 and (result->>'dry_run') = 'true'), 2, 'and released with their plans, no attempt used');

-- Resuming: a fresh count from now. Going live puts the planned jobs back in the queue.
select public.mux_cleanup_set_mode('live', 'pgtap live again');
select public.mux_cleanup_set_deletion_cap(2, 'pgtap cap');
select is((select deletions_paused_at from public.mux_cleanup_settings), now(), 'setting the cap does not resume');
select is((select (public.mux_cleanup_resume_deletions('pgtap resume'))->>'deletions_due'), '2', 'resuming says how many deletions are due');
select is((select deletions_paused_at from public.mux_cleanup_settings), null, 'deletions are resumed');
select is((select changed_by || '|' || (paused_after is null)::text from public.mux_cleanup_settings_log order by id desc limit 1), 'pgtap resume|true', 'the resume is logged');
select is(((public.mux_cleanup_health())->'metrics'->>'deletions_counted')::int, 0, 'deletions before the resume no longer count');
create temp table c5 as select public.mux_cleanup_claim(10, 120) as c;
select is((select pg_temp.claimed(c, 'delete_asset') from c5), 2, 'the two waiting deletions go ahead');
select is((select deletions_paused_at from public.mux_cleanup_settings), null, 'within the cap: no pause');
select pg_temp.finish_all(c, '{"outcome": "deleted"}') from c5;
-- An asset Mux had already deleted does not count (the deletions above finished after the resume).
update public.mux_cleanup_settings set deletions_resumed_at = now() - interval '1 minute' where id;
select public.mux_cleanup_enqueue('delete_asset', 'author_deleted', 'asD5', 'upD5', 'd0000005-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111', now() - interval '1 minute');
update public.mux_cleanup_jobs set result = '{"outcome": "already_gone"}' where asset_id = 'asD4';
select is(((public.mux_cleanup_health())->'metrics'->>'deletions_counted')::int, 1, 'an asset already gone at Mux does not count');
-- A day later the earlier deletions no longer count either.
update public.mux_cleanup_settings set deletions_resumed_at = now() - interval '2 days' where id;
update public.mux_cleanup_jobs set finished_at = now() - interval '25 hours' where action = 'delete_asset' and status = 'done';
select is(((public.mux_cleanup_health())->'metrics'->>'deletions_counted')::int, 0, 'deletions over 24 hours ago no longer count');
create temp table c6 as select public.mux_cleanup_claim(10, 120) as c;
select is((select pg_temp.claimed(c, 'delete_asset') from c6), 1, 'so the next deletion goes ahead');
select pg_temp.finish_all(c, '{"outcome": "deleted"}') from c6;
select ok(not pg_temp.has_problem('deletions_paused'), 'nothing is paused now');

-- ===========================================================================
-- U2. The other health checks
-- ===========================================================================
-- The database live, the worker in dry run (MUX_CLEANUP_MODE not live).
update public.mux_cleanup_settings set changed_at = now() - interval '10 minutes' where id;
insert into public.mux_cleanup_runs (request_id, mode, requested_at, collected_at, status_code, ok, summary)
values (-11, 'drain', now() - interval '20 minutes', now(), 200, true, '{"mode": "live", "claimed": 1}');
select ok(not pg_temp.has_problem('worker_not_live'), 'a live answer from before the switch went live says nothing');
insert into public.mux_cleanup_runs (request_id, mode, requested_at, collected_at, status_code, ok, summary)
values (-12, 'drain', now() - interval '5 minutes', now(), 200, true, '{"mode": "dry_run", "claimed": 1, "release": 1}');
select ok(pg_temp.problem('worker_not_live', 'alert'), 'a dry-run answer after the switch went live is an alert');
select is((public.mux_cleanup_health())->'metrics'->>'worker_mode', 'dry_run', 'with the worker''s mode');
insert into public.mux_cleanup_runs (request_id, mode, requested_at, collected_at, status_code, ok, summary)
values (-13, 'drain', now() - interval '1 minute', now(), 200, true, '{"mode": "live", "claimed": 1}');
select ok(not pg_temp.has_problem('worker_not_live'), 'the next live answer clears it');
delete from public.mux_cleanup_runs where request_id in (-11, -12, -13);
-- Before any answer is collected, a job the worker released as a dry run shows it.
select public.mux_cleanup_enqueue('sync_playback', 'account_restored', 'asA1', 'upA1', 'a0000000-0000-0000-0000-0000000000a1', 'b2222222-2222-2222-2222-222222222222');
update public.mux_cleanup_jobs set result = '{"dry_run": true}', not_before = now() + interval '1 hour' where action = 'sync_playback' and status = 'pending';
select ok(pg_temp.problem('worker_not_live', 'alert'), 'a job released as a dry run since going live is an alert');
update public.mux_cleanup_jobs set result = null, not_before = now() - interval '1 minute' where action = 'sync_playback' and status = 'pending';
select ok(not pg_temp.has_problem('worker_not_live'), 'without it, nothing');

-- A job retried three times.
update public.mux_cleanup_jobs set attempts = 3, last_error = 'mux_500' where action = 'sync_playback' and status = 'pending';
select ok(pg_temp.problem('retrying_jobs', 'warn'), 'a job retried 3 times is a warning');
select is(((public.mux_cleanup_health())->'metrics'->>'retrying')::int, 1, 'counted');
select ok((public.mux_cleanup_health())->'problems' @> '[{"check": "backlog_age"}]' is false, 'not yet a backlog alert');
update public.mux_cleanup_jobs set attempts = 2 where action = 'sync_playback' and status = 'pending';
select ok(not pg_temp.has_problem('retrying_jobs'), 'twice is not');

-- The alert schedule stopping is an alert; the weekly one a warning.
select cron.alter_job((select jobid from cron.job where jobname = 'mux-cleanup-alert'), active := false);
select ok(pg_temp.problem('schedule_missing', 'alert'), 'an inactive alert schedule is an alert');
select cron.alter_job((select jobid from cron.job where jobname = 'mux-cleanup-alert'), active := true);
select cron.alter_job((select jobid from cron.job where jobname = 'mux-cleanup-weekly'), active := false);
select ok((public.mux_cleanup_health())->'problems' @> '[{"check": "schedule_missing", "level": "warn", "detail": "mux-cleanup-weekly is not scheduled or not active"}]', 'an inactive weekly schedule is a warning');
select cron.alter_job((select jobid from cron.job where jobname = 'mux-cleanup-weekly'), active := true);
-- The old checks are all still there.
update public.mux_cleanup_jobs set status = 'failed', finished_at = now(), last_error = 'not_verified' where action = 'sync_playback' and status = 'pending';
select ok(pg_temp.problem('failed_jobs', 'alert'), 'a failed job is still an alert');
select ok((public.mux_cleanup_health())->'thresholds' ? 'stuck_minutes' and (public.mux_cleanup_health())->'thresholds' ? 'retrying_attempts', 'old and new thresholds are reported');
select ok((public.mux_cleanup_health())->'metrics'->'schedules' ? 'mux-sweep' and (public.mux_cleanup_health())->'metrics'->'schedules' ? 'mux-cleanup-alert', 'old and new schedules are reported');

-- ===========================================================================
-- U3. Alerts
-- ===========================================================================
select throws_ok($$select public.mux_cleanup_alert('loud')$$, 'P0001', 'invalid_kind', 'an unknown kind is refused');
select is((public.mux_cleanup_alert('auto'))->>'reason', 'not_configured', 'without the secrets nothing is sent');
select is((select count(*)::int from public.mux_cleanup_alerts), 0, 'and nothing is recorded');
select vault.create_secret('re_test_key', 'mux_cleanup_alert_key');
select vault.create_secret('ops@example.com', 'mux_cleanup_alert_to');
select vault.create_secret('Conga ops <ops@auth.example.com>', 'mux_cleanup_alert_from');
select vault.create_secret('http://127.0.0.1:1/emails', 'mux_cleanup_alert_url');
select ok(not pg_temp.has_problem('alerts_not_configured'), 'with them, the warning goes');

create temp table a1 as select public.mux_cleanup_alert('auto') as a;
select is((select a->>'kind' || '|' || (a->>'sent') from a1), 'alert|true', 'a problem is sent as an alert');
create temp table q1 as select q.* from net.http_request_queue q, a1 where q.id = (a->>'request_id')::bigint;
select is((select url from q1), 'http://127.0.0.1:1/emails', 'to the configured address');
select is((select headers->>'Authorization' from q1), 'Bearer re_test_key', 'with the key');
select is((select convert_from(body, 'utf8')::jsonb->'to' from q1), '["ops@example.com"]', 'to the recipient');
select ok((select convert_from(body, 'utf8')::jsonb->>'subject' from q1) like 'Conga clean-up: alert (%failed_jobs%)', 'the subject names the status and the checks');
select ok((select convert_from(body, 'utf8')::jsonb->>'text' from q1) like '%alert failed_jobs:%Emergency stop: select public.mux_cleanup_set_mode(''off''%', 'the text has the problems and the emergency stop');
select is((select count(*)::int from q1, public.mux_cleanup_jobs j, public.responses r
            where position(j.asset_id in convert_from(q1.body, 'utf8')) > 0 or position(coalesce(j.upload_id, '~') in convert_from(q1.body, 'utf8')) > 0
               or position(r.id::text in convert_from(q1.body, 'utf8')) > 0 or position(coalesce(r.author_id::text, '~') in convert_from(q1.body, 'utf8')) > 0
               or position(coalesce(r.mux_playback_id, '~') in convert_from(q1.body, 'utf8')) > 0), 0, 'it names no asset, upload, video, account or playback id');
select is((public.mux_cleanup_alert('auto'))->>'reason', 'unchanged', 'the same problems are not sent again');
-- A new problem within 30 minutes waits, unless the status gets worse.
insert into public.account_purge_failures (account_id, last_error) values ('d0000000-0000-0000-0000-000000000009', 'test');
select is((public.mux_cleanup_alert('auto'))->>'reason', 'too_soon', 'a change within 30 minutes of the last message waits');
update public.mux_cleanup_alerts set created_at = now() - interval '31 minutes';
select is((public.mux_cleanup_alert('auto'))->>'kind', 'alert', 'after that it is sent');
-- The same problems a day later: a reminder.
update public.mux_cleanup_alerts set created_at = now() - interval '25 hours';
select is((public.mux_cleanup_alert('auto'))->>'kind', 'reminder', 'still there a day later: a reminder');
select ok((select convert_from(q.body, 'utf8')::jsonb->>'subject' from net.http_request_queue q where q.id = (select max(request_id) from public.mux_cleanup_alerts)) like 'Conga clean-up: still alert%', 'saying so');
-- Delivery: Resend's answer is collected; a refused message shows in the health check.
insert into net._http_response (id, status_code, content, timed_out, created) select max(request_id), 401, '{"name": "validation_error"}', false, now() from public.mux_cleanup_alerts;
select public.mux_cleanup_alert('auto');
select is((select delivery_status from public.mux_cleanup_alerts order by id desc limit 1), 401, 'the delivery answer is recorded');
select ok(pg_temp.problem('alert_not_delivered', 'warn'), 'an undelivered alert is a warning');
-- Escalation from a warning to an alert is sent at once.
delete from public.account_purge_failures;
update public.mux_cleanup_jobs set status = 'done', finished_at = now(), result = '{"outcome": "revoked"}', owner_id = null, response_id = null where status = 'failed';
update public.mux_cleanup_alerts set created_at = now() - interval '2 hours';
create temp table a2 as select public.mux_cleanup_alert('auto') as a;
select is((select (a->>'kind') || '|' || (a->>'status') from a2), 'alert|warn', 'down to warnings: sent as a change');
insert into public.account_purge_failures (account_id, last_error) values ('d0000000-0000-0000-0000-000000000009', 'test');
select is((public.mux_cleanup_alert('auto'))->>'kind', 'alert', 'back to an alert within 30 minutes: sent at once');
-- Recovery: the status ok again after a message about problems.
delete from public.account_purge_failures;
update public.mux_cleanup_jobs set status = 'skipped', finished_at = now(), owner_id = owner_id where status = 'pending';
update public.mux_cleanup_jobs set finished_at = now() - interval '25 hours', created_at = now() - interval '25 hours';
update public.mux_cleanup_alerts set delivery_status = 202 where delivery_status = 401;
insert into net._http_response (id, status_code, timed_out, created) select request_id, 202, false, now() from public.mux_cleanup_alerts where request_id is not null on conflict do nothing;
insert into public.mux_cleanup_runs (request_id, mode, requested_at, collected_at, status_code, ok, summary)
values (-21, 'sweep', now() - interval '1 hour', now(), 200, true, '{"mode": "live", "listed": 1}');
insert into cron.job_run_details (jobid, runid, job_pid, database, username, command, status, start_time, end_time)
select jobid, 900000000 + jobid, 1, 'postgres', 'postgres', command, 'succeeded', now() - interval '1 minute', now() - interval '1 minute' from cron.job;
select is((public.mux_cleanup_health())->>'status', 'ok', 'nothing wrong: the health check is ok');
select is((public.mux_cleanup_alert('auto'))->>'reason', 'too_soon', 'a recovery within 30 minutes of the last message waits');
update public.mux_cleanup_alerts set created_at = now() - interval '31 minutes';
create temp table a3 as select public.mux_cleanup_alert('auto') as a;
select is((select a->>'kind' from a3), 'recovery', 'then the recovery is sent');
select is((select convert_from(q.body, 'utf8')::jsonb->>'subject' from net.http_request_queue q, a3 where q.id = (a->>'request_id')::bigint), 'Conga clean-up: recovered, status ok', 'saying so');
select is((public.mux_cleanup_alert('auto'))->>'reason', 'ok', 'and nothing more while it stays ok');
-- Weekly and test messages go whatever the state, and do not change what counts as last sent.
select is((public.mux_cleanup_alert('weekly'))->>'kind', 'weekly', 'the weekly status is sent');
select is((select convert_from(q.body, 'utf8')::jsonb->>'subject' from net.http_request_queue q where q.id = (select max(request_id) from public.mux_cleanup_alerts)), 'Conga clean-up: weekly status, ok', 'saying the status');
select is((public.mux_cleanup_alert('test'))->>'kind', 'test', 'a test message is sent');
select is((public.mux_cleanup_alert('auto'))->>'reason', 'ok', 'neither starts a new alert');
-- At most 30 messages in 24 hours.
insert into public.account_purge_failures (account_id, last_error) values ('d0000000-0000-0000-0000-000000000009', 'test');
insert into public.mux_cleanup_alerts (kind, status, signature, created_at) select 'weekly', 'ok', 'x', now() - interval '1 hour' from generate_series(1, 30);
select is((public.mux_cleanup_alert('auto'))->>'reason', 'daily_limit', 'over 30 messages in 24 hours the next waits');
select is((public.mux_cleanup_alert('test'))->>'kind', 'test', 'a test message is not limited');
-- Old records go after 90 days.
update public.mux_cleanup_alerts set created_at = now() - interval '91 days' where signature = 'x';
select public.mux_cleanup_alert('auto');
select is((select count(*)::int from public.mux_cleanup_alerts where signature = 'x'), 0, 'messages over 90 days old are deleted');

-- ===========================================================================
-- The log records changes made directly in SQL too.
-- ===========================================================================
update public.mux_cleanup_settings set mode = 'off' where id;
select is((select mode_before || '|' || mode_after || '|' || changed_by from public.mux_cleanup_settings_log order by id desc limit 1), 'live|off|' || session_user, 'a direct update is logged with the database user');
select is((select count(*)::int from public.mux_cleanup_settings_log), (select count(*)::int from public.mux_cleanup_settings_log where changed_by is not null), 'every change has a who');

-- ===========================================================================
-- The founder's video came through untouched.
-- ===========================================================================
select is((select md5(r::text) from public.responses r where id = 'f0000000-0000-0000-0000-00000000000a'), (select h from founder_before), 'the founder''s row is unchanged');
select is((select count(*)::int from public.mux_cleanup_jobs where asset_id = 'asFounder' and status in ('running', 'done')), 0, 'no job ever ran on its asset');

select * from finish();
rollback;
