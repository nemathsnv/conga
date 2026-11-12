// POST { submissionId } -> { outcome: "abandoned" | "kept" | "not_found", reason?, responseId? }
//
// Discards a recording's post whose outcome the app does not know (the answer to Post was lost),
// or one the person discards before it finished, only once Mux confirms it has nothing of it
// (20261013000300; review of 13 Oct, B3). Runs as the signed-in member: begin_submission_abandon
// checks the submission is theirs and holds the row, Mux is asked about the row's upload, and
// finish_submission_abandon retires the row or releases it.
//
//   upload waiting        cancelled at Mux first; the row is retired only once Mux confirms it
//   cancelled, timed out, with no asset
//                         nothing more can arrive (Mux documents both): the row is retired
//   asset_created, or any asset
//                         kept ("at_mux"): the video will post; the app keeps the recording
//   errored, or a state Mux does not document, with no asset
//                         kept ("unverified") while the upload URL could still take bytes and for
//                         SETTLE_AFTER_EXPIRY_MS after it expired; then retired if Mux still
//                         reports no asset (decideAbandon)
//   no answer, a malformed answer, a cancellation Mux refused or did not confirm
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
  let decision = decideAbandon(upload, uploadId, null, Date.now());
  if (decision === "needs_expiry") {
    // errored, or a state Mux does not document: only the URL's age can settle it.
    decision = decideAbandon(upload, uploadId, await uploadExpiresAt(admin, uploadId, caller.userId), Date.now());
    if (decision !== "abandon") console.warn("abandon: upload not settled at Mux", JSON.stringify({ upload: uploadId, status: upload.status }));
  }
  if (decision === "keep_at_mux") return json(await finish("keep", "at_mux"));
  if (decision === "abandon") return json(await finish("abandon", "ended"));
  if (decision !== "cancel") return json(await finish("keep", "unverified"));

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

/**
 * How long after the upload URL's recorded expiry an errored or undocumented upload with no asset
 * is treated as finished. video_uploads.expires_at is the reservation plus the 3600 s asked of Mux;
 * Mux's own expiry is later by at most the reservation's 60 s window.
 */
export const SETTLE_AFTER_EXPIRY_MS = 10 * 60_000;

export type AbandonDecision = "keep_at_mux" | "abandon" | "cancel" | "keep_unverified" | "needs_expiry";

/**
 * What Mux's answer about the row's upload allows (pure; abandon_unit_test.ts).
 *
 * Mux documents two guarantees (docs/release/VIDEO-RELIABILITY.md, section 2): a confirmed cancel of
 * a waiting upload means no asset will be created even if the last bytes land afterwards, and
 * timed_out means no transfer succeeded before the URL expired. It documents neither for errored
 * (Mux's upload states are waiting, asset_created, errored, cancelled and timed_out) nor for a
 * state it may add later. Retiring such a row at once would let the phone delete a recording Mux
 * might still turn into an asset, so:
 * - while the URL can still take bytes, and for SETTLE_AFTER_EXPIRY_MS after it expired, the row is
 *   kept, unverified: the app keeps the recording and asks again (30 s, 2 min, 10 min, then at
 *   launch, on returning to the foreground and when the connection returns);
 * - after that, if Mux still reports the same upload with no asset, no more bytes can arrive and
 *   the row is retired. Should Mux make an asset from it later anyway, its ready event finds a
 *   deleted row and queues the asset's deletion (mark_response_live): it is never published.
 * A malformed answer (no status, another upload's id) or an expiry the ledger cannot give never
 * retires anything.
 *
 * `expiresAtMs`: null when not looked up yet (the answer is then "needs_expiry"), undefined when
 * the ledger could not give it.
 */
export function decideAbandon(upload: MuxUpload | null | undefined, uploadId: string, expiresAtMs: number | null | undefined, nowMs: number): AbandonDecision {
  if (!upload || typeof upload.status !== "string" || (upload.id !== undefined && upload.id !== uploadId)) return "keep_unverified";
  if (upload.asset_id || upload.status === "asset_created") return "keep_at_mux";
  if (upload.status === "cancelled" || upload.status === "timed_out") return "abandon";
  if (upload.status === "waiting") return "cancel";
  if (expiresAtMs === null) return "needs_expiry";
  if (expiresAtMs === undefined || !Number.isFinite(expiresAtMs)) return "keep_unverified";
  return nowMs > expiresAtMs + SETTLE_AFTER_EXPIRY_MS ? "abandon" : "keep_unverified";
}

/** The ledger's expiry of the member's upload, in ms since the epoch; undefined if unreadable. */
async function uploadExpiresAt(admin: ReturnType<typeof adminClient>, uploadId: string, accountId: string): Promise<number | undefined> {
  const { data, error } = await admin.from("video_uploads").select("expires_at").eq("upload_id", uploadId).eq("account_id", accountId).maybeSingle();
  if (error) console.error(error);
  const ms = data?.expires_at ? Date.parse(String(data.expires_at)) : NaN;
  return Number.isFinite(ms) ? ms : undefined;
}

function answerFor(b: Begin): Answer {
  if (b.status === "abandoned") return { outcome: "abandoned", reason: b.reason };
  if (b.status === "not_found") return { outcome: "not_found" };
  return { outcome: "kept", reason: b.reason ?? "unverified", responseId: b.response_id ?? undefined };
}
