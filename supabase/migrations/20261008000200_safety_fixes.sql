-- Phase 5 corrections (Nemat, 8 Oct 2026; docs/DECISIONS.md).
-- 1. A suspended account cannot use the product API at all: every request through PostgREST
--    (RPC and table reads) is refused except the few paths the suspended experience needs.
-- 2. No standalone "warn" action: a warning is the removal notice itself (A-Removed).
-- 3. Review outcome texts as decided.

-- ---------------------------------------------------------------------------
-- Suspension gate: PostgREST calls pre_request() before every request as the signed-in role.
-- Allowed while suspended: the sign-in state (LV-Suspended, restore from deletion), the review
-- request, account deletion, push-token removal and the timezone (sign-out is client-side).
-- ---------------------------------------------------------------------------
create or replace function public.suspended_allowed_path(p_path text)
returns boolean language sql immutable as $$
  select p_path in ('/rpc/get_onboarding_state', '/rpc/request_review', '/rpc/delete_account', '/rpc/remove_push_token', '/rpc/set_timezone');
$$;

create or replace function public.pre_request()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if v_uid is null then return; end if;
  if public.suspended_allowed_path(v_path) then return; end if;
  if exists (select 1 from public.accounts a where a.id = v_uid and a.moderation_status = 'suspended') then
    raise exception 'suspended' using errcode = 'P0001', hint = 'This account is suspended.';
  end if;
end;
$$;
grant execute on function public.pre_request() to anon, authenticated;
alter role authenticator set pgrst.db_pre_request = 'public.pre_request';
notify pgrst, 'reload config';

-- Belt and braces inside the database too: the posting and reading functions most likely to be
-- called directly refuse a suspended account even without PostgREST in front.
create or replace function public.assert_not_suspended(p_account uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from public.accounts a where a.id = p_account and a.moderation_status = 'suspended') then
    raise exception 'suspended' using errcode = 'P0001';
  end if;
end;
$$;

-- The card helper every read path goes through: a suspended viewer gets nothing.
create or replace function public.response_card(r public.responses, p_viewer uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_viewer is not null then perform public.assert_not_suspended(p_viewer); end if;
  return jsonb_build_object(
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
end;
$$;

-- ---------------------------------------------------------------------------
-- No standalone warning
-- ---------------------------------------------------------------------------
drop function if exists public.mod_warn(uuid, text, text, text);
alter table public.moderation_actions drop constraint moderation_actions_kind_check;
alter table public.moderation_actions add constraint moderation_actions_kind_check check (kind in ('remove', 'restrict', 'suspend', 'restore', 'remove_attribution'));
comment on table public.moderation_actions is 'Every moderator action: who, when, why (SPEC.md Section 17). reason is shown to the person; note is internal. A warning is the removal notice itself (A-Removed), never a separate action.';

-- ---------------------------------------------------------------------------
-- Review outcomes (decided texts)
-- ---------------------------------------------------------------------------
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

-- The Activity row carries the outcome so the app can say the same words.
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
    'moderation_action_id', a.moderation_action_id,
    'review_outcome', (select rr.outcome from public.review_requests rr where rr.action_id = a.moderation_action_id)
  );
$$;

-- The profile and prompt cards are inside every read path that response_card is not
-- (profiles, follow lists, Activity, the + sheet): a suspended viewer gets nothing from them
-- either. Service-role and anonymous callers (moderation queues, the web) have no auth.uid().
create or replace function public.profile_card(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is not null then perform public.assert_not_suspended(auth.uid()); end if;
  return (select jsonb_build_object('id', id, 'name', name, 'username', username, 'photo_path', photo_path) from public.profiles where id = p_id);
end;
$$;

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
    'response_count', public.response_count(p.id),
    'faces', (select coalesce(jsonb_agg(public.profile_card(x.author_id)), '[]'::jsonb)
                from (select author_id from public.responses where prompt_id = p.id and kind = 'response' and status = 'live' and public.can_see(null, author_id) order by live_at desc limit 3) x)
  );
end;
$$;
