// The video layer's data model. Product code talks to these types and the functions in
// this folder, never to expo-camera, expo-video or Mux directly, so Android-specific
// behaviour can change later without touching screens.
import { Platform } from 'react-native';

export type CameraFacing = 'front' | 'back';

/**
 * One continuous stretch of a take from one camera. A recording is a list of segments because a
 * camera flip while recording ends expo-camera's recording: the recorder keeps the segment and
 * starts the next on the other camera (spike/REPORT.md Section 9; Nemat, 6 Oct; docs/BLOCKERS.md
 * B-1). Post Review stitches several segments into one file (stitch.ts), so a recording handed to
 * Post always has exactly one segment, and upload refuses a longer list (`stitching_required`).
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

/** The folder under the app's Documents folder that keeps recordings until they post (recorder.ts). */
export const RECORDINGS_DIR = 'recordings';

/** Spec limits (SPEC.md Section 6). */
export const MIN_DURATION_MS = 2000;
export const MAX_DURATION_MS = 30000;

/** Phase 1 conditions carried into production (spike/REPORT.md Section 9). */
export const RECORDING_SETTINGS = {
  codec: 'avc1' as const,
  videoBitrate: 2_500_000,
  /**
   * iPhone 1080p. Android 720p (Nemat, 12 Nov 2026; docs/release/ANDROID-DEVICE-STREAMING-12NOV.md):
   * Android raises a 1080p variable-bitrate encode to its minimum-quality floor, so a Galaxy A15 wrote
   * 4.7 Mbps whatever was asked; at 720p it wrote 3.0 Mbps, a third smaller to upload.
   */
  videoQuality: Platform.OS === 'android' ? ('720p' as const) : ('1080p' as const),
  /** Native 1x on the wide camera; the spec allows only 1x. */
  zoom: 0,
  /** expo-camera drops the torch when recording starts; re-apply it this long after start. */
  torchReapplyMs: 700,
};
