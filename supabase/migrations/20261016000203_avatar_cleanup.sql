-- Account lifecycle audit (16 Oct), L5: profile photos were never deleted.
--
-- The avatars bucket is public (anyone can read an object whose path they know; the path is
-- <account id>/avatar-<ms>.jpg). Nothing ever removed an object: replacing or removing a photo
-- (set_profile_photo) only changed profiles.photo_path, and the day-30 purge removes the Auth user
-- and its rows but not Storage objects. So a purged person's photos stayed publicly readable, and so
-- did every photo anyone had ever replaced. SPEC.md Section 18: permanent deletion after day 30.
--
-- The database cannot delete the files itself: Supabase refuses DELETE on storage.objects outside
-- the Storage API (trigger storage.protect_delete), and removing the row would leave the file in
-- the storage backend anyway. So the database queues the object names here, in the same
-- transaction as the change, and the avatar-cleanup Edge Function removes them through the Storage
-- API with the service role:
--   - a photo replaced or removed: the old object, and any other object in the person's folder
--     older than an hour that is not their photo (uploads whose set_profile_photo never came);
--   - an account removed however it happens (the purge, or the Auth user deleted in the Dashboard
--     or Admin API; accounts cascades from auth.users): every object in its folder.
-- During the 30-day window nothing is queued: signing back in restores the photo with the rest.
-- Just before removing, the worker asks again (avatar_cleanup_due): a name that is some profile's
-- photo_path again is never handed out.
--
-- Scheduling is the send-push pattern: pg_cron every 10 minutes calls run_avatar_cleanup(), which
-- does nothing until two Vault secrets exist (avatar_cleanup_url, avatar_cleanup_key); the same key
-- is the function's AVATAR_CLEANUP_KEY secret. Nothing is removed on the hosted project until
-- those are set (docs/release/SECURITY.md).

create table public.avatar_removals (
  name text primary key,
  account_id uuid,
  reason text not null check (reason in ('replaced', 'stray', 'account_removed')),
  queued_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text,
  done_at timestamptz
);
alter table public.avatar_removals enable row level security;
revoke all on public.avatar_removals from anon, authenticated;
create index avatar_removals_due_idx on public.avatar_removals (queued_at) where done_at is null;

-- Queues an object name (idempotent; a name queued again after it was done is queued afresh).
create or replace function public.queue_avatar_removal(p_name text, p_account uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.avatar_removals (name, account_id, reason)
  values (p_name, p_account, p_reason)
  on conflict (name) do update
    set reason = excluded.reason, queued_at = now(), done_at = null, attempts = 0, last_error = null
    where public.avatar_removals.done_at is not null;
$$;

-- A photo replaced or removed.
create or replace function public.profiles_queue_old_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.photo_path is not null and old.photo_path is distinct from new.photo_path then
    perform public.queue_avatar_removal(old.photo_path, new.id, 'replaced');
  end if;
  perform public.queue_avatar_removal(o.name, new.id, 'stray')
     from storage.objects o
    where o.bucket_id = 'avatars' and (storage.foldername(o.name))[1] = new.id::text
      and o.name is distinct from new.photo_path and o.name is distinct from old.photo_path
      and o.created_at < now() - interval '1 hour';
  return new;
end;
$$;

create trigger profiles_queue_old_avatar
  after update of photo_path on public.profiles
  for each row
  when (old.photo_path is distinct from new.photo_path)
  execute function public.profiles_queue_old_avatar();

-- An account removed, however it happens.
create or replace function public.accounts_queue_avatar_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.queue_avatar_removal(o.name, old.id, 'account_removed')
     from storage.objects o
    where o.bucket_id = 'avatars' and (storage.foldername(o.name))[1] = old.id::text;
  return old;
end;
$$;

create trigger accounts_queue_avatar_removal
  before delete on public.accounts
  for each row execute function public.accounts_queue_avatar_removal();

-- The worker's side (service role only).
create or replace function public.avatar_cleanup_due(p_limit integer default 100)
returns text[]
language sql
security definer
set search_path = ''
as $$
  select coalesce(array_agg(x.name order by x.queued_at, x.name), '{}')
    from (select r.name, r.queued_at from public.avatar_removals r
           where r.done_at is null and r.attempts < 10
             and not exists (select 1 from public.profiles p where p.photo_path = r.name)
           order by r.queued_at, r.name
           limit greatest(1, least(p_limit, 500))) x;
$$;

-- What the Storage API answered: removed names are done (a name it no longer has counts as removed);
-- the others are tried again, at most ten times.
create or replace function public.avatar_cleanup_finish(p_removed text[], p_failed text[] default '{}', p_error text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.avatar_removals set done_at = now(), last_error = null
   where name = any (coalesce(p_removed, '{}')) and done_at is null;
  get diagnostics n = row_count;
  update public.avatar_removals set attempts = attempts + 1, last_error = left(coalesce(p_error, 'failed'), 500)
   where name = any (coalesce(p_failed, '{}')) and done_at is null;
  delete from public.avatar_removals where done_at < now() - interval '30 days';
  return n;
end;
$$;

create or replace function public.run_avatar_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'avatar_cleanup_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'avatar_cleanup_key';
  if v_url is null or v_key is null then return; end if;
  if cardinality(public.avatar_cleanup_due(1)) = 0 then return; end if;
  perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key), body := '{}'::jsonb);
end;
$$;

revoke execute on function public.queue_avatar_removal(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.profiles_queue_old_avatar() from public, anon, authenticated;
revoke execute on function public.accounts_queue_avatar_removal() from public, anon, authenticated;
revoke execute on function public.avatar_cleanup_due(integer) from public, anon, authenticated;
revoke execute on function public.avatar_cleanup_finish(text[], text[], text) from public, anon, authenticated;
revoke execute on function public.run_avatar_cleanup() from public, anon, authenticated;
grant execute on function public.avatar_cleanup_due(integer) to service_role;
grant execute on function public.avatar_cleanup_finish(text[], text[], text) to service_role;

select cron.schedule('avatar-cleanup', '*/10 * * * *', 'select public.run_avatar_cleanup()');
