-- PROPOSED, NOT DEPLOYED (supabase/proposed/README.md).
--
-- prompt_card gains `viewer_responded`: the signed-in member already holds the one primary response
-- slot on this prompt (SPEC.md Section 6: one primary response per person per prompt; to change it,
-- the person deletes it and records again). Founder iPhone test, 19 Oct 2026: the + sheet offered
-- prompts already responded to, and Post was refused (already_responded) only after recording.
--
-- The test is the slot rule itself, the same predicate as the unique index responses_one_per_prompt
-- (20261016000300): kind 'response' and status processing, live or removed. A response removed by
-- a moderator still holds the slot, and only this field can say so: profile_responses does not list
-- removed responses. The index makes the check an index lookup. False when nobody is signed in
-- (web_prompt).
--
-- The body is 20261016000201_viewer_visibility.sql P4 exactly, plus the one field. Nothing else
-- changes: every function that returns prompt cards (home_feed, open_prompts, get_prompt,
-- prompt_responses, place_page, discover, search, web_prompt, ...) carries it.

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
    'is_own_suggestion', p.source = 'member' and p.suggested_by = auth.uid(),
    'viewer_responded', auth.uid() is not null and exists (
      select 1 from public.responses r
       where r.prompt_id = p.id and r.author_id = auth.uid()
         and r.kind = 'response' and r.status in ('processing', 'live', 'removed'))
  );
end;
$$;

notify pgrst, 'reload schema';
