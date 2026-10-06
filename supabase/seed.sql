-- Local development seed. Never applied to the hosted project.
-- Two team invite codes for the Canggu cohort, one of them already expired.
select public.team_create_invite('TEST-OK1', 'canggu');
select public.team_create_invite('TEST-OK2', 'canggu');
select public.team_create_invite('TEST-OLD', 'canggu', null, 1);
update public.invites set expires_at = now() - interval '1 day' where code = 'TEST-OLD';

-- Phase 3: a few live global prompts, one featured today.
select public.team_create_prompt('Be honest about the place you live.', null, (now() at time zone 'utc')::date);
select public.team_create_prompt('What''s something everybody loves that you hate?');
select public.team_create_prompt('Speak in every language you know.');
select public.team_create_prompt('What should every newcomer to Canggu unlearn?', 'canggu');

-- Local development people and responses, using the phase 1 spike's Mux assets so Home,
-- the player and profiles have real video to play. Never applied to the hosted project.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-maya@example.com', '{}', '{}', now(), now()),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-adam@example.com', '{}', '{}', now(), now()),
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-sofia@example.com', '{}', '{}', now(), now()),
  ('d0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-putu@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now() where id::text like 'd0000000-%';
insert into public.profiles (id, name, username, bio) values
  ('d0000000-0000-0000-0000-000000000001', 'Maya Lindqvist', 'mayalind', 'Ceramics studio in Berawa. Strong opinions on coffee and traffic.'),
  ('d0000000-0000-0000-0000-000000000002', 'Adam Novak', 'adamnovak', null),
  ('d0000000-0000-0000-0000-000000000003', 'Sofia Marín', 'sofiamarin', null),
  ('d0000000-0000-0000-0000-000000000004', 'Putu Ayu', 'putuayu', null);
insert into public.responses (prompt_id, author_id, caption, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at)
select p.id, x.author, x.caption, x.ms, 'live', 'dev-' || x.n, 'dev-asset-' || x.n, x.pb, now() - (x.n || ' hours')::interval
  from public.prompts p
  join (values
    (1, 'd0000000-0000-0000-0000-000000000001'::uuid, 'Everyone posts the sunsets. Nobody posts the traffic at 6pm.', 3600, '25Vygqw8O8RgkH6nYYN7wFiX002mo01keZAL5EAj7eHfE', 'Be honest about the place you live.'),
    (2, 'd0000000-0000-0000-0000-000000000002'::uuid, 'Walk the rice fields at 7am before you decide anything. That''s the Canggu I stay for.', 4400, 'Ih4vvyPXptg201cez8Yg1EVeBYbX5cc01yhyFUinC01xtU', 'Be honest about the place you live.'),
    (3, 'd0000000-0000-0000-0000-000000000003'::uuid, 'I love Canggu and I also think it''s overrated. Both can be true.', 5000, 'KzVFN00qaTnMZ6AKekYhpNO00fwhdq53hV6Ng7Mb00StrA', 'Be honest about the place you live.'),
    (4, 'd0000000-0000-0000-0000-000000000004'::uuid, null, 5500, '9bGocWUSbCthCSr7y2OfPLejY5gidOWZXYaijkfKic8', 'Be honest about the place you live.'),
    (5, 'd0000000-0000-0000-0000-000000000001'::uuid, null, 16100, 'Q0252QFnk1Zhey8J300qNpqCfLu8nwwnLJa4Jel9H9xX8', 'What''s something everybody loves that you hate?'),
    (6, 'd0000000-0000-0000-0000-000000000002'::uuid, 'Six languages, one accent.', 6100, 'a6MbJK005yc9k01KiADppm4TU302gypNe00O9ERp1Qb3wP4', 'Speak in every language you know.')
  ) as x(n, author, caption, ms, pb, prompt_text) on x.prompt_text = p.text;
insert into public.follows (follower_id, followee_id) values
  ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000001');
