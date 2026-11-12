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

/** URLs are handed out for this long, counted from when the request was sent: the server's slot
 *  and Mux's URL last an hour from moments after that, so the age is never under-counted. */
export const TICKET_MAX_AGE_MS = 50 * 60 * 1000;

export type TicketLease = {
  ticket: UploadTicket;
  /** When the request for this URL was sent (the clock passed to the store). A post keeps it, so
   *  Retry knows the URL's real age, not the age since Post. */
  mintedAt: number;
  /** The URL may be replaced once if the server refuses it as stale: it was minted before this
   *  Post (by Post Review). A URL sent with a post whose answer never came is no longer in the
   *  store (it went with that post), so a URL here was never claimed by a row. */
  replaceable: boolean;
};

/** The store as Post sees it, for one member. */
export type TicketSource = {
  /** The member's URL: the one already minted, the request already running, or a new request. */
  get(): Promise<TicketLease>;
  /** A posted row holds it, or it went with a post whose answer never came: never hand it out again. */
  consume(ticket: UploadTicket): void;
  /** The server refused it (expired, used, cancelled, unknown): the next get() asks for a new one. */
  drop(ticket: UploadTicket): void;
};

export type TicketStore = {
  /** Starts a request if the member has no URL and none is running. Never throws. */
  prefetch(owner: string): void;
  forOwner(owner: string): TicketSource;
  /** Forgets the URL and any running request: the signed-in member changed or signed out. */
  reset(): void;
};

type Entry = { owner: string; promise: Promise<UploadTicket>; ticket?: UploadTicket; askedAt: number };

export function createTicketStore(mint: () => Promise<UploadTicket>, now: () => number = Date.now): TicketStore {
  let entry: Entry | null = null;

  const start = (owner: string): Entry => {
    const e: Entry = { owner, askedAt: now(), promise: mint() };
    entry = e;
    // A failed request is forgotten, so the next get() asks again; whoever waits on it sees the error.
    e.promise.then(
      (ticket) => {
        if (entry === e) e.ticket = ticket;
      },
      () => {
        if (entry === e) entry = null;
      },
    );
    return e;
  };

  /** The member's entry if it can still be used: asked for recently enough (running or minted). */
  const current = (owner: string): Entry | null => {
    if (!entry || entry.owner !== owner) return null;
    if (now() - entry.askedAt >= TICKET_MAX_AGE_MS) return null;
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
          return { ticket, mintedAt: e.askedAt, replaceable: !!existing };
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
