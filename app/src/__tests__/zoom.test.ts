// Record screen zoom (video/zoom.ts): the factor people see and expo-camera's 0-to-1 value.
import { cameraZoom, clampFactor, formatZoom, pinchFactor, toggledFactor, usableMax, zoomRangeFor, ZOOM_CAP } from '@/video/zoom';

const ios = zoomRangeFor('ios', 123.75)!;

describe('zoom range', () => {
  test('iOS uses the camera\'s own limit, capped', () => {
    expect(ios).toEqual({ max: 123.75, curve: 'exponential' });
    expect(usableMax(ios)).toBe(ZOOM_CAP);
    expect(usableMax(zoomRangeFor('ios', 4))).toBe(4);
  });

  test('iOS without the native module or a camera (simulator): no zoom, the factor stays 1×', () => {
    expect(zoomRangeFor('ios', null)).toBeNull();
    expect(cameraZoom(3, null)).toBe(0);
    expect(clampFactor(3, null)).toBe(1);
    expect(toggledFactor(1, null)).toBe(1);
  });
});

describe('expo-camera zoom for a factor', () => {
  test('iOS is exponential (videoZoomFactor = max ^ zoom): 1× is 0, the factor comes back exactly', () => {
    expect(cameraZoom(1, ios)).toBe(0);
    for (const f of [1.5, 2, 5, 10]) expect(Math.pow(ios.max, cameraZoom(f, ios))).toBeCloseTo(f, 6);
  });

  test('never past the cap or below 1×', () => {
    expect(Math.pow(ios.max, cameraZoom(50, ios))).toBeCloseTo(ZOOM_CAP, 6);
    expect(cameraZoom(0.5, ios)).toBe(0);
  });

  test('Android is linear over its range', () => {
    const android = zoomRangeFor('android', null)!;
    expect(cameraZoom(1, android)).toBe(0);
    expect(cameraZoom(android.max, android)).toBe(1);
  });
});

describe('pinch and the zoom button', () => {
  test('fingers twice as far apart double the factor from where the pinch started', () => {
    expect(pinchFactor(1, 100, 200, ios)).toBe(2);
    expect(pinchFactor(2, 100, 150, ios)).toBe(3);
    expect(pinchFactor(3, 100, 50, ios)).toBe(1.5);
  });

  test('a pinch stops at 1× and at the limit', () => {
    expect(pinchFactor(1, 100, 20, ios)).toBe(1);
    expect(pinchFactor(5, 100, 1000, ios)).toBe(ZOOM_CAP);
    expect(pinchFactor(2, 0, 100, ios)).toBe(2);
  });

  test('the button goes 1× → 2× → 1×, and from any pinched factor back to 1×', () => {
    expect(toggledFactor(1, ios)).toBe(2);
    expect(toggledFactor(2, ios)).toBe(1);
    expect(toggledFactor(4.3, ios)).toBe(1);
    expect(toggledFactor(1, zoomRangeFor('ios', 1.6))).toBe(1.6);
  });

  test('the label reads like the iPhone camera', () => {
    expect(formatZoom(1)).toBe('1×');
    expect(formatZoom(2)).toBe('2×');
    expect(formatZoom(1.43)).toBe('1.4×');
    expect(formatZoom(9.97)).toBe('10×');
  });
});
