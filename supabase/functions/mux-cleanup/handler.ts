// POST {"mode": "drain"} -> works through public.mux_cleanup_jobs: deletes assets, revokes and
// restores public playback, cancels uploads. POST {"mode": "sweep"} -> lists the assets at Mux and
// queues the orphans (security stage 3, F5 to F8).
//
// Called by pg_cron through pg_net (public.run_mux_cleanup) with the key stored in Vault as
// mux_cleanup_key; the same value is this function's MUX_CLEANUP_KEY secret. No user JWT.
//
// Before anything destructive the Mux object is read and must be the one recorded: an asset's
// passthrough must be the job's owner (the member the upload was minted for) and its upload id the
// job's upload id; an upload's passthrough likewise. Otherwise the job is skipped, nothing is
// changed at Mux, and the job stays visible in mux_cleanup_overview. Whether a deletion is still
// wanted (the asset not in use, no retention) is decided by the database when the job is leased.
import { isMuxId, json, mux, MuxHttpError, muxSegment, timingSafeEqual, type MuxAsset, type MuxUpload } from "../_shared/mux.ts";
import { adminClient } from "../_shared/supabase.ts";

const MUX_TIMEOUT_MS = 15_000;
/** Jobs leased at once; a batch never holds two jobs for one asset, so they run side by side. */
const BATCH = 10;
/** Batches per call, so one call stays well inside the 120 s lease and the function's limits. */
const MAX_BATCHES = 5;
const LEASE_SECONDS = 120;
/** At most 2,000 assets per sweep (Mux lists 100 a page). */
const SWEEP_PAGES = 20;

export type Job = {
  id: string;
  lease: string;
  action: "delete_asset" | "sync_playback" | "cancel_upload";
  reason: string;
  attempt: number;
  asset_id: string | null;
  upload_id: string | null;
  response_id: string | null;
  owner_id: string | null;
  playback_wanted: boolean | null;
};

export type Outcome = {
  outcome: "done" | "found_asset" | "retry" | "skipped" | "failed";
  detail: Record<string, unknown>;
};

type Asset = MuxAsset & { upload_id?: string; created_at?: string };
type Upload = MuxUpload & { new_asset_settings?: { passthrough?: string } };

const signal = () => AbortSignal.timeout(MUX_TIMEOUT_MS);
const done = (detail: Record<string, unknown>): Outcome => ({ outcome: "done", detail });
const skipped = (detail: string): Outcome => ({ outcome: "skipped", detail: { outcome: "not_verified", detail } });
const retry = (error: string): Outcome => ({ outcome: "retry", detail: { error } });
const notFound = (e: unknown) => e instanceof MuxHttpError && e.status === 404;

export async function handleMuxCleanup(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!authorized(req.headers.get("Authorization") ?? "", Deno.env.get("MUX_CLEANUP_KEY"))) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode ?? "drain";
  if (mode === "drain") return json(await drain());
  if (mode === "sweep") return json(await sweep());
  return json({ error: "invalid_mode" }, 400);
}

function authorized(header: string, key: string | undefined): boolean {
  if (!key) return false;
  const enc = new TextEncoder();
  return timingSafeEqual(enc.encode(header), enc.encode(`Bearer ${key}`));
}

/** Leases due jobs batch by batch, runs them and records each outcome. */
export async function drain(batches = MAX_BATCHES): Promise<Record<string, unknown>> {
  const admin = adminClient();
  const summary: Record<string, number> = { claimed: 0, done: 0, found_asset: 0, retry: 0, skipped: 0, failed: 0, stale: 0, unrecorded: 0 };
  for (let b = 0; b < batches; b++) {
    const { data, error } = await admin.rpc("mux_cleanup_claim", { p_limit: BATCH, p_lease_seconds: LEASE_SECONDS });
    if (error) {
      console.error(error);
      return { ok: false, error: "db_failed", ...summary };
    }
    const jobs = (data ?? []) as Job[];
    if (!jobs.length) break;
    summary.claimed += jobs.length;
    await Promise.all(jobs.map(async (job) => {
      const result = await runJob(job);
      const { data: finished, error: finishError } = await admin.rpc("mux_cleanup_finish", {
        p_job: job.id, p_lease: job.lease, p_outcome: result.outcome, p_detail: result.detail,
      });
      // Not recorded: the lease runs out and the job is leased again; every step is safe to repeat.
      if (finishError) {
        console.error(finishError);
        summary.unrecorded++;
      } else if (finished?.status === "stale") summary.stale++;
      else summary[result.outcome]++;
      console.log(JSON.stringify({ job: job.id, action: job.action, reason: job.reason, attempt: job.attempt, asset: job.asset_id, upload: job.upload_id, outcome: result.outcome, detail: result.detail }));
    }));
  }
  return { ok: true, ...summary };
}

/** One job against Mux. Never throws: a temporary failure is a retry. */
export async function runJob(job: Job): Promise<Outcome> {
  if (!job.owner_id) return skipped("no_owner");
  try {
    if (job.action === "delete_asset") return await deleteAsset(job);
    if (job.action === "sync_playback") return await syncPlayback(job);
    if (job.action === "cancel_upload") return await cancelUpload(job);
    return { outcome: "failed", detail: { outcome: "invalid", detail: "unknown_action" } };
  } catch (e) {
    return retry(errorText(e));
  }
}

function errorText(e: unknown): string {
  if (e instanceof MuxHttpError) return `mux_${e.status}`;
  if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) return "mux_timeout";
  return String((e as Error)?.message ?? e).slice(0, 200);
}

async function getAsset(id: string): Promise<Asset | null> {
  try {
    return await mux<Asset>(`/video/v1/assets/${muxSegment(id)}`, { signal: signal() });
  } catch (e) {
    if (notFound(e)) return null;
    throw e;
  }
}

/** Why this asset is not the job's to change, or null when it is. */
export function assetMismatch(asset: Asset, job: Job): string | null {
  if (asset?.id !== job.asset_id) return "asset_id_mismatch";
  if (!asset.passthrough || asset.passthrough !== job.owner_id) return "passthrough_mismatch";
  if (job.upload_id && asset.upload_id !== job.upload_id) return "upload_id_mismatch";
  return null;
}

async function deleteAsset(job: Job): Promise<Outcome> {
  const asset = await getAsset(job.asset_id!);
  if (!asset) return done({ outcome: "already_gone" });
  const mismatch = assetMismatch(asset, job);
  if (mismatch) return skipped(mismatch);
  try {
    await mux(`/video/v1/assets/${muxSegment(asset.id)}`, { method: "DELETE", signal: signal() });
  } catch (e) {
    if (notFound(e)) return done({ outcome: "already_gone" });
    throw e;
  }
  return done({ outcome: "deleted" });
}

/** Revokes every public playback id while the video must not play; otherwise makes sure it has one. */
async function syncPlayback(job: Job): Promise<Outcome> {
  const asset = await getAsset(job.asset_id!);
  if (!asset) {
    return job.playback_wanted
      ? { outcome: "failed", detail: { outcome: "asset_missing", detail: "asset_missing" } }
      : done({ outcome: "already_gone", revoked: [] });
  }
  const mismatch = assetMismatch(asset, job);
  if (mismatch) return skipped(mismatch);
  const publics = (asset.playback_ids ?? []).filter((p) => p.policy === "public" && isMuxId(p.id)).map((p) => p.id);
  if (!job.playback_wanted) {
    const revoked: string[] = [];
    for (const id of publics) {
      try {
        await mux(`/video/v1/assets/${muxSegment(asset.id)}/playback-ids/${muxSegment(id)}`, { method: "DELETE", signal: signal() });
      } catch (e) {
        if (!notFound(e)) throw e;
      }
      revoked.push(id);
    }
    return done({ outcome: "revoked", revoked });
  }
  if (publics.length) return done({ outcome: "kept", playback_id: publics[0], asset_status: asset.status });
  const created = await mux<{ id: string; policy: string }>(`/video/v1/assets/${muxSegment(asset.id)}/playback-ids`, {
    method: "POST", body: JSON.stringify({ policy: "public" }), signal: signal(),
  });
  if (!isMuxId(created?.id)) return retry("unexpected_playback_id");
  return done({ outcome: "restored", playback_id: created.id, asset_status: asset.status });
}

/** Cancels an upload still waiting; if Mux already made an asset, queues the asset's deletion. */
async function cancelUpload(job: Job): Promise<Outcome> {
  let upload: Upload;
  try {
    upload = await mux<Upload>(`/video/v1/uploads/${muxSegment(job.upload_id)}`, { signal: signal() });
  } catch (e) {
    if (notFound(e)) return done({ outcome: "already_gone" });
    throw e;
  }
  if (upload?.id !== job.upload_id) return skipped("upload_id_mismatch");
  if (upload.new_asset_settings?.passthrough !== job.owner_id) return skipped("passthrough_mismatch");
  if (upload.status === "waiting") {
    const after = await mux<MuxUpload>(`/video/v1/uploads/${muxSegment(upload.id)}/cancel`, { method: "PUT", signal: signal() });
    return after?.status === "cancelled" ? done({ outcome: "cancelled" }) : retry(`upload_${after?.status}`);
  }
  if (upload.status === "asset_created") {
    return isMuxId(upload.asset_id) ? { outcome: "found_asset", detail: { outcome: "asset_created", asset_id: upload.asset_id } } : retry("upload_without_asset");
  }
  if (upload.status === "cancelled" || upload.status === "timed_out" || upload.status === "errored") return done({ outcome: upload.status });
  return retry(`upload_${upload.status}`);
}

/** F8: lists the assets at Mux and lets the database decide which are orphans. */
export async function sweep(): Promise<Record<string, unknown>> {
  const assets: { id: string; upload_id: string | null; passthrough: string | null; created_at: string | null }[] = [];
  let complete = false;
  let listError: string | null = null;
  for (let page = 1; page <= SWEEP_PAGES; page++) {
    let list: Asset[];
    try {
      list = await mux<Asset[]>(`/video/v1/assets?limit=100&page=${page}`, { signal: signal() });
    } catch (e) {
      listError = errorText(e);
      break;
    }
    for (const a of list ?? []) {
      if (isMuxId(a?.id)) assets.push({ id: a.id, upload_id: a.upload_id ?? null, passthrough: a.passthrough ?? null, created_at: a.created_at ?? null });
    }
    if (!list || list.length < 100) {
      complete = true;
      break;
    }
  }
  // Only the assets actually listed are judged; an incomplete listing leaves the rest alone.
  const { data, error } = await adminClient().rpc("mux_cleanup_sweep", { p_assets: assets });
  if (error) {
    console.error(error);
    return { ok: false, error: "db_failed", listed: assets.length, complete };
  }
  const result = { ok: true, listed: assets.length, complete, listError, ...data };
  console.log(JSON.stringify({ sweep: result }));
  return result;
}
