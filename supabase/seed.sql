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
