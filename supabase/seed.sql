-- Local development seed. Never applied to the hosted project.
-- Two team invite codes for the Canggu cohort, one of them already expired.
select public.team_create_invite('TEST-OK1', 'canggu');
select public.team_create_invite('TEST-OK2', 'canggu');
select public.team_create_invite('TEST-OLD', 'canggu', null, 1);
update public.invites set expires_at = now() - interval '1 day' where code = 'TEST-OLD';
