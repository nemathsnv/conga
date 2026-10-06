import { inviteErrorCopy } from '@/lib/inviteCopy';

describe('inviteErrorCopy (W-Invalid)', () => {
  it('uses the approved copy for a used code', () => {
    expect(inviteErrorCopy('used', 'Maya')).toBe('This invite has already been used. Ask Maya for another one, or join the waitlist.');
  });
  it('has lines for expired and not found', () => {
    expect(inviteErrorCopy('expired', 'Maya')).toContain('expired');
    expect(inviteErrorCopy('not_found', null)).toContain('join the waitlist');
  });
  it('copes with a team code that has no inviter', () => {
    expect(inviteErrorCopy('used', null)).toBe('This invite has already been used. Ask for another one, or join the waitlist.');
  });
  it('returns nothing for a valid code', () => {
    expect(inviteErrorCopy('valid', 'Putu')).toBeNull();
  });
});
