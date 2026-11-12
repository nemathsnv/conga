// Android emulator pass, 2 Nov 2026 (Pixel 7 image, Android 14):
// - The status bar followed the order screens were first opened, not the screen shown: white icons on
//   Discover after Home, dark icons over Home's video after Me (ui/statusBar.ts).
// - The keyboard covered the comment field, the email screen's Continue and the caption: the app draws
//   edge to edge, so the window no longer shrinks for the keyboard (ui/keyboard.ts).
// - The notification channel asked for a sound file named "default" and logged an error on every launch.
// - Back hid the keyboard but left the caption focused, so Post Review never showed Post again.
// Galaxy A15 through Device Streaming, 12 Nov 2026: Android raised 1080p recordings to 4.7 Mbps; 720p on Android.
import { createElement, useRef } from 'react';
import { Keyboard, Platform, type TextInput } from 'react-native';

import { useBlurOnKeyboardHide } from '@/ui/keyboard';
import { routeKey, statusBarStyleFor } from '@/ui/statusBar';

// react-test-renderer comes with jest-expo; it has no type declarations here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { unmount: () => void };
  act: (fn: () => void | Promise<void>) => Promise<void>;
};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Node's fs and path, without Node's type definitions (not a dependency of the app).
declare const __dirname: string;
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs') as { readdirSync: (dir: string, opts: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[]; readFileSync: (file: string, encoding: string) => string };
const path = require('path') as { join: (...parts: string[]) => string; relative: (from: string, to: string) => string };
/* eslint-enable @typescript-eslint/no-require-imports */

const SRC = path.join(__dirname, '..');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === '__tests__' ? [] : sources(p);
    return /\.tsx?$/.test(d.name) ? [p] : [];
  });
}

/** The file without comments, which may name what the code must not do. */
function code(file: string): string {
  return fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('status bar (ui/statusBar.ts)', () => {
  it('names a route by its file path, a group alone being its index', () => {
    expect(routeKey(['(tabs)'])).toBe('(tabs)/index');
    expect(routeKey(['(tabs)', 'discover'])).toBe('(tabs)/discover');
    expect(routeKey(['record', '[promptId]'])).toBe('record/[promptId]');
    expect(routeKey([])).toBe('');
  });

  it('gives light icons on black and video, dark icons on the light screens', () => {
    expect(statusBarStyleFor(['(tabs)'])).toBe('light');
    expect(statusBarStyleFor(['(tabs)', 'index'])).toBe('light');
    expect(statusBarStyleFor(['player', '[promptId]'])).toBe('light');
    expect(statusBarStyleFor(['record', 'review'])).toBe('light');
    expect(statusBarStyleFor(['(onboarding)', 'welcome'])).toBe('light');
    expect(statusBarStyleFor(['(tabs)', 'discover'])).toBe('dark');
    expect(statusBarStyleFor(['(tabs)', 'activity'])).toBe('dark');
    expect(statusBarStyleFor(['(tabs)', 'me'])).toBe('dark');
    expect(statusBarStyleFor(['settings', 'index'])).toBe('dark');
    expect(statusBarStyleFor(['(onboarding)', 'email'])).toBe('dark');
  });

  it('leaves the status bar to the screen beneath an overlay', () => {
    expect(statusBarStyleFor(['comments', '[responseId]'])).toBeNull();
    expect(statusBarStyleFor(['replies', '[rootId]'])).toBeNull();
    expect(statusBarStyleFor(['plus'])).toBeNull();
    expect(statusBarStyleFor([])).toBeNull();
  });

  it('no screen mounts its own <StatusBar>: the root layout sets it for the screen in front', () => {
    const offenders = sources(SRC).filter((file) => /<StatusBar[\s>/]/.test(code(file)) || /import\s*\{[^}]*\bStatusBar\b[^}]*\}\s*from\s*'expo-status-bar'/.test(code(file)));
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});

describe('keyboard avoidance (ui/keyboard.ts)', () => {
  it('every KeyboardAvoidingView avoids the keyboard on Android too', () => {
    const files = sources(SRC).filter((file) => /<KeyboardAvoidingView[\s>]/.test(code(file)));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) => {
      const tags = code(file).match(/<KeyboardAvoidingView[^>]*>/g) ?? [];
      return tags.some((tag) => !tag.includes('behavior={KEYBOARD_BEHAVIOR}'));
    });
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it("the comment bar is in the sheet's flow, so the padding lifts it", () => {
    const style = code(path.join(SRC, 'app', 'comments', '[responseId].tsx')).match(/inputBar: \{[^}]*\}/)?.[0] ?? '';
    expect(style).toContain("marginTop: 'auto'");
    expect(style).not.toContain("position: 'absolute'");
  });
});

describe('useBlurOnKeyboardHide', () => {
  it('leaves the field when the keyboard hides, and stops listening when the screen goes', async () => {
    const listeners: (() => void)[] = [];
    const remove = jest.fn();
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, l: () => void) => {
      if (event === 'keyboardDidHide') listeners.push(l);
      return { remove } as unknown as ReturnType<typeof Keyboard.addListener>;
    }) as typeof Keyboard.addListener);
    const blur = jest.fn();
    function Screen() {
      const input = useRef<TextInput>({ blur } as unknown as TextInput);
      useBlurOnKeyboardHide(input);
      return null;
    }
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(() => {
      tree = renderer.create(createElement(Screen));
    });
    expect(listeners).toHaveLength(1);
    listeners[0]();
    expect(blur).toHaveBeenCalledTimes(1);
    await renderer.act(() => tree.unmount());
    expect(remove).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });
});

describe('recording resolution per platform (video/types.ts)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  const settingsOn = (os: 'ios' | 'android') => {
    let settings!: typeof import('@/video/types').RECORDING_SETTINGS;
    jest.isolateModules(() => {
      // The isolated registry has its own react-native: set the platform on that one.
      /* eslint-disable @typescript-eslint/no-require-imports */
      jest.replaceProperty((require('react-native') as typeof import('react-native')).Platform, 'OS', os);
      settings = (require('@/video/types') as typeof import('@/video/types')).RECORDING_SETTINGS;
      /* eslint-enable @typescript-eslint/no-require-imports */
    });
    return settings;
  };

  it('records 720p on Android and 1080p on iPhone, both at 2.5 Mbps H.264', () => {
    expect(settingsOn('android')).toMatchObject({ videoQuality: '720p', videoBitrate: 2_500_000, codec: 'avc1' });
    expect(settingsOn('ios')).toMatchObject({ videoQuality: '1080p', videoBitrate: 2_500_000, codec: 'avc1' });
  });
});

describe('Android notification channel', () => {
  const mockSetChannel = jest.fn();
  beforeEach(() => {
    jest.resetModules();
    mockSetChannel.mockReset();
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.doMock('expo-notifications', () => ({
      setNotificationHandler: jest.fn(),
      setNotificationChannelAsync: (...a: unknown[]) => mockSetChannel(...a),
      AndroidImportance: { DEFAULT: 3 },
    }));
    jest.doMock('@/lib/supabase', () => ({ supabase: {} }));
    jest.doMock('@/lib/content', () => ({ registerPushToken: jest.fn(), setTimezone: jest.fn() }));
    jest.doMock('@/lib/env', () => ({ FOUNDER_BUILD: false }));
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the phone default sound: no sound file is named', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ensureNotificationChannel } = require('@/lib/notifications') as typeof import('@/lib/notifications');
    await ensureNotificationChannel();
    expect(mockSetChannel).toHaveBeenCalledTimes(1);
    const [, options] = mockSetChannel.mock.calls[0] as [string, Record<string, unknown>];
    expect(options).toMatchObject({ name: 'Conga', importance: 3 });
    expect(options).not.toHaveProperty('sound');
  });
});
