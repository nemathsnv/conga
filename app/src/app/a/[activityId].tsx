// A tapped push for an Activity event (a follow, a moderation notice, a review outcome, a suggestion
// outcome): opens what tapping that row in Activity opens. No screen of its own. If the row cannot be
// found (it was grouped into another, or the list failed to load) it goes to the Activity tab, where
// the same event is listed (SPEC.md Section 15).
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { activityTarget, type ActivityTarget } from '@/lib/activityLabels';
import { activityList } from '@/lib/content';
import { Spinner } from '@/ui/HomeStates';

export default function ActivityLinkScreen() {
  const { activityId } = useLocalSearchParams<{ activityId: string }>();
  // undefined: looking it up; null: nothing specific, so the Activity tab.
  const [target, setTarget] = useState<ActivityTarget | null | undefined>(undefined);

  useEffect(() => {
    if (!activityId) return;
    let cancelled = false;
    activityList()
      .then((list) => {
        const row = list.rows.find((r) => r.id === activityId);
        if (!cancelled) setTarget(row ? activityTarget(row) : null);
      })
      .catch(() => {
        if (!cancelled) setTarget(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activityId]);

  if (!activityId || target === null) return <Redirect href="/(tabs)/activity" />;
  if (target) return <Redirect href={target as never} />;
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner light={false} />
    </View>
  );
}
