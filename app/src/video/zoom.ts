// Zoom on the record screen (founder iPhone test, 19 Oct: pinch and the zoom button during a take).
// Pure: the screen keeps the factor people see ("2×") and hands expo-camera its 0-to-1 `zoom`.
// - iOS: expo-camera sets videoZoomFactor = max ^ zoom on the wide-angle camera, `max` being that
//   camera's videoMaxZoomFactor for its format (modules/camera-zoom reads it). Without it (a build
//   without the module, the simulator) zoom stays at 1×.
// - Android: CameraX linear zoom; its range is not read (Android has never run, docs/BLOCKERS.md),
//   so an assumed range is used and the shown factor is approximate there.

export type ZoomRange = { max: number; curve: 'exponential' | 'linear' };

/** Digital zoom past this is not worth recording; the camera's own limit can be lower. */
export const ZOOM_CAP = 10;
/** The zoom button switches between 1× and this. */
export const ZOOM_STEP = 2;
const ANDROID_ASSUMED_MAX = 8;

export function zoomRangeFor(platform: string, deviceMax: number | null): ZoomRange | null {
  if (platform === 'android') return { max: ANDROID_ASSUMED_MAX, curve: 'linear' };
  if (!deviceMax || deviceMax <= 1) return null;
  return { max: deviceMax, curve: 'exponential' };
}

/** The largest factor offered: the camera's limit, never past ZOOM_CAP. */
export function usableMax(range: ZoomRange | null): number {
  return range ? Math.min(range.max, ZOOM_CAP) : 1;
}

export function clampFactor(factor: number, range: ZoomRange | null): number {
  if (!Number.isFinite(factor)) return 1;
  return Math.min(Math.max(factor, 1), usableMax(range));
}

/** expo-camera's `zoom` (0 to 1) for a factor. */
export function cameraZoom(factor: number, range: ZoomRange | null): number {
  if (!range) return 0;
  const f = clampFactor(factor, range);
  const z = range.curve === 'exponential' ? Math.log(f) / Math.log(range.max) : (f - 1) / (range.max - 1);
  return Math.min(Math.max(z, 0), 1);
}

/** Pinch: the factor at the start, scaled by how far the fingers moved apart. */
export function pinchFactor(startFactor: number, startDistance: number, distance: number, range: ZoomRange | null): number {
  if (startDistance <= 0) return clampFactor(startFactor, range);
  return clampFactor(startFactor * (distance / startDistance), range);
}

/** The zoom button: 1× goes to 2× (or the camera's limit), anything else back to 1×. */
export function toggledFactor(current: number, range: ZoomRange | null): number {
  if (current >= 1.05) return 1;
  return clampFactor(ZOOM_STEP, range);
}

/** As the iPhone camera shows it: "1×", "2×", "1.4×". */
export function formatZoom(factor: number): string {
  const rounded = Math.round(factor * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}×` : `${rounded.toFixed(1)}×`;
}
