// Recording helpers around expo-camera. The screen owns the CameraView; these functions
// own the file handling and the limits so the camera library can be swapped later.
//
// A take is one or more segments: expo-camera ends a recording when the camera flips (spike run 21),
// so a flip during a take stops the segment, keeps it, switches camera and starts the next one
// (docs/BLOCKERS.md B-1); Pause and Resume end and start segments the same way (19 Oct 2026). The
// segments are stitched into one file on Post Review (stitch.ts).
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { MAX_DURATION_MS, MIN_DURATION_MS, RECORDINGS_DIR, type CameraFacing, type Recording, type RecordingSegment } from './types';

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
//
// A take is Record → (Pause → Resume)* → Stop, with flips anywhere in between (Nemat, 19 Oct 2026).
// Each stretch of recording is one segment; Pause ends the segment and keeps it, Resume starts the
// next one on the same camera, and Post Review stitches them (stitch.ts). Only recorded time counts:
// the timer, the ring, the 30-second limit and PR-Short all run on the segments' total, never on
// the time spent paused.
//
// Nothing recorded is lost to an interruption: the app going to the background, the camera ending
// a segment by itself (a call, the session interrupted), a camera that does not come back after a
// flip, or a segment the phone cannot keep all leave the take paused with every segment it has.
// The person then resumes, or stops and reviews what they have. Only Cancel (or the screen closing)
// deletes the segments.

/** A flip or a pause in the first half second of a segment is ignored: a segment that short may hold no frame. */
export const FLIP_MIN_SEGMENT_MS = 500;
export const PAUSE_MIN_SEGMENT_MS = FLIP_MIN_SEGMENT_MS;
/**
 * With less than this left of the 30 seconds, a flip is ignored (the take runs on to its limit) and a
 * paused take cannot resume (only Stop). Android's expo-camera takes whole seconds for the limit and
 * treats 0 as no limit, so a segment under a second cannot be given one.
 */
export const FLIP_MIN_REMAINING_MS = 1000;
export const RESUME_MIN_REMAINING_MS = FLIP_MIN_REMAINING_MS;
/** The other camera not ready in this long: the take pauses with the segments it has. */
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

/**
 * idle: before Record. recording: a segment is being recorded (or is being ended: see `paused`).
 * paused: between segments, by Pause or an interruption; Resume or Stop. flipping: the camera is
 * switching (during a take or while paused). done: the take has ended.
 */
export type TakePhase = 'idle' | 'recording' | 'paused' | 'flipping' | 'done';

/** Why the current segment is ending. A segment the camera ends by itself has no reason. */
type EndReason = 'flip' | 'pause' | 'stop' | 'limit' | 'interrupted';

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
  /** Something the screen shows changed (phase, facing, paused). The timer is read with elapsedMs(). */
  onChange: () => void;
  onFinish: (outcome: TakeOutcome) => void;
  /** A segment failed or was cut short by the camera and the take paused: the screen may restart the camera. */
  onInterrupted?: (error?: unknown) => void;
};

export type Take = {
  readonly phase: TakePhase;
  readonly facing: CameraFacing;
  readonly segments: readonly RecordingSegment[];
  /** Paused, or a pause (or an interruption) is ending the segment: nothing is being recorded. */
  readonly paused: boolean;
  start: () => void;
  /** Total recorded across segments, for the red timer and the ring. Paused time is never counted. */
  elapsedMs: () => number;
  /** Whether a flip now would be taken. */
  canFlip: () => boolean;
  flip: () => void;
  canPause: () => boolean;
  /** Ends the segment and keeps it; the take waits, paused. */
  pause: () => void;
  canResume: () => boolean;
  /** Starts the next segment on the current camera. */
  resume: () => void;
  /** Stop: the take ends with what it has. 'limit' when the 30 seconds are reached; 'interrupted' pauses. */
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
  // A flip started while recording records on the other camera once it is ready; one started
  // while paused (or interrupted on the way) stays paused.
  let recordAfterSwitch = false;

  const keptMs = () => totalDuration(segments);
  const remainingMs = () => MAX_DURATION_MS - keptMs();

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

  const enterPaused = () => {
    phase = 'paused';
    ending = null;
    endRequestedAt = null;
    deps.onChange();
  };

  const beginSegment = () => {
    segmentBudgetMs = remainingMs();
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
      flipCamera(true);
      return;
    }
    if (reason === 'stop' || reason === 'limit') {
      // A take stopped before 2 seconds often holds no usable data at all (Android's CameraX rejects
      // it; iOS can report no file): that is PR-Short, not a failed take.
      if (segments.length === 0 && reason === 'stop' && durationMs < MIN_DURATION_MS) {
        finish();
        return;
      }
      finish(segments.length === 0 ? error ?? (uri ? undefined : new Error('record_failed')) : undefined);
      return;
    }
    // The 30 seconds are used up (the camera's own limit ended it): the take is complete.
    if (reason === null && remainingMs() < RESUME_MIN_REMAINING_MS && segments.length > 0) {
      finish();
      return;
    }
    // Pause, an interruption, the camera ending the segment by itself, or a failed segment.
    // Nothing usable at all from the first segment, and no pause asked: a failed take, as before.
    if (segments.length === 0 && reason === null) {
      finish(error ?? (uri ? undefined : new Error('record_failed')));
      return;
    }
    enterPaused();
    if (reason !== 'pause' || error !== undefined) deps.onInterrupted?.(error);
  };

  const flipCamera = (thenRecord: boolean) => {
    phase = 'flipping';
    recordAfterSwitch = thenRecord;
    ending = null;
    endRequestedAt = null;
    const to = otherFacing(facing);
    facing = to;
    deps.onChange();
    const token = segmentToken;
    deps.switchCamera(to).then(
      () => {
        if (phase !== 'flipping' || token !== segmentToken) return;
        if (recordAfterSwitch && remainingMs() >= FLIP_MIN_REMAINING_MS) beginSegment();
        else if (recordAfterSwitch && segments.length > 0) finish();
        else enterPaused();
      },
      (e) => {
        if (phase !== 'flipping' || token !== segmentToken) return;
        console.warn('camera switch failed during a take; pausing with what it has', e);
        enterPaused();
        deps.onInterrupted?.(e);
      },
    );
  };

  const requestEnd = (reason: EndReason) => {
    // A stop (or the limit) asked while a flip or a pause is ending the segment wins: the take ends there.
    const overridable = ending === 'flip' || ending === 'pause' || ending === 'interrupted';
    if (ending !== null && !(overridable && (reason === 'stop' || reason === 'limit'))) {
      // Stop or Pause tapped again: ask the camera again. On iOS a stop that lands in the moment
      // before recording has really started is lost, and the take would otherwise run to its limit.
      if (reason === ending && (reason === 'stop' || reason === 'pause')) deps.stopRecording();
      return;
    }
    const first = ending === null;
    if (endRequestedAt === null) endRequestedAt = deps.now();
    ending = reason;
    if (first) deps.stopRecording();
    deps.onChange();
  };

  const segmentAgeMs = () => deps.now() - segmentStartedAt;

  const canFlip = () =>
    (phase === 'recording' && ending === null && segmentAgeMs() >= FLIP_MIN_SEGMENT_MS && remainingMs() - liveMs() >= FLIP_MIN_REMAINING_MS) ||
    phase === 'paused';

  const canPause = () => phase === 'recording' && ending === null && segmentAgeMs() >= PAUSE_MIN_SEGMENT_MS;

  const canResume = () => phase === 'paused' && remainingMs() >= RESUME_MIN_REMAINING_MS;

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
    get paused() {
      return phase === 'paused' || (phase === 'recording' && (ending === 'pause' || ending === 'interrupted')) || (phase === 'flipping' && !recordAfterSwitch);
    },
    start() {
      if (phase !== 'idle') return;
      beginSegment();
    },
    elapsedMs,
    canFlip,
    flip() {
      if (!canFlip()) return;
      if (phase === 'paused') flipCamera(false);
      else requestEnd('flip');
    },
    canPause,
    pause() {
      if (canPause()) requestEnd('pause');
      else if (phase === 'recording' && ending === 'pause') requestEnd('pause');
    },
    canResume,
    resume() {
      if (canResume()) beginSegment();
    },
    stop(reason = 'stop') {
      if (phase === 'recording') {
        if (reason === 'interrupted') {
          if (ending === null) requestEnd('interrupted');
          // Already ending for a flip: stay paused on the other camera instead of recording there.
          else if (ending === 'flip') recordAfterSwitch = false;
        } else requestEnd(reason);
      } else if (phase === 'flipping') {
        if (reason === 'interrupted') {
          recordAfterSwitch = false;
          deps.onChange();
        } else finish();
      } else if (phase === 'paused' && reason !== 'interrupted') finish();
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
