-- Security stage 1, F1: direct reads of public.responses.
--
-- The select policy let any signed-in member read every live row straight from the table
-- (GET /rest/v1/responses), outside the read functions. That skipped the visibility rules those
-- functions apply (blocks, soft-deleted and suspended authors) and exposed columns the app never
-- shows other people: Mux upload and asset ids, moderation action ids and draft suggestion ids.
--
-- The app never reads this table directly. Feeds, the players, profiles, Activity and the web
-- player read other people's videos only through SECURITY DEFINER functions owned by postgres,
-- which RLS does not apply to, so they are unchanged. The one direct reader is mux-upload-status,
-- which looks up the caller's own upload. Direct reads are now limited to your own rows.
drop policy "responses: live ones are public to signed-in users; your own always" on public.responses;
create policy "responses: signed-in users read only their own directly"
  on public.responses for select to authenticated
  using (author_id = (select auth.uid()));
