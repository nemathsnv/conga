-- ROLLBACK for 20261013000100_cleanup_reliability.sql. NOT a migration: nothing applies this file.
--
-- Use only if Nemat decides to undo the reliability fixes on a project where 20261013000100 is
-- applied and 20261012000200 stays. Copy it to a new forward migration
-- (supabase/migrations/<timestamp>_cleanup_reliability_rollback.sql) and push that. The worker's
-- dry-run plans (G1) are in the mux-cleanup function, not here: redeploy mux-cleanup from the
-- commit before the fixes if they must go too (the database accepts either version).
--
-- It restores the 20261012000200 definitions of the four functions the fixes replaced (bodies
-- copied verbatim from that migration), and removes the record of the worker's calls, the
-- collector, the health check and the mux-cleanup-monitor schedule. It never refuses: the fixes
-- add no state the 20261012000200 schema cannot hold. What it cannot undo, and need not: jobs a
-- restore closed as skipped ("restored by a moderator: the removal's retention ended") stay
-- skipped; deletions an author's deletion made due at once stay due (both are what the old code's
-- claim would have done once the old retention came due, only earlier). The worker's answers
-- recorded in mux_cleanup_runs are dropped with the table. Rolling back reopens G2 and G5 and
-- removes the health check.

select cron.unschedule('mux-cleanup-monitor');
drop function public.mux_cleanup_health();
drop function public.mux_cleanup_collect_runs();
drop function public.mux_cleanup_try_jsonb(text);
drop table public.mux_cleanup_runs;

-- From 20261012000200_video_deletion_cleanup.sql:
create or replace function public.mux_forget_video(p_response uuid, p_asset text, p_upload text, p_owner uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_asset is not null then
    perform public.mux_cleanup_enqueue('delete_asset', p_reason, p_asset, p_upload, p_response, p_owner);
  elsif p_upload is not null then
    perform public.mux_cleanup_enqueue('cancel_upload', p_reason, null, p_upload, p_response, p_owner);
  end if;
end;
$$;

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
  perform public.mux_cleanup_enqueue('sync_playback', 'moderation_restored', r.mux_asset_id, r.mux_upload_id, r.id, r.author_id);
  return v_action;
end;
$$;

-- F8, daily: the worker lists the assets at Mux and passes them here as
-- [{"id", "upload_id", "passthrough", "created_at" (unix seconds)}]. Assets younger than a day
-- are left alone (they may still be finishing). For each older one:
--   used by a live, processing or draft video, or with an open job: nothing;
--   used only by deleted or removed videos: its deletion is queued (retention still applies);
--   used by no video, from an upload in the ledger minted for the account its passthrough names:
--     queued for deletion as an orphan;
--   anything else (ownership unproven): recorded for review and never acted on automatically.
-- With p_dry_run nothing is queued or recorded; the answer lists what would be.
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
    if exists (select 1 from public.responses x where (x.mux_asset_id = v_id or (v_upload is not null and x.mux_upload_id = v_upload))
                and x.status in ('live', 'processing', 'draft')) then
      v_in_use := v_in_use + 1;
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
      || case when p_dry_run then jsonb_build_object('dry_run', true, 'would_queue', to_jsonb(v_queue), 'would_review', to_jsonb(v_review)) else '{}'::jsonb end;
end;
$$;

create or replace function public.run_mux_cleanup(p_mode text default 'drain')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_key text;
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
  perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
                        body := jsonb_build_object('mode', p_mode), timeout_milliseconds := 60000);
end;
$$;
