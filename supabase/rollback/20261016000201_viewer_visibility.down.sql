-- Rollback of 20261016000201_viewer_visibility.sql: the four functions exactly as they were before
-- it (as pg_get_functiondef printed them on a local stack built from the 19 earlier migrations).
-- Reopens P4 to P7. Grants are kept by create or replace. Run as postgres, then:
--   delete from supabase_migrations.schema_migrations where version = '20261016000201';

CREATE OR REPLACE FUNCTION public.activity_row(a activity, p_viewer uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.activity_unread_count()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::integer from public.activity where recipient_id = auth.uid() and read_at is null;
$function$;

CREATE OR REPLACE FUNCTION public.get_profile(p_id uuid DEFAULT NULL::uuid, p_username text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.prompt_card(p prompts)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
