-- ROLLBACK for 20261013000300_safe_submission_abandon.sql. NOT a migration: nothing applies this file.
--
-- Use only if Nemat decides to undo the Mux-checked abandonment on a project where 20261013000300
-- is applied. Copy it to a new forward migration and push that. Undeploy the abandon-submission
-- Edge Function too (or leave it: without its functions it answers "kept, unverified", which the
-- app treats as "ask again later" and never deletes anything).
--
-- It restores 20261013000200's submission_replay and retry_response_upload (verbatim) and drops
-- begin_submission_abandon, finish_submission_abandon, video_still_waiting and the abandonment
-- columns. abandon_submission, which 20261013000300 dropped, is not restored: it was never callable
-- by an API role. Tombstones (ids closed before any row was made) are deleted with their columns;
-- a late copy of such a request would then make its row as an ordinary post. Rows already retired
-- stay deleted.

drop function public.finish_submission_abandon(uuid, uuid, text);
drop function public.begin_submission_abandon(uuid, uuid);
drop function public.video_still_waiting(public.responses);

delete from public.post_submissions where kind is null;
alter table public.post_submissions
  drop constraint post_submissions_request_or_tombstone,
  drop column abandoned_at,
  drop column abandoning_until,
  drop column abandon_token,
  alter column kind set not null,
  alter column target_id set not null,
  alter column upload_id set not null,
  alter column duration_ms set not null;

-- From 20261013000200_post_idempotency.sql:
create or replace function public.submission_replay(p_uid uuid, p_submission uuid, p_kind text, p_target uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.post_submissions%rowtype;
  v_status text;
begin
  if p_submission is null then return null; end if;
  select * into s from public.post_submissions where id = p_submission;
  if not found then return null; end if;
  -- IS DISTINCT FROM throughout: a NULL in the request (for example p_prompt) must count as a
  -- difference, never as unknown (review of 13 Oct, I1).
  if s.account_id is distinct from p_uid
     or s.kind is distinct from p_kind
     or s.target_id is distinct from p_target
     or s.upload_id is distinct from p_upload_id
     or s.caption is distinct from nullif(btrim(coalesce(p_caption, '')), '')
     or s.duration_ms is distinct from p_duration_ms then
    raise exception 'submission_conflict' using errcode = 'P0001';
  end if;
  select status into v_status from public.responses where id = s.response_id and author_id = p_uid;
  if v_status is null or v_status not in ('processing', 'live', 'draft') then
    raise exception 'submission_closed' using errcode = 'P0001';
  end if;
  return s.response_id;
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
  if v_old is not null and v_old = p_upload_id then return; end if;
  v_upload := public.claim_video_upload(v_uid, p_upload_id);
  update public.responses set mux_upload_id = p_upload_id where id = p_response;
  update public.video_uploads set response_id = p_response where id = v_upload;
  if v_old is not null and v_old <> p_upload_id then
    perform public.mux_cleanup_enqueue('cancel_upload', 'abandoned', null, v_old, p_response, v_uid);
  end if;
end;
$$;

notify pgrst, 'reload schema';
