-- ROLLBACK for 20261016000300_response_slot_moderation.sql. NOT a migration: nothing applies this file.
--
-- Use only if Nemat decides a moderator's removal should reopen the response slot again. Copy it
-- to a new forward migration and push that.
--
-- It restores the unique index over processing and live responses only (any removed response then
-- stops occupying the slot; no data changes, so nothing can conflict), and the bodies of
-- post_response (20261013000200) and publish_draft (20261009000100) verbatim. Rows are untouched.
-- A member who responded again after the rollback while a removed response of theirs exists would
-- then have two rows on one prompt, and a restore of the removed one would fail on the index.

drop index public.responses_one_per_prompt;
create unique index responses_one_per_prompt on public.responses (prompt_id, author_id) where kind = 'response' and status in ('processing', 'live');
comment on index public.responses_one_per_prompt is null;

-- From 20261013000200_post_idempotency.sql:
create or replace function public.post_response(p_prompt uuid, p_upload_id text, p_caption text, p_duration_ms integer, p_submission uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_upload uuid;
  v_existing uuid;
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform 1 from public.accounts where id = v_uid for no key update;
  if not public.has_profile(v_uid) then raise exception 'profile_required' using errcode = 'P0001'; end if;
  perform public.assert_can_post(v_uid);
  if (select public_disclosure_ack_at from public.accounts where id = v_uid) is null then
    raise exception 'disclosure_required' using errcode = 'P0001';
  end if;
  v_existing := public.submission_replay(v_uid, p_submission, 'response', p_prompt, p_upload_id, p_caption, p_duration_ms);
  if v_existing is not null then
    select * into r from public.responses where id = v_existing;
    return public.response_card(r, v_uid) || jsonb_build_object('replayed', true);
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
  perform public.record_submission(v_uid, p_submission, 'response', p_prompt, p_upload_id, p_caption, p_duration_ms, r.id);
  return public.response_card(r, v_uid);
end;
$$;

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
