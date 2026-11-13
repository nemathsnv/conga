-- Rollback of 20261113000100_avatars_no_listing.sql. Reopens F3: anyone, the anon key included,
-- can again list the avatars bucket (every account id with a photo, then every file). Photos by
-- public URL work either way. Run as postgres, in one transaction, then:
--   delete from supabase_migrations.schema_migrations where version = '20261113000100';

drop policy "avatars: read your own folder" on storage.objects;

-- Exactly as 20261006000300_storage_avatars.sql created it.
create policy "avatars: anyone can read"
  on storage.objects for select
  using (bucket_id = 'avatars');
