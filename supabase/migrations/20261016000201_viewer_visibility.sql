-- Privacy audit (16 Oct), P4 to P7: read functions that showed a person to someone they are
-- hidden from. SPEC.md Section 17 (block: "Both people stop seeing each other's profiles,
-- videos, replies and comments, and stop getting notifications about each other"), Section 18
-- (an account in its deletion window is hidden from everyone), and docs/DECISIONS.md, 8 Oct
-- ("Viewer-visible counts and thumbnails (place pages, Discover, search) continue to respect
-- block and report visibility").
--
--   P4 prompt_card 'faces' (the face strip on every prompt card: Home, Following, the player,
--      Discover, search, place pages, the reply room) picked the three newest responders with
--      can_see(null, ...), which ignores blocks: a blocked person's name, username and photo
--      appeared on cards for the person who blocked them, and the other way round. Faces now come
--      from responses the viewer can watch (video_visible), as the thumbnails already did. The web
--      player (no viewer) is unchanged.
--   P5 activity_row 'video' and 'comment' returned another person's video (caption, playback id,
--      status) and comment body with no visibility check, so an Activity row kept showing a video
--      after its author deleted it, a moderator removed it, or the viewer reported it, and a
--      comment after the viewer reported it. Your own videos and comments are always shown, as
--      the removal notices need; someone else's only while you could open them. The row keeps
--      its ids, so tapping it lands on the usual unavailable state.
--   P6 activity_unread_count (the Activity tab badge) counted rows from people the viewer had
--      blocked or been blocked by, and from accounts in their deletion window, which
--      activity_list leaves out. It now counts what activity_list's unread_count counts.
--   P7 get_profile follower_count and following_count counted follows of accounts in their
--      deletion window, which follow_list hides ("Responses, followers, following" counts,
--      Section 9). Blocks already remove follows both ways.
--
-- Unchanged on purpose (documented in 20261008000100_safety.sql): response_count and Discover's
-- recent_count are the same for every viewer, so they do not reveal a block. Flagged for Nemat in
-- docs/release/SECURITY.md against the 8 Oct decision.

-- ---------------------------------------------------------------------------
-- P4. Same as 20261009000100_places_suggestions.sql except 'faces'.
-- ---------------------------------------------------------------------------
create or replace function public.prompt_card(p public.prompts)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
                from (select r.author_id from public.responses r
                       where r.prompt_id = p.id and r.kind = 'response' and public.video_visible(r, auth.uid())
                       order by r.live_at desc limit 3) x),
    'suggested_by', case when p.source = 'member' and p.attribution and p.suggested_by is not null and public.can_see(auth.uid(), p.suggested_by) then public.profile_card(p.suggested_by) end,
    'is_own_suggestion', p.source = 'member' and p.suggested_by = auth.uid()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- P5. Same as 20261009000100_places_suggestions.sql except 'video' and 'comment'.
-- ---------------------------------------------------------------------------
create or replace function public.activity_row(a public.activity, p_viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'kind', a.kind,
    'created_at', a.created_at,
    'updated_at', a.updated_at,
    'read', a.read_at is not null,
    'actor', case when a.actor_id is null then null else public.profile_card(a.actor_id) end,
    'following_actor', exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = a.actor_id),
    'video', (select case when r.author_id = p_viewer or public.video_visible(r, p_viewer)
                          then jsonb_build_object('id', r.id, 'kind', r.kind, 'playback_id', r.mux_playback_id, 'caption', r.caption, 'status', r.status,
                                                  'root_response_id', r.root_response_id, 'prompt_id', r.prompt_id, 'prompt_text', (select text from public.prompts where id = r.prompt_id))
                          else jsonb_build_object('id', r.id, 'kind', r.kind, 'playback_id', null, 'caption', null, 'status', 'unavailable',
                                                  'root_response_id', r.root_response_id, 'prompt_id', r.prompt_id, 'prompt_text', (select text from public.prompts where id = r.prompt_id))
                     end
                from public.responses r where r.id = a.video_id),
    'comment', (select case when c.author_id = p_viewer
                                 or (c.deleted_at is null and public.can_see(p_viewer, c.author_id) and not public.reported_by(p_viewer, 'comment', c.id))
                            then jsonb_build_object('id', c.id, 'body', c.body, 'deleted', c.deleted_at is not null)
                            else jsonb_build_object('id', c.id, 'body', null, 'deleted', true)
                       end
                  from public.comments c where c.id = a.comment_id),
    'prompt', (select jsonb_build_object('id', p.id, 'text', p.text, 'place', (select jsonb_build_object('id', pl.id, 'name', pl.name, 'image_path', pl.image_path) from public.places pl where pl.id = p.place_id)) from public.prompts p where p.id = a.prompt_id),
    'like_count', case when a.kind = 'like' then public.like_count(a.video_id) end,
    'moderation_action_id', a.moderation_action_id,
    'review_outcome', (select rr.outcome from public.review_requests rr where rr.action_id = a.moderation_action_id),
    'suggestion', (select public.suggestion_card(sg, p_viewer) from public.suggestions sg where sg.id = a.suggestion_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- P6. The badge counts what activity_list's unread_count counts.
-- ---------------------------------------------------------------------------
create or replace function public.activity_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.activity a
   where a.recipient_id = auth.uid() and a.read_at is null
     and (a.actor_id is null or public.can_see(auth.uid(), a.actor_id));
$$;

-- ---------------------------------------------------------------------------
-- P7. Same as 20261009000100_places_suggestions.sql except the two follow counts.
-- ---------------------------------------------------------------------------
create or replace function public.get_profile(p_id uuid default null, p_username text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    'follower_count', (select count(*) from public.follows f where f.followee_id = p.id and public.can_see(null, f.follower_id)),
    'following_count', (select count(*) from public.follows f where f.follower_id = p.id and public.can_see(null, f.followee_id)),
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
