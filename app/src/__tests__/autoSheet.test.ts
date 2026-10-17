import { autoSheet, endsToNext } from '@/ui/playbackRules';

const live = { kind: 'response', responseId: 'v1' };

describe('autoSheet (the sheet the player opens by itself over its entry)', () => {
  it('opens Comments over the live entry (a comment in Activity, a comment notification)', () => {
    expect(autoSheet({ entry: 'v1', openComments: '1', openReplies: undefined, firstPage: live })).toEqual({ pathname: '/comments/[responseId]', params: { responseId: 'v1' } });
  });

  it('opens Replies over the live entry (a rail icon on Home)', () => {
    expect(autoSheet({ entry: 'v1', openComments: undefined, openReplies: '1', firstPage: live })).toEqual({ pathname: '/replies/[rootId]', params: { rootId: 'v1' } });
  });

  it('opens nothing over a deleted or removed entry (X-Unavailable is the first page)', () => {
    expect(autoSheet({ entry: 'v1', openComments: '1', openReplies: undefined, firstPage: { kind: 'unavailable' } })).toBeNull();
    expect(autoSheet({ entry: 'v1', openComments: undefined, openReplies: '1', firstPage: { kind: 'unavailable' } })).toBeNull();
  });

  it('opens nothing when the first page is another response, the end card or Z-Empty', () => {
    expect(autoSheet({ entry: 'v1', openComments: '1', openReplies: undefined, firstPage: { kind: 'response', responseId: 'v2' } })).toBeNull();
    expect(autoSheet({ entry: 'v1', openComments: '1', openReplies: undefined, firstPage: { kind: 'end' } })).toBeNull();
    expect(autoSheet({ entry: 'v1', openComments: '1', openReplies: undefined, firstPage: { kind: 'empty' } })).toBeNull();
    expect(autoSheet({ entry: 'v1', openComments: '1', openReplies: undefined, firstPage: undefined })).toBeNull();
  });

  it('opens nothing without an entry or without a sheet asked for', () => {
    expect(autoSheet({ entry: undefined, openComments: '1', openReplies: undefined, firstPage: live })).toBeNull();
    expect(autoSheet({ entry: 'v1', openComments: undefined, openReplies: undefined, firstPage: live })).toBeNull();
  });
});

describe('endsToNext', () => {
  it('moves on at the end only while no Comments sheet is over the response', () => {
    expect(endsToNext(true)).toBe(true);
    expect(endsToNext(false)).toBe(false);
  });
});
