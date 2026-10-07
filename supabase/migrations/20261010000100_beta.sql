-- Phase 7: beta readiness (SPEC.md Section 23, item 7).
--   1. Analytics events (Section 21) in our own table: no SDK, nothing leaves Supabase
--      (Section 22 "Analytics", Section 2 "no ads or tracking SDKs").
--   2. Members' invites (Section 14, board S-Invites): a personal invite link per member,
--      "4 of 5 left", sent invites (joined, or opened and not yet joined), Cancel returns one.
-- Every function derives the acting person from auth.uid(). Grants are explicit at the end.

-- ---------------------------------------------------------------------------
-- 1. Analytics
-- ---------------------------------------------------------------------------

-- The anonymous user id every event carries: random, never the account id.
alter table public.accounts add column analytics_id uuid not null default gen_random_uuid();
create unique index accounts_analytics_id_key on public.accounts (analytics_id);
comment on column public.accounts.analytics_id is 'Anonymous id on analytics events (SPEC.md Section 21). Never joined to a person in the events table.';

create table public.analytics_events (
  id bigint generated always as identity primary key,
  anon_id uuid not null,
  cohort text,
  platform text not null check (platform in ('ios', 'android', 'web', 'server')),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  name text not null check (name ~ '^[a-z][a-z0-9_]{2,40}$'),
  props jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object'),
  client_ts timestamptz,
  received_at timestamptz not null default now()
);
comment on table public.analytics_events is 'Product events (SPEC.md Section 21). Team-only; no email, name or username ever lands here.';
create index analytics_events_name_received_idx on public.analytics_events (name, received_at);
create index analytics_events_anon_idx on public.analytics_events (anon_id, received_at);

-- No policies and no table privileges: only the service role reads or writes directly.
alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from public, anon, authenticated;

-- Internal: one event for an account, written by the server itself.
create or replace function public.log_server_event(p_account uuid, p_name text, p_props jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.accounts%rowtype;
begin
  select * into a from public.accounts where id = p_account;
  if not found then return; end if;
  insert into public.analytics_events (anon_id, cohort, platform, name, props, client_ts)
  values (a.analytics_id, a.beta_cohort, 'server', p_name, coalesce(p_props, '{}'::jsonb), now());
end;
$$;

-- The app sends a batch: [{name, props, ts}]. At most 200 per call; bad rows are skipped.
create or replace function public.track_events(p_platform text, p_app_version text, p_events jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  a public.accounts%rowtype;
  e jsonb;
  v_ts timestamptz;
  n integer := 0;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_platform not in ('ios', 'android', 'web') then
    raise exception 'bad_platform' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 200 then
    raise exception 'bad_batch' using errcode = 'P0001';
  end if;
  select * into a from public.accounts where id = v_uid;
  for e in select * from jsonb_array_elements(p_events) loop
    if jsonb_typeof(e) <> 'object' or (e->>'name') !~ '^[a-z][a-z0-9_]{2,40}$' then
      continue;
    end if;
    -- A bad timestamp is dropped; the event is kept.
    begin
      v_ts := case when e ? 'ts' then (e->>'ts')::timestamptz else null end;
    exception when others then
      v_ts := null;
    end;
    insert into public.analytics_events (anon_id, cohort, platform, app_version, name, props, client_ts)
    values (
      a.analytics_id, a.beta_cohort, p_platform, left(p_app_version, 40), e->>'name',
      case when jsonb_typeof(e->'props') = 'object' then e->'props' else '{}'::jsonb end,
      v_ts
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- suggestion_reviewed is a moderator decision, so the server writes it (Section 21).
create or replace function public.suggestion_reviewed_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('live', 'not_published') and new.status is distinct from old.status then
    perform public.log_server_event(new.author_id, 'suggestion_reviewed', jsonb_build_object(
      'outcome', case when new.status = 'live' then 'approved' else 'declined' end,
      'reason', new.decline_reason,
      'scope', case when new.place_id is null then 'global' else 'place' end,
      'attribution', new.attribution));
  end if;
  return new;
end;
$$;
create trigger suggestions_reviewed_event
  after update of status on public.suggestions
  for each row execute function public.suggestion_reviewed_event();

-- account_deletion_cancelled: signing back in within 30 days restores the account (Section 18);
-- the restore happens server-side, so the server writes the event.
create or replace function public.account_restored_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.deleted_at is not null and new.deleted_at is null then
    perform public.log_server_event(new.id, 'account_deletion_cancelled', jsonb_build_object('target_type', 'account'));
  end if;
  return new;
end;
$$;
create trigger accounts_restored_event
  after update of deleted_at on public.accounts
  for each row execute function public.account_restored_event();

-- ---------------------------------------------------------------------------
-- 2. Members' invites (Section 14, S-Invites)
--
-- A member has one personal code (a readable link, shortcut.app/i/<code>). When someone opens
-- it and signs in, one of the member's invites is taken for invite_valid_days ("Link opened,
-- not joined yet"); creating a profile makes it "Joined"; an unfinished one expires back to the
-- member; Cancel on an unused one returns it. Team-created codes with an inviter count the same
-- way. Limits come from app_config and change without an app update.
-- ---------------------------------------------------------------------------

alter table public.accounts add column invite_code text unique
  check (invite_code is null or invite_code ~ '^[A-Z0-9]{2,12}-[A-Z0-9]{2,8}$');
comment on column public.accounts.invite_code is 'The member''s personal invite code (S-Invites). Made on first use.';

-- The letters of the first name plus four readable characters, e.g. LENA-4F9K.
create or replace function public.ensure_invite_code(p_account uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_stem text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_suffix text;
  i integer;
begin
  select invite_code into v_code from public.accounts where id = p_account;
  if v_code is not null then return v_code; end if;
  select upper(regexp_replace(split_part(name, ' ', 1), '[^A-Za-z0-9]', '', 'g')) into v_stem from public.profiles where id = p_account;
  v_stem := left(coalesce(nullif(v_stem, ''), 'SC'), 8);
  if char_length(v_stem) < 2 then v_stem := 'SC'; end if;
  for attempt in 1..20 loop
    v_suffix := '';
    for i in 1..4 loop
      v_suffix := v_suffix || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;
    v_code := v_stem || '-' || v_suffix;
    exit when not exists (select 1 from public.accounts where invite_code = v_code)
         and not exists (select 1 from public.invites where code = v_code);
    v_code := null;
  end loop;
  if v_code is null then
    raise exception 'code_space_exhausted' using errcode = 'P0001';
  end if;
  update public.accounts set invite_code = v_code where id = p_account;
  return v_code;
end;
$$;

-- An invite counts against its inviter while it is live: not cancelled, and either joined
-- (the invitee has a profile) or not yet expired.
create or replace function public.invite_counts(p_account uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_account);
$$;

create or replace function public.invites_left(p_account uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(0,
    (select invites_per_member from public.app_config)
    - (select count(*)::integer from public.invites i
        where i.inviter_id = p_account and i.cancelled_at is null
          and (i.expires_at > now() or (i.redeemed_by is not null and public.invite_counts(i.redeemed_by)))));
$$;

-- Access lasts while the invite stands: not cancelled, and joined or not yet expired.
create or replace function public.has_beta_access(p_account uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.invites i
                  where i.redeemed_by = p_account and i.cancelled_at is null
                    and (i.expires_at > now() or exists (select 1 from public.profiles where id = p_account)))
      or exists (select 1 from public.waitlist where account_id = p_account and admitted_at is not null);
$$;

-- A personal code's owner, when the code can still be used.
create or replace function public.personal_invite_owner(p_code text)
returns uuid language sql stable security definer set search_path = '' as $$
  select a.id from public.accounts a
   join public.profiles p on p.id = a.id
   where a.invite_code = p_code and a.deleted_at is null and a.moderation_status <> 'suspended' and a.beta_cohort is not null;
$$;

create or replace function public.invite_lookup(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_code text := public.normalise_invite_code(p_code);
  v_invite public.invites%rowtype;
  v_inviter public.profiles%rowtype;
  v_owner uuid;
  v_status text;
  v_cohort text;
begin
  select * into v_invite from public.invites where code = v_code;
  if found then
    if v_invite.cancelled_at is not null then
      return jsonb_build_object('status', 'not_found');
    end if;
    if v_invite.redeemed_at is not null then
      v_status := 'used';
    elsif v_invite.expires_at <= now() then
      v_status := 'expired';
    else
      v_status := 'valid';
    end if;
    v_cohort := v_invite.cohort;
    if v_invite.inviter_id is not null then
      select * into v_inviter from public.profiles where id = v_invite.inviter_id;
    end if;
  else
    v_owner := public.personal_invite_owner(v_code);
    if v_owner is null then
      return jsonb_build_object('status', 'not_found');
    end if;
    v_status := case when public.invites_left(v_owner) > 0 then 'valid' else 'used' end;
    select beta_cohort into v_cohort from public.accounts where id = v_owner;
    select * into v_inviter from public.profiles where id = v_owner;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'cohort', v_cohort,
    'inviter_name', v_inviter.name,
    'inviter_first_name', split_part(v_inviter.name, ' ', 1),
    'inviter_photo_path', v_inviter.photo_path
  );
end;
$$;

create or replace function public.redeem_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code text := public.normalise_invite_code(p_code);
  v_invite public.invites%rowtype;
  v_account public.accounts%rowtype;
  v_lookup jsonb;
  v_owner uuid;
  v_days integer;
  v_child text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_suffix text;
  i integer;
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

  v_lookup := public.invite_lookup(v_code);
  if v_lookup->>'status' <> 'valid' then
    return v_lookup;
  end if;

  -- An earlier invite of this person that was cancelled or expired before they joined no longer
  -- holds them; it keeps its cancelled mark, and the new one takes its place.
  update public.invites set redeemed_by = null, redeemed_at = null
   where redeemed_by = v_uid and (cancelled_at is not null or expires_at <= now());

  select * into v_invite from public.invites where code = v_code for update;
  if found then
    update public.invites set redeemed_by = v_uid, redeemed_at = now() where id = v_invite.id;
  else
    -- A personal code: one of the owner's invites becomes a row for this person.
    v_owner := public.personal_invite_owner(v_code);
    perform 1 from public.accounts where id = v_owner for update;
    if public.invites_left(v_owner) <= 0 then
      return jsonb_build_object('status', 'used');
    end if;
    select invite_valid_days into v_days from public.app_config;
    for attempt in 1..20 loop
      v_suffix := '';
      for i in 1..6 loop
        v_suffix := v_suffix || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
      end loop;
      v_child := 'SC-' || v_suffix;
      exit when not exists (select 1 from public.invites where code = v_child);
    end loop;
    insert into public.invites (code, cohort, inviter_id, expires_at, redeemed_by, redeemed_at)
    values (v_child, v_lookup->>'cohort', v_owner, now() + make_interval(days => v_days), v_uid, now());
  end if;

  update public.accounts set beta_cohort = v_lookup->>'cohort' where id = v_uid;
  return v_lookup;
end;
$$;

-- S-Invites: the personal link, "4 of 5 left", the sent list.
create or replace function public.my_invites()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_cohort_name text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  perform public.assert_not_suspended(v_uid);
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'no_profile' using errcode = 'P0001';
  end if;
  v_code := public.ensure_invite_code(v_uid);
  select c.name into v_cohort_name from public.accounts a join public.beta_cohorts c on c.id = a.beta_cohort where a.id = v_uid;
  return jsonb_build_object(
    'code', v_code,
    'left', public.invites_left(v_uid),
    'total', (select invites_per_member from public.app_config),
    'cohort_name', v_cohort_name,
    'sent', coalesce((
      select jsonb_agg(row order by row->>'sort' desc) from (
        select jsonb_build_object(
          'id', i.id,
          'status', case when p.id is not null then 'joined' else 'opened' end,
          'sort', coalesce(p.created_at, i.redeemed_at)::text,
          'expires_at', i.expires_at,
          'joined_at', p.created_at,
          'profile', case when p.id is null then null else jsonb_build_object('id', p.id, 'name', p.name, 'username', p.username, 'photo_path', p.photo_path) end,
          'following', exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = p.id)
        ) as row
        from public.invites i
        left join public.profiles p on p.id = i.redeemed_by
        where i.inviter_id = v_uid and i.cancelled_at is null and i.redeemed_by is not null
          and (p.id is not null or i.expires_at > now())
      ) rows), '[]'::jsonb)
  );
end;
$$;

-- Cancel on an invite that has not been joined. The invite comes back.
create or replace function public.cancel_invite(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into v_invite from public.invites where id = p_id and inviter_id = v_uid for update;
  if not found or v_invite.cancelled_at is not null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_invite.redeemed_by is not null and public.invite_counts(v_invite.redeemed_by) then
    raise exception 'already_joined' using errcode = 'P0001';
  end if;
  update public.invites set cancelled_at = now() where id = v_invite.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: new functions get no default execute; replaced ones keep their grants.
-- ---------------------------------------------------------------------------
revoke execute on function public.log_server_event(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.suggestion_reviewed_event() from public, anon, authenticated;
revoke execute on function public.account_restored_event() from public, anon, authenticated;
revoke execute on function public.ensure_invite_code(uuid) from public, anon, authenticated;
revoke execute on function public.invite_counts(uuid) from public, anon, authenticated;
revoke execute on function public.invites_left(uuid) from public, anon, authenticated;
revoke execute on function public.personal_invite_owner(text) from public, anon, authenticated;
revoke execute on function public.track_events(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.my_invites() from public, anon, authenticated;
revoke execute on function public.cancel_invite(uuid) from public, anon, authenticated;
grant execute on function public.track_events(text, text, jsonb) to authenticated;
grant execute on function public.my_invites() to authenticated;
grant execute on function public.cancel_invite(uuid) to authenticated;
