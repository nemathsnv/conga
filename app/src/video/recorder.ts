// Recording helpers around expo-camera. The screen owns the CameraView; these functions
// own the file handling and the limits so the camera library can be swapped later.
//
// A take is one or more segments: expo-camera ends a recording when the camera flips (spike run 21),
// so a flip during a take stops the segment, keeps it, switches camera and starts the next one
// (docs/BLOCKERS.md B-1). The segments are stitched into one file on Post Review (stitch.ts).
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { MAX_DURATION_MS, MIN_DURATION_MS, type CameraFacing, type Recording, type RecordingSegment } from './types';

const RECORDINGS_DIR = 'recordings';
/** Segments of a take in progress or waiting to be stitched. Anything left here belongs to no recording. */
const TAKE_DIR = 'take';

function recordingsDir(): Directory {
  const dir = new Directory(Paths.document, RECORDINGS_DIR);
  if (!dir.exists) dir.create();
  return dir;
}

function takeDir(): Directory {
  const dir = new Directory(recordingsDir(), TAKE_DIR);
  if (!dir.exists) dir.create();
  return dir;
}

function uniqueName(extension = 'mp4'): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
}

/** The camera's own container extension (iOS records QuickTime .mov, Android .mp4). */
export function fileExtension(uri: string): string {
  const match = /\.([A-Za-z0-9]{2,4})$/.exec(uri.split('?')[0]);
  return match ? match[1].toLowerCase() : 'mp4';
}

/** Moves a just-recorded file out of the cache so it survives until it posts (Section 19). */
export function keepSegment(tempUri: string, facing: CameraFacing, durationMs: number): RecordingSegment {
  return { uri: keepFile(tempUri), facing, durationMs };
}

/** Moves a file (a one-segment take, or a stitched take) into the recordings folder. */
export function keepFile(uri: string): string {
  const src = new File(uri);
  const dest = new File(recordingsDir(), uniqueName());
  src.move(dest);
  return dest.uri;
}

/** Moves a segment of a take in progress out of the camera's cache, into the take folder. */
export function keepTakeSegment(tempUri: string, facing: CameraFacing, durationMs: number): RecordingSegment {
  const src = new File(tempUri);
  // The segment keeps its container's extension until it is stitched, so it is read as what it is.
  const dest = new File(takeDir(), uniqueName(fileExtension(tempUri)));
  src.move(dest);
  return { uri: dest.uri, facing, durationMs };
}

/**
 * The segments a finished take hands to Post Review. One segment is moved to the recordings folder
 * exactly as before stitching existed; several stay in the take folder until they are stitched.
 */
export function finalizeTakeSegments(segments: RecordingSegment[]): RecordingSegment[] {
  if (segments.length !== 1) return segments;
  return [keepSegment(segments[0].uri, segments[0].facing, segments[0].durationMs)];
}

export function deleteFileQuietly(uri: string): void {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone, or not ours to delete.
  }
}

/**
 * Deletes what a take left behind when the app was closed mid-take or on Post Review (no recording
 * refers to it any more). Run when a new take starts; `keep` lists files still in use.
 */
export function sweepTakeFolder(keep: string[]): void {
  try {
    const dir = new Directory(recordingsDir(), TAKE_DIR);
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      if (entry instanceof File && !keep.includes(entry.uri)) deleteFileQuietly(entry.uri);
    }
  } catch (e) {
    console.warn('take folder sweep failed', e);
  }
}

export function makeRecording(promptId: string, segments: RecordingSegment[]): Recording {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    submissionId: Crypto.randomUUID(),
    promptId,
    segments,
    durationMs: totalDuration(segments),
    createdAt: Date.now(),
  };
}

export function totalDuration(segments: RecordingSegment[]): number {
  return segments.reduce((sum, s) => sum + s.durationMs, 0);
}

// ---------------------------------------------------------------------------------------------
// The take: segments, the total, the 30-second limit and PR-Short across segments.
// Pure (the camera and the files are injected), so every edge is unit-tested.

/** A flip in the first half second of a segment is ignored: a segment that short may hold no frame. */
export const FLIP_MIN_SEGMENT_MS = 500;
/**
 * With less than this left of the 30 seconds, a flip is ignored and the take runs on to its limit.
 * (Android's expo-camera takes whole seconds for the limit and treats 0 as no limit, so a segment
 * under a second cannot be given one.)
 */
export const FLIP_MIN_REMAINING_MS = 1000;
/** The other camera not ready in this long: the take ends with the segments it has. */
export const CAMERA_SWITCH_TIMEOUT_MS = 4000;

/**
 * The `maxDuration` for a segment's recordAsync. iOS takes fractional seconds; Android's expo-camera
 * reads an integer (and 0 means no limit), so it is rounded down: the take never runs past 30 s.
 */
export function segmentMaxDurationSeconds(remainingMs: number, platform: 'ios' | 'android' | string): number {
  const ms = Math.max(0, Math.min(MAX_DURATION_MS, remainingMs));
  return platform === 'android' ? Math.floor(ms / 1000) : Math.round(ms) / 1000;
}

export type TakeOutcome =
  /** At least 2 seconds in total: on to Post Review. */
  | { kind: 'recorded'; segments: RecordingSegment[]; durationMs: number }
  /** Under 2 seconds in total (PR-Short). The files are deleted. */
  | { kind: 'short' }
  /** Nothing usable was recorded (the camera failed). The files are deleted. */
  | { kind: 'failed'; error: unknown }
  /** Cancel, or the screen closed. The files are deleted. */
  | { kind: 'cancelled' };

export type TakePhase = 'idle' | 'recording' | 'flipping' | 'done';

/** Why the current segment is ending. 'ended' is the camera stopping on its own (limit, interruption). */
type EndReason = 'flip' | 'stop' | 'limit' | 'interrupted';

export type TakeDeps = {
  /** expo-camera recordAsync on the current camera. */
  record: (maxDurationSeconds: number) => Promise<{ uri?: string } | undefined>;
  stopRecording: () => void;
  /** Switches to `to` and resolves when that camera can record; rejects when it cannot. */
  switchCamera: (to: CameraFacing) => Promise<void>;
  keep: (tempUri: string, facing: CameraFacing, durationMs: number) => RecordingSegment;
  discard: (uri: string) => void;
  now: () => number;
  platform: 'ios' | 'android' | string;
  /** Something the screen shows changed (phase, facing). The timer is read with elapsedMs(). */
  onChange: () => void;
  onFinish: (outcome: TakeOutcome) => void;
};

export type Take = {
  readonly phase: TakePhase;
  readonly facing: CameraFacing;
  readonly segments: readonly RecordingSegment[];
  start: () => void;
  /** Total recorded across segments, for the red timer and the ring. */
  elapsedMs: () => number;
  /** Whether a flip now would be taken. */
  canFlip: () => boolean;
  flip: () => void;
  /** Stop: the take ends with what it has. 'limit' when the 30 seconds are reached. */
  stop: (reason?: 'stop' | 'limit' | 'interrupted') => void;
  cancel: () => void;
};

export function otherFacing(facing: CameraFacing): CameraFacing {
  return facing === 'front' ? 'back' : 'front';
}

export function createTake(initialFacing: CameraFacing, deps: TakeDeps): Take {
  let phase: TakePhase = 'idle';
  let facing = initialFacing;
  const segments: RecordingSegment[] = [];
  let segmentStartedAt = 0;
  let segmentBudgetMs = MAX_DURATION_MS;
  let ending: EndReason | null = null;
  let endRequestedAt: number | null = null;
  // Each segment's recordAsync settles once; a stale one (after cancel) only gives back its file.
  let segmentToken = 0;

  const keptMs = () => totalDuration(segments);

  const liveMs = () => {
    if (phase !== 'recording') return 0;
    const end = endRequestedAt ?? deps.now();
    return Math.max(0, Math.min(segmentBudgetMs, end - segmentStartedAt));
  };

  const elapsedMs = () => Math.min(MAX_DURATION_MS, keptMs() + liveMs());

  const discardAll = () => {
    for (const s of segments.splice(0)) deps.discard(s.uri);
  };

  const finish = (error?: unknown) => {
    if (phase === 'done') return;
    phase = 'done';
    const total = keptMs();
    let outcome: TakeOutcome;
    if (segments.length === 0) {
      outcome = error !== undefined ? { kind: 'failed', error } : { kind: 'short' };
    } else if (total < MIN_DURATION_MS) {
      discardAll();
      outcome = { kind: 'short' };
    } else {
      outcome = { kind: 'recorded', segments: [...segments], durationMs: total };
    }
    deps.onChange();
    deps.onFinish(outcome);
  };

  const beginSegment = () => {
    segmentBudgetMs = MAX_DURATION_MS - keptMs();
    phase = 'recording';
    ending = null;
    endRequestedAt = null;
    segmentStartedAt = deps.now();
    const token = ++segmentToken;
    const segmentFacing = facing;
    let promise: Promise<{ uri?: string } | undefined>;
    try {
      promise = deps.record(segmentMaxDurationSeconds(segmentBudgetMs, deps.platform));
    } catch (e) {
      promise = Promise.reject(e);
    }
    promise.then(
      (result) => segmentEnded(token, segmentFacing, result?.uri ?? null),
      (e) => segmentEnded(token, segmentFacing, null, e ?? new Error('record_failed')),
    );
    deps.onChange();
  };

  const segmentEnded = (token: number, segmentFacing: CameraFacing, uri: string | null, error?: unknown) => {
    if (token !== segmentToken || phase !== 'recording') {
      // Cancelled (or the take already finished): this file belongs to nothing.
      if (uri) deps.discard(uri);
      return;
    }
    const durationMs = liveMs();
    const reason = ending;
    if (uri) {
      if (durationMs > 0) {
        try {
          segments.push(deps.keep(uri, segmentFacing, durationMs));
        } catch (e) {
          deps.discard(uri);
          error = error ?? e;
        }
      } else {
        deps.discard(uri);
      }
    }
    if (reason === 'flip') {
      flipCamera();
      return;
    }
    // Stop, the limit, an interruption, or the camera ending the segment on its own.
    finish(segments.length === 0 ? error ?? (uri ? undefined : new Error('record_failed')) : undefined);
  };

  const flipCamera = () => {
    phase = 'flipping';
    ending = null;
    endRequestedAt = null;
    const to = otherFacing(facing);
    facing = to;
    deps.onChange();
    const token = segmentToken;
    deps.switchCamera(to).then(
      () => {
        if (phase !== 'flipping' || token !== segmentToken) return;
        // Unreachable while flips under a second from the limit are ignored; kept as a safety net.
        if (MAX_DURATION_MS - keptMs() < FLIP_MIN_REMAINING_MS) finish();
        else beginSegment();
      },
      (e) => {
        if (phase !== 'flipping' || token !== segmentToken) return;
        console.warn('camera switch failed during a take; ending it with what it has', e);
        finish(e);
      },
    );
  };

  const requestEnd = (reason: EndReason) => {
    // A stop (or the limit) asked while a flip is stopping the segment wins: the take ends there.
    if (ending !== null && !(ending === 'flip' && reason !== 'flip')) return;
    const first = ending === null;
    if (endRequestedAt === null) endRequestedAt = deps.now();
    ending = reason;
    if (first) deps.stopRecording();
    deps.onChange();
  };

  const canFlip = () =>
    phase === 'recording' &&
    ending === null &&
    deps.now() - segmentStartedAt >= FLIP_MIN_SEGMENT_MS &&
    MAX_DURATION_MS - elapsedMs() >= FLIP_MIN_REMAINING_MS;

  return {
    get phase() {
      return phase;
    },
    get facing() {
      return facing;
    },
    get segments() {
      return segments;
    },
    start() {
      if (phase !== 'idle') return;
      beginSegment();
    },
    elapsedMs,
    canFlip,
    flip() {
      if (canFlip()) requestEnd('flip');
    },
    stop(reason = 'stop') {
      if (phase === 'recording') requestEnd(reason);
      else if (phase === 'flipping') finish();
    },
    cancel() {
      if (phase === 'done') return;
      const wasRecording = phase === 'recording';
      phase = 'done';
      segmentToken++;
      discardAll();
      if (wasRecording) deps.stopRecording();
      deps.onChange();
      deps.onFinish({ kind: 'cancelled' });
    },
  };
}

export { clampDuration, formatTimer, isTooShort } from './limits';
