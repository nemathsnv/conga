// Recording helpers around expo-camera. The screen owns the CameraView; these functions
// own the file handling and the limits so the camera library can be swapped later.
import { Directory, File, Paths } from 'expo-file-system';

import type { CameraFacing, Recording, RecordingSegment } from './types';

const RECORDINGS_DIR = 'recordings';

function recordingsDir(): Directory {
  const dir = new Directory(Paths.document, RECORDINGS_DIR);
  if (!dir.exists) dir.create();
  return dir;
}

/** Moves a just-recorded file out of the cache so it survives until it posts (Section 19). */
export function keepSegment(tempUri: string, facing: CameraFacing, durationMs: number): RecordingSegment {
  const src = new File(tempUri);
  const dest = new File(recordingsDir(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`);
  src.move(dest);
  return { uri: dest.uri, facing, durationMs };
}

export function makeRecording(promptId: string, segments: RecordingSegment[]): Recording {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    promptId,
    segments,
    durationMs: segments.reduce((sum, s) => sum + s.durationMs, 0),
    createdAt: Date.now(),
  };
}

export { clampDuration, formatTimer, isTooShort } from './limits';
