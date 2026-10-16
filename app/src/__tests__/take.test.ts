// Camera flip during a take (docs/BLOCKERS.md B-1): segments, the total across them, the 30-second
// limit and PR-Short on the total, and what happens to the files on cancel and interruptions.
// The camera and the files are fakes; expo-camera itself only runs on a phone.
import { CAMERA_SWITCH_TIMEOUT_MS, createTake, fileExtension, FLIP_MIN_REMAINING_MS, FLIP_MIN_SEGMENT_MS, segmentMaxDurationSeconds, type TakeOutcome } from '@/video/recorder';
import type { CameraFacing } from '@/video/types';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((r) => setImmediate(() => r()));

/** A fake camera: each recordAsync waits until stopRecording (or the test) ends it. */
function harness(opts: { platform?: string; facing?: CameraFacing } = {}) {
  let clock = 0;
  let fileNo = 0;
  const recordings: { maxDurationSeconds: number; done: Deferred<{ uri?: string } | undefined> }[] = [];
  const switches: { to: CameraFacing; done: Deferred<void> }[] = [];
  const discarded: string[] = [];
  const outcomes: TakeOutcome[] = [];
  const stopRecording = jest.fn(() => {
    const current = recordings[recordings.length - 1];
    current?.done.resolve({ uri: `file:///cache/seg-${++fileNo}.mov` });
  });
  const take = createTake(opts.facing ?? 'front', {
    record: (maxDurationSeconds) => {
      const done = deferred<{ uri?: string } | undefined>();
      recordings.push({ maxDurationSeconds, done });
      return done.promise;
    },
    stopRecording,
    switchCamera: (to) => {
      const done = deferred<void>();
      switches.push({ to, done });
      return done.promise;
    },
    keep: (tempUri, facing, durationMs) => ({ uri: tempUri.replace('/cache/', '/take/'), facing, durationMs }),
    discard: (uri) => discarded.push(uri),
    now: () => clock,
    platform: opts.platform ?? 'ios',
    onChange: () => {},
    onFinish: (o) => outcomes.push(o),
  });
  return {
    take,
    recordings,
    switches,
    discarded,
    outcomes,
    stopRecording,
    advance: (ms: number) => {
      clock += ms;
    },
    /** The camera is ready after a switch. */
    switchDone: async () => {
      switches[switches.length - 1].done.resolve();
      await flush();
    },
    /** The camera ends the current segment by itself (its own limit, an interruption). */
    cameraEnds: async (uri = `file:///cache/seg-${++fileNo}.mov`) => {
      recordings[recordings.length - 1].done.resolve({ uri });
      await flush();
    },
  };
}

test('one segment: stop gives a recording of that length', async () => {
  const h = harness();
  h.take.start();
  h.advance(5000);
  expect(h.take.elapsedMs()).toBe(5000);
  h.take.stop();
  await flush();
  expect(h.outcomes).toEqual([{ kind: 'recorded', segments: [{ uri: 'file:///take/seg-1.mov', facing: 'front', durationMs: 5000 }], durationMs: 5000 }]);
  expect(h.recordings[0].maxDurationSeconds).toBe(30);
});

test('a flip keeps the segment, switches camera and records the next; the timer runs on the total', async () => {
  const h = harness();
  h.take.start();
  h.advance(3000);
  h.take.flip();
  expect(h.stopRecording).toHaveBeenCalledTimes(1);
  h.advance(400); // the segment's file is being finished: the timer holds at the flip
  expect(h.take.elapsedMs()).toBe(3000);
  await flush();
  expect(h.take.phase).toBe('flipping');
  expect(h.switches.map((s) => s.to)).toEqual(['back']);
  expect(h.take.facing).toBe('back');
  h.advance(700); // switching: nothing records, nothing counts
  expect(h.take.elapsedMs()).toBe(3000);
  await h.switchDone();
  expect(h.take.phase).toBe('recording');
  expect(h.recordings).toHaveLength(2);
  expect(h.recordings[1].maxDurationSeconds).toBe(27);
  h.advance(4000);
  expect(h.take.elapsedMs()).toBe(7000);
  h.take.stop();
  await flush();
  expect(h.outcomes).toEqual([
    {
      kind: 'recorded',
      durationMs: 7000,
      segments: [
        { uri: 'file:///take/seg-1.mov', facing: 'front', durationMs: 3000 },
        { uri: 'file:///take/seg-2.mov', facing: 'back', durationMs: 4000 },
      ],
    },
  ]);
  expect(h.discarded).toEqual([]);
});

test('several flips give alternating segments in order', async () => {
  const h = harness();
  h.take.start();
  for (let i = 0; i < 3; i++) {
    h.advance(2000);
    h.take.flip();
    await flush();
    await h.switchDone();
  }
  h.advance(2000);
  h.take.stop();
  await flush();
  const outcome = h.outcomes[0];
  expect(outcome.kind).toBe('recorded');
  if (outcome.kind !== 'recorded') return;
  expect(outcome.segments.map((s) => s.facing)).toEqual(['front', 'back', 'front', 'back']);
  expect(outcome.segments.map((s) => s.uri)).toEqual(['file:///take/seg-1.mov', 'file:///take/seg-2.mov', 'file:///take/seg-3.mov', 'file:///take/seg-4.mov']);
  expect(outcome.durationMs).toBe(8000);
});

test('the 30 seconds are the total across segments', async () => {
  const h = harness();
  h.take.start();
  h.advance(20_000);
  h.take.flip();
  await flush();
  await h.switchDone();
  expect(h.recordings[1].maxDurationSeconds).toBe(10);
  h.advance(12_000); // the screen's timer is late
  expect(h.take.elapsedMs()).toBe(30_000);
  h.take.stop('limit');
  await flush();
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 30_000 });
});

test("the camera's own limit per segment: fractional on iOS, whole seconds rounded down on Android", () => {
  expect(segmentMaxDurationSeconds(30_000, 'ios')).toBe(30);
  expect(segmentMaxDurationSeconds(12_345, 'ios')).toBe(12.345);
  expect(segmentMaxDurationSeconds(12_999, 'android')).toBe(12);
  expect(segmentMaxDurationSeconds(40_000, 'android')).toBe(30);
  expect(segmentMaxDurationSeconds(-5, 'ios')).toBe(0);
  // Android reads 0 as no limit, which is why a flip needs at least a second left.
  expect(segmentMaxDurationSeconds(FLIP_MIN_REMAINING_MS, 'android')).toBe(1);
});

test('a flip with less than a second left ends the take as the limit would', async () => {
  const h = harness();
  h.take.start();
  h.advance(29_200);
  h.take.flip();
  await flush();
  expect(h.switches).toHaveLength(0);
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 29_200 });
});

test('a flip in the first half second of a segment is ignored', async () => {
  const h = harness();
  h.take.start();
  h.advance(FLIP_MIN_SEGMENT_MS - 1);
  expect(h.take.canFlip()).toBe(false);
  h.take.flip();
  expect(h.stopRecording).not.toHaveBeenCalled();
  h.advance(1);
  expect(h.take.canFlip()).toBe(true);
});

test('flipping again while a flip is under way does nothing', async () => {
  const h = harness();
  h.take.start();
  h.advance(2000);
  h.take.flip();
  h.take.flip();
  await flush();
  h.take.flip();
  expect(h.stopRecording).toHaveBeenCalledTimes(1);
  expect(h.switches).toHaveLength(1);
});

test('PR-Short applies to the total: two short segments are deleted and not reviewed', async () => {
  const h = harness();
  h.take.start();
  h.advance(1200);
  h.take.flip();
  await flush();
  await h.switchDone();
  h.advance(600);
  h.take.stop();
  await flush();
  expect(h.outcomes).toEqual([{ kind: 'short' }]);
  expect(h.discarded).toEqual(['file:///take/seg-1.mov', 'file:///take/seg-2.mov']);
});

test('two segments under 2 seconds each but over 2 seconds in total reach review', async () => {
  const h = harness();
  h.take.start();
  h.advance(1500);
  h.take.flip();
  await flush();
  await h.switchDone();
  h.advance(1500);
  h.take.stop();
  await flush();
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 3000 });
});

test('cancel while recording deletes the kept segments and the one being finished', async () => {
  const h = harness();
  h.take.start();
  h.advance(3000);
  h.take.flip();
  await flush();
  await h.switchDone();
  h.advance(2000);
  h.take.cancel();
  expect(h.outcomes).toEqual([{ kind: 'cancelled' }]);
  expect(h.discarded).toEqual(['file:///take/seg-1.mov']);
  await flush(); // the camera hands back the second segment's file after stopRecording
  expect(h.discarded).toEqual(['file:///take/seg-1.mov', 'file:///cache/seg-2.mov']);
  expect(h.outcomes).toHaveLength(1);
});

test('cancel during the camera switch deletes the segments and records nothing more', async () => {
  const h = harness();
  h.take.start();
  h.advance(3000);
  h.take.flip();
  await flush();
  h.take.cancel();
  await h.switchDone();
  expect(h.recordings).toHaveLength(1);
  expect(h.outcomes).toEqual([{ kind: 'cancelled' }]);
  expect(h.discarded).toEqual(['file:///take/seg-1.mov']);
});

test('stop during the camera switch ends the take with the segments so far', async () => {
  const h = harness();
  h.take.start();
  h.advance(3000);
  h.take.flip();
  await flush();
  h.take.stop();
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 3000 });
  await h.switchDone();
  expect(h.recordings).toHaveLength(1);
  expect(h.outcomes).toHaveLength(1);
});

test('stop while the flip is ending the segment wins: no next segment', async () => {
  const h = harness();
  h.take.start();
  h.advance(3000);
  // Hold the camera's answer so the stop lands between the flip and the file.
  h.stopRecording.mockImplementationOnce(() => {});
  h.take.flip();
  h.take.stop();
  expect(h.stopRecording).toHaveBeenCalledTimes(1);
  await h.cameraEnds();
  expect(h.switches).toHaveLength(0);
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 3000 });
});

test('an interruption (backgrounding, a call) keeps what was recorded', async () => {
  const h = harness();
  h.take.start();
  h.advance(4000);
  h.take.flip();
  await flush();
  await h.switchDone();
  h.advance(3000);
  // The camera stops by itself when the app is interrupted.
  await h.cameraEnds();
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 7000 });
  expect(h.outcomes[0].kind === 'recorded' && h.outcomes[0].segments).toHaveLength(2);
});

test('the app going to the background during the switch ends the take with the segments so far', async () => {
  const h = harness();
  h.take.start();
  h.advance(4000);
  h.take.flip();
  await flush();
  h.take.stop('interrupted');
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 4000 });
});

test('a camera that does not come back ends the take with the segments so far', async () => {
  const h = harness();
  h.take.start();
  h.advance(4000);
  h.take.flip();
  await flush();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  h.switches[0].done.reject(new Error('camera_switch_timeout'));
  await flush();
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 4000 });
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
  expect(CAMERA_SWITCH_TIMEOUT_MS).toBeGreaterThan(0);
});

test('a segment lost at a flip does not end the take; the next camera carries on', async () => {
  const h = harness();
  h.take.start();
  h.advance(2500);
  h.stopRecording.mockImplementationOnce(() => h.recordings[0].done.reject(new Error('recording failed')));
  h.take.flip();
  await flush();
  expect(h.take.phase).toBe('flipping');
  await h.switchDone();
  h.advance(3000);
  h.take.stop();
  await flush();
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 3000, segments: [{ facing: 'back' }] });
});

test('a camera failure with nothing kept is a failed take', async () => {
  const h = harness();
  h.take.start();
  h.advance(3000);
  h.recordings[0].done.reject(new Error('recording failed'));
  await flush();
  expect(h.outcomes[0]).toMatchObject({ kind: 'failed' });
});

test('a segment that cannot be kept is deleted from the cache', async () => {
  const h = harness();
  let t = 0;
  const keepFails = createTake('front', {
    record: () => Promise.resolve({ uri: 'file:///cache/x.mov' }),
    stopRecording: () => {},
    switchCamera: () => Promise.resolve(),
    keep: () => {
      throw new Error('disk full');
    },
    discard: (uri) => h.discarded.push(uri),
    now: () => (t += 1000),
    platform: 'ios',
    onChange: () => {},
    onFinish: (o) => h.outcomes.push(o),
  });
  keepFails.start();
  await flush();
  expect(h.discarded).toEqual(['file:///cache/x.mov']);
  expect(h.outcomes[0]).toMatchObject({ kind: 'failed' });
});

test('starting twice records once', () => {
  const h = harness();
  h.take.start();
  h.take.start();
  expect(h.recordings).toHaveLength(1);
});

test("a segment keeps its camera's container extension until it is stitched", () => {
  expect(fileExtension('file:///var/Caches/Camera/ABC.mov')).toBe('mov');
  expect(fileExtension('file:///data/cache/Camera/x.mp4')).toBe('mp4');
  expect(fileExtension('file:///no-extension')).toBe('mp4');
});
