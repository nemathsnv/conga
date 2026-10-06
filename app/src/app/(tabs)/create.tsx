import { StyleSheet, View } from 'react-native';

import { PhaseLabel } from '@/ui/PhaseLabel';

// Board C-Plus arrives in phase 3. Phase 2 only places the tab.
export default function Tab() {
  return (
    <View style={s.root}>
      <PhaseLabel phase={3} />
    </View>
  );
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: '#FFFFFF' } });
