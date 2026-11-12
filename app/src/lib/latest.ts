// Latest-wins for a list that loads in pages and is sometimes loaded again from the start (Home:
// a tab switch, the refresh after a post goes live, the refresh after a report or delete). Pure,
// Jest-tested.
//
// - A reset always starts, and makes whatever was running stale: its answer must not land in
//   the new list (a late page of the For you feed arriving after a switch to Following).
// - A next page is skipped while any load runs (the list end is reached many times in a row).
// - An answer is applied only if its load is still the latest one.

export type LoadTicket = number;

export type Latest = {
  /** Starts a load; null means skip it (a next page while another load runs). */
  begin: (reset: boolean) => LoadTicket | null;
  /** The load's answer may still be applied. */
  isCurrent: (ticket: LoadTicket) => boolean;
  /** The load has ended (answered or failed). */
  end: (ticket: LoadTicket) => void;
};

export function createLatest(): Latest {
  let generation = 0;
  let running: LoadTicket | null = null;
  return {
    begin(reset) {
      if (!reset && running !== null) return null;
      generation += 1;
      running = generation;
      return generation;
    },
    isCurrent(ticket) {
      return ticket === generation;
    },
    end(ticket) {
      if (running === ticket) running = null;
    },
  };
}
