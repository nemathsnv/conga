-- Rollback of 20261016000203_avatar_cleanup.sql. Reopens L5: replaced photos and purged
-- accounts' photos stay in the public bucket. Names still queued are lost with the table; list
-- them first if they should be removed by hand:
--   select name from public.avatar_removals where done_at is null;
-- Run as postgres, in one transaction, then:
--   delete from supabase_migrations.schema_migrations where version = '20261016000203';
-- The avatar-cleanup function can stay deployed: without the table it answers db_failed.

select cron.unschedule('avatar-cleanup');
drop trigger accounts_queue_avatar_removal on public.accounts;
drop trigger profiles_queue_old_avatar on public.profiles;
drop function public.run_avatar_cleanup();
drop function public.avatar_cleanup_finish(text[], text[], text);
drop function public.avatar_cleanup_due(integer);
drop function public.accounts_queue_avatar_removal();
drop function public.profiles_queue_old_avatar();
drop function public.queue_avatar_removal(text, uuid, text);
drop table public.avatar_removals;
