// Sign-out on a shared phone (accountCleanup.ts): the push token is removed from the leaving
// account while its session still exists, queued events go out under it and are then dropped,
// recent searches are cleared, and none of it can hold up or break the sign-out.
import { afterSignOut, beforeSignOut } from '@/lib/accountCleanup';
import { _queued, _resetForTests, track } from '@/lib/analytics';
import { unregisterPushToken } from '@/lib/notifications';
import { loadRecent, saveRecent } from '@/lib/recentSearches';

const mockRpc = jest.fn();
const mockGetSession = jest.fn();
const mockPermission = jest.fn();
const mockToken = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a), auth: { getSession: () => mockGetSession() } } }));
jest.mock('@/lib/content', () => ({ registerPushToken: jest.fn(), setTimezone: jest.fn() }));
jest.mock('@/lib/env', () => ({ FOUNDER_BUILD: false }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: () => mockPermission(),
  getExpoPushTokenAsync: (...a: unknown[]) => mockToken(...a),
}));
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
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.1.0', extra: { eas: { projectId: 'proj' } } } } }));
jest.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => undefined }) }, Platform: { OS: 'ios' } }));

beforeEach(() => {
  (jest.requireMock('@react-native-async-storage/async-storage') as { __reset: () => void }).__reset();
  _resetForTests();
  mockRpc.mockReset();
  mockGetSession.mockReset();
  mockPermission.mockReset();
  mockToken.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'lena' } } } });
  mockPermission.mockResolvedValue({ status: 'granted' });
  mockToken.mockResolvedValue({ data: 'ExponentPushToken[phone]' });
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe('beforeSignOut', () => {
  it("removes this phone's push token from the leaving account", async () => {
    await beforeSignOut();
    expect(mockRpc).toHaveBeenCalledWith('remove_push_token', { p_token: 'ExponentPushToken[phone]' });
  });

  it('sends the queued events under the leaving account first', async () => {
    track('like_added', {});
    await beforeSignOut();
    expect(mockRpc).toHaveBeenCalledWith('track_events', expect.objectContaining({ p_events: [expect.objectContaining({ name: 'like_added' })] }));
  });

  it('does nothing about push without the permission', async () => {
    mockPermission.mockResolvedValue({ status: 'denied' });
    await beforeSignOut();
    expect(mockRpc).not.toHaveBeenCalledWith('remove_push_token', expect.anything());
  });

  it('never throws when the server refuses or fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_revoked' } });
    await expect(beforeSignOut()).resolves.toBeUndefined();
    mockRpc.mockRejectedValue(new Error('network'));
    mockToken.mockRejectedValue(new Error('no token'));
    await expect(beforeSignOut()).resolves.toBeUndefined();
    await expect(unregisterPushToken()).resolves.toBeUndefined();
  });

  it('never waits longer than its bound (no connection)', async () => {
    mockRpc.mockReturnValue(new Promise(() => undefined));
    const started = Date.now();
    await beforeSignOut(50);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('afterSignOut', () => {
  it('drops what the leaving account left on the phone', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    track('comment_posted', {});
    await saveRecent(['warung', 'sunset']);
    await afterSignOut();
    expect(_queued()).toHaveLength(0);
    expect(await loadRecent()).toEqual([]);
  });
});
