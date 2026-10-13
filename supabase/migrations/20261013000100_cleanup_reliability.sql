-- Security stage 3, reliability fixes before the remaining real-Mux tests (Nemat, 13 Oct;
-- docs/BETA-READINESS.md section 15, G2, G5 and G6). A forward migration on top of the deployed
-- 20261012000200_video_deletion_cleanup.sql, which is not edited. It changes no row of existing
-- data: three functions are replaced, one is changed to record what it asks of the worker, and one
-- table, two functions and one schedule are added. Rollback:
-- supabase/rollback/20261013000100_cleanup_reliability.down.sql.
--
-- G2. An author's deletion is immediate (DECISIONS, 12 Oct), also for a video that was removed and
-- restored. A removal queues the asset's deletion; with no review the first claim reschedules it to
-- 30 days after the case closed, and the restore left it waiting there. A later deletion by the
-- author merged into that job, which keeps the later time, so the asset and its public playback
-- stayed at Mux for up to 30 days. Now a restore closes the retention's deletion, and an author's
-- deletion (or abandoning) makes a deletion of the asset that is still waiting due at once. The
-- claim still works out any hold that applies from the rows as they are (mux_asset_hold), so a
-- video that is removed, or under review, keeps its asset as before.
--
-- G5. The daily sweep queued again, every day, an asset whose last job had failed (the failure
-- stays for a person; the new job failed the same way) and the asset of a removed video whose
-- case is still open (the new job was skipped at once). Now both are left alone and counted:
-- "unresolved" (a failed job; still listed by mux_cleanup_overview and the health check) and
-- "held" (an open moderation case; its review decision queues the deletion).
--
-- G6. Monitoring before clean-up is left on: run_mux_cleanup records each request it makes to the
-- worker (mux_cleanup_runs); a schedule copies pg_net's answer into it before pg_net discards it
-- (6 hours); mux_cleanup_health() reads the queue, the schedules, the worker's answers and the
-- backlog, and says ok, warn or alert with the reasons. It only reads. Nothing is sent anywhere:
-- a notification is a separate decision.

-- ---------------------------------------------------------------------------
-- G2
-- ---------------------------------------------------------------------------

-- A video whose author deleted it, or abandoned before it went live: its asset is deleted at once,
-- or, if Mux has not made one yet, its upload is cancelled. A deletion of the asset that was
-- already waiting (the retention of an earlier removal that a restore ended) is due now and runs
-- as this one; the claim still applies any hold the rows call for.
create or replace function public.mux_forget_video(p_response uuid, p_asset text, p_upload text, p_owner uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_asset is not null then
    perform public.mux_cleanup_enqueue('delete_asset', p_reason, p_asset, p_upload, p_response, p_owner);
    update public.mux_cleanup_jobs
       set not_before = now(), reason = p_reason, response_id = coalesce(response_id, p_response)
     where dedupe_key = 'delete_asset:' || p_asset and status = 'pending' and not_before > now();
  elsif p_upload is not null then
    perform public.mux_cleanup_enqueue('cancel_upload', p_reason, null, p_upload, p_response, p_owner);
  end if;
end;
$$;

-- A removed video can be restored while its asset is kept. Once the asset is permanently deleted
-- the restore is refused (asset_deleted), and while the worker is deleting it too
-- (asset_being_deleted): nothing can bring the video back. Restoring ends the removal's
-- retention: the deletion it queued is closed (skipped), so it can neither delay a later deletion
-- by the author nor linger in the queue.
create or replace function public.mod_restore_video(p_video uuid, p_reason text, p_moderator text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.responses%rowtype;
  v_action uuid;
begin
  -- The row lock orders this with mux_cleanup_claim and mux_cleanup_check, which lock the same
  -- row before they decide whether the asset may be deleted.
  select * into r from public.responses where id = p_video and status = 'removed' for update;
  if not found then raise exception 'video_not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.mux_cleanup_jobs j
              where j.action = 'delete_asset' and j.status = 'running'
                and (j.asset_id = r.mux_asset_id or j.upload_id = r.mux_upload_id)) then
    raise exception 'asset_being_deleted' using errcode = 'P0001';
  end if;
  if not public.mux_video_restorable(r) then
    raise exception 'asset_deleted' using errcode = 'P0001';
  end if;
  v_action := public.mod_log(p_moderator, r.author_id, 'restore', 'video', r.id, p_reason, p_note, null);
  -- A video removed before Mux finished it goes back to processing and goes live when it is ready.
  update public.responses set status = case when r.mux_asset_id is null then 'processing' else 'live' end, removed_action_id = null where id = r.id;
  update public.mux_cleanup_jobs
     set status = 'skipped', finished_at = now(),
         result = jsonb_build_object('outcome', 'kept', 'detail', 'restored by a moderator: the removal''s retention ended')
   where action = 'delete_asset' and status = 'pending'
     and (asset_id = r.mux_asset_id or (r.mux_upload_id is not null and upload_id = r.mux_upload_id));
  perform public.mux_cleanup_enqueue('sync_playback', 'moderation_restored', r.mux_asset_id, r.mux_upload_id, r.id, r.author_id);
  return v_action;
end;
$$;

-- ---------------------------------------------------------------------------
-- G5
-- ---------------------------------------------------------------------------

-- F8, daily: the worker lists the assets at Mux and passes them here as
-- [{"id", "upload_id", "passthrough", "created_at" (unix seconds)}]. Assets younger than a day
-- are left alone (they may still be finishing). For each older one:
--   with an open job: nothing;
--   with a failed job: nothing, counted "unresolved" (a person resolves it: mux_cleanup_overview,
--     mux_cleanup_health, mux_cleanup_retry); queuing it again would fail the same way every day;
--   used by a live, processing or draft video: nothing;
--   used by a video removed by moderation whose case is still open (a review pending): nothing,
--     counted "held" (the review decision queues the deletion, or restores the video);
--   used only by deleted or removed videos: its deletion is queued (retention still applies);
--   used by no video, from an upload in the ledger minted for the account its passthrough names:
--     queued for deletion as an orphan;
--   anything else (ownership unproven): recorded for review and never acted on automatically.
-- With p_dry_run nothing is queued or recorded; the answer lists what would be. "held" and
-- "unresolved" are in the answer only when there are any.
create or replace function public.mux_cleanup_sweep(p_assets jsonb, p_min_age_seconds integer default 86400, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a jsonb;
  v_id text;
  v_upload text;
  v_pass text;
  v_created timestamptz;
  v_owner uuid;
  r public.responses%rowtype;
  v_seen integer := 0;
  v_in_use integer := 0;
  v_young integer := 0;
  v_held integer := 0;
  v_unresolved integer := 0;
  v_queue text[] := '{}';
  v_review text[] := '{}';
begin
  if jsonb_typeof(p_assets) <> 'array' then raise exception 'invalid_assets' using errcode = 'P0001'; end if;
  for a in select * from jsonb_array_elements(p_assets) loop
    v_id := a->>'id';
    if v_id is null or v_id !~ '^[A-Za-z0-9]{1,128}$' then continue; end if;
    v_seen := v_seen + 1;
    v_upload := case when (a->>'upload_id') ~ '^[A-Za-z0-9]{1,128}$' then a->>'upload_id' end;
    v_pass := a->>'passthrough';
    v_created := case when (a->>'created_at') ~ '^\d{1,12}$' then to_timestamp((a->>'created_at')::bigint) end;
    if v_created is null or v_created > now() - make_interval(secs => greatest(p_min_age_seconds, 3600)) then
      v_young := v_young + 1;
      continue;
    end if;
    if exists (select 1 from public.mux_cleanup_jobs j where j.asset_id = v_id and j.status in ('pending', 'running', 'review')) then
      continue;
    end if;
    if exists (select 1 from public.mux_cleanup_jobs j where j.asset_id = v_id and j.status = 'failed') then
      v_unresolved := v_unresolved + 1;
      continue;
    end if;
    if exists (select 1 from public.responses x where (x.mux_asset_id = v_id or (v_upload is not null and x.mux_upload_id = v_upload))
                and x.status in ('live', 'processing', 'draft')) then
      v_in_use := v_in_use + 1;
      continue;
    end if;
    if exists (select 1 from public.responses x where (x.mux_asset_id = v_id or (v_upload is not null and x.mux_upload_id = v_upload))
                and x.status = 'removed' and public.moderation_case_closed_at(x.removed_action_id) is null) then
      v_held := v_held + 1;
      continue;
    end if;
    select * into r from public.responses x
     where (x.mux_asset_id = v_id or (v_upload is not null and x.mux_upload_id = v_upload)) and x.status in ('deleted', 'removed') and x.author_id is not null
     limit 1;
    if found then
      if not p_dry_run then perform public.mux_cleanup_enqueue('delete_asset', 'sweep', v_id, v_upload, r.id, r.author_id); end if;
      v_queue := v_queue || v_id;
      continue;
    end if;
    select u.account_id into v_owner from public.video_uploads u where v_upload is not null and u.upload_id = v_upload;
    if v_owner is not null and v_pass = v_owner::text then
      if not p_dry_run then perform public.mux_cleanup_enqueue('delete_asset', 'orphan', v_id, v_upload, null, v_owner); end if;
      v_queue := v_queue || v_id;
    else
      if not p_dry_run then
        insert into public.mux_cleanup_jobs (action, reason, status, dedupe_key, asset_id, upload_id, result)
        values ('delete_asset', 'orphan', 'review', 'review:' || v_id, v_id, v_upload,
                jsonb_build_object('outcome', 'unverified_owner', 'detail', 'no ledger upload minted for this asset''s passthrough', 'created_at', v_created))
        on conflict (dedupe_key) where status in ('pending', 'review') do nothing;
      end if;
      v_review := v_review || v_id;
    end if;
  end loop;
  return jsonb_build_object('seen', v_seen, 'young', v_young, 'in_use', v_in_use, 'queued', cardinality(v_queue), 'review', cardinality(v_review))
      || case when v_held > 0 then jsonb_build_object('held', v_held) else '{}'::jsonb end
      || case when v_unresolved > 0 then jsonb_build_object('unresolved', v_unresolved) else '{}'::jsonb end
      || case when p_dry_run then jsonb_build_object('dry_run', true, 'would_queue', to_jsonb(v_queue), 'would_review', to_jsonb(v_review)) else '{}'::jsonb end;
end;
$$;

-- ---------------------------------------------------------------------------
-- G6
-- ---------------------------------------------------------------------------

-- Every request run_mux_cleanup makes to the worker, and the worker's answer once pg_net has it.
-- Only counts are kept from the answer, never Mux ids. Kept 14 days.
create table public.mux_cleanup_runs (
  request_id bigint primary key,
  mode text not null check (mode in ('drain', 'sweep')),
  requested_at timestamptz not null default now(),
  -- Set when pg_net's answer was copied, or when none came (error 'no_response').
  collected_at timestamptz,
  status_code integer,
  timed_out boolean,
  error text,
  -- The worker's own "ok", and its counts (claimed, done, failed ...; listed, complete ...).
  ok boolean,
  summary jsonb
);
comment on table public.mux_cleanup_runs is 'Requests to the mux-cleanup worker and its answers (counts only), for mux_cleanup_health (security stage 3, G6). Kept 14 days.';
create index mux_cleanup_runs_requested_idx on public.mux_cleanup_runs (requested_at);
alter table public.mux_cleanup_runs enable row level security;
revoke all on table public.mux_cleanup_runs from anon, authenticated;

-- Unchanged, except that the request is recorded in mux_cleanup_runs.
create or replace function public.run_mux_cleanup(p_mode text default 'drain')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_key text;
  v_request bigint;
begin
  if p_mode not in ('drain', 'sweep') then raise exception 'invalid_mode' using errcode = 'P0001'; end if;
  if public.mux_cleanup_mode() = 'off' then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'mux_cleanup_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'mux_cleanup_key';
  if v_url is null or v_key is null then return; end if;
  if p_mode = 'drain'
     and not exists (select 1 from public.mux_cleanup_jobs where status = 'pending' and not_before <= now())
     and not exists (select 1 from public.mux_cleanup_jobs where status = 'running' and locked_until < now()) then
    return;
  end if;
  v_request := net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
                             body := jsonb_build_object('mode', p_mode), timeout_milliseconds := 60000);
  insert into public.mux_cleanup_runs (request_id, mode) values (v_request, p_mode) on conflict (request_id) do nothing;
end;
$$;

-- Text to jsonb, or null if it is not JSON.
create or replace function public.mux_cleanup_try_jsonb(p text)
returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  return p::jsonb;
exception when others then
  return null;
end;
$$;

-- Every 10 minutes: copies pg_net's answers into mux_cleanup_runs before pg_net discards them,
-- marks a request with no answer after 15 minutes as 'no_response', and deletes runs older than
-- 14 days. Returns how many answers it copied.
create or replace function public.mux_cleanup_collect_runs()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  with answered as (
    select c.request_id, r.status_code, coalesce(r.timed_out, false) as timed_out, left(r.error_msg, 500) as error,
           public.mux_cleanup_try_jsonb(r.content) as body
      from public.mux_cleanup_runs c
      join net._http_response r on r.id = c.request_id
     where c.collected_at is null
  ), done as (
    update public.mux_cleanup_runs c
       set collected_at = now(), status_code = a.status_code, timed_out = a.timed_out, error = a.error,
           ok = case when jsonb_typeof(a.body->'ok') = 'boolean' then (a.body->>'ok')::boolean end,
           summary = (select jsonb_object_agg(e.key, e.value) from jsonb_each(case when jsonb_typeof(a.body) = 'object' then a.body else '{}'::jsonb end) e
                       where e.key in ('mode', 'error', 'skipped', 'claimed', 'done', 'found_asset', 'retry', 'release', 'stale', 'failed', 'unrecorded',
                                       'listed', 'complete', 'listError', 'seen', 'young', 'in_use', 'queued', 'review', 'held', 'unresolved', 'dry_run')
                         and jsonb_typeof(e.value) in ('number', 'boolean', 'string', 'null')
                         and length(e.value::text) <= 200)
      from answered a
     where c.request_id = a.request_id
    returning 1
  )
  select count(*)::int into n from done;
  update public.mux_cleanup_runs set collected_at = now(), error = 'no_response'
   where collected_at is null and requested_at < now() - interval '15 minutes';
  delete from public.mux_cleanup_runs where requested_at < now() - interval '14 days';
  return n;
end;
$$;

-- The team's health check (service role, SQL editor or a script): {"status": "ok" | "warn" |
-- "alert", "problems": [{"level", "check", "detail"}], "metrics", "thresholds"}. Reads only.
--   alert: a failed job; a purge failure; a lease expired over 10 minutes ago; when live, a job due
--          for over 15 minutes; a schedule inactive, failing, or late (the drain over 5 minutes,
--          a daily job over 26 hours); the worker unreachable, or answering with an error status or
--          "ok": false
--   warn:  an orphan waiting for review; when live, over 100 jobs due, or 50 more jobs created
--          than finished in 24 hours; when not live, a job waiting over 24 hours (its video is
--          still at Mux); a daily job that has never run (new); no sweep request in 26 hours while
--          not off; a request that timed out or got no answer; answers not collected for 30 minutes
create or replace function public.mux_cleanup_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c_stuck constant interval := interval '10 minutes';
  c_due_live constant interval := interval '15 minutes';
  c_due_many constant integer := 100;
  c_waiting constant interval := interval '24 hours';
  c_growth constant integer := 50;
  c_daily_late constant interval := interval '26 hours';
  c_uncollected constant interval := interval '30 minutes';
  v_mode text := public.mux_cleanup_mode();
  v_problems jsonb := '[]'::jsonb;
  v_failed integer;
  v_review integer;
  v_purge integer;
  v_stuck integer;
  v_due integer;
  v_oldest_due timestamptz;
  v_held integer;
  v_waiting_since timestamptz;
  v_created integer;
  v_finished integer;
  v_cron jsonb := '{}'::jsonb;
  v_runs jsonb;
  s record;
  v_last timestamptz;
  v_failures integer;
  v_active boolean;
  v_bad_status integer;
  v_not_ok integer;
  v_timed_out integer;
  v_lost integer;
  v_uncollected integer;
  v_last_sweep timestamptz;
begin
  select count(*) filter (where status = 'failed'),
         count(*) filter (where status = 'review'),
         count(*) filter (where status = 'running' and locked_until < now() - c_stuck),
         count(*) filter (where status = 'pending' and not_before <= now()),
         min(not_before) filter (where status = 'pending' and not_before <= now()),
         count(*) filter (where status = 'pending' and not_before > now() and (result->>'dry_run') is distinct from 'true'),
         min(created_at) filter (where status = 'pending' and (not_before <= now() or (result->>'dry_run') = 'true')),
         count(*) filter (where created_at > now() - interval '24 hours'),
         count(*) filter (where finished_at > now() - interval '24 hours')
    into v_failed, v_review, v_stuck, v_due, v_oldest_due, v_held, v_waiting_since, v_created, v_finished
    from public.mux_cleanup_jobs;
  select count(*) into v_purge from public.account_purge_failures;

  if v_failed > 0 then
    v_problems := v_problems || jsonb_build_object('level', 'alert', 'check', 'failed_jobs', 'detail', v_failed || ' failed job(s): mux_cleanup_overview() lists them; mux_cleanup_retry(id) once resolved');
  end if;
  if v_purge > 0 then
    v_problems := v_problems || jsonb_build_object('level', 'alert', 'check', 'purge_failures', 'detail', v_purge || ' account(s) the purge could not remove');
  end if;
  if v_stuck > 0 then
    v_problems := v_problems || jsonb_build_object('level', 'alert', 'check', 'stuck_jobs', 'detail', v_stuck || ' job(s) whose lease ran out over 10 minutes ago and were not leased again');
  end if;
  if v_review > 0 then
    v_problems := v_problems || jsonb_build_object('level', 'warn', 'check', 'review_jobs', 'detail', v_review || ' asset(s) of unproven ownership waiting for a person');
  end if;
  if v_mode = 'live' then
    if v_oldest_due < now() - c_due_live then
      v_problems := v_problems || jsonb_build_object('level', 'alert', 'check', 'backlog_age', 'detail', 'a job has been due since ' || v_oldest_due);
    end if;
    if v_due > c_due_many then
      v_problems := v_problems || jsonb_build_object('level', 'warn', 'check', 'backlog_size', 'detail', v_due || ' jobs due');
    end if;
    if v_created - v_finished > c_growth then
      v_problems := v_problems || jsonb_build_object('level', 'warn', 'check', 'backlog_growth', 'detail', (v_created - v_finished) || ' more jobs created than finished in 24 hours');
    end if;
  elsif v_waiting_since < now() - c_waiting then
    v_problems := v_problems || jsonb_build_object('level', 'warn', 'check', 'waiting_while_not_live',
      'detail', 'clean-up is ' || v_mode || ' and a job has waited since ' || v_waiting_since || ': its video is still at Mux');
  end if;

  for s in select * from (values ('mux-cleanup', interval '5 minutes', 'alert'), ('mux-cleanup-monitor', interval '30 minutes', 'warn'),
                                 ('mux-sweep', c_daily_late, 'alert'), ('purge-deleted-accounts', c_daily_late, 'alert'),
                                 ('prune-mux-cleanup-jobs', c_daily_late, 'alert'), ('prune-moderation-records', c_daily_late, 'alert')) t(name, late, level) loop
    select j.active, (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
           (select count(*)::int from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours')
      into v_active, v_last, v_failures
      from cron.job j where j.jobname = s.name;
    v_cron := v_cron || jsonb_build_object(s.name, jsonb_build_object('active', v_active, 'last_run', v_last, 'failed_24h', coalesce(v_failures, 0)));
    if v_active is null or not v_active then
      v_problems := v_problems || jsonb_build_object('level', 'alert', 'check', 'schedule_missing', 'detail', s.name || ' is not scheduled or not active');
    elsif v_failures > 0 then
      v_problems := v_problems || jsonb_build_object('level', 'alert', 'check', 'schedule_failing', 'detail', s.name || ': ' || v_failures || ' failed run(s) in 24 hours');
    elsif v_last is null then
      v_problems := v_problems || jsonb_build_object('level', 'warn', 'check', 'schedule_never_ran', 'detail', s.name || ' has not run yet');
    elsif v_last < now() - s.late then
      v_problems := v_problems || jsonb_build_object('level', s.level, 'check', 'schedule_late', 'detail', s.name || ' last ran at ' || v_last);
    end if;
    v_active := null; v_last := null; v_failures := null;
  end loop;

  select count(*) filter (where (status_code is not null and status_code not between 200 and 299)
                            or (status_code is null and error is not null and error <> 'no_response' and not coalesce(timed_out, false))),
         count(*) filter (where ok is false),
         count(*) filter (where timed_out),
         count(*) filter (where error = 'no_response'),
         count(*) filter (where collected_at is null and requested_at < now() - c_uncollected)
    into v_bad_status, v_not_ok, v_timed_out, v_lost, v_uncollected
    from public.mux_cleanup_runs where requested_at > now() - interval '24 hours';
  select max(requested_at) into v_last_sweep from public.mux_cleanup_runs where mode = 'sweep';
  v_runs := jsonb_build_object('requests_24h', (select count(*) from public.mux_cleanup_runs where requested_at > now() - interval '24 hours'),
                               'error_status_24h', v_bad_status, 'not_ok_24h', v_not_ok, 'timed_out_24h', v_timed_out,
                               'no_response_24h', v_lost, 'uncollected', v_uncollected, 'last_sweep_request', v_last_sweep);
  if v_bad_status > 0 or v_not_ok > 0 then
    v_problems := v_problems || jsonb_build_object('level', 'alert', 'check', 'worker_errors', 'detail', (v_bad_status + v_not_ok) || ' worker request(s) failed or answered with an error in 24 hours');
  end if;
  if v_timed_out > 0 or v_lost > 0 then
    v_problems := v_problems || jsonb_build_object('level', 'warn', 'check', 'worker_no_answer', 'detail', (v_timed_out + v_lost) || ' worker request(s) timed out or got no answer in 24 hours');
  end if;
  if v_uncollected > 0 then
    v_problems := v_problems || jsonb_build_object('level', 'warn', 'check', 'answers_not_collected', 'detail', v_uncollected || ' answer(s) not collected for 30 minutes: is mux-cleanup-monitor running?');
  end if;
  if v_mode <> 'off' and (v_last_sweep is null or v_last_sweep < now() - c_daily_late) then
    v_problems := v_problems || jsonb_build_object('level', 'warn', 'check', 'sweep_not_requested', 'detail', 'no sweep request in 26 hours while clean-up is ' || v_mode);
  end if;

  return jsonb_build_object(
    'status', case when exists (select 1 from jsonb_array_elements(v_problems) p where p->>'level' = 'alert') then 'alert'
                   when jsonb_array_length(v_problems) > 0 then 'warn' else 'ok' end,
    'checked_at', now(),
    'mode', v_mode,
    'problems', v_problems,
    'metrics', jsonb_build_object('failed', v_failed, 'review', v_review, 'purge_failures', v_purge, 'stuck', v_stuck, 'due', v_due,
                                  'oldest_due', v_oldest_due, 'held', v_held, 'waiting_since', v_waiting_since,
                                  'created_24h', v_created, 'finished_24h', v_finished, 'schedules', v_cron, 'worker', v_runs),
    'thresholds', jsonb_build_object('stuck_minutes', 10, 'due_live_minutes', 15, 'due_many', c_due_many, 'waiting_not_live_hours', 24,
                                     'growth_24h', c_growth, 'drain_late_minutes', 5, 'daily_late_hours', 26)
  );
end;
$$;

select cron.schedule('mux-cleanup-monitor', '*/10 * * * *', $$select public.mux_cleanup_collect_runs()$$);

revoke execute on function public.mux_cleanup_try_jsonb(text) from public, anon, authenticated, service_role;
revoke execute on function public.mux_cleanup_collect_runs() from public, anon, authenticated, service_role;
revoke execute on function public.mux_cleanup_health() from public, anon, authenticated;
grant execute on function public.mux_cleanup_health() to service_role;
-- Re-created above with create or replace: their grants are unchanged (mux_forget_video:
-- internal; mod_restore_video, mux_cleanup_sweep and run_mux_cleanup: as after 20261012000200).
