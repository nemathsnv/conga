// Stitching a take's segments into the one file that is reviewed and uploaded (docs/BLOCKERS.md B-1).
//
// Post Review stitches once, then hands Post a recording with exactly one segment: the stitched
// file. Everything after Review (the upload pipeline, the pending post kept on the phone, Retry,
// the Upload failed banner's thumbnail) keeps working on one file, as it did before stitching.
// The segment files are deleted only once the stitched file is in the recordings folder.
import { stitch as nativeStitch } from '../../modules/video-stitcher';
import { deleteFileQuietly, keepFile } from './recorder';
import type { Recording } from './types';

export type StitchErrorCode =
  /** The native module is not in this build (a build made before it was added). */
  | 'stitch_unavailable'
  /** A segment is missing or unreadable. */
  | 'stitch_input'
  /** Joining or encoding failed. */
  | 'stitch_failed'
  /** The recording was discarded while it was being stitched. */
  | 'stitch_cancelled';

/** `message` is the code, like the other errors the posting code reads by message. */
export class StitchError extends Error {
  readonly code: StitchErrorCode;
  readonly detail?: string;
  constructor(code: StitchErrorCode, detail?: string) {
    super(code);
    this.name = 'StitchError';
    this.code = code;
    this.detail = detail;
  }
}

/** Maps what the native module rejects with (ERR_STITCH_*) to a StitchError. */
export function toStitchError(e: unknown): StitchError {
  if (e instanceof StitchError) return e;
  const code = (e as { code?: unknown } | null)?.code;
  const detail = e instanceof Error ? e.message : typeof e === 'string' ? e : undefined;
  if (code === 'ERR_STITCH_UNAVAILABLE') return new StitchError('stitch_unavailable', detail);
  if (code === 'ERR_STITCH_INPUT') return new StitchError('stitch_input', detail);
  return new StitchError('stitch_failed', detail);
}

export type StitchDeps = {
  stitch: (uris: string[]) => Promise<string>;
  /** Moves the stitched file into the recordings folder; returns its new URI. */
  keep: (uri: string) => string;
  deleteFile: (uri: string) => void;
};

const defaultDeps: StitchDeps = { stitch: nativeStitch, keep: keepFile, deleteFile: deleteFileQuietly };

/** One stitch per recording: Review starts it, Post waits for the same one. Failed ones are retried. */
const stitches = new Map<string, Promise<Recording>>();
const abandoned = new Set<string>();

export function needsStitching(recording: Recording): boolean {
  return recording.segments.length > 1;
}

/**
 * The recording with its segments stitched into one file. A one-segment recording is returned as it
 * is. Rejects with a StitchError; then the segments are untouched and it can be tried again.
 */
export function ensureStitched(recording: Recording, deps: StitchDeps = defaultDeps): Promise<Recording> {
  if (!needsStitching(recording)) return Promise.resolve(recording);
  const running = stitches.get(recording.id);
  if (running) return running;
  abandoned.delete(recording.id);
  const job = runStitch(recording, deps);
  stitches.set(recording.id, job);
  job.catch(() => {
    if (stitches.get(recording.id) === job) stitches.delete(recording.id);
  });
  return job;
}

async function runStitch(recording: Recording, deps: StitchDeps): Promise<Recording> {
  let output: string;
  try {
    output = await deps.stitch(recording.segments.map((s) => s.uri));
  } catch (e) {
    throw toStitchError(e);
  }
  if (abandoned.has(recording.id)) {
    abandoned.delete(recording.id);
    deps.deleteFile(output);
    throw new StitchError('stitch_cancelled');
  }
  let kept: string;
  try {
    kept = deps.keep(output);
  } catch (e) {
    deps.deleteFile(output);
    throw new StitchError('stitch_failed', e instanceof Error ? e.message : String(e));
  }
  // The stitched file exists in the recordings folder: only now are the segments deleted.
  for (const segment of recording.segments) deps.deleteFile(segment.uri);
  return {
    ...recording,
    segments: [{ uri: kept, facing: recording.segments[0].facing, durationMs: recording.durationMs }],
  };
}

/**
 * The recording was discarded (Discard, Re-record) while it may be stitching: a stitch still running
 * deletes its output when it ends, and none is kept for it.
 */
export function abandonStitch(recording: Recording): void {
  if (!stitches.has(recording.id)) return;
  abandoned.add(recording.id);
  stitches.delete(recording.id);
}

/** For tests. */
export function resetStitchesForTests(): void {
  stitches.clear();
  abandoned.clear();
}
