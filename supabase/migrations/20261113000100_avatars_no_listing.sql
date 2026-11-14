-- F3 (access-control audit, docs/release/ACCESS-CONTROL-AUDIT.md section 2): the avatars bucket
-- could be listed by anyone.
--
-- The gap: the policy "avatars: anyone can read" (20261006000300; role public, bucket_id =
-- 'avatars') is a SELECT policy on storage.objects, and Storage's list endpoint
-- (POST /storage/v1/object/list/avatars, storage.search / list_objects_with_delimiter, which are
-- SECURITY INVOKER) reads storage.objects through RLS. So with only the anon key the root of the
-- bucket returned every account id that has a profile photo, and each folder every file in it,
-- including photos that were replaced and not yet removed by avatar-cleanup. The same was true for
-- any signed-in session, member or not. Reproduced on an isolated local stack (13 Nov 2026).
--
-- What does not need the policy: the bucket is public, so Storage serves
-- /storage/v1/object/public/avatars/<path> (the URL the app's avatarUrl() and the web player's
-- render.ts build) without consulting RLS. Measured locally with the policy dropped: public URLs
-- 200, the app's upload (upsert: false, app/src/lib/photo.ts) 200, the service role's list and
-- remove (avatar-cleanup) unaffected.
--
-- Why not simply drop it: with no SELECT policy at all, Storage's own operations that read the
-- caller's existing rows stop working for the owner too (measured): listing one's own folder
-- returns nothing, an x-upsert re-upload is refused, and a delete through the Storage API removes
-- nothing while answering 200. The app uses none of these today, but a silent no-op delete is a
-- trap, so the owner keeps them.
--
-- The fix: replace the public read policy with one that lets a signed-in person read (and so list)
-- only the objects in their own folder, <account id>/..., the same folder rule as the write
-- policies. Nobody else, anon included, can list or enumerate the bucket. Photos stay public by
-- URL, as SPEC.md Section 9 wants.
--
-- Unchanged: the bucket row (public, size and type limits), the insert/update/delete policies and
-- avatar_write_allowed(), every function, grant and table. No row changes.

drop policy "avatars: anyone can read" on storage.objects;

create policy "avatars: read your own folder"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
