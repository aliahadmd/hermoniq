import { useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import { useEvents } from '@/hooks/use-events';
import { syncEventReminders } from '@/lib/event-reminders';
import { useAppStore } from '@/stores/app-store';

export function useEventReminderSync(isActive = true) {
  const eventReminderEnabled = useAppStore((state) => state.eventReminderEnabled);
  const eventReminderDefaultMinutes = useAppStore((state) => state.eventReminderDefaultMinutes);
  const eventReminderSmartInsightsEnabled = useAppStore(
    (state) => state.eventReminderSmartInsightsEnabled,
  );
  const eventReminderWeekdaysOnly = useAppStore((state) => state.eventReminderWeekdaysOnly);
  const eventReminderIncludeAllDay = useAppStore((state) => state.eventReminderIncludeAllDay);
  const eventReminderLookaheadDays = useAppStore((state) => state.eventReminderLookaheadDays);

  const range = useMemo(() => {
    const now = dayjs();
    return {
      from: now.startOf('day').toDate().toISOString(),
      to: now.add(eventReminderLookaheadDays, 'day').endOf('day').toDate().toISOString(),
    };
  }, [eventReminderLookaheadDays]);

  const shouldLoadSnapshot = isActive && eventReminderEnabled;
  const eventsQuery = useEvents(
    { from: range.from, to: range.to },
    { enabled: shouldLoadSnapshot },
  );
  const eventSnapshot = shouldLoadSnapshot ? eventsQuery.data ?? [] : [];

  const reminderSettings = useMemo(
    () => ({
      enabled: eventReminderEnabled,
      defaultReminderMinutes: eventReminderDefaultMinutes,
      smartInsightsEnabled: eventReminderSmartInsightsEnabled,
      weekdaysOnly: eventReminderWeekdaysOnly,
      includeAllDay: eventReminderIncludeAllDay,
      lookaheadDays: eventReminderLookaheadDays,
    }),
    [
      eventReminderDefaultMinutes,
      eventReminderEnabled,
      eventReminderIncludeAllDay,
      eventReminderLookaheadDays,
      eventReminderSmartInsightsEnabled,
      eventReminderWeekdaysOnly,
    ],
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }
    if (eventReminderEnabled && !eventsQuery.isSuccess) {
      return;
    }

    void syncEventReminders({
      settings: reminderSettings,
      events: eventSnapshot,
    }).catch((error) => {
      console.error('Failed to sync planner reminders', error);
    });
  }, [
    eventReminderEnabled,
    eventSnapshot,
    eventsQuery.isSuccess,
    isActive,
    reminderSettings,
  ]);
}
