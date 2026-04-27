import { Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { HabitForm } from '@/components/habit-tracker/habit-form';
import { useCreateHabit } from '@/hooks/use-habits';
import { ensureHabitReminderPermissions } from '@/lib/habit-reminders';
import type { HabitType } from '@/lib/types';

function resolveType(rawType: string | string[] | undefined): HabitType {
  if (rawType === 'measurable') return 'measurable';
  return 'yes_no';
}

export default function CreateHabitScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const createHabit = useCreateHabit();

  const defaultType = resolveType(params.type);

  return (
    <ThemedView style={styles.container}>
      <HabitForm
        initialValues={{ type: defaultType }}
        submitLabel="Create Habit"
        submitting={createHabit.isPending}
        onSubmit={(values) => {
          void (async () => {
            if (values.reminderEnabled) {
              const granted = await ensureHabitReminderPermissions();
              if (!granted) {
                Alert.alert(
                  'Permission needed',
                  'Enable notifications in system settings to receive habit reminders.',
                );
                return;
              }
            }

            createHabit.mutate(values, {
              onSuccess: () => {
                router.back();
              },
              onError: (error) => {
                Alert.alert('Error', error.message);
              },
            });
          })();
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
