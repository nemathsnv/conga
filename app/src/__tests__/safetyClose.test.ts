import { closeAction } from '@/ui/safetyClose';

describe('closeAction (closing the safety sheets)', () => {
  it('SF-Reported: the backdrop and Android Back do what Done does (Home), not back to the item', () => {
    expect(closeAction('reported', true)).toBe('home');
    expect(closeAction('reported', false)).toBe('home');
  });

  it('SF-Block opened from SF-Reported also leaves Home: the item under it was reported', () => {
    expect(closeAction('block', true)).toBe('home');
  });

  it('before anything is reported, closing returns to the screen under the sheet', () => {
    expect(closeAction('menu', false)).toBe('back');
    expect(closeAction('report', false)).toBe('back');
    expect(closeAction('block', false)).toBe('back');
    expect(closeAction('delete', false)).toBe('back');
    expect(closeAction('comment', false)).toBe('back');
  });
});
