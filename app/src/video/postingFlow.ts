// Pure rules for getting an upload URL and the posted row when Post is tapped (no React, no
// storage), so they can be tested on their own. Security stage 2: the server can refuse a URL
// (limits, account state) and refuses a URL that is expired, used or was retired as abandoned.
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
 * Mints a URL if Post Review has none, then creates the row. A URL Post Review minted earlier that
 * the server now refuses (left open over an hour, or retired as abandoned) is replaced once.
 * A refused or failed mint is not thrown: the post becomes a failed post, kept on the phone with
 * the reason, so the Upload failed banner can say why. Restrictions are thrown, as before, for
 * Post Review to show A-Restricted or LV-Suspended. Errors creating the row are thrown as before.
 */
export async function prepareUpload<Row>(args: {
  ticket: UploadTicket | null;
  mint: () => Promise<UploadTicket>;
  create: (ticket: UploadTicket) => Promise<Row>;
}): Promise<Prepared<Row>> {
  const mintOrFail = async (): Promise<UploadTicket | { reason: string }> => {
    try {
      return await args.mint();
    } catch (e) {
      const reason = errorReason(e);
      if (isRestriction(reason)) throw e;
      return { reason };
    }
  };

  let ticket = args.ticket;
  if (!ticket) {
    const minted = await mintOrFail();
    if ('reason' in minted) return { ok: false, reason: minted.reason };
    ticket = minted;
  }
  try {
    return { ok: true, ticket, row: await args.create(ticket) };
  } catch (e) {
    if (!args.ticket || !STALE_TICKET.test(errorReason(e))) throw e;
  }
  const fresh = await mintOrFail();
  if ('reason' in fresh) return { ok: false, reason: fresh.reason };
  return { ok: true, ticket: fresh, row: await args.create(fresh) };
}

/**
 * The second line of the Upload failed banner (X-Upload-Failed). The board's line is kept for
 * every failure but the upload limits, which say what happened instead of "Check your connection."
 */
export function uploadFailedDetail(reason: string | null): string {
  const r = reason ?? '';
  if (r.includes('upload_limit_hour')) return "It's saved on this phone. You've reached the limit of 10 uploads an hour. Retry later.";
  if (r.includes('upload_limit_day')) return "It's saved on this phone. You've reached the limit of 30 uploads a day. Retry later.";
  if (r.includes('upload_limit_active')) return "It's saved on this phone. Uploading isn't available right now. Retry later.";
  return "It's saved on this phone. Check your connection.";
}
