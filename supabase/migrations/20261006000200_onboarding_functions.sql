-- Onboarding and account functions (SPEC.md Sections 9, 13, 14).
-- All functions derive the acting user from auth.uid(); none accepts a user id.
-- Status values are returned as text so the app can show the approved state.

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------

create or replace function public.has_profile(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_account);
$$;

create or replace function public.has_beta_access(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.invites where redeemed_by = p_account)
      or exists (select 1 from public.waitlist where account_id = p_account and admitted_at is not null);
$$;

create or replace function public.normalise_invite_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9-]', '', 'g'));
$$;

create or replace function public.username_status(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_username is null or p_username !~ '^[a-z0-9._]{3,24}$' then 'invalid'
    when exists (select 1 from public.profiles where username = p_username) then 'taken'
    else 'available'
  end;
$$;

comment on function public.username_status is 'available | taken | invalid. Used for the live check on O-Profile.';

-- ---------------------------------------------------------------------------
-- get_onboarding_state: everything the app needs to pick the next screen.
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
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select * into v_account from public.accounts where id = v_uid;
  if not found then
    -- The auth trigger normally creates this row; recover if it is missing.
    insert into public.accounts (id) values (v_uid) returning * into v_account;
  end if;

  select * into v_config from public.app_config;
  select email into v_email from auth.users where id = v_uid;
  select * into v_profile from public.profiles where id = v_uid;
  v_waitlisted := exists (select 1 from public.waitlist where account_id = v_uid and admitted_at is null);

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
    ) end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_age: A-Age "Yes, I'm 18 or older".
-- ---------------------------------------------------------------------------

create or replace function public.confirm_age()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  insert into public.accounts (id, age_confirmed_at) values (v_uid, now())
  on conflict (id) do update set age_confirmed_at = coalesce(public.accounts.age_confirmed_at, now());
end;
$$;

-- ---------------------------------------------------------------------------
-- check_invite: live validation while typing on O-Invite.
-- Returns status valid | not_found | expired | used, plus the inviter's name
-- and photo when the code exists.
-- ---------------------------------------------------------------------------

create or replace function public.invite_lookup(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code text := public.normalise_invite_code(p_code);
  v_invite public.invites%rowtype;
  v_inviter public.profiles%rowtype;
  v_status text;
begin
  select * into v_invite from public.invites where code = v_code;
  if not found or v_invite.cancelled_at is not null then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_invite.redeemed_at is not null then
    v_status := 'used';
  elsif v_invite.expires_at <= now() then
    v_status := 'expired';
  else
    v_status := 'valid';
  end if;

  if v_invite.inviter_id is not null then
    select * into v_inviter from public.profiles where id = v_invite.inviter_id;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'cohort', v_invite.cohort,
    'inviter_name', v_inviter.name,
    'inviter_first_name', split_part(v_inviter.name, ' ', 1),
    'inviter_photo_path', v_inviter.photo_path
  );
end;
$$;

create or replace function public.check_invite(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  return public.invite_lookup(p_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- redeem_invite: Continue on O-Invite. Single use, atomic.
-- ---------------------------------------------------------------------------

create or replace function public.redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := public.normalise_invite_code(p_code);
  v_invite public.invites%rowtype;
  v_account public.accounts%rowtype;
  v_lookup jsonb;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select * into v_account from public.accounts where id = v_uid for update;
  if v_account.age_confirmed_at is null then
    raise exception 'age_not_confirmed' using errcode = 'P0001';
  end if;
  if public.has_beta_access(v_uid) then
    return jsonb_build_object('status', 'already_in');
  end if;

  select * into v_invite from public.invites where code = v_code for update;
  v_lookup := public.invite_lookup(v_code);
  if v_lookup->>'status' <> 'valid' then
    return v_lookup;
  end if;

  update public.invites
     set redeemed_by = v_uid, redeemed_at = now()
   where id = v_invite.id;

  update public.accounts set beta_cohort = v_invite.cohort where id = v_uid;

  return v_lookup;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_waitlist: "Join waitlist" on O-Invite / W-Invalid.
-- ---------------------------------------------------------------------------

create or replace function public.join_waitlist()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_account public.accounts%rowtype;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into v_account from public.accounts where id = v_uid;
  if v_account.age_confirmed_at is null then
    raise exception 'age_not_confirmed' using errcode = 'P0001';
  end if;
  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    raise exception 'email_required' using errcode = 'P0001';
  end if;
  insert into public.waitlist (account_id, email) values (v_uid, v_email)
  on conflict (account_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- username_suggestions: three available usernames built from the name
-- (E-Username: "@lena is taken. Try one of these:").
-- ---------------------------------------------------------------------------

create or replace function public.username_suggestions(p_name text, p_username text)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_first text;
  v_last text;
  v_candidates text[] := '{}';
  v_result text[] := '{}';
  v_base text;
  v_c text;
  i integer;
begin
  v_parts := regexp_split_to_array(lower(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9 ]', '', 'g')), '\s+');
  v_parts := array_remove(v_parts, '');
  v_first := coalesce(v_parts[1], '');
  v_last := coalesce(v_parts[array_length(v_parts, 1)], '');
  v_base := coalesce(nullif(regexp_replace(lower(coalesce(p_username, '')), '[^a-z0-9._]', '', 'g'), ''), v_first);

  if array_length(v_parts, 1) >= 2 then
    v_candidates := v_candidates || (v_first || v_last);
    v_candidates := v_candidates || (v_first || '.' || v_last);
    v_candidates := v_candidates || (v_first || '_' || left(v_last, 1));
    v_candidates := v_candidates || (v_first || '_' || v_last);
    v_candidates := v_candidates || (left(v_first, 1) || v_last);
  end if;
  v_candidates := v_candidates || (v_base || '_');
  v_candidates := v_candidates || (v_base || '.' || v_first);
  for i in 1..99 loop
    v_candidates := v_candidates || (v_base || i::text);
  end loop;

  foreach v_c in array v_candidates loop
    exit when array_length(v_result, 1) >= 3;
    if v_c <> coalesce(p_username, '')
       and not (v_c = any (v_result))
       and public.username_status(v_c) = 'available' then
      v_result := v_result || v_c;
    end if;
  end loop;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_profile: Continue on O-Profile. Enforces the account rules server-side.
-- ---------------------------------------------------------------------------

create or replace function public.create_profile(p_name text, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_account public.accounts%rowtype;
  v_config public.app_config%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_profile public.profiles%rowtype;
  v_waitlist public.waitlist%rowtype;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select * into v_account from public.accounts where id = v_uid for update;
  if v_account.age_confirmed_at is null then
    raise exception 'age_not_confirmed' using errcode = 'P0001';
  end if;

  select * into v_config from public.app_config;
  if v_config.invite_required and not public.has_beta_access(v_uid) then
    raise exception 'beta_access_required' using errcode = 'P0001';
  end if;

  if public.has_profile(v_uid) then
    raise exception 'profile_exists' using errcode = 'P0001';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if v_username !~ '^[a-z0-9._]{3,24}$' then
    raise exception 'invalid_username' using errcode = 'P0001';
  end if;

  -- The cohort comes from the invite or the waitlist admission.
  if v_account.beta_cohort is null then
    select * into v_waitlist from public.waitlist where account_id = v_uid and admitted_at is not null;
    if found then
      update public.accounts set beta_cohort = v_waitlist.admitted_cohort where id = v_uid;
    end if;
  end if;

  begin
    insert into public.profiles (id, name, username)
    values (v_uid, v_name, v_username)
    returning * into v_profile;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'name', v_profile.name,
    'username', v_profile.username,
    'photo_path', v_profile.photo_path
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- set_profile_photo: O-Photo. The path must be inside the person's own folder.
-- ---------------------------------------------------------------------------

create or replace function public.set_profile_photo(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> v_uid::text then
    raise exception 'invalid_photo_path' using errcode = 'P0001';
  end if;
  update public.profiles set photo_path = p_path where id = v_uid;
  if not found then
    raise exception 'profile_required' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Team-only functions (service role). Not callable through the app.
-- ---------------------------------------------------------------------------

create or replace function public.team_create_invite(
  p_code text default null,
  p_cohort text default 'canggu',
  p_inviter uuid default null,
  p_valid_days integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_days integer;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_suffix text;
  i integer;
begin
  select coalesce(p_valid_days, invite_valid_days) into v_days from public.app_config;
  if p_code is not null then
    v_code := public.normalise_invite_code(p_code);
  else
    v_suffix := '';
    for i in 1..3 loop
      v_suffix := v_suffix || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;
    v_code := 'SC-' || v_suffix;
  end if;
  insert into public.invites (code, cohort, inviter_id, expires_at)
  values (v_code, p_cohort, p_inviter, now() + make_interval(days => v_days));
  return v_code;
end;
$$;

create or replace function public.team_admit_from_waitlist(p_account uuid, p_cohort text default 'canggu')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.waitlist
     set admitted_at = now(), admitted_cohort = p_cohort
   where account_id = p_account and admitted_at is null;
  if not found then
    raise exception 'waitlist_entry_not_found' using errcode = 'P0001';
  end if;
  update public.accounts set beta_cohort = p_cohort where id = p_account;
end;
$$;

-- signin_providers_for_email: used by the auth-signin-method Edge Function
-- (E-Linked). Service role only.
create or replace function public.signin_providers_for_email(p_email text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct i.provider order by i.provider), '{}')
    from auth.users u
    join auth.identities i on i.user_id = u.id
   where lower(u.email) = lower(btrim(p_email));
$$;

-- ---------------------------------------------------------------------------
-- Privileges: app functions for signed-in users only; team functions for the
-- service role only.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.get_onboarding_state() to authenticated;
grant execute on function public.confirm_age() to authenticated;
grant execute on function public.check_invite(text) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.join_waitlist() to authenticated;
grant execute on function public.username_status(text) to authenticated;
grant execute on function public.username_suggestions(text, text) to authenticated;
grant execute on function public.create_profile(text, text) to authenticated;
grant execute on function public.set_profile_photo(text) to authenticated;

-- Internal helpers are only reached through the functions above and policies.
revoke execute on function public.has_profile(uuid) from public, anon, authenticated;
grant execute on function public.has_profile(uuid) to authenticated;

-- Make the same rule the default for functions created later.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
