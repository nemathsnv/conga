-- A video its author deleted (SF-Delete), abandoned, or replaced as a draft loses its public playback
-- at Mux at once, not only when its asset is deleted.
--
-- Until now mux_forget_video queued only delete_asset. That was enough while a deletion ran within a
-- minute, but since 20261021000200 the deletion cap holds deletions once N have run in 24 hours, and a
-- held, retried or paused deletion left the playback id working on stream.mux.com for anyone who had
-- it (other members' players, the web page). Revocation is the privacy step and is never capped
-- (docs/release/MUX-CLEANUP-UNATTENDED.md section 2), as account deletion and moderator removal
-- already do (mux_sync_account_playback, mod_remove_video).
--
-- The worker decides from mux_playback_wanted at claim time, which is false for a deleted video, so
-- the job revokes; if the asset is already gone it closes as already_gone. The two jobs share the
-- asset, so the claim never runs them at the same time. Both are queued in one transaction and the
-- claim orders by (not_before, created_at), so the revocation is due a second earlier: it always runs
-- first, never after the asset is already gone. Only this function changes; its callers
-- (delete_video, abandon_response, discard_draft and both post_draft signatures) and its grants are
-- unchanged.
create or replace function public.mux_forget_video(p_response uuid, p_asset text, p_upload text, p_owner uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_asset is not null then
    perform public.mux_cleanup_enqueue('sync_playback', p_reason, p_asset, p_upload, p_response, p_owner, now() - interval '1 second');
    perform public.mux_cleanup_enqueue('delete_asset', p_reason, p_asset, p_upload, p_response, p_owner);
    update public.mux_cleanup_jobs
       set not_before = now(), reason = p_reason, response_id = coalesce(response_id, p_response)
     where dedupe_key = 'delete_asset:' || p_asset and status = 'pending' and not_before > now();
  elsif p_upload is not null then
    perform public.mux_cleanup_enqueue('cancel_upload', p_reason, null, p_upload, p_response, p_owner);
  end if;
end;
$$;
