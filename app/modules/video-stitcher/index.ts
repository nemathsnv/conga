// Expo local module: joins the segments of a take (one per camera, docs/BLOCKERS.md B-1) into one
// H.264/AAC MP4 at the recording settings. iOS: AVFoundation. Android: Media3 Transformer.
// Picked up by expo-modules-autolinking from app/modules (no npm dependency).
import { requireOptionalNativeModule } from 'expo';

type VideoStitcherNative = {
  stitch(uris: string[]): Promise<string>;
};

const native = requireOptionalNativeModule<VideoStitcherNative>('VideoStitcher');

/** Whether this build has the native module (false in a build made before it was added). */
export function isAvailable(): boolean {
  return native != null;
}

/**
 * Stitches the files, in order, into one new MP4 in the app's cache and resolves with its file URI.
 * The inputs are not changed or deleted. Rejects with code ERR_STITCH_INPUT when a segment is
 * missing or unreadable, ERR_STITCH_EXPORT when encoding fails, and ERR_STITCH_UNAVAILABLE when
 * the native module is not in this build. Never resolves with a partial file.
 */
export async function stitch(uris: string[]): Promise<string> {
  if (!native) {
    const error = new Error('The video stitcher is not in this build') as Error & { code: string };
    error.code = 'ERR_STITCH_UNAVAILABLE';
    throw error;
  }
  return native.stitch(uris);
}
