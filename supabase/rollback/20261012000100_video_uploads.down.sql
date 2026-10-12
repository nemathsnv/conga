-- ROLLBACK for 20261012000100_video_uploads.sql. NOT a migration: nothing applies this file.
--
-- Use only if Nemat decides to roll stage 2 back on a project where 20261012000100 is applied.
-- Copy it to a new forward migration (supabase/migrations/<timestamp>_video_uploads_rollback.sql),
-- push that, then redeploy mux-create-upload, mux-upload-status and mux-webhook from a50b71a.
-- Both halves are needed: the stage 1 mux-create-upload writes no ledger rows, so with only the
-- functions rolled back every post would fail with upload_not_found.
--
-- It restores the pre-stage-2 posting functions and the four-argument mark_response_live (bodies
-- copied verbatim from the migrations named above each) and removes the ledger functions. The
-- video_uploads table and its rows are kept, unused, as a record. Rolling back reopens the
-- findings stage 2 closed: any member's or a reused upload id can be posted, and no limits apply.
--
-- Tested 12 Oct on the isolated local stack: applied after 20261012000100, the unmodified
-- pre-stage-2 pgTAP files (0001 to 0008, 436 tests) pass.

drop function public.mark_response_live(text, text, text, integer, text);

-- post_response: as in 20261008000100_safety.sql
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

-- post_reply: as in 20261008000100_safety.sql
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

-- post_draft: as in 20261009000100_places_suggestions.sql
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

-- retry_response_upload: as in 20261006000500_core_loop.sql
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

-- mark_response_live: as in 20261009000100_places_suggestions.sql
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

revoke execute on function public.mark_response_live(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.mark_response_live(text, text, text, integer) to service_role;

drop function public.claim_video_upload(uuid, text);
drop function public.reserve_video_upload();
drop function public.activate_video_upload(uuid, text);
drop function public.fail_video_upload(uuid);
drop function public.begin_upload_cancellation(uuid);
drop function public.finish_upload_cancellation(text, text);
drop function public.video_upload_holds_slot(public.video_uploads);
