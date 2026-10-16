import { activityTarget } from '@/lib/activityLabels';
import type { ActivityKind, ActivityRow } from '@/lib/content';
import { videoLinkTarget } from '@/lib/links';
import { ANDROID_CHANNEL_ID, ANDROID_CHANNEL_NAME, claimPush, hrefForPush } from '@/lib/pushRoutes';

// The kinds supabase/migrations/20261009000100_places_suggestions.sql allows in push_outbox.
const PUSH_KINDS = ['video_reply', 'comment', 'comment_reply', 'follow', 'like', 'followed_responded', 'tonight_prompt', 'place_prompt', 'removed', 'restricted', 'suspended', 'review_outcome', 'suggestion_live', 'suggestion_declined'];

describe('hrefForPush (SPEC.md Section 15)', () => {
  it('a video reply opens the video reply', () => {
    expect(hrefForPush({ kind: 'video_reply', video_id: 'v1', activity_id: 'a1' })).toBe('/reply/v1');
  });
  it('a comment or a reply to a comment opens the comments sheet over the commented response', () => {
    expect(hrefForPush({ kind: 'comment', video_id: 'v1' })).toBe('/r/v1?openComments=1');
    expect(hrefForPush({ kind: 'comment_reply', video_id: 'v1' })).toBe('/r/v1?openComments=1');
  });
  it("tonight's prompt and a prompt in a followed place open that prompt", () => {
    expect(hrefForPush({ kind: 'tonight_prompt', prompt_id: 'p1' })).toBe('/player/p1');
    expect(hrefForPush({ kind: 'place_prompt', prompt_id: 'p1', activity_id: 'a1' })).toBe('/player/p1');
  });
  it('"people you follow respond" opens the prompt at that response', () => {
    expect(hrefForPush({ kind: 'followed_responded', prompt_id: 'p1', video_id: 'v1' })).toBe('/player/p1?entry=v1');
    expect(hrefForPush({ kind: 'followed_responded', prompt_id: 'p1' })).toBe('/player/p1');
  });
  it('a follow, a moderation notice, a review outcome and a suggestion outcome open what their Activity row opens', () => {
    for (const kind of ['follow', 'removed', 'restricted', 'suspended', 'review_outcome', 'suggestion_live', 'suggestion_declined']) {
      expect(hrefForPush({ kind, activity_id: 'a1' })).toBe('/a/a1');
    }
  });
  it('a like (one quiet line in Activity) and anything unknown open the Activity tab', () => {
    expect(hrefForPush({ kind: 'like', video_id: 'v1', activity_id: 'a1' })).toBe('/(tabs)/activity');
    expect(hrefForPush({ kind: 'something_new', video_id: 'v1' })).toBe('/(tabs)/activity');
    expect(hrefForPush({})).toBe('/(tabs)/activity');
  });
  it('falls back to Activity or Home when an id is missing, never to a broken route', () => {
    expect(hrefForPush({ kind: 'video_reply' })).toBe('/(tabs)/activity');
    expect(hrefForPush({ kind: 'comment' })).toBe('/(tabs)/activity');
    expect(hrefForPush({ kind: 'follow' })).toBe('/(tabs)/activity');
    expect(hrefForPush({ kind: 'tonight_prompt' })).toBe('/(tabs)');
    expect(hrefForPush({ kind: 'followed_responded' })).toBe('/(tabs)');
  });
  it('knows every kind the server can queue', () => {
    for (const kind of PUSH_KINDS) {
      const href = hrefForPush({ kind, video_id: 'v1', prompt_id: 'p1', activity_id: 'a1' });
      expect(href.startsWith('/')).toBe(true);
      expect(href).not.toContain('undefined');
    }
  });
  it('escapes ids so an odd id cannot change the route', () => {
    expect(hrefForPush({ kind: 'video_reply', video_id: 'a/b?c' })).toBe('/reply/a%2Fb%3Fc');
  });
});

describe('claimPush', () => {
  it('follows a tap once, however it arrives (listener, then the last response after a launch)', () => {
    const handled = new Set<string>();
    expect(claimPush('n1', handled)).toBe(true);
    expect(claimPush('n1', handled)).toBe(false);
    expect(claimPush('n2', handled)).toBe(true);
  });
  it('follows a tap with no id', () => {
    const handled = new Set<string>();
    expect(claimPush(null, handled)).toBe(true);
    expect(claimPush(undefined, handled)).toBe(true);
  });
});

describe('Android channel', () => {
  it('uses the default channel id pushes arrive on, named for the app', () => {
    expect(ANDROID_CHANNEL_ID).toBe('default');
    expect(ANDROID_CHANNEL_NAME).toBe('Shortcut');
  });
});

const row = (kind: ActivityKind, over: Partial<ActivityRow> = {}): ActivityRow =>
  ({
    id: 'a1',
    kind,
    created_at: '',
    updated_at: '',
    read: false,
    section: 'new',
    actor: { id: 'u2', name: 'Wayan Adi', username: 'wayan', photo_path: null },
    actors: [],
    actor_count: 1,
    count: 1,
    following_actor: false,
    video: { id: 'v1', kind: 'response', playback_id: null, caption: null, status: 'live', root_response_id: null, prompt_id: 'p1', prompt_text: 'x' },
    comment: null,
    prompt: { id: 'p1', text: 'x' },
    like_count: null,
    moderation_action_id: 'm1',
    review_outcome: null,
    suggestion: { id: 's1' },
    ...over,
  }) as ActivityRow;

describe('activityTarget (Activity rows and the pushes for the same events)', () => {
  it('opens what each board row opens', () => {
    expect(activityTarget(row('video_reply'))).toEqual({ pathname: '/reply/[id]', params: { id: 'v1' } });
    expect(activityTarget(row('comment'))).toEqual({ pathname: '/player/[promptId]', params: { promptId: 'p1', entry: 'v1', openComments: '1' } });
    expect(activityTarget(row('comment_reply'))?.params?.openComments).toBe('1');
    expect(activityTarget(row('follow'))).toEqual({ pathname: '/profile/[id]', params: { id: 'u2' } });
    expect(activityTarget(row('followed_responded'))).toEqual({ pathname: '/player/[promptId]', params: { promptId: 'p1', entry: 'v1' } });
    expect(activityTarget(row('place_prompt'))).toEqual({ pathname: '/player/[promptId]', params: { promptId: 'p1' } });
    for (const k of ['removed', 'restricted', 'suspended', 'review_outcome'] as const) {
      expect(activityTarget(row(k))).toEqual({ pathname: '/notice/[actionId]', params: { actionId: 'm1' } });
    }
    expect(activityTarget(row('suggestion_live'))).toEqual({ pathname: '/suggestion/[id]', params: { id: 's1' } });
    expect(activityTarget(row('suggestion_declined'))).toEqual({ pathname: '/suggestions' });
  });
  it('opens nothing for a like, or for a row missing what it needs', () => {
    expect(activityTarget(row('like'))).toBeNull();
    expect(activityTarget(row('video_reply', { video: null }))).toBeNull();
    expect(activityTarget(row('follow', { actor: null }))).toBeNull();
    expect(activityTarget(row('removed', { moderation_action_id: null }))).toBeNull();
  });
});

describe('videoLinkTarget with the comments sheet', () => {
  it('opens the comments sheet over a response', () => {
    expect(videoLinkTarget('v1', { kind: 'response', prompt_id: 'p1' }, { openComments: true })).toEqual({ pathname: '/player/[promptId]', params: { promptId: 'p1', entry: 'v1', openComments: '1' } });
  });
  it('never adds the sheet to a video reply (video replies have no comment section)', () => {
    expect(videoLinkTarget('v2', { kind: 'reply', prompt_id: 'p1' }, { openComments: true })).toEqual({ pathname: '/reply/[id]', params: { id: 'v2' } });
  });
});
