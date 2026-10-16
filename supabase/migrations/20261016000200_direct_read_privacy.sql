-- Privacy audit (16 Oct), P1 to P3: direct table reads that skip the visibility rules.
--
-- Same shape as security stage 1's F1 (20261011000100, responses). PostgREST lets any signed-in
-- member read a table straight away (GET /rest/v1/<table>) wherever a select policy allows it,
-- outside the read functions that apply blocks, the 30-day deletion window and moderation.
-- Reproduced on the local stack before this migration, as a member blocked by another:
--   P1 profiles  "signed-in users can read" (true): the blocker's profile, and the profile of an
--                account in its deletion window ("the profile disappears", SPEC.md Section 18).
--   P1 follows   (true): the whole follow graph, including accounts in their deletion window.
--   P1 comments  (deleted_at is null): every live comment, the blocker's included, by response.
--   P2 prompts   (status = 'live'): suggested_by for every member prompt, including those whose
--                author switched "Show my name on this prompt" off or whose attribution a
--                moderator removed (SPEC.md Section 12), and those of deleted accounts
--                ("suggested prompts stay live without your name", Section 18).
--   P3 a member's own moderation_actions, review_requests and suggestions rows carry the
--                moderator's name and the internal note (moderator, note, decided_by,
--                reviewed_by). The notices (get_notice, get_onboarding_state) never show them.
--
-- The app reads none of these tables directly (it reads only its own accounts row). Feeds,
-- players, profiles, comments, Activity, search and the web player read them only through
-- SECURITY DEFINER functions owned by postgres, which RLS does not apply to, so they are
-- unchanged. Direct reads of profiles, follows and comments are limited to your own rows;
-- prompts and the three moderation tables keep their row rules and lose the private columns.
--
-- Least privilege as well: TRUNCATE (which RLS does not cover; PostgREST cannot send it),
-- REFERENCES and TRIGGER are revoked from the API roles on the public tables. SELECT, INSERT,
-- UPDATE and DELETE stay: RLS has no write policy anywhere, so direct writes change nothing
-- (pgTAP 0001 and 0008 check exactly that), and writes keep happening inside SECURITY DEFINER
-- functions, as before.

-- ---------------------------------------------------------------------------
-- P1: own rows only.
-- ---------------------------------------------------------------------------
drop policy "profiles: signed-in users can read" on public.profiles;
create policy "profiles: signed-in users read only their own directly"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy "follows: signed-in users can read" on public.follows;
create policy "follows: signed-in users read only their own follows directly"
  on public.follows for select to authenticated
  using (follower_id = (select auth.uid()));

drop policy "comments: signed-in users read live comments" on public.comments;
create policy "comments: signed-in users read only their own directly"
  on public.comments for select to authenticated
  using (author_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- P2, P3: column privileges. Revoking the table privilege also revokes column privileges, so the
-- grants below are the complete list; a column added later is not readable until granted.
-- ---------------------------------------------------------------------------
revoke select on public.prompts from authenticated;
grant select (id, text, place_id, topic_id, source, attribution, status, featured_on, created_at, published_at)
  on public.prompts to authenticated;

revoke select on public.moderation_actions from authenticated;
grant select (id, account_id, kind, target_kind, target_id, reason, restrict_until, created_at)
  on public.moderation_actions to authenticated;

revoke select on public.review_requests from authenticated;
grant select (action_id, account_id, created_at, outcome, decided_at)
  on public.review_requests to authenticated;

revoke select on public.suggestions from authenticated;
grant select (id, author_id, text, place_id, attribution, status, decline_reason, prompt_id, reviewed_at, created_at, updated_at)
  on public.suggestions to authenticated;

-- ---------------------------------------------------------------------------
-- Least privilege, on the 24 tables that still had Supabase's default grants (the others,
-- video_uploads, post_submissions, analytics_events and the clean-up tables, already have none).
-- Named one by one so that tables added by other migrations keep whatever they set.
-- ---------------------------------------------------------------------------
revoke truncate, references, trigger on public.accounts, public.activity, public.app_config,
  public.beta_cohorts, public.blocks, public.comments, public.follows, public.invites, public.likes,
  public.moderation_actions, public.notification_prefs, public.place_follows, public.place_neighbours,
  public.places, public.profiles, public.prompts, public.push_outbox, public.push_tokens,
  public.reports, public.responses, public.review_requests, public.suggestions, public.topics,
  public.waitlist
  from anon, authenticated;
