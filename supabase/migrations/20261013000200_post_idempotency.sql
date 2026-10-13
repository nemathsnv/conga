-- Posting is idempotent per submission (BETA-READINESS.md section 17.3, approved for local work
-- 13 Oct).
--
-- The case: post_response, post_reply or post_draft commits (the upload claimed, the row created)
-- and its answer is lost. Before this migration the app could not learn the row:
--   post_reply   the same upload again is upload_already_used; the next Post mints a new URL and
--                creates a second reply;
--   post_draft   the same, and the second draft replaces the first;
--   post_response already_responded on every later Post: the member can never respond to that
--                prompt, and the first row stays processing with no bytes, invisible.
--
-- The app now makes one submission id (a UUID) per recording and sends it with every attempt to
-- post that recording, including after an app restart (it is stored with the pending post before
-- the request is sent). public.post_submissions records each submission's request once, with the
-- row it created. A later call with the same id and the same request returns that row instead of
-- creating another; anything else about it is refused.
--
-- Order inside each posting function (so nothing existing is returned before these checks):
--   1. signed in; 2. the member's own lock (the one reserve_video_upload takes), so concurrent
--   attempts of one submission queue and the second finds the first; 3. account checks as before
--   (profile, suspended, posting paused, deleted, disclosure); 4. the submission: someone else's,
--   or the same id with a different request, is submission_conflict (one answer for both, so it
--   says nothing about other members); a video no longer processing, live or a draft is
--   submission_closed; otherwise the first call's answer, with "replayed": true; 5. everything
--   else as before (target, limits, the claim of the upload, the row), then the submission is
--   recorded in the same transaction.
--
-- Old app builds call with four arguments: p_submission defaults to null and they get exactly
-- the old behaviour. The four-argument functions are dropped (a second overload would make those
-- calls ambiguous).
--
-- abandon_submission is for a recording the person discards after a Post whose answer never
-- arrived. It only ever retires a row the app has provably sent nothing to: still processing, no
-- asset, still on the upload the submission claimed (a Retry would have replaced it, and the app
-- sends bytes only once it knows the row). It does not call Mux: the URL, which only that phone
-- had, times out unused.

create table public.post_submissions (
  id uuid primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  kind text not null check (kind in ('response', 'reply', 'draft')),
  -- The prompt, the video replied to, or the suggestion.
  target_id uuid not null,
  -- The upload the first call claimed. One submission per upload, one per row.
  upload_id text not null unique,
  caption text,
  duration_ms integer not null,
  response_id uuid unique references public.responses (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.post_submissions is 'One row per posted recording (the app''s submission id): the request as first made and the row it created, so a retried post returns that row (section 17.3).';
create index post_submissions_account_idx on public.post_submissions (account_id, created_at desc);

-- Deny-all to members: written and read only by the SECURITY DEFINER functions below.
alter table public.post_submissions enable row level security;
revoke all on table public.post_submissions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The submission check (internal)
-- ---------------------------------------------------------------------------

-- The row an earlier call of this submission created, or null if the submission is new.
-- Raises submission_conflict when the id is another member's, or the request differs in any way
-- (kind, target, upload, caption, duration); submission_closed when its video was abandoned,
-- deleted or removed (or is gone).
create function public.submission_replay(p_uid uuid, p_submission uuid, p_kind text, p_target uuid, p_upload_id text, p_caption text, p_duration_ms integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.post_submissions%rowtype;
  v_status text;
begin
  if p_submission is null then return null; end if;
  select * into s from public.post_submissions where id = p_submission;
  if not found then return null; end if;
  if s.account_id <> p_uid
     or s.kind <> p_kind
     or s.target_id <> p_target
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

-- Records the submission for the row just created, in the caller's transaction. A clash on the
-- id (another member's, created at the same moment) undoes the whole post.
create function public.record_submission(p_uid uuid, p_submission uuid, p_kind text, p_target uuid, p_upload_id text, p_caption text, p_duration_ms integer, p_response uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_submission is null then return; end if;
  insert into public.post_submissions (id, account_id, kind, target_id, upload_id, caption, duration_ms, response_id)
  values (p_submission, p_uid, p_kind, p_target, p_upload_id, nullif(btrim(coalesce(p_caption, '')), ''), p_duration_ms, p_response);
exception when unique_violation then
  raise exception 'submission_conflict' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Posting (20261012000100 and 20261012000200 bodies, plus the submission)
-- ---------------------------------------------------------------------------

drop function public.post_response(uuid, text, text, integer);
create function public.post_response(p_prompt uuid, p_upload_id text, p_caption text, p_duration_ms integer, p_submission uuid default null)
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

drop function public.post_reply(uuid, text, text, integer);
create function public.post_reply(p_reply_to uuid, p_upload_id text, p_caption text, p_duration_ms integer, p_submission uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  target public.responses%rowtype;
  v_root uuid;
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
  v_existing := public.submission_replay(v_uid, p_submission, 'reply', p_reply_to, p_upload_id, p_caption, p_duration_ms);
  if v_existing is not null then
    select * into r from public.responses where id = v_existing;
    return public.response_card(r, v_uid) || jsonb_build_object('replayed', true);
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
  perform public.record_submission(v_uid, p_submission, 'reply', p_reply_to, p_upload_id, p_caption, p_duration_ms, r.id);
  return public.response_card(r, v_uid);
end;
$$;

drop function public.post_draft(uuid, text, text, integer);
create function public.post_draft(p_suggestion uuid, p_upload_id text, p_caption text, p_duration_ms integer, p_submission uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_upload uuid;
  v_existing uuid;
  old public.responses%rowtype;
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform 1 from public.accounts where id = v_uid for no key update;
  if not exists (select 1 from public.suggestions where id = p_suggestion and author_id = v_uid and status in ('in_review', 'live', 'not_published', 'withdrawn')) then
    raise exception 'suggestion_not_found' using errcode = 'P0001';
  end if;
  -- A replay returns the draft as it is: it never replaces itself.
  v_existing := public.submission_replay(v_uid, p_submission, 'draft', p_suggestion, p_upload_id, p_caption, p_duration_ms);
  if v_existing is not null then
    select * into r from public.responses where id = v_existing;
    return jsonb_build_object('id', r.id, 'status', r.status, 'replayed', true);
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
  perform public.record_submission(v_uid, p_submission, 'draft', p_suggestion, p_upload_id, p_caption, p_duration_ms, r.id);
  return jsonb_build_object('id', r.id, 'status', r.status);
end;
$$;

-- 20261012000200 body, plus: the upload already on the row is a repeat of a call whose answer was
-- lost, and changes nothing (before, it was upload_already_used).
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

-- ---------------------------------------------------------------------------
-- Discarding a recording whose Post never got an answer
-- ---------------------------------------------------------------------------

-- Answers 'abandoned' (the row is now deleted, so the prompt is free again), 'kept' (the row is
-- left exactly as it is), or 'not_found' (no such submission of the caller's; also for another
-- member's id, so nothing is revealed). Kept, never touched:
--   - anything not processing: a live (published) video, a draft, removed or already deleted;
--   - a row with an asset: Mux has the video;
--   - a row no longer on the upload the submission claimed: a Retry replaced it, so the app knew
--     the row and may have sent bytes;
--   - a row whose upload is not claimed by it in the ledger (an inconsistent, ambiguous state).
-- Mux is not called and the ledger is not changed: the claimed URL stays claimed and times out.
create function public.abandon_submission(p_submission uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s public.post_submissions%rowtype;
  r public.responses%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in' using errcode = '42501'; end if;
  perform 1 from public.accounts where id = v_uid for no key update;
  select * into s from public.post_submissions where id = p_submission and account_id = v_uid;
  if not found or s.response_id is null then return 'not_found'; end if;
  select * into r from public.responses where id = s.response_id and author_id = v_uid for update;
  if not found then return 'not_found'; end if;
  if r.status <> 'processing'
     or r.mux_asset_id is not null
     or r.mux_upload_id is distinct from s.upload_id
     or not exists (select 1 from public.video_uploads u where u.upload_id = s.upload_id and u.account_id = v_uid and u.status = 'claimed' and u.response_id = r.id) then
    return 'kept';
  end if;
  update public.responses set status = 'deleted', deleted_at = now() where id = r.id;
  return 'abandoned';
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (revoke everything, grant by name)
-- ---------------------------------------------------------------------------
revoke execute on function public.submission_replay(uuid, uuid, text, uuid, text, text, integer) from public, anon, authenticated, service_role;
revoke execute on function public.record_submission(uuid, uuid, text, uuid, text, text, integer, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.post_response(uuid, text, text, integer, uuid) from public, anon;
revoke execute on function public.post_reply(uuid, text, text, integer, uuid) from public, anon;
revoke execute on function public.post_draft(uuid, text, text, integer, uuid) from public, anon;
revoke execute on function public.abandon_submission(uuid) from public, anon;
grant execute on function public.post_response(uuid, text, text, integer, uuid) to authenticated;
grant execute on function public.post_reply(uuid, text, text, integer, uuid) to authenticated;
grant execute on function public.post_draft(uuid, text, text, integer, uuid) to authenticated;
grant execute on function public.abandon_submission(uuid) to authenticated;

notify pgrst, 'reload schema';
