import { Stack, Redirect } from 'expo-router';
import { useTheme } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/lib/auth-client';

export default function AssistantLayout() {
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
      <Stack.Screen name="[id]" options={{ title: 'AI Chat' }} />
      <Stack.Screen name="settings/[id]" options={{ title: 'Chat Settings' }} />
    </Stack>
  );
}
