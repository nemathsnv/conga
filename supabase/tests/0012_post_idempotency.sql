-- pgTAP tests for posting idempotency (20261013000200): one submission per recording; a retried
-- post returns the row the first call created; anything else about a submission id is refused;
-- no API role can call abandon_submission, which 20261013000300 replaced (its tests: 0013). Real
-- concurrency (separate transactions) is covered by supabase/functions/_tests/idempotency_integration_test.ts.
begin;
select plan(77);

delete from public.responses;
delete from public.prompts;
delete from public.video_uploads;

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'adam@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now();
insert into public.profiles (id, name, username) values
  ('a1111111-1111-1111-1111-111111111111', 'Lena Hart', 'testlena'),
  ('b2222222-2222-2222-2222-222222222222', 'Adam Novak', 'testadam');
insert into public.prompts (id, text, status, published_at) values
  ('11111111-aaaa-aaaa-aaaa-111111111111', 'Be honest about the place you live.', 'live', now()),
  ('22222222-aaaa-aaaa-aaaa-222222222222', 'Speak in every language you know.', 'live', now()),
  ('33333333-aaaa-aaaa-aaaa-333333333333', 'Newcomers unlearn?', 'live', now()),
  ('44444444-aaaa-aaaa-aaaa-444444444444', 'Best sunset spot?', 'live', now());
insert into public.suggestions (id, author_id, text) values
  ('5a000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'What''s one thing you miss from home?');
-- Adam's live response, for replies.
insert into public.responses (id, prompt_id, author_id, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at) values
  ('ad000000-0000-0000-0000-000000000001', '33333333-aaaa-aaaa-aaaa-333333333333', 'b2222222-2222-2222-2222-222222222222', 9000, 'live', 'upAdamLive', 'asAdamLive', 'pbAdamLive', now());
-- Unused URLs minted for each member.
insert into public.video_uploads (account_id, upload_id, status)
select 'a1111111-1111-1111-1111-111111111111', 'upL' || n, 'active' from generate_series(1, 14) n;
insert into public.video_uploads (account_id, upload_id, status) values
  ('b2222222-2222-2222-2222-222222222222', 'upA1', 'active'),
  ('b2222222-2222-2222-2222-222222222222', 'upA2', 'active');

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
grant execute on function pg_temp.err(text) to authenticated, anon;
create function pg_temp.act(p_account uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_account, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.act(uuid) to authenticated;
-- Superuser views of rows a member cannot read, for the checks.
create function pg_temp.rows_for(p_author uuid, p_where text) returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  execute format('select count(*)::int from public.responses where author_id = %L and %s', p_author, p_where) into n;
  return n;
end;
$$;
grant execute on function pg_temp.rows_for(uuid, text) to authenticated;
create function pg_temp.sub(p_id uuid) returns public.post_submissions language sql stable security definer set search_path = '' as $$ select * from public.post_submissions where id = p_id $$;
grant execute on function pg_temp.sub(uuid) to authenticated;
create function pg_temp.upload(p_upload text) returns public.video_uploads language sql stable security definer set search_path = '' as $$ select * from public.video_uploads where upload_id = p_upload $$;
grant execute on function pg_temp.upload(text) to authenticated;
create function pg_temp.status_of(p_id uuid) returns text language sql stable security definer set search_path = '' as $$ select status from public.responses where id = p_id $$;
grant execute on function pg_temp.status_of(uuid) to authenticated;
create function pg_temp.jobs() returns integer language sql stable security definer set search_path = '' as $$ select count(*)::int from public.mux_cleanup_jobs $$;
grant execute on function pg_temp.jobs() to authenticated;
create function pg_temp.ledger_rows() returns integer language sql stable security definer set search_path = '' as $$ select count(*)::int from public.video_uploads $$;
grant execute on function pg_temp.ledger_rows() to authenticated;
create temp table ids (k text primary key, id uuid);
grant all on ids to authenticated;
create temp table counts (k text primary key, n integer);
grant all on counts to authenticated;

-- ===========================================================================
-- 1. Structure and privileges
-- ===========================================================================
select has_table('public', 'post_submissions', 'the submission ledger exists');
select is((select relrowsecurity from pg_class where oid = 'public.post_submissions'::regclass), true, 'RLS is on');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'post_submissions'), 0, 'no policies: deny-all to members');
select is(has_table_privilege('authenticated', 'public.post_submissions', 'select'), false, 'members cannot read submissions');
select is(has_table_privilege('authenticated', 'public.post_submissions', 'insert'), false, 'members cannot write submissions');
select is(has_table_privilege('anon', 'public.post_submissions', 'select'), false, 'anon cannot read submissions');
select is(to_regprocedure('public.post_response(uuid, text, text, integer)'), null, 'the four-argument post_response is gone (no ambiguous overload)');
select is(to_regprocedure('public.post_reply(uuid, text, text, integer)'), null, 'the four-argument post_reply is gone');
select is(to_regprocedure('public.post_draft(uuid, text, text, integer)'), null, 'the four-argument post_draft is gone');
select is(has_function_privilege('authenticated', 'public.post_response(uuid, text, text, integer, uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.post_reply(uuid, text, text, integer, uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.post_draft(uuid, text, text, integer, uuid)', 'execute'), true, 'members can post');
select is(to_regprocedure('public.abandon_submission(uuid)'), null, 'abandon_submission (it could not see Mux) is gone; nothing replaces it for members directly');
select is(has_function_privilege('anon', 'public.post_response(uuid, text, text, integer, uuid)', 'execute')
       or has_function_privilege('anon', 'public.post_reply(uuid, text, text, integer, uuid)', 'execute')
       or has_function_privilege('anon', 'public.post_draft(uuid, text, text, integer, uuid)', 'execute'), false, 'anon cannot post');
select is(has_function_privilege('authenticated', 'public.submission_replay(uuid, uuid, text, uuid, text, text, integer)', 'execute')
       or has_function_privilege('service_role', 'public.submission_replay(uuid, uuid, text, uuid, text, text, integer)', 'execute')
       or has_function_privilege('authenticated', 'public.record_submission(uuid, uuid, text, uuid, text, text, integer, uuid)', 'execute')
       or has_function_privilege('service_role', 'public.record_submission(uuid, uuid, text, uuid, text, text, integer, uuid)', 'execute'), false,
       'the submission helpers are internal (no API role can call them with another member''s id)');
select is((select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace
            and proname in ('post_response', 'post_reply', 'post_draft', 'retry_response_upload', 'abandon_submission', 'submission_replay', 'record_submission')
            and (not prosecdef or proowner <> 'postgres'::regrole or not coalesce(proconfig @> array['search_path=""'], false))), 0,
          'the functions are SECURITY DEFINER, owned by postgres, with an empty search_path');
select is((select array_agg(proname::text order by proname) from pg_proc
            where pronamespace = 'public'::regnamespace and prosrc ~ 'submission_replay' and proname <> 'submission_replay'),
          array['post_draft', 'post_reply', 'post_response'], 'the three posting functions check the submission');

-- ===========================================================================
-- 2. Signed out and anon
-- ===========================================================================
set local role anon;
select throws_ok($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', null, 5000, gen_random_uuid()) $$, '42501', null, 'anon cannot post');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', null, 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'not_signed_in', 'no member: not_signed_in, before any submission lookup');

-- ===========================================================================
-- 3. post_response: a lost answer, then the same request again
-- ===========================================================================
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
insert into counts values ('ledger', pg_temp.ledger_rows());
insert into ids select 'r1', ((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001'))->>'id')::uuid;
select is(pg_temp.status_of((select id from ids where k = 'r1')), 'processing', 'the first call creates the row');
select is((pg_temp.sub('c0000000-0000-0000-0000-000000000001')).response_id, (select id from ids where k = 'r1'), 'the submission records its row');
select is((pg_temp.sub('c0000000-0000-0000-0000-000000000001')).upload_id, 'upL1', 'and the upload it claimed');
select is((pg_temp.sub('c0000000-0000-0000-0000-000000000001')).account_id, 'a1111111-1111-1111-1111-111111111111'::uuid, 'and its member');
select is((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001'))->>'id',
          (select id from ids where k = 'r1')::text, 'the same request again returns the same row (no already_responded, no upload_already_used)');
select is((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001'))->>'replayed', 'true', 'marked as replayed');
select is((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', '  hello ', 5000, 'c0000000-0000-0000-0000-000000000001'))->>'id',
          (select id from ids where k = 'r1')::text, 'the caption compares as the server stores it (trimmed)');
select is(pg_temp.rows_for('a1111111-1111-1111-1111-111111111111', $$prompt_id = '11111111-aaaa-aaaa-aaaa-111111111111'$$), 1, 'one row for the prompt after three calls');
select is((pg_temp.upload('upL1')).status, 'claimed', 'the upload is claimed');
select is((pg_temp.upload('upL1')).response_id, (select id from ids where k = 'r1'), 'once, by that row');
select is(pg_temp.ledger_rows(), (select n from counts where k = 'ledger'), 'a replay mints nothing');

-- The same id with anything else changed is refused, and nothing is claimed.
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', 'hello!', 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'another caption: conflict');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', 'hello', 6000, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'another duration (another recording): conflict');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL2', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'another upload: conflict');
select is((pg_temp.upload('upL2')).status, 'active', 'and that upload is not claimed');
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'upL1', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'another prompt: conflict');
select is(pg_temp.err($$ select public.post_reply('ad000000-0000-0000-0000-000000000001', 'upL1', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'another kind (a video reply): conflict');
select is(pg_temp.err($$ select public.post_draft('5a000000-0000-0000-0000-000000000001', 'upL1', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'another kind (a draft): conflict');
-- Review of 13 Oct, I1: a NULL in the request was compared with <>, which is unknown, so the replay
-- returned the row. Every field is compared with IS DISTINCT FROM now.
select is(pg_temp.err($$ select public.post_response(null, 'upL1', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'I1: a NULL target is a conflict, not a replay of the row');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', null, 'hello', 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'I1: a NULL upload is a conflict');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', 'hello', null, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'I1: a NULL duration is a conflict');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', null, 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'I1: a NULL caption against a stored one is a conflict');
select is(pg_temp.err($$ select public.post_reply(null, 'upL1', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'I1: the same for a video reply with a NULL target');

-- An old client (no submission) gets exactly the old answers.
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', 'hello', 5000) $$), 'already_responded', 'four arguments: already_responded, as before');
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'upL1', null, 5000) $$), 'upload_already_used', 'four arguments: upload_already_used, as before');
-- A new recording (new submission) for the same prompt is still one response per prompt.
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL3', null, 5000, 'c0000000-0000-0000-0000-000000000002') $$), 'already_responded', 'a different submission for the same prompt: already_responded');
select is((pg_temp.upload('upL3')).status, 'active', 'its upload stays usable');
select is(pg_temp.sub('c0000000-0000-0000-0000-000000000002'), null, 'and no submission is recorded');

-- ===========================================================================
-- 4. Ownership: another member with the same id
-- ===========================================================================
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'another member replaying Lena''s exact request: conflict, not her row');
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upA1', null, 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'submission_conflict', 'another member reusing the id with their own upload: the same answer (nothing revealed)');
select is((pg_temp.upload('upA1')).status, 'active', 'their upload is not claimed');
select is(pg_temp.rows_for('b2222222-2222-2222-2222-222222222222', $$prompt_id = '11111111-aaaa-aaaa-aaaa-111111111111'$$), 0, 'and they got no row');
select is(pg_temp.status_of((select id from ids where k = 'r1')), 'processing', 'which is untouched');

-- ===========================================================================
-- 5. Replay after the world changed
-- ===========================================================================
select pg_temp.act('a1111111-1111-1111-1111-111111111111');
reset role;
update public.prompts set status = 'archived' where id = '11111111-aaaa-aaaa-aaaa-111111111111';
set local role authenticated;
select is((public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001'))->>'id',
          (select id from ids where k = 'r1')::text, 'the prompt archived since: the existing row is still returned');
reset role;
update public.prompts set status = 'live' where id = '11111111-aaaa-aaaa-aaaa-111111111111';
update public.accounts set moderation_status = 'restricted', restricted_until = now() + interval '1 day' where id = 'a1111111-1111-1111-1111-111111111111';
set local role authenticated;
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'posting_paused', 'posting paused since: refused before the submission is looked up');
reset role;
update public.accounts set moderation_status = 'active', restricted_until = null where id = 'a1111111-1111-1111-1111-111111111111';
update public.accounts set public_disclosure_ack_at = null where id = 'a1111111-1111-1111-1111-111111111111';
set local role authenticated;
select is(pg_temp.err($$ select public.post_response('11111111-aaaa-aaaa-aaaa-111111111111', 'upL1', 'hello', 5000, 'c0000000-0000-0000-0000-000000000001') $$), 'disclosure_required', 'the account checks all come first');
reset role;
update public.accounts set public_disclosure_ack_at = now() where id = 'a1111111-1111-1111-1111-111111111111';
-- A removed video is not returned.
set local role authenticated;
insert into ids select 'r2', ((public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'upL4', null, 5000, 'c0000000-0000-0000-0000-000000000003'))->>'id')::uuid;
reset role;
update public.responses set status = 'removed' where id = (select id from ids where k = 'r2');
set local role authenticated;
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'upL4', null, 5000, 'c0000000-0000-0000-0000-000000000003') $$), 'submission_closed', 'a removed video: submission_closed');
reset role;
update public.responses set status = 'deleted', deleted_at = now() where id = (select id from ids where k = 'r2');
set local role authenticated;
select is(pg_temp.err($$ select public.post_response('22222222-aaaa-aaaa-aaaa-222222222222', 'upL4', null, 5000, 'c0000000-0000-0000-0000-000000000003') $$), 'submission_closed', 'a deleted video: submission_closed');

-- ===========================================================================
-- 6. post_reply and post_draft
-- ===========================================================================
insert into ids select 'v1', ((public.post_reply('ad000000-0000-0000-0000-000000000001', 'upL5', 'reply', 6000, 'c0000000-0000-0000-0000-000000000004'))->>'id')::uuid;
select is((public.post_reply('ad000000-0000-0000-0000-000000000001', 'upL5', 'reply', 6000, 'c0000000-0000-0000-0000-000000000004'))->>'id',
          (select id from ids where k = 'v1')::text, 'a video reply retried returns the same reply');
select is(pg_temp.rows_for('a1111111-1111-1111-1111-111111111111', $$kind = 'reply'$$), 1, 'one reply, not two');
select is(pg_temp.err($$ select public.post_reply('ad000000-0000-0000-0000-000000000001', 'upL6', 'reply', 6000, 'c0000000-0000-0000-0000-000000000004') $$), 'submission_conflict', 'the same id with a new URL: conflict, not a second reply');
select is((pg_temp.upload('upL6')).status, 'active', 'that URL is not claimed');
select is((public.post_reply('ad000000-0000-0000-0000-000000000001', 'upL6', 'reply', 6000, 'c0000000-0000-0000-0000-000000000005'))->>'status', 'processing', 'a new recording (new submission) is a new reply, as before');
select is(pg_temp.rows_for('a1111111-1111-1111-1111-111111111111', $$kind = 'reply'$$), 2, 'two replies for two recordings');

insert into ids select 'd1', ((public.post_draft('5a000000-0000-0000-0000-000000000001', 'upL7', null, 9000, 'c0000000-0000-0000-0000-000000000006'))->>'id')::uuid;
select is((public.post_draft('5a000000-0000-0000-0000-000000000001', 'upL7', null, 9000, 'c0000000-0000-0000-0000-000000000006'))->>'id',
          (select id from ids where k = 'd1')::text, 'a draft retried returns the same draft');
select is(pg_temp.status_of((select id from ids where k = 'd1')), 'draft', 'and does not replace (delete) itself');
select is(pg_temp.rows_for('a1111111-1111-1111-1111-111111111111', $$suggestion_id is not null$$), 1, 'one draft row');
select is((public.post_draft('5a000000-0000-0000-0000-000000000001', 'upL8', null, 9000, 'c0000000-0000-0000-0000-000000000007'))->>'status', 'draft', 're-recording (new submission) replaces the draft, as before');
select is(pg_temp.status_of((select id from ids where k = 'd1')), 'deleted', 'the first draft is replaced');
select is(pg_temp.err($$ select public.post_draft('5a000000-0000-0000-0000-000000000001', 'upL7', null, 9000, 'c0000000-0000-0000-0000-000000000006') $$), 'submission_closed', 'the replaced draft''s submission is closed: it cannot come back');

-- ===========================================================================
-- 7. retry_response_upload with the upload already on the row
-- ===========================================================================
insert into ids select 'r3', ((public.post_response('33333333-aaaa-aaaa-aaaa-333333333333', 'upL9', null, 5000, 'c0000000-0000-0000-0000-000000000008'))->>'id')::uuid;
insert into counts values ('jobs0', pg_temp.jobs());
select is(pg_temp.err(format('select public.retry_response_upload(%L, %L)', (select id from ids where k = 'r3'), 'upL10')), 'ok', 'a Retry puts a new upload on the row');
select is((pg_temp.upload('upL10')).response_id, (select id from ids where k = 'r3'), 'claimed by it');
select is(pg_temp.jobs(), (select n from counts where k = 'jobs0') + 1, 'and the old upload is queued for cancellation, as before');
select is(pg_temp.err(format('select public.retry_response_upload(%L, %L)', (select id from ids where k = 'r3'), 'upL10')), 'ok', 'the same Retry again (its answer was lost): no error');
select is(pg_temp.jobs(), (select n from counts where k = 'jobs0') + 1, 'and nothing more is queued');
select is((pg_temp.upload('upL10')).status, 'claimed', 'the upload stays claimed by the row');
select pg_temp.act('b2222222-2222-2222-2222-222222222222');
select is(pg_temp.err(format('select public.retry_response_upload(%L, %L)', (select id from ids where k = 'r3'), 'upL10')), 'response_not_found', 'another member''s row: response_not_found, even with its own upload');
select pg_temp.act('a1111111-1111-1111-1111-111111111111');

-- ===========================================================================
-- 9. One submission per upload, one per row
-- ===========================================================================
reset role;
select throws_ok($$ insert into public.post_submissions (id, account_id, kind, target_id, upload_id, duration_ms) values (gen_random_uuid(), 'a1111111-1111-1111-1111-111111111111', 'response', '44444444-aaaa-aaaa-aaaa-444444444444', 'upL9', 5000) $$, '23505', null, 'an upload belongs to one submission');
select throws_ok($$ insert into public.post_submissions (id, account_id, kind, target_id, upload_id, duration_ms, response_id) values (gen_random_uuid(), 'a1111111-1111-1111-1111-111111111111', 'response', '44444444-aaaa-aaaa-aaaa-444444444444', 'upLX', 5000, (select response_id from public.post_submissions where id = 'c0000000-0000-0000-0000-000000000008')) $$, '23505', null, 'a row belongs to one submission');
select is((select count(*)::int from public.post_submissions where account_id = 'a1111111-1111-1111-1111-111111111111'), 7, 'every successful post with a submission recorded it once');

select * from finish();
rollback;
