import { pushRecent, RECENT_MAX } from '@/lib/recentSearches';
import { SUGGEST_MAX, suggestionTextOk } from '@/lib/suggestFlow';

// jest hoists this above the imports.
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

describe('recent searches (SR-Recent)', () => {
  it('adds to the front, de-duplicates case-insensitively, caps the list', () => {
    expect(pushRecent([], ' canggu ')).toEqual(['canggu']);
    expect(pushRecent(['sofia', 'canggu'], 'Canggu')).toEqual(['Canggu', 'sofia']);
    expect(pushRecent(['a'], '   ')).toEqual(['a']);
    const many = Array.from({ length: RECENT_MAX + 3 }, (_, i) => `q${i}`);
    expect(pushRecent(many, 'new')).toHaveLength(RECENT_MAX);
  });
});

describe('suggestion text (C-Write)', () => {
  it('needs 1 to 120 characters after trimming', () => {
    expect(suggestionTextOk('')).toBe(false);
    expect(suggestionTextOk('   ')).toBe(false);
    expect(suggestionTextOk('x')).toBe(true);
    expect(suggestionTextOk('x'.repeat(SUGGEST_MAX))).toBe(true);
    expect(suggestionTextOk('x'.repeat(SUGGEST_MAX + 1))).toBe(false);
  });
});
