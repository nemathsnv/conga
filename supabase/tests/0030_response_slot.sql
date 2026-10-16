-- pgTAP tests for the response slot (20261016000300): a moderator's removal does not reopen it.
-- SPEC.md Section 6: one primary response per person per prompt; to change it the person deletes
-- it and records again. Removed by moderation keeps the slot; a restore keeps it the primary
-- response; the author's own deletion frees it; a draft is checked when it is published.
begin;
select plan(61);

delete from public.reports;
delete from public.review_requests;
delete from public.moderation_actions;
delete from public.responses;
delete from public.prompts;
delete from public.video_uploads;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now()),
  ('d4444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zed@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam'),
  ('d4444444-4444-4444-4444-444444444444', 'Zed Stone', 'testzed');
insert into public.prompts (id, text, status, published_at) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'P1 removed then restored', 'live', now()),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'P2 control', 'live', now()),
  ('33333333-aaaa-aaaa-aaaa-333333333333', 'P3 author deletes', 'live', now()),
  ('44444444-aaaa-aaaa-aaaa-444444444444', 'P4 review reversed', 'live', now()),
  ('55555555-aaaa-aaaa-aaaa-555555555555', 'P5 removed while processing', 'live', now()),
  ('66666666-aaaa-aaaa-aaaa-666666666666', 'P6 draft blocked', 'live', now()),
  ('77777777-aaaa-aaaa-aaaa-777777777777', 'P7 draft free', 'live', now()),
  ('88888888-aaaa-aaaa-aaaa-888888888888', 'P8 submission replay', 'live', now()),
  ('99999999-aaaa-aaaa-aaaa-999999999999', 'P9 purge', 'live', now());
insert into public.video_uploads (account_id, upload_id, status)
select 'a1111111-1111-1111-1111-111111111111', 'up' || n, 'active' from generate_series(1, 20) n;
insert into public.video_uploads (account_id, upload_id, status) values ('b2222222-2222-2222-2222-222222222222', 'upAdam', 'active');
-- Adam's live response, for video replies.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ad000000-0000-0000-0000-000000000001', '22222222-aaaa-aaaa-aaaa-222222222222', 'b2222222-2222-2222-2222-222222222222', 9000, 'live', 'upAdamLive', 'asAdamLive', 'pbAdamLive', now());

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
create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;

-- ===========================================================================
-- 1. Structure
-- ===========================================================================
select is((select indisunique from pg_index where indexrelid = 'public.responses_one_per_prompt'::regclass), true, 'the slot is a unique index');
select matches((select indexdef from pg_indexes where schemaname = 'public' and indexname = 'responses_one_per_prompt'), 'removed', 'it covers removed responses');
select doesnt_match((select indexdef from pg_indexes where schemaname = 'public' and indexname = 'responses_one_per_prompt'), 'deleted', 'and not deleted ones');
select doesnt_match((select indexdef from pg_indexes where schemaname = 'public' and indexname = 'responses_one_per_prompt'), 'draft', 'nor drafts');

-- ===========================================================================
-- 2. Removed by a moderator: the slot stays taken
-- ===========================================================================
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into ids select 'r1', ((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up1', 'first', 5000, gen_random_uuid()))->>'id')::uuid;
reset role;
update public.responses set status = 'live', mux_asset_id = 'as-r1', mux_playback_id = 'pb-r1', live_at = now() where id = (select id from ids where k = 'r1');
insert into ids select 'rm1', public.mod_remove_video((select id from ids where k = 'r1'), 'Harassment', 'nemat', 'internal note');
select is(pg_temp.status_of((select id from ids where k = 'r1')), 'removed', 'a moderator removes the response');

set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up2', 'again', 5000, gen_random_uuid()) $$), 'already_responded', 'responding again to the same prompt is refused with already_responded');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up2', 'again', 5000) $$), 'already_responded', 'also without a submission id (an older build)');
select is(pg_temp.upload_status('up2'), 'active', 'the refused post claimed nothing: the upload stays usable');
select is(pg_temp.rows(  'a1111111-1111-1111-1111-111111111111', '11111111-aaaa-aaaa-aaaa-111111111111'), 1, 'no second row was made');
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'up2', 'other prompt', 5000, gen_random_uuid()) $$), 'ok', 'another prompt is open as before');
select is(pg_temp.err($$ select public.delete_video((select id from ids where k = 'r1')) $$), 'video_not_found', 'the author cannot delete a response a moderator removed (it is not theirs to free)');
reset role;
select is(pg_temp.status_of((select id from ids where k = 'r1')), 'removed', 'it is still removed');
select throws_ok($$ insert into public.responses (prompt_id, author_id, duration_ms) values ('11111111-aaaa-aaaa-aaaa-111111111111', 'a1111111-1111-1111-1111-111111111111', 5000) $$,
                 '23505', null, 'the database itself refuses a second primary response, whatever function inserts it');

-- History and evidence are intact.
select is((select removed_action_id from public.responses where id = (select id from ids where k = 'r1')), (select id from ids where k = 'rm1'), 'the removal action is still on the row');
select is((select reason from public.moderation_actions where id = (select id from ids where k = 'rm1')), 'Harassment', 'the reason shown to the person is kept');
select is((select note from public.moderation_actions where id = (select id from ids where k = 'rm1')), 'internal note', 'and the internal note');
select is(jsonb_array_length(public.mod_account_log('a1111111-1111-1111-1111-111111111111')), 1, 'the account log shows the removal');
select is((select count(*)::int from public.activity where recipient_id = 'a1111111-1111-1111-1111-111111111111' and kind = 'removed'), 1, 'and the A-Removed notice was sent once');

-- ===========================================================================
-- 3. Restore: the response is the primary response again
-- ===========================================================================
select lives_ok($$ select public.mod_restore_video((select id from ids where k = 'r1'), 'Wrongly removed', 'nemat') $$, 'a moderator restores it');
select is(pg_temp.status_of((select id from ids where k = 'r1')), 'live', 'it is live again');
select is((select removed_action_id from public.responses where id = (select id from ids where k = 'r1')), null, 'with no removal on it');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up3', 'again', 5000, gen_random_uuid()) $$), 'already_responded', 'it is still their one response for the prompt');
select is(pg_temp.rows('a1111111-1111-1111-1111-111111111111', '11111111-aaaa-aaaa-aaaa-111111111111'), 1, 'still one row');
-- Now the author deletes it themselves: that frees the slot, as before.
select lives_ok($$ select public.delete_video((select id from ids where k = 'r1')) $$, 'the author deletes their own response');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'up3', 'new take', 5000, gen_random_uuid()) $$), 'ok', 'and can respond to the prompt again');
select is(pg_temp.rows('a1111111-1111-1111-1111-111111111111', '11111111-aaaa-aaaa-aaaa-111111111111'), 2, 'the deleted row is kept (history) beside the new one');

-- ===========================================================================
-- 4. The author's own deletion reopens (control, other prompt)
-- ===========================================================================
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into ids select 'r3', ((public.post_response('33333333-aaaa-aaaa-aaaa-333333333333', 'up4', null, 5000, gen_random_uuid()))->>'id')::uuid;
select lives_ok($$ select public.delete_video((select id from ids where k = 'r3')) $$, 'deleting a processing response');
select is(pg_temp.err($$ select public.post_response('33333333-aaaa-aaaa-aaaa-333333333333', 'up5', null, 5000, gen_random_uuid()) $$), 'ok', 'reopens the prompt');

-- ===========================================================================
-- 5. A review that reverses the removal gives the response back
-- ===========================================================================
insert into ids select 'r4', ((public.post_response('44444444-aaaa-aaaa-aaaa-444444444444', 'up6', null, 5000, gen_random_uuid()))->>'id')::uuid;
reset role;
update public.responses set status = 'live', mux_asset_id = 'as-r4', mux_playback_id = 'pb-r4', live_at = now() where id = (select id from ids where k = 'r4');
insert into ids select 'rm4', public.mod_remove_video((select id from ids where k = 'r4'), 'Spam', 'nemat');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.request_review((select id from ids where k = 'rm4')) $$, 'the author asks for a review');
select is(pg_temp.err($$ select public.post_response('44444444-aaaa-aaaa-aaaa-444444444444', 'up7', null, 5000, gen_random_uuid()) $$), 'already_responded', 'while the review is pending the slot is still held');
reset role;
select lives_ok($$ select public.mod_decide_review((select id from ids where k = 'rm4'), 'upheld', 'nemat') $$, 'upheld: the removal stands');
select is(pg_temp.status_of((select id from ids where k = 'r4')), 'removed', 'it stays removed');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('44444444-aaaa-aaaa-aaaa-444444444444', 'up7', null, 5000, gen_random_uuid()) $$), 'already_responded', 'and the slot stays taken');
reset role;
-- A second removal of another response then reversed by a review.
insert into public.prompts (id, text, status, published_at) values ('44444444-bbbb-bbbb-bbbb-444444444444', 'P4b review reversed', 'live', now());
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into ids select 'r4b', ((public.post_response('44444444-bbbb-bbbb-bbbb-444444444444', 'up8', null, 5000, gen_random_uuid()))->>'id')::uuid;
reset role;
update public.responses set status = 'live', mux_asset_id = 'as-r4b', mux_playback_id = 'pb-r4b', live_at = now() where id = (select id from ids where k = 'r4b');
insert into ids select 'rm4b', public.mod_remove_video((select id from ids where k = 'r4b'), 'Spam', 'nemat');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select lives_ok($$ select public.request_review((select id from ids where k = 'rm4b')) $$, 'a review on another removal');
reset role;
select lives_ok($$ select public.mod_decide_review((select id from ids where k = 'rm4b'), 'reversed', 'nemat', 'our mistake') $$, 'reversed');
select is(pg_temp.status_of((select id from ids where k = 'r4b')), 'live', 'the response is live again');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('44444444-bbbb-bbbb-bbbb-444444444444', 'up9', null, 5000, gen_random_uuid()) $$), 'already_responded', 'and it is their one response');

-- ===========================================================================
-- 6. Removed while still processing (no asset yet)
-- ===========================================================================
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into ids select 'r5', ((public.post_response('55555555-aaaa-aaaa-aaaa-555555555555', 'up10', null, 5000, gen_random_uuid()))->>'id')::uuid;
reset role;
select lives_ok($$ select public.mod_remove_video((select id from ids where k = 'r5'), 'Spam', 'nemat') $$, 'a processing response is removed');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('55555555-aaaa-aaaa-aaaa-555555555555', 'up11', null, 5000, gen_random_uuid()) $$), 'already_responded', 'it holds the slot too');
reset role;
select lives_ok($$ select public.mod_restore_video((select id from ids where k = 'r5'), 'Fine', 'nemat') $$, 'restored');
select is(pg_temp.status_of((select id from ids where k = 'r5')), 'processing', 'it goes back to processing');

-- ===========================================================================
-- 7. Drafts: publishing a first-response draft is checked like a post
-- ===========================================================================
insert into public.suggestions (id, author_id, text, status, prompt_id) values
  ('5a000000-0000-0000-0000-000000000006', 'a1111111-1111-1111-1111-111111111111', 'Draft prompt six', 'live', '66666666-aaaa-aaaa-aaaa-666666666666'),
  ('5a000000-0000-0000-0000-000000000007', 'a1111111-1111-1111-1111-111111111111', 'Draft prompt seven', 'live', '77777777-aaaa-aaaa-aaaa-777777777777');
insert into public.responses (id, status, suggestion_id, author_id, duration_ms, mux_upload_id, mux_asset_id, mux_playback_id) values
  ('d0000000-0000-0000-0000-000000000006', 'draft', '5a000000-0000-0000-0000-000000000006', 'a1111111-1111-1111-1111-111111111111', 6000, 'upDraft6', 'asDraft6', 'pbDraft6'),
  ('d0000000-0000-0000-0000-000000000007', 'draft', '5a000000-0000-0000-0000-000000000007', 'a1111111-1111-1111-1111-111111111111', 6000, 'upDraft7', 'asDraft7', 'pbDraft7');
-- On prompt 6 she already had a response, which a moderator removed.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ee000000-0000-0000-0000-000000000006', '66666666-aaaa-aaaa-aaaa-666666666666', 'a1111111-1111-1111-1111-111111111111', 5000, 'live', 'upE6', 'asE6', 'pbE6', now());
select lives_ok($$ select public.mod_remove_video('ee000000-0000-0000-0000-000000000006', 'Spam', 'nemat') $$, 'her response on prompt 6 is removed');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.publish_draft('5a000000-0000-0000-0000-000000000006') $$), 'already_responded', 'publishing the draft is refused: the removed response holds the slot');
select is(pg_temp.status_of('d0000000-0000-0000-0000-000000000006'), 'draft', 'the draft stays a private draft');
select is(pg_temp.err($$ select public.publish_draft('5a000000-0000-0000-0000-000000000007') $$), 'ok', 'a draft on a free prompt publishes as before');
select is(pg_temp.status_of('d0000000-0000-0000-0000-000000000007'), 'live', 'and goes live (it already had its video)');
reset role;
-- Even a function that forgot the check cannot publish into a held slot.
select throws_ok($$ update public.responses set prompt_id = '66666666-aaaa-aaaa-aaaa-666666666666', status = 'live' where id = 'd0000000-0000-0000-0000-000000000006' $$, '23505', null, 'the index also stops a direct publish');

-- ===========================================================================
-- 8. A repeated post of one recording
-- ===========================================================================
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into ids select 'r8', ((public.post_response('88888888-aaaa-aaaa-aaaa-888888888888', 'up12', null, 5000, 'c8000000-0000-0000-0000-000000000001'))->>'id')::uuid;
reset role;
update public.responses set status = 'live', mux_asset_id = 'as-r8', mux_playback_id = 'pb-r8', live_at = now() where id = (select id from ids where k = 'r8');
select lives_ok($$ select public.mod_remove_video((select id from ids where k = 'r8'), 'Spam', 'nemat') $$, 'a response is removed');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_response('88888888-aaaa-aaaa-aaaa-888888888888', 'up12', null, 5000, 'c8000000-0000-0000-0000-000000000001') $$), 'submission_closed', 'the same submission again: closed, it is not made again');
select is(pg_temp.err($$ select public.post_response('88888888-aaaa-aaaa-aaaa-888888888888', 'up13', null, 5000, 'c8000000-0000-0000-0000-000000000002') $$), 'already_responded', 'a new recording: already_responded');
select is(pg_temp.rows('a1111111-1111-1111-1111-111111111111', '88888888-aaaa-aaaa-aaaa-888888888888'), 1, 'one row either way');

-- ===========================================================================
-- 9. Video replies are not limited, removed or not
-- ===========================================================================
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into ids select 'rp1', ((public.post_reply('ad000000-0000-0000-0000-000000000001', 'up14', null, 5000, gen_random_uuid()))->>'id')::uuid;
reset role;
select lives_ok($$ select public.mod_remove_video((select id from ids where k = 'rp1'), 'Spam', 'nemat') $$, 'a video reply is removed');
set local role authenticated;
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
select is(pg_temp.err($$ select public.post_reply('ad000000-0000-0000-0000-000000000001', 'up15', null, 5000, gen_random_uuid()) $$), 'ok', 'a new video reply to the same response is still allowed');
reset role;

-- ===========================================================================
-- 10. Purge and tombstones
-- ===========================================================================
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ee000000-0000-0000-0000-000000000009', '99999999-aaaa-aaaa-aaaa-999999999999', 'd4444444-4444-4444-4444-444444444444', 5000, 'live', 'upZ', 'asZ', 'pbZ', now());
insert into public.responses (id, kind, prompt_id, root_response_id, reply_to_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ee000000-0000-0000-0000-00000000009a', 'reply', '99999999-aaaa-aaaa-aaaa-999999999999', 'ee000000-0000-0000-0000-000000000009', 'ee000000-0000-0000-0000-000000000009', 'b2222222-2222-2222-2222-222222222222', 4000, 'live', 'upAR', 'asAR', 'pbAR', now());
select lives_ok($$ select public.mod_remove_video('ee000000-0000-0000-0000-000000000009', 'Spam', 'nemat') $$, 'Zed''s response, which Adam replied to, is removed');
update public.accounts set deleted_at = now() - interval '31 days' where id = 'd4444444-4444-4444-4444-444444444444';
select is(public.purge_account('d4444444-4444-4444-4444-444444444444'), true, 'Zed is purged after 30 days');
select is((select status from public.responses where id = 'ee000000-0000-0000-0000-000000000009'), 'deleted', 'the response Adam replied to is now a tombstone (deleted, outside the slot rule)');
select is((select author_id from public.responses where id = 'ee000000-0000-0000-0000-000000000009'), null, 'with no author');
select is((select status from public.responses where id = 'ee000000-0000-0000-0000-00000000009a'), 'live', 'Adam''s reply is untouched');

select * from finish();
rollback;
