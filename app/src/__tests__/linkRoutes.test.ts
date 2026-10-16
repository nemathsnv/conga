import { hasScreenBeneath, promptLinkTarget, readableVideo, systemPathRedirect, videoLinkTarget } from '@/lib/links';

describe('readableVideo (get_video answers)', () => {
  const liveResponse = { id: 'v1', status: 'live', kind: 'response' as const, prompt_id: 'p1' };
  it('treats a video card as readable even though it has a status of its own', () => {
    expect(readableVideo(liveResponse)).toBe(liveResponse);
    expect(readableVideo({ ...liveResponse, status: 'processing' })).not.toBeNull();
  });
  it('treats only { status: "unavailable" } as unreadable', () => {
    expect(readableVideo({ status: 'unavailable' })).toBeNull();
    expect(readableVideo(null)).toBeNull();
    expect(readableVideo(undefined)).toBeNull();
  });
  it('treats an answer that is not a video card as unreadable', () => {
    expect(readableVideo({ status: 'live' })).toBeNull();
    expect(readableVideo({ status: 'live', kind: 'comment', prompt_id: 'p1' })).toBeNull();
  });
  it('sends an r/ link to a live response to the response player (the bug: every link went to the video reply player)', () => {
    expect(videoLinkTarget('v1', readableVideo(liveResponse))).toEqual({ pathname: '/player/[promptId]', params: { promptId: 'p1', entry: 'v1' } });
  });
  it('sends an r/ link to a live video reply to the video reply player, and an unavailable one there too', () => {
    expect(videoLinkTarget('v2', readableVideo({ id: 'v2', status: 'live', kind: 'reply' as const, prompt_id: 'p1' }))).toEqual({ pathname: '/reply/[id]', params: { id: 'v2' } });
    expect(videoLinkTarget('v3', readableVideo({ status: 'unavailable' }))).toEqual({ pathname: '/reply/[id]', params: { id: 'v3' } });
  });
});

describe('promptLinkTarget (p/ opens the prompt first response)', () => {
  it('starts the player on the first response in its order', () => {
    expect(promptLinkTarget('p1', [{ id: 'r9' }, { id: 'r2' }])).toEqual({ pathname: '/player/[promptId]', params: { promptId: 'p1', entry: 'r9' } });
  });
  it('opens the empty prompt when there are no responses', () => {
    expect(promptLinkTarget('p1', [])).toEqual({ pathname: '/player/[promptId]', params: { promptId: 'p1' } });
  });
});

describe('systemPathRedirect (unknown links go Home)', () => {
  it('leaves links to the app screens alone', () => {
    for (const path of ['shortcut://r/abc', 'shortcut://p/abc', 'shortcut://u/sofia', 'shortcut://i/TEST-OK1', '/player/abc?entry=1', 'shortcut://', '/', 'https://shortcut.app/r/abc', 'exp://192.168.1.4:8081/--/p/abc', 'shortcut://settings/places', '/(tabs)/activity', '/a/xyz']) {
      expect(systemPathRedirect(path)).toBe(path);
    }
  });
  it('sends a link the app has no screen for to Home (the bug: a blank grey screen)', () => {
    for (const path of ['shortcut://nothing-here', '/nothing-here', 'shortcut://nothing/here?x=1', 'https://shortcut.app/pricing', 'exp+shortcut://expo-development-client/?url=http%3A%2F%2F192.168.1.4%3A8081', 'shortcut://auth/callback#access_token=x']) {
      expect(systemPathRedirect(path)).toBe('/');
    }
  });
});

describe('hasScreenBeneath (Back from a screen a link opened)', () => {
  it('goes back when there is a screen under it, and Home when it is the only one', () => {
    expect(hasScreenBeneath(2)).toBe(true);
    expect(hasScreenBeneath(1)).toBe(false);
    expect(hasScreenBeneath(0)).toBe(false);
  });
});
