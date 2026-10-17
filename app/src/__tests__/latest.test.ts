import { createLatest, type Latest } from '@/lib/latest';

/** A Home-like list: `load` asks a fake server whose answers the test resolves in any order. */
function harness() {
  const latest: Latest = createLatest();
  let items: string[] | null = null;
  const pending: { label: string; resolve: (page: string[]) => void }[] = [];
  const load = (label: string, reset: boolean): boolean => {
    const ticket = latest.begin(reset);
    if (ticket === null) return false;
    new Promise<string[]>((resolve) => pending.push({ label, resolve }))
      .then((page) => {
        if (latest.isCurrent(ticket)) items = reset || !items ? page : [...items, ...page];
      })
      .finally(() => latest.end(ticket));
    return true;
  };
  const answer = async (label: string, page: string[]) => {
    const i = pending.findIndex((p) => p.label === label);
    pending.splice(i, 1)[0].resolve(page);
    await new Promise((r) => setTimeout(r, 0));
  };
  return { load, answer, items: () => items };
}

describe('createLatest (Home feed loads)', () => {
  it('a reset always runs, even while another load is running', () => {
    const l = createLatest();
    expect(l.begin(true)).not.toBeNull();
    expect(l.begin(true)).not.toBeNull();
  });

  it('a next page is skipped while a load runs, and runs once it has ended', () => {
    const l = createLatest();
    const first = l.begin(true) as number;
    expect(l.begin(false)).toBeNull();
    l.end(first);
    expect(l.begin(false)).not.toBeNull();
  });

  it('a next page is skipped while a reset runs that replaced an earlier load', () => {
    const l = createLatest();
    const page = l.begin(false) as number;
    l.begin(true);
    l.end(page);
    expect(l.begin(false)).toBeNull();
  });

  it('only the latest load is current', () => {
    const l = createLatest();
    const a = l.begin(true) as number;
    const b = l.begin(true) as number;
    expect(l.isCurrent(a)).toBe(false);
    expect(l.isCurrent(b)).toBe(true);
  });

  it('a late For you page answering after the switch to Following never lands in Following', async () => {
    const h = harness();
    h.load('foryou-1', true);
    await h.answer('foryou-1', ['p1', 'p2']);
    h.load('foryou-2', false);
    h.load('following', true);
    await h.answer('following', ['f1']);
    await h.answer('foryou-2', ['p3']);
    expect(h.items()).toEqual(['f1']);
  });

  it('a tab switch while the first load runs is not dropped, and the old answer is ignored', async () => {
    const h = harness();
    h.load('foryou', true);
    expect(h.load('following', true)).toBe(true);
    await h.answer('following', ['f1']);
    await h.answer('foryou', ['p1']);
    expect(h.items()).toEqual(['f1']);
  });

  it('a refresh racing a running refresh: the later one wins whatever order they answer in', async () => {
    const h = harness();
    h.load('old', true);
    h.load('new', true);
    await h.answer('new', ['n1']);
    await h.answer('old', ['o1']);
    expect(h.items()).toEqual(['n1']);
  });

  it('pages in order still append', async () => {
    const h = harness();
    h.load('first', true);
    await h.answer('first', ['p1']);
    h.load('second', false);
    await h.answer('second', ['p2']);
    expect(h.items()).toEqual(['p1', 'p2']);
  });
});
