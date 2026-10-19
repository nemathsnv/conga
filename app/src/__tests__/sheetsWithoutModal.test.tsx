// Founder iPhone test, 19 Oct: after a refused post, Discard did nothing and Home stopped taking
// taps until the app was restarted. A React Native <Modal> opened while a native-stack sheet was
// shown or closing was refused by UIKit, yet stayed mounted as an invisible full-screen layer
// (reproduced on the simulator: "Attempt to present RCTFabricModalHostViewController … which is
// already presenting RNSScreen"). The sheets are now overlays in the view tree (OverlaySheet),
// Home's are drawn above the tab bar by the tabs layout (tabsOverlay), and P7/P8 is a route.
import type { ReactElement, ReactNode } from 'react';
import { Text } from 'react-native';

import { OverlaySheet } from '@/ui/OverlaySheet';
import { RecordEntryProvider, useOpenRecord } from '@/ui/recordEntry';
import { TabsOverlayOutlet, useTabsOverlay } from '@/ui/tabsOverlay';

// Node's fs and path, without Node's type definitions (not a dependency of the app).
declare const __dirname: string;
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs') as { readdirSync: (dir: string, opts: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[]; readFileSync: (file: string, encoding: string) => string };
const path = require('path') as { join: (...parts: string[]) => string; relative: (from: string, to: string) => string };
/* eslint-enable @typescript-eslint/no-require-imports */

// react-test-renderer comes with jest-expo; it has no type declarations here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const renderer = require('react-test-renderer') as {
  act: (fn: () => unknown) => Promise<void>;
  create: (el: ReactElement) => { root: { findAllByType: (t: unknown) => unknown[] }; update: (el: ReactElement) => void; unmount: () => void; toJSON: () => unknown };
};
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockBackListeners: (() => boolean)[] = [];
jest.mock('react-native/Libraries/Utilities/BackHandler', () => ({
  __esModule: true,
  default: {
    addEventListener: (_type: string, l: () => boolean) => {
      mockBackListeners.push(l);
      return { remove: () => mockBackListeners.splice(mockBackListeners.indexOf(l), 1) };
    },
  },
}));

const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: mockNavigate, push: mockPush, replace: mockReplace, back: jest.fn() }) }));
let mockPostingKind = 'idle';
jest.mock('@/video/posting', () => ({ usePosting: () => ({ state: { kind: mockPostingKind } }) }));
const mockResponded = new Set<string>();
jest.mock('@/lib/responded', () => ({ hasResponded: (id: string) => mockResponded.has(id), refreshResponded: async () => undefined }));
jest.mock('@/lib/session', () => ({ useSession: () => ({ session: { user: { id: 'me' } } }) }));

function texts(tree: { root: { findAllByType: (t: unknown) => unknown[] } }): string[] {
  return (tree.root.findAllByType(Text) as { props: { children: ReactNode } }[]).map((t) => String(t.props.children));
}

describe('OverlaySheet', () => {
  beforeEach(() => {
    mockBackListeners.length = 0;
  });

  it('draws its sheet in the view tree only while visible', async () => {
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(() => {
      tree = renderer.create(<OverlaySheet visible={false} onRequestClose={() => undefined}><Text>P4</Text></OverlaySheet>);
    });
    expect(texts(tree)).toEqual([]);
    await renderer.act(() => tree.update(<OverlaySheet visible onRequestClose={() => undefined}><Text>P4</Text></OverlaySheet>));
    expect(texts(tree)).toEqual(['P4']);
    tree.unmount();
  });

  it('closes on Android Back while open, and only then', async () => {
    const close = jest.fn();
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(() => {
      tree = renderer.create(<OverlaySheet visible onRequestClose={close}><Text>P9</Text></OverlaySheet>);
    });
    expect(mockBackListeners).toHaveLength(1);
    expect(mockBackListeners[0]()).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    await renderer.act(() => tree.update(<OverlaySheet visible={false} onRequestClose={close}><Text>P9</Text></OverlaySheet>));
    expect(mockBackListeners).toHaveLength(0);
    tree.unmount();
  });
});

describe('Home sheets above the tab bar (tabsOverlay)', () => {
  function Home({ open }: { open: boolean }) {
    useTabsOverlay(open ? <Text>Discard this recording?</Text> : null);
    return null;
  }

  it('the outlet draws what Home hands over, and clears it when Home goes', async () => {
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(() => {
      tree = renderer.create(<><Home open /><TabsOverlayOutlet /></>);
    });
    expect(texts(tree)).toEqual(['Discard this recording?']);
    await renderer.act(() => tree.update(<><Home open={false} /><TabsOverlayOutlet /></>));
    expect(texts(tree)).toEqual([]);
    await renderer.act(() => tree.update(<><Home open /><TabsOverlayOutlet /></>));
    await renderer.act(() => tree.update(<TabsOverlayOutlet />));
    expect(texts(tree)).toEqual([]);
    tree.unmount();
  });
});

describe('camera entry (P7, P8)', () => {
  let entry!: ReturnType<typeof useOpenRecord>;
  function Capture() {
    entry = useOpenRecord();
    return null;
  }
  async function mount() {
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(() => {
      tree = renderer.create(<RecordEntryProvider><Capture /></RecordEntryProvider>);
    });
    return tree;
  }
  beforeEach(() => {
    mockNavigate.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
  });

  it('opens the camera when nothing waits', async () => {
    mockPostingKind = 'idle';
    const tree = await mount();
    entry.open('/record/p1' as never);
    entry.open('/record/p2' as never, 'replace');
    expect(mockPush).toHaveBeenCalledWith('/record/p1');
    expect(mockReplace).toHaveBeenCalledWith('/record/p2');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(entry.showBlock()).toBe(false);
    tree.unmount();
  });

  it.each([
    ['failed', 'waiting'],
    ['waiting', 'waiting'],
    ['uploading', 'posting'],
    ['processing', 'posting'],
  ])('a %s recording opens the sheet route (%s), from any screen, and never the camera', async (kind, sheet) => {
    mockPostingKind = kind;
    const tree = await mount();
    entry.open('/record/p1' as never);
    entry.open('/record/p1' as never, 'replace');
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/camera-blocked', params: { kind: sheet } });
    expect(entry.showBlock()).toBe(true);
    tree.unmount();
  });
});

describe('camera entry: several responses per prompt (Nemat, 19 Oct 2026)', () => {
  let entry!: ReturnType<typeof useOpenRecord>;
  function Capture() {
    entry = useOpenRecord();
    return null;
  }

  it('Respond on a prompt already responded to opens the camera, as on any other prompt', async () => {
    mockPostingKind = 'idle';
    mockResponded.clear();
    mockResponded.add('p1');
    mockNavigate.mockReset();
    mockPush.mockReset();
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(() => {
      tree = renderer.create(<RecordEntryProvider><Capture /></RecordEntryProvider>);
    });
    entry.open({ pathname: '/record/[promptId]', params: { promptId: 'p1' } });
    entry.open({ pathname: '/record/[promptId]', params: { promptId: 'p1', replyTo: 'v1' } });
    entry.open({ pathname: '/record/[promptId]', params: { promptId: 'p2' } });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledTimes(3);
    expect(mockPush).toHaveBeenNthCalledWith(1, { pathname: '/record/[promptId]', params: { promptId: 'p1' } });
    tree.unmount();
  });

  it('a recording still waiting blocks every camera entry (P7), answered prompt or not', async () => {
    mockPostingKind = 'failed';
    mockResponded.clear();
    mockNavigate.mockReset();
    mockPush.mockReset();
    let tree!: ReturnType<typeof renderer.create>;
    await renderer.act(() => {
      tree = renderer.create(<RecordEntryProvider><Capture /></RecordEntryProvider>);
    });
    entry.open({ pathname: '/record/[promptId]', params: { promptId: 'p1' } });
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/camera-blocked', params: { kind: 'waiting' } });
    expect(mockPush).not.toHaveBeenCalled();
    tree.unmount();
    mockPostingKind = 'idle';
  });
});

describe('no React Native <Modal> in the app', () => {
  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) return d.name === '__tests__' ? [] : sources(p);
      return /\.tsx?$/.test(d.name) ? [p] : [];
    });
  }

  it('every sheet is an OverlaySheet or a sheet route', () => {
    const offenders = sources(path.join(__dirname, '..')).filter((file) => {
      // Code only: comments may name <Modal> to say why it is not used.
      const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      return /import\s*\{[^}]*\bModal\b[^}]*\}\s*from\s*'react-native'/.test(text) || /<Modal[\s>]/.test(text);
    });
    expect(offenders.map((f) => path.relative(path.join(__dirname, '..'), f))).toEqual([]);
  });
});
