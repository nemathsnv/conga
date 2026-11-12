// app.config.ts: the guards on builds and over-the-air updates that reach a phone, and the EAS Update
// settings (docs/release/OTA-UPDATES.md).
/* eslint-disable @typescript-eslint/no-require-imports */
import type { ExpoConfig } from 'expo/config';

const eas = require('../../eas.json');

const PROJECT_ID = '0f3c6a52-6d1e-4a8b-9c7e-2b1f4e5d6a7c';
const HOSTED = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x',
  EXPO_PUBLIC_WEB_BASE_URL: 'https://conga.churntech.com',
};
const FOUNDER = { ...HOSTED, EXPO_PUBLIC_FOUNDER_BUILD: '1', EXPO_PUBLIC_DEV_TOOLS: '0', EAS_PROJECT_ID: PROJECT_ID };

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  jest.resetModules();
});

/** Evaluates app.config.ts the way Expo does, with only `env` set. */
function loadConfig(env: Record<string, string>): ExpoConfig {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('EXPO_PUBLIC_') || k.startsWith('EAS_') || k === 'CONGA_UPDATE_CHANNEL') delete process.env[k];
  }
  Object.assign(process.env, env);
  let config: ExpoConfig | undefined;
  jest.isolateModules(() => {
    const mod = require('../../app.config');
    config = mod.default({ config: { name: 'Conga', slug: 'conga' } });
  });
  return config!;
}

function releaseProblems(env: Record<string, string>, opts: { founder: boolean; update: boolean }): string[] {
  let fn: (e: Record<string, string>, o: { founder: boolean; update: boolean }) => string[] = () => [];
  jest.isolateModules(() => {
    fn = require('../../app.config').releaseProblems;
  });
  return fn(env, opts);
}

describe('releaseProblems', () => {
  it('accepts the founder values for a founder update', () => {
    expect(releaseProblems(FOUNDER, { founder: true, update: true })).toEqual([]);
  });

  it('refuses development controls, a missing links domain and the local stack', () => {
    expect(releaseProblems({ ...FOUNDER, EXPO_PUBLIC_DEV_TOOLS: '1' }, { founder: true, update: true }).join()).toMatch(/DEV_TOOLS/);
    expect(releaseProblems({ ...FOUNDER, EXPO_PUBLIC_WEB_BASE_URL: '' }, { founder: true, update: true }).join()).toMatch(/WEB_BASE_URL/);
    expect(releaseProblems({ ...FOUNDER, EXPO_PUBLIC_WEB_BASE_URL: 'https://x.supabase.co/functions/v1/web' }, { founder: true, update: true }).join()).toMatch(/WEB_BASE_URL/);
    expect(releaseProblems({ ...FOUNDER, EXPO_PUBLIC_SUPABASE_URL: 'http://192.168.1.20:54321' }, { founder: true, update: true }).join()).toMatch(/hosted/);
    expect(releaseProblems({ ...FOUNDER, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJlocal' }, { founder: true, update: true }).join()).toMatch(/sb_publishable_/);
  });

  it('keeps founder and tester bundles apart', () => {
    expect(releaseProblems(FOUNDER, { founder: false, update: true }).join()).toMatch(/must not be 1/);
    expect(releaseProblems({ ...FOUNDER, EXPO_PUBLIC_FOUNDER_BUILD: '0' }, { founder: true, update: true }).join()).toMatch(/must be 1/);
  });

  it('uses the committed EAS project unless EAS_PROJECT_ID overrides it, and refuses a malformed override', () => {
    const { EAS_PROJECT_ID: _omit, ...noOverride } = FOUNDER;
    expect(releaseProblems(noOverride, { founder: true, update: true })).toEqual([]);
    expect(releaseProblems({ ...FOUNDER, EAS_PROJECT_ID: 'not-a-project' }, { founder: true, update: true }).join()).toMatch(/EAS_PROJECT_ID/);
  });
});

describe('publishing an update (CONGA_UPDATE_CHANNEL)', () => {
  it('refuses to export a founder update with the local .env values', () => {
    expect(() => loadConfig({ CONGA_UPDATE_CHANNEL: 'founder', EXPO_PUBLIC_SUPABASE_URL: 'http://192.168.1.20:54321', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'local', EXPO_PUBLIC_DEV_TOOLS: '1' }))
      .toThrow(/Update for founder refused/);
  });

  it('refuses an unknown channel', () => {
    expect(() => loadConfig({ ...FOUNDER, CONGA_UPDATE_CHANNEL: 'beta' })).toThrow(/unknown channel/);
  });

  it('accepts the founder values and asks for the founder channel', () => {
    const config = loadConfig({ ...FOUNDER, CONGA_UPDATE_CHANNEL: 'founder' });
    expect(config.updates).toMatchObject({ enabled: true, url: `https://u.expo.dev/${PROJECT_ID}`, requestHeaders: { 'expo-channel-name': 'founder' } });
    expect(config.ios?.bundleIdentifier).toBe('app.shortcut.founder');
  });

  it('a preview update with the preview build values is accepted and names no channel header (EAS sets it)', () => {
    const config = loadConfig({ ...eas.build.preview.env, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x', EAS_PROJECT_ID: PROJECT_ID, CONGA_UPDATE_CHANNEL: 'preview' });
    expect(config.updates).toMatchObject({ enabled: true, url: `https://u.expo.dev/${PROJECT_ID}` });
    expect(config.updates?.requestHeaders).toBeUndefined();
    expect(config.ios?.bundleIdentifier).toBe('app.shortcut');
  });
});

describe('EAS Update settings', () => {
  it('every build pins its JavaScript to its native code by fingerprint', () => {
    expect(loadConfig({}).runtimeVersion).toEqual({ policy: 'fingerprint' });
    expect(loadConfig(FOUNDER).runtimeVersion).toEqual({ policy: 'fingerprint' });
  });

  it('every build names the EAS project @nemathsnv/conga and asks it for updates', () => {
    const config = loadConfig({ ...FOUNDER, EAS_PROJECT_ID: '' });
    expect(config.owner).toBe('nemathsnv');
    expect(config.extra?.eas).toEqual({ projectId: '89a7bb41-ee22-4358-9ab1-75299a5ae2f9' });
    expect(config.updates).toMatchObject({ enabled: true, url: 'https://u.expo.dev/89a7bb41-ee22-4358-9ab1-75299a5ae2f9', requestHeaders: { 'expo-channel-name': 'founder' } });
    expect(loadConfig({}).updates).toMatchObject({ enabled: true, url: 'https://u.expo.dev/89a7bb41-ee22-4358-9ab1-75299a5ae2f9' });
    expect(loadConfig({}).updates?.requestHeaders).toBeUndefined();
  });

  it('the store and tester profiles each have their own channel', () => {
    expect(eas.build.preview.channel).toBe('preview');
    expect(eas.build.production.channel).toBe('production');
    expect(eas.build.development.channel).toBe('development');
  });
});

describe('EAS build profiles against the build guard', () => {
  for (const profile of ['preview', 'production'] as const) {
    it(`${profile}: eas.json plus the EAS key passes; without the key it is refused`, () => {
      const env = { EAS_BUILD: 'true', EAS_BUILD_PROFILE: profile, ...eas.build[profile].env };
      expect(() => loadConfig({ ...env, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x' })).not.toThrow();
      expect(() => loadConfig(env)).toThrow(new RegExp(`EAS ${profile} build refused`));
      expect(eas.build[profile].env.EXPO_PUBLIC_WEB_BASE_URL).toBe('https://conga.churntech.com');
      expect(eas.build[profile].env.EXPO_PUBLIC_DEV_TOOLS).toBe('0');
    });
  }
});
