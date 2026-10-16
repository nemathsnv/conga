// Startup configuration (env.ts configError, thrown by supabase.ts): no silent fallback server.
import { configError } from '@/lib/env';

const HOSTED = 'https://abcdefghijklmnopqrst.supabase.co';

describe('configError', () => {
  it('refuses a missing URL or key in every build', () => {
    for (const dev of [true, false]) {
      expect(configError('', 'key', dev, false)).toMatch(/Missing EXPO_PUBLIC_SUPABASE_URL/);
      expect(configError(HOSTED, '', dev, false)).toMatch(/Missing/);
    }
  });

  it('accepts a local LAN http URL in development', () => {
    expect(configError('http://192.168.1.20:54321', 'local-anon', true, false)).toBeNull();
    expect(configError('http://127.0.0.1:54321', 'local-anon', true, false)).toBeNull();
  });

  it('outside development accepts only the hosted https URL', () => {
    expect(configError(HOSTED, 'sb_publishable_x', false, false)).toBeNull();
    for (const url of ['http://localhost', 'http://192.168.1.20:54321', 'http://abcdefghijklmnopqrst.supabase.co',
      'https://abcdefghijklmnopqrst.supabase.co.evil.example', 'https://short.supabase.co', 'https://example.com']) {
      expect(configError(url, 'key', false, false)).toMatch(/hosted https/);
    }
  });

  it('the founder build also needs the publishable key, even in development', () => {
    expect(configError(HOSTED, 'eyJlegacy', true, true)).toMatch(/sb_publishable_/);
    expect(configError('http://192.168.1.20:54321', 'sb_publishable_x', true, true)).toMatch(/Founder build/);
    expect(configError(HOSTED, 'sb_publishable_x', true, true)).toBeNull();
  });
});

describe('supabase.ts at startup', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.resetModules();
  });

  it('throws instead of creating a client with no URL', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'key';
    jest.isolateModules(() => {
      jest.doMock('@react-native-async-storage/async-storage', () => ({}));
      jest.doMock('react-native', () => ({ AppState: { addEventListener: jest.fn() } }));
      const create = jest.fn();
      jest.doMock('@supabase/supabase-js', () => ({ createClient: create }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      expect(() => require('@/lib/supabase')).toThrow(/Missing EXPO_PUBLIC_SUPABASE_URL/);
      expect(create).not.toHaveBeenCalled();
    });
  });

  it('creates the client with exactly the configured values', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://192.168.1.20:54321/';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'local-anon';
    jest.isolateModules(() => {
      jest.doMock('@react-native-async-storage/async-storage', () => ({}));
      jest.doMock('react-native', () => ({ AppState: { addEventListener: jest.fn() } }));
      const create = jest.fn(() => ({}));
      jest.doMock('@supabase/supabase-js', () => ({ createClient: create }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@/lib/supabase');
      expect(create).toHaveBeenCalledWith('http://192.168.1.20:54321', 'local-anon', expect.anything());
    });
  });
});
