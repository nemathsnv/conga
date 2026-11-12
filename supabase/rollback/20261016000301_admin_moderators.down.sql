-- ROLLBACK for 20261016000301_admin_moderators.sql. NOT a migration: nothing applies this file.
--
-- Use only if Nemat decides to remove the moderation web admin's database side. Copy it to a new
-- forward migration and push that. Undeploy the `admin` Edge Function first (without these
-- functions it answers 403 to everyone). It drops the moderators table, so who was a moderator
-- is lost; the mod_* functions and the moderation log are untouched.

drop function public.mod_account_overview(uuid);
drop function public.mod_account_lookup(text);
drop function public.mod_comment_detail(uuid);
drop function public.mod_video_detail(uuid);
drop function public.mod_report_detail(uuid);
drop function public.mod_account_summary(uuid);
drop function public.mod_whoami(uuid);
drop function public.mod_list_moderators();
drop function public.mod_deactivate_moderator(uuid);
drop function public.mod_add_moderator(uuid, text);
drop table public.moderators;

notify pgrst, 'reload schema';
