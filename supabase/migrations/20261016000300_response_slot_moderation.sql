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
-- The guarantee is the unique index, so it holds for every function that inserts or publishes a
-- primary response, whatever its body. post_response is deliberately NOT redefined here (another
-- change owns that function's upload logic, and a copy of its body would overwrite it): its
-- existing check still looks only at processing and live responses, so a removed one is found by
-- the insert instead, whose unique violation post_response already answers as already_responded
-- (the claim of the upload is undone with it, so the upload stays usable). Whoever next edits
-- post_response should add 'removed' to its explicit check (the status list in the exists test
-- before the claim) so the refusal comes before the claim; nothing depends on it.
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
revoke execute on function public.publish_draft(uuid) from public, anon;
grant execute on function public.publish_draft(uuid) to authenticated;

notify pgrst, 'reload schema';
