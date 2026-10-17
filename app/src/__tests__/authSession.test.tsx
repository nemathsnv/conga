// Session defects (session.tsx, stateRetry.ts, onboarding.ts):
//   - a signed-in phone whose first onboarding-state load fails (no connection at a cold start, a
//     blip right after the code, an expired token) leaves the splash once the load works again;
//   - sign-out signs out on this phone even when supabase-js refuses it (expired token, offline);
//   - after an onboarding step, a state that cannot be re-read never sends the person to Welcome.
import { useEffect, type ReactElement } from 'react';

import { nextOnboardingRoute, type OnboardingState } from '@/lib/onboarding';
import { SessionProvider, useSession } from '@/lib/session';
import { retryStateLoad, stateRetryDelay, STATE_RETRY_FIRST_MS } from '@/lib/stateRetry';

// react-test-renderer comes with jest-expo; it has no type declarations here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act: (fn: () => unknown) => Promise<void>;
  create: (el: ReactElement) => { unmount: () => void };
};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type AuthListener = (event: string, session: unknown) => void;
const mockAuthListeners = new Set<AuthListener>();
const mockOnlineListeners = new Set<(online: boolean) => void>();
const mockAppStateListeners = new Set<(st: string) => void>();
const mockGetSession = jest.fn();
const mockSignOut = jest.fn();
const mockGetState = jest.fn();
const mockRemoveLocal = jest.fn();
const mockAfterSignOut = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signOut: (...a: unknown[]) => mockSignOut(...a),
      onAuthStateChange: (cb: AuthListener) => {
        mockAuthListeners.add(cb);
        return { data: { subscription: { unsubscribe: () => mockAuthListeners.delete(cb) } } };
      },
    },
  },
  removeLocalSession: () => mockRemoveLocal(),
}));
jest.mock('@/lib/api', () => ({ getOnboardingState: () => mockGetState() }));
jest.mock('@/lib/accountCleanup', () => ({ beforeSignOut: async () => undefined, afterSignOut: () => mockAfterSignOut() }));
jest.mock('@/lib/content', () => ({ setSuspendedHandler: () => undefined }));
jest.mock('@/lib/pendingInvite', () => ({ loadPendingInvite: async () => null, savePendingInvite: async () => undefined }));
jest.mock('@/lib/connectivity', () => ({
  subscribeOnline: (l: (online: boolean) => void) => {
    mockOnlineListeners.add(l);
    return () => mockOnlineListeners.delete(l);
  },
}));
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: (_type: string, l: (st: string) => void) => {
      mockAppStateListeners.add(l);
      return { remove: () => mockAppStateListeners.delete(l) };
    },
  },
}));

const lena = { user: { id: 'lena' }, access_token: 'expired' };
const member: OnboardingState = {
  email: 'lena@hey.com',
  age_confirmed: true,
  invite_required: true,
  has_beta_access: true,
  waitlisted: false,
  has_profile: true,
  profile: { name: 'Lena', username: 'lena', photo_path: null },
};

const flush = () => renderer.act(async () => undefined);
const goOnline = () => renderer.act(async () => mockOnlineListeners.forEach((l) => l(true)));
const emit = (event: string, session: unknown) => renderer.act(async () => mockAuthListeners.forEach((l) => l(event, session)));

type Ctx = ReturnType<typeof useSession>;
let ctx: Ctx;
const seen = (value: Ctx) => {
  ctx = value;
};
function Probe({ onValue }: { onValue: (value: Ctx) => void }) {
  const value = useSession();
  useEffect(() => onValue(value), [value, onValue]);
  return null;
}

beforeEach(() => {
  jest.useRealTimers();
  mockAuthListeners.clear();
  mockOnlineListeners.clear();
  mockAppStateListeners.clear();
  for (const m of [mockGetSession, mockSignOut, mockGetState, mockRemoveLocal, mockAfterSignOut]) m.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: lena } });
  mockRemoveLocal.mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function mount() {
  let tree: { unmount: () => void } | undefined;
  await renderer.act(async () => {
    tree = renderer.create(
      <SessionProvider>
        <Probe onValue={seen} />
      </SessionProvider>,
    );
  });
  await flush();
  return tree!;
}

describe('the first state load fails (D1)', () => {
  it('leaves the splash once the connection comes back', async () => {
    mockGetState.mockRejectedValueOnce(new Error('Network request failed')).mockResolvedValue(member);
    const tree = await mount();
    expect(ctx.session).toBe(lena);
    expect(ctx.ready).toBe(false);
    await goOnline();
    await flush();
    expect(mockGetState).toHaveBeenCalledTimes(2);
    expect(ctx.ready).toBe(true);
    expect(ctx.step).toBe('home');
    await renderer.act(async () => tree.unmount());
  });

  it('tries again when the token is refreshed and when the app comes to the foreground', async () => {
    mockGetState.mockRejectedValueOnce(new Error('JWT expired')).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(member);
    const tree = await mount();
    await renderer.act(async () => mockAppStateListeners.forEach((l) => l('active')));
    await flush();
    expect(ctx.ready).toBe(false);
    await emit('TOKEN_REFRESHED', lena);
    await renderer.act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(mockGetState).toHaveBeenCalledTimes(3);
    expect(ctx.ready).toBe(true);
    await renderer.act(async () => tree.unmount());
  });

  it('stops listening once the state has loaded', async () => {
    mockGetState.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(member);
    const tree = await mount();
    expect(mockOnlineListeners.size).toBe(1);
    await goOnline();
    await flush();
    expect(ctx.ready).toBe(true);
    expect(mockOnlineListeners.size).toBe(0);
    expect(mockAppStateListeners.size).toBe(0);
    await renderer.act(async () => tree.unmount());
  });

  it('never retries for a signed-out phone', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const tree = await mount();
    expect(ctx.ready).toBe(true);
    expect(mockOnlineListeners.size).toBe(0);
    await renderer.act(async () => tree.unmount());
  });
});

describe('retryStateLoad', () => {
  it('backs off from 2 s to at most a minute', () => {
    expect(stateRetryDelay(0)).toBe(2000);
    expect(stateRetryDelay(1)).toBe(4000);
    expect(stateRetryDelay(10)).toBe(60_000);
  });

  it('retries on the timer, one load at a time, until stopped', async () => {
    jest.useFakeTimers();
    let release: () => void = () => undefined;
    const load = jest.fn(() => new Promise<void>((r) => (release = r)));
    const stop = retryStateLoad(load);
    await jest.advanceTimersByTimeAsync(STATE_RETRY_FIRST_MS);
    expect(load).toHaveBeenCalledTimes(1);
    mockOnlineListeners.forEach((l) => l(true));
    expect(load).toHaveBeenCalledTimes(1);
    release();
    await jest.advanceTimersByTimeAsync(stateRetryDelay(1));
    expect(load).toHaveBeenCalledTimes(2);
    stop();
    release();
    await jest.advanceTimersByTimeAsync(STATE_RETRY_FIRST_MS * 100);
    expect(load).toHaveBeenCalledTimes(2);
    expect(mockOnlineListeners.size + mockAppStateListeners.size + mockAuthListeners.size).toBe(0);
  });

  it('ignores going offline and other auth events', async () => {
    jest.useFakeTimers();
    const load = jest.fn(async () => undefined);
    const stop = retryStateLoad(load);
    mockOnlineListeners.forEach((l) => l(false));
    mockAppStateListeners.forEach((l) => l('background'));
    mockAuthListeners.forEach((l) => l('INITIAL_SESSION', lena));
    await jest.advanceTimersByTimeAsync(10);
    expect(load).not.toHaveBeenCalled();
    stop();
  });
});

describe('sign out (D2)', () => {
  it('removes the session on this phone when supabase-js refuses (expired token, offline)', async () => {
    mockGetState.mockResolvedValue(member);
    mockSignOut.mockResolvedValue({ error: new Error('Failed to fetch') });
    const tree = await mount();
    expect(ctx.ready).toBe(true);
    await renderer.act(async () => ctx.signOut());
    expect(mockRemoveLocal).toHaveBeenCalledTimes(1);
    expect(mockAfterSignOut).toHaveBeenCalledTimes(1);
    expect(ctx.session).toBeNull();
    expect(ctx.state).toBeNull();
    expect(ctx.step).toBe('welcome');
    expect(ctx.ready).toBe(true);
    await renderer.act(async () => tree.unmount());
  });

  it('also when signOut throws', async () => {
    mockGetState.mockResolvedValue(member);
    mockSignOut.mockRejectedValue(new Error('lock timeout'));
    const tree = await mount();
    await renderer.act(async () => ctx.signOut());
    expect(mockRemoveLocal).toHaveBeenCalledTimes(1);
    expect(ctx.session).toBeNull();
    await renderer.act(async () => tree.unmount());
  });

  it('leaves a working sign-out to supabase-js (its SIGNED_OUT event clears the session)', async () => {
    mockGetState.mockResolvedValue(member);
    mockSignOut.mockImplementation(async () => {
      mockAuthListeners.forEach((l) => l('SIGNED_OUT', null));
      return { error: null };
    });
    const tree = await mount();
    await renderer.act(async () => ctx.signOut());
    expect(mockRemoveLocal).not.toHaveBeenCalled();
    expect(mockAfterSignOut).toHaveBeenCalledTimes(1);
    expect(ctx.session).toBeNull();
    await renderer.act(async () => tree.unmount());
  });
});

describe('after an onboarding step (D3)', () => {
  it('stays when the state cannot be re-read, instead of going to Welcome', () => {
    expect(nextOnboardingRoute(null, false)).toBeNull();
    expect(nextOnboardingRoute(null, true)).toBeNull();
  });

  it('goes to the next step', () => {
    expect(nextOnboardingRoute({ ...member, age_confirmed: false }, false)).toBe('/(onboarding)/age');
    expect(nextOnboardingRoute({ ...member, has_beta_access: false }, false)).toBe('/(onboarding)/invite');
    expect(nextOnboardingRoute({ ...member, has_beta_access: false, waitlisted: true }, false)).toBe('/(onboarding)/waitlist');
    expect(nextOnboardingRoute({ ...member, has_profile: false }, false)).toBe('/(onboarding)/profile');
    expect(nextOnboardingRoute(member, true)).toBe('/(onboarding)/photo');
    expect(nextOnboardingRoute(member, false)).toBeNull();
  });

  it('sends a suspended account to LV-Suspended', () => {
    const suspended = { ...member, suspended: true, suspension: { action_id: 'a', reason: 'r', review_requested: false } };
    expect(nextOnboardingRoute(suspended, false)).toBe('/(onboarding)/suspended');
  });
});
