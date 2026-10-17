// Link to a response or video reply: shortcut://r/<id> (and conga.churntech.com/r/<id> once the domain
// exists). No screen of its own: it finds what the id is and goes to the player (SPEC.md Section 4).
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { getVideo } from '@/lib/content';
import { readableVideo, videoLinkTarget, type VideoLinkTarget } from '@/lib/links';
import { Spinner } from '@/ui/HomeStates';

export default function VideoLinkScreen() {
  const { id, openComments } = useLocalSearchParams<{ id: string; openComments?: string }>();
  const [target, setTarget] = useState<VideoLinkTarget | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getVideo(id)
      .then((v) => {
        // A video card has a status of its own ('live'); only { status: 'unavailable' } means it cannot be watched.
        if (!cancelled) setTarget(videoLinkTarget(id, readableVideo(v as never), { openComments: openComments === '1' }));
      })
      .catch(() => {
        if (!cancelled) setTarget(videoLinkTarget(id, null));
      });
    return () => {
      cancelled = true;
    };
  }, [id, openComments]);

  if (!id) return <Redirect href="/" />;
  if (target) return <Redirect href={target} />;
  return (
    <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner />
    </View>
  );
}
