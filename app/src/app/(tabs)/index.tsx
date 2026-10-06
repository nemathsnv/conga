import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import { PhaseLabel } from '@/ui/PhaseLabel';

// Home feed arrives in phase 3 (board Main). Phase 2 only places the tab.
export default function HomeTab() {
  return (
    <View style={s.root}>
      <StatusBar style="light" />
      <PhaseLabel phase={3} />
    </View>
  );
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: '#000000' } });
