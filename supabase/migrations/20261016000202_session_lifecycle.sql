-- Account lifecycle audit (16 Oct), L1 to L4: sessions outlived the actions meant to end them.
-- SPEC.md Section 18: "Signing back in during those 30 days restores everything"; deleting is
-- confirmed "with the same sign-in method first". DECISIONS 8 Oct: suspension is enforced on
-- every product API path.
--
-- Reproduced on the local stack before this migration:
--   L1 delete_account left every session alive. Refresh tokens kept working on every phone the
--      person was signed in on, and the next get_onboarding_state call from any of them (the app
--      makes one at every launch) cancelled the deletion, without anyone signing in again.
--   L2 get_onboarding_state restored on any call in the window, so L1 needed no new sign-in.
--   L3 delete_account's "signed in within ten minutes" check read the token's iat, which every
--      refresh renews: any session refreshed in the last ten minutes could delete the account
--      without confirming the sign-in method.
--   L4 a token stayed valid for the product API after its session was signed out or removed, until
--      it expired (up to an hour, jwt_expiry), and Storage accepted avatar uploads from suspended
--      accounts and accounts in their deletion window (Storage does not go through pre_request).
--
-- Now:
--   - delete_account needs a sign-in (the token's amr time, which a refresh keeps) from the last
--     ten minutes, and ends every session of the account (auth.sessions; refresh tokens cascade).
--   - get_onboarding_state cancels a deletion only for a session that began after it.
--   - pre_request refuses a token whose session no longer exists ('session_revoked', 42501), so
--     signing out everywhere, deleting the account and the purge take effect at once.
--   - Avatar uploads need an account that is neither suspended nor deleted, on a current session.
-- Needs the postgres role to read and delete auth.sessions (true locally; check on the hosted
-- project before deploying: docs/release/SECURITY.md, deployment order).

-- ---------------------------------------------------------------------------
-- Helpers. Both read only the caller's own token; neither takes an argument.
-- ---------------------------------------------------------------------------

-- When the session behind this token signed in: the newest amr timestamp. A refresh keeps amr;
-- iat changes with every refresh. Null when the token has no timestamped amr entry.
create or replace function public.jwt_signed_in_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select to_timestamp(max((e->>'timestamp')::bigint))
    from jsonb_array_elements(case when jsonb_typeof(auth.jwt()->'amr') = 'array' then auth.jwt()->'amr' else '[]'::jsonb end) e
   where jsonb_typeof(e) = 'object' and (e->>'timestamp') ~ '^[0-9]{1,12}$';
$$;

-- False when the token names a session that Auth no longer has (signed out, account deleted or
-- purged). Tokens without a session_id claim (none that Auth issues) are not judged here.
create or replace function public.session_is_current()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sid text := auth.jwt()->>'session_id';
begin
  if coalesce(v_sid, '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return true;
  end if;
  return exists (select 1 from auth.sessions s where s.id = v_sid::uuid and s.user_id = auth.uid());
end;
$$;

-- When this token's session began: auth.sessions.created_at (microseconds), else the amr time
-- (whole seconds). Used to tell a sign-in after a deletion from one just before it, which can fall
-- in the same second (the confirming sign-in, then Delete).
create or replace function public.session_started_at()
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sid text := auth.jwt()->>'session_id';
  v_at timestamptz;
begin
  if coalesce(v_sid, '') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    select s.created_at into v_at from auth.sessions s where s.id = v_sid::uuid and s.user_id = auth.uid();
  end if;
  return coalesce(v_at, public.jwt_signed_in_at());
end;
$$;

revoke execute on function public.jwt_signed_in_at() from public, anon, authenticated;
revoke execute on function public.session_started_at() from public, anon, authenticated;
revoke execute on function public.session_is_current() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- L4: the product API gate. Same as 20261010000300_auth_hardening.sql plus the session check,
-- which comes before the suspended paths: a signed-out session cannot even read its state.
-- ---------------------------------------------------------------------------
create or replace function public.pre_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if v_uid is null then return; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) e
     where (case jsonb_typeof(e) when 'string' then e #>> '{}' else e->>'method' end) = 'password'
  ) then
    raise exception 'password_session' using errcode = '42501';
  end if;
  if not public.session_is_current() then
    raise exception 'session_revoked' using errcode = '42501';
  end if;
  if public.suspended_allowed_path(v_path) then return; end if;
  if exists (select 1 from public.accounts a where a.id = v_uid and a.moderation_status = 'suspended') then
    raise exception 'suspended' using errcode = 'P0001', hint = 'This account is suspended.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- L1, L3. Same as 20261012000200_video_deletion_cleanup.sql except the sign-in check and the
-- session removal.
-- ---------------------------------------------------------------------------
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_signed_in_at timestamptz := public.jwt_signed_in_at();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if v_signed_in_at is null or v_signed_in_at < now() - interval '600 seconds' then
    raise exception 'reauth_required' using errcode = 'P0001';
  end if;
  update public.accounts set deleted_at = now() where id = v_uid;
  delete from public.push_tokens where account_id = v_uid;
  delete from public.push_outbox where recipient_id = v_uid and sent_at is null;
  perform public.mux_sync_account_playback(v_uid, 'account_deleted');
  -- Every phone is signed out: refresh tokens go with their sessions, and pre_request refuses
  -- the access tokens still in hand. Only a new sign-in can cancel the deletion.
  delete from auth.sessions where user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- L2. Same as 20261012000200_video_deletion_cleanup.sql except the restore condition.
-- ---------------------------------------------------------------------------
create or replace function public.get_onboarding_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  -- Signing back in during the window restores everything; a session from before the deletion
  -- does not (it began before deleted_at; deletion also ended it, so the API refuses it anyway).
  if v_account.deleted_at is not null and v_account.deleted_at > now() - interval '30 days'
     and public.session_started_at() > v_account.deleted_at then
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
-- L4: avatar writes (Storage runs these policies as the caller, without pre_request).
-- ---------------------------------------------------------------------------
create or replace function public.avatar_write_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.session_is_current()
     and exists (select 1 from public.profiles p join public.accounts a on a.id = p.id
                  where p.id = auth.uid() and a.deleted_at is null and a.moderation_status <> 'suspended');
$$;
revoke execute on function public.avatar_write_allowed() from public, anon, authenticated;
grant execute on function public.avatar_write_allowed() to authenticated;

drop policy "avatars: insert into your own folder" on storage.objects;
create policy "avatars: insert into your own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.avatar_write_allowed()
  );

drop policy "avatars: update your own folder" on storage.objects;
create policy "avatars: update your own folder"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.avatar_write_allowed()
  );
