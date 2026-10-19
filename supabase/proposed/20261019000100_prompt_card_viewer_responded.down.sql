-- Rollback of 20261019000100_prompt_card_viewer_responded.sql: prompt_card as in
-- 20261016000201_viewer_visibility.sql P4 (without viewer_responded). The app works either way.
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

notify pgrst, 'reload schema';
