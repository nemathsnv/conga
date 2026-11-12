// The Activity bell: "filled when active" (SPEC.md Section 4). Unread count, refreshed when
// the tabs mount, when the app comes to the foreground and after Activity is read.
import { useEffect, useState } from 'react';

import { activityUnreadCount } from '@/lib/content';

let unread = 0;
const listeners = new Set<() => void>();

export function setUnread(n: number): void {
  unread = n;
  listeners.forEach((l) => l());
}

export function getUnread(): number {
  return unread;
}

export async function refreshUnread(): Promise<void> {
  try {
    setUnread(await activityUnreadCount());
  } catch {
    // keep the last value
  }
}

export function useUnread(): number {
  const [value, setValue] = useState(unread);
  useEffect(() => {
    const l = () => setValue(unread);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return value;
}
