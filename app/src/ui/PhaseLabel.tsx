import { StyleSheet, Text, View } from 'react-native';

import { DEV_TOOLS } from '@/lib/env';

/** Development-only marker for a tab whose screen belongs to a later phase. Invisible otherwise. */
export function PhaseLabel({ phase }: { phase: number }) {
  if (!DEV_TOOLS) return null;
  return (
    <View style={s.root} pointerEvents="none">
      <Text style={s.text}>dev: phase {phase}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 12, color: '#8A8A8E' },
});
