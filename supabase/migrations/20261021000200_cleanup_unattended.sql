-- Mux clean-up left on unattended (21 Oct 2026; docs/BETA-READINESS.md section 48,
-- docs/release/MUX-CLEANUP-UNATTENDED.md). A forward migration on top of 20261012000200 and
-- 20261013000100, which are not edited. Nothing changes until it is configured: the cap is unset,
-- no alert is sent without its Vault secrets, and the switch stays where it is. Existing rows are
-- not changed. Rollback: supabase/rollback/20261021000200_cleanup_unattended.down.sql.
--
-- Until now every change at Mux on the hosted project ran in a supervised window. Left on, the
-- worker acts on any job, so three things are added:
--
-- U1. A cap on asset deletions, the one change at Mux that cannot be undone. At most
--     mux_cleanup_settings.deletion_cap assets are deleted in any 24 hours (counted from the last
--     resume); the next deletion due pauses deletions until a person resumes them
--     (mux_cleanup_resume_deletions). While paused, playback revocations and restores and upload
--     cancellations go on, and the deletions wait in the queue with no attempt used. A cap of 0
--     holds every deletion. Null (after the migration) is no cap, as before.
-- U2. The health check also reports: deletions paused; jobs retried 3 or more times; the
--     database live while the worker answers in dry run (MUX_CLEANUP_MODE not live, which no
--     check could see before); no cap or no alert channel while live; the alert schedules; an alert
--     that was not delivered. The checks added in 20261013000100 are unchanged
--     (mux_cleanup_health_base).
-- U3. Alerts. Every 10 minutes mux_cleanup_alert() reads the health check and, when its problems
--     change, emails them through Resend's API (pg_net), with a reminder every 24 hours while they
--     last and a recovery message once the status is ok again. Mondays 02:00 UTC it sends a weekly
--     status, so a silent week means the alerts themselves are broken. Messages hold check names,
--     counts and times only: no Mux id, account, email or playback id. Nothing is sent without the
--     Vault secrets mux_cleanup_alert_key (a Resend API key), mux_cleanup_alert_to and
--     mux_cleanup_alert_from; mux_cleanup_alert_url (a local fake, for tests) is optional.
--
-- Every change to mux_cleanup_settings is now kept in mux_cleanup_settings_log, whoever made it
-- and however (the functions, or an update in the SQL editor).

-- ---------------------------------------------------------------------------
-- U1. The deletion cap
-- ---------------------------------------------------------------------------
alter table public.mux_cleanup_settings
  add column deletion_cap integer check (deletion_cap between 0 and 1000),
  add column deletions_paused_at timestamptz,
  add column deletions_resumed_at timestamptz;
comment on column public.mux_cleanup_settings.deletion_cap is 'Most asset deletions at Mux in any 24 hours (since the last resume); the next one due pauses deletions for a person. 0 holds them all; null is no cap.';
comment on column public.mux_cleanup_settings.deletions_paused_at is 'Set when a deletion would have passed the cap: deletions wait until mux_cleanup_resume_deletions.';
comment on column public.mux_cleanup_settings.deletions_resumed_at is 'The last resume: deletions before it no longer count against the cap.';

create table public.mux_cleanup_settings_log (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  changed_by text not null,
  mode_before text,
  mode_after text,
  cap_before integer,
  cap_after integer,
  paused_before timestamptz,
  paused_after timestamptz
);
comment on table public.mux_cleanup_settings_log is 'Every change to mux_cleanup_settings: the switch, the deletion cap, pauses and resumes, with who made it.';
alter table public.mux_cleanup_settings_log enable row level security;
revoke all on table public.mux_cleanup_settings_log from anon, authenticated;

-- Who: the changed_by of a change of the switch; otherwise what the function set for its own update
-- (mux_cleanup.by, cleared after it: the person setting the cap or resuming, or "deletion cap" for an
-- automatic pause); otherwise the database user.
create or replace function public.mux_cleanup_settings_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.mux_cleanup_settings_log (changed_by, mode_before, mode_after, cap_before, cap_after, paused_before, paused_after)
  values (case when new.changed_at is distinct from old.changed_at then new.changed_by
               else coalesce(nullif(current_setting('mux_cleanup.by', true), ''), session_user::text) end,
          old.mode, new.mode, old.deletion_cap, new.deletion_cap, old.deletions_paused_at, new.deletions_paused_at);
  return new;
end;
$$;
create trigger mux_cleanup_settings_audit after update on public.mux_cleanup_settings
  for each row execute function public.mux_cleanup_settings_audit();

-- Asset deletions that count against the cap: done at Mux in the last 24 hours and since the last
-- resume, plus any leased now (its outcome is not known yet).
create or replace function public.mux_cleanup_deletions_counted()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.mux_cleanup_jobs j
   where j.action = 'delete_asset'
     and (j.status = 'running'
          or (j.status = 'done' and j.result->>'outcome' = 'deleted'
              and j.finished_at > greatest(now() - interval '24 hours',
                                           coalesce((select s.deletions_resumed_at from public.mux_cleanup_settings s), '-infinity'::timestamptz))));
$$;

-- As in 20261012000200, with the cap: in live mode a deletion that may go ahead (nothing holds it)
-- is leased only while fewer than the cap count; the first one over pauses deletions, and while
-- they are paused none is leased. Other jobs are leased as before.
create or replace function public.mux_cleanup_claim(p_limit integer default 10, p_lease_seconds integer default 120)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j public.mux_cleanup_jobs%rowtype;
  s public.mux_cleanup_settings%rowtype;
  v_mode text;
  v_hold timestamptz;
  v_out jsonb := '[]'::jsonb;
  v_assets text[] := '{}';
  v_uploads text[] := '{}';
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_lease interval := make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900)));
  v_deletions integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.mux_cleanup_claim'));
  update public.mux_cleanup_jobs
     set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
         finished_at = case when attempts >= max_attempts then now() end,
         last_error = 'lease_expired', lease_id = null, locked_until = null
   where status = 'running' and locked_until < now();
  select * into s from public.mux_cleanup_settings where id;
  v_mode := coalesce(s.mode, 'off');
  if v_mode = 'off' then return jsonb_build_object('mode', v_mode, 'jobs', v_out); end if;
  v_deletions := public.mux_cleanup_deletions_counted();
  for j in select * from public.mux_cleanup_jobs
            where status = 'pending' and not_before <= now()
            order by not_before, created_at
            for update skip locked loop
    exit when jsonb_array_length(v_out) >= v_limit;
    if (j.asset_id is not null and (j.asset_id = any (v_assets)
          or exists (select 1 from public.mux_cleanup_jobs x where x.status = 'running' and x.asset_id = j.asset_id)))
       or (j.action = 'cancel_upload' and (j.upload_id = any (v_uploads)
          or exists (select 1 from public.mux_cleanup_jobs x where x.status = 'running' and x.action = 'cancel_upload' and x.upload_id = j.upload_id))) then
      continue;
    end if;
    if j.action = 'delete_asset' then
      perform 1 from public.responses x
       where x.mux_asset_id = j.asset_id or (j.upload_id is not null and x.mux_upload_id = j.upload_id)
       for update;
      v_hold := public.mux_asset_hold(j.asset_id, j.upload_id);
      if v_hold = 'infinity' then
        update public.mux_cleanup_jobs set status = 'skipped', finished_at = now(), result = jsonb_build_object('outcome', 'kept', 'detail', 'in use, or its moderation case is open')
         where id = j.id;
        continue;
      elsif v_hold is not null then
        update public.mux_cleanup_jobs set not_before = v_hold where id = j.id;
        continue;
      end if;
      if v_mode = 'live' then
        if s.deletions_paused_at is not null then continue; end if;
        if s.deletion_cap is not null and v_deletions >= s.deletion_cap then
          perform set_config('mux_cleanup.by', 'deletion cap', true);
          update public.mux_cleanup_settings set deletions_paused_at = now() where id returning * into s;
          perform set_config('mux_cleanup.by', '', true);
          continue;
        end if;
        v_deletions := v_deletions + 1;
      end if;
    end if;
    update public.mux_cleanup_jobs
       set status = 'running', attempts = attempts + 1, lease_id = gen_random_uuid(), locked_until = now() + v_lease
     where id = j.id
     returning * into j;
    v_out := v_out || jsonb_build_object(
      'id', j.id, 'lease', j.lease_id, 'action', j.action, 'reason', j.reason, 'attempt', j.attempts,
      'asset_id', j.asset_id, 'upload_id', j.upload_id, 'response_id', j.response_id, 'owner_id', j.owner_id,
      'playback_wanted', case when j.action = 'sync_playback' then public.mux_playback_wanted(j.response_id, j.asset_id) end);
    if j.asset_id is not null then v_assets := v_assets || j.asset_id; end if;
    if j.action = 'cancel_upload' then v_uploads := v_uploads || j.upload_id; end if;
  end loop;
  return jsonb_build_object('mode', v_mode, 'jobs', v_out);
end;
$$;

-- As in 20261013000100, except that deletions waiting on a pause do not count as due: the worker
-- is not called every minute for jobs it may not lease.
create or replace function public.run_mux_cleanup(p_mode text default 'drain')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_key text;
  v_request bigint;
  v_paused boolean := (select deletions_paused_at is not null from public.mux_cleanup_settings);
begin
  if p_mode not in ('drain', 'sweep') then raise exception 'invalid_mode' using errcode = 'P0001'; end if;
  if public.mux_cleanup_mode() = 'off' then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'mux_cleanup_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'mux_cleanup_key';
  if v_url is null or v_key is null then return; end if;
  if p_mode = 'drain'
     and not exists (select 1 from public.mux_cleanup_jobs where status = 'pending' and not_before <= now()
                       and not (coalesce(v_paused, false) and action = 'delete_asset'))
     and not exists (select 1 from public.mux_cleanup_jobs where status = 'running' and locked_until < now()) then
    return;
  end if;
  v_request := net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
                             body := jsonb_build_object('mode', p_mode), timeout_milliseconds := 60000);
  insert into public.mux_cleanup_runs (request_id, mode) values (v_request, p_mode) on conflict (request_id) do nothing;
end;
$$;

-- The team's controls (service role, SQL editor). Setting the cap does not resume paused deletions
-- and does not reset the count; resuming does both: the deletions before it no longer count.
create or replace function public.mux_cleanup_set_deletion_cap(p_cap integer, p_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.mux_cleanup_settings%rowtype;
begin
  if p_cap is not null and (p_cap < 0 or p_cap > 1000) then raise exception 'invalid_cap' using errcode = 'P0001'; end if;
  if p_by is null or btrim(p_by) = '' then raise exception 'changed_by_required' using errcode = 'P0001'; end if;
  perform set_config('mux_cleanup.by', p_by, true);
  update public.mux_cleanup_settings set deletion_cap = p_cap where id returning * into s;
  perform set_config('mux_cleanup.by', '', true);
  return jsonb_build_object('deletion_cap', s.deletion_cap, 'deletions_paused_at', s.deletions_paused_at,
                            'counted', public.mux_cleanup_deletions_counted(), 'changed_by', p_by);
end;
$$;

create or replace function public.mux_cleanup_resume_deletions(p_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.mux_cleanup_settings%rowtype;
begin
  if p_by is null or btrim(p_by) = '' then raise exception 'changed_by_required' using errcode = 'P0001'; end if;
  perform set_config('mux_cleanup.by', p_by, true);
  update public.mux_cleanup_settings set deletions_paused_at = null, deletions_resumed_at = now() where id returning * into s;
  perform set_config('mux_cleanup.by', '', true);
  return jsonb_build_object('deletion_cap', s.deletion_cap, 'resumed_at', s.deletions_resumed_at, 'changed_by', p_by,
    'deletions_due', (select count(*) from public.mux_cleanup_jobs where status = 'pending' and action = 'delete_asset' and not_before <= now()));
end;
$$;

-- ---------------------------------------------------------------------------
-- U3 (the table first: the health check reads it). Every alert message sent, and what Resend
-- answered. Kept 90 days.
-- ---------------------------------------------------------------------------
create table public.mux_cleanup_alerts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('alert', 'reminder', 'recovery', 'weekly', 'test')),
  status text not null check (status in ('ok', 'warn', 'alert')),
  -- The status and the level/check of each problem, sorted: a change of it is a new alert.
  signature text not null,
  request_id bigint,
  collected_at timestamptz,
  delivery_status integer,
  delivery_error text
);
comment on table public.mux_cleanup_alerts is 'Alert messages about the Mux clean-up sent by mux_cleanup_alert(), and their delivery. Check names only. Kept 90 days.';
create index mux_cleanup_alerts_created_idx on public.mux_cleanup_alerts (created_at);
alter table public.mux_cleanup_alerts enable row level security;
revoke all on table public.mux_cleanup_alerts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- U2. The health check
-- ---------------------------------------------------------------------------
-- The checks of 20261013000100, unchanged, under a new name; only mux_cleanup_health() calls it.
alter function public.mux_cleanup_health() rename to mux_cleanup_health_base;
revoke execute on function public.mux_cleanup_health_base() from public, anon, authenticated, service_role;

-- {"status", "checked_at", "mode", "problems", "metrics", "thresholds"} as before, with these
-- checks added (and their metrics):
--   alert: deletions paused; the database live but the worker's last answer since the switch went
--          live in another mode, or a job a dry-run worker released since then; the alert schedule
--          inactive, failing or late by 30 minutes
--   warn:  a job retried 3 or more times; while live, no deletion cap or no alert channel; the
--          weekly status schedule inactive; the last alert message not delivered
create or replace function public.mux_cleanup_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c_retrying constant integer := 3;
  c_alert_late constant interval := interval '30 minutes';
  h jsonb := public.mux_cleanup_health_base();
  v_problems jsonb := h->'problems';
  s public.mux_cleanup_settings%rowtype;
  v_due_deletions integer;
  v_retrying integer;
  v_worker_mode text;
  v_released integer;
  v_last_ok timestamptz;
  v_alerts_ready boolean;
  a public.mux_cleanup_alerts%rowtype;
  v_cron jsonb := '{}'::jsonb;
  t record;
  v_active boolean;
  v_last timestamptz;
  v_failures integer;
begin
  select * into s from public.mux_cleanup_settings where id;
  select count(*) filter (where status = 'pending' and action = 'delete_asset' and not_before <= now()),
         count(*) filter (where status = 'pending' and attempts >= c_retrying and last_error is not null)
    into v_due_deletions, v_retrying
    from public.mux_cleanup_jobs;
  select max(requested_at) into v_last_ok from public.mux_cleanup_runs where ok;
  v_alerts_ready := (select count(distinct name) from vault.secrets where name in ('mux_cleanup_alert_key', 'mux_cleanup_alert_to', 'mux_cleanup_alert_from')) = 3;
  select * into a from public.mux_cleanup_alerts where request_id is not null order by id desc limit 1;

  if s.deletions_paused_at is not null then
    v_problems := v_problems || jsonb_build_object('level', 'alert', 'check', 'deletions_paused',
      'detail', 'asset deletions paused at ' || s.deletions_paused_at || ' (cap ' || coalesce(s.deletion_cap::text, 'none') || ' in 24 hours); '
                || v_due_deletions || ' due deletion(s) wait: check them in mux_cleanup_overview() and mux_cleanup_jobs, then mux_cleanup_resume_deletions(''<who>'')');
  end if;
  if v_retrying > 0 then
    v_problems := v_problems || jsonb_build_object('level', 'warn', 'check', 'retrying_jobs',
      'detail', v_retrying || ' job(s) failed ' || c_retrying || ' or more times and are being retried: see last_error of the pending jobs with attempts > 0');
  end if;
  if s.mode = 'live' then
    select r.summary->>'mode' into v_worker_mode from public.mux_cleanup_runs r
     where r.ok and r.summary ? 'mode' and r.requested_at > s.changed_at order by r.requested_at desc limit 1;
    select count(*) into v_released from public.mux_cleanup_jobs
     where status = 'pending' and (result->>'dry_run') = 'true' and updated_at > s.changed_at;
    if v_worker_mode is distinct from 'live' and (v_worker_mode is not null or v_released > 0) then
      v_problems := v_problems || jsonb_build_object('level', 'alert', 'check', 'worker_not_live',
        'detail', 'the switch is live but the worker answered in ' || coalesce(v_worker_mode, 'dry_run') || ' (' || v_released
                  || ' job(s) released as a dry run since it went live): is the function''s MUX_CLEANUP_MODE set to live?');
    end if;
    if s.deletion_cap is null then
      v_problems := v_problems || jsonb_build_object('level', 'warn', 'check', 'no_deletion_cap', 'detail', 'live with no cap on asset deletions: mux_cleanup_set_deletion_cap(<n>, ''<who>'')');
    end if;
    if not v_alerts_ready then
      v_problems := v_problems || jsonb_build_object('level', 'warn', 'check', 'alerts_not_configured', 'detail', 'live and no alert is sent: the Vault secrets mux_cleanup_alert_key, _to and _from are not all set');
    end if;
  end if;
  if a.id is not null and a.collected_at is not null and (a.delivery_status is null or a.delivery_status not between 200 and 299) then
    v_problems := v_problems || jsonb_build_object('level', 'warn', 'check', 'alert_not_delivered',
      'detail', 'the last alert message (' || a.created_at || ') was not delivered: ' || coalesce(a.delivery_status::text, a.delivery_error, 'no answer'));
  end if;

  for t in select * from (values ('mux-cleanup-alert', 'alert'), ('mux-cleanup-weekly', 'warn')) x(name, level) loop
    select j.active, (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid),
           (select count(*)::int from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '24 hours')
      into v_active, v_last, v_failures
      from cron.job j where j.jobname = t.name;
    v_cron := v_cron || jsonb_build_object(t.name, jsonb_build_object('active', v_active, 'last_run', v_last, 'failed_24h', coalesce(v_failures, 0)));
    if v_active is null or not v_active then
      v_problems := v_problems || jsonb_build_object('level', t.level, 'check', 'schedule_missing', 'detail', t.name || ' is not scheduled or not active');
    elsif v_failures > 0 then
      v_problems := v_problems || jsonb_build_object('level', t.level, 'check', 'schedule_failing', 'detail', t.name || ': ' || v_failures || ' failed run(s) in 24 hours');
    elsif t.name = 'mux-cleanup-alert' and v_last < now() - c_alert_late then
      v_problems := v_problems || jsonb_build_object('level', t.level, 'check', 'schedule_late', 'detail', t.name || ' last ran at ' || v_last);
    end if;
    v_active := null; v_last := null; v_failures := null;
  end loop;

  return jsonb_build_object(
    'status', case when exists (select 1 from jsonb_array_elements(v_problems) p where p->>'level' = 'alert') then 'alert'
                   when jsonb_array_length(v_problems) > 0 then 'warn' else 'ok' end,
    'checked_at', h->'checked_at',
    'mode', h->'mode',
    'problems', v_problems,
    'metrics', (h->'metrics')
               || jsonb_build_object('schedules', (h->'metrics'->'schedules') || v_cron)
               || jsonb_build_object('deletion_cap', s.deletion_cap, 'deletions_counted', public.mux_cleanup_deletions_counted(),
                                     'deletions_paused_at', s.deletions_paused_at, 'deletions_due', v_due_deletions,
                                     'retrying', v_retrying, 'worker_mode', v_worker_mode, 'last_ok_run', v_last_ok,
                                     'alerts_configured', v_alerts_ready, 'last_alert', a.created_at, 'last_alert_delivery', a.delivery_status),
    'thresholds', (h->'thresholds') || jsonb_build_object('retrying_attempts', c_retrying, 'alert_late_minutes', 30)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- U3. Alerts
-- ---------------------------------------------------------------------------
-- p_kind 'auto' (the schedule): sends when the problems differ from the last message sent (an
-- alert), every 24 hours while the same problems last (a reminder), or once the status is ok after
-- a message about problems (a recovery). Within 30 minutes of the last message only a change to
-- 'alert' is sent at once; anything else waits for a later run, so a problem that comes and goes
-- does not send a message each time. At most 30 messages in 24 hours.
-- 'weekly': the status whatever it is. 'test': the same, marked as a test (for checking delivery).
-- Returns what it did; records each message sent; collects Resend's answers to earlier ones.
create or replace function public.mux_cleanup_alert(p_kind text default 'auto')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  h jsonb;
  v_status text;
  v_signature text;
  v_kind text;
  v_prev public.mux_cleanup_alerts%rowtype;
  v_key text;
  v_to text;
  v_from text;
  v_url text;
  v_subject text;
  v_text text;
  v_request bigint;
  m jsonb;
begin
  if p_kind is null or p_kind not in ('auto', 'weekly', 'test') then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('public.mux_cleanup_alert'));

  update public.mux_cleanup_alerts a
     set collected_at = now(), delivery_status = r.status_code,
         delivery_error = left(coalesce(r.error_msg, case when r.timed_out then 'timed_out' end), 300)
    from net._http_response r
   where r.id = a.request_id and a.collected_at is null;
  update public.mux_cleanup_alerts set collected_at = now(), delivery_error = 'no_response'
   where collected_at is null and request_id is not null and created_at < now() - interval '15 minutes';
  delete from public.mux_cleanup_alerts where created_at < now() - interval '90 days';

  h := public.mux_cleanup_health();
  v_status := h->>'status';
  v_signature := v_status || ':' || coalesce((select string_agg(distinct (p->>'level') || '/' || (p->>'check'), ',' order by (p->>'level') || '/' || (p->>'check'))
                                                from jsonb_array_elements(h->'problems') p), '');
  select * into v_prev from public.mux_cleanup_alerts where kind in ('alert', 'reminder', 'recovery') order by id desc limit 1;

  if p_kind <> 'auto' then
    v_kind := p_kind;
  elsif v_status = 'ok' then
    if v_prev.id is null or v_prev.status = 'ok' then return jsonb_build_object('sent', false, 'status', v_status, 'reason', 'ok'); end if;
    v_kind := 'recovery';
  elsif v_prev.id is null or v_prev.signature <> v_signature then
    v_kind := 'alert';
  elsif v_prev.created_at < now() - interval '24 hours' then
    v_kind := 'reminder';
  else
    return jsonb_build_object('sent', false, 'status', v_status, 'reason', 'unchanged');
  end if;
  if v_kind in ('alert', 'recovery') and v_prev.id is not null and v_prev.created_at > now() - interval '30 minutes'
     and not (v_status = 'alert' and v_prev.status <> 'alert') then
    return jsonb_build_object('sent', false, 'status', v_status, 'reason', 'too_soon', 'would', v_kind);
  end if;
  if p_kind = 'auto' and (select count(*) from public.mux_cleanup_alerts where created_at > now() - interval '24 hours') >= 30 then
    return jsonb_build_object('sent', false, 'status', v_status, 'reason', 'daily_limit', 'would', v_kind);
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'mux_cleanup_alert_key';
  select decrypted_secret into v_to from vault.decrypted_secrets where name = 'mux_cleanup_alert_to';
  select decrypted_secret into v_from from vault.decrypted_secrets where name = 'mux_cleanup_alert_from';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'mux_cleanup_alert_url';
  if v_key is null or v_to is null or v_from is null then
    return jsonb_build_object('sent', false, 'status', v_status, 'reason', 'not_configured', 'would', v_kind);
  end if;

  m := h->'metrics';
  v_subject := 'Conga clean-up: ' || case v_kind
      when 'recovery' then 'recovered, status ok'
      when 'weekly' then 'weekly status, ' || v_status
      when 'test' then 'test message, status ' || v_status
      when 'reminder' then 'still ' || v_status
      else v_status end
    || coalesce(' (' || (select string_agg(distinct p->>'check', ', ' order by p->>'check') from jsonb_array_elements(h->'problems') p) || ')', '');
  v_text := concat_ws(E'\n',
    'Status: ' || v_status || ', switch: ' || (h->>'mode') || ', checked at ' || (h->>'checked_at') || ' (UTC).',
    case when jsonb_array_length(h->'problems') = 0 then 'No problems.'
         else E'\nProblems:\n' || (select string_agg('- ' || (p->>'level') || ' ' || (p->>'check') || ': ' || (p->>'detail'), E'\n' order by p->>'level', p->>'check')
                                    from jsonb_array_elements(h->'problems') p) end,
    '',
    'Queue: ' || coalesce(m->>'due', '0') || ' due, ' || coalesce(m->>'failed', '0') || ' failed, ' || coalesce(m->>'review', '0') || ' for review, '
      || coalesce(m->>'retrying', '0') || ' retrying, ' || coalesce(m->>'held', '0') || ' held; '
      || coalesce(m->>'created_24h', '0') || ' created and ' || coalesce(m->>'finished_24h', '0') || ' finished in 24 hours.',
    'Deletions: ' || coalesce(m->>'deletions_counted', '0') || ' of ' || coalesce(m->>'deletion_cap', 'no cap') || ' in 24 hours'
      || case when m->>'deletions_paused_at' is not null then ', paused since ' || (m->>'deletions_paused_at') else '' end || '.',
    'Last successful worker answer: ' || coalesce(m->>'last_ok_run', 'none in 14 days') || '.',
    '',
    'Details: select public.mux_cleanup_health(); and select public.mux_cleanup_overview();',
    'Emergency stop: select public.mux_cleanup_set_mode(''off'', ''<who>: <why>'');',
    'Runbook: docs/release/MUX-CLEANUP-UNATTENDED.md');
  v_request := net.http_post(url := coalesce(v_url, 'https://api.resend.com/emails'),
                             headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
                             body := jsonb_build_object('from', v_from, 'to', jsonb_build_array(v_to), 'subject', v_subject, 'text', v_text),
                             timeout_milliseconds := 10000);
  insert into public.mux_cleanup_alerts (kind, status, signature, request_id) values (v_kind, v_status, v_signature, v_request);
  return jsonb_build_object('sent', true, 'kind', v_kind, 'status', v_status, 'request_id', v_request);
end;
$$;

-- Every 10 minutes, five minutes after mux-cleanup-monitor has collected the worker's answers.
select cron.schedule('mux-cleanup-alert', '5-59/10 * * * *', $$select public.mux_cleanup_alert('auto')$$);
select cron.schedule('mux-cleanup-weekly', '0 2 * * 1', $$select public.mux_cleanup_alert('weekly')$$);

revoke execute on function public.mux_cleanup_settings_audit() from public, anon, authenticated, service_role;
revoke execute on function public.mux_cleanup_deletions_counted() from public, anon, authenticated, service_role;
revoke execute on function public.mux_cleanup_set_deletion_cap(integer, text) from public, anon, authenticated;
revoke execute on function public.mux_cleanup_resume_deletions(text) from public, anon, authenticated;
revoke execute on function public.mux_cleanup_health() from public, anon, authenticated;
revoke execute on function public.mux_cleanup_alert(text) from public, anon, authenticated;
grant execute on function public.mux_cleanup_set_deletion_cap(integer, text) to service_role;
grant execute on function public.mux_cleanup_resume_deletions(text) to service_role;
grant execute on function public.mux_cleanup_health() to service_role;
grant execute on function public.mux_cleanup_alert(text) to service_role;
-- Re-created above with create or replace: mux_cleanup_claim and run_mux_cleanup keep their grants
-- (the service role, not members; as after 20261012000200).
