import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: '#FFFFFF' } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="welcome" options={{ animation: 'fade', contentStyle: { backgroundColor: '#000000' } }} />
      <Stack.Screen name="email" />
      <Stack.Screen name="linked" />
      <Stack.Screen name="age" />
      <Stack.Screen name="invite" />
      <Stack.Screen name="waitlist" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="photo" />
    </Stack>
  );
}
