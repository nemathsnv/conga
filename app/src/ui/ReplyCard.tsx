// The glass card that says what a video reply answers (boards Reply-Watch, Reply-Watch-2,
// Record-Reply, PR-Reply) and its A-Orphan variant ("Original response deleted").
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { thumbnailUrl } from '@/video/playback';
import { Glass } from './components';
import { PlayIcon, VideoReplyIcon } from './Icons';
import { colors, fontFamily, type } from './theme';

export function ReplyCard({
  kicker,
  name,
  caption,
  captionLines = 2,
  captionBold = false,
  sub,
  playbackId,
  onPress,
  label,
  style,
}: {
  kicker: string;
  name: string | null;
  caption: string | null;
  captionLines?: number;
  captionBold?: boolean;
  sub?: string | null;
  playbackId: string | null;
  onPress?: () => void;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <Glass style={[s.card, style]} radius={16}>
      <View style={s.thumb}>
        {playbackId ? <Image source={{ uri: thumbnailUrl(playbackId, { width: 84, height: 112 }) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={s.thumbOverlay}>
          <PlayIcon size={14} />
        </View>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.kicker} numberOfLines={1}>
          {kicker} {name ? <Text style={s.kickerName}>{name}</Text> : null}
        </Text>
        {caption ? (
          <Text style={[s.caption, captionBold && s.captionBold]} numberOfLines={captionLines}>
            &ldquo;{caption}&rdquo;
          </Text>
        ) : null}
        {sub ? (
          <Text style={s.sub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </Glass>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {body}
    </Pressable>
  );
}

/** A-Orphan: the root response is gone; the prompt stays. */
export function OrphanCard({ promptText, onPress, style }: { promptText: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="See all responses to this prompt" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      <Glass style={[s.card, style]} radius={16}>
        <View style={[s.thumb, s.thumbEmpty]}>
          <VideoReplyIcon size={18} color="rgba(255,255,255,0.7)" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.orphanKicker}>Original response deleted</Text>
          <Text style={s.orphanPrompt} numberOfLines={2}>
            {promptText}
          </Text>
        </View>
      </Glass>
    </Pressable>
  );
}

export function CardRow({ children }: { children: ReactNode }) {
  return <View style={s.row}>{children}</View>;
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingBottom: 8, paddingLeft: 8, paddingRight: 12 },
  thumb: { width: 42, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.12)' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  thumbOverlay: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)' },
  kicker: { ...type.caption12, color: 'rgba(255,255,255,0.75)', fontFamily },
  kickerName: { color: colors.white, fontWeight: '600' },
  caption: { marginTop: 2, fontSize: 14, lineHeight: 18, color: colors.white, fontFamily },
  captionBold: { fontSize: 15, lineHeight: 19, fontWeight: '600', letterSpacing: -0.2 },
  sub: { marginTop: 3, ...type.caption12, color: 'rgba(255,255,255,0.68)', fontFamily },
  orphanKicker: { ...type.caption13, color: 'rgba(255,255,255,0.8)', fontFamily },
  orphanPrompt: { marginTop: 2, fontSize: 14, lineHeight: 18, fontWeight: '600', color: colors.white, fontFamily },
  row: { flexDirection: 'row', alignItems: 'center' },
});
