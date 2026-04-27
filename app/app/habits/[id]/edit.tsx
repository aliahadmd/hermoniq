import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HabitForm } from '@/components/habit-tracker/habit-form';
import {
  useArchiveHabit,
  useHardDeleteHabit,
  useHabit,
  useRestoreHabit,
  useUpdateHabit,
} from '@/hooks/use-habits';
import { ensureHabitReminderPermissions } from '@/lib/habit-reminders';
import { useThemeColor } from '@/hooks/use-theme-color';

function resolveId(rawId: string | string[] | undefined): string {
  return Array.isArray(rawId) ? rawId[0] : (rawId ?? '');
}

export default function EditHabitScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = resolveId(params.id);

  const borderColor = useThemeColor({}, 'border');
  const danger = useThemeColor({}, 'danger');
  const tint = useThemeColor({}, 'tint');

  const habitQuery = useHabit(id);
  const updateHabit = useUpdateHabit();
  const archiveHabit = useArchiveHabit();
  const restoreHabit = useRestoreHabit();
  const hardDeleteHabit = useHardDeleteHabit();

  if (habitQuery.isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={tint} />
      </ThemedView>
    );
  }

  if (habitQuery.error || !habitQuery.data) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Failed to load habit</ThemedText>
        <ThemedText style={styles.errorText}>
          {habitQuery.error?.message ?? 'Habit not found'}
        </ThemedText>
      </ThemedView>
    );
  }

  const habit = habitQuery.data;
  const isMutating =
    updateHabit.isPending ||
    archiveHabit.isPending ||
    hardDeleteHabit.isPending ||
    restoreHabit.isPending;

  return (
    <ThemedView style={styles.container}>
      <HabitForm
        initialValues={{
          name: habit.name,
          question: habit.question,
          type: habit.type,
          color: habit.color,
          unit: habit.unit,
          dailyTarget: habit.dailyTarget,
          frequencyType: habit.frequencyType,
          frequencyDays: habit.frequencyDays,
          reminderEnabled: habit.reminderEnabled,
          reminderTime: habit.reminderTime,
          notes: habit.notes,
          startDate: habit.startDate,
        }}
        submitLabel="Save Changes"
        submitting={isMutating}
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

            updateHabit.mutate(
              { id, data: values },
              {
                onSuccess: () => router.back(),
                onError: (error) => Alert.alert('Error', error.message),
              },
            );
          })();
        }}
      />

      <View style={[styles.actions, { borderTopColor: borderColor }]}>
        {habit.archivedAt ? (
          <Pressable
            style={[styles.secondaryAction, { borderColor }]}
            onPress={() => {
              Haptics.selectionAsync();
              restoreHabit.mutate(id, {
                onSuccess: () => router.back(),
                onError: (error) => Alert.alert('Error', error.message),
              });
            }}
          >
            <ThemedText>Restore Habit</ThemedText>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.secondaryAction, { borderColor }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              Alert.alert(
                'Archive Habit',
                'Archive this habit? It will be hidden from active list.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Archive',
                    onPress: () =>
                      archiveHabit.mutate(id, {
                        onSuccess: () => router.back(),
                        onError: (error) => Alert.alert('Error', error.message),
                      }),
                  },
                ],
              );
            }}
          >
            <ThemedText>Archive Habit</ThemedText>
          </Pressable>
        )}

        <Pressable
          style={[styles.dangerAction, { borderColor: danger }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            Alert.alert(
              'Delete Habit',
              'This permanently deletes the habit and all history.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () =>
                    hardDeleteHabit.mutate(id, {
                      onSuccess: () => router.replace('/(tabs)/habit-tracker'),
                      onError: (error) => Alert.alert('Error', error.message),
                    }),
                },
              ],
            );
          }}
        >
          <ThemedText style={{ color: danger }}>Delete Permanently</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 6,
    fontSize: 13,
  },
  actions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  secondaryAction: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerAction: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
