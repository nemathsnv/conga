// Pure rule for closing the safety sheets (safety.tsx), Jest-tested.

export type SafetyStage = 'menu' | 'report' | 'reported' | 'block' | 'delete' | 'comment';

/**
 * What closing the sheet does (the backdrop, Android Back, Cancel): 'back' returns to the screen
 * under it; 'home' does what Done on SF-Reported does. Once something was reported, the screen
 * under the sheet still shows it (a response playing), though "You won't see this … again", so
 * every way out after a report goes Home: SF-Reported itself, and SF-Block opened from it.
 */
export function closeAction(stage: SafetyStage, reported: boolean): 'back' | 'home' {
  return stage === 'reported' || reported ? 'home' : 'back';
}
