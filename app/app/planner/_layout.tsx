import { Stack } from 'expo-router';

export default function PlannerStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="create" options={{ title: 'New Event' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Event' }} />
    </Stack>
  );
}
