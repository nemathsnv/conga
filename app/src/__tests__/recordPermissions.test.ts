// R-Record's camera and microphone prompts (permissionStep): the system prompt once, then A-Camera/A-Mic.
import { permissionStep } from '@/video/permissions';

const p = (granted: boolean, canAskAgain: boolean, status: string) => ({ granted, canAskAgain, status });

test('not read yet: wait', () => {
  expect(permissionStep(null)).toBe('waiting');
  expect(permissionStep(undefined)).toBe('waiting');
});

test('granted', () => {
  expect(permissionStep(p(true, true, 'granted'))).toBe('granted');
});

test('never asked: ask', () => {
  expect(permissionStep(p(false, true, 'undetermined'))).toBe('ask');
});

test('Android after one "Don\'t allow" (canAskAgain still true): A-Camera/A-Mic, not a second prompt', () => {
  expect(permissionStep(p(false, true, 'denied'))).toBe('off');
});

test('iOS denied, or Android "don\'t ask again": off', () => {
  expect(permissionStep(p(false, false, 'denied'))).toBe('off');
});
