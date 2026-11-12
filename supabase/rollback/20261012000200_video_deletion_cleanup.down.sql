-- ROLLBACK for 20261012000200_video_deletion_cleanup.sql. NOT a migration: nothing applies this file.
--
-- Use only if Nemat decides to roll stage 3 back on a project where 20261012000200 is applied.
-- Copy it to a new forward migration (supabase/migrations/<timestamp>_video_deletion_rollback.sql),
-- push that, then redeploy mux-webhook and mux-upload-status from 5fabfaf and delete the
-- mux-cleanup function (supabase functions delete mux-cleanup). The Vault secrets mux_cleanup_url
-- and mux_cleanup_key, and the MUX_CLEANUP_KEY and MUX_CLEANUP_MODE function secrets, can then be
-- removed. (Before rolling back, the worker can be stopped at once without any of this:
-- select public.mux_cleanup_set_mode('off', '<who>').)
--
-- It restores the stage 2 definitions of every function stage 3 replaced (bodies copied verbatim
-- from the migrations named above each), the NOT NULL columns and cascading foreign keys, and
-- removes the queue, its functions and its three cron jobs. Rolling back reopens F5 to F8:
-- deleted and removed videos stay playable at Mux, and the purge fails for any account whose
-- response has someone else's video reply (and stops every purge after it).
--
-- It refuses to run (and changes nothing) if the stage 3 schema already holds data the stage 2
-- schema cannot: a tombstone (a video or comment with no author) or an anonymised moderation
-- record. Those exist only after a purge has run; decide with Nemat before removing them. Open
-- jobs in mux_cleanup_jobs are dropped with the table: list them first
-- (select * from public.mux_cleanup_jobs where status in ('pending', 'running', 'failed', 'review'))
-- and finish them by hand in Mux if they matter.

do $$
begin
  if exists (select 1 from public.responses where author_id is null)
     or exists (select 1 from public.comments where author_id is null or body is null)
     or exists (select 1 from public.moderation_actions where account_id is null or moderator is null or reason is null)
     or exists (select 1 from public.review_requests where account_id is null)
     or exists (select 1 from public.reports where reporter_id is null or target_id is null) then
    raise exception 'stage 3 rollback refused: tombstones or anonymised moderation records exist';
  end if;
end;
$$;

drop trigger accounts_before_delete on public.accounts;
drop function public.accounts_before_delete();
drop function public.prepare_account_removal(uuid, text);

select cron.unschedule('mux-cleanup');
select cron.unschedule('mux-sweep');
select cron.unschedule('prune-moderation-records');
select cron.unschedule('prune-mux-cleanup-jobs');

-- video_visible: as in 20261008000100_safety.sql
create or replace function public.video_visible(r public.responses, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select r.status = 'live' and public.can_see(p_viewer, r.author_id) and not public.reported_by(p_viewer, 'video', r.id);
$$;

-- delete_video: as in 20261008000100_safety.sql
create or replace function public.delete_video(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.responses set status = 'deleted', deleted_at = now()
   where id = p_id and author_id = v_uid and status in ('processing', 'live');
  if not found then raise exception 'video_not_found' using errcode = 'P0001'; end if;
  update public.profiles set pinned_response_id = null where id = v_uid and pinned_response_id = p_id;
  delete from public.push_outbox where video_id = p_id and sent_at is null;
end;
$$;

-- abandon_response: as in 20261006000500_core_loop.sql
create or replace function public.abandon_response(p_response uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.responses set status = 'deleted', deleted_at = now()
   where id = p_response and author_id = v_uid and status = 'processing';
end;
$$;

-- discard_draft: as in 20261009000100_places_suggestions.sql
create or replace function public.discard_draft(p_suggestion uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.responses set status = 'deleted', deleted_at = now() where suggestion_id = p_suggestion and status = 'draft' and author_id = auth.uid();
  if not found then raise exception 'draft_not_found' using errcode = 'P0001'; end if;
end;
$$;

-- post_draft: as in 20261012000100_video_uploads.sql
create or replace function public.post_draft(p_suggestion uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_upload uuid;
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.suggestions where id = p_suggestion and author_id = v_uid and status in ('in_review', 'live', 'not_published', 'withdrawn')) then
    raise exception 'suggestion_not_found' using errcode = 'P0001';
  end if;
  if p_duration_ms is null or p_duration_ms < 2000 or p_duration_ms > 31000 then raise exception 'invalid_duration' using errcode = 'P0001'; end if;
  if v_caption is not null and char_length(v_caption) > 150 then raise exception 'invalid_caption' using errcode = 'P0001'; end if;
  if p_upload_id is null or p_upload_id = '' then raise exception 'upload_required' using errcode = 'P0001'; end if;
  v_upload := public.claim_video_upload(v_uid, p_upload_id);
  -- One draft per suggestion: re-recording replaces it.
  update public.responses set status = 'deleted', deleted_at = now() where suggestion_id = p_suggestion and status = 'draft';
  insert into public.responses (status, suggestion_id, author_id, caption, duration_ms, mux_upload_id)
  values ('draft', p_suggestion, v_uid, v_caption, p_duration_ms, p_upload_id) returning * into r;
  update public.video_uploads set response_id = r.id where id = v_upload;
  return jsonb_build_object('id', r.id, 'status', r.status);
end;
$$;

-- retry_response_upload: as in 20261012000100_video_uploads.sql
create or replace function public.retry_response_upload(p_response uuid, p_upload_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_upload uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform 1 from public.responses where id = p_response and author_id = v_uid and status = 'processing' for update;
  if not found then raise exception 'response_not_found' using errcode = 'P0001'; end if;
  v_upload := public.claim_video_upload(v_uid, p_upload_id);
  update public.responses set mux_upload_id = p_upload_id where id = p_response;
  update public.video_uploads set response_id = p_response where id = v_upload;
end;
$$;

-- delete_account: as in 20261008000100_safety.sql
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_iat bigint;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  v_iat := (current_setting('request.jwt.claims', true)::jsonb ->> 'iat')::bigint;
  if v_iat is null or v_iat < extract(epoch from now())::bigint - 600 then
    raise exception 'reauth_required' using errcode = 'P0001';
  end if;
  update public.accounts set deleted_at = now() where id = v_uid;
  delete from public.push_tokens where account_id = v_uid;
  delete from public.push_outbox where recipient_id = v_uid and sent_at is null;
end;
$$;

-- get_onboarding_state: as in 20261008000100_safety.sql
create or replace function public.get_onboarding_state()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_account public.accounts%rowtype;
  v_profile public.profiles%rowtype;
  v_config public.app_config%rowtype;
  v_email text;
  v_waitlisted boolean;
  v_action public.moderation_actions%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into v_account from public.accounts where id = v_uid;
  if not found then
    insert into public.accounts (id) values (v_uid) returning * into v_account;
  end if;
  if v_account.deleted_at is not null and v_account.deleted_at > now() - interval '30 days' then
    update public.accounts set deleted_at = null where id = v_uid returning * into v_account;
  end if;
  select * into v_config from public.app_config;
  select email into v_email from auth.users where id = v_uid;
  select * into v_profile from public.profiles where id = v_uid;
  v_waitlisted := exists (select 1 from public.waitlist where account_id = v_uid and admitted_at is null);
  if v_account.moderation_action_id is not null then select * into v_action from public.moderation_actions where id = v_account.moderation_action_id; end if;
  return jsonb_build_object(
    'email', v_email,
    'age_confirmed', v_account.age_confirmed_at is not null,
    'invite_required', v_config.invite_required,
    'has_beta_access', public.has_beta_access(v_uid),
    'waitlisted', v_waitlisted,
    'has_profile', v_profile.id is not null,
    'profile', case when v_profile.id is null then null else jsonb_build_object(
      'name', v_profile.name,
      'username', v_profile.username,
      'photo_path', v_profile.photo_path
    ) end,
    'suspended', v_account.moderation_status = 'suspended',
    'restriction', case when v_account.moderation_status = 'restricted' and v_account.restricted_until > now() then jsonb_build_object(
      'action_id', v_account.moderation_action_id, 'until', v_account.restricted_until) end,
    'suspension', case when v_account.moderation_status = 'suspended' then jsonb_build_object(
      'action_id', v_action.id,
      'reason', v_action.reason,
      'review_requested', exists (select 1 from public.review_requests rr where rr.action_id = v_action.id)
    ) end
  );
end;
$$;

-- mod_remove_video: as in 20261008000100_safety.sql
create or replace function public.mod_remove_video(p_video uuid, p_reason text, p_moderator text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.responses%rowtype;
  v_action uuid;
begin
  select * into r from public.responses where id = p_video and status in ('processing', 'live');
  if not found then raise exception 'video_not_found' using errcode = 'P0001'; end if;
  v_action := public.mod_log(p_moderator, r.author_id, 'remove', 'video', r.id, p_reason, p_note, null);
  update public.responses set status = 'removed', removed_action_id = v_action where id = r.id;
  update public.profiles set pinned_response_id = null where pinned_response_id = r.id;
  update public.reports set status = 'closed', closed_at = now(), closed_by = p_moderator, action_id = v_action where target_kind = 'video' and target_id = r.id and status = 'open';
  perform public.mod_notify(r.author_id, 'removed', v_action);
  return v_action;
end;
$$;

-- mod_restore_video: as in 20261008000100_safety.sql
create or replace function public.mod_restore_video(p_video uuid, p_reason text, p_moderator text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.responses%rowtype;
  v_action uuid;
begin
  select * into r from public.responses where id = p_video and status = 'removed';
  if not found then raise exception 'video_not_found' using errcode = 'P0001'; end if;
  v_action := public.mod_log(p_moderator, r.author_id, 'restore', 'video', r.id, p_reason, p_note, null);
  update public.responses set status = 'live', removed_action_id = null where id = r.id;
  return v_action;
end;
$$;

-- mod_decide_review: as in 20261008000100_safety.sql
create or replace function public.mod_decide_review(p_action uuid, p_outcome text, p_moderator text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rr public.review_requests%rowtype;
  m public.moderation_actions%rowtype;
begin
  if p_outcome not in ('upheld', 'reversed') then raise exception 'invalid_outcome' using errcode = 'P0001'; end if;
  select * into rr from public.review_requests where action_id = p_action and outcome is null;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  select * into m from public.moderation_actions where id = p_action;
  update public.review_requests set outcome = p_outcome, decided_at = now(), decided_by = p_moderator where action_id = p_action;
  if p_outcome = 'reversed' then
    if m.kind = 'remove' and m.target_kind = 'video' then perform public.mod_restore_video(m.target_id, 'Review: ' || coalesce(p_note, 'reversed'), p_moderator, p_note);
    elsif m.kind = 'remove' and m.target_kind = 'comment' then update public.comments set deleted_at = null, removed_action_id = null where id = m.target_id;
    elsif m.kind in ('restrict', 'suspend') then perform public.mod_restore_account(m.account_id, 'Review: ' || coalesce(p_note, 'reversed'), p_moderator, p_note);
    end if;
  end if;
  perform public.mod_notify(m.account_id, 'review_outcome', m.id);
end;
$$;

-- mod_review_queue: as in 20261008000100_safety.sql
create or replace function public.mod_review_queue(p_limit integer default 100)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'action_id', rr.action_id, 'account', public.profile_card(rr.account_id), 'requested_at', rr.created_at,
    'action', (select jsonb_build_object('kind', m.kind, 'target_kind', m.target_kind, 'target_id', m.target_id, 'reason', m.reason, 'note', m.note, 'moderator', m.moderator, 'created_at', m.created_at, 'restrict_until', m.restrict_until)
                 from public.moderation_actions m where m.id = rr.action_id)
  ) order by rr.created_at), '[]'::jsonb)
  from (select * from public.review_requests where outcome is null order by created_at limit greatest(1, least(p_limit, 500))) rr;
$$;

-- mark_response_live: as in 20261012000100_video_uploads.sql
create or replace function public.mark_response_live(p_upload_id text, p_asset_id text, p_playback_id text, p_duration_ms integer, p_passthrough text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.responses%rowtype;
begin
  select * into r from public.responses where mux_upload_id = p_upload_id for update;
  if not found then return jsonb_build_object('status', 'unknown_upload'); end if;
  if (p_passthrough is not null and p_passthrough is distinct from r.author_id::text)
     or exists (select 1 from public.video_uploads where upload_id = p_upload_id and account_id <> r.author_id) then
    return jsonb_build_object('status', 'owner_mismatch');
  end if;
  if r.status in ('processing', 'draft') then
    update public.responses
       set status = case when status = 'draft' then 'draft' else 'live' end,
           mux_asset_id = p_asset_id, mux_playback_id = p_playback_id,
           live_at = case when status = 'draft' then live_at else coalesce(live_at, now()) end,
           duration_ms = coalesce(p_duration_ms, duration_ms)
     where id = r.id
     returning * into r;
  end if;
  return jsonb_build_object('id', r.id, 'status', r.status, 'author_id', r.author_id);
end;
$$;

-- purge_deleted_accounts: as in 20261008000100_safety.sql
create or replace function public.purge_deleted_accounts()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from auth.users u using public.accounts a
   where a.id = u.id and a.deleted_at is not null and a.deleted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

drop function public.mux_cleanup_claim(integer, integer);
drop function public.mux_cleanup_finish(uuid, uuid, text, jsonb);
drop function public.mux_cleanup_sweep(jsonb, integer, boolean);
drop function public.mux_cleanup_check(uuid, uuid);
drop function public.mux_cleanup_set_mode(text, text);
drop function public.prune_mux_cleanup_jobs();
drop function public.mux_video_restorable(public.responses);
drop function public.mux_cleanup_overview();
drop function public.mux_cleanup_retry(uuid);
drop function public.run_mux_cleanup(text);
drop function public.purge_account(uuid);
drop function public.prune_moderation_records();
drop function public.mux_sync_account_playback(uuid, text);
drop function public.mux_playback_wanted(uuid, text);
drop function public.mux_asset_hold(text, text);
drop function public.moderation_case_closed_at(uuid);
drop function public.mux_forget_video(uuid, text, text, uuid, text);
drop function public.mux_cleanup_enqueue(text, text, text, text, uuid, uuid, timestamptz);
drop function public.mux_cleanup_mode();
drop table public.mux_cleanup_settings;
drop table public.mux_cleanup_jobs;
drop table public.account_purge_failures;

alter table public.responses drop constraint responses_author_or_tombstone;
alter table public.responses alter column author_id set not null;
comment on column public.responses.author_id is null;
alter table public.comments drop constraint comments_author_or_tombstone;
alter table public.comments drop constraint comments_body_check;
alter table public.comments add constraint comments_body_check check (char_length(btrim(body)) between 1 and 300);
alter table public.comments alter column body set not null;
alter table public.comments alter column author_id set not null;
alter table public.moderation_actions drop constraint moderation_actions_account_id_fkey;
alter table public.moderation_actions add constraint moderation_actions_account_id_fkey foreign key (account_id) references public.accounts (id) on delete cascade;
alter table public.moderation_actions alter column account_id set not null;
alter table public.moderation_actions drop constraint moderation_actions_named_unless_anonymized;
alter table public.moderation_actions alter column moderator set not null;
alter table public.moderation_actions alter column reason set not null;
alter table public.moderation_actions drop column anonymized_at;
alter table public.review_requests drop constraint review_requests_account_id_fkey;
alter table public.review_requests add constraint review_requests_account_id_fkey foreign key (account_id) references public.accounts (id) on delete cascade;
alter table public.review_requests alter column account_id set not null;
alter table public.reports drop constraint reports_reporter_id_fkey;
alter table public.reports add constraint reports_reporter_id_fkey foreign key (reporter_id) references public.accounts (id) on delete cascade;
alter table public.reports alter column reporter_id set not null;
alter table public.reports alter column target_id set not null;
alter table public.reports drop column anonymized_at;
-- Grants: the replaced functions keep theirs (create or replace); purge_deleted_accounts is
-- service role / internal only, as before.
revoke execute on function public.purge_deleted_accounts() from public, anon, authenticated;
