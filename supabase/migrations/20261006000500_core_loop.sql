-- Phase 3: the core loop (SPEC.md Sections 4, 5, 6, 9, 16, 19).
-- Prompts are team-created in this phase. Responses are public videos on Mux. Follows are
-- one-way and public. Every write goes through a function that derives the user from
-- auth.uid(); moderation state (status) is never settable from the app.

-- ---------------------------------------------------------------------------
-- places: reference only in this phase (a prompt's scope). Pages and following come in phase 6.
-- ---------------------------------------------------------------------------
create table public.places (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  region text not null,
  type text not null check (type in ('city', 'region', 'country', 'community')),
  image_path text,
  is_open boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.places is 'Places a prompt can be tied to (SPEC.md Section 11). Team-created.';
insert into public.places (slug, name, region, type, is_open) values ('canggu', 'Canggu', 'Bali, Indonesia', 'city', true);
alter table public.places enable row level security;
create policy "places: signed-in users can read" on public.places for select to authenticated using (true);

create table public.topics (
  id text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  name text not null
);
comment on table public.topics is 'Team-managed topic list for prompts (SPEC.md Section 5).';
alter table public.topics enable row level security;
create policy "topics: signed-in users can read" on public.topics for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- prompts (SPEC.md Section 5)
-- ---------------------------------------------------------------------------
create table public.prompts (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(btrim(text)) between 1 and 120),
  place_id uuid references public.places (id),
  topic_id text references public.topics (id),
  source text not null default 'team' check (source in ('team', 'member')),
  suggested_by uuid references public.profiles (id) on delete set null,
  attribution boolean not null default true,
  status text not null default 'live' check (status in ('in_review', 'live', 'not_published', 'withdrawn', 'archived')),
  featured_on date unique,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint prompts_featured_global check (featured_on is null or place_id is null)
);
comment on column public.prompts.featured_on is 'The day this global prompt is "Tonight''s prompt" (about 18:30 to midnight local time). One per day.';
create index prompts_live_idx on public.prompts (published_at desc) where status = 'live';
alter table public.prompts enable row level security;
create policy "prompts: signed-in users read live prompts" on public.prompts for select to authenticated using (status = 'live');

-- ---------------------------------------------------------------------------
-- responses (SPEC.md Section 6). Video lives on Mux; the row carries the ids.
-- ---------------------------------------------------------------------------
create table public.responses (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.prompts (id),
  author_id uuid not null references public.profiles (id) on delete cascade,
  caption text check (caption is null or char_length(caption) <= 150),
  duration_ms integer not null check (duration_ms between 1500 and 31000),
  status text not null default 'processing' check (status in ('processing', 'live', 'removed', 'deleted')),
  mux_upload_id text unique,
  mux_asset_id text unique,
  mux_playback_id text,
  created_at timestamptz not null default now(),
  live_at timestamptz,
  deleted_at timestamptz
);
comment on table public.responses is 'A public video of 2 to 30 seconds made in response to exactly one prompt.';
-- One primary response per person per prompt (SPEC.md Section 6).
create unique index responses_one_per_prompt on public.responses (prompt_id, author_id) where status in ('processing', 'live');
create index responses_prompt_live_idx on public.responses (prompt_id, live_at desc) where status = 'live';
create index responses_author_idx on public.responses (author_id, live_at desc);
alter table public.responses enable row level security;
create policy "responses: live ones are public to signed-in users; your own always"
  on public.responses for select to authenticated
  using (status = 'live' or author_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- follows (SPEC.md Section 9): one-way, public.
-- ---------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);
alter table public.follows enable row level security;
create policy "follows: signed-in users can read" on public.follows for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- accounts / profiles additions
-- ---------------------------------------------------------------------------
alter table public.accounts add column public_disclosure_ack_at timestamptz;
comment on column public.accounts.public_disclosure_ack_at is 'A-Disclosure acknowledged. No video publishes before this (SPEC.md Section 16).';
alter table public.profiles add column pinned_response_id uuid references public.responses (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------
create or replace function public.response_count(p_prompt uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.responses where prompt_id = p_prompt and status = 'live';
$$;

create or replace function public.profile_card(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', id, 'name', name, 'username', username, 'photo_path', photo_path)
    from public.profiles where id = p_id;
$$;

create or replace function public.response_card(r public.responses, p_viewer uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id,
    'prompt_id', r.prompt_id,
    'caption', r.caption,
    'duration_ms', r.duration_ms,
    'status', r.status,
    'playback_id', r.mux_playback_id,
    'live_at', r.live_at,
    'created_at', r.created_at,
    'author', public.profile_card(r.author_id),
    'is_own', r.author_id = p_viewer,
    'following_author', exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = r.author_id),
    'like_count', 0, 'comment_count', 0, 'reply_count', 0
  );
$$;

create or replace function public.prompt_card(p public.prompts)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'text', p.text,
    'place', (select jsonb_build_object('id', pl.id, 'name', pl.name) from public.places pl where pl.id = p.place_id),
    'featured_on', p.featured_on,
    'published_at', p.published_at,
    'response_count', public.response_count(p.id),
    'faces', (select coalesce(jsonb_agg(public.profile_card(x.author_id)), '[]'::jsonb)
                from (select author_id from public.responses where prompt_id = p.id and status = 'live' order by live_at desc limit 3) x)
  );
$$;

-- ---------------------------------------------------------------------------
-- home_feed: one conversation per prompt (SPEC.md Section 4, "For you").
-- The featured global prompt first, then fresh conversations from global prompts and
-- followed places, lightly weighted by engagement (response count until likes exist).
-- The response shown is from someone you follow if there is one, otherwise the newest.
-- Prompts with no live responses are included (Z-Empty). p_exclude: conversations already
-- seen in this session.
-- ---------------------------------------------------------------------------
create or replace function public.home_feed(p_exclude uuid[] default '{}', p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'prompt', public.prompt_card(p),
      'response', (select public.response_card(r, v_uid) from public.responses r
                     where r.prompt_id = p.id and r.status = 'live'
                     order by (exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = r.author_id)) desc,
                              r.live_at desc
                     limit 1)
    ) order by (p.featured_on = (now() at time zone 'utc')::date) desc nulls last,
               (public.response_count(p.id) > 0) desc,
               coalesce((select max(live_at) from public.responses x where x.prompt_id = p.id and x.status = 'live'), p.published_at) desc)
    from (
      select * from public.prompts p
       where p.status = 'live'
         and p.place_id is null
         and not (p.id = any (p_exclude))
       order by (p.featured_on = (now() at time zone 'utc')::date) desc nulls last,
                coalesce((select max(live_at) from public.responses x where x.prompt_id = p.id and x.status = 'live'), p.published_at) desc
       limit greatest(1, least(p_limit, 50))
    ) p
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- following_feed: responses from people you follow, newest first (Section 9).
-- ---------------------------------------------------------------------------
create or replace function public.following_feed(p_before timestamptz default null, p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('prompt', public.prompt_card(p), 'response', public.response_card(r, v_uid)) order by r.live_at desc)
    from (
      select r.* from public.responses r
       join public.follows f on f.followee_id = r.author_id and f.follower_id = v_uid
       where r.status = 'live' and (p_before is null or r.live_at < p_before)
       order by r.live_at desc
       limit greatest(1, least(p_limit, 50))
    ) r
    join public.prompts p on p.id = r.prompt_id
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- prompt_responses: the response player's order (Section 6): the entry response, then
-- unseen responses from people you follow, then newer responses. Unavailable (deleted or
-- removed) entry responses come back with status so the player can show X-Unavailable.
-- ---------------------------------------------------------------------------
create or replace function public.prompt_responses(p_prompt uuid, p_entry uuid default null, p_seen uuid[] default '{}')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_prompt public.prompts%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into v_prompt from public.prompts where id = p_prompt and status = 'live';
  if not found then raise exception 'prompt_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'prompt', public.prompt_card(v_prompt),
    'entry_status', (select status from public.responses where id = p_entry),
    'responses', coalesce((
      select jsonb_agg(public.response_card(r, v_uid) order by
        (r.id = p_entry) desc,
        (not (r.id = any (p_seen)) and exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = r.author_id)) desc,
        r.live_at desc)
      from public.responses r
      where r.prompt_id = p_prompt and r.status = 'live'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_response(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into r from public.responses where id = p_id and (status = 'live' or author_id = v_uid);
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  return public.response_card(r, v_uid) || jsonb_build_object('prompt', (select public.prompt_card(p) from public.prompts p where p.id = r.prompt_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Prompts for the + sheet (C-Plus): tonight's prompt first, then open global prompts.
-- Followed places arrive in phase 6.
-- ---------------------------------------------------------------------------
create or replace function public.open_prompts(p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(public.prompt_card(p) order by (p.featured_on = (now() at time zone 'utc')::date) desc nulls last, p.published_at desc)
    from (select * from public.prompts where status = 'live' and place_id is null
          order by (featured_on = (now() at time zone 'utc')::date) desc nulls last, published_at desc
          limit greatest(1, least(p_limit, 50))) p
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_prompt(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.prompt_card(p) from public.prompts p where p.id = p_id and p.status = 'live';
$$;

-- ---------------------------------------------------------------------------
-- Posting (Sections 6, 16, 19)
-- ---------------------------------------------------------------------------
create or replace function public.acknowledge_disclosure()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.accounts set public_disclosure_ack_at = coalesce(public_disclosure_ack_at, now()) where id = auth.uid();
end;
$$;

-- post_response: called when Post is tapped, before the upload starts. The row is
-- "processing" until Mux reports the asset ready (mux-upload-status / mux-webhook).
create or replace function public.post_response(p_prompt uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.has_profile(v_uid) then raise exception 'profile_required' using errcode = 'P0001'; end if;
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
  begin
    insert into public.responses (prompt_id, author_id, caption, duration_ms, mux_upload_id)
    values (p_prompt, v_uid, v_caption, p_duration_ms, p_upload_id)
    returning * into r;
  exception when unique_violation then
    raise exception 'already_responded' using errcode = 'P0001';
  end;
  return public.response_card(r, v_uid);
end;
$$;

-- retry_response_upload: Retry after a failed upload may need a fresh upload URL.
create or replace function public.retry_response_upload(p_response uuid, p_upload_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.responses set mux_upload_id = p_upload_id
   where id = p_response and author_id = v_uid and status = 'processing';
  if not found then raise exception 'response_not_found' using errcode = 'P0001'; end if;
end;
$$;

-- abandon_response: the person discarded a recording whose post had already been recorded
-- (for example after an upload failed). Only their own processing responses.
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

-- team/service only: Mux reported the asset ready.
create or replace function public.mark_response_live(p_upload_id text, p_asset_id text, p_playback_id text, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.responses%rowtype;
begin
  update public.responses
     set status = 'live', mux_asset_id = p_asset_id, mux_playback_id = p_playback_id,
         live_at = coalesce(live_at, now()),
         duration_ms = coalesce(p_duration_ms, duration_ms)
   where mux_upload_id = p_upload_id and status = 'processing'
   returning * into r;
  if not found then
    select * into r from public.responses where mux_upload_id = p_upload_id;
    if not found then return jsonb_build_object('status', 'unknown_upload'); end if;
  end if;
  return jsonb_build_object('id', r.id, 'status', r.status, 'author_id', r.author_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles and follows (Section 9)
-- ---------------------------------------------------------------------------
create or replace function public.get_profile(p_id uuid default null, p_username text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  p public.profiles%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_id is not null then select * into p from public.profiles where id = p_id;
  elsif p_username is not null then select * into p from public.profiles where username = lower(p_username);
  else select * into p from public.profiles where id = v_uid;
  end if;
  if not found then return null; end if;
  return public.profile_card(p.id) || jsonb_build_object(
    'bio', p.bio,
    'is_own', p.id = v_uid,
    'response_count', (select count(*) from public.responses where author_id = p.id and status = 'live'),
    'reply_count', 0,
    'follower_count', (select count(*) from public.follows where followee_id = p.id),
    'following_count', (select count(*) from public.follows where follower_id = p.id),
    'is_following', exists (select 1 from public.follows where follower_id = v_uid and followee_id = p.id),
    'follows_you', exists (select 1 from public.follows where follower_id = p.id and followee_id = v_uid),
    'pinned_response_id', p.pinned_response_id,
    -- "Followed by Putu, Wayan and 4 others": people you follow who follow them.
    'followed_by', (select coalesce(jsonb_agg(public.profile_card(f.follower_id)), '[]'::jsonb)
                      from (select f.follower_id from public.follows f
                             where f.followee_id = p.id
                               and exists (select 1 from public.follows mine where mine.follower_id = v_uid and mine.followee_id = f.follower_id)
                             limit 3) f),
    'followed_by_count', (select count(*) from public.follows f
                            where f.followee_id = p.id
                              and exists (select 1 from public.follows mine where mine.follower_id = v_uid and mine.followee_id = f.follower_id))
  );
end;
$$;

create or replace function public.profile_responses(p_profile uuid, p_before timestamptz default null, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(public.response_card(r, v_uid) || jsonb_build_object(
             'prompt_text', (select text from public.prompts where id = r.prompt_id),
             'pinned', (select pinned_response_id = r.id from public.profiles where id = p_profile))
           order by ((select pinned_response_id from public.profiles where id = p_profile) = r.id) desc nulls last, coalesce(r.live_at, r.created_at) desc)
    from (
      select * from public.responses r
       where r.author_id = p_profile
         and (r.status = 'live' or (r.author_id = v_uid and r.status = 'processing'))
         and (p_before is null or coalesce(r.live_at, r.created_at) < p_before)
       order by coalesce(r.live_at, r.created_at) desc
       limit greatest(1, least(p_limit, 60))
    ) r
  ), '[]'::jsonb);
end;
$$;

create or replace function public.follow_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.has_profile(v_uid) then raise exception 'profile_required' using errcode = 'P0001'; end if;
  if p_user = v_uid then raise exception 'cannot_follow_self' using errcode = 'P0001'; end if;
  if not public.has_profile(p_user) then raise exception 'profile_not_found' using errcode = 'P0001'; end if;
  insert into public.follows (follower_id, followee_id) values (v_uid, p_user) on conflict do nothing;
end;
$$;

create or replace function public.unfollow_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  delete from public.follows where follower_id = auth.uid() and followee_id = p_user;
end;
$$;

-- Followers / following lists (LV-Followers). Each row carries the viewer's relation.
create or replace function public.follow_list(p_profile uuid, p_kind text, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_kind not in ('followers', 'following') then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  return coalesce((
    select jsonb_agg(public.profile_card(x.id) || jsonb_build_object(
      'is_following', exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = x.id),
      'follows_you', exists (select 1 from public.follows f where f.follower_id = x.id and f.followee_id = v_uid),
      'is_self', x.id = v_uid) order by x.created_at desc)
    from (
      select case when p_kind = 'followers' then f.follower_id else f.followee_id end as id, f.created_at
        from public.follows f
       where (p_kind = 'followers' and f.followee_id = p_profile) or (p_kind = 'following' and f.follower_id = p_profile)
       order by f.created_at desc
       limit greatest(1, least(p_limit, 200))
    ) x
  ), '[]'::jsonb);
end;
$$;

-- People to follow when the Following feed is empty (X-Following-Empty): authors of
-- responses to prompts the person watched, most responses first.
create or replace function public.follow_suggestions(p_watched_prompts uuid[] default '{}', p_limit integer default 3)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(public.profile_card(x.author_id) || jsonb_build_object('response_count', x.n, 'prompt_text', x.prompt_text))
    from (
      select r.author_id,
             (select count(*) from public.responses y where y.author_id = r.author_id and y.status = 'live') as n,
             (select text from public.prompts where id = (array_agg(r.prompt_id order by r.live_at desc))[1]) as prompt_text
        from public.responses r
       where r.status = 'live' and r.author_id <> v_uid
         and (cardinality(p_watched_prompts) = 0 or r.prompt_id = any (p_watched_prompts))
         and not exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = r.author_id)
       group by r.author_id
       order by n desc
       limit greatest(1, least(p_limit, 10))
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.update_profile(p_name text, p_username text, p_bio text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_bio text := nullif(btrim(coalesce(p_bio, '')), '');
  p public.profiles%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if v_username !~ '^[a-z0-9._]{3,24}$' then raise exception 'invalid_username' using errcode = 'P0001'; end if;
  if v_bio is not null and char_length(v_bio) > 150 then raise exception 'invalid_bio' using errcode = 'P0001'; end if;
  begin
    update public.profiles set name = v_name, username = v_username, bio = v_bio where id = v_uid returning * into p;
  exception when unique_violation then
    raise exception 'username_taken' using errcode = 'P0001';
  end;
  if not found then raise exception 'profile_required' using errcode = 'P0001'; end if;
  return public.profile_card(p.id) || jsonb_build_object('bio', p.bio);
end;
$$;

create or replace function public.set_pinned_response(p_response uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_response is not null and not exists (select 1 from public.responses where id = p_response and author_id = v_uid and status = 'live') then
    raise exception 'response_not_found' using errcode = 'P0001';
  end if;
  update public.profiles set pinned_response_id = p_response where id = v_uid;
end;
$$;

-- Team tool: publish a prompt now.
create or replace function public.team_create_prompt(p_text text, p_place_slug text default null, p_featured_on date default null, p_topic text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_place uuid;
  v_id uuid;
begin
  if p_place_slug is not null then
    select id into v_place from public.places where slug = p_place_slug;
    if v_place is null then raise exception 'place_not_found' using errcode = 'P0001'; end if;
  end if;
  insert into public.prompts (text, place_id, topic_id, featured_on, status, published_at)
  values (btrim(p_text), v_place, p_topic, p_featured_on, 'live', now())
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges. Default privileges are not reliable across migration runners, so every
-- function in public is closed here and the app-facing ones are opened explicitly.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- phase 2
grant execute on function public.get_onboarding_state() to authenticated;
grant execute on function public.confirm_age() to authenticated;
grant execute on function public.check_invite(text) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.join_waitlist() to authenticated;
grant execute on function public.username_status(text) to authenticated;
grant execute on function public.username_suggestions(text, text) to authenticated;
grant execute on function public.create_profile(text, text) to authenticated;
grant execute on function public.set_profile_photo(text) to authenticated;
grant execute on function public.has_profile(uuid) to authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- phase 3
grant execute on function public.home_feed(uuid[], integer) to authenticated;
grant execute on function public.following_feed(timestamptz, integer) to authenticated;
grant execute on function public.prompt_responses(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.get_response(uuid) to authenticated;
grant execute on function public.open_prompts(integer) to authenticated;
grant execute on function public.get_prompt(uuid) to authenticated;
grant execute on function public.acknowledge_disclosure() to authenticated;
grant execute on function public.post_response(uuid, text, text, integer) to authenticated;
grant execute on function public.retry_response_upload(uuid, text) to authenticated;
grant execute on function public.abandon_response(uuid) to authenticated;
grant execute on function public.get_profile(uuid, text) to authenticated;
grant execute on function public.profile_responses(uuid, timestamptz, integer) to authenticated;
grant execute on function public.follow_user(uuid) to authenticated;
grant execute on function public.unfollow_user(uuid) to authenticated;
grant execute on function public.follow_list(uuid, text, integer) to authenticated;
grant execute on function public.follow_suggestions(uuid[], integer) to authenticated;
grant execute on function public.update_profile(text, text, text) to authenticated;
grant execute on function public.set_pinned_response(uuid) to authenticated;
-- Service role only: mark_response_live, team_create_prompt, team_create_invite,
-- team_admit_from_waitlist, signin_providers_for_email, and the internal helpers.
