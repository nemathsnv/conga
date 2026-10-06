import type { InviteStatus } from './api';

/**
 * Inline message under the code field (W-Invalid). The board only draws the
 * "already used" case; the not-found and expired lines follow its pattern and
 * are flagged for approval in the phase 2 report.
 */
export function inviteErrorCopy(status: InviteStatus, inviterFirstName: string | null | undefined): string | null {
  const ask = inviterFirstName ? `Ask ${inviterFirstName} for another one` : 'Ask for another one';
  switch (status) {
    case 'used':
      return `This invite has already been used. ${ask}, or join the waitlist.`;
    case 'expired':
      return `This invite has expired. ${ask}, or join the waitlist.`;
    case 'not_found':
      return "That code didn't match an invite. Check it, or join the waitlist.";
    default:
      return null;
  }
}
