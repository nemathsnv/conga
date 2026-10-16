-- Rollback of 20261016000200_direct_read_privacy.sql. Reopens P1 to P3 (see the migration);
-- roll forward instead unless something is shown to depend on the old reads.
-- Run as postgres, in one transaction, then:
--   delete from supabase_migrations.schema_migrations where version = '20261016000200';

drop policy "profiles: signed-in users read only their own directly" on public.profiles;
create policy "profiles: signed-in users can read"
  on public.profiles for select to authenticated using (true);

drop policy "follows: signed-in users read only their own follows directly" on public.follows;
create policy "follows: signed-in users can read"
  on public.follows for select to authenticated using (true);

drop policy "comments: signed-in users read only their own directly" on public.comments;
create policy "comments: signed-in users read live comments"
  on public.comments for select to authenticated using (deleted_at is null);

-- Privileges as before: the table SELECT back for authenticated on prompts and the three
-- moderation tables (the revoke first removes the column grants too), and TRUNCATE, REFERENCES
-- and TRIGGER back on the 24 tables, as Supabase's default privileges gave them.
revoke select on public.prompts, public.moderation_actions, public.review_requests, public.suggestions from authenticated;
grant select on public.prompts, public.moderation_actions, public.review_requests, public.suggestions to authenticated;
grant truncate, references, trigger on public.accounts, public.activity, public.app_config,
  public.beta_cohorts, public.blocks, public.comments, public.follows, public.invites, public.likes,
  public.moderation_actions, public.notification_prefs, public.place_follows, public.place_neighbours,
  public.places, public.profiles, public.prompts, public.push_outbox, public.push_tokens,
  public.reports, public.responses, public.review_requests, public.suggestions, public.topics,
  public.waitlist
  to anon, authenticated;
