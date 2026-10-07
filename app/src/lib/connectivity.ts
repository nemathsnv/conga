// Board A-Offline (SPEC.md Sections 19 and 20): whether the phone has a connection. Already
// loaded videos keep playing; recording works; Post waits. Nothing is downloaded for offline.
import * as Network from 'expo-network';
import { useSyncExternalStore } from 'react';

let current = true;
const listeners = new Set<(online: boolean) => void>();

function set(online: boolean) {
  if (online === current) return;
  current = online;
  listeners.forEach((l) => l(online));
}

/** Starts watching the connection. Returns a stop function. */
export function startConnectivity(): () => void {
  void Network.getNetworkStateAsync()
    .then((st) => set(st.isConnected !== false && st.isInternetReachable !== false))
    .catch(() => undefined);
  const sub = Network.addNetworkStateListener((st) => set(st.isConnected !== false && st.isInternetReachable !== false));
  return () => sub.remove();
}

export function isOnline(): boolean {
  return current;
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, isOnline);
}

function subscribe(listener: (online: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
