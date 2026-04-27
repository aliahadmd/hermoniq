import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@react-navigation/native';
import dayjs from 'dayjs';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useEvents } from '@/hooks/use-events';
import {
  countEventReminderNotifications,
  ensureEventReminderPermissions,
  hasEventReminderPermissions,
  sendEventReminderTest,
  syncEventReminders,
} from '@/lib/event-reminders';
import { EVENT_REMINDER_OPTIONS } from '@/lib/planner-utils';
import type { EventReminderLookaheadDays, EventReminderMinutes } from '@/lib/types';
import { useAppStore } from '@/stores/app-store';

const LOOKAHEAD_OPTIONS: { value: EventReminderLookaheadDays; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

interface OptionGroupProps<T extends string | number | null> {
  label: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
  borderColor: string;
  tint: string;
  disabled?: boolean;
}

function OptionGroup<T extends string | number | null>({
  label,
  options,
  selected,
  onSelect,
  borderColor,
  tint,
  disabled = false,
}: OptionGroupProps<T>) {
  return (
    <View style={styles.group}>
      <ThemedText style={styles.groupLabel}>{label}</ThemedText>
      <View style={[styles.chipRow, disabled ? styles.disabledSection : undefined]}>
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <Pressable
              key={String(option.label)}
              disabled={disabled}
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

export default function PlannerSettingsScreen() {
  const { colors } = useTheme();

  const eventReminderEnabled = useAppStore((state) => state.eventReminderEnabled);
  const setEventReminderEnabled = useAppStore((state) => state.setEventReminderEnabled);
  const eventReminderDefaultMinutes = useAppStore((state) => state.eventReminderDefaultMinutes);
  const setEventReminderDefaultMinutes = useAppStore((state) => state.setEventReminderDefaultMinutes);
  const eventReminderSmartInsightsEnabled = useAppStore(
    (state) => state.eventReminderSmartInsightsEnabled,
  );
  const setEventReminderSmartInsightsEnabled = useAppStore(
    (state) => state.setEventReminderSmartInsightsEnabled,
  );
  const eventReminderWeekdaysOnly = useAppStore((state) => state.eventReminderWeekdaysOnly);
  const setEventReminderWeekdaysOnly = useAppStore((state) => state.setEventReminderWeekdaysOnly);
  const eventReminderIncludeAllDay = useAppStore((state) => state.eventReminderIncludeAllDay);
  const setEventReminderIncludeAllDay = useAppStore((state) => state.setEventReminderIncludeAllDay);
  const eventReminderLookaheadDays = useAppStore((state) => state.eventReminderLookaheadDays);
  const setEventReminderLookaheadDays = useAppStore((state) => state.setEventReminderLookaheadDays);

  const [busy, setBusy] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);

  const queryRange = useMemo(() => {
    const now = dayjs();
    return {
      from: now.startOf('day').toDate().toISOString(),
      to: now.add(eventReminderLookaheadDays, 'day').endOf('day').toDate().toISOString(),
    };
  }, [eventReminderLookaheadDays]);
  const eventsQuery = useEvents({ from: queryRange.from, to: queryRange.to });
  const eventSnapshot = eventsQuery.data ?? [];

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

  const refreshDiagnostics = async () => {
    try {
      const [granted, scheduled] = await Promise.all([
        hasEventReminderPermissions(),
        countEventReminderNotifications(),
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
    eventReminderDefaultMinutes,
    eventReminderEnabled,
    eventReminderIncludeAllDay,
    eventReminderLookaheadDays,
    eventReminderSmartInsightsEnabled,
    eventReminderWeekdaysOnly,
    eventSnapshot.length,
  ]);

  const syncWithSnapshot = async (
    overrides?: Partial<typeof reminderSettings>,
  ): Promise<number> => {
    const merged = { ...reminderSettings, ...overrides };
    const latest = eventsQuery.data ?? (await eventsQuery.refetch()).data ?? [];
    const count = await syncEventReminders({
      settings: merged,
      events: latest,
    });
    setScheduledCount(count);
    return count;
  };

  const syncAfterSettingChange = (overrides?: Partial<typeof reminderSettings>) => {
    if (!eventReminderEnabled && overrides?.enabled !== true) return;
    void syncWithSnapshot(overrides).catch((error) => {
      console.error('Failed to sync planner reminders from settings', error);
    });
  };

  const handleToggleEnabled = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        const granted = await ensureEventReminderPermissions();
        setPermissionGranted(granted);
        if (!granted) {
          setEventReminderEnabled(false);
          Alert.alert(
            'Permission needed',
            'Enable notifications in system settings to receive planner reminders.',
          );
          return;
        }
      }

      setEventReminderEnabled(next);
      await syncWithSnapshot({ enabled: next });
      await refreshDiagnostics();
    } catch (error) {
      Alert.alert('Unable to update reminders', error instanceof Error ? error.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const handleChangeDefaultReminder = (value: EventReminderMinutes | null) => {
    setEventReminderDefaultMinutes(value);
    syncAfterSettingChange({ defaultReminderMinutes: value });
  };

  const handleChangeLookaheadDays = (value: EventReminderLookaheadDays) => {
    setEventReminderLookaheadDays(value);
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const granted = await ensureEventReminderPermissions();
      setPermissionGranted(granted);
      if (!granted) {
        Alert.alert('Permission needed', 'Notifications are currently disabled for this app.');
        return;
      }

      const latest = eventsQuery.data ?? (await eventsQuery.refetch()).data ?? [];
      await sendEventReminderTest(reminderSettings, latest);
      Alert.alert('Test sent', 'A planner reminder test notification was queued on this device.');
    } catch (error) {
      Alert.alert('Unable to send test', error instanceof Error ? error.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const resyncNow = async () => {
    setBusy(true);
    try {
      await syncWithSnapshot();
      await refreshDiagnostics();
      Alert.alert('Planner reminders synced', 'Device reminders were refreshed from your latest events.');
    } catch (error) {
      Alert.alert('Unable to sync reminders', error instanceof Error ? error.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Planner Reminder Preferences
          </ThemedText>

          <SwitchRow
            label="Enable planner reminders"
            description="Schedule local notifications from your upcoming events."
            value={eventReminderEnabled}
            onValueChange={handleToggleEnabled}
            borderColor={colors.border}
            trackColorOn={colors.primary}
            thumbColor={colors.background}
            disabled={busy}
          />

          <OptionGroup
            label="Default reminder lead time"
            options={EVENT_REMINDER_OPTIONS}
            selected={eventReminderDefaultMinutes}
            onSelect={handleChangeDefaultReminder}
            borderColor={colors.border}
            tint={colors.primary}
            disabled={!eventReminderEnabled || busy}
          />

          <SwitchRow
            label="Smart reminders"
            description="Adapt reminder timing for urgent events and available lead time."
            value={eventReminderSmartInsightsEnabled}
            onValueChange={(next) => {
              setEventReminderSmartInsightsEnabled(next);
              syncAfterSettingChange({ smartInsightsEnabled: next });
            }}
            borderColor={colors.border}
            trackColorOn={colors.primary}
            thumbColor={colors.background}
            disabled={!eventReminderEnabled || busy}
          />

          <SwitchRow
            label="Weekdays only (auto reminders)"
            description="Skip auto reminders for weekend events. Explicit event reminders still apply."
            value={eventReminderWeekdaysOnly}
            onValueChange={(next) => {
              setEventReminderWeekdaysOnly(next);
              syncAfterSettingChange({ weekdaysOnly: next });
            }}
            borderColor={colors.border}
            trackColorOn={colors.primary}
            thumbColor={colors.background}
            disabled={!eventReminderEnabled || busy}
          />

          <SwitchRow
            label="Include all-day events"
            description="Allow auto reminders for all-day events."
            value={eventReminderIncludeAllDay}
            onValueChange={(next) => {
              setEventReminderIncludeAllDay(next);
              syncAfterSettingChange({ includeAllDay: next });
            }}
            borderColor={colors.border}
            trackColorOn={colors.primary}
            thumbColor={colors.background}
            disabled={!eventReminderEnabled || busy}
          />

          <OptionGroup
            label="Sync window"
            options={LOOKAHEAD_OPTIONS}
            selected={eventReminderLookaheadDays}
            onSelect={handleChangeLookaheadDays}
            borderColor={colors.border}
            tint={colors.primary}
            disabled={busy}
          />
        </View>

        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
            Diagnostics
          </ThemedText>
          <ThemedText style={styles.statusText}>
            Notification permission:{' '}
            {permissionGranted === null ? 'Checking...' : permissionGranted ? 'Granted' : 'Denied'}
          </ThemedText>
          <ThemedText style={styles.statusText}>
            Upcoming events in window: {eventSnapshot.length}
          </ThemedText>
          <ThemedText style={styles.statusText}>
            Scheduled planner reminders on this device: {scheduledCount ?? 0}
          </ThemedText>
          {eventsQuery.error ? (
            <ThemedText style={styles.statusText}>
              Event sync status: {eventsQuery.error.message}
            </ThemedText>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              onPress={resyncNow}
              disabled={busy}
              style={[
                styles.actionButton,
                {
                  borderColor: colors.border,
                  backgroundColor: busy ? colors.border : `${colors.primary}1A`,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <ThemedText style={{ color: colors.primary, fontWeight: '600' }}>
                  Resync reminders
                </ThemedText>
              )}
            </Pressable>

            <Pressable
              onPress={sendTest}
              disabled={busy}
              style={[
                styles.actionButton,
                {
                  borderColor: colors.border,
                  backgroundColor: busy ? colors.border : `${colors.primary}1A`,
                },
              ]}
            >
              <ThemedText style={{ color: colors.primary, fontWeight: '600' }}>
                Send test reminder
              </ThemedText>
            </Pressable>
          </View>
        </View>
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
    paddingBottom: 28,
    gap: 14,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  sectionTitle: {
    marginBottom: 2,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusText: {
    fontSize: 13,
    opacity: 0.8,
  },
  actionRow: {
    gap: 8,
  },
  actionButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  disabledSection: {
    opacity: 0.55,
  },
});
