// POST { submissionId } -> { outcome: "abandoned" | "kept" | "not_found", reason?, responseId? }
//
// Discards a recording's post whose outcome the app does not know (the answer to Post was lost),
// or one the person discards before it finished, only once Mux confirms it has nothing of it
// (20261013000300; review of 13 Oct, B3). Runs as the signed-in member: begin_submission_abandon
// checks the submission is theirs and holds the row, Mux is asked about the row's upload, and
// finish_submission_abandon retires the row or releases it.
//
//   upload waiting        cancelled at Mux first; the row is retired only once Mux confirms it
//   cancelled, timed out, errored, with no asset
//                         nothing more can arrive: the row is retired
//   asset_created, or any asset
//                         kept ("at_mux"): the video will post; the app keeps the recording
//   no answer, an unknown state, a cancellation Mux refused or did not confirm
//                         kept ("unverified"): the app keeps the recording and asks again later
//
// Nothing published, removed or settled is ever deleted here, and the clean-up worker is not
// involved. The only Mux change is cancelling an upload Mux reports still waiting.
import { corsHeaders, isMuxId, json, mux, muxSegment, type MuxUpload } from "../_shared/mux.ts";
import { adminClient, callerClient } from "../_shared/supabase.ts";

const MUX_TIMEOUT_MS = 15_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Begin = { status: string; reason?: string; response_id?: string | null; upload_id?: string; token?: string };
type Answer = { outcome: "abandoned" | "kept" | "not_found"; reason?: string; responseId?: string };

export async function handleAbandonSubmission(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const caller = await callerClient(req);
  if (!caller) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => null) as { submissionId?: unknown } | null;
  const submissionId = body?.submissionId;
  if (typeof submissionId !== "string" || !UUID.test(submissionId)) return json({ error: "invalid_submission" }, 400);

  const admin = adminClient();
  const { data: begun, error } = await admin.rpc("begin_submission_abandon", { p_account: caller.userId, p_submission: submissionId });
  if (error || !begun) {
    console.error(error);
    return json({ outcome: "kept", reason: "unverified" } satisfies Answer);
  }
  const b = begun as Begin;
  if (b.status !== "checking") return json(answerFor(b));

  const finish = async (outcome: "abandon" | "keep", reason: string): Promise<Answer> => {
    const { data, error } = await admin.rpc("finish_submission_abandon", { p_submission: submissionId, p_token: b.token, p_outcome: outcome });
    if (error) {
      console.error(error);
      // The hold expires by itself; the row was not retired.
      return { outcome: "kept", reason: "unverified", responseId: b.response_id ?? undefined };
    }
    const done = data as Begin;
    if (done.status === "abandoned") return { outcome: "abandoned", reason: done.reason };
    return { outcome: "kept", reason: outcome === "keep" ? reason : done.reason === "at_mux" ? "at_mux" : done.reason, responseId: b.response_id ?? undefined };
  };

  if (!isMuxId(b.upload_id)) return json(await finish("keep", "unverified"));
  const uploadId = b.upload_id;
  let upload: MuxUpload;
  try {
    upload = await mux<MuxUpload>(`/video/v1/uploads/${muxSegment(uploadId)}`, { signal: AbortSignal.timeout(MUX_TIMEOUT_MS) });
  } catch (e) {
    console.error(e);
    return json(await finish("keep", "unverified"));
  }
  if (upload?.asset_id || upload?.status === "asset_created") return json(await finish("keep", "at_mux"));
  if (upload?.status === "cancelled" || upload?.status === "timed_out" || upload?.status === "errored") return json(await finish("abandon", "ended"));
  if (upload?.status !== "waiting") return json(await finish("keep", "unverified"));

  // Still waiting: cancel it, so nothing more can arrive, and retire the row only once Mux confirms.
  try {
    const after = await mux<MuxUpload>(`/video/v1/uploads/${muxSegment(uploadId)}/cancel`, { method: "PUT", signal: AbortSignal.timeout(MUX_TIMEOUT_MS) });
    if (after?.status === "cancelled" && !after.asset_id) return json(await finish("abandon", "cancelled"));
    return json(await finish("keep", "unverified"));
  } catch (e) {
    console.error(e);
    // Refused (for example it stopped waiting because the bytes arrived) or no answer: keep it and
    // let the next attempt read the real state. If it was in fact cancelled, that attempt finds it
    // cancelled and retires the row.
    return json(await finish("keep", "unverified"));
  }
}

function answerFor(b: Begin): Answer {
  if (b.status === "abandoned") return { outcome: "abandoned", reason: b.reason };
  if (b.status === "not_found") return { outcome: "not_found" };
  return { outcome: "kept", reason: b.reason ?? "unverified", responseId: b.response_id ?? undefined };
}
