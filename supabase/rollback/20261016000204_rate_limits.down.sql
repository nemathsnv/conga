-- Rollback of 20261016000204_rate_limits.sql. Reopens R1 to R3 (unlimited invite and sign-in
-- method lookups, unlimited web events). Deploy the previous auth-signin-method and web functions
-- first (they call signin_providers_limited and web_event_allowed), or they answer lookup_failed.
-- Run as postgres, in one transaction, then:
--   delete from supabase_migrations.schema_migrations where version = '20261016000204';

select cron.unschedule('prune-rate-limit-counters');
alter function public.invite_preview(text) stable;
alter function public.check_invite(text) stable;
drop function public.invite_lookup(text);
alter function public.invite_lookup_unlimited(text) rename to invite_lookup;
drop function public.web_event_allowed(text);
drop function public.signin_providers_limited(text, text);
drop function public.prune_rate_limit_counters();
drop function public.request_client_ip();
drop function public.rate_limit_take(text, text);
drop function public.rate_limit_add(text, text);
drop function public.rate_limit_exceeded(text, text);
drop function public.rate_limit_window(text);
drop function public.rate_limit_key(text);
drop table public.rate_limit_salt;
drop table public.rate_limit_counters;
drop table public.rate_limit_rules;
