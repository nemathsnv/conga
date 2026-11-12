-- Phase 5: safety and web (SPEC.md Sections 16, 17, 18, 20).
-- Blocks, reports, deleting your own videos and account, the enforcement ladder with notices and
-- review requests, moderator functions with a log, and the public web read functions.
-- Every read path now applies can_see(viewer, author): blocks in either direction and deleted
-- accounts hide people from each other; what you reported never shows for you again.

-- ---------------------------------------------------------------------------
-- Tables and columns
-- ---------------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.accounts (id) on delete cascade,
  blocked_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
comment on table public.blocks is 'Silent, both directions hidden (SPEC.md Section 17). Follows are removed both ways on block.';
create index blocks_blocked_idx on public.blocks (blocked_id);
alter table public.blocks enable row level security;
create policy "blocks: read your own" on public.blocks for select to authenticated using (blocker_id = (select auth.uid()));

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.accounts (id) on delete cascade,
  target_kind text not null check (target_kind in ('video', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null check (reason in ('harassment', 'hate', 'nudity', 'violence', 'self_harm', 'private_info', 'spam', 'under_18', 'other')),
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by text,
  action_id uuid
);
comment on table public.reports is 'Anonymous reports (SPEC.md Section 17). The reporter is never shown to anyone outside the team.';
create index reports_open_idx on public.reports (created_at) where status = 'open';
create index reports_reporter_idx on public.reports (reporter_id, target_kind, target_id);
alter table public.reports enable row level security;

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator text not null,
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind text not null check (kind in ('remove', 'warn', 'restrict', 'suspend', 'restore', 'remove_attribution')),
  target_kind text check (target_kind in ('video', 'comment', 'account', 'suggestion')),
  target_id uuid,
  reason text not null,
  note text,
  restrict_until timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.moderation_actions is 'Every moderator action: who, when, why (SPEC.md Section 17). reason is shown to the person; note is internal.';
create index moderation_actions_account_idx on public.moderation_actions (account_id, created_at desc);
alter table public.moderation_actions enable row level security;
create policy "moderation_actions: read your own" on public.moderation_actions for select to authenticated using (account_id = (select auth.uid()));

create table public.review_requests (
  action_id uuid primary key references public.moderation_actions (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  outcome text check (outcome in ('upheld', 'reversed')),
  decided_at timestamptz,
  decided_by text,
  constraint review_requests_decided_pair check ((outcome is null) = (decided_at is null))
);
comment on table public.review_requests is 'One review request per moderation decision (SPEC.md Section 17). The outcome is sent as a notification.';
alter table public.review_requests enable row level security;
create policy "review_requests: read your own" on public.review_requests for select to authenticated using (account_id = (select auth.uid()));

alter table public.accounts
  add column moderation_status text not null default 'active' check (moderation_status in ('active', 'restricted', 'suspended')),
  add column restricted_until timestamptz,
  add column moderation_action_id uuid references public.moderation_actions (id) on delete set null,
  add column deleted_at timestamptz;
comment on column public.accounts.deleted_at is 'Soft delete (SPEC.md Section 18): hidden from everyone for 30 days, restored by signing in, purged after day 30.';
comment on column public.accounts.moderation_status is 'The enforcement ladder (SPEC.md Section 17): restricted = posting paused until restricted_until; suspended = cannot use the app.';

alter table public.responses
  add column removed_action_id uuid references public.moderation_actions (id) on delete set null;
alter table public.comments
  add column removed_action_id uuid references public.moderation_actions (id) on delete set null;

-- Activity gains the notice kinds; moderation notices are always pushed.
alter table public.activity drop constraint activity_kind_check;
alter table public.activity add constraint activity_kind_check check (kind in ('video_reply', 'comment', 'comment_reply', 'follow', 'like', 'followed_responded', 'removed', 'restricted', 'suspended', 'review_outcome'));
alter table public.activity add column moderation_action_id uuid references public.moderation_actions (id) on delete cascade;
alter table public.push_outbox drop constraint push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check check (kind in ('video_reply', 'comment', 'comment_reply', 'follow', 'like', 'followed_responded', 'tonight_prompt', 'place_prompt', 'removed', 'restricted', 'suspended', 'review_outcome'));

-- ---------------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------------
-- False when the viewer and the author have blocked each other, or the author's account is gone.
create or replace function public.can_see(p_viewer uuid, p_author uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_author is not null
     and not exists (select 1 from public.accounts a where a.id = p_author and a.deleted_at is not null)
     and (p_viewer is null or p_viewer = p_author or not exists (
           select 1 from public.blocks b
            where (b.blocker_id = p_viewer and b.blocked_id = p_author)
               or (b.blocker_id = p_author and b.blocked_id = p_viewer)));
$$;

create or replace function public.reported_by(p_viewer uuid, p_kind text, p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_viewer is not null and exists (select 1 from public.reports r where r.reporter_id = p_viewer and r.target_kind = p_kind and r.target_id = p_id);
$$;

-- A live video the viewer may watch.
create or replace function public.video_visible(r public.responses, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select r.status = 'live' and public.can_see(p_viewer, r.author_id) and not public.reported_by(p_viewer, 'video', r.id);
$$;

-- Posting is refused while restricted or suspended (SPEC.md Section 17).
create or replace function public.assert_can_post(p_account uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  a public.accounts%rowtype;
begin
  select * into a from public.accounts where id = p_account;
  if a.moderation_status = 'suspended' then raise exception 'suspended' using errcode = 'P0001'; end if;
  if a.moderation_status = 'restricted' and a.restricted_until is not null and a.restricted_until > now() then
    raise exception 'posting_paused' using errcode = 'P0001';
  end if;
  if a.deleted_at is not null then raise exception 'account_deleted' using errcode = 'P0001'; end if;
end;
$$;

-- Interacting with someone hidden from you is refused (nothing leaks either way).
create or replace function public.assert_can_see(p_viewer uuid, p_author uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_see(p_viewer, p_author) then raise exception 'not_available' using errcode = 'P0001'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Counts and cards: deleted accounts' videos never count; the viewer's own blocks do not change
-- public counts (they would reveal the block).
-- ---------------------------------------------------------------------------
create or replace function public.response_count(p_prompt uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.responses r
   where r.prompt_id = p_prompt and r.kind = 'response' and r.status = 'live' and public.can_see(null, r.author_id);
$$;

-- Reply and comment counts are what the viewer can actually open (a room or sheet never
-- says "3 replies" and shows two).
create or replace function public.reply_count(p_root uuid, p_viewer uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.responses r
   where r.root_response_id = p_root and r.kind = 'reply' and public.video_visible(r, p_viewer);
$$;
create or replace function public.reply_count(p_root uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select public.reply_count(p_root, null);
$$;

create or replace function public.comment_count(p_response uuid, p_viewer uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.comments c
   where c.response_id = p_response and c.deleted_at is null and public.can_see(p_viewer, c.author_id) and not public.reported_by(p_viewer, 'comment', c.id);
$$;
create or replace function public.comment_count(p_response uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select public.comment_count(p_response, null);
$$;

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
    'comment_count', case when r.kind = 'response' then public.comment_count(r.id, p_viewer) else 0 end,
    'reply_count', case when r.kind = 'response' then public.reply_count(r.id, p_viewer) else 0 end
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
                from (select author_id from public.responses where prompt_id = p.id and kind = 'response' and status = 'live' and public.can_see(null, author_id) order by live_at desc limit 3) x)
  );
$$;

-- ---------------------------------------------------------------------------
-- Feeds, player, rooms, comments, profiles: visibility applied
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
                     where r.prompt_id = p.id and r.kind = 'response' and public.video_visible(r, v_uid)
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
       where r.kind = 'response' and public.video_visible(r, v_uid) and (p_before is null or r.live_at < p_before)
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
    -- An entry you cannot watch (deleted, removed, blocked, reported) is "unavailable", never why.
    'entry_status', (select case when public.video_visible(r, v_uid) then 'live' else 'unavailable' end from public.responses r where r.id = p_entry),
    'responses', coalesce((
      select jsonb_agg(public.response_card(r, v_uid) order by
        (r.id = p_entry) desc,
        (not (r.id = any (p_seen)) and exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = r.author_id)) desc,
        r.live_at desc)
      from public.responses r
      where r.prompt_id = p_prompt and r.kind = 'response' and public.video_visible(r, v_uid)
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
  select * into r from public.responses where id = p_id and (public.video_visible(responses, v_uid) or (author_id = v_uid and status in ('processing', 'live')));
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  return public.response_card(r, v_uid) || jsonb_build_object('prompt', (select public.prompt_card(p) from public.prompts p where p.id = r.prompt_id));
end;
$$;

create or replace function public.get_video(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into r from public.responses where id = p_id and (public.video_visible(responses, v_uid) or (author_id = v_uid and status in ('processing', 'live')));
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  return public.response_card(r, v_uid) || jsonb_build_object(
    'prompt', (select public.prompt_card(p) from public.prompts p where p.id = r.prompt_id),
    'context', public.video_context(r, v_uid));
end;
$$;

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
    'root', case when public.video_visible(root, p_viewer) then public.response_card(root, p_viewer) else null end,
    'root_deleted', not public.video_visible(root, p_viewer),
    'reply_to', case when public.video_visible(target, p_viewer) then public.response_card(target, p_viewer) else null end,
    'reply_to_deleted', not public.video_visible(target, p_viewer),
    'reply_to_is_root', r.reply_to_id = r.root_response_id,
    'prompt_text', (select text from public.prompts where id = r.prompt_id)
  );
end;
$$;

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
    'root', case when public.video_visible(root, v_uid) or (root.author_id = v_uid and root.status = 'processing') then public.response_card(root, v_uid) else null end,
    'root_deleted', not public.video_visible(root, v_uid) and root.status <> 'processing',
    'prompt', (select public.prompt_card(p) from public.prompts p where p.id = root.prompt_id),
    'count', public.reply_count(root.id, v_uid),
    'replies', coalesce((
      select jsonb_agg(public.response_card(r, v_uid) || jsonb_build_object(
               'reply_to_name', case when r.reply_to_id <> r.root_response_id
                                     then (select pr.name from public.responses x join public.profiles pr on pr.id = x.author_id where x.id = r.reply_to_id and public.video_visible(x, v_uid)) end,
               'reply_to_deleted', r.reply_to_id <> r.root_response_id and not exists (select 1 from public.responses x where x.id = r.reply_to_id and public.video_visible(x, v_uid)))
             order by r.live_at asc)
      from public.responses r
      where r.root_response_id = root.id and r.kind = 'reply' and public.video_visible(r, v_uid)
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.comments_list(p_response uuid, p_before timestamptz default null, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into r from public.responses where id = p_response and kind = 'response' and public.video_visible(responses, v_uid);
  if not found then raise exception 'response_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'count', public.comment_count(r.id, v_uid),
    'response', public.response_card(r, v_uid),
    'prompt_text', (select text from public.prompts where id = r.prompt_id),
    'video_replies', jsonb_build_object(
      'count', public.reply_count(r.id, v_uid),
      'faces', (select coalesce(jsonb_agg(public.profile_card(x.author_id)), '[]'::jsonb)
                  from (select distinct on (author_id) author_id, live_at from public.responses
                         where root_response_id = r.id and kind = 'reply' and public.video_visible(responses, v_uid)
                         order by author_id, live_at desc) x),
      'thumbnails', (select coalesce(jsonb_agg(x.mux_playback_id), '[]'::jsonb)
                       from (select mux_playback_id from public.responses
                              where root_response_id = r.id and kind = 'reply' and public.video_visible(responses, v_uid)
                              order by live_at desc limit 3) x)),
    'comments', coalesce((
      select jsonb_agg(public.comment_card(c, v_uid, r.author_id) || jsonb_build_object(
               'replies', coalesce((select jsonb_agg(public.comment_card(x, v_uid, r.author_id) order by x.created_at asc)
                                      from public.comments x where x.thread_id = c.id and x.deleted_at is null
                                        and public.can_see(v_uid, x.author_id) and not public.reported_by(v_uid, 'comment', x.id)), '[]'::jsonb))
             order by c.created_at asc)
      from (
        select * from public.comments c
         where c.response_id = r.id and c.parent_id is null
           and (
             (c.deleted_at is null and public.can_see(v_uid, c.author_id) and not public.reported_by(v_uid, 'comment', c.id))
             or exists (select 1 from public.comments x where x.thread_id = c.id and x.deleted_at is null
                          and public.can_see(v_uid, x.author_id) and not public.reported_by(v_uid, 'comment', x.id))
           )
           and (p_before is null or c.created_at > p_before)
         order by c.created_at asc
         limit greatest(1, least(p_limit, 100))
      ) c
    ), '[]'::jsonb)
  );
end;
$$;

-- comment_card: a comment hidden from the viewer (blocked, reported, removed) reads as deleted.
create or replace function public.comment_card(c public.comments, p_viewer uuid, p_response_author uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id,
    'response_id', c.response_id,
    'parent_id', c.parent_id,
    'thread_id', c.thread_id,
    'deleted', c.deleted_at is not null or not public.can_see(p_viewer, c.author_id) or public.reported_by(p_viewer, 'comment', c.id),
    'body', case when c.deleted_at is null and public.can_see(p_viewer, c.author_id) and not public.reported_by(p_viewer, 'comment', c.id) then c.body end,
    'created_at', c.created_at,
    'author', case when c.deleted_at is null and public.can_see(p_viewer, c.author_id) then public.profile_card(c.author_id) end,
    'is_author', c.deleted_at is null and c.author_id = p_response_author,
    'is_own', c.deleted_at is null and c.author_id = p_viewer,
    'liked', c.deleted_at is null and exists (select 1 from public.likes l where l.user_id = p_viewer and l.target_kind = 'comment' and l.target_id = c.id)
  );
$$;

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
  if not found or not public.can_see(v_uid, p.id) then return null; end if;
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
                               and public.can_see(v_uid, f.follower_id)
                             limit 3) f),
    'followed_by_count', (select count(*) from public.follows f
                            where f.followee_id = p.id
                              and exists (select 1 from public.follows mine where mine.follower_id = v_uid and mine.followee_id = f.follower_id)
                              and public.can_see(v_uid, f.follower_id)),
    'blocked', exists (select 1 from public.blocks where blocker_id = v_uid and blocked_id = p.id)
  );
end;
$$;

create or replace function public.profile_responses(p_profile uuid, p_before timestamptz default null, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.can_see(v_uid, p_profile) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(public.response_card(r, v_uid) || jsonb_build_object(
             'prompt_text', (select text from public.prompts where id = r.prompt_id),
             'pinned', (select pinned_response_id = r.id from public.profiles where id = p_profile))
           order by ((select pinned_response_id from public.profiles where id = p_profile) = r.id) desc nulls last, coalesce(r.live_at, r.created_at) desc)
    from (
      select * from public.responses r
       where r.author_id = p_profile and r.kind = 'response'
         and (public.video_visible(r, v_uid) or (r.author_id = v_uid and r.status = 'processing'))
         and (p_before is null or coalesce(r.live_at, r.created_at) < p_before)
       order by coalesce(r.live_at, r.created_at) desc
       limit greatest(1, least(p_limit, 60))
    ) r
  ), '[]'::jsonb);
end;
$$;

create or replace function public.profile_replies(p_profile uuid, p_before timestamptz default null, p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.can_see(v_uid, p_profile) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(public.response_card(r, v_uid) || jsonb_build_object(
             'prompt_text', (select text from public.prompts where id = r.prompt_id),
             'reply_to_name', (select pr.name from public.responses x join public.profiles pr on pr.id = x.author_id where x.id = r.reply_to_id and public.video_visible(x, v_uid)))
           order by coalesce(r.live_at, r.created_at) desc)
    from (
      select * from public.responses r
       where r.author_id = p_profile and r.kind = 'reply'
         and (public.video_visible(r, v_uid) or (r.author_id = v_uid and r.status = 'processing'))
         and (p_before is null or coalesce(r.live_at, r.created_at) < p_before)
       order by coalesce(r.live_at, r.created_at) desc
       limit greatest(1, least(p_limit, 60))
    ) r
  ), '[]'::jsonb);
end;
$$;

create or replace function public.follow_list(p_profile uuid, p_kind text, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_kind not in ('followers', 'following') then raise exception 'invalid_kind' using errcode = 'P0001'; end if;
  if not public.can_see(v_uid, p_profile) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(public.profile_card(x.id) || jsonb_build_object(
             'is_following', exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = x.id),
             'follows_you', exists (select 1 from public.follows f where f.follower_id = x.id and f.followee_id = v_uid),
             'is_self', x.id = v_uid) order by x.created_at desc)
    from (
      select case when p_kind = 'followers' then f.follower_id else f.followee_id end as id, f.created_at
        from public.follows f
       where case when p_kind = 'followers' then f.followee_id else f.follower_id end = p_profile
       order by f.created_at desc
       limit greatest(1, least(p_limit, 200))
    ) x
    where public.can_see(v_uid, x.id)
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
       where r.kind = 'response' and public.video_visible(r, v_uid) and r.author_id <> v_uid
         and (cardinality(p_watched_prompts) = 0 or r.prompt_id = any (p_watched_prompts))
         and not exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = r.author_id)
       group by r.author_id
       order by n desc
       limit greatest(1, least(p_limit, 10))
    ) x
  ), '[]'::jsonb);
end;
$$;

-- Interactions with hidden people are refused; posting respects the ladder.
create or replace function public.follow_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_user = v_uid then raise exception 'cannot_follow_self' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'profile_not_found' using errcode = 'P0001'; end if;
  perform public.assert_can_see(v_uid, p_user);
  insert into public.follows (follower_id, followee_id) values (v_uid, p_user) on conflict do nothing;
end;
$$;

create or replace function public.post_response(p_prompt uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
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
  insert into public.responses (kind, prompt_id, root_response_id, reply_to_id, author_id, caption, duration_ms, mux_upload_id)
  values ('reply', target.prompt_id, v_root, target.id, v_uid, v_caption, p_duration_ms, p_upload_id)
  returning * into r;
  return public.response_card(r, v_uid);
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
  perform public.assert_can_post(v_uid);
  select * into r from public.responses where id = p_response and kind = 'response' and public.video_visible(responses, v_uid);
  if not found then raise exception 'response_not_found' using errcode = 'P0001'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 300 then raise exception 'invalid_comment' using errcode = 'P0001'; end if;
  if p_parent is not null and not exists (select 1 from public.comments x where x.id = p_parent and x.response_id = r.id and x.deleted_at is null and public.can_see(v_uid, x.author_id)) then
    raise exception 'invalid_parent' using errcode = 'P0001';
  end if;
  insert into public.comments (response_id, author_id, parent_id, body) values (r.id, v_uid, p_parent, v_body) returning * into c;
  return public.comment_card(c, v_uid, r.author_id) || jsonb_build_object('replies', '[]'::jsonb);
end;
$$;

create or replace function public.like_video(p_video uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.responses r where r.id = p_video and public.video_visible(r, v_uid)) then
    raise exception 'video_not_found' using errcode = 'P0001';
  end if;
  insert into public.likes (user_id, target_kind, target_id) values (v_uid, 'video', p_video) on conflict do nothing;
  return public.like_count(p_video);
end;
$$;

-- Activity never shows people hidden from you, nor videos that are gone.
create or replace function public.activity_list(p_limit integer default 60)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  return jsonb_build_object(
    'unread_count', (select count(*) from public.activity a where a.recipient_id = v_uid and a.read_at is null and public.can_see(v_uid, a.actor_id) ),
    'tonight', (select public.prompt_card(p) from public.prompts p where p.status = 'live' and p.place_id is null and p.featured_on = (now() at time zone 'utc')::date limit 1),
    'rows', coalesce((
      select jsonb_agg(g.row order by (g.row->>'section' = 'new') desc, (g.row->>'kind' in ('removed', 'restricted', 'suspended', 'review_outcome')) desc, (g.row->>'kind' = 'video_reply') desc, g.ts desc)
      from (
        select max(a.updated_at) as ts,
               public.activity_row((array_agg(a.* order by a.updated_at desc))[1], v_uid)
                 || jsonb_build_object('section', case when bool_or(a.read_at is null) then 'new' else 'week' end,
                                       'actors', public.activity_actors(v_uid, 'comment', a.video_id, null, (a.read_at is null)),
                                       'actor_count', count(distinct a.actor_id),
                                       'count', count(*)) as row
          from public.activity a
         where a.recipient_id = v_uid and a.kind = 'comment' and (a.read_at is null or a.created_at > now() - interval '7 days')
           and public.can_see(v_uid, a.actor_id)
         group by a.video_id, (a.read_at is null)
        union all
        select max(a.updated_at),
               public.activity_row((array_agg(a.* order by a.updated_at desc))[1], v_uid)
                 || jsonb_build_object('section', case when bool_or(a.read_at is null) then 'new' else 'week' end,
                                       'actors', public.activity_actors(v_uid, 'followed_responded', null, a.prompt_id, (a.read_at is null)),
                                       'actor_count', count(distinct a.actor_id),
                                       'count', count(*))
          from public.activity a
         where a.recipient_id = v_uid and a.kind = 'followed_responded' and (a.read_at is null or a.created_at > now() - interval '7 days')
           and public.can_see(v_uid, a.actor_id)
         group by a.prompt_id, (a.read_at is null)
        union all
        select a.updated_at,
               public.activity_row(a, v_uid)
                 || jsonb_build_object('section', case when a.read_at is null then 'new' else 'week' end,
                                       'actors', case when a.actor_id is null then '[]'::jsonb else jsonb_build_array(public.profile_card(a.actor_id)) end,
                                       'actor_count', case when a.kind = 'like' then public.like_count(a.video_id) else 1 end,
                                       'count', 1)
          from public.activity a
         where a.recipient_id = v_uid and a.kind not in ('comment', 'followed_responded') and (a.read_at is null or a.created_at > now() - interval '7 days')
           and (a.actor_id is null or public.can_see(v_uid, a.actor_id))
      ) g
      limit greatest(1, least(p_limit, 200))
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.activity_actors(p_recipient uuid, p_kind text, p_video uuid, p_prompt uuid, p_unread boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.profile_card(x.actor_id) order by x.t desc), '[]'::jsonb)
    from (select a.actor_id, max(a.updated_at) as t
            from public.activity a
           where a.recipient_id = p_recipient and a.kind = p_kind
             and (p_video is null or a.video_id = p_video)
             and (p_prompt is null or a.prompt_id = p_prompt)
             and (a.read_at is null) = p_unread
             and public.can_see(p_recipient, a.actor_id)
           group by a.actor_id
           order by t desc
           limit 2) x;
$$;

create or replace function public.activity_row(a public.activity, p_viewer uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id,
    'kind', a.kind,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'read', a.read_at is not null,
    'actor', case when a.actor_id is null then null else public.profile_card(a.actor_id) end,
    'following_actor', exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = a.actor_id),
    'video', (select jsonb_build_object('id', r.id, 'kind', r.kind, 'playback_id', r.mux_playback_id, 'caption', r.caption, 'status', r.status,
                                        'root_response_id', r.root_response_id, 'prompt_id', r.prompt_id, 'prompt_text', (select text from public.prompts where id = r.prompt_id))
                from public.responses r where r.id = a.video_id),
    'comment', (select jsonb_build_object('id', c.id, 'body', c.body, 'deleted', c.deleted_at is not null) from public.comments c where c.id = a.comment_id),
    'prompt', (select jsonb_build_object('id', p.id, 'text', p.text) from public.prompts p where p.id = a.prompt_id),
    'like_count', case when a.kind = 'like' then public.like_count(a.video_id) end,
    'moderation_action_id', a.moderation_action_id
  );
$$;

-- Pushes: nothing about someone hidden from you; moderation notices are always sent.
create or replace function public.queue_push_for_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  np public.notification_prefs;
  allowed boolean;
begin
  if tg_op = 'UPDATE' and new.kind <> 'like' then return new; end if;
  if new.kind in ('removed', 'restricted', 'suspended', 'review_outcome') then
    insert into public.push_outbox (recipient_id, kind, activity_id) values (new.recipient_id, new.kind, new.id);
    return new;
  end if;
  if not public.can_see(new.recipient_id, new.actor_id) then return new; end if;
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

create or replace function public.push_text(o public.push_outbox)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  a public.activity%rowtype;
  m public.moderation_actions%rowtype;
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
  if o.kind in ('removed', 'restricted', 'suspended', 'review_outcome') then
    select * into m from public.moderation_actions where id = a.moderation_action_id;
    return case o.kind
      when 'removed' then 'We removed one of your ' || case when m.target_kind = 'comment' then 'comments' else (select case when x.kind = 'reply' then 'video replies' else 'responses' end from public.responses x where x.id = m.target_id) end
      when 'restricted' then 'Posting is paused until ' || to_char(m.restrict_until, 'FMDD Month')
      when 'suspended' then 'Your account is suspended'
      when 'review_outcome' then (select case r.outcome when 'reversed' then 'We reviewed it again and reversed the decision.' else 'We reviewed it again. The decision stands.' end from public.review_requests r where r.action_id = m.id)
    end;
  end if;
  actor := (select name from public.profiles where id = a.actor_id);
  if o.kind = 'video_reply' then
    return actor || ' replied to your ' || (select case when x.kind = 'reply' then 'reply' else 'response' end from public.responses r join public.responses x on x.id = r.reply_to_id where r.id = a.video_id) || ' with a video';
  elsif o.kind = 'comment' then
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

-- ---------------------------------------------------------------------------
-- Report (SF-Report, SF-Reported)
-- ---------------------------------------------------------------------------
create or replace function public.report_item(p_kind text, p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_kind = 'video' then select author_id into v_author from public.responses where id = p_id;
  elsif p_kind = 'comment' then select author_id into v_author from public.comments where id = p_id;
  elsif p_kind = 'profile' then select id into v_author from public.profiles where id = p_id;
  else raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  if v_author is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_author = v_uid then raise exception 'cannot_report_self' using errcode = 'P0001'; end if;
  insert into public.reports (reporter_id, target_kind, target_id, reason) values (v_uid, p_kind, p_id, p_reason);
  -- The author, for the Block offer on SF-Reported.
  return public.profile_card(v_author);
end;
$$;

-- ---------------------------------------------------------------------------
-- Block (SF-Block, LV-Blocked)
-- ---------------------------------------------------------------------------
create or replace function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if p_user = v_uid then raise exception 'cannot_block_self' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'profile_not_found' using errcode = 'P0001'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_user) on conflict do nothing;
  delete from public.follows where (follower_id = v_uid and followee_id = p_user) or (follower_id = p_user and followee_id = v_uid);
  -- Nothing more about each other: pending pushes between them are dropped.
  delete from public.push_outbox o using public.activity a
   where o.activity_id = a.id and o.sent_at is null
     and ((a.recipient_id = v_uid and a.actor_id = p_user) or (a.recipient_id = p_user and a.actor_id = v_uid));
end;
$$;

create or replace function public.unblock_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user;
end;
$$;

create or replace function public.blocked_list()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.profile_card(b.blocked_id) order by b.created_at desc), '[]'::jsonb)
    from public.blocks b where b.blocker_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Delete your own video (SF-Delete) and your account (SF-DeleteAccount)
-- ---------------------------------------------------------------------------
create or replace function public.delete_video(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.responses set status = 'deleted', deleted_at = now()
   where id = p_id and author_id = v_uid and status in ('processing', 'live');
  if not found then raise exception 'video_not_found' using errcode = 'P0001'; end if;
  update public.profiles set pinned_response_id = null where id = v_uid and pinned_response_id = p_id;
  delete from public.push_outbox where video_id = p_id and sent_at is null;
end;
$$;

-- Needs a sign-in no older than ten minutes ("confirm with the same sign-in method first").
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
end;
$$;

-- Signing back in within 30 days restores everything; get_onboarding_state does it.
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

-- Day 30: the auth user row goes, and everything cascades.
create or replace function public.purge_deleted_accounts()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  delete from auth.users u using public.accounts a
   where a.id = u.id and a.deleted_at is not null and a.deleted_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
select cron.schedule('purge-deleted-accounts', '15 3 * * *', $$select public.purge_deleted_accounts()$$);

-- ---------------------------------------------------------------------------
-- Notices and review requests (A-Removed, A-Restricted, LV-Suspended, LV-ReviewRequested)
-- ---------------------------------------------------------------------------
create or replace function public.get_notice(p_action uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  m public.moderation_actions%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into m from public.moderation_actions where id = p_action and account_id = v_uid;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'id', m.id,
    'kind', m.kind,
    'reason', m.reason,
    'created_at', m.created_at,
    'restrict_until', m.restrict_until,
    'target_kind', m.target_kind,
    'video', (select jsonb_build_object('id', r.id, 'kind', r.kind, 'playback_id', r.mux_playback_id, 'caption', r.caption, 'created_at', r.created_at,
                                        'prompt_text', (select text from public.prompts where id = r.prompt_id))
                from public.responses r where m.target_kind = 'video' and r.id = m.target_id),
    'comment', (select jsonb_build_object('id', c.id, 'body', c.body) from public.comments c where m.target_kind = 'comment' and c.id = m.target_id),
    'removed_action_ids', case when m.kind = 'restrict' then (select coalesce(jsonb_agg(x.id order by x.created_at desc), '[]'::jsonb)
                                                              from public.moderation_actions x where x.account_id = v_uid and x.kind = 'remove' and x.created_at <= m.created_at) end,
    'review_requested', exists (select 1 from public.review_requests rr where rr.action_id = m.id),
    'review_outcome', (select rr.outcome from public.review_requests rr where rr.action_id = m.id)
  );
end;
$$;

create or replace function public.request_review(p_action uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.moderation_actions where id = p_action and account_id = v_uid and kind in ('remove', 'restrict', 'suspend')) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into public.review_requests (action_id, account_id) values (p_action, v_uid)
  on conflict (action_id) do nothing;
  if not found then raise exception 'already_requested' using errcode = 'P0001'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderator functions (service role only; scripts/moderate.sh). Every action is logged.
-- ---------------------------------------------------------------------------
create or replace function public.mod_log(p_moderator text, p_account uuid, p_kind text, p_target_kind text, p_target uuid, p_reason text, p_note text, p_until timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if p_moderator is null or btrim(p_moderator) = '' then raise exception 'moderator_required' using errcode = 'P0001'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'reason_required' using errcode = 'P0001'; end if;
  insert into public.moderation_actions (moderator, account_id, kind, target_kind, target_id, reason, note, restrict_until)
  values (p_moderator, p_account, p_kind, p_target_kind, p_target, p_reason, p_note, p_until) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.mod_notify(p_account uuid, p_kind text, p_action uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.activity (recipient_id, kind, moderation_action_id) values (p_account, p_kind, p_action);
$$;

-- Remove a video (response or reply) with a reason shown to its author (A-Removed).
create or replace function public.mod_remove_video(p_video uuid, p_reason text, p_moderator text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.responses%rowtype;
  v_action uuid;
begin
  select * into r from public.responses where id = p_video and status in ('processing', 'live');
  if not found then raise exception 'video_not_found' using errcode = 'P0001'; end if;
  v_action := public.mod_log(p_moderator, r.author_id, 'remove', 'video', r.id, p_reason, p_note, null);
  update public.responses set status = 'removed', removed_action_id = v_action where id = r.id;
  update public.profiles set pinned_response_id = null where pinned_response_id = r.id;
  update public.reports set status = 'closed', closed_at = now(), closed_by = p_moderator, action_id = v_action where target_kind = 'video' and target_id = r.id and status = 'open';
  perform public.mod_notify(r.author_id, 'removed', v_action);
  return v_action;
end;
$$;

create or replace function public.mod_remove_comment(p_comment uuid, p_reason text, p_moderator text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c public.comments%rowtype;
  v_action uuid;
begin
  select * into c from public.comments where id = p_comment and deleted_at is null;
  if not found then raise exception 'comment_not_found' using errcode = 'P0001'; end if;
  v_action := public.mod_log(p_moderator, c.author_id, 'remove', 'comment', c.id, p_reason, p_note, null);
  update public.comments set deleted_at = now(), removed_action_id = v_action where id = c.id;
  update public.reports set status = 'closed', closed_at = now(), closed_by = p_moderator, action_id = v_action where target_kind = 'comment' and target_id = c.id and status = 'open';
  perform public.mod_notify(c.author_id, 'removed', v_action);
  return v_action;
end;
$$;

-- A warning on its own: logged; the notice people see is the removal itself (A-Removed).
create or replace function public.mod_warn(p_account uuid, p_reason text, p_moderator text, p_note text default null)
returns uuid language sql security definer set search_path = '' as $$
  select public.mod_log(p_moderator, p_account, 'warn', 'account', p_account, p_reason, p_note, null);
$$;

create or replace function public.mod_restrict(p_account uuid, p_until timestamptz, p_reason text, p_moderator text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_action uuid;
begin
  if p_until is null or p_until <= now() then raise exception 'invalid_until' using errcode = 'P0001'; end if;
  v_action := public.mod_log(p_moderator, p_account, 'restrict', 'account', p_account, p_reason, p_note, p_until);
  update public.accounts set moderation_status = 'restricted', restricted_until = p_until, moderation_action_id = v_action where id = p_account and moderation_status <> 'suspended';
  perform public.mod_notify(p_account, 'restricted', v_action);
  return v_action;
end;
$$;

create or replace function public.mod_suspend(p_account uuid, p_reason text, p_moderator text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_action uuid;
begin
  v_action := public.mod_log(p_moderator, p_account, 'suspend', 'account', p_account, p_reason, p_note, null);
  update public.accounts set moderation_status = 'suspended', restricted_until = null, moderation_action_id = v_action where id = p_account;
  update public.reports set status = 'closed', closed_at = now(), closed_by = p_moderator, action_id = v_action where target_kind = 'profile' and target_id = p_account and status = 'open';
  perform public.mod_notify(p_account, 'suspended', v_action);
  return v_action;
end;
$$;

-- Restore an account (lifts a restriction or suspension) or a removed video.
create or replace function public.mod_restore_account(p_account uuid, p_reason text, p_moderator text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_action uuid;
begin
  v_action := public.mod_log(p_moderator, p_account, 'restore', 'account', p_account, p_reason, p_note, null);
  update public.accounts set moderation_status = 'active', restricted_until = null, moderation_action_id = null where id = p_account;
  return v_action;
end;
$$;

create or replace function public.mod_restore_video(p_video uuid, p_reason text, p_moderator text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.responses%rowtype;
  v_action uuid;
begin
  select * into r from public.responses where id = p_video and status = 'removed';
  if not found then raise exception 'video_not_found' using errcode = 'P0001'; end if;
  v_action := public.mod_log(p_moderator, r.author_id, 'restore', 'video', r.id, p_reason, p_note, null);
  update public.responses set status = 'live', removed_action_id = null where id = r.id;
  return v_action;
end;
$$;

create or replace function public.mod_close_report(p_report uuid, p_moderator text)
returns void language sql security definer set search_path = '' as $$
  update public.reports set status = 'closed', closed_at = now(), closed_by = p_moderator where id = p_report and status = 'open';
$$;

create or replace function public.mod_decide_review(p_action uuid, p_outcome text, p_moderator text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  rr public.review_requests%rowtype;
  m public.moderation_actions%rowtype;
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
  end if;
  perform public.mod_notify(m.account_id, 'review_outcome', m.id);
end;
$$;

-- Queues
create or replace function public.mod_reports_queue(p_limit integer default 100)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'kind', r.target_kind, 'target_id', r.target_id, 'reason', r.reason, 'created_at', r.created_at,
    'reports_on_target', (select count(*) from public.reports x where x.target_kind = r.target_kind and x.target_id = r.target_id),
    'author', case r.target_kind
      when 'video' then (select public.profile_card(v.author_id) from public.responses v where v.id = r.target_id)
      when 'comment' then (select public.profile_card(c.author_id) from public.comments c where c.id = r.target_id)
      else public.profile_card(r.target_id) end,
    'video', (select jsonb_build_object('status', v.status, 'playback_id', v.mux_playback_id, 'caption', v.caption) from public.responses v where r.target_kind = 'video' and v.id = r.target_id),
    'comment', (select jsonb_build_object('body', c.body, 'deleted', c.deleted_at is not null) from public.comments c where r.target_kind = 'comment' and c.id = r.target_id)
  ) order by r.created_at), '[]'::jsonb)
  from (select * from public.reports where status = 'open' order by created_at limit greatest(1, least(p_limit, 500))) r;
$$;

create or replace function public.mod_review_queue(p_limit integer default 100)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'action_id', rr.action_id, 'account', public.profile_card(rr.account_id), 'requested_at', rr.created_at,
    'action', (select jsonb_build_object('kind', m.kind, 'target_kind', m.target_kind, 'target_id', m.target_id, 'reason', m.reason, 'note', m.note, 'moderator', m.moderator, 'created_at', m.created_at, 'restrict_until', m.restrict_until)
                 from public.moderation_actions m where m.id = rr.action_id)
  ) order by rr.created_at), '[]'::jsonb)
  from (select * from public.review_requests where outcome is null order by created_at limit greatest(1, least(p_limit, 500))) rr;
$$;

create or replace function public.mod_account_log(p_account uuid)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'target_kind', m.target_kind, 'target_id', m.target_id, 'reason', m.reason, 'note', m.note, 'moderator', m.moderator, 'created_at', m.created_at, 'restrict_until', m.restrict_until,
                                                'review', (select jsonb_build_object('requested_at', rr.created_at, 'outcome', rr.outcome) from public.review_requests rr where rr.action_id = m.id))
                            order by m.created_at desc), '[]'::jsonb)
  from public.moderation_actions m where m.account_id = p_account;
$$;

-- ---------------------------------------------------------------------------
-- Web (SF-Web, LV-WebUnavailable, LV-WebEmpty): public cards, no viewer, callable by anon.
-- ---------------------------------------------------------------------------
create or replace function public.web_card(r public.responses)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'playback_id', r.mux_playback_id, 'caption', r.caption, 'live_at', r.live_at, 'duration_ms', r.duration_ms,
    'author', public.profile_card(r.author_id),
    'like_count', public.like_count(r.id), 'comment_count', case when r.kind = 'response' then public.comment_count(r.id) else 0 end,
    'reply_count', case when r.kind = 'response' then public.reply_count(r.id) else 0 end,
    'root_response_id', r.root_response_id
  );
$$;

create or replace function public.web_video(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r public.responses%rowtype;
begin
  select * into r from public.responses where id = p_id and public.video_visible(responses, null);
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  return jsonb_build_object(
    'status', 'live',
    'video', public.web_card(r),
    'prompt', (select public.prompt_card(p) from public.prompts p where p.id = r.prompt_id),
    'more', coalesce((select jsonb_agg(public.web_card(x) order by x.live_at desc) from (
               select * from public.responses x where x.prompt_id = r.prompt_id and x.kind = 'response' and x.id <> r.id and public.video_visible(x, null) order by x.live_at desc limit 30) x), '[]'::jsonb),
    'replies', case when r.kind = 'response' then coalesce((select jsonb_agg(public.web_card(x) order by x.live_at asc) from public.responses x where x.root_response_id = r.id and x.kind = 'reply' and public.video_visible(x, null)), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create or replace function public.web_prompt(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  p public.prompts%rowtype;
  r public.responses%rowtype;
begin
  select * into p from public.prompts where id = p_id and status = 'live';
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  select * into r from public.responses x where x.prompt_id = p.id and x.kind = 'response' and public.video_visible(x, null) order by x.live_at desc limit 1;
  if not found then return jsonb_build_object('status', 'empty', 'prompt', public.prompt_card(p)); end if;
  return public.web_video(r.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges (default privileges are unreliable across runners: revoke everything, grant by name)
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

-- phase 5
grant execute on function public.report_item(text, uuid, text) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.blocked_list() to authenticated;
grant execute on function public.delete_video(uuid) to authenticated;
grant execute on function public.delete_account() to authenticated;
grant execute on function public.get_notice(uuid) to authenticated;
grant execute on function public.request_review(uuid) to authenticated;
grant execute on function public.web_video(uuid) to anon, authenticated;
grant execute on function public.web_prompt(uuid) to anon, authenticated;
-- can_see, reported_by, video_visible, assert_*, mod_*, purge_deleted_accounts: service role / internal only.
