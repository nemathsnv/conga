-- Local development seed. Never applied to the hosted project.
-- Two team invite codes for the Canggu cohort, one of them already expired.
select public.team_create_invite('TEST-OK1', 'canggu');
select public.team_create_invite('TEST-OK2', 'canggu');
select public.team_create_invite('TEST-OLD', 'canggu', null, 1);
update public.invites set expires_at = now() - interval '1 day' where code = 'TEST-OLD';

-- Phase 3: a few live global prompts, one featured today.
-- Places and topics for local development (phase 6). Team-created in production.
insert into public.places (slug, name, region, type, is_open) values
  ('uluwatu', 'Uluwatu', 'Bali, Indonesia', 'city', true),
  ('seminyak', 'Seminyak', 'Bali, Indonesia', 'city', true),
  ('ubud', 'Ubud', 'Bali, Indonesia', 'city', false)
on conflict (slug) do nothing;
insert into public.place_neighbours (place_id, neighbour_id)
select a.id, b.id from public.places a, public.places b where a.slug = 'canggu' and b.slug in ('uluwatu', 'seminyak')
on conflict do nothing;
insert into public.topics (id, name) values ('food', 'Food'), ('work', 'Work'), ('surf', 'Surf'), ('fitness', 'Fitness'), ('nights', 'Nights') on conflict do nothing;
select public.team_create_prompt('Be honest about the place you live.', null, (now() at time zone 'utc')::date);
select public.team_create_prompt('What''s something everybody loves that you hate?');
select public.team_create_prompt('Speak in every language you know.');
select public.team_create_prompt('What should every newcomer to Canggu unlearn?', 'canggu');
select public.team_create_prompt('Where do you actually get work done?', 'canggu', null, 'work');
select public.team_create_prompt('Best wave for a beginner around here?', 'uluwatu', null, 'surf');

-- Local development people and responses, using the phase 1 spike's Mux assets so Home,
-- the player and profiles have real video to play. Never applied to the hosted project.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-maya@example.com', '{}', '{}', now(), now()),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-adam@example.com', '{}', '{}', now(), now()),
  ('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-sofia@example.com', '{}', '{}', now(), now()),
  ('d0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev-putu@example.com', '{}', '{}', now(), now());
update public.accounts set age_confirmed_at = now(), public_disclosure_ack_at = now(), beta_cohort = 'canggu' where id::text like 'd0000000-%';
-- Admitted from the waitlist, so has_beta_access() is true for them.
insert into public.waitlist (account_id, email, admitted_at, admitted_cohort) select a.id, u.email, now(), 'canggu' from public.accounts a join auth.users u on u.id = a.id where a.id::text like 'd0000000-%' on conflict do nothing;
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

-- Phase 4 development data: video replies in Adam's room (reusing spike assets), comments,
-- likes. Activity rows come from the triggers. The dev session user (whoever signs in locally)
-- sees these on other people's videos.
insert into public.responses (kind, prompt_id, root_response_id, reply_to_id, author_id, caption, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at)
select 'reply', root.prompt_id, root.id, root.id, x.author, x.caption, x.ms, 'processing', 'dev-reply-' || x.n, 'dev-reply-asset-' || x.n, x.pb, now() - (x.n * 20 || ' minutes')::interval
  from public.responses root
  join (values
    (1, 'd0000000-0000-0000-0000-000000000003'::uuid, '7am is my whole personality now.', 5000, 'KzVFN00qaTnMZ6AKekYhpNO00fwhdq53hV6Ng7Mb00StrA'),
    (2, 'd0000000-0000-0000-0000-000000000004'::uuid, 'Grew up there. Here''s the path nobody uses.', 5500, '9bGocWUSbCthCSr7y2OfPLejY5gidOWZXYaijkfKic8')
  ) as x(n, author, caption, ms, pb) on true
 where root.mux_upload_id = 'dev-2';
-- Maya replies to Sofia's reply (a reply to a reply, flat in Adam's room).
insert into public.responses (kind, prompt_id, root_response_id, reply_to_id, author_id, caption, duration_ms, status, mux_upload_id, mux_asset_id, mux_playback_id, live_at)
select 'reply', root.prompt_id, root.id, sofia.id, 'd0000000-0000-0000-0000-000000000001', 'Respectfully, 7am is when I go to sleep.', 3600, 'live', 'dev-reply-3', 'dev-reply-asset-3', '25Vygqw8O8RgkH6nYYN7wFiX002mo01keZAL5EAj7eHfE', now() - interval '10 minutes'
  from public.responses root join public.responses sofia on sofia.mux_upload_id = 'dev-reply-1'
 where root.mux_upload_id = 'dev-2';
-- Go live through the status change so the Activity triggers fire (as Mux would).
update public.responses set status = 'live' where kind = 'reply' and mux_upload_id like 'dev-reply-%';
insert into public.comments (response_id, author_id, body, created_at)
select id, 'd0000000-0000-0000-0000-000000000004', 'Pererenan at sunrise, yes. Nobody believes me until they go.', now() - interval '1 hour' from public.responses where mux_upload_id = 'dev-2';
insert into public.comments (response_id, author_id, parent_id, body, created_at)
select c.response_id, 'd0000000-0000-0000-0000-000000000002', c.id, 'Bring a jacket, it''s colder than you think at 6.', now() - interval '48 minutes'
  from public.comments c where c.body like 'Pererenan%';
insert into public.comments (response_id, author_id, body, created_at)
select id, 'd0000000-0000-0000-0000-000000000003', 'The rice fields are disappearing though. Go while you can.', now() - interval '32 minutes' from public.responses where mux_upload_id = 'dev-2';
insert into public.likes (user_id, target_kind, target_id)
select u.id, 'video', r.id from public.responses r cross join (values ('d0000000-0000-0000-0000-000000000001'::uuid), ('d0000000-0000-0000-0000-000000000003'::uuid), ('d0000000-0000-0000-0000-000000000004'::uuid)) u(id)
 where r.mux_upload_id in ('dev-2', 'dev-reply-1') and u.id <> r.author_id;

-- Phase 6 development data: Adam's suggestions (one in review, one not published), Sofia follows Uluwatu.
insert into public.suggestions (author_id, text, place_id, attribution, status)
select 'd0000000-0000-0000-0000-000000000002', 'What''s one thing you''d change about Canggu tomorrow?', id, true, 'in_review' from public.places where slug = 'canggu';
insert into public.suggestions (author_id, text, place_id, attribution, status, decline_reason, reviewed_at, reviewed_by)
select 'd0000000-0000-0000-0000-000000000002', 'Who are the worst drivers in Canggu?', id, true, 'not_published', 'singles_out', now() - interval '1 day', 'nemat' from public.places where slug = 'canggu';
insert into public.place_follows (account_id, place_id) select 'd0000000-0000-0000-0000-000000000003', id from public.places where slug = 'uluwatu' on conflict do nothing;
