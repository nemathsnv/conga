// Camera flip during a take (docs/BLOCKERS.md B-1) and Pause/Resume (19 Oct 2026): segments, the
// total across them (paused time never counts), the 30-second limit and PR-Short on the total, and
// what happens to the files on cancel, interruptions and errors.
// The camera and the files are fakes; expo-camera itself only runs on a phone.
import { CAMERA_SWITCH_TIMEOUT_MS, createTake, fileExtension, FLIP_MIN_REMAINING_MS, FLIP_MIN_SEGMENT_MS, PAUSE_MIN_SEGMENT_MS, RESUME_MIN_REMAINING_MS, segmentMaxDurationSeconds, type TakeOutcome } from '@/video/recorder';
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
  const interrupted: unknown[] = [];
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
    onInterrupted: (e) => interrupted.push(e ?? 'no error'),
  });
  return {
    take,
    interrupted,
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

test('a flip with less than a second left is ignored; the take runs on to its limit', async () => {
  const h = harness();
  h.take.start();
  h.advance(29_200);
  expect(h.take.canFlip()).toBe(false);
  h.take.flip();
  await flush();
  expect(h.stopRecording).not.toHaveBeenCalled();
  expect(h.switches).toHaveLength(0);
  expect(h.outcomes).toHaveLength(0);
  expect(h.take.phase).toBe('recording');
  expect(h.take.facing).toBe('front');
  h.advance(800);
  expect(h.take.elapsedMs()).toBe(30_000);
  h.take.stop('limit');
  await flush();
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 30_000, segments: [{ facing: 'front' }] });
});

test('a flip with exactly a second left is taken', async () => {
  const h = harness();
  h.take.start();
  h.advance(29_000);
  expect(h.take.canFlip()).toBe(true);
  h.take.flip();
  await flush();
  expect(h.switches).toHaveLength(1);
  await h.switchDone();
  expect(h.recordings[1].maxDurationSeconds).toBe(1);
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

test('an interruption (a call: the camera ends the segment by itself) pauses the take and keeps what was recorded', async () => {
  const h = harness();
  h.take.start();
  h.advance(4000);
  h.take.flip();
  await flush();
  await h.switchDone();
  h.advance(3000);
  await h.cameraEnds();
  expect(h.take.phase).toBe('paused');
  expect(h.take.paused).toBe(true);
  expect(h.take.elapsedMs()).toBe(7000);
  expect(h.interrupted).toHaveLength(1);
  expect(h.outcomes).toEqual([]);
  h.take.stop();
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 7000 });
  expect(h.outcomes[0].kind === 'recorded' && h.outcomes[0].segments).toHaveLength(2);
});

test('the app going to the background during the switch: the other camera comes up paused, nothing more recorded', async () => {
  const h = harness();
  h.take.start();
  h.advance(4000);
  h.take.flip();
  await flush();
  h.take.stop('interrupted');
  expect(h.take.paused).toBe(true);
  await h.switchDone();
  expect(h.take.phase).toBe('paused');
  expect(h.take.facing).toBe('back');
  expect(h.recordings).toHaveLength(1);
  h.take.stop();
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 4000 });
});

test('a camera that does not come back pauses the take with the segments so far', async () => {
  const h = harness();
  h.take.start();
  h.advance(4000);
  h.take.flip();
  await flush();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  h.switches[0].done.reject(new Error('camera_switch_timeout'));
  await flush();
  expect(h.take.phase).toBe('paused');
  expect(h.interrupted).toHaveLength(1);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
  expect(CAMERA_SWITCH_TIMEOUT_MS).toBeGreaterThan(0);
  h.take.stop();
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 4000 });
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

test('a take stopped under 2 s whose camera hands back no valid data is PR-Short, not a failure', async () => {
  const h = harness();
  h.take.start();
  h.advance(300);
  h.stopRecording.mockImplementationOnce(() => {
    h.recordings[0].done.reject(new Error('no valid data'));
  });
  h.take.stop();
  await flush();
  expect(h.outcomes).toEqual([{ kind: 'short' }]);
});

test('a stopped take of 2 s or more whose camera fails is still a failed take', async () => {
  const h = harness();
  h.take.start();
  h.advance(2500);
  h.stopRecording.mockImplementationOnce(() => {
    h.recordings[0].done.reject(new Error('recording failed'));
  });
  h.take.stop();
  await flush();
  expect(h.outcomes[0]).toMatchObject({ kind: 'failed' });
});

test('Stop tapped again asks the camera again when the first stop was lost', async () => {
  const h = harness();
  h.take.start();
  h.stopRecording.mockImplementationOnce(() => {}); // the camera had not really started: the stop is lost
  h.advance(3000);
  h.take.stop();
  await flush();
  expect(h.outcomes).toEqual([]);
  h.take.stop();
  await flush();
  expect(h.stopRecording).toHaveBeenCalledTimes(2);
  expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 3000 });
});

// ---------------------------------------------------------------------------------------------
// Pause and Resume (Nemat, 19 Oct 2026)

/** Pauses and lets the camera hand back the segment. */
async function pauseNow(h: ReturnType<typeof harness>) {
  h.take.pause();
  await flush();
}

describe('pause and resume', () => {
  test("the founder's example: 7 s, pause 15 s, 5 s, pause, 8 s, stop gives about 20 s of three segments", async () => {
    const h = harness();
    h.take.start();
    h.advance(7000);
    await pauseNow(h);
    expect(h.take.phase).toBe('paused');
    h.advance(15000); // preparing what to say: not recorded, not counted
    expect(h.take.elapsedMs()).toBe(7000);
    h.take.resume();
    h.advance(5000);
    await pauseNow(h);
    h.advance(60000);
    expect(h.take.elapsedMs()).toBe(12000);
    h.take.resume();
    h.advance(8000);
    expect(h.take.elapsedMs()).toBe(20000);
    h.take.stop();
    await flush();
    expect(h.outcomes).toEqual([
      {
        kind: 'recorded',
        durationMs: 20000,
        segments: [
          { uri: 'file:///take/seg-1.mov', facing: 'front', durationMs: 7000 },
          { uri: 'file:///take/seg-2.mov', facing: 'front', durationMs: 5000 },
          { uri: 'file:///take/seg-3.mov', facing: 'front', durationMs: 8000 },
        ],
      },
    ]);
    expect(h.interrupted).toEqual([]);
  });

  test('ten pause and resume cycles: every segment kept in order, the total exact', async () => {
    const h = harness();
    h.take.start();
    for (let i = 0; i < 10; i++) {
      h.advance(1000 + i * 100);
      await pauseNow(h);
      h.advance(5000);
      if (i < 9) h.take.resume();
    }
    expect(h.take.segments.map((sg) => sg.durationMs)).toEqual([1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]);
    expect(h.take.elapsedMs()).toBe(14500);
    h.take.stop();
    expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 14500 });
  });

  test('the timer stops at the Pause tap, before the camera hands the segment back', async () => {
    const h = harness();
    h.take.start();
    h.advance(3000);
    h.stopRecording.mockImplementationOnce(() => {}); // the camera is still finishing the file
    h.take.pause();
    expect(h.take.paused).toBe(true);
    expect(h.take.phase).toBe('recording');
    h.advance(2000);
    expect(h.take.elapsedMs()).toBe(3000);
    expect(h.take.canResume()).toBe(false); // not until the segment is kept
    h.take.resume();
    expect(h.recordings).toHaveLength(1);
    await h.cameraEnds();
    expect(h.take.phase).toBe('paused');
    expect(h.take.segments[0].durationMs).toBe(3000);
    expect(h.take.canResume()).toBe(true);
  });

  test('Pause tapped again asks the camera again when the first stop was lost', async () => {
    const h = harness();
    h.take.start();
    h.advance(2000);
    h.stopRecording.mockImplementationOnce(() => {});
    h.take.pause();
    await flush();
    expect(h.take.phase).toBe('recording');
    h.take.pause();
    await flush();
    expect(h.stopRecording).toHaveBeenCalledTimes(2);
    expect(h.take.phase).toBe('paused');
  });

  test('a pause in the first half second of a segment is not taken by the take (the screen retries it)', async () => {
    const h = harness();
    h.take.start();
    h.advance(PAUSE_MIN_SEGMENT_MS - 1);
    expect(h.take.canPause()).toBe(false);
    h.take.pause();
    expect(h.stopRecording).not.toHaveBeenCalled();
    h.advance(1);
    expect(h.take.canPause()).toBe(true);
  });

  test('each resume gives the camera only the time left of the 30 seconds', async () => {
    const ios = harness();
    ios.take.start();
    ios.advance(12500);
    await pauseNow(ios);
    ios.take.resume();
    expect(ios.recordings[1].maxDurationSeconds).toBe(17.5);
    const android = harness({ platform: 'android' });
    android.take.start();
    android.advance(12500);
    await pauseNow(android);
    android.take.resume();
    expect(android.recordings[1].maxDurationSeconds).toBe(17);
  });

  test('reaching 30 s of recorded time after pauses ends the take for review', async () => {
    const h = harness();
    h.take.start();
    h.advance(25000);
    await pauseNow(h);
    h.advance(40000);
    h.take.resume();
    h.advance(5000);
    expect(h.take.elapsedMs()).toBe(30000);
    h.take.stop('limit'); // the screen's timer
    await flush();
    expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 30000 });
  });

  test("the camera's own limit ending the last segment completes the take, it does not pause it", async () => {
    const h = harness({ platform: 'android' });
    h.take.start();
    h.advance(12500);
    await pauseNow(h);
    h.take.resume(); // 17 s for the camera (whole seconds), 17.5 s left
    h.advance(17000);
    await h.cameraEnds();
    expect(h.take.phase).toBe('done');
    expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 29500 });
  });

  test('with less than a second left, Resume is refused and Stop keeps the take', async () => {
    const h = harness();
    h.take.start();
    h.advance(30000 - RESUME_MIN_REMAINING_MS + 1);
    await pauseNow(h);
    expect(h.take.canResume()).toBe(false);
    h.take.resume();
    expect(h.recordings).toHaveLength(1);
    h.take.stop();
    expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 29001 });
  });

  test('flip while paused: the other camera, still paused; Resume records on it', async () => {
    const h = harness();
    h.take.start();
    h.advance(4000);
    await pauseNow(h);
    expect(h.take.canFlip()).toBe(true);
    h.take.flip();
    expect(h.take.phase).toBe('flipping');
    expect(h.take.paused).toBe(true);
    await h.switchDone();
    expect(h.take.phase).toBe('paused');
    expect(h.take.facing).toBe('back');
    expect(h.recordings).toHaveLength(1);
    h.take.resume();
    h.advance(3000);
    h.take.flip(); // and a flip while recording, as before
    await flush();
    await h.switchDone();
    h.advance(2000);
    h.take.stop();
    await flush();
    expect(h.outcomes[0]).toMatchObject({
      kind: 'recorded',
      durationMs: 9000,
      segments: [{ facing: 'front', durationMs: 4000 }, { facing: 'back', durationMs: 3000 }, { facing: 'front', durationMs: 2000 }],
    });
  });

  test('a camera that does not come back after a flip while paused leaves the take paused', async () => {
    const h = harness();
    h.take.start();
    h.advance(4000);
    await pauseNow(h);
    h.take.flip();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    h.switches[0].done.reject(new Error('camera_switch_timeout'));
    await flush();
    warn.mockRestore();
    expect(h.take.phase).toBe('paused');
    expect(h.take.segments).toHaveLength(1);
    expect(h.interrupted).toHaveLength(1);
  });

  test('Stop while a pause is ending the segment ends the take there', async () => {
    const h = harness();
    h.take.start();
    h.advance(3000);
    h.stopRecording.mockImplementationOnce(() => {});
    h.take.pause();
    h.take.stop();
    await h.cameraEnds();
    expect(h.take.phase).toBe('done');
    expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 3000 });
  });

  test('Stop while paused ends the take for review at once', async () => {
    const h = harness();
    h.take.start();
    h.advance(6000);
    await pauseNow(h);
    h.take.stop();
    expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 6000 });
  });

  test('Stop while paused under 2 s in total is PR-Short: every segment is deleted', async () => {
    const h = harness();
    h.take.start();
    h.advance(800);
    await pauseNow(h);
    h.take.resume();
    h.advance(700);
    await pauseNow(h);
    h.take.stop();
    expect(h.outcomes).toEqual([{ kind: 'short' }]);
    expect(h.discarded).toEqual(['file:///take/seg-1.mov', 'file:///take/seg-2.mov']);
  });

  test('Cancel while paused deletes every segment', async () => {
    const h = harness();
    h.take.start();
    h.advance(5000);
    await pauseNow(h);
    h.take.resume();
    h.advance(5000);
    await pauseNow(h);
    h.take.cancel();
    expect(h.outcomes).toEqual([{ kind: 'cancelled' }]);
    expect(h.discarded).toEqual(['file:///take/seg-1.mov', 'file:///take/seg-2.mov']);
  });

  test('the app going to the background while recording pauses and keeps the segment; resume carries on', async () => {
    const h = harness();
    h.take.start();
    h.advance(6000);
    h.take.stop('interrupted');
    await flush();
    expect(h.take.phase).toBe('paused');
    expect(h.interrupted).toHaveLength(1);
    h.advance(120000); // away from the app
    h.take.resume();
    h.advance(4000);
    h.take.stop();
    await flush();
    expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 10000 });
  });

  test('the app going to the background while paused changes nothing', async () => {
    const h = harness();
    h.take.start();
    h.advance(6000);
    await pauseNow(h);
    h.take.stop('interrupted');
    expect(h.take.phase).toBe('paused');
    expect(h.outcomes).toEqual([]);
  });

  test('a resume whose camera fails keeps the earlier segments and stays paused', async () => {
    const h = harness();
    h.take.start();
    h.advance(5000);
    await pauseNow(h);
    h.take.resume();
    h.recordings[1].done.reject(new Error('recording failed'));
    await flush();
    expect(h.take.phase).toBe('paused');
    expect(h.take.segments).toHaveLength(1);
    expect(h.interrupted).toEqual([new Error('recording failed')]);
    h.take.stop();
    expect(h.outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 5000 });
  });

  test('a segment the phone cannot keep (storage full) is deleted; the take stays paused with the others', async () => {
    let t = 0;
    let n = 0;
    const discarded: string[] = [];
    const outcomes: TakeOutcome[] = [];
    const interrupted: unknown[] = [];
    let finishSegment: ((v: { uri?: string }) => void) | null = null;
    const take = createTake('front', {
      record: () => new Promise((resolve) => (finishSegment = resolve)),
      stopRecording: () => finishSegment?.({ uri: `file:///cache/s${++n}.mov` }),
      switchCamera: () => Promise.resolve(),
      keep: (uri, facing, durationMs) => {
        if (uri.endsWith('s2.mov')) throw new Error('disk full');
        return { uri: uri.replace('/cache/', '/take/'), facing, durationMs };
      },
      discard: (uri) => discarded.push(uri),
      now: () => t,
      platform: 'ios',
      onChange: () => {},
      onFinish: (o) => outcomes.push(o),
      onInterrupted: (e) => interrupted.push(e),
    });
    take.start();
    t += 4000;
    take.pause();
    await flush();
    take.resume();
    t += 3000;
    take.pause();
    await flush();
    expect(discarded).toEqual(['file:///cache/s2.mov']);
    expect(take.phase).toBe('paused');
    expect(interrupted).toEqual([new Error('disk full')]);
    take.stop();
    expect(outcomes[0]).toMatchObject({ kind: 'recorded', durationMs: 4000 });
  });

  test('a flip or a pause asked while the other is ending the segment is ignored', async () => {
    const h = harness();
    h.take.start();
    h.advance(3000);
    h.stopRecording.mockImplementation(() => {});
    h.take.flip();
    h.take.pause();
    expect(h.stopRecording).toHaveBeenCalledTimes(1);
    h.stopRecording.mockReset();
  });
});
