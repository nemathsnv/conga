-- pgTAP tests for R1 to R3 (20261016000204): failed invite lookups are limited per client and per
-- code stem, sign-in method lookups per address and per client, web events per client. Over a
-- limit each path gives an answer it already gives (not_found; no providers; event dropped).
begin;
select plan(40);

delete from public.invites;
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('a1111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'lena@example.com', '{}', '{}', now(), now()),
  ('b2222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'putu@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now() where id = 'a1111111-1111-1111-1111-111111111111';
insert into public.profiles (id, name, username) values ('b2222222-2222-2222-2222-222222222222', 'Putu Ayu', 'rlputu');
-- Putu signs in with Google (an identity row, as Auth writes one).
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values
  ('google-putu', 'b2222222-2222-2222-2222-222222222222', '{"sub":"google-putu","email":"putu@example.com"}', 'google', now(), now());
insert into public.invites (code, cohort, inviter_id, expires_at) values
  ('PUTU-7K2', 'canggu', 'b2222222-2222-2222-2222-222222222222', now() + interval '7 days'),
  ('SC-AB2', 'canggu', null, now() + interval '7 days'),
  ('SC-CD3', 'canggu', null, now() + interval '7 days');

-- A request from an address, as PostgREST passes the headers on.
create function pg_temp.from_ip(p_ip text) returns void language sql as $$
  select set_config('request.headers', json_build_object('x-forwarded-for', p_ip || ', 10.0.0.1')::text, true);
$$;
grant execute on function pg_temp.from_ip(text) to anon, authenticated;
create function pg_temp.preview_status(p_code text) returns text language sql as $$ select public.invite_preview(p_code)->>'status'; $$;
grant execute on function pg_temp.preview_status(text) to anon, authenticated;
create function pg_temp.preview_from(p_ip text, p_code text) returns text language plpgsql as $$
begin
  perform pg_temp.from_ip(p_ip);
  return public.invite_preview(p_code)->>'status';
end;
$$;
create function pg_temp.check_from(p_ip text, p_code text) returns text language plpgsql as $$
begin
  perform pg_temp.from_ip(p_ip);
  return public.check_invite(p_code)->>'status';
end;
$$;
grant execute on function pg_temp.preview_from(text, text) to anon, authenticated;
grant execute on function pg_temp.check_from(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.rate_limit_rules), 5, 'five rules');
select is((select max_hits || '/' || window_seconds from public.rate_limit_rules where rule = 'invite_client'), '10/900', 'invite_client: 10 failed lookups in 15 minutes');
select is((select max_hits || '/' || window_seconds from public.rate_limit_rules where rule = 'invite_stem'), '100/3600', 'invite_stem: 100 failed lookups an hour');
select is((select max_hits || '/' || window_seconds from public.rate_limit_rules where rule = 'signin_address'), '5/900', 'signin_address: 5 lookups in 15 minutes');
select is((select max_hits || '/' || window_seconds from public.rate_limit_rules where rule = 'signin_client'), '30/900', 'signin_client: 30 lookups in 15 minutes');
select is((select max_hits || '/' || window_seconds from public.rate_limit_rules where rule = 'web_event'), '60/3600', 'web_event: 60 events an hour');
select is((select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname like 'rate_limit%'
             and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))), 0, 'no API role reads the rules, counters or salt');
select is(has_function_privilege('anon', 'public.signin_providers_limited(text, text)', 'execute'), false, 'anon cannot call the limited sign-in lookup directly');
select is(has_function_privilege('authenticated', 'public.rate_limit_take(text, text)', 'execute'), false, 'nor can members take from a bucket');
select is(has_function_privilege('anon', 'public.invite_lookup(text)', 'execute'), false, 'invite_lookup is still internal');
select is(has_function_privilege('anon', 'public.invite_lookup_unlimited(text)', 'execute'), false, 'and so is the unlimited one');
select is(has_function_privilege('service_role', 'public.signin_providers_limited(text, text)', 'execute'), true, 'the service role calls the sign-in lookup (auth-signin-method)');
select is((select schedule from cron.job where jobname = 'prune-rate-limit-counters'), '50 3 * * *', 'old windows are pruned daily');

-- ---------------------------------------------------------------------------
-- R1, anonymous previews (invite links).
set local role anon;
select pg_temp.from_ip('203.0.113.7');
select is(pg_temp.preview_status('PUTU-7K2'), 'valid', 'a valid link previews');
select is(pg_temp.preview_status('PUTU-7K2'), 'valid', 'as often as it is opened: valid lookups are not counted');
select is((select count(*)::int from generate_series(1, 10) i where pg_temp.preview_status('PUTU-' || lpad(i::text, 3, 'X')) = 'not_found'), 10, 'ten wrong codes from one address');
select is(pg_temp.preview_status('PUTU-7K2'), 'not_found', 'then even the valid code answers not_found (W-Invalid) from that address');
select is(public.invite_preview('PUTU-7K2') - 'status', '{}'::jsonb, 'and says nothing about the inviter');
select pg_temp.from_ip('198.51.100.9');
select is(pg_temp.preview_status('PUTU-7K2'), 'valid', 'another address is not affected');
reset role;
select is((select count(*)::int from public.rate_limit_counters where key_hash like '%203.0.113%' or key_hash like '%PUTU%'), 0, 'counters hold hashes, never an address or a code');

-- The window ends: the address may try again.
update public.rate_limit_counters set window_start = window_start - interval '1 hour' where rule = 'invite_client';
set local role anon;
select pg_temp.from_ip('203.0.113.7');
select is(pg_temp.preview_status('PUTU-7K2'), 'valid', 'after the window the address is served again');
reset role;

-- Per stem: many addresses together, one stem (SC- team codes).
select is((select count(*)::int from generate_series(1, 100) i
            where pg_temp.preview_from('192.0.2.' || i, 'SC-Z' || lpad(i::text, 3, '0')) = 'not_found'), 100,
          '100 wrong SC- codes from 100 addresses');
select pg_temp.from_ip('192.0.2.250');
select is(pg_temp.preview_status('SC-AB2'), 'not_found', 'then a valid SC- code answers not_found, from any address, until the hour is up');
select is(pg_temp.preview_status('PUTU-7K2'), 'valid', 'other stems are not affected');

-- The threshold is one update away.
update public.rate_limit_rules set max_hits = 1000 where rule = 'invite_stem';
select is(pg_temp.preview_status('SC-AB2'), 'valid', 'raising invite_stem takes effect at once');
update public.rate_limit_rules set max_hits = 100 where rule = 'invite_stem';

-- ---------------------------------------------------------------------------
-- R1, signed in: check_invite and redeem_invite count per account too, whatever the address.
delete from public.rate_limit_counters;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((select count(*)::int from generate_series(1, 10) i
            where pg_temp.check_from('203.0.113.' || i, 'NOPE-' || lpad(i::text, 3, 'X')) = 'not_found'), 10,
          'Lena types ten wrong codes, from ten addresses');
select pg_temp.from_ip('203.0.113.200');
select is(public.check_invite('PUTU-7K2')->>'status', 'not_found', 'her account is limited, from a new address too');
select is(public.redeem_invite('PUTU-7K2')->>'status', 'not_found', 'redeem answers the same');
reset role;
select is((select redeemed_by from public.invites where code = 'PUTU-7K2'), null, 'and redeems nothing');
delete from public.rate_limit_counters where rule = 'invite_client';
set local role authenticated;
select is(public.redeem_invite('PUTU-7K2')->>'status', 'valid', 'once the window is over she redeems it');
reset role;

-- ---------------------------------------------------------------------------
-- R2: the sign-in method lookup (service role, from auth-signin-method).
delete from public.rate_limit_counters;
select is(public.signin_providers_limited('putu@example.com', '203.0.113.7'), array['google'], 'the providers, as before (E-Linked)');
select is((select count(*)::int from generate_series(1, 4) i where public.signin_providers_limited(' PUTU@example.com ', '203.0.113.' || i) = array['google']), 4, 'five lookups of one address (any spelling, any address)');
select is(public.signin_providers_limited('putu@example.com', '198.51.100.1'), '{}'::text[], 'the sixth answers no providers, like an address with no account');
select is(public.signin_providers_limited('nobody@example.com', '198.51.100.1'), '{}'::text[], 'an unknown address answers the same');
delete from public.rate_limit_counters;
select is((select count(*)::int from generate_series(1, 30) i where public.signin_providers_limited('a' || i || '@example.com', '203.0.113.7') is not null), 30, 'thirty lookups from one client');
select is(public.signin_providers_limited('putu@example.com', '203.0.113.7'), '{}'::text[], 'the next, even of a fresh address, answers no providers');
select is(public.signin_providers_limited('putu@example.com', '203.0.113.8'), array['google'], 'another client is served');

-- ---------------------------------------------------------------------------
-- R3: web events.
select is((select count(*)::int from generate_series(1, 60) i where public.web_event_allowed('203.0.113.7')), 60, 'sixty web events from one address');
select is(public.web_event_allowed('203.0.113.7'), false, 'the next is dropped');
select is(public.web_event_allowed('203.0.113.8'), true, 'another address is recorded');

select * from finish();
rollback;
