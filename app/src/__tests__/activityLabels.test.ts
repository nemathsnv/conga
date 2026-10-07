import { activityText, actorNames, shortAgo } from '@/lib/activityLabels';
import type { ActivityRow } from '@/lib/content';

const person = (id: string, name: string) => ({ id, name, username: id, photo_path: null });

const base: ActivityRow = {
  id: 'a',
  kind: 'follow',
  created_at: '2026-10-07T10:00:00Z',
  updated_at: '2026-10-07T10:00:00Z',
  read: false,
  section: 'new',
  actor: person('w', 'Wayan Adi'),
  actors: [person('w', 'Wayan Adi')],
  actor_count: 1,
  count: 1,
  following_actor: false,
  video: null,
  comment: null,
  prompt: null,
  like_count: null,
  moderation_action_id: null,
};

describe('actorNames', () => {
  it('one person', () => {
    expect(actorNames({ actors: [person('p', 'Putu Ayu')], actor_count: 1, actor: null })).toBe('Putu');
  });
  it('two people', () => {
    expect(actorNames({ actors: [person('p', 'Putu Ayu'), person('h', 'Hana Iwasaki')], actor_count: 2, actor: null })).toBe('Putu and Hana');
  });
  it('more than two', () => {
    expect(actorNames({ actors: [person('m', 'Maya Lindqvist'), person('a', 'Adam Novak')], actor_count: 4, actor: null })).toBe('Maya, Adam and 2 others');
  });
});

describe('activityText', () => {
  it('follow', () => {
    expect(activityText(base)).toEqual({ names: 'Wayan Adi', rest: 'started following you', quote: null });
  });
  it('grouped comments quote the latest commenter', () => {
    const row: ActivityRow = {
      ...base,
      kind: 'comment',
      actor: person('p', 'Putu Ayu'),
      actors: [person('p', 'Putu Ayu'), person('h', 'Hana Iwasaki')],
      actor_count: 2,
      count: 2,
      comment: { id: 'c', body: 'Pererenan at sunrise, yes.', deleted: false },
    };
    expect(activityText(row)).toEqual({ names: 'Putu and Hana', rest: 'commented on your response', quote: 'Putu: "Pererenan at sunrise, yes."' });
  });
  it('likes collapse into one line', () => {
    const row: ActivityRow = { ...base, kind: 'like', actor: person('m', 'Maya Lindqvist'), actor_count: 12, like_count: 12 };
    expect(activityText(row).names).toBe('Maya and 11 others');
    expect(activityText(row).rest).toBe('liked your response');
  });
  it('a video reply quotes its caption', () => {
    const row: ActivityRow = {
      ...base,
      kind: 'video_reply',
      actor: person('s', 'Sofia Marín'),
      video: { id: 'v', kind: 'reply', playback_id: 'pb', caption: 'You were right about the light.', status: 'live', root_response_id: 'r', prompt_id: 'p', prompt_text: 'x' },
    };
    expect(activityText(row)).toEqual({ names: 'Sofia Marín', rest: 'replied to your response with a video', quote: 'You were right about the light.' });
  });
});

describe('shortAgo', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  it('minutes, hours, days', () => {
    expect(shortAgo('2026-10-07T11:56:00Z', now)).toBe('4m');
    expect(shortAgo('2026-10-07T10:00:00Z', now)).toBe('2h');
    expect(shortAgo('2026-10-05T12:00:00Z', now)).toBe('2d');
    expect(shortAgo('2026-10-07T11:59:50Z', now)).toBe('now');
  });
});
