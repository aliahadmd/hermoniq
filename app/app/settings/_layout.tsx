import { Stack, Redirect } from 'expo-router';
import { useTheme } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/lib/auth-client';

export default function SettingsLayout() {
  const { colors } = useTheme();
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="money" options={{ title: 'Money Reminders' }} />
      <Stack.Screen name="planner" options={{ title: 'Planner Reminders' }} />
      <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      <Stack.Screen name="habits" options={{ title: 'Habit Settings' }} />
      <Stack.Screen name="notes" options={{ title: 'Note Categories' }} />
    </Stack>
  );
}
