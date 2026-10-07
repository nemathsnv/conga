// The event queue (SPEC.md Section 21): events wait on the phone, go in batches once signed
// in, and survive a failed send. (jest hoists the mocks above this import.)
import { _queued, _resetForTests, flush, track } from '@/lib/analytics';

const mockRpc = jest.fn();
const mockGetSession = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a), auth: { getSession: () => mockGetSession() } } }));
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v;
    }),
    removeItem: jest.fn(async (k: string) => {
      delete store[k];
    }),
    __reset: () => {
      store = {};
    },
  };
});
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0' } } }));
jest.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => undefined }) }, Platform: { OS: 'ios' } }));

beforeEach(async () => {
  await (jest.requireMock("@react-native-async-storage/async-storage") as { removeItem: (k: string) => Promise<void> }).removeItem("shortcut.events");
  _resetForTests();
  mockRpc.mockReset();
  mockGetSession.mockReset();
});

describe('analytics queue', () => {
  it('keeps events until signed in', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    track('signup_started', { method: 'apple' });
    await flush();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(_queued()).toHaveLength(1);
  });

  it('sends a batch with the platform and version, then clears the queue', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    mockRpc.mockResolvedValue({ data: 2, error: null });
    track('prompt_viewed', { prompt_id: 'p', scope: 'global', surface: 'home' });
    track('like_added', { target_type: 'video' });
    await flush();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [name, args] = mockRpc.mock.calls[0] as [string, { p_platform: string; p_app_version: string; p_events: { name: string }[] }];
    expect(name).toBe('track_events');
    expect(args.p_platform).toBe('ios');
    expect(args.p_app_version).toBe('0.1.0');
    expect(args.p_events.map((e) => e.name)).toEqual(['prompt_viewed', 'like_added']);
    expect(_queued()).toHaveLength(0);
  });

  it('keeps the queue when the server refuses', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'bad_batch' } });
    track('offline_shown');
    await flush();
    expect(_queued()).toHaveLength(1);
  });

  it('puts the queue stored by an earlier launch first, without doubling', async () => {
    const storage = jest.requireMock('@react-native-async-storage/async-storage') as { setItem: (k: string, v: string) => Promise<void> };
    await storage.setItem('shortcut.events', JSON.stringify([{ name: 'offline_shown', props: {}, ts: '2026-10-06T00:00:00Z' }]));
    track('age_confirmed');
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await flush();
    expect(_queued().map((e) => e.name)).toEqual(['offline_shown', 'age_confirmed']);
  });

  it('never carries an email, name or username', () => {
    track('signup_completed', { method: 'email' });
    const keys = _queued().flatMap((e) => Object.keys(e.props));
    expect(keys).not.toEqual(expect.arrayContaining(['email', 'name', 'username']));
    expect(JSON.stringify(_queued())).not.toMatch(/@/);
  });
});
