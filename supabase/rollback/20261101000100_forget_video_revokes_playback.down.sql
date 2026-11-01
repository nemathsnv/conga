-- ROLLBACK for 20261101000100_forget_video_revokes_playback.sql. NOT a migration: nothing applies this file.
--
-- Copy it to a new forward migration and push that (or apply it on a local stack to test).
--
-- It restores mux_forget_video as 20261013000100 defined it: an author's deletion queues only the
-- asset deletion again. Rows are never changed: sync_playback jobs already queued stay and run (each
-- revokes a deleted video's playback, or closes as already_gone).

create or replace function public.mux_forget_video(p_response uuid, p_asset text, p_upload text, p_owner uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_asset is not null then
    perform public.mux_cleanup_enqueue('delete_asset', p_reason, p_asset, p_upload, p_response, p_owner);
    update public.mux_cleanup_jobs
       set not_before = now(), reason = p_reason, response_id = coalesce(response_id, p_response)
     where dedupe_key = 'delete_asset:' || p_asset and status = 'pending' and not_before > now();
  elsif p_upload is not null then
    perform public.mux_cleanup_enqueue('cancel_upload', p_reason, null, p_upload, p_response, p_owner);
  end if;
end;
$$;
