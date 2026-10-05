import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function Button({ title, onPress, disabled, danger, small }: { title: string; onPress: () => void; disabled?: boolean; danger?: boolean; small?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, small && s.btnSmall, danger && s.btnDanger, disabled && s.btnDisabled, pressed && { opacity: 0.6 }]}>
      <Text style={[s.btnText, small && { fontSize: 14 }]}>{title}</Text>
    </Pressable>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return <View style={s.row}>{children}</View>;
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <Text style={s.mono}>{children}</Text>;
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  pad: { padding: 16, gap: 10 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  text: { color: '#ddd', fontSize: 15 },
  dim: { color: '#888', fontSize: 13 },
  mono: { color: '#9f9', fontFamily: 'Menlo', fontSize: 12 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  btn: { backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center' },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12 },
  btnDanger: { backgroundColor: '#e33' },
  btnDisabled: { opacity: 0.35 },
  btnText: { color: '#000', fontWeight: '700', fontSize: 16 },
  overlayTop: { position: 'absolute', top: 60, left: 16, right: 16, gap: 8 },
  overlayBottom: { position: 'absolute', bottom: 40, left: 16, right: 16, gap: 10, alignItems: 'center' },
  pill: { backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, overflow: 'hidden', fontSize: 13 },
});
