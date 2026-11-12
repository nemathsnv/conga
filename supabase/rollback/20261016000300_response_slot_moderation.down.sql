-- ROLLBACK for 20261016000300_response_slot_moderation.sql. NOT a migration: nothing applies this file.
--
-- Use only if Nemat decides a moderator's removal should reopen the response slot again. Copy it
-- to a new forward migration and push that.
--
-- It restores the unique index over processing and live responses only (any removed response then
-- stops occupying the slot; no data changes, so nothing can conflict) and the body of publish_draft
-- (20261009000100) verbatim. post_response was not changed by the migration. Rows are untouched.
-- A member who responded again after the rollback while a removed response of theirs exists would
-- then have two rows on one prompt, and a restore of the removed one would fail on the index.

drop index public.responses_one_per_prompt;
create unique index responses_one_per_prompt on public.responses (prompt_id, author_id) where kind = 'response' and status in ('processing', 'live');
comment on index public.responses_one_per_prompt is null;

-- From 20261009000100_places_suggestions.sql:
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

notify pgrst, 'reload schema';
