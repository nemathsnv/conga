-- ROLLBACK for 20261013000200_post_idempotency.sql. NOT a migration: nothing applies this file.
--
-- Use only if Nemat decides to undo posting idempotency on a project where 20261013000200 is
-- applied. Copy it to a new forward migration
-- (supabase/migrations/<timestamp>_post_idempotency_rollback.sql) and push that.
--
-- It restores the four-argument post_response and post_reply (bodies verbatim from
-- 20261012000100), post_draft and retry_response_upload (verbatim from 20261012000200), and drops
-- abandon_submission, the two internal helpers and public.post_submissions. Videos posted while
-- idempotency was on are ordinary rows and stay; only the record of their submission ids goes.
--
-- App builds that send p_submission get PGRST202 (no such function) from the four-argument
-- functions; the app then posts again without it (lib/content.ts), so they keep working, without
-- replay. Rows abandoned by abandon_submission stay deleted.

drop function public.abandon_submission(uuid);
drop function public.post_response(uuid, text, text, integer, uuid);
drop function public.post_reply(uuid, text, text, integer, uuid);
drop function public.post_draft(uuid, text, text, integer, uuid);
drop function public.submission_replay(uuid, uuid, text, uuid, text, text, integer);
drop function public.record_submission(uuid, uuid, text, uuid, text, text, integer, uuid);
drop table public.post_submissions;

-- From 20261012000100_video_uploads.sql:
create or replace function public.post_response(p_prompt uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_upload uuid;
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
  v_upload uuid;
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
  v_upload := public.claim_video_upload(v_uid, p_upload_id);
  insert into public.responses (kind, prompt_id, root_response_id, reply_to_id, author_id, caption, duration_ms, mux_upload_id)
  values ('reply', target.prompt_id, v_root, target.id, v_uid, v_caption, p_duration_ms, p_upload_id)
  returning * into r;
  update public.video_uploads set response_id = r.id where id = v_upload;
  return public.response_card(r, v_uid);
end;
$$;

-- From 20261012000200_video_deletion_cleanup.sql:
create or replace function public.post_draft(p_suggestion uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_upload uuid;
  old public.responses%rowtype;
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  if not exists (select 1 from public.suggestions where id = p_suggestion and author_id = v_uid and status in ('in_review', 'live', 'not_published', 'withdrawn')) then
    raise exception 'suggestion_not_found' using errcode = 'P0001';
  end if;
  if p_duration_ms is null or p_duration_ms < 2000 or p_duration_ms > 31000 then raise exception 'invalid_duration' using errcode = 'P0001'; end if;
  if v_caption is not null and char_length(v_caption) > 150 then raise exception 'invalid_caption' using errcode = 'P0001'; end if;
  if p_upload_id is null or p_upload_id = '' then raise exception 'upload_required' using errcode = 'P0001'; end if;
  v_upload := public.claim_video_upload(v_uid, p_upload_id);
  -- One draft per suggestion: re-recording replaces it.
  update public.responses set status = 'deleted', deleted_at = now() where suggestion_id = p_suggestion and status = 'draft' returning * into old;
  if old.id is not null then perform public.mux_forget_video(old.id, old.mux_asset_id, old.mux_upload_id, old.author_id, 'abandoned'); end if;
  insert into public.responses (status, suggestion_id, author_id, caption, duration_ms, mux_upload_id)
  values ('draft', p_suggestion, v_uid, v_caption, p_duration_ms, p_upload_id) returning * into r;
  update public.video_uploads set response_id = r.id where id = v_upload;
  return jsonb_build_object('id', r.id, 'status', r.status);
end;
$$;

create or replace function public.retry_response_upload(p_response uuid, p_upload_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_upload uuid;
  v_old text;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  select mux_upload_id into v_old from public.responses where id = p_response and author_id = v_uid and status = 'processing' for update;
  if not found then raise exception 'response_not_found' using errcode = 'P0001'; end if;
  v_upload := public.claim_video_upload(v_uid, p_upload_id);
  update public.responses set mux_upload_id = p_upload_id where id = p_response;
  update public.video_uploads set response_id = p_response where id = v_upload;
  if v_old is not null and v_old <> p_upload_id then
    perform public.mux_cleanup_enqueue('cancel_upload', 'abandoned', null, v_old, p_response, v_uid);
  end if;
end;
$$;

revoke execute on function public.post_response(uuid, text, text, integer) from public, anon;
revoke execute on function public.post_reply(uuid, text, text, integer) from public, anon;
revoke execute on function public.post_draft(uuid, text, text, integer) from public, anon;
grant execute on function public.post_response(uuid, text, text, integer) to authenticated;
grant execute on function public.post_reply(uuid, text, text, integer) to authenticated;
grant execute on function public.post_draft(uuid, text, text, integer) to authenticated;
grant execute on function public.retry_response_upload(uuid, text) to authenticated;

notify pgrst, 'reload schema';
