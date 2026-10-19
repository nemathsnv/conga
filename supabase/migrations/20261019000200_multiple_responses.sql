-- Several responses per person per prompt (Nemat, 19 Oct 2026; SPEC.md Section 6, docs/DECISIONS.md).
--
-- Before: "One primary response per person per prompt. To change it, the person deletes it and
-- records again." Enforced by the unique index responses_one_per_prompt (processing, live and,
-- since 20261016000300, removed) and by explicit checks in post_response and publish_draft, which
-- answered already_responded.
--
-- Now: a member may respond to the same prompt with any number of independent videos, at any time
-- while the prompt is open (a nature prompt answered from the Netherlands today, Norway next month,
-- Japan later). Each is an ordinary response with its own likes, comments, video replies, reports
-- and moderation record.
--
-- What changes:
--   1. The unique index goes. A plain index with the same columns and predicate replaces it, so the
--      queries that used it to find a member's responses on a prompt keep their plan.
--   2. post_response (20261013000200 body) without the already_responded check and without the
--      unique_violation handler that mapped the index's refusal to it.
--   3. publish_draft (20261016000300 body) without the same check and handler.
--   4. prompt_card 'faces' (20261016000201 body): the three most recent responders, each once. With
--      several responses per person, the three newest responses could be one face three times.
--
-- What does not change (and is what still stops duplicates and abuse):
--   - Idempotency: one submission id per recording (post_submissions). The same request again
--     returns the first row (replayed); the same id with any other request is submission_conflict;
--     a replay of a removed, deleted or abandoned video is submission_closed. Unchanged.
--   - One claim per upload (claim_video_upload): the same upload can never make a second row, with
--     or without a submission id (older builds). Unchanged.
--   - Upload limits (reserve_video_upload): 10 an hour, 30 a day, 3 unused active URLs per account,
--     for responses, video replies and drafts together. Unchanged.
--   - Account enforcement: assert_can_post (suspended, posting paused, deleted), the profile and
--     disclosure checks, the prompt being live, 2 to 30 seconds, the 150-character caption.
--   - Moderation: a removed video stays removed (status, removed_action_id, the action, the notice,
--     a review); it is simply no longer a reason to refuse a different video. Restoring a removed
--     response can no longer collide with anything.
--   - Rows: nothing is deleted or rewritten. Existing responses, comments, replies, likes, reports,
--     moderation actions, analytics and submissions are untouched.
--
-- already_responded is never raised any more. The app still maps it (an older server), so an app
-- update published before this migration is deployed keeps a clear refusal line.
--
-- Rollback: rollback/20261019000200_multiple_responses.down.sql. It can only be applied while no
-- member has two counted responses on one prompt; it stops with the list otherwise (see there).

-- ---------------------------------------------------------------------------
-- 1. The index
-- ---------------------------------------------------------------------------
drop index public.responses_one_per_prompt;
create index responses_author_prompt_idx on public.responses (prompt_id, author_id)
  where kind = 'response' and status in ('processing', 'live', 'removed');
comment on index public.responses_author_prompt_idx is 'A member''s responses on a prompt (lookup only). Not unique: a member may respond to a prompt more than once (SPEC.md Section 6, 19 Oct 2026).';

-- ---------------------------------------------------------------------------
-- 2. post_response (20261013000200 body, minus the one-response check)
-- ---------------------------------------------------------------------------
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
  v_upload := public.claim_video_upload(v_uid, p_upload_id);
  insert into public.responses (prompt_id, author_id, caption, duration_ms, mux_upload_id)
  values (p_prompt, v_uid, v_caption, p_duration_ms, p_upload_id)
  returning * into r;
  update public.video_uploads set response_id = r.id where id = v_upload;
  perform public.record_submission(v_uid, p_submission, 'response', p_prompt, p_upload_id, p_caption, p_duration_ms, r.id);
  return public.response_card(r, v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. publish_draft (20261016000300 body, minus the one-response check)
-- ---------------------------------------------------------------------------
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
  update public.responses
     set prompt_id = sg.prompt_id,
         status = case when mux_playback_id is null then 'processing' else 'live' end,
         live_at = case when mux_playback_id is null then null else now() end
   where id = r.id returning * into r;
  return public.response_card(r, v_uid);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. prompt_card (20261016000201 body): each face once
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
    -- The three people who responded most recently (by their newest visible response), each once.
    'faces', (select coalesce(jsonb_agg(public.profile_card(x.author_id) order by x.last_live desc), '[]'::jsonb)
                from (select r.author_id, max(r.live_at) as last_live from public.responses r
                       where r.prompt_id = p.id and r.kind = 'response' and public.video_visible(r, auth.uid())
                       group by r.author_id
                       order by max(r.live_at) desc nulls last limit 3) x),
    'suggested_by', case when p.source = 'member' and p.attribution and p.suggested_by is not null and public.can_see(auth.uid(), p.suggested_by) then public.profile_card(p.suggested_by) end,
    'is_own_suggestion', p.source = 'member' and p.suggested_by = auth.uid()
  );
end;
$$;

-- Grants are unchanged (create or replace keeps them); repeated so the file stands on its own.
revoke execute on function public.post_response(uuid, text, text, integer, uuid) from public, anon;
grant execute on function public.post_response(uuid, text, text, integer, uuid) to authenticated;
revoke execute on function public.publish_draft(uuid) from public, anon;
grant execute on function public.publish_draft(uuid) to authenticated;

notify pgrst, 'reload schema';
