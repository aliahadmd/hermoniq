import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DatePickerField } from '@/components/money-tracker/date-picker-field';
import { ReminderTimePickerField } from '@/components/habit-tracker/reminder-time-picker-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useCreateEvent } from '@/hooks/use-events';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ensureEventReminderPermissions } from '@/lib/event-reminders';
import {
  EVENT_REMINDER_OPTIONS,
  getDeviceTimezone,
  nowPlusHourDefaults,
  toAllDayRange,
  toIsoFromLocal,
} from '@/lib/planner-utils';
import type { EventReminderMinutes } from '@/lib/types';
import { createEventSchema } from '@/lib/validators';
import { useAppStore } from '@/stores/app-store';

function resolveDateParam(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function addDaysToDateOnly(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split('-').map((part) => Number(part));
  const date = new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function PlannerCreateScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const router = useRouter();

  const text = useThemeColor({}, 'text');
  const textSecondary = useThemeColor({}, 'textSecondary');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const tint = useThemeColor({}, 'tint');
  const defaultReminderMinutes = useAppStore((state) => state.eventReminderDefaultMinutes);

  const defaults = useMemo(() => nowPlusHourDefaults(), []);
  const paramDate = resolveDateParam(params.date);
  const overnightOffsetDays = defaults.endDate === defaults.startDate ? 0 : 1;
  const initialDate = paramDate ?? defaults.startDate;
  const initialEndDate = paramDate
    ? addDaysToDateOnly(paramDate, overnightOffsetDays)
    : defaults.endDate;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [timezone, setTimezone] = useState(getDeviceTimezone());
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [endTime, setEndTime] = useState(defaults.endTime);
  const [reminderMinutes, setReminderMinutes] = useState<EventReminderMinutes | null>(defaultReminderMinutes);

  const createEvent = useCreateEvent();

  const submit = async () => {
    try {
      const range = isAllDay
        ? toAllDayRange(startDate, endDate)
        : {
            startAt: toIsoFromLocal(startDate, startTime),
            endAt: toIsoFromLocal(endDate, endTime),
          };

      if (reminderMinutes !== null) {
        const triggerAt = new Date(range.startAt).getTime() - reminderMinutes * 60_000;
        if (triggerAt <= Date.now()) {
          Alert.alert('Invalid reminder', 'Reminder time is in the past. Choose a different reminder or event time.');
          return;
        }
      }

      const payload = createEventSchema.parse({
        title: title.trim(),
        description,
        location,
        timezone: timezone.trim() || getDeviceTimezone(),
        isAllDay,
        startAt: range.startAt,
        endAt: range.endAt,
        reminderMinutes,
        source: 'manual',
      });

      await createEvent.mutateAsync(payload);

      if (payload.reminderMinutes !== null) {
        const granted = await ensureEventReminderPermissions();
        if (!granted) {
          Alert.alert('Reminder permission needed', 'Enable notifications to receive planner reminders on this device.');
        }
      }

      router.back();
    } catch (error) {
      Alert.alert('Unable to create event', error instanceof Error ? error.message : 'Request failed');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Title</ThemedText>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Event title"
              placeholderTextColor={textSecondary}
              style={[styles.input, { borderColor: border, backgroundColor: surface, color: text }]}
            />
          </View>

          <View style={[styles.section, styles.switchRow]}>
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold">All day</ThemedText>
              <ThemedText style={{ color: textSecondary }}>Turn on for date-only events.</ThemedText>
            </View>
            <Switch value={isAllDay} onValueChange={setIsAllDay} />
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Start</ThemedText>
            <DatePickerField value={startDate} onChange={setStartDate} />
            {!isAllDay ? (
              <ReminderTimePickerField value={startTime} onChange={setStartTime} />
            ) : null}
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">End</ThemedText>
            <DatePickerField value={endDate} onChange={setEndDate} />
            {!isAllDay ? (
              <ReminderTimePickerField value={endTime} onChange={setEndTime} />
            ) : null}
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Timezone</ThemedText>
            <TextInput
              value={timezone}
              onChangeText={setTimezone}
              placeholder="Timezone (e.g. Asia/Dhaka)"
              placeholderTextColor={textSecondary}
              style={[styles.input, { borderColor: border, backgroundColor: surface, color: text }]}
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Location</ThemedText>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Optional location"
              placeholderTextColor={textSecondary}
              style={[styles.input, { borderColor: border, backgroundColor: surface, color: text }]}
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Description</ThemedText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Optional details"
              placeholderTextColor={textSecondary}
              multiline
              style={[styles.textarea, { borderColor: border, backgroundColor: surface, color: text }]}
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Reminder</ThemedText>
            <View style={styles.chipWrap}>
              {EVENT_REMINDER_OPTIONS.map((option) => {
                const selected = reminderMinutes === option.value;
                return (
                  <Pressable
                    key={option.label}
                    onPress={() => setReminderMinutes(option.value)}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected ? tint : border,
                        backgroundColor: selected ? `${tint}1F` : surface,
                      },
                    ]}
                  >
                    <ThemedText style={selected ? { color: tint } : { color: textSecondary }}>
                      {option.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Pressable
            disabled={createEvent.isPending}
            onPress={submit}
            style={[styles.submitButton, { backgroundColor: tint, opacity: createEvent.isPending ? 0.7 : 1 }]}
          >
            {createEvent.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.submitText}>Create event</ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 14,
    gap: 12,
    paddingBottom: 28,
  },
  section: {
    gap: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  textarea: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    minHeight: 110,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  submitButton: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
