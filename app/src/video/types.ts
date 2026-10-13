// The video layer's data model. Product code talks to these types and the functions in
// this folder, never to expo-camera, expo-video or Mux directly, so Android-specific
// behaviour can change later without touching screens.

export type CameraFacing = 'front' | 'back';

/**
 * One continuous take from one camera. A recording is a list of segments so a camera flip
 * while recording records a new segment and the list is stitched into one clip before upload
 * (spike/REPORT.md Section 9; Nemat, 6 Oct). Stitching is tracked as docs/BLOCKERS.md B-1; until
 * it lands the recorder never produces more than one segment and upload refuses a longer list.
 */
export type RecordingSegment = {
  uri: string;
  facing: CameraFacing;
  durationMs: number;
};

export type Recording = {
  id: string;
  /** One per recording: sent with every attempt to post it, so a post whose answer was lost is
   *  found again instead of made twice (20261013000200). Missing on recordings stored by older builds. */
  submissionId?: string;
  promptId: string;
  segments: RecordingSegment[];
  /** Total length across segments. */
  durationMs: number;
  createdAt: number;
};

/** Spec limits (SPEC.md Section 6). */
export const MIN_DURATION_MS = 2000;
export const MAX_DURATION_MS = 30000;

/** Phase 1 conditions carried into production (spike/REPORT.md Section 9). */
export const RECORDING_SETTINGS = {
  codec: 'avc1' as const,
  videoBitrate: 2_500_000,
  videoQuality: '1080p' as const,
  /** Native 1x on the wide camera; the spec allows only 1x. */
  zoom: 0,
  /** expo-camera drops the torch when recording starts; re-apply it this long after start. */
  torchReapplyMs: 700,
};
