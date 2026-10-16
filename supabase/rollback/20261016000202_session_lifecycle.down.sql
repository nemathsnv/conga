-- Rollback of 20261016000202_session_lifecycle.sql. Reopens L1 to L4 (see the migration).
-- Run as postgres, in one transaction, then:
--   delete from supabase_migrations.schema_migrations where version = '20261016000202';
-- Sessions that delete_account already ended stay ended (nothing to restore); those people sign
-- in again.

drop policy "avatars: insert into your own folder" on storage.objects;
create policy "avatars: insert into your own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.has_profile((select auth.uid()))
  );

drop policy "avatars: update your own folder" on storage.objects;
create policy "avatars: update your own folder"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The three functions exactly as they were before the migration (pg_get_functiondef on a local
-- stack built from the earlier migrations). Grants are kept by create or replace.
CREATE OR REPLACE FUNCTION public.delete_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_onboarding_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.pre_request()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if public.suspended_allowed_path(v_path) then return; end if;
  if exists (select 1 from public.accounts a where a.id = v_uid and a.moderation_status = 'suspended') then
    raise exception 'suspended' using errcode = 'P0001', hint = 'This account is suspended.';
  end if;
end;
$function$;

drop function public.avatar_write_allowed();
drop function public.session_is_current();
drop function public.jwt_signed_in_at();
