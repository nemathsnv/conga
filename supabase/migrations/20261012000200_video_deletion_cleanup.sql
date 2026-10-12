-- Security stage 3: video deletion, playback revocation and the account purge.
--
-- Before this migration nothing ever changed a video at Mux after it went live: a deleted or
-- removed video stayed playable at its public Mux URL (F5); the 30-day purge failed outright for
-- an account whose response had someone else's video reply, and one such account stopped every
-- purge (F6); a purge erased the only record of the account's Mux assets (F7); and an asset whose
-- response was deleted before it was ready, or whose upload was never posted, stayed at Mux for
-- good (F8).
--
-- Retention (Nemat, Stage 3 brief, 12 Oct):
--   * an author's deletion is immediate: the asset is deleted at Mux;
--   * a video removed by moderation loses public playback at once and its asset is kept
--     privately until 30 days after its moderation case closes (a pending review keeps the case
--     open; the purge closes it);
--   * during the 30-day account deletion window playback is disabled, and signing back in
--     restores it;
--   * after a purge, minimal anonymised moderation records are kept for 90 days.
--
-- public.mux_cleanup_jobs is the queue of Mux changes. The state changes in this file enqueue
-- jobs in the same transaction, so a job exists exactly when its change committed. The
-- mux-cleanup Edge Function drains it (pg_cron, every minute) and sweeps Mux for orphans (daily):
--   delete_asset   delete an asset (author deletion, abandoned upload, purge, retention over)
--   sync_playback  make one video's public playback match the database: none while it is
--                  removed or its account is deleted, one public playback id otherwise
--   cancel_upload  cancel an upload whose video was deleted before Mux made an asset
-- Every destructive call is preceded by an ownership check at Mux (the asset's passthrough, and
-- its upload id, must be the ones recorded) and, for deletions, by a check here under row locks
-- that no live, processing or draft video uses the asset and no retention applies
-- (mux_asset_hold). Jobs carry the Mux ids and the owner themselves, with no foreign keys, so
-- they outlive the rows they came from.

-- ---------------------------------------------------------------------------
-- The queue
-- ---------------------------------------------------------------------------
create table public.mux_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('delete_asset', 'sync_playback', 'cancel_upload')),
  reason text not null check (reason in ('author_deleted', 'abandoned', 'moderation_removed', 'moderation_restored', 'review_upheld',
                                         'account_deleted', 'account_restored', 'account_purged', 'orphan', 'sweep')),
  -- pending: waiting for not_before; running: leased by a worker; done; skipped: nothing to do or
  -- the asset must be kept; failed: out of attempts or impossible (retry with mux_cleanup_retry);
  -- review: an orphan whose owner could not be proven, reported and never acted on automatically.
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'skipped', 'failed', 'review')),
  dedupe_key text not null,
  asset_id text check (asset_id is null or asset_id ~ '^[A-Za-z0-9]{1,128}$'),
  upload_id text check (upload_id is null or upload_id ~ '^[A-Za-z0-9]{1,128}$'),
  -- No foreign keys: the response and the account may be purged before the job runs.
  response_id uuid,
  -- The account the Mux object was minted for (its passthrough). Cleared once the job is done.
  owner_id uuid,
  not_before timestamptz not null default now(),
  attempts integer not null default 0,
  max_attempts integer not null default 10,
  lease_id uuid,
  locked_until timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint mux_cleanup_jobs_target check (case action when 'cancel_upload' then upload_id is not null else asset_id is not null end),
  constraint mux_cleanup_jobs_sync_response check (action <> 'sync_playback' or response_id is not null or status = 'done'),
  constraint mux_cleanup_jobs_owner check (owner_id is not null or status in ('done', 'review')),
  constraint mux_cleanup_jobs_lease check ((status = 'running') = (lease_id is not null and locked_until is not null))
);
comment on table public.mux_cleanup_jobs is 'Queue of Mux changes (deleting assets, revoking and restoring public playback, cancelling uploads), drained by the mux-cleanup Edge Function (security stage 3).';
-- One open job per target: enqueueing again merges into it.
create unique index mux_cleanup_jobs_open_key on public.mux_cleanup_jobs (dedupe_key) where status in ('pending', 'review');
create index mux_cleanup_jobs_due_idx on public.mux_cleanup_jobs (not_before) where status = 'pending';
create index mux_cleanup_jobs_running_asset_idx on public.mux_cleanup_jobs (asset_id) where status = 'running';
create index mux_cleanup_jobs_asset_idx on public.mux_cleanup_jobs (asset_id);
create trigger mux_cleanup_jobs_updated_at before update on public.mux_cleanup_jobs for each row execute function public.set_updated_at();
alter table public.mux_cleanup_jobs enable row level security;
revoke all on table public.mux_cleanup_jobs from anon, authenticated;

-- The switch for the worker, off until the team turns it on (security stage 3 rollout):
--   off      run_mux_cleanup calls nothing and no job is leased; jobs wait
--   dry_run  the worker reads Mux and records what it would do, and changes nothing at Mux
--   live     the worker acts
-- The function also needs MUX_CLEANUP_MODE=live in its own environment to act: the stricter of
-- the two applies, and an unset variable means dry_run.
create table public.mux_cleanup_settings (
  id boolean primary key default true check (id),
  mode text not null default 'off' check (mode in ('off', 'dry_run', 'live')),
  changed_at timestamptz not null default now(),
  changed_by text not null default 'migration'
);
comment on table public.mux_cleanup_settings is 'One row: whether the Mux clean-up worker is off, in dry run, or live. Off after the migration.';
insert into public.mux_cleanup_settings default values;
alter table public.mux_cleanup_settings enable row level security;
revoke all on table public.mux_cleanup_settings from anon, authenticated;

-- Accounts the purge could not remove, and why. The purge retries them every day; the row goes
-- once the account is purged.
create table public.account_purge_failures (
  account_id uuid primary key,
  attempts integer not null default 1,
  last_error text not null,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now()
);
comment on table public.account_purge_failures is 'Accounts past their 30 days that the daily purge could not remove (security stage 3).';
alter table public.account_purge_failures enable row level security;
revoke all on table public.account_purge_failures from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tombstones and anonymised moderation records (F6)
-- ---------------------------------------------------------------------------
-- A purged account's video that someone else's video reply still points at stays as a
-- tombstone: deleted, no author, no caption, no Mux ids. Replies keep their room and show
-- "Original response deleted" or "Replying to a deleted video", as after an author's deletion.
alter table public.responses alter column author_id drop not null;
alter table public.responses add constraint responses_author_or_tombstone check (author_id is not null or status = 'deleted');
comment on column public.responses.author_id is 'Null only on a tombstone: a purged account''s video kept because other people''s video replies point at it.';

-- The same for a purged account's comment that other people's comments reply to (the
-- deleted-parent row of board LV-CommentDeleted), so a purge never deletes anyone else's words.
alter table public.comments alter column author_id drop not null;
alter table public.comments alter column body drop not null;
alter table public.comments drop constraint comments_body_check;
alter table public.comments add constraint comments_body_check check (body is null or char_length(btrim(body)) between 1 and 300);
alter table public.comments add constraint comments_author_or_tombstone check ((author_id is not null and body is not null) or deleted_at is not null);

-- Moderation records outlive the account, without it: a purge anonymises them (no account,
-- target, moderator, reason or note: only what was done, to what kind of thing, and when) and
-- prune_moderation_records deletes them 90 days later.
alter table public.moderation_actions alter column account_id drop not null;
alter table public.moderation_actions alter column moderator drop not null;
alter table public.moderation_actions alter column reason drop not null;
alter table public.moderation_actions add column anonymized_at timestamptz;
alter table public.moderation_actions add constraint moderation_actions_named_unless_anonymized check ((moderator is not null and reason is not null) or anonymized_at is not null);
alter table public.moderation_actions drop constraint moderation_actions_account_id_fkey;
alter table public.moderation_actions add constraint moderation_actions_account_id_fkey foreign key (account_id) references public.accounts (id) on delete set null;
alter table public.review_requests alter column account_id drop not null;
alter table public.review_requests drop constraint review_requests_account_id_fkey;
alter table public.review_requests add constraint review_requests_account_id_fkey foreign key (account_id) references public.accounts (id) on delete set null;
alter table public.reports alter column reporter_id drop not null;
alter table public.reports alter column target_id drop not null;
alter table public.reports add column anonymized_at timestamptz;
alter table public.reports drop constraint reports_reporter_id_fkey;
alter table public.reports add constraint reports_reporter_id_fkey foreign key (reporter_id) references public.accounts (id) on delete set null;
comment on column public.moderation_actions.anonymized_at is 'Set when the account was purged: account, target, moderator, reason and note removed; deleted 90 days later.';
comment on column public.reports.anonymized_at is 'Set when the reporter or the reported account was purged; closed reports are deleted 90 days later.';

-- ---------------------------------------------------------------------------
-- Internal helpers (executable by no API role)
-- ---------------------------------------------------------------------------

-- Queues one Mux job, or merges it into the open job for the same target. A deletion keeps the
-- later of the two times (a retention is never shortened); the others keep the earlier one.
-- Ids that are not Mux ids are ignored rather than allowed to fail the caller's transaction.
create or replace function public.mux_cleanup_enqueue(p_action text, p_reason text, p_asset text, p_upload text, p_response uuid, p_owner uuid, p_not_before timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_asset text := case when p_asset ~ '^[A-Za-z0-9]{1,128}$' then p_asset end;
  v_upload text := case when p_upload ~ '^[A-Za-z0-9]{1,128}$' then p_upload end;
begin
  if p_action = 'cancel_upload' then
    if v_upload is null then return; end if;
    v_key := 'cancel_upload:' || v_upload;
  elsif v_asset is null then
    return;
  elsif p_action = 'sync_playback' then
    if p_response is null then return; end if;
    v_key := 'sync_playback:' || v_asset || ':' || p_response;
  elsif p_action = 'delete_asset' then
    v_key := 'delete_asset:' || v_asset;
  else
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_owner is null then raise exception 'owner_required' using errcode = 'P0001'; end if;
  insert into public.mux_cleanup_jobs (action, reason, dedupe_key, asset_id, upload_id, response_id, owner_id, not_before)
  values (p_action, p_reason, v_key, v_asset, v_upload, p_response, p_owner, coalesce(p_not_before, now()))
  on conflict (dedupe_key) where status in ('pending', 'review') do update
     set not_before = case when excluded.action = 'delete_asset' then greatest(mux_cleanup_jobs.not_before, excluded.not_before)
                           else least(mux_cleanup_jobs.not_before, excluded.not_before) end,
         upload_id = coalesce(mux_cleanup_jobs.upload_id, excluded.upload_id);
end;
$$;

-- A video whose author deleted it, or abandoned before it went live: its asset is deleted, or,
-- if Mux has not made one yet, its upload is cancelled.
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

-- When a removal's moderation case closed: the review decision if there was one, otherwise the
-- removal itself. Null while a review is pending (the case is open) or the action is unknown.
create or replace function public.moderation_case_closed_at(p_action uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  select case when rr.action_id is not null and rr.decided_at is null then null
              else coalesce(rr.decided_at, m.created_at) end
    from public.moderation_actions m
    left join public.review_requests rr on rr.action_id = m.id
   where m.id = p_action;
$$;

-- How long an asset must be kept: null (it may be deleted now), a time, or 'infinity' (in use,
-- or its moderation case is open). Matched by asset id, or by upload id for a video whose row
-- has not recorded its asset yet.
create or replace function public.mux_asset_hold(p_asset text, p_upload text)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare
  v_hold timestamptz;
  v_closed timestamptz;
  r record;
begin
  -- Any live, processing or draft video uses it, whoever's account: a deleted account keeps its
  -- videos for the 30 days in which signing back in restores everything.
  if exists (select 1 from public.responses x
              where (x.mux_asset_id = p_asset or (p_upload is not null and x.mux_upload_id = p_upload))
                and x.status in ('live', 'processing', 'draft')) then
    return 'infinity';
  end if;
  -- Removed by moderation: kept privately until 30 days after the case closes.
  for r in select x.removed_action_id from public.responses x
            where (x.mux_asset_id = p_asset or (p_upload is not null and x.mux_upload_id = p_upload)) and x.status = 'removed' loop
    v_closed := public.moderation_case_closed_at(r.removed_action_id);
    if v_closed is null then return 'infinity'; end if;
    v_hold := greatest(v_hold, v_closed + interval '30 days');
  end loop;
  -- An upload URL its owner may still post with (never one a video already took).
  v_hold := greatest(v_hold, (select max(u.expires_at) from public.video_uploads u
                               where p_upload is not null and u.upload_id = p_upload
                                 and u.status in ('reserved', 'active', 'cancelling') and u.expires_at > now()));
  if v_hold is null or v_hold <= now() then return null; end if;
  return v_hold;
end;
$$;

-- Whether a video should have public playback at Mux now: live, draft or processing, with this
-- asset, and its author's account not deleted. Removed and deleted videos never do.
create or replace function public.mux_playback_wanted(p_response uuid, p_asset text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.responses r join public.accounts a on a.id = r.author_id
                  where r.id = p_response and r.mux_asset_id = p_asset
                    and r.status in ('live', 'draft', 'processing') and a.deleted_at is null);
$$;

-- Queues the playback of every video of an account that has an asset (deleting or restoring the
-- account).
create or replace function public.mux_sync_account_playback(p_account uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.mux_cleanup_enqueue('sync_playback', p_reason, r.mux_asset_id, r.mux_upload_id, r.id, r.author_id)
     from public.responses r
    where r.author_id = p_account and r.mux_asset_id is not null and r.status in ('live', 'draft', 'processing');
end;
$$;

-- ---------------------------------------------------------------------------
-- A video can only be watched while it has public playback (F5). Live videos always have it,
-- except between a moderator's restore, or signing back in, and the worker creating a new
-- playback id; they are not shown with a dead id in that minute.
-- ---------------------------------------------------------------------------
create or replace function public.video_visible(r public.responses, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select r.status = 'live' and r.mux_playback_id is not null and public.can_see(p_viewer, r.author_id) and not public.reported_by(p_viewer, 'video', r.id);
$$;

-- ---------------------------------------------------------------------------
-- Deleting your own video (SF-Delete) and abandoning one: immediate, so the asset is deleted.
-- ---------------------------------------------------------------------------
create or replace function public.delete_video(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.responses set status = 'deleted', deleted_at = now()
   where id = p_id and author_id = v_uid and status in ('processing', 'live')
   returning * into r;
  if not found then raise exception 'video_not_found' using errcode = 'P0001'; end if;
  update public.profiles set pinned_response_id = null where id = v_uid and pinned_response_id = p_id;
  delete from public.push_outbox where video_id = p_id and sent_at is null;
  perform public.mux_forget_video(r.id, r.mux_asset_id, r.mux_upload_id, r.author_id, 'author_deleted');
end;
$$;

create or replace function public.abandon_response(p_response uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.responses set status = 'deleted', deleted_at = now()
   where id = p_response and author_id = v_uid and status = 'processing'
   returning * into r;
  if found then perform public.mux_forget_video(r.id, r.mux_asset_id, r.mux_upload_id, r.author_id, 'abandoned'); end if;
end;
$$;

create or replace function public.discard_draft(p_suggestion uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.responses%rowtype;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.responses set status = 'deleted', deleted_at = now()
   where suggestion_id = p_suggestion and status = 'draft' and author_id = auth.uid()
   returning * into r;
  if not found then raise exception 'draft_not_found' using errcode = 'P0001'; end if;
  perform public.mux_forget_video(r.id, r.mux_asset_id, r.mux_upload_id, r.author_id, 'abandoned');
end;
$$;

-- Unchanged from stage 2, except that the draft a re-recording replaces is forgotten at Mux.
create or replace function public.post_draft(p_suggestion uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_upload uuid;
  old public.responses%rowtype;
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
  update public.responses set status = 'deleted', deleted_at = now() where suggestion_id = p_suggestion and status = 'draft' returning * into old;
  if old.id is not null then perform public.mux_forget_video(old.id, old.mux_asset_id, old.mux_upload_id, old.author_id, 'abandoned'); end if;
  insert into public.responses (status, suggestion_id, author_id, caption, duration_ms, mux_upload_id)
  values ('draft', p_suggestion, v_uid, v_caption, p_duration_ms, p_upload_id) returning * into r;
  update public.video_uploads set response_id = r.id where id = v_upload;
  return jsonb_build_object('id', r.id, 'status', r.status);
end;
$$;

-- Unchanged from stage 2, except that the upload a retry replaces is cancelled at Mux (its asset,
-- if Mux made one, is deleted: no video uses it any more).
create or replace function public.retry_response_upload(p_response uuid, p_upload_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_upload uuid;
  v_old text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select mux_upload_id into v_old from public.responses where id = p_response and author_id = v_uid and status = 'processing' for update;
  if not found then raise exception 'response_not_found' using errcode = 'P0001'; end if;
  v_upload := public.claim_video_upload(v_uid, p_upload_id);
  update public.responses set mux_upload_id = p_upload_id where id = p_response;
  update public.video_uploads set response_id = p_response where id = v_upload;
  if v_old is not null and v_old <> p_upload_id then
    perform public.mux_cleanup_enqueue('cancel_upload', 'abandoned', null, v_old, p_response, v_uid);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deleting your account and signing back in: playback off for the 30 days, back on restore.
-- ---------------------------------------------------------------------------
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
  perform public.mux_sync_account_playback(v_uid, 'account_deleted');
end;
$$;

-- Unchanged from phase 5, except that restoring an account queues its playback back on.
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
    perform public.mux_sync_account_playback(v_uid, 'account_restored');
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

-- ---------------------------------------------------------------------------
-- Moderation: removal revokes playback and keeps the asset privately; restore brings it back.
-- ---------------------------------------------------------------------------
create or replace function public.mod_remove_video(p_video uuid, p_reason text, p_moderator text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.responses%rowtype;
  v_action uuid;
begin
  select * into r from public.responses where id = p_video and status in ('processing', 'live') for update;
  if not found then raise exception 'video_not_found' using errcode = 'P0001'; end if;
  v_action := public.mod_log(p_moderator, r.author_id, 'remove', 'video', r.id, p_reason, p_note, null);
  update public.responses set status = 'removed', removed_action_id = v_action where id = r.id;
  update public.profiles set pinned_response_id = null where pinned_response_id = r.id;
  update public.reports set status = 'closed', closed_at = now(), closed_by = p_moderator, action_id = v_action where target_kind = 'video' and target_id = r.id and status = 'open';
  perform public.mod_notify(r.author_id, 'removed', v_action);
  -- Playback off now; the asset is deleted once the retention after the case closes is over.
  perform public.mux_cleanup_enqueue('sync_playback', 'moderation_removed', r.mux_asset_id, r.mux_upload_id, r.id, r.author_id);
  perform public.mux_cleanup_enqueue('delete_asset', 'moderation_removed', r.mux_asset_id, r.mux_upload_id, r.id, r.author_id);
  return v_action;
end;
$$;

-- Whether a removed video can still be restored: its asset is kept, and no deletion of it is
-- running or done. Shown to moderators in the review queue.
create or replace function public.mux_video_restorable(r public.responses)
returns boolean language sql stable security definer set search_path = '' as $$
  select r.status = 'removed'
     and (r.mux_asset_id is not null or r.mux_upload_id is not null)
     and not exists (select 1 from public.mux_cleanup_jobs j
                      where j.action = 'delete_asset' and j.status in ('running', 'done')
                        and (j.asset_id = r.mux_asset_id or j.upload_id = r.mux_upload_id));
$$;

-- A removed video can be restored while its asset is kept. Once the asset is permanently deleted
-- the restore is refused (asset_deleted), and while the worker is deleting it too
-- (asset_being_deleted): nothing can bring the video back.
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

-- Unchanged from phase 5, except that an upheld removal starts its 30-day retention from the
-- decision, and that reversing a removal whose asset is gone is refused (asset_deleted, from
-- mod_restore_video): the moderator sees video_restorable in the queue before deciding.
create or replace function public.mod_decide_review(p_action uuid, p_outcome text, p_moderator text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rr public.review_requests%rowtype;
  m public.moderation_actions%rowtype;
  v public.responses%rowtype;
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
  elsif m.kind = 'remove' and m.target_kind = 'video' then
    select * into v from public.responses where id = m.target_id and status = 'removed';
    if found then perform public.mux_cleanup_enqueue('delete_asset', 'review_upheld', v.mux_asset_id, v.mux_upload_id, v.id, v.author_id); end if;
  end if;
  perform public.mod_notify(m.account_id, 'review_outcome', m.id);
end;
$$;

-- Unchanged from phase 5, except that a removed video's review says whether it can still be
-- restored (video_restorable: false once its asset is permanently deleted).
create or replace function public.mod_review_queue(p_limit integer default 100)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'action_id', rr.action_id, 'account', public.profile_card(rr.account_id), 'requested_at', rr.created_at,
    'action', (select jsonb_build_object('kind', m.kind, 'target_kind', m.target_kind, 'target_id', m.target_id, 'reason', m.reason, 'note', m.note, 'moderator', m.moderator, 'created_at', m.created_at, 'restrict_until', m.restrict_until)
                 from public.moderation_actions m where m.id = rr.action_id),
    'video_restorable', (select public.mux_video_restorable(v) from public.moderation_actions m join public.responses v on v.id = m.target_id
                          where m.id = rr.action_id and m.kind = 'remove' and m.target_kind = 'video')
  ) order by rr.created_at), '[]'::jsonb)
  from (select * from public.review_requests where outcome is null order by created_at limit greatest(1, least(p_limit, 500))) rr;
$$;

-- ---------------------------------------------------------------------------
-- Going live (mux-webhook, mux-upload-status). Unchanged from stage 2 for videos that are
-- processing or drafts. New: an asset no video can use is queued for deletion, and one whose
-- video must not play is queued for its playback to be revoked.
-- ---------------------------------------------------------------------------
create or replace function public.mark_response_live(p_upload_id text, p_asset_id text, p_playback_id text, p_duration_ms integer, p_passthrough text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.responses%rowtype;
  v_owner uuid;
begin
  select * into r from public.responses where mux_upload_id = p_upload_id for update;
  if not found then
    -- An upload no video took (never posted, or replaced by a retry). Deleted only if it is ours:
    -- minted for the account its passthrough names.
    select account_id into v_owner from public.video_uploads where upload_id = p_upload_id;
    if v_owner is not null and (p_passthrough is null or p_passthrough = v_owner::text) then
      perform public.mux_cleanup_enqueue('delete_asset', 'abandoned', p_asset_id, p_upload_id, null, v_owner);
    end if;
    return jsonb_build_object('status', 'unknown_upload');
  end if;
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
    if not public.mux_playback_wanted(r.id, r.mux_asset_id) then
      perform public.mux_cleanup_enqueue('sync_playback', 'account_deleted', r.mux_asset_id, r.mux_upload_id, r.id, r.author_id);
    end if;
  elsif r.mux_asset_id is null and r.status in ('deleted', 'removed') then
    -- Deleted or removed before Mux finished: the asset is recorded so it can be found, and dealt
    -- with like the video (deleted; or kept privately with playback off).
    update public.responses set mux_asset_id = p_asset_id, mux_playback_id = case when status = 'removed' then p_playback_id end
     where id = r.id
     returning * into r;
    if r.status = 'removed' then
      perform public.mux_cleanup_enqueue('sync_playback', 'moderation_removed', r.mux_asset_id, r.mux_upload_id, r.id, r.author_id);
      perform public.mux_cleanup_enqueue('delete_asset', 'moderation_removed', r.mux_asset_id, r.mux_upload_id, r.id, r.author_id);
    else
      perform public.mux_cleanup_enqueue('delete_asset', 'abandoned', r.mux_asset_id, r.mux_upload_id, r.id, r.author_id);
    end if;
  end if;
  return jsonb_build_object('id', r.id, 'status', r.status, 'author_id', r.author_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- The worker's side (service role only; supabase/functions/mux-cleanup)
-- ---------------------------------------------------------------------------

create or replace function public.mux_cleanup_mode()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select mode from public.mux_cleanup_settings), 'off');
$$;

-- The team's switch (service role, SQL editor): off, dry_run or live, with who changed it.
-- Going live puts the jobs a dry run set aside back in the queue at once.
create or replace function public.mux_cleanup_set_mode(p_mode text, p_by text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_mode is null or p_mode not in ('off', 'dry_run', 'live') then raise exception 'invalid_mode' using errcode = 'P0001'; end if;
  if p_by is null or btrim(p_by) = '' then raise exception 'changed_by_required' using errcode = 'P0001'; end if;
  -- (A where clause: the API's safeupdate refuses an update without one.)
  update public.mux_cleanup_settings set mode = p_mode, changed_at = now(), changed_by = p_by where id;
  if p_mode = 'live' then
    update public.mux_cleanup_jobs set not_before = now() where status = 'pending' and (result->>'dry_run') = 'true' and not_before > now();
  end if;
  return jsonb_build_object('mode', p_mode, 'changed_by', p_by);
end;
$$;

-- Leases up to p_limit due jobs: {"mode", "jobs": [...]}. Nothing is leased while the switch is
-- off. One claimer at a time (an advisory lock), and never two jobs for one asset at once, so a
-- revoke and a restore of the same video cannot overlap. A deletion is checked here, under the
-- locks of every row that uses the asset: if the asset is in use or its moderation case is open
-- the job is skipped; if a retention applies it is rescheduled for its end (no attempt used). The
-- worker checks again (mux_cleanup_check) immediately before it changes anything at Mux. Jobs
-- whose worker died (lease expired) go back to the queue.
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

-- The worker calls this immediately before every change at Mux, so it acts on the database as it
-- is now, not as it was when the job was leased: {"ok"} (the lease is still this worker's; it is
-- extended), {"mode"} (the switch now), and for a deletion {"hold"} (as mux_asset_hold: null to
-- go ahead), for a playback job {"wanted"}, for a cancellation {"in_use"} (a video that could
-- still go live uses the upload).
create or replace function public.mux_cleanup_check(p_job uuid, p_lease uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j public.mux_cleanup_jobs%rowtype;
begin
  select * into j from public.mux_cleanup_jobs where id = p_job and status = 'running' and lease_id = p_lease for update;
  if not found then return jsonb_build_object('ok', false); end if;
  update public.mux_cleanup_jobs set locked_until = greatest(locked_until, now() + interval '120 seconds') where id = j.id;
  if j.action = 'delete_asset' then
    perform 1 from public.responses x
     where x.mux_asset_id = j.asset_id or (j.upload_id is not null and x.mux_upload_id = j.upload_id)
     for update;
    return jsonb_build_object('ok', true, 'mode', public.mux_cleanup_mode(), 'hold', public.mux_asset_hold(j.asset_id, j.upload_id));
  elsif j.action = 'sync_playback' then
    perform 1 from public.responses x where x.id = j.response_id for update;
    return jsonb_build_object('ok', true, 'mode', public.mux_cleanup_mode(), 'wanted', public.mux_playback_wanted(j.response_id, j.asset_id));
  end if;
  return jsonb_build_object('ok', true, 'mode', public.mux_cleanup_mode(),
    'in_use', exists (select 1 from public.responses x where x.mux_upload_id = j.upload_id and x.status in ('live', 'processing', 'draft')));
end;
$$;

-- Records a job's outcome; only the lease holder can (a worker whose lease expired gets 'stale').
--   done         what was done at Mux, in p_detail:
--                delete_asset: the asset is gone; videos that are deleted or removed forget it.
--                sync_playback: {"revoked": [...]} the asset has no public playback id left
--                (those listed were deleted now), so the video forgets its own;
--                or {"playback_id": "...", "asset_status": "..."} the public playback id
--                the asset now has, recorded only if the video should still play (re-checked
--                here under its row lock; otherwise the job queued by the change revokes it).
--   found_asset  cancel_upload: Mux had already made an asset ({"asset_id"}); a deletion is queued.
--   retry        a temporary failure ({"error"}): back to pending after 1, 2, 4 ... minutes
--                (at most 6 hours), or failed once attempts are used up.
--   release      nothing was done (a dry run, or a retention found at the last check): back to
--                pending at {"not_before"} (an hour by default), the attempt not counted, the
--                plan kept in result.
--   skipped      nothing to do (for example the asset must be kept).
--   failed       not done and needs a person: the ownership check failed, or the asset to
--                restore is gone. Never discarded automatically.
-- A done job keeps only its action, reason, Mux ids, times and {"outcome"}; it is deleted after
-- 30 days (prune_mux_cleanup_jobs). Failed and review jobs are never deleted automatically.
create or replace function public.mux_cleanup_finish(p_job uuid, p_lease uuid, p_outcome text, p_detail jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j public.mux_cleanup_jobs%rowtype;
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
  v_playback text := v_detail->>'playback_id';
  v_ready boolean := (v_detail->>'asset_status') = 'ready';
  v_recorded boolean;
begin
  if p_outcome not in ('done', 'found_asset', 'retry', 'release', 'skipped', 'failed') then raise exception 'invalid_outcome' using errcode = 'P0001'; end if;
  select * into j from public.mux_cleanup_jobs where id = p_job and status = 'running' and lease_id = p_lease for update;
  if not found then return jsonb_build_object('status', 'stale'); end if;

  if p_outcome = 'retry' then
    update public.mux_cleanup_jobs
       set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
           finished_at = case when attempts >= max_attempts then now() end,
           not_before = now() + least(interval '6 hours', interval '1 minute' * power(2, greatest(attempts - 1, 0))),
           last_error = left(coalesce(v_detail->>'error', 'error'), 500), lease_id = null, locked_until = null
     where id = j.id returning * into j;
    return jsonb_build_object('status', j.status, 'not_before', j.not_before);
  end if;
  if p_outcome = 'release' then
    update public.mux_cleanup_jobs
       set status = 'pending', attempts = greatest(attempts - 1, 0), lease_id = null, locked_until = null, last_error = null,
           not_before = greatest(now(), coalesce((v_detail->>'not_before')::timestamptz, now() + interval '1 hour')),
           result = v_detail
     where id = j.id returning * into j;
    return jsonb_build_object('status', j.status, 'not_before', j.not_before);
  end if;

  if p_outcome = 'done' and j.action = 'delete_asset' then
    update public.responses set mux_asset_id = null, mux_playback_id = null where mux_asset_id = j.asset_id and status in ('deleted', 'removed');
  elsif p_outcome = 'done' and j.action = 'sync_playback' then
    -- Revoked: the asset has no public playback id left (an earlier, interrupted attempt may have
    -- deleted the one recorded here), so the video forgets whichever it had.
    if jsonb_typeof(v_detail->'revoked') = 'array' then
      update public.responses set mux_playback_id = null where id = j.response_id and mux_asset_id = j.asset_id;
    end if;
    if v_playback is not null then
      if v_playback !~ '^[A-Za-z0-9]{1,128}$' then raise exception 'invalid_playback_id' using errcode = 'P0001'; end if;
      perform 1 from public.responses where id = j.response_id for update;
      v_recorded := public.mux_playback_wanted(j.response_id, j.asset_id);
      if v_recorded then
        -- A draft published while its playback was off became processing; it goes live now.
        update public.responses
           set mux_playback_id = v_playback,
               status = case when status = 'processing' and v_ready then 'live' else status end,
               live_at = case when status = 'processing' and v_ready then coalesce(live_at, now()) else live_at end
         where id = j.response_id;
      end if;
    end if;
  elsif p_outcome = 'found_asset' then
    if j.action <> 'cancel_upload' then raise exception 'invalid_outcome' using errcode = 'P0001'; end if;
    perform public.mux_cleanup_enqueue('delete_asset', j.reason, v_detail->>'asset_id', j.upload_id, j.response_id, j.owner_id);
  end if;

  update public.mux_cleanup_jobs
     set status = case when p_outcome in ('done', 'found_asset') then 'done' else p_outcome end,
         finished_at = now(), lease_id = null, locked_until = null,
         result = case when p_outcome in ('done', 'found_asset')
                       then jsonb_build_object('outcome', coalesce(v_detail->>'outcome', p_outcome)) || case when v_recorded is false then '{"recorded": false}'::jsonb else '{}'::jsonb end
                       else v_detail end,
         last_error = case when p_outcome in ('skipped', 'failed') then left(v_detail->>'detail', 500) end,
         owner_id = case when p_outcome in ('done', 'found_asset') then null else owner_id end,
         response_id = case when p_outcome in ('done', 'found_asset') then null else response_id end
   where id = j.id returning * into j;
  return jsonb_build_object('status', j.status) || case when v_recorded is false then '{"recorded": false}'::jsonb else '{}'::jsonb end;
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

-- What the queue is doing, for the team.
create or replace function public.mux_cleanup_overview()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'mode', public.mux_cleanup_mode(),
    'counts', coalesce((select jsonb_object_agg(k, n) from (select status || ':' || action as k, count(*) as n from public.mux_cleanup_jobs group by 1) c), '{}'::jsonb),
    'due', (select count(*) from public.mux_cleanup_jobs where status = 'pending' and not_before <= now()),
    'oldest_due_seconds', (select floor(extract(epoch from now() - min(not_before))) from public.mux_cleanup_jobs where status = 'pending' and not_before <= now()),
    'stuck', (select count(*) from public.mux_cleanup_jobs where status = 'running' and locked_until < now()),
    'dry_run_planned', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'action', action, 'reason', reason, 'asset_id', asset_id, 'upload_id', upload_id, 'plan', result) order by updated_at desc)
                                   from (select * from public.mux_cleanup_jobs where status = 'pending' and (result->>'dry_run') = 'true' order by updated_at desc limit 50) d), '[]'::jsonb),
    'failed', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'action', action, 'reason', reason, 'asset_id', asset_id, 'upload_id', upload_id, 'attempts', attempts, 'last_error', last_error, 'finished_at', finished_at) order by finished_at desc)
                          from (select * from public.mux_cleanup_jobs where status = 'failed' order by finished_at desc limit 50) f), '[]'::jsonb),
    'review', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'asset_id', asset_id, 'upload_id', upload_id, 'created_at', created_at, 'result', result) order by created_at)
                          from (select * from public.mux_cleanup_jobs where status = 'review' order by created_at limit 50) v), '[]'::jsonb),
    'purge_failures', coalesce((select jsonb_agg(jsonb_build_object('account_id', account_id, 'attempts', attempts, 'last_error', last_error, 'last_failed_at', last_failed_at))
                                  from public.account_purge_failures), '[]'::jsonb)
  );
$$;

-- A failed or skipped job back in the queue now, with its attempts reset. Its checks run again.
create or replace function public.mux_cleanup_retry(p_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.mux_cleanup_jobs
     set status = 'pending', attempts = 0, not_before = now(), last_error = null, finished_at = null, result = null
   where id = p_job and status in ('failed', 'skipped') and owner_id is not null;
  if not found then raise exception 'job_not_found' using errcode = 'P0001'; end if;
exception when unique_violation then
  raise exception 'already_queued' using errcode = 'P0001';
end;
$$;

-- Done and skipped jobs are kept 30 days, then deleted. Failed and review jobs are never deleted
-- automatically: a person resolves them.
create or replace function public.prune_mux_cleanup_jobs()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from public.mux_cleanup_jobs where status in ('done', 'skipped') and finished_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- pg_cron -> pg_net -> mux-cleanup, as for send-push: two Vault secrets (mux_cleanup_url,
-- mux_cleanup_key); the same key is the function's MUX_CLEANUP_KEY. Nothing is called while the
-- switch is off or the secrets are missing; 'drain' runs only when something is due.
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

-- ---------------------------------------------------------------------------
-- The purge (F6, F7)
-- ---------------------------------------------------------------------------

-- Removes one account past its 30 days; false if it is no longer due (restored meanwhile).
--  1. Mux: every asset of the account is queued for deletion, and unfinished uploads for
--     cancellation. The jobs hold the ids and the owner, so they outlive the rows (F7). A video
--     removed by moderation is kept until 30 days after its case closed; a case still open
--     closes now.
--  2. Its videos that other people's video replies point at, directly or through its own
--     replies, become tombstones; the comments on them go, as with any deleted response.
--  3. Its comments that other people's comments reply to become deleted-parent tombstones.
--  4. Moderation records keep only what was done, to what kind of thing, and when: actions lose
--     the account, target, moderator, reason (free text) and note; pending reviews close and
--     decided ones lose the account and who decided; reports it made lose the reporter; reports
--     about it or its content close and lose the target, the reporter and who closed them. All
--     are deleted 90 days later (prune_moderation_records).
--  5. The Auth user is deleted; the account, profile and everything else cascades.
create or replace function public.purge_account(p_account uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_videos uuid[];
  v_comments uuid[];
begin
  -- Under the row lock, so a sign-in restoring the account at the same moment waits or wins.
  perform 1 from public.accounts where id = p_account and deleted_at is not null and deleted_at < now() - interval '30 days' for update;
  if not found then return false; end if;

  -- 1.
  perform public.mux_cleanup_enqueue('delete_asset', 'account_purged', r.mux_asset_id, r.mux_upload_id, r.id, p_account,
                                     case when r.status = 'removed' then coalesce(public.moderation_case_closed_at(r.removed_action_id), v_now) + interval '30 days' end)
     from public.responses r
    where r.author_id = p_account and r.mux_asset_id is not null;
  perform public.mux_cleanup_enqueue('cancel_upload', 'account_purged', null, r.mux_upload_id, r.id, p_account)
     from public.responses r
    where r.author_id = p_account and r.mux_asset_id is null and r.mux_upload_id is not null and r.status in ('processing', 'draft', 'removed');

  -- 2.
  with recursive kept(id) as (
    select x.id from public.responses x
     where x.author_id = p_account
       and exists (select 1 from public.responses o where (o.root_response_id = x.id or o.reply_to_id = x.id) and o.author_id is distinct from p_account)
    union
    select p.id from kept k
      join public.responses c on c.id = k.id
      join public.responses p on p.id = c.root_response_id or p.id = c.reply_to_id
     where p.author_id = p_account
  )
  select coalesce(array_agg(id), '{}') into v_videos from kept;
  update public.reports set status = 'closed', closed_at = coalesce(closed_at, v_now), closed_by = 'account_purged', target_id = null, reporter_id = null, anonymized_at = v_now
   where target_kind = 'video' and target_id in (select id from public.responses where author_id = p_account);
  delete from public.comments where response_id = any (v_videos);
  delete from public.likes where target_kind = 'video' and target_id = any (v_videos);
  update public.responses
     set author_id = null, status = 'deleted', deleted_at = coalesce(deleted_at, v_now), live_at = null, caption = null,
         mux_upload_id = null, mux_asset_id = null, mux_playback_id = null, suggestion_id = null, removed_action_id = null
   where id = any (v_videos);

  -- 3. Only comments on videos that stay (others' responses); the rest go with their videos.
  with recursive kept(id) as (
    select c.id from public.comments c
     where c.author_id = p_account
       and exists (select 1 from public.responses v where v.id = c.response_id and v.author_id is distinct from p_account)
       and exists (select 1 from public.comments o where (o.parent_id = c.id or o.thread_id = c.id) and o.author_id is distinct from p_account)
    union
    select p.id from kept k
      join public.comments c on c.id = k.id
      join public.comments p on p.id = c.parent_id or p.id = c.thread_id
     where p.author_id = p_account
  )
  select coalesce(array_agg(id), '{}') into v_comments from kept;
  update public.reports set status = 'closed', closed_at = coalesce(closed_at, v_now), closed_by = 'account_purged', target_id = null, reporter_id = null, anonymized_at = v_now
   where target_kind = 'comment' and target_id in (select id from public.comments where author_id = p_account);
  delete from public.likes where target_kind = 'comment' and target_id = any (v_comments);
  update public.comments set author_id = null, body = null, deleted_at = coalesce(deleted_at, v_now), removed_action_id = null
   where id = any (v_comments);

  -- 4.
  update public.moderation_actions set account_id = null, target_id = null, moderator = null, reason = null, note = null, anonymized_at = v_now where account_id = p_account;
  delete from public.review_requests where account_id = p_account and decided_at is null;
  update public.review_requests set account_id = null, decided_by = null where account_id = p_account;
  update public.reports set reporter_id = null, anonymized_at = coalesce(anonymized_at, v_now) where reporter_id = p_account;
  update public.reports set status = 'closed', closed_at = coalesce(closed_at, v_now), closed_by = 'account_purged', target_id = null, reporter_id = null, anonymized_at = v_now
   where target_kind = 'profile' and target_id = p_account;

  -- 5.
  delete from auth.users where id = p_account;
  return true;
end;
$$;

-- Day 30, daily at 03:15 UTC. Each account in its own subtransaction: one that fails is recorded
-- in account_purge_failures and retried the next day, and never stops the others.
create or replace function public.purge_deleted_accounts()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_err text;
  n integer := 0;
begin
  for v_id in select id from public.accounts where deleted_at is not null and deleted_at < now() - interval '30 days' order by deleted_at loop
    begin
      if public.purge_account(v_id) then
        n := n + 1;
        delete from public.account_purge_failures where account_id = v_id;
      end if;
    exception when others then
      get stacked diagnostics v_err = message_text;
      insert into public.account_purge_failures (account_id, last_error) values (v_id, left(coalesce(v_err, 'error'), 500))
      on conflict (account_id) do update set attempts = account_purge_failures.attempts + 1, last_error = excluded.last_error, last_failed_at = now();
    end;
  end loop;
  return n;
end;
$$;

-- 90 days after a purge, its anonymised moderation records go.
create or replace function public.prune_moderation_records()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
  m integer;
begin
  delete from public.moderation_actions where account_id is null and coalesce(anonymized_at, created_at) < now() - interval '90 days';
  get diagnostics n = row_count;
  delete from public.reports where anonymized_at is not null and anonymized_at < now() - interval '90 days' and status = 'closed';
  get diagnostics m = row_count;
  return n + m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Existing data: videos already deleted or removed, and deleted accounts' videos, get the jobs
-- they would have had. (On the hosted project there are none: its one video is live.)
-- ---------------------------------------------------------------------------
select public.mux_cleanup_enqueue('delete_asset', 'author_deleted', r.mux_asset_id, r.mux_upload_id, r.id, r.author_id)
  from public.responses r where r.status = 'deleted' and r.mux_asset_id is not null and r.author_id is not null;
select public.mux_cleanup_enqueue('sync_playback', 'moderation_removed', r.mux_asset_id, r.mux_upload_id, r.id, r.author_id)
  from public.responses r where r.status = 'removed' and r.mux_asset_id is not null;
select public.mux_cleanup_enqueue('delete_asset', 'moderation_removed', r.mux_asset_id, r.mux_upload_id, r.id, r.author_id)
  from public.responses r where r.status = 'removed' and r.mux_asset_id is not null;
select public.mux_cleanup_enqueue('sync_playback', 'account_deleted', r.mux_asset_id, r.mux_upload_id, r.id, r.author_id)
  from public.responses r join public.accounts a on a.id = r.author_id
 where a.deleted_at is not null and r.mux_asset_id is not null and r.status in ('live', 'draft', 'processing');

-- ---------------------------------------------------------------------------
-- Schedules and privileges
-- ---------------------------------------------------------------------------
select cron.schedule('mux-cleanup', '* * * * *', $$select public.run_mux_cleanup('drain')$$);
select cron.schedule('mux-sweep', '45 4 * * *', $$select public.run_mux_cleanup('sweep')$$);
select cron.schedule('prune-moderation-records', '30 3 * * *', $$select public.prune_moderation_records()$$);
select cron.schedule('prune-mux-cleanup-jobs', '40 3 * * *', $$select public.prune_mux_cleanup_jobs()$$);

revoke execute on function public.mux_cleanup_enqueue(text, text, text, text, uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke execute on function public.mux_forget_video(uuid, text, text, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.moderation_case_closed_at(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.mux_asset_hold(text, text) from public, anon, authenticated, service_role;
revoke execute on function public.mux_playback_wanted(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.mux_sync_account_playback(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.purge_account(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.mux_cleanup_mode() from public, anon, authenticated, service_role;
revoke execute on function public.mux_video_restorable(public.responses) from public, anon, authenticated, service_role;
revoke execute on function public.mux_cleanup_claim(integer, integer) from public, anon, authenticated;
revoke execute on function public.mux_cleanup_finish(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.mux_cleanup_sweep(jsonb, integer, boolean) from public, anon, authenticated;
revoke execute on function public.mux_cleanup_check(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.mux_cleanup_set_mode(text, text) from public, anon, authenticated;
revoke execute on function public.prune_mux_cleanup_jobs() from public, anon, authenticated;
revoke execute on function public.mux_cleanup_overview() from public, anon, authenticated;
revoke execute on function public.mux_cleanup_retry(uuid) from public, anon, authenticated;
revoke execute on function public.run_mux_cleanup(text) from public, anon, authenticated;
revoke execute on function public.purge_deleted_accounts() from public, anon, authenticated;
revoke execute on function public.prune_moderation_records() from public, anon, authenticated;
grant execute on function public.mux_cleanup_claim(integer, integer) to service_role;
grant execute on function public.mux_cleanup_finish(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.mux_cleanup_sweep(jsonb, integer, boolean) to service_role;
grant execute on function public.mux_cleanup_check(uuid, uuid) to service_role;
grant execute on function public.mux_cleanup_set_mode(text, text) to service_role;
grant execute on function public.mux_cleanup_overview() to service_role;
grant execute on function public.mux_cleanup_retry(uuid) to service_role;
-- Re-created above with create or replace: their grants are unchanged (members: delete_video,
-- abandon_response, discard_draft, post_draft, retry_response_upload, delete_account,
-- get_onboarding_state; service role: mark_response_live, mod_*; video_visible: internal).
