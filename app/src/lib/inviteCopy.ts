import type { InviteStatus } from './api';

/**
 * Inline message under the code field (W-Invalid). The board draws one line and the canvas
 * note says a code that is not found, expired or already used gets the "same inline error",
 * so the approved sentence is used for all three. When the code has no known inviter (a team
 * code, or a code that does not exist) the "Ask … for another one" clause has no name to fill
 * and is left out; that shortened line is not on a board and is flagged in the phase report.
 */
export function inviteErrorCopy(status: InviteStatus, inviterFirstName: string | null | undefined): string | null {
  if (status === 'valid' || status === 'already_in') return null;
  if (inviterFirstName) {
    return `This invite has already been used. Ask ${inviterFirstName} for another one, or join the waitlist.`;
  }
  return 'This invite has already been used. Join the waitlist.';
}
