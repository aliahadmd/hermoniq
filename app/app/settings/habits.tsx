import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { useTheme } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ReminderTimePickerField } from '@/components/habit-tracker/reminder-time-picker-field';
import { useHabitPreferences, useHabitsList, useUpdateHabitPreferences } from '@/hooks/use-habits';
import {
  countHabitReminderNotifications,
  ensureHabitReminderPermissions,
  hasHabitReminderPermissions,
  openExactAlarmSettings,
  sendHabitReminderTest,
  syncHabitReminders,
} from '@/lib/habit-reminders';
import type { HabitListFilter, HabitTimelineDays, HabitWeekStart } from '@/lib/types';
import { useAppStore } from '@/stores/app-store';

const WEEK_START_OPTIONS: { value: HabitWeekStart; label: string }[] = [
  { value: 'device', label: 'Device' },
  { value: 'sunday', label: 'Sunday' },
  { value: 'monday', label: 'Monday' },
];

const FILTER_OPTIONS: { value: HabitListFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'due_today', label: 'Due Today' },
  { value: 'completed_today', label: 'Completed Today' },
];

const DAY_OPTIONS: { value: HabitTimelineDays; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
];

interface OptionGroupProps<T extends string | number> {
  label: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
  borderColor: string;
  tint: string;
}

function OptionGroup<T extends string | number>({
  label,
  options,
  selected,
  onSelect,
  borderColor,
  tint,
}: OptionGroupProps<T>) {
  return (
    <View style={styles.group}>
      <ThemedText style={styles.groupLabel}>{label}</ThemedText>
      <View style={styles.chipRow}>
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <Pressable
              key={String(option.value)}
              onPress={() => {
                Haptics.selectionAsync();
                onSelect(option.value);
              }}
              style={[
                styles.chip,
                {
                  borderColor: active ? tint : borderColor,
                  backgroundColor: active ? `${tint}1F` : 'transparent',
                },
              ]}
            >
              <ThemedText style={active ? { color: tint } : undefined}>{option.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  borderColor: string;
  trackColorOn: string;
  thumbColor: string;
  disabled?: boolean;
}

function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  borderColor,
  trackColorOn,
  thumbColor,
  disabled = false,
}: SwitchRowProps) {
  return (
    <View style={[styles.switchRow, { borderColor, opacity: disabled ? 0.55 : 1 }]}>
      <View style={styles.switchText}>
        <ThemedText>{label}</ThemedText>
        {description ? (
          <ThemedText style={styles.switchDescription}>{description}</ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          Haptics.selectionAsync();
          onValueChange(next);
        }}
        trackColor={{ false: borderColor, true: trackColorOn }}
        thumbColor={thumbColor}
      />
    </View>
  );
}

export default function HabitSettingsScreen() {
  const { colors } = useTheme();
  const isExpoGo = Constants.appOwnership === 'expo';
  const preferencesQuery = useHabitPreferences();
  const updatePreferences = useUpdateHabitPreferences();
  const habitReminderSmartInsightsEnabled = useAppStore(
    (state) => state.habitReminderSmartInsightsEnabled,
  );
  const setHabitReminderSmartInsightsEnabled = useAppStore(
    (state) => state.setHabitReminderSmartInsightsEnabled,
  );

  const borderColor = colors.border;
  const surface = colors.card;
  const tint = colors.primary;
  const preferences = preferencesQuery.data;
  const shouldLoadSnapshot = Boolean(preferences?.reminderMasterEnabled);
  const habitsListQuery = useHabitsList({
    filter: 'all',
    includeArchived: false,
    days: 30,
    enabled: shouldLoadSnapshot,
  });
  const habitSnapshot = useMemo(
    () => (shouldLoadSnapshot ? habitsListQuery.data?.items ?? [] : []),
    [habitsListQuery.data?.items, shouldLoadSnapshot],
  );

  const activeReminderHabitCount = useMemo(
    () => habitSnapshot.filter((habit) => habit.reminderEnabled && !habit.archivedAt).length,
    [habitSnapshot],
  );
  const dueTodayPendingCount = useMemo(
    () => habitSnapshot.filter((habit) => habit.dueToday && !habit.completedToday).length,
    [habitSnapshot],
  );

  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const applyPatch = async (
    patch: Parameters<typeof updatePreferences.mutate>[0],
  ) => {
    await updatePreferences.mutateAsync(patch);
  };

  const applyPatchWithAlert = (patch: Parameters<typeof updatePreferences.mutate>[0]) => {
    void applyPatch(patch).catch((error) => {
      Alert.alert('Error', error instanceof Error ? error.message : 'Unable to update habit settings.');
    });
  };

  const refreshDiagnostics = async () => {
    try {
      const [granted, scheduled] = await Promise.all([
        hasHabitReminderPermissions(),
        countHabitReminderNotifications(),
      ]);
      setPermissionGranted(granted);
      setScheduledCount(scheduled);
    } catch {
      setPermissionGranted(false);
      setScheduledCount(0);
    }
  };

  useEffect(() => {
    void refreshDiagnostics();
  }, [
    activeReminderHabitCount,
    dueTodayPendingCount,
    habitReminderSmartInsightsEnabled,
    preferences?.reminderMasterEnabled,
  ]);

  const syncWithSnapshot = async (
    overrides?: Partial<{ enabled: boolean; smartInsightsEnabled: boolean }>,
  ): Promise<number> => {
    const merged = {
      enabled: overrides?.enabled ?? Boolean(preferences?.reminderMasterEnabled),
      smartInsightsEnabled: overrides?.smartInsightsEnabled ?? habitReminderSmartInsightsEnabled,
    };

    let habits = habitSnapshot;
    if (merged.enabled && habits.length === 0) {
      const refetched = await habitsListQuery.refetch();
      habits = refetched.data?.items ?? habits;
    }

    const count = await syncHabitReminders({
      settings: merged,
      habits,
    });
    setScheduledCount(count);
    return count;
  };

  if (preferencesQuery.isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color={tint} />
      </ThemedView>
    );
  }

  if (preferencesQuery.error || !preferences) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Failed to load habit settings.</ThemedText>
        <ThemedText style={styles.errorText}>
          {preferencesQuery.error?.message ?? 'Unknown error'}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { borderColor, backgroundColor: surface }]}>
          <OptionGroup
            label="Week Start"
            options={WEEK_START_OPTIONS}
            selected={preferences.weekStart}
            onSelect={(value) => applyPatchWithAlert({ weekStart: value })}
            borderColor={borderColor}
            tint={tint}
          />

          <OptionGroup
            label="Default List Filter"
            options={FILTER_OPTIONS}
            selected={preferences.defaultFilter}
            onSelect={(value) => applyPatchWithAlert({ defaultFilter: value })}
            borderColor={borderColor}
            tint={tint}
          />

          <OptionGroup
            label="Timeline Window"
            options={DAY_OPTIONS}
            selected={preferences.timelineDays}
            onSelect={(value) => applyPatchWithAlert({ timelineDays: value })}
            borderColor={borderColor}
            tint={tint}
          />

          <SwitchRow
            label="Show archived by default"
            value={preferences.showArchivedByDefault}
            onValueChange={(next) => applyPatchWithAlert({ showArchivedByDefault: next })}
            borderColor={borderColor}
            trackColorOn={tint}
            thumbColor={colors.background}
          />

          <SwitchRow
            label="Require note when completed"
            description="A note is required when a log is marked as completed."
            value={preferences.requireNoteForCompletion}
            onValueChange={(next) => applyPatchWithAlert({ requireNoteForCompletion: next })}
            borderColor={borderColor}
            trackColorOn={tint}
            thumbColor={colors.background}
          />
        </View>

        <View style={[styles.card, { borderColor, backgroundColor: surface }]}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Habit Reminder Defaults
          </ThemedText>

          <SwitchRow
            label="Reminder master switch"
            description="Turn off to disable reminder controls in habit forms."
            value={preferences.reminderMasterEnabled}
            disabled={busy || updatePreferences.isPending}
            onValueChange={async (next) => {
              setBusy(true);
              try {
                if (next) {
                  const granted = await ensureHabitReminderPermissions();
                  setPermissionGranted(granted);
                  if (!granted) {
                    Alert.alert(
                      'Permission needed',
                      'Enable notifications in system settings to use habit reminders.',
                    );
                    return;
                  }
                }

                await applyPatch({
                  reminderMasterEnabled: next,
                  defaultReminderEnabled: next ? preferences.defaultReminderEnabled : false,
                });
                await syncWithSnapshot({ enabled: next });
                await refreshDiagnostics();
              } catch (error) {
                Alert.alert(
                  'Error',
                  error instanceof Error ? error.message : 'Unable to update reminder settings.',
                );
              } finally {
                setBusy(false);
              }
            }}
            borderColor={borderColor}
            trackColorOn={tint}
            thumbColor={colors.background}
          />

          <SwitchRow
            label="Default reminder for new habits"
            value={preferences.defaultReminderEnabled}
            disabled={!preferences.reminderMasterEnabled || busy}
            onValueChange={(next) =>
              applyPatchWithAlert({
                defaultReminderEnabled: next,
                defaultReminderTime: next
                  ? (preferences.defaultReminderTime ?? '21:00')
                  : preferences.defaultReminderTime,
              })
            }
            borderColor={borderColor}
            trackColorOn={tint}
            thumbColor={colors.background}
          />

          {preferences.reminderMasterEnabled && preferences.defaultReminderEnabled ? (
            <View style={styles.timeRow}>
              <ThemedText style={styles.groupLabel}>Default Reminder Time</ThemedText>
              <View style={busy ? styles.disabledSection : undefined}>
                <ReminderTimePickerField
                  value={preferences.defaultReminderTime}
                  onChange={(time) => {
                    if (busy) return;
                    applyPatchWithAlert({ defaultReminderTime: time });
                  }}
                />
              </View>
            </View>
          ) : null}
        </View>

        <View style={[styles.card, { borderColor, backgroundColor: surface }]}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Smart Device Reminders
          </ThemedText>

          <SwitchRow
            label="Smart reminder insights"
            description="Adjust habit reminder message based on completion momentum."
            value={habitReminderSmartInsightsEnabled}
            disabled={!preferences.reminderMasterEnabled || busy}
            onValueChange={(next) => {
              setHabitReminderSmartInsightsEnabled(next);
              if (!preferences.reminderMasterEnabled) return;
              void syncWithSnapshot({ smartInsightsEnabled: next }).catch((error) => {
                Alert.alert(
                  'Error',
                  error instanceof Error ? error.message : 'Unable to sync smart reminders.',
                );
              });
            }}
            borderColor={borderColor}
            trackColorOn={tint}
            thumbColor={colors.background}
          />

          <ThemedText style={styles.statusText}>
            Notification permission: {permissionGranted === null ? 'Checking...' : permissionGranted ? 'Granted' : 'Denied'}
          </ThemedText>
          <ThemedText style={styles.statusText}>
            Reminder habits: {activeReminderHabitCount} active • {dueTodayPendingCount} pending today
          </ThemedText>
          <ThemedText style={styles.statusText}>
            Scheduled reminders on this device: {scheduledCount ?? 0}
          </ThemedText>
          {Platform.OS === 'android' ? (
            <ThemedText style={styles.statusText}>
              For stricter background timing on Android, enable this app under system Alarms & reminders.
            </ThemedText>
          ) : null}
          {Platform.OS === 'android' && isExpoGo ? (
            <ThemedText style={styles.statusText}>
              Background reminder reliability is limited in Expo Go. Test reminders using the installed Harmoniq app build.
            </ThemedText>
          ) : null}

          <View style={styles.actionRow}>
            {Platform.OS === 'android' ? (
              <Pressable
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    await openExactAlarmSettings();
                  } catch (error) {
                    Alert.alert(
                      'Error',
                      error instanceof Error ? error.message : 'Unable to open exact alarm settings.',
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                style={[
                  styles.actionButton,
                  {
                    borderColor,
                    backgroundColor: busy ? borderColor : 'transparent',
                  },
                ]}
              >
                <ThemedText style={{ color: tint, fontWeight: '600' }}>Open Alarms & reminders</ThemedText>
              </Pressable>
            ) : null}

            <Pressable
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  if (!(await ensureHabitReminderPermissions())) {
                    setPermissionGranted(false);
                    Alert.alert('Permission needed', 'Notifications are currently disabled for this app.');
                    return;
                  }
                  setPermissionGranted(true);
                  await sendHabitReminderTest(
                    {
                      enabled: preferences.reminderMasterEnabled,
                      smartInsightsEnabled: habitReminderSmartInsightsEnabled,
                    },
                    habitSnapshot,
                  );
                  await refreshDiagnostics();
                  Alert.alert('Test sent', 'A habit reminder test notification was queued on this device.');
                } catch (error) {
                  Alert.alert(
                    'Error',
                    error instanceof Error ? error.message : 'Unable to send test reminder.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
              style={[
                styles.actionButton,
                {
                  borderColor,
                  backgroundColor: busy ? borderColor : `${tint}1A`,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={tint} />
              ) : (
                <ThemedText style={{ color: tint, fontWeight: '600' }}>Send test reminder</ThemedText>
              )}
            </Pressable>

            <Pressable
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  if (preferences.reminderMasterEnabled) {
                    const granted = await ensureHabitReminderPermissions();
                    setPermissionGranted(granted);
                    if (!granted) {
                      Alert.alert('Permission needed', 'Notifications are currently disabled for this app.');
                      return;
                    }
                  }

                  const count = await syncWithSnapshot();
                  await refreshDiagnostics();
                  Alert.alert('Synced', `${count} habit reminder notification${count === 1 ? '' : 's'} scheduled.`);
                } catch (error) {
                  Alert.alert(
                    'Error',
                    error instanceof Error ? error.message : 'Unable to sync reminders.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
              style={[
                styles.actionButton,
                {
                  borderColor,
                  backgroundColor: busy ? borderColor : 'transparent',
                },
              ]}
            >
              <ThemedText style={{ color: tint, fontWeight: '600' }}>Resync schedule</ThemedText>
            </Pressable>
          </View>
        </View>

        {updatePreferences.isPending ? (
          <View style={styles.savingWrap}>
            <ActivityIndicator size="small" color={tint} />
            <ThemedText style={styles.savingText}>Saving...</ThemedText>
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 14,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  group: {
    gap: 8,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.75,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  switchRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchText: {
    flex: 1,
  },
  switchDescription: {
    marginTop: 2,
    fontSize: 12,
    opacity: 0.7,
  },
  timeRow: {
    gap: 8,
  },
  disabledSection: {
    opacity: 0.55,
  },
  statusText: {
    fontSize: 13,
    opacity: 0.8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    minHeight: 42,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
  },
  savingText: {
    fontSize: 12,
    opacity: 0.7,
  },
  errorText: {
    marginTop: 6,
    fontSize: 12,
    opacity: 0.75,
  },
});
