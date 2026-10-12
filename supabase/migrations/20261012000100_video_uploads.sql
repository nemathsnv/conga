-- Security stage 2: upload ownership and abuse limits.
--
-- Before this migration a Mux upload id was a free-text string: mux-create-upload minted URLs for
-- any member without limit, and post_response, post_reply, post_draft and retry_response_upload
-- accepted any upload id, including one minted for someone else or one already used. The Mux
-- passthrough (the minting member's id) was set and never compared.
--
-- public.video_uploads is the server-side ledger of every upload URL minted:
--   reserved  a slot is taken before Mux is called (concurrent requests count one another);
--             it stays reserved if the Mux call's outcome is unknown, and keeps counting
--   active    Mux created the upload and the URL was handed to its owner
--   claimed   a response, video reply or draft took it (once; never reusable)
--   failed    Mux refused the request, so no upload exists; it does not count
-- Expiry is a time, not a status: an active upload past expires_at can no longer be claimed.
--
-- Limits per account (Nemat, 12 Oct): 10 uploads in any rolling hour, 30 in any rolling 24 hours,
-- at most 3 unused active URLs. Every reserved, active and claimed row counts towards the hour
-- and the day, whether or not it was ever used.
--
-- Only mux-create-upload writes the ledger: the member's own session reserves a slot
-- (reserve_video_upload), and the service role records Mux's answer (activate_video_upload,
-- fail_video_upload), so a member can never register an upload id of their choosing.

create table public.video_uploads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  upload_id text unique check (upload_id is null or char_length(upload_id) between 1 and 128),
  status text not null default 'reserved' check (status in ('reserved', 'active', 'claimed', 'failed')),
  created_at timestamptz not null default now(),
  -- How long a reservation waits for Mux's answer; mux-create-upload gives Mux 15 s.
  reserved_until timestamptz not null default now() + interval '60 seconds',
  -- The URL's life: Mux is asked for timeout 3600 after the reservation, so Mux's own expiry is later.
  expires_at timestamptz not null default now() + interval '3600 seconds',
  activated_at timestamptz,
  claimed_at timestamptz,
  response_id uuid references public.responses (id) on delete set null,
  constraint video_uploads_id_when_issued check ((status in ('active', 'claimed')) = (upload_id is not null))
);
comment on table public.video_uploads is 'Ledger of Mux upload URLs: who each was minted for, whether it was used, and the per-account limits (security stage 2).';
create index video_uploads_account_created_idx on public.video_uploads (account_id, created_at desc);

-- Deny-all to members: written and read only by the SECURITY DEFINER functions below.
alter table public.video_uploads enable row level security;
revoke all on table public.video_uploads from anon, authenticated;

-- Existing videos (on the hosted project, the founder's one response) are recorded as claimed by
-- their authors, so every upload id in responses has an owner in the ledger.
insert into public.video_uploads (account_id, upload_id, status, created_at, reserved_until, expires_at, activated_at, claimed_at, response_id)
select author_id, mux_upload_id, 'claimed', created_at, created_at, created_at + interval '3600 seconds', created_at, created_at, id
  from public.responses
 where mux_upload_id is not null;

-- ---------------------------------------------------------------------------
-- Minting (mux-create-upload)
-- ---------------------------------------------------------------------------

-- Takes one upload slot for the caller, or refuses. Called with the member's own session, so
-- auth.uid() is the member and the pre_request gate applies. Limit errors carry the seconds until
-- a slot frees up in DETAIL.
create or replace function public.reserve_video_upload()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hour integer;
  v_day integer;
  v_active integer;
  v_wait timestamptz;
  u public.video_uploads%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  -- One reservation at a time per account: a concurrent request waits here, then counts this one.
  perform 1 from public.accounts where id = v_uid for no key update;
  if not public.has_profile(v_uid) then raise exception 'profile_required' using errcode = 'P0001'; end if;
  -- Suspended, posting paused (restricted) or deleted accounts get no upload URL.
  perform public.assert_can_post(v_uid);

  select count(*)::int,
         (count(*) filter (where created_at > now() - interval '1 hour'))::int,
         (count(*) filter (where (status = 'active' and expires_at > now()) or (status = 'reserved' and reserved_until > now())))::int
    into v_day, v_hour, v_active
    from public.video_uploads
   where account_id = v_uid and status <> 'failed' and created_at > now() - interval '24 hours';

  if v_day >= 30 then
    select created_at + interval '24 hours' into v_wait from public.video_uploads
     where account_id = v_uid and status <> 'failed' and created_at > now() - interval '24 hours'
     order by created_at desc offset 29 limit 1;
    raise exception 'upload_limit_day' using errcode = 'P0001', detail = ceil(greatest(extract(epoch from v_wait - now()), 1))::text;
  end if;
  if v_hour >= 10 then
    select created_at + interval '1 hour' into v_wait from public.video_uploads
     where account_id = v_uid and status <> 'failed' and created_at > now() - interval '1 hour'
     order by created_at desc offset 9 limit 1;
    raise exception 'upload_limit_hour' using errcode = 'P0001', detail = ceil(greatest(extract(epoch from v_wait - now()), 1))::text;
  end if;
  if v_active >= 3 then
    select min(case when status = 'active' then expires_at else reserved_until end) into v_wait from public.video_uploads
     where account_id = v_uid and ((status = 'active' and expires_at > now()) or (status = 'reserved' and reserved_until > now()));
    raise exception 'upload_limit_active' using errcode = 'P0001', detail = ceil(greatest(extract(epoch from v_wait - now()), 1))::text;
  end if;

  insert into public.video_uploads (account_id) values (v_uid) returning * into u;
  return jsonb_build_object('reservation_id', u.id, 'expires_at', u.expires_at);
end;
$$;

-- Service role: Mux created the upload. Only a reservation still waiting can take it, so a slot
-- that timed out (and stopped counting as active) can never become a fourth active URL.
create or replace function public.activate_video_upload(p_reservation uuid, p_upload_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u public.video_uploads%rowtype;
begin
  if p_upload_id is null or p_upload_id !~ '^[A-Za-z0-9]{1,128}$' then
    raise exception 'invalid_upload_id' using errcode = 'P0001';
  end if;
  update public.video_uploads
     set status = 'active', upload_id = p_upload_id, activated_at = now()
   where id = p_reservation and status = 'reserved' and reserved_until > now()
   returning * into u;
  if not found then raise exception 'reservation_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object('upload_id', u.upload_id, 'account_id', u.account_id, 'expires_at', u.expires_at);
end;
$$;

-- Service role: Mux refused the request, so no upload exists and the slot is given back.
create or replace function public.fail_video_upload(p_reservation uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.video_uploads set status = 'failed' where id = p_reservation and status = 'reserved';
end;
$$;

-- ---------------------------------------------------------------------------
-- Claiming (posting)
-- ---------------------------------------------------------------------------

-- Atomically takes an active, unexpired upload minted for p_account. A second claim of the same
-- upload waits for the first transaction's row lock, then finds it claimed. Unknown ids and other
-- people's ids give the same error, so nothing reveals whether someone else's upload exists.
-- Internal: executable by no API role; called only by the posting functions below.
create or replace function public.claim_video_upload(p_account uuid, p_upload_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  u public.video_uploads%rowtype;
begin
  if p_upload_id is null or p_upload_id = '' then raise exception 'upload_required' using errcode = 'P0001'; end if;
  update public.video_uploads
     set status = 'claimed', claimed_at = now()
   where upload_id = p_upload_id and account_id = p_account and status = 'active' and expires_at > now()
   returning id into v_id;
  if found then return v_id; end if;
  select * into u from public.video_uploads where upload_id = p_upload_id;
  if not found or u.account_id <> p_account then raise exception 'upload_not_found' using errcode = 'P0001'; end if;
  if u.status = 'claimed' then raise exception 'upload_already_used' using errcode = 'P0001'; end if;
  raise exception 'upload_expired' using errcode = 'P0001';
end;
$$;

-- post_response: unchanged checks and errors, then the upload is claimed. "Already responded" is
-- now checked before the claim, so a refused post leaves the upload usable; the unique index
-- still settles a race.
create or replace function public.post_response(p_prompt uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_upload uuid;
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.has_profile(v_uid) then raise exception 'profile_required' using errcode = 'P0001'; end if;
  perform public.assert_can_post(v_uid);
  if (select public_disclosure_ack_at from public.accounts where id = v_uid) is null then
    raise exception 'disclosure_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.prompts where id = p_prompt and status = 'live') then
    raise exception 'prompt_not_found' using errcode = 'P0001';
  end if;
  if p_duration_ms is null or p_duration_ms < 2000 or p_duration_ms > 31000 then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;
  if v_caption is not null and char_length(v_caption) > 150 then
    raise exception 'invalid_caption' using errcode = 'P0001';
  end if;
  if p_upload_id is null or p_upload_id = '' then
    raise exception 'upload_required' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.responses where prompt_id = p_prompt and author_id = v_uid and kind = 'response' and status in ('processing', 'live')) then
    raise exception 'already_responded' using errcode = 'P0001';
  end if;
  v_upload := public.claim_video_upload(v_uid, p_upload_id);
  begin
    insert into public.responses (prompt_id, author_id, caption, duration_ms, mux_upload_id)
    values (p_prompt, v_uid, v_caption, p_duration_ms, p_upload_id)
    returning * into r;
  exception when unique_violation then
    raise exception 'already_responded' using errcode = 'P0001';
  end;
  update public.video_uploads set response_id = r.id where id = v_upload;
  return public.response_card(r, v_uid);
end;
$$;

create or replace function public.post_reply(p_reply_to uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  target public.responses%rowtype;
  v_root uuid;
  v_upload uuid;
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.has_profile(v_uid) then raise exception 'profile_required' using errcode = 'P0001'; end if;
  perform public.assert_can_post(v_uid);
  if (select public_disclosure_ack_at from public.accounts where id = v_uid) is null then
    raise exception 'disclosure_required' using errcode = 'P0001';
  end if;
  select * into target from public.responses where id = p_reply_to and public.video_visible(responses, v_uid);
  if not found then raise exception 'video_not_found' using errcode = 'P0001'; end if;
  v_root := case when target.kind = 'reply' then target.root_response_id else target.id end;
  if p_duration_ms is null or p_duration_ms < 2000 or p_duration_ms > 31000 then
    raise exception 'invalid_duration' using errcode = 'P0001';
  end if;
  if v_caption is not null and char_length(v_caption) > 150 then
    raise exception 'invalid_caption' using errcode = 'P0001';
  end if;
  if p_upload_id is null or p_upload_id = '' then
    raise exception 'upload_required' using errcode = 'P0001';
  end if;
  v_upload := public.claim_video_upload(v_uid, p_upload_id);
  insert into public.responses (kind, prompt_id, root_response_id, reply_to_id, author_id, caption, duration_ms, mux_upload_id)
  values ('reply', target.prompt_id, v_root, target.id, v_uid, v_caption, p_duration_ms, p_upload_id)
  returning * into r;
  update public.video_uploads set response_id = r.id where id = v_upload;
  return public.response_card(r, v_uid);
end;
$$;

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

-- A failed post gets a fresh upload: the new one is claimed like any other. The response is
-- locked first, so a claim is never spent on a response that cannot take it.
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

-- ---------------------------------------------------------------------------
-- Going live (mux-webhook, mux-upload-status)
-- ---------------------------------------------------------------------------

-- p_passthrough is the asset's passthrough as Mux reports it (the member the upload was minted
-- for). When given, it must be the response's author; the ledger owner, when there is one, must
-- be too. A mismatch changes nothing and is answered, not raised, so Mux does not retry it.
-- The parameter defaults to null so the functions deployed before this migration keep working
-- until they are redeployed.
drop function public.mark_response_live(text, text, text, integer);
create function public.mark_response_live(p_upload_id text, p_asset_id text, p_playback_id text, p_duration_ms integer, p_passthrough text default null)
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.reserve_video_upload() from public, anon, authenticated;
revoke execute on function public.activate_video_upload(uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_video_upload(uuid) from public, anon, authenticated;
revoke execute on function public.claim_video_upload(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.mark_response_live(text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.reserve_video_upload() to authenticated;
grant execute on function public.activate_video_upload(uuid, text) to service_role;
grant execute on function public.fail_video_upload(uuid) to service_role;
grant execute on function public.mark_response_live(text, text, text, integer, text) to service_role;
