// What the app knows about the prompts the member has responded to (lib/responded.ts): only the
// + sheet's "Respond again" label reads it. A member may respond to a prompt any number of times
// (Nemat, 19 Oct 2026), so nothing here stops the camera (sheetsWithoutModal.test.tsx).
import { afterOwnVideoDeleted, hasResponded, markResponded, refreshResponded, resetResponded, _setClockForTests } from '@/lib/responded';
import { failedDetailFor, RESPONDED_COPY } from '@/ui/failedPost';

const mockProfileResponses = jest.fn();
jest.mock('@/lib/content', () => ({ profileResponses: (...a: unknown[]) => mockProfileResponses(...a) }));

let clock = 1000;
const tick = () => (clock += 10);

beforeEach(() => {
  clock = 1000;
  _setClockForTests(() => clock);
  resetResponded();
  mockProfileResponses.mockReset();
});

const own = (prompt_id: string, status: string) => ({ prompt_id, status });

describe('responded prompts', () => {
  it('reads the member\'s own live and processing responses, once per account', async () => {
    mockProfileResponses.mockResolvedValue([own('p1', 'live'), own('p2', 'processing'), own('p3', 'deleted')]);
    await refreshResponded('me');
    expect(mockProfileResponses).toHaveBeenCalledWith('me', 60);
    expect([hasResponded('p1'), hasResponded('p2'), hasResponded('p3'), hasResponded('p4')]).toEqual([true, true, false, false]);
  });

  it('several responses on one prompt are one answered prompt', async () => {
    mockProfileResponses.mockResolvedValue([own('p1', 'live'), own('p1', 'live'), own('p1', 'processing')]);
    await refreshResponded('me');
    expect(hasResponded('p1')).toBe(true);
  });

  it('a response posted on this phone counts before the list has caught up', async () => {
    mockProfileResponses.mockResolvedValue([]);
    await refreshResponded('me');
    tick();
    markResponded('p9');
    expect(hasResponded('p9')).toBe(true);
    // A list whose read started before the post does not forget it.
    _setClockForTests(() => clock - 5);
    await refreshResponded('me');
    _setClockForTests(() => clock);
    expect(hasResponded('p9')).toBe(true);
  });

  it('a list read after the post is believed (the response was deleted elsewhere)', async () => {
    mockProfileResponses.mockResolvedValue([]);
    await refreshResponded('me');
    markResponded('p9');
    tick();
    await refreshResponded('me');
    expect(hasResponded('p9')).toBe(false);
  });

  it('deleting one of several responses keeps the prompt answered when the list still has one', async () => {
    mockProfileResponses.mockResolvedValue([own('p1', 'live'), own('p1', 'live')]);
    await refreshResponded('me');
    tick();
    mockProfileResponses.mockResolvedValue([own('p1', 'live')]);
    await afterOwnVideoDeleted();
    expect(hasResponded('p1')).toBe(true);
  });

  it('deleting the last one reads the list again and forgets marks', async () => {
    mockProfileResponses.mockResolvedValue([own('p1', 'live')]);
    await refreshResponded('me');
    markResponded('p2');
    tick();
    mockProfileResponses.mockResolvedValue([]);
    await afterOwnVideoDeleted();
    expect([hasResponded('p1'), hasResponded('p2')]).toEqual([false, false]);
  });

  it('a list that cannot load keeps what was known', async () => {
    mockProfileResponses.mockResolvedValue([own('p1', 'live')]);
    await refreshResponded('me');
    mockProfileResponses.mockRejectedValue(new Error('offline'));
    await refreshResponded('me');
    expect(hasResponded('p1')).toBe(true);
  });

  it('nothing carries over to another account', async () => {
    mockProfileResponses.mockResolvedValue([own('p1', 'live')]);
    await refreshResponded('me');
    markResponded('p2');
    mockProfileResponses.mockResolvedValue([]);
    await refreshResponded('someone-else');
    expect([hasResponded('p1'), hasResponded('p2')]).toEqual([false, false]);
  });
});

describe('copy', () => {
  it('the + sheet says Respond again on an answered prompt', () => {
    expect(RESPONDED_COPY.label).toBe('Respond again');
  });

  it('an older server\'s already_responded refusal still says why; other refusals keep the board line', () => {
    expect(failedDetailFor('cannot_post', 'already_responded')).toBe("You've already responded to this prompt.");
    expect(failedDetailFor('cannot_post', 'prompt_not_live')).toBe("This recording can't be posted.");
    expect(failedDetailFor('file_gone', 'already_responded')).toBe('This recording is no longer on this phone.');
  });
});
