// Link to a prompt: shortcut://p/<id>. Opens the prompt's first response in the player (SPEC.md
// Section 4, "Links"): the response the player would show first for this person, passed as the entry
// so the player starts on it, not part way down. No screen of its own.
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { promptResponses } from '@/lib/content';
import { promptLinkTarget } from '@/lib/links';
import { Spinner } from '@/ui/HomeStates';

export default function PromptLinkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [target, setTarget] = useState<ReturnType<typeof promptLinkTarget> | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    promptResponses(id, null, [])
      .then((data) => {
        if (!cancelled) setTarget(promptLinkTarget(id, data.responses));
      })
      // No answer: the player itself says what it can (its own load failure state).
      .catch(() => {
        if (!cancelled) setTarget(promptLinkTarget(id, []));
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return <Redirect href="/" />;
  if (target) return <Redirect href={target} />;
  return (
    <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner />
    </View>
  );
}
