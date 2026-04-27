import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/lib/auth-client';

export default function AuthLayout() {
  const { data: session } = useSession();

  // If the user is already signed in, redirect them to the main app
  if (session) {
    return <Redirect href="/(tabs)/assistant" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="verify-email" />
    </Stack>
  );
}
