import { Stack, Redirect } from 'expo-router';
import { useTheme } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/lib/auth-client';

export default function HabitsLayout() {
  const { colors } = useTheme();
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
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
      <Stack.Screen name="create" options={{ title: 'Create Habit' }} />
      <Stack.Screen name="[id]/index" options={{ title: 'Habit Details' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Habit' }} />
    </Stack>
  );
}
