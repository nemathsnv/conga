-- A moderator's removal does not reopen the response slot (Nemat, 16 Oct 2026; SPEC.md Section 6).
--
-- "One primary response per person per prompt. To change it, the person deletes it and records
-- again." Until now the rule was enforced only for responses that are processing or live, so a
-- response a moderator removed stopped counting and its author could respond to the same prompt
-- again, which the rule does not allow. The decision: a response removed by moderation still
-- occupies the slot.
--
--   removed by a moderator    occupies the slot (this migration)
--   restored (a moderator's restore, or a review that reverses the removal)
--                             is the member's primary response again, as it was
--   deleted by its author     frees the slot, as before (the member chose to delete it)
--   abandoned / replaced      frees the slot, as before (status deleted)
--   draft                     is not on a prompt yet; publishing it is a first response and is
--                             checked like any other
--
-- Only the status 'removed' is added to the rule. The row, its removed_action_id and the whole
-- moderation record stay exactly as they were: nothing is deleted or rewritten.
--
-- The hard guarantee is the unique index, so it holds for every function that inserts or
-- publishes a primary response, including any later definition of post_response that forgets the
-- explicit check below: the insert fails with a unique violation, which post_response answers as
-- already_responded.
--
-- Purge and tombstones: a purged account's rows are deleted by cascade (the account is gone, its
-- slot with it); a video other people's replies point at becomes a tombstone with status
-- 'deleted', which is outside the rule. No interaction.
--
-- Existing data: if a member already responded again after a removal (the behaviour being fixed),
-- two rows of one member on one prompt would violate the new index. The migration then stops with
-- the list, changing nothing; resolve those cases by hand (decide which row stands) and apply it
-- again. On a project without such cases it applies silently. The check to run first:
--   select author_id, prompt_id, array_agg(id) from public.responses
--    where kind = 'response' and status in ('processing', 'live', 'removed')
--    group by 1, 2 having count(*) > 1;

do $$
declare
  v_pairs text;
begin
  select string_agg(format('account %s prompt %s rows %s', author_id, prompt_id, ids), '; ') into v_pairs
    from (select author_id, prompt_id, array_agg(id order by created_at)::text as ids
            from public.responses
           where kind = 'response' and status in ('processing', 'live', 'removed')
           group by author_id, prompt_id
          having count(*) > 1) d;
  if v_pairs is not null then
    raise exception 'response_slot_conflicts: % - decide which response stands for each, then apply this migration again', v_pairs;
  end if;
end;
$$;

drop index public.responses_one_per_prompt;
create unique index responses_one_per_prompt on public.responses (prompt_id, author_id)
  where kind = 'response' and status in ('processing', 'live', 'removed');
comment on index public.responses_one_per_prompt is 'One primary response per person per prompt (SPEC.md Section 6). A response removed by moderation still occupies the slot; only the author''s own deletion frees it.';

-- ---------------------------------------------------------------------------
-- post_response: the 20261013000200 body, with 'removed' in the slot check. Nothing else changed.
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
  -- 'removed' occupies the slot too: a moderator's removal does not give the prompt back.
  if exists (select 1 from public.responses where prompt_id = p_prompt and author_id = v_uid and kind = 'response' and status in ('processing', 'live', 'removed')) then
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

-- ---------------------------------------------------------------------------
-- publish_draft (20261009000100 body): 'removed' in the slot check, and the update answers
-- already_responded if the index refuses it.
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
  if exists (select 1 from public.responses x where x.prompt_id = sg.prompt_id and x.author_id = v_uid and x.kind = 'response' and x.status in ('processing', 'live', 'removed')) then
    raise exception 'already_responded' using errcode = 'P0001';
  end if;
  begin
    update public.responses
       set prompt_id = sg.prompt_id,
           status = case when mux_playback_id is null then 'processing' else 'live' end,
           live_at = case when mux_playback_id is null then null else now() end
     where id = r.id returning * into r;
  exception when unique_violation then
    raise exception 'already_responded' using errcode = 'P0001';
  end;
  return public.response_card(r, v_uid);
end;
$$;

-- Grants are unchanged (create or replace keeps them); repeated so the file stands on its own.
revoke execute on function public.post_response(uuid, text, text, integer, uuid) from public, anon;
grant execute on function public.post_response(uuid, text, text, integer, uuid) to authenticated;
revoke execute on function public.publish_draft(uuid) from public, anon;
grant execute on function public.publish_draft(uuid) to authenticated;

notify pgrst, 'reload schema';
