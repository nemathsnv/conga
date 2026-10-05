export type Facing = 'front' | 'back';

export interface DeviceInfo {
  platform: string;
  model: string | null;
  os: string | null;
  manufacturer: string | null;
}

export interface NetworkInfo {
  type: string; // WIFI | CELLULAR | NONE | UNKNOWN ...
  cellular: string | null; // 2G/3G/4G/5G/unknown
  carrier: string | null;
  isoCountry: string | null;
}

export interface RecordingMeta {
  facing: Facing;
  torch: boolean;
  zoom: number;
  videoQuality: string;
  codec: string | null;
  lens: string | null;
}

export interface Run {
  runId: string;
  label: string;
  createdAt: number;
  fileUri: string | null; // null once deleted
  fileBytes: number | null;
  // measured on the local preview
  durationS: number | null;
  width: number | null;
  height: number | null;
  bitrateBps: number | null; // from file size / duration if the track doesn't report it
  trackBitrateBps: number | null;
  frameRate: number | null;
  recording: RecordingMeta;
  // upload
  uploadId: string | null;
  uploadAttempts: number;
  uploadStartedAt: number | null;
  uploadFinishedAt: number | null;
  uploadMs: number | null;
  uploadError: string | null;
  uploadNetwork: NetworkInfo | null;
  // mux processing
  assetId: string | null;
  playbackId: string | null;
  assetReadyAt: number | null;
  processingMs: number | null;
  muxMaxResolution: string | null;
  muxResolutionTier: string | null;
  status: 'recorded' | 'uploading' | 'upload_failed' | 'processing' | 'ready' | 'errored';
}

export type LogEvent =
  | 'app_open'
  | 'recorded'
  | 'discarded'
  | 'too_short'
  | 'preview_metrics'
  | 'upload_started'
  | 'upload_finished'
  | 'upload_failed'
  | 'upload_retry'
  | 'asset_ready'
  | 'asset_errored'
  | 'playback_start'
  | 'playback_first_frame'
  | 'playback_stall'
  | 'playback_stall_end'
  | 'playback_loop'
  | 'playback_error'
  | 'playback_end'
  | 'sequence_start'
  | 'sequence_end'
  | 'camera_capability'
  | 'note';

export interface LogLine {
  ts: number;
  iso: string;
  event: LogEvent;
  runId?: string;
  device: DeviceInfo;
  network?: NetworkInfo;
  data?: Record<string, unknown>;
}
