import { useEffect, useMemo, useRef } from 'react';
import { useHabitPreferences, useHabitsList } from '@/hooks/use-habits';
import { ensureHabitReminderPermissions, syncHabitReminders } from '@/lib/habit-reminders';
import { useAppStore } from '@/stores/app-store';

export function useHabitReminderSync(isActive = true) {
  const habitReminderSmartInsightsEnabled = useAppStore(
    (state) => state.habitReminderSmartInsightsEnabled,
  );
  const permissionRequestAttemptedRef = useRef(false);
  const preferencesQuery = useHabitPreferences(isActive);
  const preferencesReady = preferencesQuery.isSuccess;
  const reminderMasterEnabled = preferencesQuery.data?.reminderMasterEnabled ?? false;
  const shouldLoadSnapshot = isActive && preferencesReady && reminderMasterEnabled;
  const habitsQuery = useHabitsList({
    filter: 'all',
    includeArchived: false,
    days: 30,
    enabled: shouldLoadSnapshot,
  });
  const habitSnapshot = useMemo(
    () => habitsQuery.data?.items ?? [],
    [habitsQuery.data?.items],
  );
  const hasSchedulableReminder = reminderMasterEnabled
    && habitSnapshot.some((habit) => habit.reminderEnabled && Boolean(habit.reminderTime));

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!isActive) {
        return;
      }
      if (!preferencesReady) {
        return;
      }
      if (reminderMasterEnabled && !habitsQuery.isSuccess) {
        return;
      }

      // When reminders exist and master is on, request permission once so scheduling does not
      // silently stay at zero for users who never open reminder settings actions.
      if (hasSchedulableReminder && !permissionRequestAttemptedRef.current) {
        permissionRequestAttemptedRef.current = true;
        await ensureHabitReminderPermissions();
        if (cancelled) return;
      }

      await syncHabitReminders({
        settings: {
          enabled: reminderMasterEnabled,
          smartInsightsEnabled: habitReminderSmartInsightsEnabled,
        },
        habits: reminderMasterEnabled ? habitSnapshot : [],
      });
    };

    void run().catch((error) => {
      console.error('Failed to sync habit reminders', error);
    });

    return () => {
      cancelled = true;
    };
  }, [
    habitSnapshot,
    hasSchedulableReminder,
    habitReminderSmartInsightsEnabled,
    habitsQuery.isSuccess,
    isActive,
    preferencesReady,
    reminderMasterEnabled,
  ]);
}
