// POST -> { uploadId, uploadUrl }. Mints a Mux direct-upload URL for the signed-in person.
// Called while they are on Post Review so the URL is ready when they tap Post (spike finding).
//
// Every URL is recorded in public.video_uploads against its owner (security stage 2): a slot is
// reserved with the member's own session first (account state and limits are checked there, and
// concurrent requests count one another), then Mux is called, then the service role records the
// upload. Posting later claims it once, and only for that member.
import { corsHeaders, isMuxId, json, mux, MuxHttpError, muxSegment, type MuxUpload } from "../_shared/mux.ts";
import { adminClient, callerClient } from "../_shared/supabase.ts";

/** Well inside the reservation's 60 s, so a slow answer cannot outlive its slot. */
const MUX_TIMEOUT_MS = 15_000;

/** reserve_video_upload refusals and how they are answered. */
const REFUSED: Record<string, number> = {
  profile_required: 403,
  suspended: 403,
  posting_paused: 403,
  account_deleted: 403,
  upload_limit_hour: 429,
  upload_limit_day: 429,
  upload_limit_active: 429,
};

export async function handleCreateUpload(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const caller = await callerClient(req);
  if (!caller) return json({ error: "unauthorized" }, 401);

  const { data: reservation, error } = await caller.client.rpc("reserve_video_upload");
  if (error || !reservation?.reservation_id) {
    const code = error?.message ?? "";
    const status = REFUSED[code];
    if (status === 429) {
      const retryAfter = Math.max(1, Number.parseInt(error?.details ?? "", 10) || 60);
      return json({ error: code, retryAfter }, 429, { "Retry-After": String(retryAfter) });
    }
    if (status) return json({ error: code }, status);
    console.error(error);
    return json({ error: "db_unavailable" }, 503);
  }
  const reservationId = reservation.reservation_id as string;

  let upload: MuxUpload;
  try {
    upload = await mux<MuxUpload>("/video/v1/uploads", {
      method: "POST",
      signal: AbortSignal.timeout(MUX_TIMEOUT_MS),
      body: JSON.stringify({
        cors_origin: "*",
        timeout: 3600,
        new_asset_settings: {
          playback_policies: ["public"],
          video_quality: "basic",
          passthrough: caller.userId,
        },
      }),
    });
  } catch (e) {
    console.error(e);
    // Mux answered with an error, so no upload exists and the slot is given back. A timeout or a
    // network error may still have created one: that slot stays reserved and keeps counting.
    if (e instanceof MuxHttpError) await adminClient().rpc("fail_video_upload", { p_reservation: reservationId });
    return json({ error: "mux_unavailable" }, 502);
  }
  if (!isMuxId(upload?.id) || typeof upload.url !== "string" || !upload.url.startsWith("https://")) {
    console.error("unexpected Mux upload", JSON.stringify(upload?.id));
    return json({ error: "mux_unavailable" }, 502);
  }

  const { error: activateError } = await adminClient().rpc("activate_video_upload", { p_reservation: reservationId, p_upload_id: upload.id });
  if (activateError) {
    console.error(activateError);
    // The URL is never handed out; cancel it at Mux too, so nothing can be uploaded to it.
    await mux(`/video/v1/uploads/${muxSegment(upload.id)}/cancel`, { method: "PUT", signal: AbortSignal.timeout(MUX_TIMEOUT_MS) })
      .catch((e) => console.error(e));
    return json({ error: "ledger_unavailable" }, 503);
  }
  return json({ uploadId: upload.id, uploadUrl: upload.url });
}
