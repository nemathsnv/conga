import { StyleSheet, View } from 'react-native';

import { DEV_TOOLS } from '@/lib/env';
import { DevTools } from '@/ui/DevTools';
import { PhaseLabel } from '@/ui/PhaseLabel';

// Boards X-Me-Empty and LV-MyProfile arrive in phase 3. Phase 2 only places the tab.
export default function MeTab() {
  return (
    <View style={s.root}>
      <PhaseLabel phase={3} />
      {DEV_TOOLS ? <DevTools /> : null}
    </View>
  );
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: '#FFFFFF' } });
