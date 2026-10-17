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
    for (const path of ['shortcut://r/abc', 'shortcut://p/abc', 'shortcut://u/sofia', 'shortcut://i/TEST-OK1', '/player/abc?entry=1', 'shortcut://', '/', 'https://conga.churntech.com/r/abc', 'exp://192.168.1.4:8081/--/p/abc', 'shortcut://settings/places', '/(tabs)/activity', '/a/xyz']) {
      expect(systemPathRedirect(path)).toBe(path);
    }
  });
  it('sends a link the app has no screen for to Home (the bug: a blank grey screen)', () => {
    for (const path of ['shortcut://nothing-here', '/nothing-here', 'shortcut://nothing/here?x=1', 'https://conga.churntech.com/pricing', 'exp+shortcut://expo-development-client/?url=http%3A%2F%2F192.168.1.4%3A8081', 'shortcut://auth/callback#access_token=x']) {
      expect(systemPathRedirect(path)).toBe('/(tabs)');
    }
  });
});

describe('hasScreenBeneath (Back from a screen a link opened)', () => {
  // Shapes logged from useRootNavigationState() on the iOS simulator (16 Oct 2026).
  const pushedFromHome = { type: 'stack', index: 0, routes: [{ name: '__root', state: { type: 'stack', index: 1, routes: [{ name: '(tabs)' }, { name: 'profile/[id]' }] } }] };
  const openedByLinkAtLaunch = { type: 'stack', index: 0, routes: [{ name: '__root', state: { type: 'stack', index: 0, routes: [{ name: 'profile/[id]' }] } }] };

  it('sees the screen beneath a pushed screen, though the root wrapper has one route', () => {
    expect(hasScreenBeneath(pushedFromHome)).toBe(true);
  });
  it('sees nothing beneath a screen a link opened at launch: Back goes Home', () => {
    expect(hasScreenBeneath(openedByLinkAtLaunch)).toBe(false);
  });
  it('a push chain inside the stack (player, then comments) still pops one', () => {
    const chain = { type: 'stack', index: 0, routes: [{ name: '__root', state: { type: 'stack', index: 2, routes: [{ name: '(tabs)' }, { name: 'player/[promptId]' }, { name: 'comments/[responseId]' }] } }] };
    expect(hasScreenBeneath(chain)).toBe(true);
  });
  it('a link-opened screen with a second screen pushed on it has one beneath', () => {
    const linkThenPush = { type: 'stack', index: 0, routes: [{ name: '__root', state: { type: 'stack', index: 1, routes: [{ name: 'profile/[id]' }, { name: 'player/[promptId]' }] } }] };
    expect(hasScreenBeneath(linkThenPush)).toBe(true);
  });
  it('tabs do not count as screens beneath (Back does not switch tabs)', () => {
    const onSecondTab = { type: 'stack', index: 0, routes: [{ name: '__root', state: { type: 'stack', index: 0, routes: [{ name: '(tabs)', state: { type: 'tab', index: 3, routes: [{ name: 'index' }, { name: 'discover' }, { name: 'activity' }, { name: 'me' }] } }] } }] };
    expect(hasScreenBeneath(onSecondTab)).toBe(false);
  });
  it('no state yet (before the navigator mounts) is nothing beneath', () => {
    expect(hasScreenBeneath(undefined)).toBe(false);
    expect(hasScreenBeneath(null)).toBe(false);
    expect(hasScreenBeneath({ type: 'stack', routes: [] })).toBe(false);
  });
});
