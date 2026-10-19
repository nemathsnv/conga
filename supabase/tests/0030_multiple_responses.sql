-- pgTAP tests for several responses per person per prompt (20261019000200; Nemat, 19 Oct 2026;
-- SPEC.md Section 6). Replaces the one-response slot tests of 20261016000300.
-- A member may respond to one prompt with any number of independent videos. What still holds:
-- one row per submission (a repeated request returns the first row), one row per upload, the
-- account checks (suspended, posting paused, deleted), and moderation (a removed video stays
-- removed, with its whole record) without refusing a different video.
begin;
select plan(97);

delete from public.reports;
delete from public.review_requests;
delete from public.moderation_actions;
delete from public.activity;
delete from public.likes;
delete from public.comments;
delete from public.follows;
delete from public.responses;
delete from public.prompts;
delete from public.video_uploads;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now()),
  ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya@example.com', '{}', '{}', now(), now()),
  ('d4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zed@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam'),
  ('c3333333-3333-3333-3333-333333333333', 'Maya Reyes', 'testmaya'),
  ('d4444444-4444-4444-4444-444444444444', 'Zed Stone', 'testzed');
insert into public.prompts (id, text, status, published_at) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'P1 nature', 'live', now()),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'P2 moderation', 'live', now()),
  ('33333333-aaaa-aaaa-aaaa-333333333333', 'P3 account checks', 'live', now()),
  ('66666666-aaaa-aaaa-aaaa-666666666666', 'P6 draft', 'live', now()),
  ('77777777-aaaa-aaaa-aaaa-777777777777', 'P7 archived', 'archived', now()),
  ('99999999-aaaa-aaaa-aaaa-999999999999', 'P9 purge', 'live', now());
insert into public.video_uploads (account_id, upload_id, status)
select 'a1111111-1111-1111-1111-111111111111', 'up' || n, 'active' from generate_series(1, 30) n;
insert into public.video_uploads (account_id, upload_id, status)
select 'b2222222-2222-2222-2222-222222222222', 'upA' || n, 'active' from generate_series(1, 5) n;
-- Maya follows Lena.
insert into public.follows (follower_id, followee_id) values ('c3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111');

create function pg_temp.err(p_sql text) returns text language plpgsql as $$
declare m text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics m = message_text;
  return m;
end;
$$;
grant execute on function pg_temp.err(text) to authenticated;
create function pg_temp.act(p_account uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_account, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.act(uuid) to authenticated;
create function pg_temp.status_of(p_id uuid) returns text language sql stable security definer set search_path = '' as $$ select status from public.responses where id = p_id $$;
grant execute on function pg_temp.status_of(uuid) to authenticated;
create function pg_temp.rows(p_author uuid, p_prompt uuid) returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.responses where author_id = p_author and prompt_id = p_prompt and kind = 'response' $$;
grant execute on function pg_temp.rows(uuid, uuid) to authenticated;
create function pg_temp.upload_status(p_upload text) returns text language sql stable security definer set search_path = '' as $$ select status from public.video_uploads where upload_id = p_upload $$;
grant execute on function pg_temp.upload_status(text) to authenticated;
-- Marks a response live as the Mux webhook would.
create function pg_temp.go_live(p_id uuid, p_tag text) returns void language sql security definer set search_path = '' as $$
  update public.responses set status = 'live', mux_asset_id = 'as-' || p_tag, mux_playback_id = 'pb-' || p_tag, live_at = clock_timestamp() where id = p_id $$;
create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;

-- ===========================================================================
-- 1. Structure: no uniqueness on (prompt, author) any more
-- ===========================================================================
select is((select count(*)::int from pg_indexes where schemaname = 'public' and indexname = 'responses_one_per_prompt'), 0, 'the one-per-prompt unique index is gone');
select is((select indisunique from pg_index where indexrelid = 'public.responses_author_prompt_idx'::regclass), false, 'a plain lookup index replaces it');
select is((select count(*)::int from pg_index i join pg_class c on c.oid = i.indrelid
            where c.relname = 'responses' and i.indisunique and pg_get_indexdef(i.indexrelid) ~ 'prompt_id' and pg_get_indexdef(i.indexrelid) ~ 'author_id'),
          0, 'no unique index on responses covers prompt and author together');

-- ===========================================================================
-- 2. Several independent responses from one account to one prompt
-- ===========================================================================
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into ids select 'nl', ((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up1', 'The Netherlands', 9000, 'c1000000-0000-0000-0000-000000000001'))->>'id')::uuid;
select isnt((select id from ids where k = 'nl'), null, 'the first response is made');
insert into ids select 'no', ((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up2', 'Norway', 12000, 'c1000000-0000-0000-0000-000000000002'))->>'id')::uuid;
select isnt((select id from ids where k = 'no'), null, 'a second response to the same prompt is accepted');
insert into ids select 'jp', ((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up3', 'Japan', 20000, 'c1000000-0000-0000-0000-000000000003'))->>'id')::uuid;
select isnt((select id from ids where k = 'jp'), null, 'and a third');
select is((select count(distinct id)::int from ids where k in ('nl', 'no', 'jp')), 3, 'three different rows');
select is(pg_temp.rows('a1111111-1111-1111-1111-111111111111', '11111111-aaaa-aaaa-aaaa-111111111111'), 3, 'three responses of Lena on P1');
select is((select count(*)::int from public.responses where id in (select id from ids where k in ('nl', 'no', 'jp')) and status = 'processing'), 3, 'each is processing until its video is ready');
select is((select array_agg(caption order by created_at) from public.responses where id in (select id from ids where k in ('nl', 'no', 'jp'))), array['The Netherlands', 'Norway', 'Japan'], 'each keeps its own caption');
select is((select array_agg(mux_upload_id order by created_at) from public.responses where id in (select id from ids where k in ('nl', 'no', 'jp'))), array['up1', 'up2', 'up3'], 'and its own upload');
-- Her own processing responses are on her profile, all three.
select is(jsonb_array_length(public.profile_responses('a1111111-1111-1111-1111-111111111111')), 3, 'Me lists all three while processing');
reset role;
select is((select count(*)::int from public.post_submissions where response_id in (select id from ids where k in ('nl', 'no', 'jp'))), 3, 'one submission record each');
select pg_temp.go_live((select id from ids where k = 'nl'), 'nl');
select pg_temp.go_live((select id from ids where k = 'no'), 'no');
select pg_temp.go_live((select id from ids where k = 'jp'), 'jp');
-- Adam responds once.
set local role authenticated;
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
insert into ids select 'adam1', ((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upA1', null, 5000, gen_random_uuid()))->>'id')::uuid;
reset role;
select pg_temp.go_live((select id from ids where k = 'adam1'), 'adam1');

-- Feeds, counts and profiles, as Maya (who follows Lena).
set local role authenticated;
select pg_temp.act('c3333333-3333-3333-3333-333333333333');
reset role;
select is(public.response_count('11111111-aaaa-aaaa-aaaa-111111111111'), 4, 'the prompt counts every response: 4');
set local role authenticated;
select is(jsonb_array_length(public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111')->'responses'), 4, 'the player lists all four');
select is((select count(*)::int from jsonb_array_elements(public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111')->'responses') x where x->'author'->>'username' = 'testlena'),
          3, 'three of them Lena''s');
select is((public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111')->'responses'->0->'author'->>'username'), 'testlena', 'someone you follow comes first');
select is(public.prompt_responses('11111111-aaaa-aaaa-aaaa-111111111111', (select id from ids where k = 'no'))->'responses'->0->>'id',
          (select id from ids where k = 'no')::text, 'entering from one of her responses starts at that one');
reset role;
select is(jsonb_array_length(public.prompt_card((select p from public.prompts p where id = '11111111-aaaa-aaaa-aaaa-111111111111'))->'faces'), 2, 'the face strip shows each person once: Lena and Adam');
set local role authenticated;
reset role;
select is((select count(distinct x->>'id')::int from jsonb_array_elements(public.prompt_card((select p from public.prompts p where id = '11111111-aaaa-aaaa-aaaa-111111111111'))->'faces') x),
          2, 'no face twice');
set local role authenticated;
reset role;
select is(public.prompt_card((select p from public.prompts p where id = '11111111-aaaa-aaaa-aaaa-111111111111'))->'faces'->0->>'username', 'testadam', 'the most recent responder first');
set local role authenticated;
reset role;
select is((public.prompt_card((select p from public.prompts p where id = '11111111-aaaa-aaaa-aaaa-111111111111'))->>'response_count')::int, 4, 'the card''s count is 4');
set local role authenticated;
select is((select count(*)::int from jsonb_array_elements(public.home_feed()) x where x->'prompt'->>'id' = '11111111-aaaa-aaaa-aaaa-111111111111'), 1, 'Home shows the prompt once');
select is((select x->'response'->'author'->>'username' from jsonb_array_elements(public.home_feed()) x where x->'prompt'->>'id' = '11111111-aaaa-aaaa-aaaa-111111111111'), 'testlena', 'with a response from someone Maya follows');
select is((select count(*)::int from jsonb_array_elements(public.following_feed()) x where x->'prompt'->>'id' = '11111111-aaaa-aaaa-aaaa-111111111111'), 3, 'Following shows each of Lena''s three responses');
select is(jsonb_array_length(public.profile_responses('a1111111-1111-1111-1111-111111111111')), 3, 'Lena''s profile lists all three');
select is((public.get_profile('a1111111-1111-1111-1111-111111111111')->>'response_count')::int, 3, 'and counts three');
select is((select count(*)::int from public.activity where recipient_id = 'c3333333-3333-3333-3333-333333333333' and kind = 'followed_responded' and actor_id = 'a1111111-1111-1111-1111-111111111111'), 3, 'Activity has a row per new response of someone Maya follows');
select is((select count(*)::int from jsonb_array_elements(public.activity_list()->'rows') x where x->>'kind' = 'followed_responded'), 1, 'grouped into one Activity item for the prompt');
select is((select (x->>'actor_count')::int from jsonb_array_elements(public.activity_list()->'rows') x where x->>'kind' = 'followed_responded'), 1, 'naming Lena once');

-- Likes, comments and video replies belong to one response, not to the prompt.
select lives_ok($$ select public.like_video((select id from ids where k = 'nl')) $$, 'Maya likes the Netherlands response');
select lives_ok($$ select public.post_comment((select id from ids where k = 'nl'), 'Beautiful', null) $$, 'and comments on it');
reset role;
select is(public.like_count((select id from ids where k = 'nl')), 1, 'it has one like');
set local role authenticated;
reset role;
select is(public.like_count((select id from ids where k = 'no')), 0, 'the Norway response has none');
set local role authenticated;
reset role;
select is(public.comment_count((select id from ids where k = 'nl'), 'c3333333-3333-3333-3333-333333333333'::uuid), 1, 'one comment on the Netherlands response');
set local role authenticated;
reset role;
select is(public.comment_count((select id from ids where k = 'jp'), 'c3333333-3333-3333-3333-333333333333'::uuid), 0, 'none on Japan');
set local role authenticated;
reset role;
select lives_ok($$ select set_config('request.jwt.claims', json_build_object('sub', 'b2222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true) $$, 'as Adam');
set local role authenticated;
select is(pg_temp.err($$ select public.post_reply((select id from ids where k = 'jp'), 'upA2', null, 5000, gen_random_uuid()) $$), 'ok', 'Adam replies on video to the Japan response');
reset role;
select is((select count(*)::int from public.responses where kind = 'reply' and root_response_id = (select id from ids where k = 'jp')), 1, 'its room has one reply (processing)');
select is((select count(*)::int from public.responses where kind = 'reply' and root_response_id = (select id from ids where k = 'nl')), 0, 'the Netherlands room has none');

-- ===========================================================================
-- 3. Duplicate protection: one row per submission and per upload
-- ===========================================================================
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up1', 'The Netherlands', 9000, 'c1000000-0000-0000-0000-000000000001'))->>'id',
          (select id from ids where k = 'nl')::text, 'the same request again returns the first row');
select is((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up1', 'The Netherlands', 9000, 'c1000000-0000-0000-0000-000000000001'))->>'replayed', 'true', 'marked replayed');
select is(pg_temp.rows('a1111111-1111-1111-1111-111111111111', '11111111-aaaa-aaaa-aaaa-111111111111'), 3, 'still three rows');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up4', 'The Netherlands', 9000, 'c1000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'the same submission with another upload is refused');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up1', 'The Netherlands', 9000, 'c1000000-0000-0000-0000-0000000000ff') $$), 'upload_already_used', 'another submission with a used upload is refused');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up1', 'The Netherlands', 9000) $$), 'upload_already_used', 'an older build (no submission id) repeating a post is refused');
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'up1', null, 9000, gen_random_uuid()) $$), 'upload_already_used', 'a used upload cannot go to another prompt either');
select is(pg_temp.upload_status('up4'), 'active', 'refused posts claim nothing: up4 stays usable');
select is(pg_temp.rows('a1111111-1111-1111-1111-111111111111', '11111111-aaaa-aaaa-aaaa-111111111111'), 3, 'no row was made by any of them');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up4', null, 9000) $$), 'ok', 'an older build posting a new recording makes a new response');
select is(pg_temp.rows('a1111111-1111-1111-1111-111111111111', '11111111-aaaa-aaaa-aaaa-111111111111'), 4, 'four now');
-- The other limits are those of any post.
select is(pg_temp.err($$ select public.post_response('77777777-aaaa-aaaa-aaaa-777777777777', 'up5', null, 9000, gen_random_uuid()) $$), 'prompt_not_found', 'an archived prompt takes no response');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up5', null, 1500, gen_random_uuid()) $$), 'invalid_duration', 'under 2 seconds is refused');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up5', null, 31001, gen_random_uuid()) $$), 'invalid_duration', 'over 31 seconds is refused');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up-not-mine', null, 9000, gen_random_uuid()) $$), 'upload_not_found', 'an upload never minted for her is refused');
reset role;

-- ===========================================================================
-- 4. Moderation: a removed video stays removed; a different video is allowed
-- ===========================================================================
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into ids select 'm1', ((public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'up6', 'first', 5000, 'c2000000-0000-0000-0000-000000000001'))->>'id')::uuid;
reset role;
select pg_temp.go_live((select id from ids where k = 'm1'), 'm1');
insert into ids select 'rm1', public.mod_remove_video((select id from ids where k = 'm1'), 'Harassment', 'nemat', 'internal note');
select is(pg_temp.status_of((select id from ids where k = 'm1')), 'removed', 'a moderator removes the response');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'up6', 'first', 5000, 'c2000000-0000-0000-0000-000000000001') $$), 'submission_closed', 'the removed recording cannot be posted again (submission closed)');
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'up6', 'first', 5000, gen_random_uuid()) $$), 'upload_already_used', 'nor its upload under a new submission');
select is(pg_temp.err($$ select public.delete_video((select id from ids where k = 'm1')) $$), 'video_not_found', 'the author cannot delete the removed response');
insert into ids select 'm2', ((public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'up7', 'a different video', 5000, gen_random_uuid()))->>'id')::uuid;
select isnt((select id from ids where k = 'm2'), null, 'a different video to the same prompt is accepted');
reset role;
select is(pg_temp.status_of((select id from ids where k = 'm1')), 'removed', 'the removed one is still removed');
select is((select removed_action_id from public.responses where id = (select id from ids where k = 'm1')), (select id from ids where k = 'rm1'), 'the removal action is still on its row');
select is((select reason from public.moderation_actions where id = (select id from ids where k = 'rm1')), 'Harassment', 'the reason is kept');
select is((select note from public.moderation_actions where id = (select id from ids where k = 'rm1')), 'internal note', 'and the internal note');
select is((select count(*)::int from public.activity where recipient_id = 'a1111111-1111-1111-1111-111111111111' and kind = 'removed'), 1, 'the A-Removed notice was sent once');
-- A pending review does not block either.
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.request_review((select id from ids where k = 'rm1')) $$, 'the author asks for a review');
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'up8', 'third', 5000, gen_random_uuid()) $$), 'ok', 'and can still respond while it is pending');
reset role;
select lives_ok($$ select public.mod_decide_review((select id from ids where k = 'rm1'), 'reversed', 'nemat', 'our mistake') $$, 'the review reverses the removal');
select is(pg_temp.status_of((select id from ids where k = 'm1')), 'live', 'the restored response is live beside her other responses');
select is(pg_temp.rows('a1111111-1111-1111-1111-111111111111', '22222222-aaaa-aaaa-aaaa-222222222222'), 3, 'three rows on P2, none lost');
-- Removed while processing, then restored: no collision with her other responses.
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into ids select 'm4', ((public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'up9', null, 5000, gen_random_uuid()))->>'id')::uuid;
reset role;
select lives_ok($$ select public.mod_remove_video((select id from ids where k = 'm4'), 'Spam', 'nemat') $$, 'a processing response is removed');
select lives_ok($$ select public.mod_restore_video((select id from ids where k = 'm4'), 'Fine', 'nemat') $$, 'and restored');
select is(pg_temp.status_of((select id from ids where k = 'm4')), 'processing', 'back to processing');
-- The author's own deletion of one response leaves the others.
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.delete_video((select id from ids where k = 'no')) $$, 'Lena deletes her Norway response');
reset role;
select is(pg_temp.status_of((select id from ids where k = 'no')), 'deleted', 'it is deleted');
select is((select array_agg(status order by created_at) from public.responses where id in ((select id from ids where k = 'nl'), (select id from ids where k = 'jp'))), array['live', 'live'], 'the Netherlands and Japan stay live');
select is(public.like_count((select id from ids where k = 'nl')), 1, 'with their likes');

-- ===========================================================================
-- 5. Account enforcement is unchanged
-- ===========================================================================
select lives_ok($$ select public.mod_restrict('a1111111-1111-1111-1111-111111111111', now() + interval '7 days', 'Spam', 'nemat') $$, 'Lena''s posting is paused');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('33333333-aaaa-aaaa-aaaa-333333333333', 'up10', null, 5000, gen_random_uuid()) $$), 'posting_paused', 'paused: no response');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up1', 'The Netherlands', 9000, 'c1000000-0000-0000-0000-000000000001') $$), 'posting_paused', 'not even a replay while paused');
reset role;
select lives_ok($$ select public.mod_restore_account('a1111111-1111-1111-1111-111111111111', 'Lifted', 'nemat') $$, 'the restriction is lifted');
select lives_ok($$ select public.mod_suspend('a1111111-1111-1111-1111-111111111111', 'Abuse', 'nemat') $$, 'Lena is suspended');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('33333333-aaaa-aaaa-aaaa-333333333333', 'up10', null, 5000, gen_random_uuid()) $$), 'suspended', 'suspended: no response');
reset role;
select lives_ok($$ select public.mod_restore_account('a1111111-1111-1111-1111-111111111111', 'Lifted', 'nemat') $$, 'the suspension is lifted');
update public.accounts set deleted_at = now() where id = 'a1111111-1111-1111-1111-111111111111';
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('33333333-aaaa-aaaa-aaaa-333333333333', 'up10', null, 5000, gen_random_uuid()) $$), 'account_deleted', 'a deleted account: no response');
reset role;
update public.accounts set deleted_at = null where id = 'a1111111-1111-1111-1111-111111111111';
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('33333333-aaaa-aaaa-aaaa-333333333333', 'up10', null, 5000, gen_random_uuid()) $$), 'ok', 'back in good standing she can respond');
reset role;

-- ===========================================================================
-- 6. Drafts publish beside existing responses
-- ===========================================================================
insert into public.suggestions (id, author_id, text, status, prompt_id) values
  ('5a000000-0000-0000-0000-000000000006', 'a1111111-1111-1111-1111-111111111111', 'Draft prompt six', 'live', '66666666-aaaa-aaaa-aaaa-666666666666');
insert into public.responses (id, status, suggestion_id, author_id, duration_ms, mux_upload_id, mux_asset_id, mux_playback_id) values
  ('d0000000-0000-0000-0000-000000000006', 'draft', '5a000000-0000-0000-0000-000000000006', 'a1111111-1111-1111-1111-111111111111', 6000, 'upDraft6', 'asDraft6', 'pbDraft6');
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ee000000-0000-0000-0000-000000000006', '66666666-aaaa-aaaa-aaaa-666666666666', 'a1111111-1111-1111-1111-111111111111', 5000, 'live', 'upE6', 'asE6', 'pbE6', now()),
  ('ee000000-0000-0000-0000-000000000016', '66666666-aaaa-aaaa-aaaa-666666666666', 'a1111111-1111-1111-1111-111111111111', 5000, 'live', 'upE16', 'asE16', 'pbE16', now());
select lives_ok($$ select public.mod_remove_video('ee000000-0000-0000-0000-000000000016', 'Spam', 'nemat') $$, 'one of her two responses on P6 is removed');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.publish_draft('5a000000-0000-0000-0000-000000000006') $$), 'ok', 'her draft publishes although she has a live and a removed response there');
reset role;
select is(pg_temp.status_of('d0000000-0000-0000-0000-000000000006'), 'live', 'the draft is live');
select is(pg_temp.status_of('ee000000-0000-0000-0000-000000000016'), 'removed', 'the removed one is untouched');
select is(pg_temp.rows('a1111111-1111-1111-1111-111111111111', '66666666-aaaa-aaaa-aaaa-666666666666'), 3, 'three responses on P6');

-- ===========================================================================
-- 7. Video replies are not limited (unchanged)
-- ===========================================================================
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_reply((select id from ids where k = 'adam1'), 'up11', null, 5000, gen_random_uuid()) $$), 'ok', 'a video reply to Adam');
select is(pg_temp.err($$ select public.post_reply((select id from ids where k = 'adam1'), 'up12', null, 5000, gen_random_uuid()) $$), 'ok', 'and another');
reset role;

-- ===========================================================================
-- 8. Purge and tombstones (unchanged)
-- ===========================================================================
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ee000000-0000-0000-0000-000000000009', '99999999-aaaa-aaaa-aaaa-999999999999', 'd4444444-4444-4444-4444-444444444444', 5000, 'live', 'upZ', 'asZ', 'pbZ', now()),
  ('ee000000-0000-0000-0000-000000000019', '99999999-aaaa-aaaa-aaaa-999999999999', 'd4444444-4444-4444-4444-444444444444', 5000, 'live', 'upZ2', 'asZ2', 'pbZ2', now());
insert into public.responses (id, kind, prompt_id, root_response_id, reply_to_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ee000000-0000-0000-0000-00000000009a', 'reply', '99999999-aaaa-aaaa-aaaa-999999999999', 'ee000000-0000-0000-0000-000000000009', 'ee000000-0000-0000-0000-000000000009', 'b2222222-2222-2222-2222-222222222222', 4000, 'live', 'upAR', 'asAR', 'pbAR', now());
update public.accounts set deleted_at = now() - interval '31 days' where id = 'd4444444-4444-4444-4444-444444444444';
select is(public.purge_account('d4444444-4444-4444-4444-444444444444'), true, 'Zed, with two responses on one prompt, is purged after 30 days');
select is((select status from public.responses where id = 'ee000000-0000-0000-0000-000000000009'), 'deleted', 'the response Adam replied to is a tombstone');
select is((select count(*)::int from public.responses where id = 'ee000000-0000-0000-0000-000000000019'), 0, 'the other is gone with the account');
select is((select status from public.responses where id = 'ee000000-0000-0000-0000-00000000009a'), 'live', 'Adam''s reply is untouched');

select * from finish();
rollback;
