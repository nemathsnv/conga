// A still of a recording on the phone, for the posting and failed-post banners (PR-Posting,
// X-Upload-Failed, P1 to P5). The recording is a video file, which an image view cannot show, and the
// recorder keeps no thumbnail, so this is the video itself: paused on its first frame, silent, no
// controls. Without a file it is the same dark square the banner always had.
import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { stillSource } from '@/ui/playbackRules';

function Frame({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.muted = true;
    p.loop = false;
    p.pause();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} />;
}

export function RecordingStill({ uri, style }: { uri: string | null | undefined; style?: StyleProp<ViewStyle> }) {
  const source = stillSource(uri);
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.14)' }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {source ? <Frame uri={source} /> : null}
    </View>
  );
}
