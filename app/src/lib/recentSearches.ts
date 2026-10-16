// Recent searches stay on this phone (board SR-Recent). Pure list rules here; storage below.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENT_MAX = 8;

/** Adds a query to the front, de-duplicated (case-insensitive), capped. */
export function pushRecent(list: string[], q: string): string[] {
  const t = q.trim();
  if (!t) return list;
  const rest = list.filter((x) => x.toLowerCase() !== t.toLowerCase());
  return [t, ...rest].slice(0, RECENT_MAX);
}

const KEY = 'shortcut.recentSearches';

export async function loadRecent(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveRecent(list: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // not fatal
  }
}

/** Sign-out: recent searches are the account's, not the phone's. */
export async function clearRecent(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // not fatal
  }
}
