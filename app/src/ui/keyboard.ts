// How every KeyboardAvoidingView lifts its content above the keyboard, on both platforms.
//
// Android (emulator, 2 Nov 2026): the app draws edge to edge (edgeToEdgeEnabled in the Android
// project), so the window no longer shrinks for the keyboard (adjustResize) and nothing moved: the
// keyboard covered the comment field, the email screen's Continue and the caption on Post Review.
// React Native still reports the keyboard's frame on Android, so the same padding as on iOS works.
// The padding only moves content laid out in the flow: a bar at the bottom of a keyboard-avoiding
// view sits there with marginTop 'auto', never position 'absolute' (as confirm-email's footer).
import { useEffect, type RefObject } from 'react';
import { Keyboard, type TextInput } from 'react-native';

export const KEYBOARD_BEHAVIOR = 'padding' as const;

/**
 * Ends the editing of `input` when the keyboard goes away. Android's Back (or the keyboard's own hide
 * key) hides the keyboard but leaves the field focused, so a screen that changes while a field is
 * edited never changed back (Post Review hid Post and Re-record for good, emulator, 2 Nov 2026). On iOS
 * the keyboard only hides when the field is left, so this changes nothing there.
 */
export function useBlurOnKeyboardHide(input: RefObject<TextInput | null>): void {
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => input.current?.blur());
    return () => sub.remove();
  }, [input]);
}
