// Link to a profile (Share profile): shortcut://u/<username>. Opens the profile in the app
// (SPEC.md Section 4: no web profile pages, the link opens the app). No screen of its own.
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { getProfile } from '@/lib/content';
import { Spinner } from '@/ui/HomeStates';

export default function ProfileLinkScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  // undefined: looking it up; null: no such profile (goes Home, never a blank page).
  const [profileId, setProfileId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    getProfile({ username })
      .then((p) => {
        if (!cancelled) setProfileId(p?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setProfileId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (!username || profileId === null) return <Redirect href="/" />;
  if (profileId) return <Redirect href={{ pathname: '/profile/[id]', params: { id: profileId } }} />;
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner light={false} />
    </View>
  );
}
