-- ROLLBACK for 20261019000200_multiple_responses.sql. NOT a migration: nothing applies this file.
--
-- Use only if Nemat decides to go back to one primary response per person per prompt. Copy it to a
-- new forward migration and push that (or apply it on a local stack to test).
--
-- It restores, verbatim, the unique index of 20261016000300 (processing, live and removed occupy the
-- slot), post_response from 20261013000200, publish_draft from 20261016000300 and prompt_card from
-- 20261016000201. Rows are never changed.
--
-- It cannot be applied once any member has two or more processing, live or removed responses on one
-- prompt (which this feature allows): the index would not build. It then stops with the list and
-- changes nothing. Deciding which of those responses stands (and deleting the others with the
-- author's agreement) is a product decision, not something a rollback may do. Before that happens,
-- the app update can be rolled back on its own: the old app refuses nothing extra, and the server
-- keeps accepting several responses.
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
    raise exception 'multiple_responses_exist: % - one response per prompt cannot be restored while these exist', v_pairs;
  end if;
end;
$$;

drop index public.responses_author_prompt_idx;
create unique index responses_one_per_prompt on public.responses (prompt_id, author_id)
  where kind = 'response' and status in ('processing', 'live', 'removed');
comment on index public.responses_one_per_prompt is 'One primary response per person per prompt (SPEC.md Section 6). A response removed by moderation still occupies the slot; only the author''s own deletion frees it.';

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

-- From 20261016000300_response_slot_moderation.sql:
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

-- From 20261016000201_viewer_visibility.sql:
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
    'faces', (select coalesce(jsonb_agg(public.profile_card(x.author_id)), '[]'::jsonb)
                from (select r.author_id from public.responses r
                       where r.prompt_id = p.id and r.kind = 'response' and public.video_visible(r, auth.uid())
                       order by r.live_at desc limit 3) x),
    'suggested_by', case when p.source = 'member' and p.attribution and p.suggested_by is not null and public.can_see(auth.uid(), p.suggested_by) then public.profile_card(p.suggested_by) end,
    'is_own_suggestion', p.source = 'member' and p.suggested_by = auth.uid()
  );
end;
$$;

revoke execute on function public.post_response(uuid, text, text, integer, uuid) from public, anon;
grant execute on function public.post_response(uuid, text, text, integer, uuid) to authenticated;
revoke execute on function public.publish_draft(uuid) from public, anon;
grant execute on function public.publish_draft(uuid) to authenticated;

notify pgrst, 'reload schema';
