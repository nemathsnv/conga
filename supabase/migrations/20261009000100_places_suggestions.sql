-- Phase 6: places and suggestions (SPEC.md Sections 5, 10, 11, 12, 15, 16, 18).
-- Places people follow (private), cohort auto-follow, feeds that draw from followed places,
-- Discover and search, prompt suggestions reviewed by a person, and private first-response drafts.

-- ---------------------------------------------------------------------------
-- Places
-- ---------------------------------------------------------------------------
create table public.place_neighbours (
  place_id uuid not null references public.places (id) on delete cascade,
  neighbour_id uuid not null references public.places (id) on delete cascade,
  primary key (place_id, neighbour_id),
  check (place_id <> neighbour_id)
);
comment on table public.place_neighbours is 'Team-kept list of neighbouring places for "Suggested, based on places you follow" (SPEC.md Section 11). Never GPS.';
alter table public.place_neighbours enable row level security;

create table public.place_follows (
  account_id uuid not null references public.accounts (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'cohort')),
  created_at timestamptz not null default now(),
  primary key (account_id, place_id)
);
comment on table public.place_follows is 'A private feed preference (SPEC.md Section 11): nobody else can see which places someone follows.';
alter table public.place_follows enable row level security;
create policy "place_follows: read your own" on public.place_follows for select to authenticated using (account_id = (select auth.uid()));

alter table public.beta_cohorts add column place_id uuid references public.places (id);
update public.beta_cohorts set place_id = (select id from public.places where slug = 'canggu') where id = 'canggu';

-- Cohort auto-follow: an invite from the Canggu beta follows Canggu (SPEC.md Section 11).
create or replace function public.follow_cohort_place()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.beta_cohort is not null and (tg_op = 'INSERT' or old.beta_cohort is distinct from new.beta_cohort) then
    insert into public.place_follows (account_id, place_id, source)
    select new.id, c.place_id, 'cohort' from public.beta_cohorts c where c.id = new.beta_cohort and c.place_id is not null
    on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger accounts_cohort_place after insert or update of beta_cohort on public.accounts for each row execute function public.follow_cohort_place();
-- Accounts admitted before this migration.
insert into public.place_follows (account_id, place_id, source)
select a.id, c.place_id, 'cohort' from public.accounts a join public.beta_cohorts c on c.id = a.beta_cohort where c.place_id is not null
on conflict do nothing;

create or replace function public.follows_place(p_account uuid, p_place uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.place_follows f where f.account_id = p_account and f.place_id = p_place);
$$;

create or replace function public.place_prompt_count(p_place uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.prompts p where p.place_id = p_place and p.status = 'live';
$$;

create or replace function public.place_card(pl public.places, p_viewer uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', pl.id, 'slug', pl.slug, 'name', pl.name, 'region', pl.region, 'type', pl.type, 'image_path', pl.image_path, 'open', pl.is_open,
    'prompt_count', public.place_prompt_count(pl.id),
    'following', public.follows_place(p_viewer, pl.id),
    'from_cohort', exists (select 1 from public.place_follows f where f.account_id = p_viewer and f.place_id = pl.id and f.source = 'cohort')
  );
$$;

create or replace function public.follow_place(p_place uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.places where id = p_place and is_open) then raise exception 'place_not_open' using errcode = 'P0001'; end if;
  insert into public.place_follows (account_id, place_id) values (v_uid, p_place) on conflict do nothing;
end;
$$;

create or replace function public.unfollow_place(p_place uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  delete from public.place_follows where account_id = auth.uid() and place_id = p_place;
end;
$$;

-- P-Places: following (Global is a fixed row the app draws), suggested neighbours of followed places.
create or replace function public.places_screen()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform public.assert_not_suspended(v_uid);
  return jsonb_build_object(
    'following', coalesce((select jsonb_agg(public.place_card(pl, v_uid) order by f.created_at) from public.place_follows f join public.places pl on pl.id = f.place_id where f.account_id = v_uid), '[]'::jsonb),
    'suggested', coalesce((
      select jsonb_agg(public.place_card(pl, v_uid) order by public.place_prompt_count(pl.id) desc, pl.name)
      from public.places pl
      where pl.is_open
        and not public.follows_place(v_uid, pl.id)
        and exists (select 1 from public.place_neighbours n join public.place_follows f on f.place_id = n.place_id and f.account_id = v_uid where n.neighbour_id = pl.id)
    ), '[]'::jsonb)
  );
end;
$$;

-- P-Place: the place and its open prompts, newest first.
create or replace function public.place_page(p_place uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  pl public.places%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform public.assert_not_suspended(v_uid);
  select * into pl from public.places where id = p_place;
  if not found then raise exception 'place_not_found' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'place', public.place_card(pl, v_uid),
    'prompts', coalesce((
      select jsonb_agg(public.prompt_card(p) || jsonb_build_object(
               'latest_response', (select public.response_card(r, v_uid) from public.responses r where r.prompt_id = p.id and r.kind = 'response' and public.video_visible(r, v_uid) order by r.live_at desc limit 1))
             order by p.published_at desc)
      from public.prompts p where p.place_id = pl.id and p.status = 'live'
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Prompts: scope in the feeds, attribution on the card
-- ---------------------------------------------------------------------------
create or replace function public.prompt_card(p public.prompts)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null then perform public.assert_not_suspended(auth.uid()); end if;
  return jsonb_build_object(
    'id', p.id,
    'text', p.text,
    'place', (select jsonb_build_object('id', pl.id, 'name', pl.name) from public.places pl where pl.id = p.place_id),
    'featured_on', p.featured_on,
    'published_at', p.published_at,
    'topic_id', p.topic_id,
    'response_count', public.response_count(p.id),
    'faces', (select coalesce(jsonb_agg(public.profile_card(x.author_id)), '[]'::jsonb)
                from (select author_id from public.responses where prompt_id = p.id and kind = 'response' and status = 'live' and public.can_see(null, author_id) order by live_at desc limit 3) x),
    'suggested_by', case when p.source = 'member' and p.attribution and p.suggested_by is not null and public.can_see(auth.uid(), p.suggested_by) then public.profile_card(p.suggested_by) end,
    'is_own_suggestion', p.source = 'member' and p.suggested_by = auth.uid()
  );
end;
$$;

-- A prompt is in someone's feed when it is global or tied to a place they follow.
create or replace function public.prompt_in_feed(p public.prompts, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p.status = 'live' and (p.place_id is null or public.follows_place(p_viewer, p.place_id));
$$;

create or replace function public.home_feed(p_exclude uuid[] default '{}', p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform public.assert_not_suspended(v_uid);
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
       where public.prompt_in_feed(p, v_uid)
         and not (p.id = any (p_exclude))
       order by (p.featured_on = (now() at time zone 'utc')::date) desc nulls last,
                coalesce((select max(live_at) from public.responses x where x.prompt_id = p.id and x.kind = 'response' and x.status = 'live'), p.published_at) desc
       limit greatest(1, least(p_limit, 50))
    ) p
  ), '[]'::jsonb);
end;
$$;

-- C-Plus: tonight's prompt first, then open prompts from the feed; plus "Your suggestions · N in review".
create or replace function public.open_prompts(p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform public.assert_not_suspended(v_uid);
  return coalesce((
    select jsonb_agg(public.prompt_card(p) order by (p.featured_on = (now() at time zone 'utc')::date) desc nulls last, p.published_at desc)
    from (select * from public.prompts p where public.prompt_in_feed(p, v_uid)
          order by (featured_on = (now() at time zone 'utc')::date) desc nulls last, published_at desc
          limit greatest(1, least(p_limit, 50))) p
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Discover and search (SPEC.md Sections 4, 10; boards R-Discover, SR-*)
-- ---------------------------------------------------------------------------
-- Busy right now: the prompts in the person's feed with the most responses in the last 48 hours
-- (not defined in the spec; docs/PHASE-6-PLAN.md section 6). A topic chip narrows it.
create or replace function public.discover(p_topic text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_tz text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform public.assert_not_suspended(v_uid);
  select coalesce(timezone, 'UTC') into v_tz from public.accounts where id = v_uid;
  return jsonb_build_object(
    'tonight', (select public.prompt_card(p) || jsonb_build_object(
                  'hours_left', greatest(0, extract(epoch from ((date_trunc('day', now() at time zone v_tz) + interval '1 day') - (now() at time zone v_tz))) / 3600)::integer,
                  'thumbnails', (select coalesce(jsonb_agg(x.mux_playback_id), '[]'::jsonb) from (select mux_playback_id from public.responses r where r.prompt_id = p.id and r.kind = 'response' and public.video_visible(r, v_uid) order by r.live_at desc limit 4) x))
                  from public.prompts p where p.status = 'live' and p.place_id is null and p.featured_on = (now() at time zone v_tz)::date limit 1),
    'topics', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name) from public.topics t), '[]'::jsonb),
    'busy', coalesce((
      select jsonb_agg(public.prompt_card(p) || jsonb_build_object(
               'recent_count', x.n,
               'thumbnail', (select mux_playback_id from public.responses r where r.prompt_id = p.id and r.kind = 'response' and public.video_visible(r, v_uid) order by r.live_at desc limit 1))
             order by x.n desc, p.published_at desc)
      from (
        select p.id, count(r.id) as n
          from public.prompts p
          left join public.responses r on r.prompt_id = p.id and r.kind = 'response' and r.status = 'live' and r.live_at > now() - interval '48 hours'
         where public.prompt_in_feed(p, v_uid)
           and (p_topic is null or p.topic_id = p_topic)
           and (p.featured_on is null or p.featured_on <> (now() at time zone v_tz)::date)
         group by p.id
         order by n desc, max(p.published_at) desc
         limit 12
      ) x join public.prompts p on p.id = x.id
    ), '[]'::jsonb)
  );
end;
$$;

-- One grouped list: places (any, open or not), prompts (any live prompt), people (not hidden).
create or replace function public.search(p_q text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  q text := btrim(coalesce(p_q, ''));
  pat text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform public.assert_not_suspended(v_uid);
  if char_length(q) < 1 then return jsonb_build_object('places', '[]'::jsonb, 'prompts', '[]'::jsonb, 'people', '[]'::jsonb); end if;
  pat := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object(
    'places', coalesce((select jsonb_agg(public.place_card(pl, v_uid) order by pl.is_open desc, pl.name) from public.places pl where pl.name ilike pat or pl.region ilike pat), '[]'::jsonb),
    'prompts', coalesce((select jsonb_agg(public.prompt_card(p) order by p.published_at desc) from (select * from public.prompts p where p.status = 'live' and p.text ilike pat order by p.published_at desc limit 20) p), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(public.profile_card(pr.id) || jsonb_build_object(
               'is_following', exists (select 1 from public.follows f where f.follower_id = v_uid and f.followee_id = pr.id),
               'is_self', pr.id = v_uid) order by pr.name)
      from (select * from public.profiles pr where (pr.name ilike pat or pr.username ilike pat) and public.can_see(v_uid, pr.id) order by pr.name limit 20) pr
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Suggestions (SPEC.md Section 12)
-- ---------------------------------------------------------------------------
create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.accounts (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 120),
  place_id uuid references public.places (id),
  attribution boolean not null default true,
  status text not null default 'in_review' check (status in ('in_review', 'withdrawn', 'live', 'not_published')),
  decline_reason text check (decline_reason in ('singles_out', 'too_similar', 'promotion', 'private_details', 'unclear', 'other')),
  prompt_id uuid references public.prompts (id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.suggestions is 'Member-suggested prompts; nothing goes public until a person approves it (SPEC.md Section 12).';
create index suggestions_author_idx on public.suggestions (author_id, created_at desc);
create index suggestions_review_idx on public.suggestions (created_at) where status = 'in_review';
create trigger suggestions_updated_at before update on public.suggestions for each row execute function public.set_updated_at();
alter table public.suggestions enable row level security;
create policy "suggestions: read your own" on public.suggestions for select to authenticated using (author_id = (select auth.uid()));

-- Decline reasons (fixed list, Section 12). The person-facing line is written plainly here.
create or replace function public.decline_reason_text(p_reason text)
returns text language sql immutable as $$
  select case p_reason
    when 'singles_out' then 'Not published because it singles out a person or group of people. You can rewrite it and send it again.'
    when 'too_similar' then 'Not published because it is too similar to a prompt that is already live. You can rewrite it and send it again.'
    when 'promotion' then 'Not published because it promotes something. You can rewrite it and send it again.'
    when 'private_details' then 'Not published because it asks for private details. You can rewrite it and send it again.'
    when 'unclear' then 'Not published because it is unclear. You can rewrite it and send it again.'
    else 'Not published. You can rewrite it and send it again.' end;
$$;

-- Private first-response drafts live in responses with status 'draft' and no prompt yet.
alter table public.responses drop constraint responses_status_check;
alter table public.responses add constraint responses_status_check check (status in ('draft', 'processing', 'live', 'removed', 'deleted'));
alter table public.responses alter column prompt_id drop not null;
alter table public.responses add column suggestion_id uuid references public.suggestions (id) on delete cascade;
alter table public.responses add constraint responses_prompt_or_draft check (prompt_id is not null or status in ('draft', 'deleted'));
create unique index responses_one_draft_per_suggestion on public.responses (suggestion_id) where status = 'draft';
alter table public.responses drop constraint responses_duration_ms_check;
alter table public.responses add constraint responses_duration_ms_check check (duration_ms between 1500 and 31000);
drop policy "responses: live ones are public to signed-in users; your own always" on public.responses;
create policy "responses: live ones are public to signed-in users; your own always"
  on public.responses for select to authenticated
  using (status = 'live' or author_id = (select auth.uid()));

create or replace function public.suggestion_card(sg public.suggestions, p_viewer uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', sg.id,
    'text', sg.text,
    'place', (select jsonb_build_object('id', pl.id, 'name', pl.name) from public.places pl where pl.id = sg.place_id),
    'attribution', sg.attribution,
    'status', sg.status,
    'decline_reason', sg.decline_reason,
    'decline_text', case when sg.status = 'not_published' then public.decline_reason_text(sg.decline_reason) end,
    'created_at', sg.created_at,
    'reviewed_at', sg.reviewed_at,
    'prompt', (select public.prompt_card(p) from public.prompts p where p.id = sg.prompt_id and p.status = 'live'),
    'draft', (select jsonb_build_object('id', r.id, 'playback_id', r.mux_playback_id, 'caption', r.caption, 'duration_ms', r.duration_ms, 'ready', r.mux_playback_id is not null)
                from public.responses r where r.suggestion_id = sg.id and r.status = 'draft' and r.author_id = p_viewer)
  );
$$;

create or replace function public.suggest_prompt(p_text text, p_place uuid default null, p_attribution boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_text text := btrim(coalesce(p_text, ''));
  sg public.suggestions%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not public.has_profile(v_uid) then raise exception 'profile_required' using errcode = 'P0001'; end if;
  perform public.assert_can_post(v_uid);
  if char_length(v_text) < 1 or char_length(v_text) > 120 then raise exception 'invalid_text' using errcode = 'P0001'; end if;
  if p_place is not null and not public.follows_place(v_uid, p_place) then raise exception 'place_not_followed' using errcode = 'P0001'; end if;
  if (select count(*) from public.suggestions where author_id = v_uid and status = 'in_review') >= 3 then
    raise exception 'too_many_in_review' using errcode = 'P0001';
  end if;
  insert into public.suggestions (author_id, text, place_id, attribution) values (v_uid, v_text, p_place, coalesce(p_attribution, true)) returning * into sg;
  return public.suggestion_card(sg, v_uid);
end;
$$;

-- Edit while in review; rewrite and resend from not published (back into review).
create or replace function public.edit_suggestion(p_id uuid, p_text text, p_place uuid default null, p_attribution boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_text text := btrim(coalesce(p_text, ''));
  sg public.suggestions%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform public.assert_can_post(v_uid);
  select * into sg from public.suggestions where id = p_id and author_id = v_uid;
  if not found or sg.status not in ('in_review', 'not_published') then raise exception 'suggestion_not_found' using errcode = 'P0001'; end if;
  if char_length(v_text) < 1 or char_length(v_text) > 120 then raise exception 'invalid_text' using errcode = 'P0001'; end if;
  if p_place is not null and not public.follows_place(v_uid, p_place) then raise exception 'place_not_followed' using errcode = 'P0001'; end if;
  if sg.status = 'not_published' and (select count(*) from public.suggestions where author_id = v_uid and status = 'in_review') >= 3 then
    raise exception 'too_many_in_review' using errcode = 'P0001';
  end if;
  update public.suggestions
     set text = v_text, place_id = p_place, attribution = coalesce(p_attribution, true), status = 'in_review', decline_reason = null, reviewed_at = null, reviewed_by = null
   where id = sg.id returning * into sg;
  return public.suggestion_card(sg, v_uid);
end;
$$;

create or replace function public.withdraw_suggestion(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.suggestions set status = 'withdrawn' where id = p_id and author_id = auth.uid() and status = 'in_review';
  if not found then raise exception 'suggestion_not_found' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.my_suggestions()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform public.assert_not_suspended(v_uid);
  return jsonb_build_object(
    'in_review_count', (select count(*) from public.suggestions where author_id = v_uid and status = 'in_review'),
    'suggestions', coalesce((select jsonb_agg(public.suggestion_card(sg, v_uid) order by (sg.status = 'in_review') desc, sg.updated_at desc)
                               from public.suggestions sg where sg.author_id = v_uid and sg.status <> 'withdrawn'), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_suggestion(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  sg public.suggestions%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select * into sg from public.suggestions where id = p_id and author_id = v_uid;
  if not found then raise exception 'suggestion_not_found' using errcode = 'P0001'; end if;
  return public.suggestion_card(sg, v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- Drafts (SPEC.md Section 12, "First-response draft")
-- ---------------------------------------------------------------------------
create or replace function public.post_draft(p_suggestion uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.suggestions where id = p_suggestion and author_id = v_uid and status in ('in_review', 'live', 'not_published', 'withdrawn')) then
    raise exception 'suggestion_not_found' using errcode = 'P0001';
  end if;
  if p_duration_ms is null or p_duration_ms < 2000 or p_duration_ms > 31000 then raise exception 'invalid_duration' using errcode = 'P0001'; end if;
  if v_caption is not null and char_length(v_caption) > 150 then raise exception 'invalid_caption' using errcode = 'P0001'; end if;
  if p_upload_id is null or p_upload_id = '' then raise exception 'upload_required' using errcode = 'P0001'; end if;
  -- One draft per suggestion: re-recording replaces it.
  update public.responses set status = 'deleted', deleted_at = now() where suggestion_id = p_suggestion and status = 'draft';
  insert into public.responses (status, suggestion_id, author_id, caption, duration_ms, mux_upload_id)
  values ('draft', p_suggestion, v_uid, v_caption, p_duration_ms, p_upload_id) returning * into r;
  return jsonb_build_object('id', r.id, 'status', r.status);
end;
$$;

-- Mux ready: a draft keeps its status; everything else goes live as before.
create or replace function public.mark_response_live(p_upload_id text, p_asset_id text, p_playback_id text, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.responses%rowtype;
begin
  update public.responses
     set status = case when status = 'draft' then 'draft' else 'live' end,
         mux_asset_id = p_asset_id, mux_playback_id = p_playback_id,
         live_at = case when status = 'draft' then live_at else coalesce(live_at, now()) end,
         duration_ms = coalesce(p_duration_ms, duration_ms)
   where mux_upload_id = p_upload_id and status in ('processing', 'draft')
   returning * into r;
  if not found then
    select * into r from public.responses where mux_upload_id = p_upload_id;
    if not found then return jsonb_build_object('status', 'unknown_upload'); end if;
  end if;
  return jsonb_build_object('id', r.id, 'status', r.status, 'author_id', r.author_id);
end;
$$;

-- C-Draft "Publish response": a first public video like any other (disclosure, restriction).
create or replace function public.publish_draft(p_suggestion uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  sg public.suggestions%rowtype;
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform public.assert_can_post(v_uid);
  if (select public_disclosure_ack_at from public.accounts where id = v_uid) is null then raise exception 'disclosure_required' using errcode = 'P0001'; end if;
  select * into sg from public.suggestions where id = p_suggestion and author_id = v_uid and status = 'live' and prompt_id is not null;
  if not found then raise exception 'prompt_not_live' using errcode = 'P0001'; end if;
  select * into r from public.responses where suggestion_id = sg.id and status = 'draft' and author_id = v_uid;
  if not found then raise exception 'draft_not_found' using errcode = 'P0001'; end if;
  if exists (select 1 from public.responses x where x.prompt_id = sg.prompt_id and x.author_id = v_uid and x.kind = 'response' and x.status in ('processing', 'live')) then
    raise exception 'already_responded' using errcode = 'P0001';
  end if;
  update public.responses
     set prompt_id = sg.prompt_id,
         status = case when mux_playback_id is null then 'processing' else 'live' end,
         live_at = case when mux_playback_id is null then null else now() end
   where id = r.id returning * into r;
  return public.response_card(r, v_uid);
end;
$$;

create or replace function public.discard_draft(p_suggestion uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.responses set status = 'deleted', deleted_at = now() where suggestion_id = p_suggestion and status = 'draft' and author_id = auth.uid();
  if not found then raise exception 'draft_not_found' using errcode = 'P0001'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Review by moderators (service role; scripts/moderate.sh). Logged like every action.
-- ---------------------------------------------------------------------------
alter table public.moderation_actions drop constraint moderation_actions_kind_check;
alter table public.moderation_actions add constraint moderation_actions_kind_check check (kind in ('remove', 'restrict', 'suspend', 'restore', 'remove_attribution', 'approve_suggestion', 'decline_suggestion'));
alter table public.activity drop constraint activity_kind_check;
alter table public.activity add constraint activity_kind_check check (kind in ('video_reply', 'comment', 'comment_reply', 'follow', 'like', 'followed_responded', 'removed', 'restricted', 'suspended', 'review_outcome', 'suggestion_live', 'suggestion_declined', 'place_prompt'));
alter table public.activity add column suggestion_id uuid references public.suggestions (id) on delete cascade;
alter table public.push_outbox drop constraint push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check check (kind in ('video_reply', 'comment', 'comment_reply', 'follow', 'like', 'followed_responded', 'tonight_prompt', 'place_prompt', 'removed', 'restricted', 'suspended', 'review_outcome', 'suggestion_live', 'suggestion_declined'));

create or replace function public.mod_suggestions_queue(p_limit integer default 100)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sg.id, 'text', sg.text, 'place', (select pl.name from public.places pl where pl.id = sg.place_id), 'attribution', sg.attribution,
    'author', public.profile_card(sg.author_id), 'created_at', sg.created_at,
    'has_draft', exists (select 1 from public.responses r where r.suggestion_id = sg.id and r.status = 'draft')
  ) order by sg.created_at), '[]'::jsonb)
  from (select * from public.suggestions where status = 'in_review' order by created_at limit greatest(1, least(p_limit, 500))) sg;
$$;

create or replace function public.mod_approve_suggestion(p_id uuid, p_moderator text, p_keep_attribution boolean default true, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sg public.suggestions%rowtype;
  v_prompt uuid;
  v_action uuid;
begin
  select * into sg from public.suggestions where id = p_id and status = 'in_review';
  if not found then raise exception 'suggestion_not_found' using errcode = 'P0001'; end if;
  insert into public.prompts (text, place_id, source, suggested_by, attribution, status, published_at)
  values (sg.text, sg.place_id, 'member', sg.author_id, sg.attribution and coalesce(p_keep_attribution, true), 'live', now()) returning id into v_prompt;
  update public.suggestions set status = 'live', prompt_id = v_prompt, reviewed_at = now(), reviewed_by = p_moderator where id = sg.id;
  v_action := public.mod_log(p_moderator, sg.author_id, 'approve_suggestion', 'suggestion', sg.id, 'Approved', p_note, null);
  if sg.attribution and not coalesce(p_keep_attribution, true) then
    perform public.mod_log(p_moderator, sg.author_id, 'remove_attribution', 'suggestion', sg.id, 'Published without a name', p_note, null);
  end if;
  insert into public.activity (recipient_id, kind, prompt_id, suggestion_id, moderation_action_id) values (sg.author_id, 'suggestion_live', v_prompt, sg.id, v_action);
  -- People who follow the place hear about a new place prompt (SPEC.md Section 15).
  if sg.place_id is not null then
    insert into public.activity (recipient_id, kind, prompt_id)
    select f.account_id, 'place_prompt', v_prompt from public.place_follows f where f.place_id = sg.place_id and f.account_id <> sg.author_id;
  end if;
  return v_action;
end;
$$;

create or replace function public.mod_decline_suggestion(p_id uuid, p_reason text, p_moderator text, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  sg public.suggestions%rowtype;
  v_action uuid;
begin
  if p_reason not in ('singles_out', 'too_similar', 'promotion', 'private_details', 'unclear', 'other') then raise exception 'invalid_reason' using errcode = 'P0001'; end if;
  select * into sg from public.suggestions where id = p_id and status = 'in_review';
  if not found then raise exception 'suggestion_not_found' using errcode = 'P0001'; end if;
  update public.suggestions set status = 'not_published', decline_reason = p_reason, reviewed_at = now(), reviewed_by = p_moderator where id = sg.id;
  v_action := public.mod_log(p_moderator, sg.author_id, 'decline_suggestion', 'suggestion', sg.id, public.decline_reason_text(p_reason), p_note, null);
  insert into public.activity (recipient_id, kind, suggestion_id, moderation_action_id) values (sg.author_id, 'suggestion_declined', sg.id, v_action);
  return v_action;
end;
$$;

-- Team prompts tied to a place also tell the place's followers.
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
  if v_place is not null then
    insert into public.activity (recipient_id, kind, prompt_id) select f.account_id, 'place_prompt', v_id from public.place_follows f where f.place_id = v_place;
  end if;
  return v_id;
end;
$$;

-- Pushes: suggestion outcomes are always sent; place prompts by preference.
create or replace function public.queue_push_for_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  np public.notification_prefs;
  allowed boolean;
begin
  if tg_op = 'UPDATE' and new.kind <> 'like' then return new; end if;
  if new.kind in ('removed', 'restricted', 'suspended', 'review_outcome', 'suggestion_live', 'suggestion_declined') then
    insert into public.push_outbox (recipient_id, kind, activity_id, prompt_id) values (new.recipient_id, new.kind, new.id, new.prompt_id);
    return new;
  end if;
  np := public.notification_prefs_of(new.recipient_id);
  if np.pause_all then return new; end if;
  if new.kind = 'place_prompt' then
    if np.place_prompts and exists (select 1 from public.push_tokens t where t.account_id = new.recipient_id) then
      insert into public.push_outbox (recipient_id, kind, activity_id, prompt_id) values (new.recipient_id, 'place_prompt', new.id, new.prompt_id);
    end if;
    return new;
  end if;
  if not public.can_see(new.recipient_id, new.actor_id) then return new; end if;
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
  sg public.suggestions%rowtype;
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
  if o.kind in ('suggestion_live', 'suggestion_declined') then
    select * into sg from public.suggestions where id = a.suggestion_id;
    return case o.kind
      when 'suggestion_live' then 'Your prompt is live' || coalesce(' in ' || (select pl.name from public.places pl where pl.id = sg.place_id), '')
      else 'Your prompt wasn''t published. ' || public.decline_reason_text(sg.decline_reason) end;
  end if;
  if o.kind in ('removed', 'restricted', 'suspended', 'review_outcome') then
    select * into m from public.moderation_actions where id = a.moderation_action_id;
    return case o.kind
      when 'removed' then 'We removed one of your ' || case when m.target_kind = 'comment' then 'comments' else (select case when x.kind = 'reply' then 'video replies' else 'responses' end from public.responses x where x.id = m.target_id) end
      when 'restricted' then 'Posting is paused until ' || to_char(m.restrict_until, 'FMDD Month')
      when 'suspended' then 'Your account is suspended'
      when 'review_outcome' then (select case r.outcome when 'reversed' then 'We reviewed your request and reversed the decision.' else 'We reviewed your request. The decision stands.' end from public.review_requests r where r.action_id = m.id)
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

-- Activity rows carry the suggestion for C-Live / C-Draft, and the place for pin labels.
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
    'prompt', (select jsonb_build_object('id', p.id, 'text', p.text, 'place', (select jsonb_build_object('id', pl.id, 'name', pl.name, 'image_path', pl.image_path) from public.places pl where pl.id = p.place_id)) from public.prompts p where p.id = a.prompt_id),
    'like_count', case when a.kind = 'like' then public.like_count(a.video_id) end,
    'moderation_action_id', a.moderation_action_id,
    'review_outcome', (select rr.outcome from public.review_requests rr where rr.action_id = a.moderation_action_id),
    'suggestion', (select public.suggestion_card(sg, p_viewer) from public.suggestions sg where sg.id = a.suggestion_id)
  );
$$;

-- Activity list: suggestion and place rows have no actor; order notices and suggestion outcomes first.
create or replace function public.activity_list(p_limit integer default 60)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform public.assert_not_suspended(v_uid);
  return jsonb_build_object(
    'unread_count', (select count(*) from public.activity a where a.recipient_id = v_uid and a.read_at is null and (a.actor_id is null or public.can_see(v_uid, a.actor_id))),
    'tonight', (select public.prompt_card(p) from public.prompts p where p.status = 'live' and p.place_id is null and p.featured_on = (now() at time zone 'utc')::date limit 1),
    'rows', coalesce((
      select jsonb_agg(g.row order by (g.row->>'section' = 'new') desc, (g.row->>'kind' in ('removed', 'restricted', 'suspended', 'review_outcome', 'suggestion_live', 'suggestion_declined')) desc, (g.row->>'kind' = 'video_reply') desc, g.ts desc)
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

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.pre_request() to anon, authenticated;
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
-- phase 6
grant execute on function public.follow_place(uuid) to authenticated;
grant execute on function public.unfollow_place(uuid) to authenticated;
grant execute on function public.places_screen() to authenticated;
grant execute on function public.place_page(uuid) to authenticated;
grant execute on function public.discover(text) to authenticated;
grant execute on function public.search(text) to authenticated;
grant execute on function public.suggest_prompt(text, uuid, boolean) to authenticated;
grant execute on function public.edit_suggestion(uuid, text, uuid, boolean) to authenticated;
grant execute on function public.withdraw_suggestion(uuid) to authenticated;
grant execute on function public.my_suggestions() to authenticated;
grant execute on function public.get_suggestion(uuid) to authenticated;
grant execute on function public.post_draft(uuid, text, text, integer) to authenticated;
grant execute on function public.publish_draft(uuid) to authenticated;
grant execute on function public.discard_draft(uuid) to authenticated;
