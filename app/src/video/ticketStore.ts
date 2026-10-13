// One upload URL at a time for the signed-in member (pure: no React, no storage, no network).
// CP0 (13 Oct): Post Review minted a URL as it opened and kept it only once Mux answered, so a
// Post tapped before then minted a second one. Now every request goes through this store:
// Post Review starts it, and Post, the disclosure sheet's Post and any extra tap wait for the
// same request and get the same URL.
//
// The URL is not tied to a recording: a URL nobody posted with stays here for the member's next
// take (Re-record, Discard, leaving Post Review), instead of being left unused at Mux. It leaves
// the store once a posted row holds it (consume) or the server refuses it (drop).
import type { UploadTicket } from './upload';

/** URLs are handed out for this long. The server's slot and Mux's URL last an hour. */
export const TICKET_MAX_AGE_MS = 50 * 60 * 1000;

export type TicketLease = {
  ticket: UploadTicket;
  /** The URL may be replaced once if the server refuses it as stale: it was minted before this
   *  Post (by Post Review) and has never been sent with a post. A URL already sent may have been
   *  claimed by a row whose answer was lost, so it is never replaced automatically. */
  replaceable: boolean;
};

/** The store as Post sees it, for one member. */
export type TicketSource = {
  /** The member's URL: the one already minted, the request already running, or a new request. */
  get(): Promise<TicketLease>;
  /** About to be sent with a post. */
  sent(ticket: UploadTicket): void;
  /** A posted row holds it now: never hand it out again. */
  consume(ticket: UploadTicket): void;
  /** The server refused it (expired, used, cancelled, unknown): the next get() asks for a new one. */
  drop(ticket: UploadTicket): void;
};

export type TicketStore = {
  /** Starts a request if the member has no URL and none is running. Never throws. */
  prefetch(owner: string): void;
  forOwner(owner: string): TicketSource;
  reset(): void;
};

type Entry = { owner: string; promise: Promise<UploadTicket>; ticket?: UploadTicket; mintedAt?: number; sent: boolean };

export function createTicketStore(mint: () => Promise<UploadTicket>, now: () => number = Date.now): TicketStore {
  let entry: Entry | null = null;

  const start = (owner: string): Entry => {
    const e: Entry = { owner, promise: mint(), sent: false };
    entry = e;
    // A failed request is forgotten, so the next get() asks again; whoever waits on it sees the error.
    e.promise.then(
      (ticket) => {
        if (entry === e) {
          e.ticket = ticket;
          e.mintedAt = now();
        }
      },
      () => {
        if (entry === e) entry = null;
      },
    );
    return e;
  };

  /** The member's entry if it can still be used: running, or minted recently enough. */
  const current = (owner: string): Entry | null => {
    if (!entry || entry.owner !== owner) return null;
    if (entry.mintedAt !== undefined && now() - entry.mintedAt >= TICKET_MAX_AGE_MS) return null;
    return entry;
  };

  const forget = (ticket: UploadTicket) => {
    if (entry?.ticket?.uploadId === ticket.uploadId) entry = null;
  };

  return {
    prefetch(owner) {
      if (!current(owner)) start(owner);
    },
    forOwner(owner) {
      return {
        async get() {
          const existing = current(owner);
          const e = existing ?? start(owner);
          const ticket = await e.promise;
          return { ticket, replaceable: !!existing && !e.sent };
        },
        sent(ticket) {
          if (entry?.ticket?.uploadId === ticket.uploadId) entry.sent = true;
        },
        consume: forget,
        drop: forget,
      };
    },
    reset() {
      entry = null;
    },
  };
}
