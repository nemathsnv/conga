import { inviteErrorCopy } from '@/lib/inviteCopy';

const approved = 'This invite has already been used. Ask Maya for another one, or join the waitlist.';

describe('inviteErrorCopy (W-Invalid: one approved line for every failed code)', () => {
  it('uses the approved copy for a used code', () => {
    expect(inviteErrorCopy('used', 'Maya')).toBe(approved);
  });
  it('uses the same line for expired and not-found codes', () => {
    expect(inviteErrorCopy('expired', 'Maya')).toBe(approved);
    expect(inviteErrorCopy('not_found', 'Maya')).toBe(approved);
  });
  it('drops the name clause when no inviter is known', () => {
    expect(inviteErrorCopy('used', null)).toBe('This invite has already been used. Join the waitlist.');
  });
  it('returns nothing for a valid code', () => {
    expect(inviteErrorCopy('valid', 'Putu')).toBeNull();
    expect(inviteErrorCopy('already_in', null)).toBeNull();
  });
});
