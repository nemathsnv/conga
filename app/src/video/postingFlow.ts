// Pure rules for getting an upload URL and the posted row when Post is tapped (no React, no
// storage), so they can be tested on their own. Security stage 2: the server can refuse a URL
// (limits, account state) and refuses a URL that is expired, used or was retired as abandoned.
import type { TicketSource } from './ticketStore';
import type { UploadTicket } from './upload';

/** Refusals Post Review answers with A-Restricted or LV-Suspended (and the deleted-account path). */
const RESTRICTIONS = ['posting_paused', 'suspended', 'account_deleted'];

/** The review-time URL can no longer be used; a fresh one fixes it. */
const STALE_TICKET = /upload_(expired|already_used|cancelled|not_found)/;

export function errorReason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function isRestriction(reason: string): boolean {
  return RESTRICTIONS.some((r) => reason.includes(r));
}

/** The server refused (ServerError.refused): nothing it was asked happened. Anything else thrown
 *  while creating the row (no connection, a gateway error) leaves the outcome unknown. */
export function isRefusal(e: unknown): boolean {
  return (e as { refused?: unknown } | null)?.refused === true;
}

/** A URL and when it was asked for (TicketLease), so the post knows how long the URL lasts. */
export type SentUrl = { ticket: UploadTicket; mintedAt: number };

export type Prepared<Row> =
  | { ok: true; ticket: UploadTicket; mintedAt: number; row: Row }
  /** No URL could be had: nothing was sent. */
  | { ok: false; reason: string; sent?: undefined }
  /** The row was asked for with this URL and no answer came: it may exist. The URL now belongs to
   *  this post only; Retry sends the same request (the same submission), which finds the row. */
  | { ok: false; reason: string; sent: SentUrl };

/**
 * Gets the member's upload URL from the ticket store (the one Post Review asked for, still running
 * or already minted, else a new request), then creates the row.
 * - `beforeSend` runs before the row is asked for, with the URL about to be sent, so the post is
 *   stored first and survives the app closing mid-request.
 * - No answer (not a refusal): the URL leaves the store, so no other recording can get it, and the
 *   result says it was sent. The caller keeps the post as an Upload failed post.
 * - A URL the server refuses as stale (left open over an hour, or retired as abandoned) is replaced
 *   once if Post Review asked for it. A refusal means the request rolled back, so no row holds it.
 * - No URL at all: a failed post with the reason, so the Upload failed banner can say why.
 * - Restrictions are thrown, as before, for Post Review to show A-Restricted or LV-Suspended, and
 *   other refusals are thrown as before, with the URL kept in the store for the next Post.
 */
export async function prepareUpload<Row>(args: {
  tickets: TicketSource;
  create: (ticket: UploadTicket) => Promise<Row>;
  beforeSend?: (sent: SentUrl) => Promise<void>;
}): Promise<Prepared<Row>> {
  const { tickets } = args;
  const leaseOrFail = async () => {
    try {
      return await tickets.get();
    } catch (e) {
      const reason = errorReason(e);
      if (isRestriction(reason)) throw e;
      return { reason };
    }
  };
  const attempt = async ({ ticket, mintedAt }: SentUrl): Promise<Prepared<Row>> => {
    const lease = { ticket, mintedAt };
    await args.beforeSend?.(lease);
    let row: Row;
    try {
      row = await args.create(lease.ticket);
    } catch (e) {
      if (isRefusal(e)) throw e;
      tickets.consume(lease.ticket);
      return { ok: false, reason: errorReason(e), sent: lease };
    }
    tickets.consume(lease.ticket);
    return { ok: true, ticket: lease.ticket, mintedAt: lease.mintedAt, row };
  };

  const first = await leaseOrFail();
  if ('reason' in first) return { ok: false, reason: first.reason };
  try {
    return await attempt(first);
  } catch (e) {
    if (!STALE_TICKET.test(errorReason(e))) throw e;
    tickets.drop(first.ticket);
    if (!first.replaceable) throw e;
  }
  const fresh = await leaseOrFail();
  if ('reason' in fresh) return { ok: false, reason: fresh.reason };
  try {
    return await attempt(fresh);
  } catch (e) {
    if (STALE_TICKET.test(errorReason(e))) tickets.drop(fresh.ticket);
    throw e;
  }
}

/** A URL refused as unusable in itself (expired, retired, unknown): no row holds it. */
const DEAD_TICKET = /upload_(expired|cancelled|not_found)/;

/**
 * The URL and row for a post that has no row yet, on Retry or when the connection returns: no URL
 * could be had at Post, or the row was asked for and no answer came.
 * - The URL is saved with the post before the row is created, so a failed attempt reuses it.
 * - With a submission (`replayable`), a URL already sent is sent again even if old: the server
 *   returns the row that request made, before it looks at the URL. If the server then refuses the
 *   URL as expired, retired or unknown, no row was made with it, so a fresh one is minted and used
 *   at once.
 * - Without a submission (a recording from an older build), an old URL is replaced first. One
 *   refused as stale is forgotten, so the next attempt mints.
 * - `upload_already_used` for a URL already sent may mean its row exists (a server without
 *   submissions): the URL is kept and nothing is minted, so no second row is made.
 */
export async function ensureUploadRow<Post extends { responseId: string | null; uploadId: string; uploadUrl: string; uploadUrlExpiresAt: number }>(
  post: Post,
  deps: {
    usable: (post: Post) => boolean;
    mint: () => Promise<UploadTicket>;
    create: (ticket: UploadTicket) => Promise<{ id: string }>;
    save: (post: Post) => Promise<void>;
    ttlMs: number;
    now?: () => number;
    replayable?: boolean;
  },
): Promise<Post> {
  if (post.responseId) return post;
  const now = deps.now ?? Date.now;
  let current = post;
  const mintFresh = async () => {
    // The URL's life counts from the request, not the answer.
    const askedAt = now();
    const minted = await deps.mint();
    current = { ...current, uploadId: minted.uploadId, uploadUrl: minted.uploadUrl, uploadUrlExpiresAt: askedAt + deps.ttlMs };
    await deps.save(current);
  };
  const createRow = async () => {
    const row = await deps.create({ uploadId: current.uploadId, uploadUrl: current.uploadUrl });
    current = { ...current, responseId: row.id };
    await deps.save(current);
    return current;
  };
  const clear = async () => {
    current = { ...current, uploadId: '', uploadUrl: '', uploadUrlExpiresAt: 0 };
    await deps.save(current);
  };

  const sentBefore = !!current.uploadId && !!current.uploadUrl;
  const replay = sentBefore && !!deps.replayable;
  if (!sentBefore || (!replay && !deps.usable(current))) await mintFresh();
  try {
    return await createRow();
  } catch (e) {
    const reason = errorReason(e);
    if (!STALE_TICKET.test(reason)) throw e;
    if (sentBefore && reason.includes('upload_already_used')) throw e;
    if (replay && DEAD_TICKET.test(reason)) {
      await mintFresh();
      try {
        return await createRow();
      } catch (e2) {
        if (STALE_TICKET.test(errorReason(e2))) await clear();
        throw e2;
      }
    }
    await clear();
    throw e;
  }
}

/**
 * One run at a time: while a run is in progress, further calls get that run's promise instead of
 * starting another. Post Review's Post and the disclosure sheet's Post share one, so taps that
 * land before the screen re-renders cannot submit twice.
 */
export function createGate(): (fn: () => Promise<void>) => Promise<void> {
  let running: Promise<void> | null = null;
  return (fn) => {
    if (running) return running;
    const run = (async () => {
      try {
        await fn();
      } finally {
        running = null;
      }
    })();
    running = run;
    return run;
  };
}

/** One after another: each call starts when the previous one has settled (succeeded or failed). */
export function createQueue(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T,>(fn: () => Promise<T>) => {
    const next = tail.then(fn, fn);
    tail = next.catch(() => undefined);
    return next;
  };
}

/**
 * Once per key: a second call with the same key gets the first call's promise. A call that throws
 * is forgotten, so the same key can be tried again. Used so one recording is posted once.
 */
export function createOncePerKey(): <T>(key: string, fn: () => Promise<T>) => Promise<T> {
  const calls = new Map<string, Promise<unknown>>();
  return <T,>(key: string, fn: () => Promise<T>) => {
    const existing = calls.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const call = fn();
    calls.set(key, call);
    call.catch(() => {
      if (calls.get(key) === call) calls.delete(key);
    });
    return call;
  };
}

/**
 * The second line of the Upload failed banner (X-Upload-Failed). The upload limits say what
 * happened (wording approved by Nemat, 12 Oct); every other failure keeps the board's line.
 */
export function uploadFailedDetail(reason: string | null): string {
  const r = reason ?? '';
  if (r.includes('upload_limit_hour')) return "You've reached the limit of 10 uploads per hour. Try again later.";
  if (r.includes('upload_limit_day')) return "You've reached the limit of 30 uploads in 24 hours. Try again later.";
  if (r.includes('upload_limit_active')) return "Uploading isn't available right now. Try again later.";
  return "It's saved on this phone. Check your connection.";
}
