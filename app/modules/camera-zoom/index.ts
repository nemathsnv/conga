// Expo local module (iOS): the zoom range of the camera the record screen uses. See
// ios/CameraZoomModule.swift. Picked up by expo-modules-autolinking from app/modules.
import { requireOptionalNativeModule } from 'expo';

type CameraZoomNative = {
  maxZoomFactor(facing: 'front' | 'back'): number | null;
};

const native = requireOptionalNativeModule<CameraZoomNative>('CameraZoom');

/** The camera's largest zoom factor for its current format, or null when this build cannot tell
 *  (Android, a build made before this module, a simulator with no camera). */
export function maxZoomFactor(facing: 'front' | 'back'): number | null {
  try {
    const max = native?.maxZoomFactor(facing) ?? null;
    return max && Number.isFinite(max) && max > 1 ? max : null;
  } catch {
    return null;
  }
}
