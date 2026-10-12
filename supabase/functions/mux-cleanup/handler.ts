// POST {"mode": "drain"} -> works through public.mux_cleanup_jobs: deletes assets, revokes and
// restores public playback, cancels uploads. POST {"mode": "sweep"} -> lists the assets at Mux and
// queues the orphans (security stage 3, F5 to F8).
//
// Called by pg_cron through pg_net (public.run_mux_cleanup) with the key stored in Vault as
// mux_cleanup_key; the same value is this function's MUX_CLEANUP_KEY secret. No user JWT.
//
// Nothing is changed at Mux unless both switches say live: the database's
// (public.mux_cleanup_settings, off after the migration) and this function's MUX_CLEANUP_MODE
// (unset means dry_run). In a dry run the worker reads Mux, records what it would do on each job
// and releases it; every POST, PUT and DELETE to Mux goes through change(), which refuses outside
// live mode.
//
// Before a change at Mux:
//   1. the object is read and must be the one recorded: an asset's passthrough must be the job's
//      owner (the member the upload was minted for) and its upload id the job's upload id; an
//      upload's passthrough likewise. Otherwise the job fails for a person to look at;
//   2. the database is asked again (mux_cleanup_check), so the worker acts on the state as it is
//      now, not as it was when the job was leased: a deletion only if nothing uses the asset and no
//      retention applies; a playback id only while the video should play (checked again after it
//      is created, and removed if the video stopped being playable meanwhile).
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

export type Mode = "off" | "dry_run" | "live";

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
  /** stale: the lease was lost; nothing is recorded (whoever holds it now records). */
  outcome: "done" | "found_asset" | "retry" | "release" | "skipped" | "failed" | "stale";
  detail: Record<string, unknown>;
};

export type Check = { ok: boolean; mode?: Mode; hold?: string | null; wanted?: boolean; in_use?: boolean };
type Asset = MuxAsset & { upload_id?: string; created_at?: string };
type Upload = MuxUpload & { new_asset_settings?: { passthrough?: string } };

const signal = () => AbortSignal.timeout(MUX_TIMEOUT_MS);
const done = (detail: Record<string, unknown>): Outcome => ({ outcome: "done", detail });
const notVerified = (detail: string): Outcome => ({ outcome: "failed", detail: { outcome: "not_verified", detail } });
const retry = (error: string): Outcome => ({ outcome: "retry", detail: { error } });
const kept = (detail: string): Outcome => ({ outcome: "skipped", detail: { outcome: "kept", detail } });
const stale: Outcome = { outcome: "stale", detail: {} };
const notFound = (e: unknown) => e instanceof MuxHttpError && e.status === 404;
const RANK: Record<Mode, number> = { off: 0, dry_run: 1, live: 2 };

/** The function's own switch: live only when MUX_CLEANUP_MODE says so exactly. */
export function envMode(): Mode {
  const v = Deno.env.get("MUX_CLEANUP_MODE");
  return v === "live" ? "live" : v === "off" ? "off" : "dry_run";
}
/** The stricter of the database's switch and the function's. */
export function effectiveMode(db: unknown): Mode {
  const d: Mode = db === "live" || db === "dry_run" ? db : "off";
  const e = envMode();
  return RANK[d] <= RANK[e] ? d : e;
}

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
  const summary: Record<string, number> = { claimed: 0, done: 0, found_asset: 0, retry: 0, release: 0, skipped: 0, failed: 0, stale: 0, unrecorded: 0 };
  let mode: Mode = "off";
  for (let b = 0; b < batches; b++) {
    const { data, error } = await admin.rpc("mux_cleanup_claim", { p_limit: BATCH, p_lease_seconds: LEASE_SECONDS });
    if (error) {
      console.error(error);
      return { ok: false, error: "db_failed", mode, ...summary };
    }
    mode = effectiveMode(data?.mode);
    const jobs = (data?.jobs ?? []) as Job[];
    if (!jobs.length) break;
    summary.claimed += jobs.length;
    await Promise.all(jobs.map(async (job) => {
      const check = async (): Promise<Check> => {
        const { data: c, error: e } = await admin.rpc("mux_cleanup_check", { p_job: job.id, p_lease: job.lease });
        if (e) throw new Error("check_failed");
        return { ...(c as Check), mode: effectiveMode((c as Check)?.mode) };
      };
      const result = await runJob(job, mode, check);
      if (result.outcome === "stale") {
        summary.stale++;
      } else {
        const { data: finished, error: finishError } = await admin.rpc("mux_cleanup_finish", {
          p_job: job.id, p_lease: job.lease, p_outcome: result.outcome, p_detail: result.detail,
        });
        // Not recorded: the lease runs out and the job is leased again; every step is safe to repeat.
        if (finishError) {
          console.error(finishError);
          summary.unrecorded++;
        } else if (finished?.status === "stale") summary.stale++;
        else summary[result.outcome]++;
      }
      console.log(JSON.stringify({ job: job.id, mode, action: job.action, reason: job.reason, attempt: job.attempt, asset: job.asset_id, upload: job.upload_id, outcome: result.outcome, detail: result.detail }));
    }));
  }
  return { ok: true, mode, ...summary };
}

/**
 * One job. Reads Mux and decides (plan), then, only in live mode and only if the database still
 * agrees, changes Mux. Never throws: a temporary failure is a retry.
 */
export async function runJob(job: Job, mode: Mode, check: () => Promise<Check>): Promise<Outcome> {
  if (!job.owner_id) return notVerified("no_owner");
  try {
    const plan = job.action === "delete_asset" ? await planDelete(job)
      : job.action === "sync_playback" ? await planSync(job)
      : job.action === "cancel_upload" ? await planCancel(job)
      : { final: { outcome: "failed", detail: { outcome: "invalid", detail: "unknown_action" } } as Outcome };
    if (mode !== "live") {
      // A dry run records the plan and changes nothing, at Mux or in the database's videos.
      const would = "final" in plan ? { outcome: plan.final.outcome, ...plan.final.detail } : { act: plan.act };
      return { outcome: "release", detail: { dry_run: true, would } };
    }
    if ("final" in plan) return plan.final;
    return await execute(plan, check);
  } catch (e) {
    return retry(errorText(e));
  }
}

type Plan =
  | { final: Outcome }
  | { act: "delete"; asset: Asset }
  | { act: "sync"; asset: Asset; publics: string[] }
  | { act: "cancel"; upload: Upload };

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

type Change = <T>(path: string, init: RequestInit) => Promise<T>;
/** Every change at Mux goes through one of these, which refuses unless the job's check said live. */
export function changer(mode: Mode | undefined): Change {
  return async <T>(path: string, init: RequestInit) => {
    if (mode !== "live") throw new Error("change_refused_outside_live_mode");
    return await mux<T>(path, { ...init, signal: signal() });
  };
}

/** Why this asset is not the job's to change, or null when it is. */
export function assetMismatch(asset: Asset, job: Job): string | null {
  if (asset?.id !== job.asset_id) return "asset_id_mismatch";
  if (!asset.passthrough || asset.passthrough !== job.owner_id) return "passthrough_mismatch";
  if (job.upload_id && asset.upload_id !== job.upload_id) return "upload_id_mismatch";
  return null;
}

async function planDelete(job: Job): Promise<Plan> {
  const asset = await getAsset(job.asset_id!);
  if (!asset) return { final: done({ outcome: "already_gone" }) };
  const mismatch = assetMismatch(asset, job);
  if (mismatch) return { final: notVerified(mismatch) };
  return { act: "delete", asset };
}

async function planSync(job: Job): Promise<Plan> {
  const asset = await getAsset(job.asset_id!);
  if (!asset) {
    return { final: job.playback_wanted ? { outcome: "failed", detail: { outcome: "asset_missing", detail: "asset_missing" } } : done({ outcome: "already_gone", revoked: [] }) };
  }
  const mismatch = assetMismatch(asset, job);
  if (mismatch) return { final: notVerified(mismatch) };
  const publics = (asset.playback_ids ?? []).filter((p) => p.policy === "public" && isMuxId(p.id)).map((p) => p.id);
  return { act: "sync", asset, publics };
}

async function planCancel(job: Job): Promise<Plan> {
  let upload: Upload;
  try {
    upload = await mux<Upload>(`/video/v1/uploads/${muxSegment(job.upload_id)}`, { signal: signal() });
  } catch (e) {
    if (notFound(e)) return { final: done({ outcome: "already_gone" }) };
    throw e;
  }
  if (upload?.id !== job.upload_id) return { final: notVerified("upload_id_mismatch") };
  if (upload.new_asset_settings?.passthrough !== job.owner_id) return { final: notVerified("passthrough_mismatch") };
  if (upload.status === "waiting") return { act: "cancel", upload };
  if (upload.status === "asset_created") {
    return { final: isMuxId(upload.asset_id) ? { outcome: "found_asset", detail: { outcome: "asset_created", asset_id: upload.asset_id } } : retry("upload_without_asset") };
  }
  if (upload.status === "cancelled" || upload.status === "timed_out" || upload.status === "errored") return { final: done({ outcome: upload.status }) };
  return { final: retry(`upload_${upload.status}`) };
}

async function execute(plan: Exclude<Plan, { final: Outcome }>, check: () => Promise<Check>): Promise<Outcome> {
  const c = await check();
  if (!c.ok) return stale;
  if (c.mode !== "live") return { outcome: "release", detail: { dry_run: true, would: { act: plan.act }, detail: "switched off before acting" } };
  const change = changer(c.mode);
  if (plan.act === "delete") {
    if (c.hold === "infinity") return kept("in use, or its moderation case is open");
    if (c.hold) return { outcome: "release", detail: { outcome: "held", not_before: c.hold } };
    try {
      await change(`/video/v1/assets/${muxSegment(plan.asset.id)}`, { method: "DELETE" });
    } catch (e) {
      if (notFound(e)) return done({ outcome: "already_gone" });
      throw e;
    }
    return done({ outcome: "deleted" });
  }
  if (plan.act === "cancel") {
    if (c.in_use) return kept("a video that can still go live uses this upload");
    const after = await change<MuxUpload>(`/video/v1/uploads/${muxSegment(plan.upload.id)}/cancel`, { method: "PUT" });
    return after?.status === "cancelled" ? done({ outcome: "cancelled" }) : retry(`upload_${after?.status}`);
  }
  // sync
  if (!c.wanted) return done({ outcome: "revoked", revoked: await revoke(change, plan.asset.id, plan.publics) });
  if (plan.publics.length) return done({ outcome: "kept", playback_id: plan.publics[0], asset_status: plan.asset.status });
  const created = await change<{ id: string; policy: string }>(`/video/v1/assets/${muxSegment(plan.asset.id)}/playback-ids`, {
    method: "POST", body: JSON.stringify({ policy: "public" }),
  });
  if (!isMuxId(created?.id)) return retry("unexpected_playback_id");
  // The video may have been deleted, removed or its account deleted while Mux answered: then
  // the new id is removed at once, before anyone could be given it.
  const after = await check().catch(() => ({ ok: false } as Check));
  if (!after.ok || !after.wanted) {
    await revoke(change, plan.asset.id, [created.id]);
    return after.ok ? done({ outcome: "revoked", revoked: [created.id], detail: "no longer wanted after creating" }) : stale;
  }
  return done({ outcome: "restored", playback_id: created.id, asset_status: plan.asset.status });
}

async function revoke(change: Change, assetId: string, ids: string[]): Promise<string[]> {
  const revoked: string[] = [];
  for (const id of ids) {
    try {
      await change(`/video/v1/assets/${muxSegment(assetId)}/playback-ids/${muxSegment(id)}`, { method: "DELETE" });
    } catch (e) {
      if (!notFound(e)) throw e;
    }
    revoked.push(id);
  }
  return revoked;
}

/** F8: lists the assets at Mux and lets the database decide which are orphans. */
export async function sweep(): Promise<Record<string, unknown>> {
  const admin = adminClient();
  const { data: dbMode, error: modeError } = await admin.rpc("mux_cleanup_overview");
  if (modeError) return { ok: false, error: "db_failed" };
  const mode = effectiveMode(dbMode?.mode);
  if (mode === "off") return { ok: true, mode, skipped: "off" };
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
  // Only the assets actually listed are judged; an incomplete listing leaves the rest alone. A dry
  // run queues and records nothing.
  const { data, error } = await admin.rpc("mux_cleanup_sweep", { p_assets: assets, p_dry_run: mode !== "live" });
  if (error) {
    console.error(error);
    return { ok: false, error: "db_failed", mode, listed: assets.length, complete };
  }
  const result = { ok: true, mode, listed: assets.length, complete, listError, ...data };
  console.log(JSON.stringify({ sweep: result }));
  return result;
}
