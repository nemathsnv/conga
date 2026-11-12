-- Discarding a recording whose post is unresolved, only once Mux confirms it has nothing (review of
-- 13 Oct, B3; approved for local work).
--
-- 20261013000200's abandon_submission decided from the database alone. An asset is recorded only
-- when Mux reports it ready, so a row whose bytes Mux had already received (still processing) looked
-- abandonable. It is dropped. The replacement is the abandon-submission Edge Function, which runs
-- as the signed-in member and uses two service-role steps around a question to Mux:
--
--   begin_submission_abandon(member, submission)
--     A submission the member never made a row with (the request rolled back, or never arrived)
--     is closed at once with a tombstone, so a late copy of that request cannot make one.
--     Another member's id: not_found, nothing revealed. Anything settled (live, a draft with its
--     video, removed) is kept: never deleted here. A row still waiting for its video (processing,
--     or a draft with no asset) is held for 2 minutes, with a token: replays and Retries of it are
--     refused as submission_busy meanwhile. The function then asks Mux about the row's upload.
--   finish_submission_abandon(submission, token, outcome)
--     'abandon' only after Mux reported the upload cancelled, timed out or errored with no asset,
--     or confirmed a cancellation it was asked for. The row is deleted again checked under its
--     lock (still waiting, no asset), the submission closed. 'keep' releases the hold. A video
--     Mux has (an asset, or asset_created), or whose state could not be verified, is kept for
--     reconciliation: the app keeps the recording and asks again later.
--
-- Nothing here deletes a published or processing video automatically, and nothing calls the
-- clean-up worker: the only Mux change is the cancellation of an upload Mux reports still
-- waiting, made by the Edge Function before the row is retired.

drop function public.abandon_submission(uuid);

alter table public.post_submissions
  alter column kind drop not null,
  alter column target_id drop not null,
  alter column upload_id drop not null,
  alter column duration_ms drop not null,
  add column abandoned_at timestamptz,
  add column abandoning_until timestamptz,
  add column abandon_token uuid,
  -- A submission is either a request that made a row, or a tombstone closing an id that never did.
  add constraint post_submissions_request_or_tombstone check (
    (kind is not null and target_id is not null and upload_id is not null and duration_ms is not null)
    or (kind is null and target_id is null and upload_id is null and duration_ms is null and response_id is null and abandoned_at is not null)
  );
comment on column public.post_submissions.abandoned_at is 'Closed: the row was retired, or the id was closed before any row was made (a tombstone). A replay is submission_closed.';
comment on column public.post_submissions.abandoning_until is 'While set and in the future, the abandon-submission function is asking Mux: replays and Retries are submission_busy.';

-- 20261013000200 body (with I1), plus: closed and held submissions.
create or replace function public.submission_replay(p_uid uuid, p_submission uuid, p_kind text, p_target uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.post_submissions%rowtype;
  v_status text;
begin
  if p_submission is null then return null; end if;
  select * into s from public.post_submissions where id = p_submission;
  if not found then return null; end if;
  if s.account_id is distinct from p_uid then raise exception 'submission_conflict' using errcode = 'P0001'; end if;
  if s.abandoned_at is not null then raise exception 'submission_closed' using errcode = 'P0001'; end if;
  if s.abandoning_until > now() then raise exception 'submission_busy' using errcode = 'P0001'; end if;
  if s.kind is distinct from p_kind
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

-- 20261013000200 body, plus: no new upload is put on a row while its abandonment is being checked.
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
  if exists (select 1 from public.post_submissions where response_id = p_response and abandoning_until > now()) then
    raise exception 'submission_busy' using errcode = 'P0001';
  end if;
  if v_old is not null and v_old = p_upload_id then return; end if;
  v_upload := public.claim_video_upload(v_uid, p_upload_id);
  update public.responses set mux_upload_id = p_upload_id where id = p_response;
  update public.video_uploads set response_id = p_response where id = v_upload;
  if v_old is not null and v_old <> p_upload_id then
    perform public.mux_cleanup_enqueue('cancel_upload', 'abandoned', null, v_old, p_response, v_uid);
  end if;
end;
$$;

-- Whether a row is still waiting for its video, so only Mux can say if it has one.
create function public.video_still_waiting(r public.responses)
returns boolean language sql stable set search_path = '' as $$
  select r.mux_asset_id is null and (r.status = 'processing' or (r.status = 'draft' and r.suggestion_id is not null));
$$;

-- Service role (the abandon-submission function), for the member it authenticated.
-- Answers {"status": "abandoned" | "not_found" | "kept" | "checking", ...}:
--   abandoned  {reason: no_row | already}: nothing to do at Mux;
--   not_found  another member's id;
--   kept       {reason: live | draft | removed | at_mux | busy, response_id}: left exactly as it is;
--   checking   {upload_id, response_id, token}: held; ask Mux, then finish_submission_abandon.
create function public.begin_submission_abandon(p_account uuid, p_submission uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.post_submissions%rowtype;
  r public.responses%rowtype;
  v_token uuid := gen_random_uuid();
begin
  if p_account is null or p_submission is null then raise exception 'invalid_request' using errcode = 'P0001'; end if;
  perform 1 from public.accounts where id = p_account for no key update;
  select * into s from public.post_submissions where id = p_submission for update;
  if not found then
    -- The request never made a row (rolled back, or not arrived yet): close the id, so a late
    -- copy of it is submission_closed instead of a new row.
    insert into public.post_submissions (id, account_id, abandoned_at) values (p_submission, p_account, now());
    return jsonb_build_object('status', 'abandoned', 'reason', 'no_row');
  end if;
  if s.account_id <> p_account then return jsonb_build_object('status', 'not_found'); end if;
  if s.abandoned_at is not null then return jsonb_build_object('status', 'abandoned', 'reason', 'already'); end if;
  if s.abandoning_until > now() then return jsonb_build_object('status', 'kept', 'reason', 'busy', 'response_id', s.response_id); end if;
  select * into r from public.responses where id = s.response_id and author_id = p_account for update;
  if not found or r.status = 'deleted' then
    update public.post_submissions set abandoned_at = now() where id = s.id;
    return jsonb_build_object('status', 'abandoned', 'reason', 'already');
  end if;
  if not public.video_still_waiting(r) then
    return jsonb_build_object('status', 'kept',
      'reason', case when r.mux_asset_id is not null and r.status in ('processing', 'draft') then 'at_mux' else r.status end,
      'response_id', r.id);
  end if;
  update public.post_submissions set abandoning_until = now() + interval '2 minutes', abandon_token = v_token where id = s.id;
  return jsonb_build_object('status', 'checking', 'upload_id', r.mux_upload_id, 'response_id', r.id, 'token', v_token);
end;
$$;

-- Service role: Mux's answer. 'abandon' retires the row only if it is still waiting for its video
-- (checked again under its lock: a webhook may have made it live meanwhile); 'keep' releases it.
-- A token from an earlier, expired hold does nothing.
create function public.finish_submission_abandon(p_submission uuid, p_token uuid, p_outcome text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.post_submissions%rowtype;
  r public.responses%rowtype;
begin
  if p_outcome not in ('abandon', 'keep') then raise exception 'invalid_outcome' using errcode = 'P0001'; end if;
  select * into s from public.post_submissions where id = p_submission for update;
  if not found or s.abandon_token is distinct from p_token then return jsonb_build_object('status', 'kept', 'reason', 'busy'); end if;
  update public.post_submissions set abandoning_until = null, abandon_token = null where id = s.id;
  select * into r from public.responses where id = s.response_id for update;
  if p_outcome = 'keep' or not found or not public.video_still_waiting(r) then
    return jsonb_build_object('status', 'kept', 'reason', case when found and public.video_still_waiting(r) then 'at_mux' when found then r.status else 'already' end, 'response_id', s.response_id);
  end if;
  update public.responses set status = 'deleted', deleted_at = now() where id = r.id;
  update public.video_uploads set cancelled_at = coalesce(cancelled_at, now()) where upload_id = r.mux_upload_id and response_id = r.id;
  update public.post_submissions set abandoned_at = now() where id = s.id;
  return jsonb_build_object('status', 'abandoned', 'reason', 'cancelled');
end;
$$;

revoke execute on function public.video_still_waiting(public.responses) from public, anon, authenticated;
revoke execute on function public.begin_submission_abandon(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.finish_submission_abandon(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_submission_abandon(uuid, uuid) to service_role;
grant execute on function public.finish_submission_abandon(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
