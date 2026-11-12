// Post Review: Re-record and Discard delete the recording's files, so they do nothing once Post is
// tapped. A Re-record during a slow Post deleted the files the post was sending (recording_missing)
// and the finished Post then closed the camera the member had gone back to.
import { createGate, reviewEditable } from '@/video/postingFlow';

// Node's fs and path, without Node's type definitions (not a dependency of the app).
declare const __dirname: string;
/* eslint-disable @typescript-eslint/no-require-imports */
const nodeFs = require('fs') as { readFileSync: (path: string, encoding: string) => string };
const nodePath = require('path') as { join: (...parts: string[]) => string };
/* eslint-enable @typescript-eslint/no-require-imports */

describe('the Post gate says whether a run is in progress', () => {
  test('from the tap until the run ends, also after a failure', async () => {
    const gate = createGate();
    expect(gate.running()).toBe(false);
    let finish!: () => void;
    const run = gate(() => new Promise<void>((r) => (finish = r)));
    expect(gate.running()).toBe(true);
    finish();
    await run;
    expect(gate.running()).toBe(false);
    await expect(gate(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(gate.running()).toBe(false);
  });
});

describe('reviewEditable', () => {
  test('only before Post: not while it runs, not after it (busy stays set while the screen closes)', () => {
    expect(reviewEditable({ busy: false, posting: false })).toBe(true);
    expect(reviewEditable({ busy: false, posting: true })).toBe(false);
    expect(reviewEditable({ busy: true, posting: true })).toBe(false);
    expect(reviewEditable({ busy: true, posting: false })).toBe(false);
  });
});

describe('Post Review uses it for every action that deletes the recording', () => {
  const source = nodeFs.readFileSync(nodePath.join(__dirname, '../app/record/review.tsx'), 'utf8');

  test('Discard and Re-record do nothing while Post runs', () => {
    expect(source).toContain('const editable = () => reviewEditable({ busy, posting: gate.running() });');
    expect(source).toMatch(/const discard = \(\) => \{\n\s+if \(!editable\(\)\) return;/);
    expect(source).toMatch(/const rerecord = \(\) => \{\n\s+if \(!editable\(\)\) return;/);
  });

  test('the X opens Discard this recording? only when it may act; Re-record is disabled while busy', () => {
    expect(source).toContain('<GlassTool label="Discard" onPress={() => { if (editable()) setDiscardAsk(true); }}>');
    expect(source).toContain('onPress={rerecord} disabled={busy}');
  });
});
