import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/lib/session';

/**
 * Development-only controls, shown when EXPO_PUBLIC_DEV_TOOLS=1. Sign out lives in
 * Settings (board S-Settings, phase 3+); until then the team needs a way to repeat
 * sign-up on a device. Not part of the product and never on in a tester build.
 */
export function DevTools() {
  const insets = useSafeAreaInsets();
  const { session, state, signOut } = useSession();
  return (
    <View style={[s.root, { top: insets.top + 8 }]}>
      <Text style={s.text}>dev: {state?.profile?.username ? `@${state.profile.username}` : session?.user.email}</Text>
      <Pressable onPress={() => void signOut()} style={({ pressed }) => [s.button, pressed && { opacity: 0.6 }]}>
        <Text style={s.buttonText}>dev: sign out</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 8 },
  text: { fontSize: 12, color: '#8A8A8E' },
  button: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F2F2F7' },
  buttonText: { fontSize: 12, color: '#1C1C1E' },
});
