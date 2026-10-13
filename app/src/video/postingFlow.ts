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

export type Prepared<Row> = { ok: true; ticket: UploadTicket; row: Row } | { ok: false; reason: string };

/**
 * Gets the member's upload URL from the ticket store (the one Post Review asked for, still running
 * or already minted, else a new request), then creates the row. A Post Review URL the server now
 * refuses as stale (left open over an hour, or retired as abandoned) is replaced once, unless it
 * was already sent with a post: then it may be held by a row whose answer was lost, and replacing
 * it could post the recording twice. A refused or failed request is not thrown: the post becomes
 * a failed post, kept on the phone with the reason, so the Upload failed banner can say why.
 * Restrictions are thrown, as before, for Post Review to show A-Restricted or LV-Suspended. Errors
 * creating the row are thrown as before, and the URL stays in the store for the next Post.
 */
export async function prepareUpload<Row>(args: {
  tickets: TicketSource;
  create: (ticket: UploadTicket) => Promise<Row>;
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
  const attempt = async (ticket: UploadTicket): Promise<Row> => {
    tickets.sent(ticket);
    const row = await args.create(ticket);
    tickets.consume(ticket);
    return row;
  };

  const first = await leaseOrFail();
  if ('reason' in first) return { ok: false, reason: first.reason };
  try {
    return { ok: true, ticket: first.ticket, row: await attempt(first.ticket) };
  } catch (e) {
    if (!STALE_TICKET.test(errorReason(e))) throw e;
    tickets.drop(first.ticket);
    if (!first.replaceable) throw e;
  }
  const fresh = await leaseOrFail();
  if ('reason' in fresh) return { ok: false, reason: fresh.reason };
  try {
    return { ok: true, ticket: fresh.ticket, row: await attempt(fresh.ticket) };
  } catch (e) {
    if (STALE_TICKET.test(errorReason(e))) tickets.drop(fresh.ticket);
    throw e;
  }
}

/**
 * The URL and row for a post that has no row yet (no URL could be had at Post), on Retry or when
 * the connection returns. The URL is saved with the post before the row is created, so a failed
 * attempt reuses it next time instead of minting another; one the server refuses as stale is
 * forgotten, so the next attempt mints a new one.
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
  },
): Promise<Post> {
  if (post.responseId) return post;
  let current = post;
  if (!current.uploadId || !current.uploadUrl || !deps.usable(current)) {
    const minted = await deps.mint();
    current = { ...current, uploadId: minted.uploadId, uploadUrl: minted.uploadUrl, uploadUrlExpiresAt: (deps.now ?? Date.now)() + deps.ttlMs };
    await deps.save(current);
  }
  try {
    const row = await deps.create({ uploadId: current.uploadId, uploadUrl: current.uploadUrl });
    current = { ...current, responseId: row.id };
    await deps.save(current);
    return current;
  } catch (e) {
    if (STALE_TICKET.test(errorReason(e))) {
      const cleared = { ...current, uploadId: '', uploadUrl: '', uploadUrlExpiresAt: 0 };
      await deps.save(cleared);
    }
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
