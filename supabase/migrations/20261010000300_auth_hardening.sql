-- Email sign-in hardening. SPEC.md Section 13: "No passwords"; Section 18: one sign-in method per
-- account, no linking.
--
-- Supabase Auth's email provider also serves password sign-up and password sign-in on the public
-- API, which the app never uses. Reproduced on the local stack (scripts/auth-integration.mjs,
-- PHASE=before): someone signs up another person's address with their own password; once that
-- person confirms with an email code, the password signs into their account. A signed-in session
-- can also add a password through the Auth API. Separately, an email code signs into an account
-- that uses Apple or Google, because Auth adds no identity for it, so the
-- refuse_second_signin_method trigger never runs.
--
-- Three layers:
--   1. no password is ever stored (trigger on auth.users);
--   2. no access token is issued, on sign-in or on refresh, for a session that used a password,
--      and an email code cannot open an account that signs in with Apple or Google (the custom
--      access token hook, enabled in config.toml as [auth.hook.custom_access_token]);
--   3. the product API refuses any token whose session used a password (pre_request), which also
--      covers access tokens issued before the hook was enabled.
-- The hook must exist before it is enabled in Auth: enabling it first makes every sign-in fail.

-- ---------------------------------------------------------------------------
-- 1. No stored passwords.
-- ---------------------------------------------------------------------------
create or replace function public.discard_auth_password()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.encrypted_password := null;
  return new;
end;
$$;

create trigger discard_auth_password
  before insert or update of encrypted_password on auth.users
  for each row
  when (coalesce(new.encrypted_password, '') <> '')
  execute function public.discard_auth_password();

-- ---------------------------------------------------------------------------
-- 2. Custom access token hook. Auth calls it as supabase_auth_admin for every access token,
--    refreshes included; on a refresh, claims.amr still lists how the session signed in.
--    Email codes of every kind are issued as 'otp'; Apple and Google (native or web) as 'oauth'.
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (event->>'user_id')::uuid;
  v_methods text[];
  v_other text;
begin
  select coalesce(array_agg(distinct m), '{}') into v_methods
    from (
      select event->>'authentication_method' as m
      union all
      select case jsonb_typeof(e) when 'string' then e #>> '{}' else e->>'method' end
        from jsonb_array_elements(coalesce(event->'claims'->'amr', '[]'::jsonb)) e
    ) s
   where m is not null;

  if 'password' = any (v_methods) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'password_sign_in_disabled'));
  end if;

  if v_methods && array['otp', 'magiclink', 'email/signup', 'recovery', 'invite', 'email_change'] then
    select i.provider into v_other
      from auth.identities i
     where i.user_id = v_user and i.provider in ('apple', 'google')
       and not exists (select 1 from auth.identities e where e.user_id = v_user and e.provider = 'email')
     order by i.provider
     limit 1;
    if v_other is not null then
      return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'signin_method_conflict:' || v_other));
    end if;
  end if;

  return jsonb_build_object('claims', event->'claims');
end;
$$;

grant usage on schema public to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.discard_auth_password() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The product API gate (pre_request, 20261008000200_safety_fixes.sql) also refuses a token
--    whose session used a password. Grants on pre_request are kept by create or replace.
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
  if public.suspended_allowed_path(v_path) then return; end if;
  if exists (select 1 from public.accounts a where a.id = v_uid and a.moderation_status = 'suspended') then
    raise exception 'suspended' using errcode = 'P0001', hint = 'This account is suspended.';
  end if;
end;
$$;
