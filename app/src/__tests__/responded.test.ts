// What the app knows about the member's one primary response per prompt (lib/responded.ts), and
// where it stops the camera (ui/recordEntry.tsx respondTarget). Founder iPhone test, 19 Oct: the +
// sheet offered prompts already responded to; Post was refused only after recording.
import { afterOwnVideoDeleted, applyPromptCards, hasResponded, markResponded, refreshResponded, resetResponded, _setClockForTests } from '@/lib/responded';
import { failedDetailFor } from '@/ui/failedPost';
import { respondTarget } from '@/ui/recordEntry';

const mockProfileResponses = jest.fn();
jest.mock('@/lib/content', () => ({ profileResponses: (...a: unknown[]) => mockProfileResponses(...a) }));
jest.mock('expo-router', () => ({ useRouter: () => ({}) }));
jest.mock('@/video/posting', () => ({ usePosting: () => ({ state: { kind: 'idle' } }) }));
jest.mock('@/lib/session', () => ({ useSession: () => ({ session: null }) }));

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

  it('keeps the server\'s card answer over a later list that cannot see a removed response', async () => {
    mockProfileResponses.mockResolvedValue([]);
    await refreshResponded('me');
    tick();
    applyPromptCards([{ id: 'removed', viewer_responded: true }]);
    tick();
    await refreshResponded('me');
    expect(hasResponded('removed')).toBe(true);
  });

  it('a refusal (already_responded) is remembered across a refresh', async () => {
    mockProfileResponses.mockResolvedValue([]);
    await refreshResponded('me');
    tick();
    markResponded('p9');
    tick();
    await refreshResponded('me');
    expect(hasResponded('p9')).toBe(true);
  });

  it('a newer card saying false wins over an older list (the response was deleted elsewhere)', async () => {
    mockProfileResponses.mockResolvedValue([own('p1', 'live')]);
    await refreshResponded('me');
    tick();
    applyPromptCards([{ id: 'p1', viewer_responded: false }]);
    expect(hasResponded('p1')).toBe(false);
  });

  it('a deletion forgets marks and cards and reads the list again', async () => {
    mockProfileResponses.mockResolvedValue([own('p1', 'live')]);
    await refreshResponded('me');
    markResponded('p2');
    applyPromptCards([{ id: 'p3', viewer_responded: true }]);
    tick();
    mockProfileResponses.mockResolvedValue([]);
    await afterOwnVideoDeleted();
    expect([hasResponded('p1'), hasResponded('p2'), hasResponded('p3')]).toEqual([false, false, false]);
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

  it('cards without the field (not deployed) change nothing', () => {
    markResponded('p1');
    applyPromptCards([{ id: 'p1' }, { id: 'p2' }]);
    expect([hasResponded('p1'), hasResponded('p2')]).toEqual([true, false]);
  });
});

describe('which camera links are a primary response', () => {
  it('a response to a prompt', () => {
    expect(respondTarget({ pathname: '/record/[promptId]', params: { promptId: 'p1' } })).toBe('p1');
  });
  it('never a video reply, a draft or another screen', () => {
    expect(respondTarget({ pathname: '/record/[promptId]', params: { promptId: 'p1', replyTo: 'v1' } })).toBeNull();
    expect(respondTarget({ pathname: '/record/[promptId]', params: { promptId: 'draft', draftFor: 's1' } })).toBeNull();
    expect(respondTarget('/plus')).toBeNull();
  });
});

describe('the refusal says why (P2)', () => {
  it('already_responded explains the one-response rule; other refusals keep the board line', () => {
    expect(failedDetailFor('cannot_post', 'already_responded')).toBe("You've already responded to this prompt.");
    expect(failedDetailFor('cannot_post', 'prompt_not_live')).toBe("This recording can't be posted.");
    expect(failedDetailFor('file_gone', 'already_responded')).toBe('This recording is no longer on this phone.');
  });
});
