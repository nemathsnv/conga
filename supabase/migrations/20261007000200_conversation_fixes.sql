-- Phase 4 corrections (Nemat, 7 Oct 2026; docs/DECISIONS.md).
-- 1. Deleting your own top-level comment keeps other people's replies: the parent becomes a
--    deleted-parent row (board LV-CommentDeleted); a deleted comment with no live replies is gone.
-- 2. The second notification ask is persisted: after the first Not now, the first reply or comment
--    that arrives marks another ask due; the app shows N-Prime at its next safe foreground moment.

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
create or replace function public.comment_card(c public.comments, p_viewer uuid, p_response_author uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id,
    'response_id', c.response_id,
    'parent_id', c.parent_id,
    'thread_id', c.thread_id,
    'deleted', c.deleted_at is not null,
    'body', case when c.deleted_at is null then c.body end,
    'created_at', c.created_at,
    'author', case when c.deleted_at is null then public.profile_card(c.author_id) end,
    'is_author', c.deleted_at is null and c.author_id = p_response_author,
    'is_own', c.deleted_at is null and c.author_id = p_viewer,
    'liked', c.deleted_at is null and exists (select 1 from public.likes l where l.user_id = p_viewer and l.target_kind = 'comment' and l.target_id = c.id)
  );
$$;

-- Only the comment itself. Its replies stay (deleted-parent row); nobody else's words move.
create or replace function public.delete_comment(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  update public.comments set deleted_at = now() where id = p_id and author_id = v_uid and deleted_at is null;
  if not found then raise exception 'comment_not_found' using errcode = 'P0001'; end if;
  delete from public.likes where target_kind = 'comment' and target_id = p_id;
end;
$$;

-- Top-level comments oldest first with their live replies; a deleted top-level comment stays
-- while it still has live replies.
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
         where c.response_id = r.id and c.parent_id is null
           and (c.deleted_at is null or exists (select 1 from public.comments x where x.thread_id = c.id and x.deleted_at is null))
           and (p_before is null or c.created_at > p_before)
         order by c.created_at asc
         limit greatest(1, least(p_limit, 100))
      ) c
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Second ask
-- ---------------------------------------------------------------------------
alter table public.accounts add column notification_ask_due_at timestamptz;
comment on column public.accounts.notification_ask_due_at is 'Set when the first reply or comment arrives after the first Not now; N-Prime is shown at the next safe foreground moment. Cleared by set_notification_ask.';

create or replace function public.mark_second_ask()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.kind in ('video_reply', 'comment', 'comment_reply') then
    update public.accounts
       set notification_ask_due_at = coalesce(notification_ask_due_at, now())
     where id = new.recipient_id and notification_ask = 'declined_once';
  end if;
  return new;
end;
$$;
create trigger activity_second_ask after insert on public.activity for each row execute function public.mark_second_ask();

create or replace function public.set_notification_ask(p_state text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  cur text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select notification_ask into cur from public.accounts where id = v_uid;
  if p_state = 'accepted' then
    update public.accounts set notification_ask = 'accepted', notification_ask_due_at = null where id = v_uid;
  elsif p_state = 'declined' then
    update public.accounts
       set notification_ask = case cur when 'never' then 'declined_once' when 'declined_once' then 'declined_twice' else cur end,
           notification_ask_due_at = null
     where id = v_uid;
  else
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.get_notification_state()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  np public.notification_prefs;
  a public.accounts%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  np := public.notification_prefs_of(v_uid);
  select * into a from public.accounts where id = v_uid;
  return jsonb_build_object(
    'ask', a.notification_ask,
    'ask_due', a.notification_ask = 'declined_once' and a.notification_ask_due_at is not null,
    'prefs', jsonb_build_object(
      'pause_all', np.pause_all, 'video_replies', np.video_replies, 'comments', np.comments, 'comment_replies', np.comment_replies,
      'new_followers', np.new_followers, 'followed_respond', np.followed_respond, 'tonight_prompt', np.tonight_prompt,
      'place_prompts', np.place_prompts, 'likes', np.likes));
end;
$$;
