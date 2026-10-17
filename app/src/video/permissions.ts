// What the record screen does with the camera or microphone permission (R-Record, A-Camera, A-Mic;
// SPEC.md Section 6: "access off → A-Camera/A-Mic").

export type PermissionLike = { granted: boolean; canAskAgain: boolean; status: string };

/**
 * 'ask': show the system prompt. 'off': A-Camera or A-Mic. 'waiting': not read yet.
 * Only a permission never asked for ('undetermined') is asked: Android keeps canAskAgain true after
 * the first "Don't allow", so asking whenever it is true would put the prompt straight back up.
 * A refusal is A-Camera/A-Mic, whose Open Settings works on both platforms.
 */
export function permissionStep(permission: PermissionLike | null | undefined): 'granted' | 'ask' | 'off' | 'waiting' {
  if (!permission) return 'waiting';
  if (permission.granted) return 'granted';
  if (permission.status === 'undetermined' && permission.canAskAgain) return 'ask';
  if (permission.status === 'undetermined') return 'waiting';
  return 'off';
}
