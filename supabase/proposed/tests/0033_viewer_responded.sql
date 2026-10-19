-- pgTAP tests for the PROPOSED prompt_card.viewer_responded (supabase/proposed/
-- 20261019000100_prompt_card_viewer_responded.sql). Run after applying that file.
-- viewer_responded is true exactly when post_response would refuse with already_responded: the
-- member has a primary response on the prompt that is processing, live or removed by a moderator.
-- Their own deletion frees it; video replies and other members' responses do not count.
begin;
select plan(14);

delete from public.reports;
delete from public.review_requests;
delete from public.moderation_actions;
delete from public.responses;
delete from public.prompts;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam');
insert into public.prompts (id, text, status, published_at) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'P1 live', 'live', now()),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'P2 processing', 'live', now()),
  ('33333333-aaaa-aaaa-aaaa-333333333333', 'P3 removed', 'live', now()),
  ('44444444-aaaa-aaaa-aaaa-444444444444', 'P4 deleted by author', 'live', now()),
  ('55555555-aaaa-aaaa-aaaa-555555555555', 'P5 only a video reply', 'live', now()),
  ('66666666-aaaa-aaaa-aaaa-666666666666', 'P6 none', 'live', now());
-- Lena's responses in every state.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('1e000000-0000-0000-0000-000000000001', '11111111-aaaa-aaaa-aaaa-111111111111', 'a1111111-1111-1111-1111-111111111111', 5000, 'live', 'u1', 'a1', 'p1', now()),
  ('1e000000-0000-0000-0000-000000000002', '22222222-aaaa-aaaa-aaaa-222222222222', 'a1111111-1111-1111-1111-111111111111', 5000, 'processing', 'u2', null, null, null),
  ('1e000000-0000-0000-0000-000000000003', '33333333-aaaa-aaaa-aaaa-333333333333', 'a1111111-1111-1111-1111-111111111111', 5000, 'removed', 'u3', 'a3', 'p3', now()),
  ('1e000000-0000-0000-0000-000000000004', '44444444-aaaa-aaaa-aaaa-444444444444', 'a1111111-1111-1111-1111-111111111111', 5000, 'deleted', 'u4', 'a4', 'p4', now());
-- Adam's live response on P5, and Lena's video reply to it (not a primary response).
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ad000000-0000-0000-0000-000000000005', '55555555-aaaa-aaaa-aaaa-555555555555', 'b2222222-2222-2222-2222-222222222222', 5000, 'live', 'u5', 'a5', 'p5', now());
insert into public.responses (id, kind, prompt_id, root_response_id, reply_to_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('1e000000-0000-0000-0000-000000000006', 'reply', '55555555-aaaa-aaaa-aaaa-555555555555', 'ad000000-0000-0000-0000-000000000005', 'ad000000-0000-0000-0000-000000000005', 'a1111111-1111-1111-1111-111111111111', 5000, 'live', 'u6', 'a6', 'p6', now());

create function pg_temp.act(p_account uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_account, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.act(uuid) to authenticated;
create function pg_temp.card(p_prompt uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select public.prompt_card(p) from public.prompts p where p.id = p_prompt $$;
grant execute on function pg_temp.card(uuid) to authenticated, anon;
create function pg_temp.held() returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.prompts p where (public.prompt_card(p) ->> 'viewer_responded')::boolean $$;
grant execute on function pg_temp.held() to authenticated;

-- Lena
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is((pg_temp.card('11111111-aaaa-aaaa-aaaa-111111111111') ->> 'viewer_responded')::boolean, true, 'live response: responded');
select is((pg_temp.card('22222222-aaaa-aaaa-aaaa-222222222222') ->> 'viewer_responded')::boolean, true, 'processing response: responded');
select is((pg_temp.card('33333333-aaaa-aaaa-aaaa-333333333333') ->> 'viewer_responded')::boolean, true, 'removed by a moderator: still responded (the slot is held)');
select is((pg_temp.card('44444444-aaaa-aaaa-aaaa-444444444444') ->> 'viewer_responded')::boolean, false, 'deleted by the author: free again');
select is((pg_temp.card('55555555-aaaa-aaaa-aaaa-555555555555') ->> 'viewer_responded')::boolean, false, 'a video reply is not a primary response');
select is((pg_temp.card('66666666-aaaa-aaaa-aaaa-666666666666') ->> 'viewer_responded')::boolean, false, 'nothing on the prompt');
-- The field agrees with the server's refusal: post_response refuses exactly where it is true.
select is(pg_temp.held(), 3, 'three prompts held for Lena');
select is(jsonb_typeof(pg_temp.card('66666666-aaaa-aaaa-aaaa-666666666666') -> 'viewer_responded'), 'boolean', 'always a boolean for a member');
-- open_prompts (the + sheet) carries it.
select ok((select bool_and(c ? 'viewer_responded') from jsonb_array_elements(public.open_prompts(50)) c), 'open_prompts cards carry viewer_responded');
select is((select (c ->> 'viewer_responded')::boolean from jsonb_array_elements(public.open_prompts(50)) c where c ->> 'id' = '11111111-aaaa-aaaa-aaaa-111111111111'), true, 'open_prompts: Lena responded to P1');
reset role;

-- Adam sees his own slots only.
set local role authenticated;
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select is((pg_temp.card('55555555-aaaa-aaaa-aaaa-555555555555') ->> 'viewer_responded')::boolean, true, 'Adam: his own live response');
select is((pg_temp.card('11111111-aaaa-aaaa-aaaa-111111111111') ->> 'viewer_responded')::boolean, false, 'Adam: Lena''s response is not his');
reset role;

-- Nobody signed in (web_prompt).
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
select is((pg_temp.card('11111111-aaaa-aaaa-aaaa-111111111111') ->> 'viewer_responded')::boolean, false, 'signed out: false');
reset role;

-- The rest of the card is unchanged.
select is(
  (select public.prompt_card(p) - 'viewer_responded' - 'response_count' - 'faces' from public.prompts p where p.id = '66666666-aaaa-aaaa-aaaa-666666666666'),
  (select jsonb_build_object('id', p.id, 'text', p.text, 'place', null, 'featured_on', p.featured_on, 'published_at', p.published_at, 'topic_id', p.topic_id, 'suggested_by', null, 'is_own_suggestion', false) from public.prompts p where p.id = '66666666-aaaa-aaaa-aaaa-666666666666'),
  'other fields as before');

select * from finish();
rollback;
