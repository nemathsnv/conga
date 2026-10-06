-- Phase 4: conversation (SPEC.md Sections 7, 8, 15, 16, 20, 21).
-- Video replies live in the responses table with kind = 'reply' (same video, caption, limits and
-- Mux path as a response); text comments, likes, Activity, notification preferences, push tokens
-- and the push outbox are new. Every function derives the acting person from auth.uid().

-- ---------------------------------------------------------------------------
-- Video replies (Section 7): one flat room per root response.
-- ---------------------------------------------------------------------------
alter table public.responses
  add column kind text not null default 'response' check (kind in ('response', 'reply')),
  add column root_response_id uuid references public.responses (id),
  add column reply_to_id uuid references public.responses (id);
comment on column public.responses.kind is 'response: a response to a prompt. reply: a video reply inside the root response''s room (SPEC.md Section 7).';
comment on column public.responses.root_response_id is 'Replies only: the response whose room this reply lives in. Always set, even after the root is deleted.';
comment on column public.responses.reply_to_id is 'Replies only: the video it replies to directly, the root or another reply in the same room.';
alter table public.responses add constraint responses_reply_context check (
  (kind = 'response' and root_response_id is null and reply_to_id is null)
  or (kind = 'reply' and root_response_id is not null and reply_to_id is not null));
-- One primary response per person per prompt; video replies are not limited.
drop index public.responses_one_per_prompt;
create unique index responses_one_per_prompt on public.responses (prompt_id, author_id) where kind = 'response' and status in ('processing', 'live');
create index responses_room_idx on public.responses (root_response_id, live_at) where kind = 'reply' and status = 'live';

-- ---------------------------------------------------------------------------
-- Comments (Section 8): on responses only, one level deep, up to 300 characters.
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.responses (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  thread_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
comment on table public.comments is 'Text comments on responses (SPEC.md Section 8). One level: parent_id is the comment replied to; thread_id is the top-level comment the reply sits under (a reply to a reply joins the same thread).';
create index comments_response_idx on public.comments (response_id, created_at) where deleted_at is null;
create index comments_thread_idx on public.comments (thread_id, created_at) where deleted_at is null;
alter table public.comments enable row level security;
create policy "comments: signed-in users read live comments" on public.comments for select to authenticated using (deleted_at is null);

create or replace function public.check_comment_parent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  parent public.comments%rowtype;
begin
  if new.parent_id is null then new.thread_id := null; return new; end if;
  select * into parent from public.comments where id = new.parent_id;
  if not found or parent.response_id <> new.response_id then
    raise exception 'invalid_parent' using errcode = 'P0001';
  end if;
  -- A reply to a reply joins the same thread (one level).
  new.thread_id := coalesce(parent.thread_id, parent.id);
  return new;
end;
$$;
create trigger comments_parent before insert on public.comments for each row execute function public.check_comment_parent();

-- ---------------------------------------------------------------------------
-- Likes (Sections 6, 7, 8): on videos (counts shown) and on comments (no counts).
-- Rows are private; every count comes from a function.
-- ---------------------------------------------------------------------------
create table public.likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_kind text not null check (target_kind in ('video', 'comment')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_kind, target_id)
);
create index likes_target_idx on public.likes (target_kind, target_id);
alter table public.likes enable row level security;
create policy "likes: read your own" on public.likes for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Activity (Section 15): one row per event for its recipient, written by triggers only.
-- Likes on one video collapse into one row per recipient and video.
-- ---------------------------------------------------------------------------
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('video_reply', 'comment', 'comment_reply', 'follow', 'like', 'followed_responded')),
  actor_id uuid references public.profiles (id) on delete cascade,
  video_id uuid references public.responses (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  prompt_id uuid references public.prompts (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz
);
comment on table public.activity is 'What the Activity tab shows (SPEC.md Section 15). Written by triggers; read_at separates New from This week.';
create index activity_recipient_idx on public.activity (recipient_id, updated_at desc);
create unique index activity_one_like_row on public.activity (recipient_id, video_id) where kind = 'like';
alter table public.activity enable row level security;
create policy "activity: read your own" on public.activity for select to authenticated using (recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Notification preferences, push tokens, the ask state (Section 15).
-- ---------------------------------------------------------------------------
create table public.notification_prefs (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  pause_all boolean not null default false,
  video_replies boolean not null default true,
  comments boolean not null default true,
  comment_replies boolean not null default true,
  new_followers boolean not null default true,
  followed_respond boolean not null default false,
  tonight_prompt boolean not null default true,
  place_prompts boolean not null default true,
  likes boolean not null default false,
  updated_at timestamptz not null default now()
);
comment on table public.notification_prefs is 'N-Settings. Defaults are the spec''s (SPEC.md Section 15). A missing row means the defaults.';
create trigger notification_prefs_updated_at before update on public.notification_prefs for each row execute function public.set_updated_at();
alter table public.notification_prefs enable row level security;
create policy "notification_prefs: read your own" on public.notification_prefs for select to authenticated using (account_id = (select auth.uid()));

create table public.push_tokens (
  token text primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_account_idx on public.push_tokens (account_id);
alter table public.push_tokens enable row level security;

alter table public.accounts
  add column notification_ask text not null default 'never' check (notification_ask in ('never', 'declined_once', 'declined_twice', 'accepted')),
  add column timezone text;
comment on column public.accounts.notification_ask is 'N-Prime timing (SPEC.md Section 15): first ask after the first public video; after Not now, once more when the first reply or comment arrives; then Settings only.';
comment on column public.accounts.timezone is 'IANA zone from the phone, for "tonight''s prompt" at about 18:30 local time.';

-- ---------------------------------------------------------------------------
-- Push outbox: what to send, when. Filled by triggers, drained by the send-push function.
-- Comments on one response are held for 10 minutes and sent as one notification.
-- ---------------------------------------------------------------------------
create table public.push_outbox (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.accounts (id) on delete cascade,
  kind text not null check (kind in ('video_reply', 'comment', 'comment_reply', 'follow', 'like', 'followed_responded', 'tonight_prompt', 'place_prompt')),
  activity_id uuid references public.activity (id) on delete cascade,
  prompt_id uuid references public.prompts (id) on delete cascade,
  video_id uuid references public.responses (id) on delete cascade,
  group_key text,
  due_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
create index push_outbox_due_idx on public.push_outbox (due_at) where sent_at is null;
create unique index push_outbox_one_pending_per_group on public.push_outbox (group_key) where sent_at is null and group_key is not null;
alter table public.push_outbox enable row level security;

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------
create or replace function public.response_count(p_prompt uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.responses where prompt_id = p_prompt and kind = 'response' and status = 'live';
$$;

create or replace function public.like_count(p_video uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.likes where target_kind = 'video' and target_id = p_video;
$$;

create or replace function public.comment_count(p_response uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.comments where response_id = p_response and deleted_at is null;
$$;

create or replace function public.reply_count(p_root uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.responses where root_response_id = p_root and kind = 'reply' and status = 'live';
$$;

-- The card every screen draws for a video (response or reply). Counts are real now.
create or replace function public.response_card(r public.responses, p_viewer uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id,
    'kind', r.kind,
    'prompt_id', r.prompt_id,
    'root_response_id', r.root_response_id,
    'reply_to_id', r.reply_to_id,
    'caption', r.caption,
    'duration_ms', r.duration_ms,
    'status', r.status,
    'playback_id', r.mux_playback_id,
    'live_at', r.live_at,
    'created_at', r.created_at,
    'author', public.profile_card(r.author_id),
    'is_own', r.author_id = p_viewer,
    'following_author', exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = r.author_id),
    'like_count', public.like_count(r.id),
    'liked', exists (select 1 from public.likes l where l.user_id = p_viewer and l.target_kind = 'video' and l.target_id = r.id),
    'comment_count', case when r.kind = 'response' then public.comment_count(r.id) else 0 end,
    'reply_count', case when r.kind = 'response' then public.reply_count(r.id) else 0 end
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
                from (select author_id from public.responses where prompt_id = p.id and kind = 'response' and status = 'live' order by live_at desc limit 3) x)
  );
$$;

-- Feeds, the player and profiles show responses only (replies are not in the Following feed in v1).
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
                     where r.prompt_id = p.id and r.kind = 'response' and r.status = 'live'
                     order by (exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = r.author_id)) desc,
                              r.live_at desc
                     limit 1)
    ) order by (p.featured_on = (now() at time zone 'utc')::date) desc nulls last,
               (public.response_count(p.id) > 0) desc,
               coalesce((select max(live_at) from public.responses x where x.prompt_id = p.id and x.kind = 'response' and x.status = 'live'), p.published_at) desc)
    from (
      select * from public.prompts p
       where p.status = 'live'
         and p.place_id is null
         and not (p.id = any (p_exclude))
       order by (p.featured_on = (now() at time zone 'utc')::date) desc nulls last,
                coalesce((select max(live_at) from public.responses x where x.prompt_id = p.id and x.kind = 'response' and x.status = 'live'), p.published_at) desc
       limit greatest(1, least(p_limit, 50))
    ) p
  ), '[]'::jsonb);
end;
$$;

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
       where r.kind = 'response' and r.status = 'live' and (p_before is null or r.live_at < p_before)
       order by r.live_at desc
       limit greatest(1, least(p_limit, 50))
    ) r
    join public.prompts p on p.id = r.prompt_id
  ), '[]'::jsonb);
end;
$$;

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
      where r.prompt_id = p_prompt and r.kind = 'response' and r.status = 'live'
    ), '[]'::jsonb)
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
       where r.author_id = p_profile and r.kind = 'response'
         and (r.status = 'live' or (r.author_id = v_uid and r.status = 'processing'))
         and (p_before is null or coalesce(r.live_at, r.created_at) < p_before)
       order by coalesce(r.live_at, r.created_at) desc
       limit greatest(1, least(p_limit, 60))
    ) r
  ), '[]'::jsonb);
end;
$$;

-- The Replies tab on a profile (Section 9).
create or replace function public.profile_replies(p_profile uuid, p_before timestamptz default null, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(public.response_card(r, v_uid) || jsonb_build_object(
             'prompt_text', (select text from public.prompts where id = r.prompt_id),
             'reply_to_name', (select pr.name from public.responses x join public.profiles pr on pr.id = x.author_id where x.id = r.reply_to_id and x.status = 'live'))
           order by coalesce(r.live_at, r.created_at) desc)
    from (
      select * from public.responses r
       where r.author_id = p_profile and r.kind = 'reply'
         and (r.status = 'live' or (r.author_id = v_uid and r.status = 'processing'))
         and (p_before is null or coalesce(r.live_at, r.created_at) < p_before)
       order by coalesce(r.live_at, r.created_at) desc
       limit greatest(1, least(p_limit, 60))
    ) r
  ), '[]'::jsonb);
end;
$$;

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
             (select count(*) from public.responses y where y.author_id = r.author_id and y.kind = 'response' and y.status = 'live') as n,
             (select text from public.prompts where id = (array_agg(r.prompt_id order by r.live_at desc))[1]) as prompt_text
        from public.responses r
       where r.kind = 'response' and r.status = 'live' and r.author_id <> v_uid
         and (cardinality(p_watched_prompts) = 0 or r.prompt_id = any (p_watched_prompts))
         and not exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = r.author_id)
       group by r.author_id
       order by n desc
       limit greatest(1, least(p_limit, 10))
    ) x
  ), '[]'::jsonb);
end;
$$;

-- get_profile: the Replies count is real now.
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
    'response_count', (select count(*) from public.responses where author_id = p.id and kind = 'response' and status = 'live'),
    'reply_count', (select count(*) from public.responses where author_id = p.id and kind = 'reply' and status = 'live'),
    'follower_count', (select count(*) from public.follows where followee_id = p.id),
    'following_count', (select count(*) from public.follows where follower_id = p.id),
    'is_following', exists (select 1 from public.follows where follower_id = v_uid and followee_id = p.id),
    'follows_you', exists (select 1 from public.follows where follower_id = p.id and followee_id = v_uid),
    'pinned_response_id', p.pinned_response_id,
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

-- ---------------------------------------------------------------------------
-- Video replies: room, one video with its context, posting (Section 7)
-- ---------------------------------------------------------------------------

-- What a video replies to, for the card at the top of Reply-Watch, Record-Reply and PR-Reply.
-- A deleted target comes back with 'deleted': true and no card (A-Orphan, "Replying to a
-- deleted video").
create or replace function public.video_context(r public.responses, p_viewer uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  root public.responses%rowtype;
  target public.responses%rowtype;
begin
  if r.kind = 'response' then return jsonb_build_object('kind', 'response'); end if;
  select * into root from public.responses where id = r.root_response_id;
  select * into target from public.responses where id = r.reply_to_id;
  return jsonb_build_object(
    'kind', 'reply',
    'root', case when root.status = 'live' then public.response_card(root, p_viewer) else null end,
    'root_deleted', root.status is distinct from 'live',
    'reply_to', case when target.status = 'live' then public.response_card(target, p_viewer) else null end,
    'reply_to_deleted', target.status is distinct from 'live',
    'reply_to_is_root', r.reply_to_id = r.root_response_id,
    'prompt_text', (select text from public.prompts where id = r.prompt_id)
  );
end;
$$;

-- The room: root response, replies oldest first (the conversation reads top to bottom; the
-- order is not in the spec and is flagged in the phase report), with "x of N" positions.
create or replace function public.reply_room(p_root uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  root public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into root from public.responses where id = p_root and kind = 'response';
  if not found then raise exception 'response_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'root', case when root.status = 'live' or root.author_id = v_uid then public.response_card(root, v_uid) else null end,
    'root_deleted', root.status not in ('live', 'processing'),
    'prompt', (select public.prompt_card(p) from public.prompts p where p.id = root.prompt_id),
    'count', public.reply_count(root.id),
    'replies', coalesce((
      select jsonb_agg(public.response_card(r, v_uid) || jsonb_build_object(
               'reply_to_name', case when r.reply_to_id <> r.root_response_id
                                     then (select pr.name from public.responses x join public.profiles pr on pr.id = x.author_id where x.id = r.reply_to_id and x.status = 'live') end,
               'reply_to_deleted', r.reply_to_id <> r.root_response_id and not exists (select 1 from public.responses x where x.id = r.reply_to_id and x.status = 'live'))
             order by r.live_at asc)
      from public.responses r
      where r.root_response_id = root.id and r.kind = 'reply' and r.status = 'live'
    ), '[]'::jsonb)
  );
end;
$$;

-- One video (response or reply) with its context. Replaces get_response for replies.
create or replace function public.get_video(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into r from public.responses where id = p_id and (status = 'live' or author_id = v_uid);
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  return public.response_card(r, v_uid) || jsonb_build_object(
    'prompt', (select public.prompt_card(p) from public.prompts p where p.id = r.prompt_id),
    'context', public.video_context(r, v_uid));
end;
$$;

-- Post a video reply to a response or to another reply in the same room.
create or replace function public.post_reply(p_reply_to uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  target public.responses%rowtype;
  v_root uuid;
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.has_profile(v_uid) then raise exception 'profile_required' using errcode = 'P0001'; end if;
  if (select public_disclosure_ack_at from public.accounts where id = v_uid) is null then
    raise exception 'disclosure_required' using errcode = 'P0001';
  end if;
  select * into target from public.responses where id = p_reply_to and status = 'live';
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
  insert into public.responses (kind, prompt_id, root_response_id, reply_to_id, author_id, caption, duration_ms, mux_upload_id)
  values ('reply', target.prompt_id, v_root, target.id, v_uid, v_caption, p_duration_ms, p_upload_id)
  returning * into r;
  return public.response_card(r, v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Comments (Section 8)
-- ---------------------------------------------------------------------------
create or replace function public.comment_card(c public.comments, p_viewer uuid, p_response_author uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id,
    'response_id', c.response_id,
    'parent_id', c.parent_id,
    'thread_id', c.thread_id,
    'body', c.body,
    'created_at', c.created_at,
    'author', public.profile_card(c.author_id),
    'is_author', c.author_id = p_response_author,
    'is_own', c.author_id = p_viewer,
    'liked', exists (select 1 from public.likes l where l.user_id = p_viewer and l.target_kind = 'comment' and l.target_id = c.id)
  );
$$;

-- The sheet: count, the reply-room card, top-level comments oldest first with their replies.
create or replace function public.comments_list(p_response uuid, p_before timestamptz default null, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into r from public.responses where id = p_response and kind = 'response' and status = 'live';
  if not found then raise exception 'response_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'count', public.comment_count(r.id),
    'response', public.response_card(r, v_uid),
    'prompt_text', (select text from public.prompts where id = r.prompt_id),
    'video_replies', jsonb_build_object(
      'count', public.reply_count(r.id),
      'faces', (select coalesce(jsonb_agg(public.profile_card(x.author_id)), '[]'::jsonb)
                  from (select distinct on (author_id) author_id, live_at from public.responses
                         where root_response_id = r.id and kind = 'reply' and status = 'live'
                         order by author_id, live_at desc) x),
      'thumbnails', (select coalesce(jsonb_agg(x.mux_playback_id), '[]'::jsonb)
                       from (select mux_playback_id from public.responses
                              where root_response_id = r.id and kind = 'reply' and status = 'live'
                              order by live_at desc limit 3) x)),
    'comments', coalesce((
      select jsonb_agg(public.comment_card(c, v_uid, r.author_id) || jsonb_build_object(
               'replies', coalesce((select jsonb_agg(public.comment_card(x, v_uid, r.author_id) order by x.created_at asc)
                                      from public.comments x where x.thread_id = c.id and x.deleted_at is null), '[]'::jsonb))
             order by c.created_at asc)
      from (
        select * from public.comments c
         where c.response_id = r.id and c.parent_id is null and c.deleted_at is null
           and (p_before is null or c.created_at > p_before)
         order by c.created_at asc
         limit greatest(1, least(p_limit, 100))
      ) c
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.post_comment(p_response uuid, p_body text, p_parent uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  r public.responses%rowtype;
  c public.comments%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.has_profile(v_uid) then raise exception 'profile_required' using errcode = 'P0001'; end if;
  select * into r from public.responses where id = p_response and kind = 'response' and status = 'live';
  if not found then raise exception 'response_not_found' using errcode = 'P0001'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 300 then raise exception 'invalid_comment' using errcode = 'P0001'; end if;
  if p_parent is not null and not exists (select 1 from public.comments where id = p_parent and response_id = r.id and deleted_at is null) then
    raise exception 'invalid_parent' using errcode = 'P0001';
  end if;
  insert into public.comments (response_id, author_id, parent_id, body) values (r.id, v_uid, p_parent, v_body) returning * into c;
  return public.comment_card(c, v_uid, r.author_id) || jsonb_build_object('replies', '[]'::jsonb);
end;
$$;

-- Your own comments only (LV-CommentOwn). A response's author cannot delete other people's.
-- A top-level comment takes its thread with it (no board shows a deleted-comment placeholder;
-- flagged in the phase report).
create or replace function public.delete_comment(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.comments set deleted_at = now() where (id = p_id or thread_id = p_id) and deleted_at is null
     and exists (select 1 from public.comments own where own.id = p_id and own.author_id = v_uid);
  if not found then raise exception 'comment_not_found' using errcode = 'P0001'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Likes
-- ---------------------------------------------------------------------------
create or replace function public.like_video(p_video uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.responses where id = p_video and status = 'live') then
    raise exception 'video_not_found' using errcode = 'P0001';
  end if;
  insert into public.likes (user_id, target_kind, target_id) values (v_uid, 'video', p_video) on conflict do nothing;
  return public.like_count(p_video);
end;
$$;

create or replace function public.unlike_video(p_video uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  delete from public.likes where user_id = v_uid and target_kind = 'video' and target_id = p_video;
  return public.like_count(p_video);
end;
$$;

create or replace function public.like_comment(p_comment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.comments where id = p_comment and deleted_at is null) then
    raise exception 'comment_not_found' using errcode = 'P0001';
  end if;
  insert into public.likes (user_id, target_kind, target_id) values (v_uid, 'comment', p_comment) on conflict do nothing;
end;
$$;

create or replace function public.unlike_comment(p_comment uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  delete from public.likes where user_id = auth.uid() and target_kind = 'comment' and target_id = p_comment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity: written by triggers (Section 15)
-- ---------------------------------------------------------------------------
create or replace function public.activity_on_video_live()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_recipient uuid;
begin
  if not (old.status = 'processing' and new.status = 'live') then return new; end if;
  if new.kind = 'reply' then
    select author_id into v_recipient from public.responses where id = new.reply_to_id;
    if v_recipient is not null and v_recipient <> new.author_id then
      insert into public.activity (recipient_id, kind, actor_id, video_id, prompt_id)
      values (v_recipient, 'video_reply', new.author_id, new.id, new.prompt_id);
    end if;
  else
    -- "Maya, Adam and 2 others you follow responded to …": one row per follower.
    insert into public.activity (recipient_id, kind, actor_id, video_id, prompt_id)
    select f.follower_id, 'followed_responded', new.author_id, new.id, new.prompt_id
      from public.follows f where f.followee_id = new.author_id;
  end if;
  return new;
end;
$$;
create trigger responses_activity after update of status on public.responses for each row execute function public.activity_on_video_live();

create or replace function public.activity_on_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_response_author uuid;
  v_parent_author uuid;
begin
  select author_id into v_response_author from public.responses where id = new.response_id;
  if new.parent_id is null then
    if v_response_author <> new.author_id then
      insert into public.activity (recipient_id, kind, actor_id, video_id, comment_id) values (v_response_author, 'comment', new.author_id, new.response_id, new.id);
    end if;
  else
    select author_id into v_parent_author from public.comments where id = new.parent_id;
    if v_parent_author <> new.author_id then
      insert into public.activity (recipient_id, kind, actor_id, video_id, comment_id) values (v_parent_author, 'comment_reply', new.author_id, new.response_id, new.id);
    end if;
    -- A reply in a thread is still a comment on the response's author's response.
    if v_response_author <> new.author_id and v_response_author <> v_parent_author then
      insert into public.activity (recipient_id, kind, actor_id, video_id, comment_id) values (v_response_author, 'comment', new.author_id, new.response_id, new.id);
    end if;
  end if;
  return new;
end;
$$;
create trigger comments_activity after insert on public.comments for each row execute function public.activity_on_comment();

create or replace function public.activity_on_follow()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.activity (recipient_id, kind, actor_id) values (new.followee_id, 'follow', new.follower_id);
  return new;
end;
$$;
create trigger follows_activity after insert on public.follows for each row execute function public.activity_on_follow();

-- Likes on a video collapse into one row per recipient and video; the line is composed at read
-- time from the likes themselves, so unliking never leaves a stale count.
create or replace function public.activity_on_like()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid;
begin
  if tg_op = 'INSERT' then
    if new.target_kind <> 'video' then return new; end if;
    select author_id into v_author from public.responses where id = new.target_id;
    if v_author is null or v_author = new.user_id then return new; end if;
    insert into public.activity (recipient_id, kind, actor_id, video_id) values (v_author, 'like', new.user_id, new.target_id)
    on conflict (recipient_id, video_id) where kind = 'like'
    do update set actor_id = excluded.actor_id, updated_at = now();
    return new;
  else
    if old.target_kind = 'video' and public.like_count(old.target_id) = 0 then
      delete from public.activity where kind = 'like' and video_id = old.target_id;
    end if;
    return old;
  end if;
end;
$$;
create trigger likes_activity after insert or delete on public.likes for each row execute function public.activity_on_like();

-- ---------------------------------------------------------------------------
-- Activity: reading (Activity, X-Activity-Empty)
-- ---------------------------------------------------------------------------
create or replace function public.activity_row(a public.activity, p_viewer uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id,
    'kind', a.kind,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'read', a.read_at is not null,
    'actor', public.profile_card(a.actor_id),
    'following_actor', exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = a.actor_id),
    'video', (select jsonb_build_object('id', r.id, 'kind', r.kind, 'playback_id', r.mux_playback_id, 'caption', r.caption, 'status', r.status,
                                        'root_response_id', r.root_response_id, 'prompt_id', r.prompt_id, 'prompt_text', (select text from public.prompts where id = r.prompt_id))
                from public.responses r where r.id = a.video_id),
    'comment', (select jsonb_build_object('id', c.id, 'body', c.body, 'deleted', c.deleted_at is not null) from public.comments c where c.id = a.comment_id),
    'prompt', (select jsonb_build_object('id', p.id, 'text', p.text) from public.prompts p where p.id = a.prompt_id),
    'like_count', case when a.kind = 'like' then public.like_count(a.video_id) end
  );
$$;

-- The two most recent distinct people behind a grouped row ("Putu and Hana commented …").
create or replace function public.activity_actors(p_recipient uuid, p_kind text, p_video uuid, p_prompt uuid, p_unread boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.profile_card(x.actor_id) order by x.t desc), '[]'::jsonb)
    from (select a.actor_id, max(a.updated_at) as t
            from public.activity a
           where a.recipient_id = p_recipient and a.kind = p_kind
             and (p_video is null or a.video_id = p_video)
             and (p_prompt is null or a.prompt_id = p_prompt)
             and (a.read_at is null) = p_unread
           group by a.actor_id
           order by t desc
           limit 2) x;
$$;

-- New (unread) and This week (read, within 7 days). Comments on one response are grouped;
-- "people you follow responded" rows are grouped per prompt.
create or replace function public.activity_list(p_limit integer default 60)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return jsonb_build_object(
    'unread_count', (select count(*) from public.activity where recipient_id = v_uid and read_at is null),
    'tonight', (select public.prompt_card(p) from public.prompts p where p.status = 'live' and p.place_id is null and p.featured_on = (now() at time zone 'utc')::date limit 1),
    'rows', coalesce((
      select jsonb_agg(g.row order by (g.row->>'section' = 'new') desc, (g.row->>'kind' = 'video_reply') desc, g.ts desc)
      from (
        -- grouped comments: one row per (section, video)
        select max(a.updated_at) as ts,
               public.activity_row((array_agg(a.* order by a.updated_at desc))[1], v_uid)
                 || jsonb_build_object('section', case when bool_or(a.read_at is null) then 'new' else 'week' end,
                                       'actors', public.activity_actors(v_uid, 'comment', a.video_id, null, (a.read_at is null)),
                                       'actor_count', count(distinct a.actor_id),
                                       'count', count(*)) as row
          from public.activity a
         where a.recipient_id = v_uid and a.kind = 'comment' and (a.read_at is null or a.created_at > now() - interval '7 days')
         group by a.video_id, (a.read_at is null)
        union all
        -- grouped "people you follow responded": one row per (section, prompt)
        select max(a.updated_at),
               public.activity_row((array_agg(a.* order by a.updated_at desc))[1], v_uid)
                 || jsonb_build_object('section', case when bool_or(a.read_at is null) then 'new' else 'week' end,
                                       'actors', public.activity_actors(v_uid, 'followed_responded', null, a.prompt_id, (a.read_at is null)),
                                       'actor_count', count(distinct a.actor_id),
                                       'count', count(*))
          from public.activity a
         where a.recipient_id = v_uid and a.kind = 'followed_responded' and (a.read_at is null or a.created_at > now() - interval '7 days')
         group by a.prompt_id, (a.read_at is null)
        union all
        -- everything else: one row each
        select a.updated_at,
               public.activity_row(a, v_uid)
                 || jsonb_build_object('section', case when a.read_at is null then 'new' else 'week' end,
                                       'actors', jsonb_build_array(public.profile_card(a.actor_id)),
                                       'actor_count', case when a.kind = 'like' then public.like_count(a.video_id) else 1 end,
                                       'count', 1)
          from public.activity a
         where a.recipient_id = v_uid and a.kind not in ('comment', 'followed_responded') and (a.read_at is null or a.created_at > now() - interval '7 days')
      ) g
      limit greatest(1, least(p_limit, 200))
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.mark_activity_read()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.activity set read_at = now() where recipient_id = auth.uid() and read_at is null;
end;
$$;

create or replace function public.activity_unread_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.activity where recipient_id = auth.uid() and read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Notification preferences, tokens, the ask (Section 15)
-- ---------------------------------------------------------------------------
create or replace function public.notification_prefs_of(p_account uuid)
returns public.notification_prefs language sql stable security definer set search_path = '' as $$
  select coalesce((select np from public.notification_prefs np where np.account_id = p_account),
                  (p_account, false, true, true, true, true, false, true, true, false, now())::public.notification_prefs);
$$;

create or replace function public.get_notification_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  np public.notification_prefs;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  np := public.notification_prefs_of(v_uid);
  return jsonb_build_object(
    'ask', (select notification_ask from public.accounts where id = v_uid),
    'prefs', jsonb_build_object(
      'pause_all', np.pause_all, 'video_replies', np.video_replies, 'comments', np.comments, 'comment_replies', np.comment_replies,
      'new_followers', np.new_followers, 'followed_respond', np.followed_respond, 'tonight_prompt', np.tonight_prompt,
      'place_prompts', np.place_prompts, 'likes', np.likes));
end;
$$;

create or replace function public.update_notification_prefs(p_prefs jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  cur public.notification_prefs;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  cur := public.notification_prefs_of(v_uid);
  insert into public.notification_prefs as np (account_id, pause_all, video_replies, comments, comment_replies, new_followers, followed_respond, tonight_prompt, place_prompts, likes)
  values (v_uid,
          coalesce((p_prefs->>'pause_all')::boolean, cur.pause_all),
          coalesce((p_prefs->>'video_replies')::boolean, cur.video_replies),
          coalesce((p_prefs->>'comments')::boolean, cur.comments),
          coalesce((p_prefs->>'comment_replies')::boolean, cur.comment_replies),
          coalesce((p_prefs->>'new_followers')::boolean, cur.new_followers),
          coalesce((p_prefs->>'followed_respond')::boolean, cur.followed_respond),
          coalesce((p_prefs->>'tonight_prompt')::boolean, cur.tonight_prompt),
          coalesce((p_prefs->>'place_prompts')::boolean, cur.place_prompts),
          coalesce((p_prefs->>'likes')::boolean, cur.likes))
  on conflict (account_id) do update set
    pause_all = excluded.pause_all, video_replies = excluded.video_replies, comments = excluded.comments,
    comment_replies = excluded.comment_replies, new_followers = excluded.new_followers, followed_respond = excluded.followed_respond,
    tonight_prompt = excluded.tonight_prompt, place_prompts = excluded.place_prompts, likes = excluded.likes;
  return public.get_notification_state();
end;
$$;

-- The N-Prime timing lives on the account so it survives reinstalls.
create or replace function public.set_notification_ask(p_state text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  cur text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select notification_ask into cur from public.accounts where id = v_uid;
  if p_state = 'accepted' then
    update public.accounts set notification_ask = 'accepted' where id = v_uid;
  elsif p_state = 'declined' then
    update public.accounts set notification_ask = case cur when 'never' then 'declined_once' when 'declined_once' then 'declined_twice' else cur end where id = v_uid;
  else
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_token is null or p_token = '' or p_platform not in ('ios', 'android') then raise exception 'invalid_token' using errcode = 'P0001'; end if;
  insert into public.push_tokens (token, account_id, platform) values (p_token, v_uid, p_platform)
  on conflict (token) do update set account_id = excluded.account_id, platform = excluded.platform, updated_at = now();
end;
$$;

create or replace function public.remove_push_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  delete from public.push_tokens where token = p_token and account_id = auth.uid();
end;
$$;

create or replace function public.set_timezone(p_timezone text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_timezone' using errcode = 'P0001';
  end if;
  update public.accounts set timezone = p_timezone where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Push outbox: queued from activity by preference; comments grouped for 10 minutes.
-- ---------------------------------------------------------------------------
create or replace function public.queue_push_for_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  np public.notification_prefs;
  allowed boolean;
begin
  if tg_op = 'UPDATE' and new.kind <> 'like' then return new; end if;
  np := public.notification_prefs_of(new.recipient_id);
  if np.pause_all then return new; end if;
  allowed := case new.kind
    when 'video_reply' then np.video_replies
    when 'comment' then np.comments
    when 'comment_reply' then np.comment_replies
    when 'follow' then np.new_followers
    when 'followed_responded' then np.followed_respond
    when 'like' then np.likes
    else false end;
  if not allowed then return new; end if;
  if new.kind = 'comment' then
    insert into public.push_outbox (recipient_id, kind, activity_id, video_id, group_key, due_at)
    values (new.recipient_id, 'comment', new.id, new.video_id, new.recipient_id || ':comment:' || new.video_id, now() + interval '10 minutes')
    on conflict (group_key) where sent_at is null and group_key is not null do nothing;
  elsif new.kind = 'like' then
    insert into public.push_outbox (recipient_id, kind, activity_id, video_id, group_key, due_at)
    values (new.recipient_id, 'like', new.id, new.video_id, new.recipient_id || ':like:' || new.video_id, now() + interval '10 minutes')
    on conflict (group_key) where sent_at is null and group_key is not null do nothing;
  else
    insert into public.push_outbox (recipient_id, kind, activity_id, video_id, prompt_id) values (new.recipient_id, new.kind, new.id, new.video_id, new.prompt_id);
  end if;
  return new;
end;
$$;
create trigger activity_push after insert or update on public.activity for each row execute function public.queue_push_for_activity();

-- Tonight's prompt at about 18:30 in the account's timezone, once per local day.
create or replace function public.queue_tonight_prompt()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  with due as (
    select a.id as account_id, p.id as prompt_id
      from public.accounts a
      join public.prompts p on p.status = 'live' and p.place_id is null
       and p.featured_on = (now() at time zone coalesce(a.timezone, 'UTC'))::date
     where a.timezone is not null
       and (now() at time zone a.timezone)::time >= time '18:30'
       and (public.notification_prefs_of(a.id)).tonight_prompt
       and not (public.notification_prefs_of(a.id)).pause_all
       and exists (select 1 from public.push_tokens t where t.account_id = a.id)
       and not exists (select 1 from public.push_outbox o where o.recipient_id = a.id and o.kind = 'tonight_prompt' and o.prompt_id = p.id)
  )
  insert into public.push_outbox (recipient_id, kind, prompt_id)
  select account_id, 'tonight_prompt', prompt_id from due;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The example texts from SPEC.md Section 15.
create or replace function public.push_text(o public.push_outbox)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  a public.activity%rowtype;
  actor text;
  names text[];
  n integer;
begin
  if o.kind = 'tonight_prompt' then
    return 'Tonight: ' || (select text from public.prompts where id = o.prompt_id);
  end if;
  if o.kind = 'place_prompt' then
    return 'New prompt in ' || coalesce((select pl.name from public.prompts p join public.places pl on pl.id = p.place_id where p.id = o.prompt_id), '') || ': ' || (select text from public.prompts where id = o.prompt_id);
  end if;
  select * into a from public.activity where id = o.activity_id;
  if not found then return null; end if;
  actor := (select name from public.profiles where id = a.actor_id);
  if o.kind = 'video_reply' then
    return actor || ' replied to your ' || (select case when x.kind = 'reply' then 'reply' else 'response' end from public.responses r join public.responses x on x.id = r.reply_to_id where r.id = a.video_id) || ' with a video';
  elsif o.kind = 'comment' then
    -- Everyone who commented on this response since the previous notification, first names.
    select array_agg(distinct split_part(p.name, ' ', 1)), count(distinct p.id) into names, n
      from public.activity x join public.profiles p on p.id = x.actor_id
     where x.recipient_id = o.recipient_id and x.kind = 'comment' and x.video_id = o.video_id and x.created_at >= o.created_at - interval '10 minutes';
    return case when n <= 1 then actor
                when n = 2 then names[1] || ' and ' || names[2]
                else names[1] || ', ' || names[2] || ' and ' || (n - 2) || ' others' end || ' commented on your response';
  elsif o.kind = 'comment_reply' then
    return actor || ' replied to your comment';
  elsif o.kind = 'follow' then
    return actor || ' started following you';
  elsif o.kind = 'followed_responded' then
    return split_part(actor, ' ', 1) || ' responded to ' || (select text from public.prompts where id = a.prompt_id);
  elsif o.kind = 'like' then
    n := public.like_count(a.video_id);
    return case when n <= 1 then actor || ' liked your response' else split_part(actor, ' ', 1) || ' and ' || (n - 1) || ' others liked your response' end;
  end if;
  return null;
end;
$$;

-- What the send-push function sends: due rows with their composed text and the tokens.
-- Service role only.
create or replace function public.push_due(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id,
      'kind', o.kind,
      'recipient_id', o.recipient_id,
      'tokens', (select coalesce(jsonb_agg(jsonb_build_object('token', t.token, 'platform', t.platform)), '[]'::jsonb) from public.push_tokens t where t.account_id = o.recipient_id),
      'body', public.push_text(o),
      'data', jsonb_build_object('kind', o.kind, 'video_id', o.video_id, 'prompt_id', o.prompt_id, 'activity_id', o.activity_id)
    ) order by o.id)
    from public.push_outbox o
    where o.id in (select id from public.push_outbox where sent_at is null and due_at <= now() and attempts < 5 order by id limit greatest(1, least(p_limit, 500)))
  ), '[]'::jsonb);
end;
$$;

create or replace function public.push_mark(p_id bigint, p_ok boolean, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.push_outbox
     set sent_at = case when p_ok then now() end,
         attempts = attempts + 1,
         last_error = p_error
   where id = p_id;
$$;

-- Dead tokens reported by the push service.
create or replace function public.push_drop_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- Scheduling: pg_cron drains the outbox through pg_net every minute and queues tonight's
-- prompt every 10 minutes. The function URL and its key live in Vault (never in a table the
-- app can read); until they are set the sender does nothing. supabase/README.md says how.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.run_push_sender()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'push_function_key';
  if v_url is null or v_key is null then return; end if;
  if not exists (select 1 from public.push_outbox where sent_at is null and due_at <= now() and attempts < 5) then return; end if;
  perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key), body := '{}'::jsonb);
end;
$$;

select cron.schedule('send-push', '* * * * *', $$select public.run_push_sender()$$);
select cron.schedule('tonight-prompt', '*/10 * * * *', $$select public.queue_tonight_prompt()$$);

-- ---------------------------------------------------------------------------
-- Privileges
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

-- phase 4
grant execute on function public.profile_replies(uuid, timestamptz, integer) to authenticated;
grant execute on function public.reply_room(uuid) to authenticated;
grant execute on function public.get_video(uuid) to authenticated;
grant execute on function public.post_reply(uuid, text, text, integer) to authenticated;
grant execute on function public.comments_list(uuid, timestamptz, integer) to authenticated;
grant execute on function public.post_comment(uuid, text, uuid) to authenticated;
grant execute on function public.delete_comment(uuid) to authenticated;
grant execute on function public.like_video(uuid) to authenticated;
grant execute on function public.unlike_video(uuid) to authenticated;
grant execute on function public.like_comment(uuid) to authenticated;
grant execute on function public.unlike_comment(uuid) to authenticated;
grant execute on function public.activity_list(integer) to authenticated;
grant execute on function public.mark_activity_read() to authenticated;
grant execute on function public.activity_unread_count() to authenticated;
grant execute on function public.get_notification_state() to authenticated;
grant execute on function public.update_notification_prefs(jsonb) to authenticated;
grant execute on function public.set_notification_ask(text) to authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.remove_push_token(text) to authenticated;
grant execute on function public.set_timezone(text) to authenticated;
-- push_due, push_text, push_mark, push_drop_token, queue_tonight_prompt, run_push_sender,
-- mark_response_live, team_*: service role only (it bypasses grants).
