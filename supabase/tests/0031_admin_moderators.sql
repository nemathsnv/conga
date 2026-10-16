-- pgTAP tests for the moderation admin's database side (20261016000301): the moderators table
-- (RLS, no app access, service-role write), the membership check, and the read functions the
-- admin uses. The admin function's own authorization is tested in supabase/functions/_tests/admin_*.
begin;
select plan(86);

delete from public.moderators;
delete from public.reports;
delete from public.review_requests;
delete from public.moderation_actions;
delete from public.responses;
delete from public.prompts;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now()),
  ('c3333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya@example.com', '{}', '{}', now(), now()),
  ('e5555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'noprofile@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam'),
  ('c3333333-3333-3333-3333-333333333333', 'Maya Lindqvist', 'testmaya');
insert into public.prompts (id, text, status, published_at) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Be honest about the place you live.', 'live', now());
insert into public.responses (id, prompt_id, author_id, caption, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('d4444444-4444-4444-4444-444444444444', '11111111-aaaa-aaaa-aaaa-111111111111', 'b2222222-2222-2222-2222-222222222222', 'Walk the rice fields.', 12000, 'live', 'up-adam', 'as-adam', 'pb-adam', now() - interval '2 hours'),
  ('d5555555-5555-5555-5555-555555555555', '11111111-aaaa-aaaa-aaaa-111111111111', 'c3333333-3333-3333-3333-333333333333', 'Sunset.', 8000, 'live', 'up-maya', 'as-maya', 'pb-maya', now() - interval '1 hour');
insert into public.responses (id, kind, prompt_id, root_response_id, reply_to_id, author_id, caption, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('e6666666-6666-6666-6666-666666666666', 'reply', '11111111-aaaa-aaaa-aaaa-111111111111', 'd4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111', '7am.', 5000, 'live', 'up-lena-r', 'as-lena-r', 'pb-lena-r', now() - interval '30 minutes');
insert into public.comments (id, response_id, author_id, body) values
  ('f7777777-7777-7777-7777-777777777777', 'd4444444-4444-4444-4444-444444444444', 'a1111111-1111-1111-1111-111111111111', 'Nobody believes me.');
insert into public.reports (id, reporter_id, target_kind, target_id, reason) values
  ('91000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'video', 'd5555555-5555-5555-5555-555555555555', 'spam'),
  ('91000000-0000-0000-0000-000000000002', 'b2222222-2222-2222-2222-222222222222', 'video', 'd5555555-5555-5555-5555-555555555555', 'harassment'),
  ('91000000-0000-0000-0000-000000000003', 'b2222222-2222-2222-2222-222222222222', 'comment', 'f7777777-7777-7777-7777-777777777777', 'harassment');

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
grant execute on function pg_temp.err(text) to authenticated, anon, service_role;

-- ===========================================================================
-- 1. The moderators table: RLS on, no policy, nothing for the app
-- ===========================================================================
select has_table('public', 'moderators', 'the moderators table exists');
select is((select relrowsecurity from pg_class where oid = 'public.moderators'::regclass), true, 'RLS is on');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'moderators'), 0, 'no policy: RLS denies every member');
select columns_are('public', 'moderators', array['account_id', 'active', 'added_at', 'added_by'], 'the columns are account_id, active, added_at, added_by');
select col_is_pk('public', 'moderators', 'account_id', 'one row per account');
select is(has_table_privilege('anon', 'public.moderators', 'select') or has_table_privilege('anon', 'public.moderators', 'insert') or has_table_privilege('anon', 'public.moderators', 'update') or has_table_privilege('anon', 'public.moderators', 'delete'), false, 'anon has no privilege on it');
select is(has_table_privilege('authenticated', 'public.moderators', 'select') or has_table_privilege('authenticated', 'public.moderators', 'insert') or has_table_privilege('authenticated', 'public.moderators', 'update') or has_table_privilege('authenticated', 'public.moderators', 'delete'), false, 'authenticated has no privilege on it');
select is(has_table_privilege('service_role', 'public.moderators', 'select') and has_table_privilege('service_role', 'public.moderators', 'insert') and has_table_privilege('service_role', 'public.moderators', 'update'), true, 'the service role can read and write it');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(pg_temp.err($$ select * from public.moderators $$), 'permission denied for table moderators', 'a member cannot read it');
select is(pg_temp.err($$ insert into public.moderators (account_id, added_by) values ('a1111111-1111-1111-1111-111111111111', 'me') $$), 'permission denied for table moderators', 'or make themselves a moderator');
select is(pg_temp.err($$ update public.moderators set active = true $$), 'permission denied for table moderators', 'or change it');
select is(pg_temp.err($$ select public.mod_add_moderator('a1111111-1111-1111-1111-111111111111', 'me') $$), 'permission denied for function mod_add_moderator', 'or call mod_add_moderator');
select is(pg_temp.err($$ select public.mod_whoami('a1111111-1111-1111-1111-111111111111') $$), 'permission denied for function mod_whoami', 'or ask who is a moderator');
reset role;
set local role anon;
select is(pg_temp.err($$ select * from public.moderators $$), 'permission denied for table moderators', 'anon cannot read it');
select is(pg_temp.err($$ select public.mod_whoami('a1111111-1111-1111-1111-111111111111') $$), 'permission denied for function mod_whoami', 'nor call mod_whoami');
reset role;

-- Every function of the admin is for the service role only.
select is((select count(*)::int from pg_proc p where pronamespace = 'public'::regnamespace
            and proname in ('mod_add_moderator', 'mod_deactivate_moderator', 'mod_list_moderators', 'mod_whoami', 'mod_account_summary', 'mod_report_detail', 'mod_video_detail', 'mod_comment_detail', 'mod_account_lookup', 'mod_account_overview')
            and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or not has_function_privilege('service_role', p.oid, 'execute'))), 0,
          'the ten functions are executable by the service role only');
select is((select count(*)::int from pg_proc p where pronamespace = 'public'::regnamespace and proname like 'mod\_%'
            and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))), 0,
          'no mod_* function at all is executable by anon or authenticated');
select is((select count(*)::int from pg_proc p where pronamespace = 'public'::regnamespace and proname like 'mod\_%' and (not prosecdef or proowner <> 'postgres'::regrole or not coalesce(proconfig @> array['search_path=""'], false))),
          0, 'every mod_* function is SECURITY DEFINER with an empty search_path');
select is((select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and proname = 'mod_warn'), 0, 'there is no standalone warn');

-- ===========================================================================
-- 2. Membership: service role writes; the check is exact
-- ===========================================================================
set local role service_role;
select is(pg_temp.err($$ select public.mod_add_moderator('a1111111-1111-1111-1111-111111111111', '') $$), 'moderator_required', 'who adds is required');
select is(pg_temp.err($$ select public.mod_add_moderator('99999999-9999-9999-9999-999999999999', 'nemat') $$), 'account_not_found', 'the account must exist');
select is(pg_temp.err($$ select public.mod_add_moderator(null, 'nemat') $$), 'account_not_found', 'null is not an account');
select is((public.mod_add_moderator('a1111111-1111-1111-1111-111111111111', 'nemat'))->>'username', 'testlena', 'the service role adds Lena');
select is(pg_temp.err($$ insert into public.moderators (account_id, added_by) values ('b2222222-2222-2222-2222-222222222222', ' ') $$), 'new row for relation "moderators" violates check constraint "moderators_added_by_check"', 'who added them cannot be blank');
select is((select count(*)::int from public.moderators), 1, 'one moderator');
select is((public.mod_whoami('a1111111-1111-1111-1111-111111111111'))->>'username', 'testlena', 'Lena is an active moderator');
select is((public.mod_whoami('a1111111-1111-1111-1111-111111111111'))->>'identity', '@testlena (a1111111-1111-1111-1111-111111111111)', 'with the identity the log records');
select is(public.mod_whoami('b2222222-2222-2222-2222-222222222222'), null, 'Adam is not');
select is(public.mod_whoami(null), null, 'null is not');
select is(public.mod_whoami('99999999-9999-9999-9999-999999999999'), null, 'nor an unknown account');
select is((public.mod_deactivate_moderator('a1111111-1111-1111-1111-111111111111')), true, 'turned off');
select is(public.mod_whoami('a1111111-1111-1111-1111-111111111111'), null, 'switched off: not a moderator at once');
select is((select count(*)::int from public.moderators where account_id = 'a1111111-1111-1111-1111-111111111111'), 1, 'but the row stays (who was a moderator is kept)');
select is(public.mod_deactivate_moderator('b2222222-2222-2222-2222-222222222222'), false, 'turning off a non-moderator changes nothing');
select is((public.mod_add_moderator('a1111111-1111-1111-1111-111111111111', 'someone'))->>'active', 'true', 'added again');
select is((select added_by from public.moderators where account_id = 'a1111111-1111-1111-1111-111111111111'), 'someone', 'with who added them this time');
select is((public.mod_whoami('a1111111-1111-1111-1111-111111111111'))->>'username', 'testlena', 'an active moderator again');
select is((public.mod_add_moderator('e5555555-5555-5555-5555-555555555555', 'nemat'))->>'username', null, 'an account without a profile can be added');
select is((public.mod_whoami('e5555555-5555-5555-5555-555555555555'))->>'identity', 'account (e5555555-5555-5555-5555-555555555555)', 'and is identified by its id');
select is(jsonb_array_length(public.mod_list_moderators()), 2, 'the list has both');
select is((public.mod_deactivate_moderator('e5555555-5555-5555-5555-555555555555')), true, 'and the second is turned off');
reset role;

-- A moderator whose own account is suspended or deleted is not one.
update public.accounts set moderation_status = 'suspended' where id = 'a1111111-1111-1111-1111-111111111111';
select is(public.mod_whoami('a1111111-1111-1111-1111-111111111111'), null, 'suspended: not a moderator');
update public.accounts set moderation_status = 'restricted', restricted_until = now() + interval '1 day' where id = 'a1111111-1111-1111-1111-111111111111';
select is((public.mod_whoami('a1111111-1111-1111-1111-111111111111'))->>'username', 'testlena', 'restricted (posting paused) can still moderate');
update public.accounts set moderation_status = 'active', restricted_until = null, deleted_at = now() where id = 'a1111111-1111-1111-1111-111111111111';
select is(public.mod_whoami('a1111111-1111-1111-1111-111111111111'), null, 'deleted: not a moderator');
update public.accounts set deleted_at = null where id = 'a1111111-1111-1111-1111-111111111111';
select is((public.mod_whoami('a1111111-1111-1111-1111-111111111111'))->>'username', 'testlena', 'restored: a moderator again');

-- ===========================================================================
-- 3. The read functions
-- ===========================================================================
-- A removed video and its review.
select lives_ok($$ select public.mod_remove_video('d5555555-5555-5555-5555-555555555555', 'Spam.', '@testlena (a1111111-1111-1111-1111-111111111111)', 'two reports') $$, 'remove Maya''s response');

select is((public.mod_video_detail('d4444444-4444-4444-4444-444444444444'))->>'playback_id', 'pb-adam', 'a live video shows its public playback id');
select is((public.mod_video_detail('d4444444-4444-4444-4444-444444444444'))->>'playback_public', 'true', 'and says it is public');
select is((public.mod_video_detail('d4444444-4444-4444-4444-444444444444'))->'author'->>'username', 'testadam', 'with its author');
select is((public.mod_video_detail('d4444444-4444-4444-4444-444444444444'))->'prompt'->>'text', 'Be honest about the place you live.', 'and its prompt');
select is((public.mod_video_detail('d5555555-5555-5555-5555-555555555555'))->>'status', 'removed', 'a removed video is shown to moderators');
select is((public.mod_video_detail('d5555555-5555-5555-5555-555555555555'))->>'playback_id', null, 'with no playback id');
select is((public.mod_video_detail('d5555555-5555-5555-5555-555555555555'))->>'playback_public', 'false', 'and not public');
select is((public.mod_video_detail('d5555555-5555-5555-5555-555555555555'))->'removal'->>'reason', 'Spam.', 'the reason shown to the person');
select is((public.mod_video_detail('d5555555-5555-5555-5555-555555555555'))->'removal'->>'note', 'two reports', 'the internal note');
select is((public.mod_video_detail('d5555555-5555-5555-5555-555555555555'))->>'holds_response_slot', 'true', 'a removed response holds its author''s response slot');
select is((public.mod_video_detail('d5555555-5555-5555-5555-555555555555'))->>'restorable', 'true', 'and can be restored');
select is((public.mod_video_detail('d5555555-5555-5555-5555-555555555555'))->>'all_reports', '2', 'two reports');
select is((public.mod_video_detail('d5555555-5555-5555-5555-555555555555'))->>'open_reports', '0', 'closed by the removal');
select is((public.mod_video_detail('e6666666-6666-6666-6666-666666666666'))->>'holds_response_slot', 'false', 'a video reply holds no slot');
select is(public.mod_video_detail('99999999-9999-9999-9999-999999999999'), null, 'an unknown video is null');

select is((public.mod_comment_detail('f7777777-7777-7777-7777-777777777777'))->>'body', 'Nobody believes me.', 'a comment is shown with its text');
select is((public.mod_comment_detail('f7777777-7777-7777-7777-777777777777'))->'author'->>'username', 'testlena', 'and author');
select is((public.mod_comment_detail('f7777777-7777-7777-7777-777777777777'))->'response'->>'status', 'live', 'and what it is on');
select lives_ok($$ select public.mod_remove_comment('f7777777-7777-7777-7777-777777777777', 'Harassment.', 'nemat', 'n') $$, 'remove the comment');
select is((public.mod_comment_detail('f7777777-7777-7777-7777-777777777777'))->>'body', 'Nobody believes me.', 'a removed comment keeps its text for moderators');
select is((public.mod_comment_detail('f7777777-7777-7777-7777-777777777777'))->>'removed_by_moderation', 'true', 'and says it was removed by moderation');
select is((public.mod_comment_detail('f7777777-7777-7777-7777-777777777777'))->'removal'->>'reason', 'Harassment.', 'with the reason');

select is((public.mod_report_detail('91000000-0000-0000-0000-000000000002'))->'reporter'->>'username', 'testadam', 'a report names its reporter (to moderators only)');
select is(jsonb_array_length((public.mod_report_detail('91000000-0000-0000-0000-000000000002'))->'others'), 1, 'and lists the other reports on the same video');
select is((public.mod_report_detail('91000000-0000-0000-0000-000000000002'))->>'status', 'closed', 'closed by the removal');
select is(public.mod_report_detail('99999999-9999-9999-9999-999999999999'), null, 'an unknown report is null');

select is(jsonb_array_length(public.mod_account_lookup('testl')), 1, 'lookup by the beginning of a username');
select is((public.mod_account_lookup('@TestLena'))->0->>'id', 'a1111111-1111-1111-1111-111111111111', 'exact, with @ and any case');
select is((public.mod_account_lookup('a1111111-1111-1111-1111-111111111111'))->0->>'username', 'testlena', 'by account id');
select is(jsonb_array_length(public.mod_account_lookup('test')), 3, 'a short beginning finds all three');
select is(public.mod_account_lookup('%'), '[]'::jsonb, 'a wildcard matches nothing');
select is(public.mod_account_lookup('_estlena'), '[]'::jsonb, 'nor does an underscore stand for a letter');
select is(public.mod_account_lookup(''), '[]'::jsonb, 'an empty search finds nothing');
select is(public.mod_account_lookup(null), '[]'::jsonb, 'null too');
select is(public.mod_account_lookup(repeat('a', 200)), '[]'::jsonb, 'and a very long one');

select is(jsonb_array_length((public.mod_account_overview('b2222222-2222-2222-2222-222222222222'))->'videos'), 1, 'an account overview lists its videos');
select is(jsonb_array_length((public.mod_account_overview('a1111111-1111-1111-1111-111111111111'))->'comments'), 1, 'and its comments');
select is((public.mod_account_overview('a1111111-1111-1111-1111-111111111111'))->>'is_moderator', 'true', 'and whether it is a moderator');
select is(public.mod_account_overview('99999999-9999-9999-9999-999999999999'), null, 'an unknown account is null');
select is(strpos(((public.mod_account_overview('a1111111-1111-1111-1111-111111111111'))::text || (public.mod_account_lookup('testlena'))::text || (public.mod_report_detail('91000000-0000-0000-0000-000000000002'))::text), '@example.com'), 0, 'no email address appears in any of them');

select * from finish();
rollback;
