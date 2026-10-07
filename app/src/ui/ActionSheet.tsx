// The two sheet shapes the safety boards use. ActionSheet: the iOS-style stack at the bottom
// (SF-Block, SF-Delete, LV-SignOut, LV-CommentOwn, LV-CommentActions). WhiteSheet: the white
// bottom sheet with a handle (SF-Menu, SF-Report, SF-Reported).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontFamily, type } from './theme';

export function ActionSheet({
  title,
  lines,
  actions,
  onCancel,
  cancelLabel = 'Cancel',
}: {
  title: string;
  lines?: string[];
  actions: { label: string; destructive?: boolean; onPress: () => void }[];
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable style={s.dim} onPress={onCancel} accessibilityLabel={cancelLabel}>
      <View style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 10) + 24 }]}>
        <View style={s.sheet}>
          <View style={s.head}>
            <Text style={s.title}>{title}</Text>
            {lines?.map((line, i) => (
              <Text key={i} style={[s.sub, i > 0 && { marginTop: 6 }]}>
                {line}
              </Text>
            ))}
          </View>
          {actions.map((a) => (
            <View key={a.label}>
              <View style={s.sep} />
              <Pressable accessibilityRole="button" onPress={a.onPress} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
                <Text style={[s.rowText, a.destructive && { color: colors.dangerBorder }]}>{a.label}</Text>
              </Pressable>
            </View>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [s.cancel, pressed && { opacity: 0.6 }]}>
          <Text style={s.cancelText}>{cancelLabel}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

export function WhiteSheet({ children, onClose, top }: { children: ReactNode; onClose: () => void; top?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={s.dim}>
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.white, top !== undefined && { position: 'absolute', left: 0, right: 0, top, bottom: 0 }, { paddingBottom: Math.max(insets.bottom, 10) + 24 }]}>
        <View style={s.handle} />
        {children}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' },
  wrap: { paddingHorizontal: 8 },
  sheet: { borderRadius: 14, backgroundColor: 'rgba(249,249,249,0.96)', overflow: 'hidden' },
  head: { paddingTop: 16, paddingBottom: 14, paddingHorizontal: 20, alignItems: 'center' },
  title: { ...type.caption13, fontWeight: '600', color: colors.textSecondary, fontFamily },
  sub: { ...type.caption13, lineHeight: 18, marginTop: 4, color: colors.textTertiary, textAlign: 'center', fontFamily },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(60,60,67,0.29)' },
  row: { height: 57, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontSize: 20, color: colors.text, fontFamily },
  cancel: { marginTop: 8, height: 57, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 20, fontWeight: '600', color: '#007AFF', fontFamily },
  white: { backgroundColor: colors.white, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingTop: 6, paddingHorizontal: 16 },
  handle: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: colors.separator },
});
