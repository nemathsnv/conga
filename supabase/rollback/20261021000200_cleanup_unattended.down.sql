-- ROLLBACK for 20261021000200_cleanup_unattended.sql. NOT a migration: nothing applies this file.
--
-- Use only if Nemat decides to undo it on a project where 20261021000200 is applied. First put the
-- switch off (select public.mux_cleanup_set_mode('off', '<who>: rollback')). Then copy this file to
-- a new forward migration (supabase/migrations/<timestamp>_cleanup_unattended_rollback.sql) and push
-- that, or, on a project where nothing newer depends on it, run it in one transaction followed by
--   delete from supabase_migrations.schema_migrations where version = '20261021000200';
-- No Edge Function changes with this migration, so none is redeployed.
--
-- It removes the two schedules, the alert function and its record, the deletion cap (its columns,
-- functions and the settings log) and the added health checks; it restores mux_cleanup_health() as
-- 20261013000100 made it (renamed back, not re-created, so its body is the deployed one), and the
-- claim (20261012000200) and run_mux_cleanup (20261013000100), bodies copied verbatim. It never
-- refuses. What it cannot keep: the settings log and the record of alerts sent are dropped; a pause
-- in force ends with its columns, so the waiting deletions are leased again by the next claim with
-- no cap (put the switch off first, as above, and decide before turning it back on).

select cron.unschedule('mux-cleanup-alert');
select cron.unschedule('mux-cleanup-weekly');
drop function public.mux_cleanup_alert(text);
drop table public.mux_cleanup_alerts;

drop function public.mux_cleanup_health();
alter function public.mux_cleanup_health_base() rename to mux_cleanup_health;
revoke execute on function public.mux_cleanup_health() from public, anon, authenticated;
grant execute on function public.mux_cleanup_health() to service_role;

-- From 20261012000200_video_deletion_cleanup.sql:
create or replace function public.mux_cleanup_claim(p_limit integer default 10, p_lease_seconds integer default 120)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j public.mux_cleanup_jobs%rowtype;
  v_mode text;
  v_hold timestamptz;
  v_out jsonb := '[]'::jsonb;
  v_assets text[] := '{}';
  v_uploads text[] := '{}';
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_lease interval := make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900)));
begin
  perform pg_advisory_xact_lock(hashtext('public.mux_cleanup_claim'));
  update public.mux_cleanup_jobs
     set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
         finished_at = case when attempts >= max_attempts then now() end,
         last_error = 'lease_expired', lease_id = null, locked_until = null
   where status = 'running' and locked_until < now();
  v_mode := public.mux_cleanup_mode();
  if v_mode = 'off' then return jsonb_build_object('mode', v_mode, 'jobs', v_out); end if;
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

-- From 20261013000100_cleanup_reliability.sql:
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

drop function public.mux_cleanup_resume_deletions(text);
drop function public.mux_cleanup_set_deletion_cap(integer, text);
drop function public.mux_cleanup_deletions_counted();
drop trigger mux_cleanup_settings_audit on public.mux_cleanup_settings;
drop function public.mux_cleanup_settings_audit();
drop table public.mux_cleanup_settings_log;
alter table public.mux_cleanup_settings
  drop column deletion_cap,
  drop column deletions_paused_at,
  drop column deletions_resumed_at;
